/**
 * Biometric approval — cryptographic proof where the hardware allows it.
 *
 * STRONG path (real device): a Secure Enclave P-256 key created with
 * `.biometryCurrentSet`. The OS refuses to use that key without fresh
 * Face ID / Touch ID, so a signature from it *is* evidence a human
 * authenticated — bound to one specific payment, because what gets signed is
 * a digest of the payment intent. A compromised JS bundle cannot forge it,
 * and the approval cannot be replayed onto a different payment.
 *
 * WEAK path (iOS Simulator): biometry-bound enclave keys fail with
 * LocalAuthentication -1020 "not supported on iOS Simulator", so we fall
 * back to an LAContext prompt that returns a boolean. Adequate for demos,
 * NOT equivalent: JS decides after the boolean, so JS could skip it.
 *
 * The day-to-day payment key stays non-biometric and budget-capped, so small
 * auto-approved payments never prompt. Only escalations reach this path.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import type { PaymentIntent } from 'react-native-x402';
import { nativeSigner, toHex } from './nativeSigner';

const APPROVAL_KEY = 'pocket-agent-approval-key';

export interface ApprovalAttestation {
  intentDigest: string;
  /** Enclave P-256 signature over that digest (r||s). */
  signature: string;
  publicKey: string;
  approvedAtMs: number;
}

export type ApprovalResult =
  | { mode: 'enclave-attestation'; attestation: ApprovalAttestation }
  | { mode: 'os-authentication' }
  | null;

let approvalPublicKey: string | null = null;
let enclaveUnavailableReason: string | null = null;

/** True when this device can produce biometry-bound enclave attestations. */
export function hasStrongApproval(): boolean {
  return approvalPublicKey !== null;
}

export function approvalMode(): string {
  return approvalPublicKey
    ? 'enclave attestation (biometry-bound key)'
    : `OS prompt only — ${enclaveUnavailableReason ?? 'enclave unavailable'}`;
}

/** Create the biometric-bound approval key once, if the hardware supports it. */
export function ensureApprovalKey(): void {
  if (approvalPublicKey || enclaveUnavailableReason) return;
  try {
    approvalPublicKey =
      nativeSigner.enclavePublicKey(APPROVAL_KEY) ??
      nativeSigner.generateEnclaveKey(APPROVAL_KEY, true);
  } catch (e) {
    const msg = (e as Error).message;
    enclaveUnavailableReason = /Simulator/i.test(msg)
      ? 'biometry-bound enclave keys need real hardware'
      : msg.slice(0, 80);
  }
}

/** Canonical bytes a human is approving: this payment, nothing else. */
export function intentDigest(intent: PaymentIntent): string {
  const r = intent.requirements;
  const canonical = [
    'x402-approval-v1',
    intent.method,
    intent.resource,
    r.network,
    r.asset,
    r.amount,
    r.payTo,
  ].join('\n');
  return toHex(sha256(new TextEncoder().encode(canonical)));
}

/** Ask the human. Null means refused. */
export async function requestApproval(
  intent: PaymentIntent,
  reason: string
): Promise<ApprovalResult> {
  ensureApprovalKey();
  const digest = intentDigest(intent);

  if (approvalPublicKey) {
    try {
      // Raises the OS biometric prompt: the enclave will not sign without it.
      const signature = nativeSigner.signEnclaveDigest(APPROVAL_KEY, digest);
      return {
        mode: 'enclave-attestation',
        attestation: {
          intentDigest: digest,
          signature,
          publicKey: approvalPublicKey,
          approvedAtMs: Date.now(),
        },
      };
    } catch {
      return null; // cancelled, no match, or biometrics changed
    }
  }

  const ok = await nativeSigner.authenticate(`Approve this payment? (${reason})`);
  return ok ? { mode: 'os-authentication' } : null;
}
