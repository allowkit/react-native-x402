/**
 * fetchWithPayment — the core client loop:
 *
 *   request → 402 → parse requirements → PolicyGuard.evaluate → sign → retry with payment
 *
 * Protocol encoding is delegated to a pluggable codec. In production the
 * codec wraps the official `@x402/core` http utilities (see the
 * first-payment example's bridge) — this package never re-implements the
 * wire format; it owns the policy choke point and client-side hardening.
 */
import {
  PaymentIntent,
  PaymentRequirements,
  PaymentSigner,
  PolicyGuardLike,
  SignedPayment,
  X402Error,
} from './types.js';
import { assertFresh, assertNotReplayed, assertQuoteBinding, markSigned, unmarkSigned } from './guards.js';

/** What a codec extracts from a 402 response. */
export interface ParsedPaymentRequired {
  accepts: PaymentRequirements[];
  /** The untouched wire-format PaymentRequired object, passed through to signers. */
  raw?: unknown;
}

/** Pluggable protocol codec. Production: wrap @x402/core (official). */
export interface X402Codec {
  /** Parse acceptable payment requirements from a 402 response. */
  parseRequirements(response: Response): Promise<ParsedPaymentRequired>;
  /** Headers carrying the signed payment on retry. */
  paymentHeaders(signed: SignedPayment): Record<string, string>;
}

/** Minimal fallback codec: base64 JSON in the PAYMENT-REQUIRED header. */
export const naiveCodec: X402Codec = {
  async parseRequirements(response: Response): Promise<ParsedPaymentRequired> {
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
    return { accepts, raw: parsed };
  },
  paymentHeaders(signed: SignedPayment): Record<string, string> {
    if (typeof signed.payload !== 'string') {
      throw new X402Error('naiveCodec requires a string payload', 'protocol-error');
    }
    return { 'PAYMENT-SIGNATURE': signed.payload };
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

    const parsed = await codec.parseRequirements(first);
    const chosen = selectRequirements(parsed.accepts, config.signer);
    if (!chosen) {
      throw new X402Error(
        `no offered network is signable (offered: ${parsed.accepts.map((a) => a.network).join(', ')})`,
        'no-acceptable-requirements'
      );
    }

    const intent: PaymentIntent = {
      requirements: chosen,
      resource: input,
      method: init?.method ?? 'GET',
      facilitator: undefined,
      createdAtMs: Date.now(),
      ...(parsed.raw !== undefined ? { rawPaymentRequired: parsed.raw } : {}),
    };

    // ---- fail fast, before troubling a human ----
    // Replay and freshness are checked BEFORE the policy/approval step: never
    // raise a biometric prompt for a payment we would refuse anyway, and never
    // let human deliberation time expire the quote we are about to sign.
    assertNotReplayed(intent);
    assertFresh(intent);

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

    // ---- hardening immediately before signature ----
    assertQuoteBinding(chosen, intent.requirements);

    const signed = await config.signer.sign(intent);
    markSigned(intent);

    const retry = await doFetch(input, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        ...codec.paymentHeaders(signed),
      },
    });

    if (retry.ok) {
      await config.policy.record(intent);
    } else {
      // The payment was rejected (not settled) — release the intent so a
      // later attempt (e.g. after funding the wallet) can sign again.
      unmarkSigned(intent);
    }
    return retry;
  };
}
