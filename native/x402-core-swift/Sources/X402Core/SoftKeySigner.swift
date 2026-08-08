// Software-key signer for the curves the Secure Enclave cannot hold:
//   - secp256k1 (EVM) via libsecp256k1, with recoverable signatures (r||s||v)
//   - Ed25519 (Solana) via CryptoKit
//
// Private key bytes live only in Keychain items (AfterFirstUnlock, this
// device only) and native memory during signing. They are never returned to
// callers and never cross into JavaScript.
import Foundation
import CryptoKit
import P256K

public final class SoftKeySigner: SoftKeySigning {
    private let store: KeychainStore
    private static let prefix = "soft:"

    public init(store: KeychainStore = KeychainStore()) {
        self.store = store
    }

    private func itemKey(_ alias: String, _ curve: SoftKeyCurve) -> String {
        Self.prefix + curve.rawValue + ":" + alias
    }

    private func findKey(_ alias: String) throws -> (curve: SoftKeyCurve, material: Data)? {
        for curve in [SoftKeyCurve.secp256k1, .ed25519] {
            if let data = try store.getData(itemKey(alias, curve)) {
                return (curve, data)
            }
        }
        return nil
    }

    public func generateKey(alias: String, curve: SoftKeyCurve) throws -> Data {
        if try findKey(alias) != nil { throw X402CoreError.keyAlreadyExists(alias) }
        switch curve {
        case .secp256k1:
            let key = try P256K.Recovery.PrivateKey(format: .uncompressed)
            try store.setData(itemKey(alias, curve), data: key.dataRepresentation)
            return uncompressedPublicKey(key)
        case .ed25519:
            let key = Curve25519.Signing.PrivateKey()
            try store.setData(itemKey(alias, curve), data: key.rawRepresentation)
            return key.publicKey.rawRepresentation
        }
    }

    public func publicKey(alias: String) throws -> Data? {
        guard let (curve, material) = try findKey(alias) else { return nil }
        switch curve {
        case .secp256k1:
            let key = try P256K.Recovery.PrivateKey(dataRepresentation: material, format: .uncompressed)
            return uncompressedPublicKey(key)
        case .ed25519:
            let key = try Curve25519.Signing.PrivateKey(rawRepresentation: material)
            return key.publicKey.rawRepresentation
        }
    }

    /// secp256k1: sign a precomputed 32-byte digest (e.g. keccak256 of EIP-712
    /// typed data). Returns 65 bytes r||s||v with v ∈ {27, 28} (EVM convention).
    /// ed25519: Solana signs whole messages, not digests — use signMessage.
    public func signDigest(alias: String, digest: Data) throws -> Data {
        guard digest.count == 32 else { throw X402CoreError.invalidDigestLength(digest.count) }
        guard let (curve, material) = try findKey(alias) else {
            throw X402CoreError.keyNotFound(alias)
        }
        switch curve {
        case .secp256k1:
            let key = try P256K.Recovery.PrivateKey(dataRepresentation: material, format: .uncompressed)
            // HashDigest wraps the precomputed 32-byte hash (e.g. keccak256 of
            // EIP-712 typed data) so libsecp256k1 signs it without re-hashing.
            let signature = key.signature(for: HashDigest([UInt8](digest)))
            let compact = signature.compactRepresentation
            var out = Data(compact.signature) // r||s (64 bytes)
            out.append(UInt8(compact.recoveryId) + 27) // v ∈ {27, 28}
            return out
        case .ed25519:
            // Ed25519 has no separate digest mode; signing the 32 bytes as a
            // message is well-defined and matches "sign this exact payload".
            let key = try Curve25519.Signing.PrivateKey(rawRepresentation: material)
            return try key.signature(for: digest)
        }
    }

    public func signMessage(alias: String, message: Data) throws -> Data {
        guard let (curve, material) = try findKey(alias) else {
            throw X402CoreError.keyNotFound(alias)
        }
        switch curve {
        case .ed25519:
            let key = try Curve25519.Signing.PrivateKey(rawRepresentation: material)
            return try key.signature(for: message)
        case .secp256k1:
            // EVM never signs raw messages without a digest step; require
            // callers to hash first so intent is explicit.
            throw X402CoreError.signingFailed("secp256k1 requires signDigest (hash first)")
        }
    }

    public func deleteKey(alias: String) throws {
        for curve in [SoftKeyCurve.secp256k1, .ed25519] {
            try store.remove(itemKey(alias, curve))
        }
    }

    private func uncompressedPublicKey(_ key: P256K.Recovery.PrivateKey) -> Data {
        Data(key.publicKey.dataRepresentation) // 65 bytes, format carried by the key (.uncompressed)
    }
}
