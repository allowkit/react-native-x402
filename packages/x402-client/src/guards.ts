/**
 * Client-side security hardening, derived from the 2026 x402 audit
 * literature (arXiv 2605.11781, 2607.19545): bind everything before signing,
 * enforce freshness, never sign the same intent twice.
 */
import { PaymentIntent, PaymentRequirements, X402Error } from './types.js';

/** Max age of a PaymentIntent before we refuse to sign it. */
export const INTENT_MAX_AGE_MS = 60_000;

/** In-memory idempotency cache: one signature per (resource, nonce-ish) key. */
const signedKeys = new Set<string>();

export function intentKey(intent: PaymentIntent): string {
  const r = intent.requirements;
  return [intent.method, intent.resource, r.network, r.asset, r.amount, r.payTo].join('|');
}

/**
 * Verify the requirements the server quoted are the requirements we are about
 * to sign — a mutated header between quote and signature is the primary
 * client-side attack surface.
 */
export function assertQuoteBinding(quoted: PaymentRequirements, signing: PaymentRequirements): void {
  const same =
    quoted.scheme === signing.scheme &&
    quoted.network === signing.network &&
    quoted.asset === signing.asset &&
    quoted.amount === signing.amount &&
    quoted.payTo === signing.payTo;
  if (!same) {
    throw new X402Error('quoted requirements do not match signing requirements', 'protocol-error');
  }
}

export function assertFresh(intent: PaymentIntent, nowMs: number = Date.now()): void {
  if (nowMs - intent.createdAtMs > INTENT_MAX_AGE_MS) {
    throw new X402Error('payment intent expired before signing', 'protocol-error', intent);
  }
}

/** Throws if this exact intent was already signed in this session. */
export function assertNotReplayed(intent: PaymentIntent): void {
  const key = intentKey(intent);
  if (signedKeys.has(key)) {
    throw new X402Error('refusing to re-sign an already-signed intent', 'protocol-error', intent);
  }
}

export function markSigned(intent: PaymentIntent): void {
  signedKeys.add(intentKey(intent));
}

/**
 * Release an intent for re-signing after a payment that did NOT settle
 * (server rejected it — e.g. insufficient funds). Settled intents stay
 * marked: the replay guard's job is preventing double-payment, not
 * preventing retry of a failed attempt.
 */
export function unmarkSigned(intent: PaymentIntent): void {
  signedKeys.delete(intentKey(intent));
}

/** Amount parsing that refuses ambiguity: decimal string of atomic units only. */
export function parseAtomicAmount(amount: string): bigint {
  if (!/^\d+$/.test(amount)) {
    throw new X402Error(`invalid amount "${amount}" — expected atomic-unit decimal string`, 'protocol-error');
  }
  return BigInt(amount);
}
