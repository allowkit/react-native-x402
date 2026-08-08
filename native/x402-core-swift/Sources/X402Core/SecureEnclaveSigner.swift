// Secure Enclave P-256 signer.
//
// Key bytes never exist outside the enclave: what we persist in the Keychain
// is CryptoKit's encrypted `dataRepresentation` blob, decryptable only by
// this device's enclave. Biometric enforcement is bound at KEY level via
// SecAccessControl(.biometryCurrentSet) — the OS refuses to use the key
// without fresh Face ID / Touch ID; callers cannot skip it.
import Foundation
import CryptoKit
import Security

public final class SecureEnclaveSigner: SecureSigning {
    private let store: KeychainStore
    private static let prefix = "se-p256:"

    public init(store: KeychainStore = KeychainStore()) {
        self.store = store
    }

    public static var isAvailable: Bool {
        SecureEnclave.isAvailable
    }

    public func generateKey(alias: String, requireBiometry: Bool) throws -> Data {
        guard SecureEnclave.isAvailable else { throw X402CoreError.secureEnclaveUnavailable }
        if try store.getData(Self.prefix + alias) != nil {
            throw X402CoreError.keyAlreadyExists(alias)
        }

        var accessError: Unmanaged<CFError>?
        var flags: SecAccessControlCreateFlags = [.privateKeyUsage]
        if requireBiometry { flags.insert(.biometryCurrentSet) }
        guard
            let accessControl = SecAccessControlCreateWithFlags(
                kCFAllocatorDefault,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                flags,
                &accessError
            )
        else {
            throw X402CoreError.signingFailed("access control creation failed")
        }

        let key = try SecureEnclave.P256.Signing.PrivateKey(accessControl: accessControl)
        try store.setData(Self.prefix + alias, data: key.dataRepresentation)
        return key.publicKey.x963Representation
    }

    public func publicKey(alias: String) throws -> Data? {
        guard let blob = try store.getData(Self.prefix + alias) else { return nil }
        let key = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: blob)
        return key.publicKey.x963Representation
    }

    public func signDigest(alias: String, digest: Data) throws -> Data {
        guard let raw = RawSHA256Digest(rawBytes: digest) else {
            throw X402CoreError.invalidDigestLength(digest.count)
        }
        guard let blob = try store.getData(Self.prefix + alias) else {
            throw X402CoreError.keyNotFound(alias)
        }
        let key = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: blob)
        let signature = try key.signature(for: raw)
        return signature.rawRepresentation // r||s, 64 bytes
    }

    public func deleteKey(alias: String) throws {
        try store.remove(Self.prefix + alias)
    }
}
