import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFetchWithPayment,
  X402Error,
  assertQuoteBinding,
  parseAtomicAmount,
  intentKey,
} from '../dist/index.js';
import type {
  PaymentIntent,
  PaymentRequirements,
  PaymentSigner,
  PolicyGuardLike,
  SignedPayment,
  X402Codec,
} from '../dist/index.js';

const REQ: PaymentRequirements = {
  scheme: 'exact',
  network: 'eip155:84532',
  asset: 'usdc',
  amount: '10000',
  payTo: '0xseller',
};

/** A codec/server pair: first call 402 with REQ, paid retry 200. */
function fakeWorld(opts?: { requirements?: PaymentRequirements[] }) {
  const accepts = opts?.requirements ?? [REQ];
  const calls: { headers?: Record<string, string> }[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    calls.push({ ...(headers ? { headers } : {}) });
    if (headers?.['X-TEST-PAYMENT']) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response('{}', { status: 402 });
  }) as unknown as typeof fetch;

  const codec: X402Codec = {
    parseRequirements: async () => ({ accepts, raw: { accepts } }),
    paymentHeaders: (signed: SignedPayment) => ({ 'X-TEST-PAYMENT': String(signed.payload) }),
  };

  const signed: PaymentIntent[] = [];
  const signer: PaymentSigner = {
    supportedNetworks: () => ['eip155:84532'],
    payerAddress: async () => '0xbuyer',
    sign: async (intent) => {
      signed.push(intent);
      return { payload: 'sig', network: intent.requirements.network, scheme: 'exact' };
    },
  };

  const recorded: PaymentIntent[] = [];
  const policy = (decision: 'allow' | 'deny' | 'escalate'): PolicyGuardLike => ({
    evaluate: async () =>
      decision === 'allow' ? { kind: 'allow' } : { kind: decision, reason: 'test' },
    record: async (i) => {
      recorded.push(i);
    },
  });

  return { fetchImpl, codec, signer, policy, calls, signed, recorded };
}

test('pays and retries when policy allows; records after success', async () => {
  const w = fakeWorld();
  const fetchWithPayment = createFetchWithPayment({
    signer: w.signer,
    policy: w.policy('allow'),
    codec: w.codec,
    fetchImpl: w.fetchImpl,
  });
  const res = await fetchWithPayment('https://s/a');
  assert.equal(res.status, 200);
  assert.equal(w.signed.length, 1);
  assert.equal(w.recorded.length, 1);
});

test('policy deny → X402Error, nothing signed, nothing sent', async () => {
  const w = fakeWorld();
  const fetchWithPayment = createFetchWithPayment({
    signer: w.signer,
    policy: w.policy('deny'),
    codec: w.codec,
    fetchImpl: w.fetchImpl,
  });
  await assert.rejects(() => fetchWithPayment('https://s/b'), (e: X402Error) => e.code === 'policy-denied');
  assert.equal(w.signed.length, 0);
  assert.equal(w.calls.length, 1); // only the initial request
});

test('escalation without an approval handler refuses to pay', async () => {
  const w = fakeWorld();
  const fetchWithPayment = createFetchWithPayment({
    signer: w.signer,
    policy: w.policy('escalate'),
    codec: w.codec,
    fetchImpl: w.fetchImpl,
  });
  await assert.rejects(() => fetchWithPayment('https://s/c'), (e: X402Error) => e.code === 'approval-required');
  assert.equal(w.signed.length, 0);
});

test('escalation with approval=true proceeds to payment', async () => {
  const w = fakeWorld();
  const fetchWithPayment = createFetchWithPayment({
    signer: w.signer,
    policy: w.policy('escalate'),
    codec: w.codec,
    fetchImpl: w.fetchImpl,
    onApprovalRequired: async () => true,
  });
  const res = await fetchWithPayment('https://s/d');
  assert.equal(res.status, 200);
  assert.equal(w.signed.length, 1);
});

test('refuses to sign the same intent twice (replay guard)', async () => {
  const w = fakeWorld();
  const fetchWithPayment = createFetchWithPayment({
    signer: w.signer,
    policy: w.policy('allow'),
    codec: w.codec,
    fetchImpl: w.fetchImpl,
  });
  assert.equal((await fetchWithPayment('https://s/replay')).status, 200);
  await assert.rejects(
    () => fetchWithPayment('https://s/replay'),
    /already-signed/
  );
});

test('no signable network among offers → no-acceptable-requirements', async () => {
  const w = fakeWorld({ requirements: [{ ...REQ, network: 'eip155:1' }] });
  const fetchWithPayment = createFetchWithPayment({
    signer: w.signer,
    policy: w.policy('allow'),
    codec: w.codec,
    fetchImpl: w.fetchImpl,
  });
  await assert.rejects(
    () => fetchWithPayment('https://s/e'),
    (e: X402Error) => e.code === 'no-acceptable-requirements'
  );
});

test('non-402 responses pass through untouched', async () => {
  const fetchImpl = (async () => new Response('hi', { status: 200 })) as unknown as typeof fetch;
  const w = fakeWorld();
  const fetchWithPayment = createFetchWithPayment({
    signer: w.signer,
    policy: w.policy('deny'), // must never be consulted
    codec: w.codec,
    fetchImpl,
  });
  const res = await fetchWithPayment('https://s/free');
  assert.equal(res.status, 200);
});

test('assertQuoteBinding rejects any mutated field', () => {
  assert.doesNotThrow(() => assertQuoteBinding(REQ, { ...REQ }));
  for (const mutation of [
    { amount: '20000' },
    { payTo: '0xattacker' },
    { network: 'eip155:1' },
    { asset: 'other' },
  ] as Partial<PaymentRequirements>[]) {
    assert.throws(() => assertQuoteBinding(REQ, { ...REQ, ...mutation } as PaymentRequirements));
  }
});

test('parseAtomicAmount accepts only decimal atomic strings', () => {
  assert.equal(parseAtomicAmount('10000'), 10000n);
  for (const bad of ['0.01', '1e6', '-5', '0x10', '', ' 1']) {
    assert.throws(() => parseAtomicAmount(bad));
  }
});

test('intentKey binds method, resource, network, asset, amount, payTo', () => {
  const base: PaymentIntent = {
    requirements: REQ,
    resource: 'https://s/r',
    method: 'GET',
    createdAtMs: 0,
  };
  const k = intentKey(base);
  assert.notEqual(k, intentKey({ ...base, method: 'POST' }));
  assert.notEqual(k, intentKey({ ...base, resource: 'https://s/other' }));
  assert.notEqual(k, intentKey({ ...base, requirements: { ...REQ, amount: '1' } }));
});
