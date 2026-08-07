/**
 * @allowkit/agent-wallet — the wallet layer.
 *
 * Invariant: RAW PRIVATE KEY BYTES NEVER CROSS THE JSI BOUNDARY.
 * JS orchestrates; native (x402-core-swift / x402-core-kotlin, bridged via
 * Nitro Modules) answers only with public keys and signatures. Biometric
 * approval is bound to keystore access-control flags on the native side —
 * the OS refuses to release over-threshold keys without fresh biometrics,
 * so JS cannot skip the human.
 *
 * Phase 0/1: interfaces + the Nitro spec shapes. Adapters land as thin
 * wrappers over CDP Embedded Wallets, Privy Expo, Turnkey RN, and MWA.
 */
import { NetworkId, PaymentIntent, PaymentSigner, SignedPayment } from '@allowkit/x402-client';

/* ------------------------------------------------------------------ *
 * Nitro HybridObject spec shapes (implemented in native/x402-core-*) *
 * ------------------------------------------------------------------ */

/** Enclave-backed P-256 keys (Secure Enclave / StrongBox). */
export interface SecureSignerSpec {
  generateKey(alias: string, requireBiometry: boolean): Promise<string /* pubkey hex */>;
  getPublicKey(alias: string): Promise<string | null>;
  /** Sign a 32-byte digest. Rejects if biometric gate is unsatisfied. */
  signDigest(alias: string, digest: ArrayBuffer): Promise<ArrayBuffer>;
  deleteKey(alias: string): Promise<void>;
}

/** Natively-held software keys for curves the enclave can't hold. */
export interface SoftKeySignerSpec {
  generateKey(alias: string, curve: 'secp256k1' | 'ed25519'): Promise<string /* pubkey hex */>;
  getPublicKey(alias: string): Promise<string | null>;
  signDigest(alias: string, digest: ArrayBuffer): Promise<ArrayBuffer>;
  signMessage(alias: string, message: ArrayBuffer): Promise<ArrayBuffer>;
  deleteKey(alias: string): Promise<void>;
}

/** Keychain / StrongBox-wrapped storage (budget state, session-key material). */
export interface SecureStoreSpec {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/* --------------------------------------------------- *
 * Wallet adapters: anything that satisfies the        *
 * PaymentSigner contract from @allowkit/x402-client.  *
 * --------------------------------------------------- */

export interface WalletAdapter extends PaymentSigner {
  /** Human-readable adapter id: "local" | "cdp" | "privy" | "turnkey" | "mwa" | ... */
  readonly id: string;
}

/**
 * Placeholder local signer wiring (Phase 1): EVM exact via EIP-3009 typed
 * data over the SoftKeySigner secp256k1 path; Solana exact via ed25519
 * partial-signed transaction with the facilitator as fee payer.
 */
export class LocalWalletAdapter implements WalletAdapter {
  readonly id = 'local';

  constructor(
    private readonly _soft: SoftKeySignerSpec,
    private readonly networks: NetworkId[]
  ) {}

  supportedNetworks(): NetworkId[] {
    return this.networks;
  }

  async payerAddress(_network: NetworkId): Promise<string> {
    throw new Error('Phase 1: derive address from SoftKeySigner pubkey per network encoding');
  }

  async sign(_intent: PaymentIntent): Promise<SignedPayment> {
    throw new Error(
      'Phase 1: EIP-3009 typed-data (eip155) / partial-signed versioned tx (solana) via native signer'
    );
  }
}
