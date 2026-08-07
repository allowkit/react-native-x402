// X402Core — custody, signing, and human-approval primitives for x402 on Android.
//
// Invariants:
// - Keys live in Android Keystore (StrongBox where available, P-256) or
//   native process memory (secp256k1 / Ed25519 software keys). Key bytes are
//   never returned to callers.
// - Biometric requirements are bound at key level via
//   setUserAuthenticationRequired(true) / setUserAuthenticationParameters —
//   enforced by the OS, not by caller-side booleans.
package dev.allowkit.x402core

/** Enclave/StrongBox-backed P-256 signer. Phase 1 implementation target. */
interface SecureSigning {
    fun generateKey(alias: String, requireBiometry: Boolean): ByteArray // public key (X9.63)
    fun publicKey(alias: String): ByteArray?
    fun signDigest(alias: String, digest: ByteArray): ByteArray
    fun deleteKey(alias: String)
}

enum class SoftKeyCurve { SECP256K1, ED25519 }

/** Software-key signer for curves the Keystore can't hold hardware-backed. */
interface SoftKeySigning {
    fun generateKey(alias: String, curve: SoftKeyCurve): ByteArray
    fun publicKey(alias: String): ByteArray?
    fun signDigest(alias: String, digest: ByteArray): ByteArray
    fun signMessage(alias: String, message: ByteArray): ByteArray
    fun deleteKey(alias: String)
}

/** Keystore-wrapped storage for budget/policy state and session keys. */
interface SecureStoring {
    fun get(key: String): String?
    fun set(key: String, value: String)
    fun remove(key: String)
}
