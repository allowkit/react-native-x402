import XCTest
import CryptoKit
import P256K
@testable import X402Core

/// Unique aliases per run so reruns never collide with leftover Keychain items.
private func testAlias(_ name: String) -> String {
    "\(name)-\(UUID().uuidString.prefix(8))"
}

final class KeychainStoreTests: XCTestCase {
    func testRoundtripAndRemove() throws {
        let store = KeychainStore(service: "dev.allowkit.x402core.tests")
        let key = testAlias("kv")
        XCTAssertNil(try store.get(key))
        try store.set(key, value: "hello")
        XCTAssertEqual(try store.get(key), "hello")
        try store.set(key, value: "updated")
        XCTAssertEqual(try store.get(key), "updated")
        try store.remove(key)
        XCTAssertNil(try store.get(key))
        try store.remove(key) // idempotent
    }
}

final class SoftKeySignerTests: XCTestCase {
    let store = KeychainStore(service: "dev.allowkit.x402core.tests")

    func testEd25519RoundtripVerifies() throws {
        let signer = SoftKeySigner(store: store)
        let a = testAlias("ed")
        defer { try? signer.deleteKey(alias: a) }

        let pub = try signer.generateKey(alias: a, curve: .ed25519)
        XCTAssertEqual(pub.count, 32)
        XCTAssertEqual(try signer.publicKey(alias: a), pub)

        let message = Data("solana partial-sign payload".utf8)
        let sig = try signer.signMessage(alias: a, message: message)
        XCTAssertEqual(sig.count, 64)

        let verifier = try Curve25519.Signing.PublicKey(rawRepresentation: pub)
        XCTAssertTrue(verifier.isValidSignature(sig, for: message))
        XCTAssertFalse(verifier.isValidSignature(sig, for: Data("tampered".utf8)))
    }

    func testSecp256k1DigestSignatureVerifiesAndRecovers() throws {
        let signer = SoftKeySigner(store: store)
        let a = testAlias("k1")
        defer { try? signer.deleteKey(alias: a) }

        let pub = try signer.generateKey(alias: a, curve: .secp256k1)
        XCTAssertEqual(pub.count, 65) // uncompressed, EVM-style
        XCTAssertEqual(pub.first, 0x04)

        // a stand-in for an EIP-712 typed-data hash
        let digest = Data(SHA256.hash(data: Data("transferWithAuthorization".utf8)))
        let sig = try signer.signDigest(alias: a, digest: digest)
        XCTAssertEqual(sig.count, 65) // r||s||v
        let v = sig[64]
        XCTAssertTrue(v == 27 || v == 28, "v must follow the EVM convention")

        // recover the public key from the signature alone — the property EVM
        // ecrecover relies on — and check it matches the signer's key
        let recSig = try P256K.Recovery.ECDSASignature(
            compactRepresentation: sig.prefix(64),
            recoveryId: Int32(v - 27)
        )
        let recovered = try P256K.Recovery.PublicKey(
            HashDigest([UInt8](digest)),
            signature: recSig,
            format: .uncompressed
        )
        XCTAssertEqual(Data(recovered.dataRepresentation), pub)
    }

    func testSignDigestRejectsWrongLengthAndUnknownAlias() throws {
        let signer = SoftKeySigner(store: store)
        XCTAssertThrowsError(try signer.signDigest(alias: testAlias("missing"), digest: Data(repeating: 0, count: 32)))
        let a = testAlias("len")
        defer { try? signer.deleteKey(alias: a) }
        _ = try signer.generateKey(alias: a, curve: .secp256k1)
        XCTAssertThrowsError(try signer.signDigest(alias: a, digest: Data(repeating: 0, count: 31)))
    }

    func testDuplicateAliasIsRefused() throws {
        let signer = SoftKeySigner(store: store)
        let a = testAlias("dup")
        defer { try? signer.deleteKey(alias: a) }
        _ = try signer.generateKey(alias: a, curve: .ed25519)
        XCTAssertThrowsError(try signer.generateKey(alias: a, curve: .secp256k1)) { err in
            guard case X402CoreError.keyAlreadyExists = err else {
                return XCTFail("expected keyAlreadyExists, got \(err)")
            }
        }
    }

    func testSecp256k1RefusesRawMessageSigning() throws {
        let signer = SoftKeySigner(store: store)
        let a = testAlias("nomsg")
        defer { try? signer.deleteKey(alias: a) }
        _ = try signer.generateKey(alias: a, curve: .secp256k1)
        XCTAssertThrowsError(try signer.signMessage(alias: a, message: Data("raw".utf8)))
    }
}

final class SecureEnclaveSignerTests: XCTestCase {
    /// Enclave-dependent tests skip where no Secure Enclave is reachable
    /// (CI VMs, older hardware); the suite still exercises everything else.
    func testEnclaveSignatureVerifies() throws {
        try XCTSkipUnless(SecureEnclaveSigner.isAvailable, "Secure Enclave not available in this environment")
        let signer = SecureEnclaveSigner(store: KeychainStore(service: "dev.allowkit.x402core.tests"))
        let a = testAlias("se")
        defer { try? signer.deleteKey(alias: a) }

        let pub = try signer.generateKey(alias: a, requireBiometry: false)
        XCTAssertEqual(pub.count, 65) // X9.63 uncompressed P-256

        let digest = Data(SHA256.hash(data: Data("passkey-smart-account userop".utf8)))
        let sig = try signer.signDigest(alias: a, digest: digest)

        let verifier = try CryptoKit.P256.Signing.PublicKey(x963Representation: pub)
        let ecdsa = try CryptoKit.P256.Signing.ECDSASignature(rawRepresentation: sig)
        guard let raw = RawSHA256Digest(rawBytes: digest) else { return XCTFail("digest wrap") }
        XCTAssertTrue(verifier.isValidSignature(ecdsa, for: raw))
    }
}
