import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalPolicyGuard, MemoryBudgetStore, usdc } from '../dist/index.js';
import type { PaymentIntent } from '@allowkit/x402-client';

const intent = (amount: string, payTo = '0xseller', network = 'eip155:8453'): PaymentIntent => ({
  requirements: { scheme: 'exact', network, asset: 'usdc', amount, payTo },
  resource: 'https://api.example.com/x',
  method: 'GET',
  createdAtMs: Date.now(),
});

const schema = {
  perTxMax: usdc(0.25),
  dailyBudget: usdc(1),
  requireApprovalAbove: usdc(0.1),
};

test('allows a small payment under all thresholds', async () => {
  const guard = new LocalPolicyGuard(schema);
  const d = await guard.evaluate(intent(usdc(0.01).toString()));
  assert.equal(d.kind, 'allow');
});

test('denies a payment above perTxMax', async () => {
  const guard = new LocalPolicyGuard(schema);
  const d = await guard.evaluate(intent(usdc(0.26).toString()));
  assert.equal(d.kind, 'deny');
});

test('escalates a payment above the approval threshold but under perTxMax', async () => {
  const guard = new LocalPolicyGuard(schema);
  const d = await guard.evaluate(intent(usdc(0.2).toString()));
  assert.equal(d.kind, 'escalate');
});

test('denies once the rolling daily budget is exhausted', async () => {
  const guard = new LocalPolicyGuard(schema);
  // spend $0.99 across recorded payments
  for (let i = 0; i < 11; i++) {
    const it = intent(usdc(0.09).toString());
    assert.equal((await guard.evaluate(it)).kind, 'allow');
    await guard.record(it);
  }
  // next $0.09 would total $1.08 > $1 budget
  const d = await guard.evaluate(intent(usdc(0.09).toString()));
  assert.equal(d.kind, 'deny');
});

test('budget window rolls: old spend stops counting after 24h', async () => {
  let now = 1_000_000_000_000;
  const guard = new LocalPolicyGuard(schema, new MemoryBudgetStore(), () => now);
  const big = intent(usdc(0.09).toString());
  for (let i = 0; i < 11; i++) await guard.record(big);
  assert.equal((await guard.evaluate(big)).kind, 'deny');
  now += 25 * 3600_000; // advance past the window
  assert.equal((await guard.evaluate(big)).kind, 'allow');
});

test('escalates unknown payees when an allowlist is set', async () => {
  const guard = new LocalPolicyGuard({ ...schema, payeeAllowlist: ['0xknown'] });
  assert.equal((await guard.evaluate(intent(usdc(0.01).toString(), '0xknown'))).kind, 'allow');
  assert.equal((await guard.evaluate(intent(usdc(0.01).toString(), '0xstranger'))).kind, 'escalate');
});

test('denies networks outside the network allowlist', async () => {
  const guard = new LocalPolicyGuard({ ...schema, networkAllowlist: ['eip155:8453'] });
  const d = await guard.evaluate(intent(usdc(0.01).toString(), '0xseller', 'solana:mainnet'));
  assert.equal(d.kind, 'deny');
});

test('rejects malformed (non-atomic) amounts rather than guessing', async () => {
  const guard = new LocalPolicyGuard(schema);
  await assert.rejects(() => guard.evaluate(intent('0.01')), /invalid amount/);
  await assert.rejects(() => guard.evaluate(intent('1e6')), /invalid amount/);
  await assert.rejects(() => guard.evaluate(intent('-5')), /invalid amount/);
});

test('audit log records every decision with reasons', async () => {
  const guard = new LocalPolicyGuard(schema);
  await guard.evaluate(intent(usdc(0.01).toString()));
  await guard.evaluate(intent(usdc(0.5).toString()));
  const log = guard.auditLog();
  assert.equal(log.length, 2);
  assert.equal(log[0]!.decision, 'allow');
  assert.equal(log[1]!.decision, 'deny');
  assert.match(log[1]!.reason ?? '', /perTxMax/);
});
