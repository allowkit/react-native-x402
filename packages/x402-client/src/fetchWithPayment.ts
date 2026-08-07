/**
 * fetchWithPayment — the core client loop:
 *
 *   request → 402 → parse requirements → PolicyGuard.evaluate → sign → retry with payment
 *
 * Phase 0 status: the loop, guard integration, and header plumbing are real;
 * requirement parsing delegates to a codec that will be backed by the
 * official `@x402/*` packages (do NOT re-implement protocol encoding here).
 */
import {
  PaymentIntent,
  PaymentRequirements,
  PaymentSigner,
  PolicyGuardLike,
  X402Error,
} from './types';
import { assertFresh, assertNotReplayed, assertQuoteBinding, markSigned } from './guards';

/** Pluggable protocol codec — Phase 0 default is naive; Phase 1 wraps @x402/*. */
export interface X402Codec {
  /** Parse acceptable payment requirements from a 402 response. */
  parseRequirements(response: Response): Promise<PaymentRequirements[]>;
  /** Header name + value carrying the signed payment on retry. */
  paymentHeader(payload: string): [name: string, value: string];
}

/** Minimal v2-shaped codec: base64 JSON in the PAYMENT-REQUIRED header. */
export const naiveCodec: X402Codec = {
  async parseRequirements(response: Response): Promise<PaymentRequirements[]> {
    const header = response.headers.get('PAYMENT-REQUIRED');
    if (!header) throw new X402Error('402 without PAYMENT-REQUIRED header', 'protocol-error');
    let parsed: unknown;
    try {
      parsed = JSON.parse(globalThis.atob(header));
    } catch {
      throw new X402Error('unparseable PAYMENT-REQUIRED header', 'protocol-error');
    }
    const accepts = (parsed as { accepts?: PaymentRequirements[] }).accepts;
    if (!Array.isArray(accepts) || accepts.length === 0) {
      throw new X402Error('no acceptable payment requirements offered', 'no-acceptable-requirements');
    }
    return accepts;
  },
  paymentHeader(payload: string): [string, string] {
    return ['PAYMENT-SIGNATURE', payload];
  },
};

export interface FetchWithPaymentConfig {
  signer: PaymentSigner;
  policy: PolicyGuardLike;
  codec?: X402Codec;
  /** Called when policy escalates — resolve true after human (biometric) approval. */
  onApprovalRequired?: (intent: PaymentIntent, reason: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
}

/** Choose the first requirement this signer can satisfy. */
function selectRequirements(
  accepts: PaymentRequirements[],
  signer: PaymentSigner
): PaymentRequirements | undefined {
  const networks = new Set(signer.supportedNetworks());
  return accepts.find((r) => r.scheme === 'exact' && networks.has(r.network));
}

export function createFetchWithPayment(config: FetchWithPaymentConfig) {
  const codec = config.codec ?? naiveCodec;
  const doFetch = config.fetchImpl ?? fetch;

  return async function fetchWithPayment(input: string, init?: RequestInit): Promise<Response> {
    const first = await doFetch(input, init);
    if (first.status !== 402) return first;

    const accepts = await codec.parseRequirements(first);
    const chosen = selectRequirements(accepts, config.signer);
    if (!chosen) {
      throw new X402Error(
        `no offered network is signable (offered: ${accepts.map((a) => a.network).join(', ')})`,
        'no-acceptable-requirements'
      );
    }

    const intent: PaymentIntent = {
      requirements: chosen,
      resource: input,
      method: init?.method ?? 'GET',
      facilitator: undefined,
      createdAtMs: Date.now(),
    };

    // ---- the single choke point ----
    const decision = await config.policy.evaluate(intent);
    if (decision.kind === 'deny') {
      throw new X402Error(`policy denied payment: ${decision.reason}`, 'policy-denied', intent);
    }
    if (decision.kind === 'escalate') {
      const approved = config.onApprovalRequired
        ? await config.onApprovalRequired(intent, decision.reason)
        : false;
      if (!approved) {
        throw new X402Error(`approval required: ${decision.reason}`, 'approval-required', intent);
      }
    }

    // ---- hardening before signature ----
    assertFresh(intent);
    assertNotReplayed(intent);
    assertQuoteBinding(chosen, intent.requirements);

    const signed = await config.signer.sign(intent);
    markSigned(intent);

    const [headerName, headerValue] = codec.paymentHeader(signed.payload);
    const retry = await doFetch(input, {
      ...init,
      headers: { ...(init?.headers as Record<string, string> | undefined), [headerName]: headerValue },
    });

    if (retry.ok) {
      await config.policy.record(intent);
    }
    return retry;
  };
}
