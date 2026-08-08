import type { HybridObject } from 'react-native-nitro-modules';

/**
 * Native custody bridge — the Nitro surface over X402Core (Swift/Kotlin).
 *
 * INVARIANT: no method returns or accepts a private key. Callers pass an
 * alias and a digest/message; native returns a public key or a signature.
 * Biometric enforcement is bound to the key on the native side.
 *
 * All byte payloads cross as hex strings for a stable, debuggable JSI ABI
 * (Nitro also supports ArrayBuffer; hex keeps the first cut simple).
 */
export interface X402Signer
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** True where a hardware Secure Enclave / StrongBox is reachable. */
  readonly isSecureHardwareAvailable: boolean;

  // --- software keys (secp256k1 for EVM, ed25519 for Solana) ---
  /** Create a key; returns the public key as hex. curve: 'secp256k1' | 'ed25519'. */
  generateSoftKey(alias: string, curve: string): string;
  softPublicKey(alias: string): string | undefined;
  /** secp256k1: sign a 32-byte digest (hex) → 65-byte r||s||v (hex). */
  signSoftDigest(alias: string, digestHex: string): string;
  /** ed25519: sign a whole message (hex) → 64-byte signature (hex). */
  signSoftMessage(alias: string, messageHex: string): string;
  deleteSoftKey(alias: string): void;

  // --- Secure Enclave P-256 (passkey-style smart-account signing) ---
  generateEnclaveKey(alias: string, requireBiometry: boolean): string;
  enclavePublicKey(alias: string): string | undefined;
  signEnclaveDigest(alias: string, digestHex: string): string;
  deleteEnclaveKey(alias: string): void;
}
