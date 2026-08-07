// X402Core — custody, signing, and human-approval primitives for x402 on iOS.
// Standalone SwiftPM library: usable from any iOS app, no React Native required.
// The react-native-x402 Nitro module is a thin wrapper over these types.
//
// Invariants:
// - Private keys are generated in, and never leave, the Secure Enclave (P-256)
//   or the process's native memory (software keys). No key bytes are ever
//   returned to callers.
// - Biometric requirements are bound to key access-control flags
//   (.biometryCurrentSet), enforced by the OS — not by caller-side booleans.

import Foundation
#if canImport(CryptoKit)
import CryptoKit
#endif

/// Enclave-backed P-256 signer. Phase 1 implementation target.
public protocol SecureSigning {
    /// Generates a P-256 key in the Secure Enclave. When `requireBiometry` is
    /// true the key is created with `.biometryCurrentSet` access control, so
    /// every signature demands fresh Face ID / Touch ID.
    func generateKey(alias: String, requireBiometry: Bool) throws -> Data // public key (X9.63)
    func publicKey(alias: String) throws -> Data?
    func signDigest(alias: String, digest: Data) throws -> Data
    func deleteKey(alias: String) throws
}

/// Software-key signer for curves the enclave cannot hold
/// (secp256k1 for EVM, Ed25519 for Solana). Keys live in native memory and
/// the Keychain only; never exported to JavaScript.
public protocol SoftKeySigning {
    func generateKey(alias: String, curve: SoftKeyCurve) throws -> Data // public key
    func publicKey(alias: String) throws -> Data?
    func signDigest(alias: String, digest: Data) throws -> Data
    func signMessage(alias: String, message: Data) throws -> Data
    func deleteKey(alias: String) throws
}

public enum SoftKeyCurve: String, Sendable {
    case secp256k1
    case ed25519
}

/// Keychain-backed secure storage for policy/budget state and session-key
/// material, so counters are as tamper-resistant as the keys themselves.
public protocol SecureStoring {
    func get(_ key: String) throws -> String?
    func set(_ key: String, value: String) throws
    func remove(_ key: String) throws
}

// Phase 1: concrete implementations (SecureEnclave.P256 via CryptoKit,
// kSecAttrAccessControl biometry flags, Keychain storage) land here.
