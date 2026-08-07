/**
 * Core x402 types, aligned with the v2 specification (CAIP-2 networks,
 * CAIP-19 assets, PAYMENT-* headers).
 *
 * NOTE (Phase 0): these mirror the official spec shapes so the encoding
 * layer can be swapped for the official `@x402/*` packages without breaking
 * consumers. Do not add fields the spec doesn't have.
 */

/** CAIP-2 network id, e.g. "eip155:8453" (Base) or "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" */
export type NetworkId = string;

/** CAIP-19 asset id, e.g. "eip155:8453/erc20:0x833589..." (USDC on Base) */
export type AssetId = string;

/** One acceptable way to pay, parsed from a 402 response. */
export interface PaymentRequirements {
  scheme: 'exact';
  network: NetworkId;
  asset: AssetId;
  /** Amount in the asset's atomic units, as a decimal string. */
  amount: string;
  /** Recipient address in the network's native encoding. */
  payTo: string;
  /** Server-declared max settlement wait. */
  maxTimeoutSeconds?: number;
  /** Scheme/network-specific extras (e.g. Solana recentBlockhash pinning). */
  extra?: Record<string, unknown>;
  /** The untouched wire-format accept object, for protocol-delegating signers. */
  raw?: Record<string, unknown>;
}

/**
 * A fully-resolved intent to pay — the single object the PolicyGuard
 * evaluates and the signer receives. Everything the user could care about
 * is bound here BEFORE signing (price/payTo/resource binding — see the
 * 2026 x402 audit literature).
 */
export interface PaymentIntent {
  requirements: PaymentRequirements;
  /** The resource being purchased (the URL that returned 402). */
  resource: string;
  /** HTTP method of the paid request. */
  method: string;
  /** Facilitator expected to settle (bound so a MITM can't redirect settlement). */
  facilitator?: string | undefined;
  /** Wall-clock ms when this intent was created (for validity windows). */
  createdAtMs: number;
  /** Opaque wire-format PaymentRequired object (for protocol-delegating signers). */
  rawPaymentRequired?: unknown;
}

/** Result of signing: the payload the codec encodes into payment headers. */
export interface SignedPayment {
  /** Scheme payload — wire shape is codec-defined (official PaymentPayload object or base64 string). */
  payload: unknown;
  network: NetworkId;
  scheme: 'exact';
}

/**
 * Anything that can sign an x402 payment. Implemented by wallet adapters in
 * `@allowkit/agent-wallet` (CDP, Privy, Turnkey, MWA, local Nitro signer).
 * Raw private keys are never exposed through this interface.
 */
export interface PaymentSigner {
  /** Networks this signer can pay on. */
  supportedNetworks(): NetworkId[];
  /** Payer address/pubkey for a network (for logging & policy, not custody). */
  payerAddress(network: NetworkId): Promise<string>;
  /** Sign the intent. MUST throw if intent.requirements don't match what is signed. */
  sign(intent: PaymentIntent): Promise<SignedPayment>;
}

/** Decision surface shared with @allowkit/policy (kept here to avoid a cycle). */
export type PolicyDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'escalate'; reason: string };

export interface PolicyGuardLike {
  evaluate(intent: PaymentIntent): Promise<PolicyDecision>;
  /** Called after successful settlement so budgets can be recorded. */
  record(intent: PaymentIntent): Promise<void>;
}

/** Raised when a 402 flow fails in a way the caller should handle. */
export class X402Error extends Error {
  constructor(
    message: string,
    readonly code:
      | 'no-acceptable-requirements'
      | 'policy-denied'
      | 'approval-required'
      | 'signing-failed'
      | 'settlement-failed'
      | 'protocol-error',
    readonly intent?: PaymentIntent
  ) {
    super(message);
    this.name = 'X402Error';
  }
}
