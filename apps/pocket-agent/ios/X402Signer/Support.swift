// Shared support types for X402Core.
import Foundation
import CryptoKit

public enum X402CoreError: Error, Equatable {
    case keyNotFound(String)
    case keyAlreadyExists(String)
    case keychainError(OSStatus)
    case secureEnclaveUnavailable
    case invalidDigestLength(Int)
    case invalidKeyMaterial
    case signingFailed(String)
}

/// A precomputed 32-byte hash wrapped as a CryptoKit `Digest`, so signers can
/// sign externally-computed digests (e.g. an EIP-712 hash or a Solana message
/// hash) without re-hashing. CryptoKit and libsecp256k1 both consume `Digest`.
public struct RawSHA256Digest: Digest {
    public static var byteCount: Int { 32 }
    private let bytes: [UInt8]

    public init?(rawBytes: Data) {
        guard rawBytes.count == Self.byteCount else { return nil }
        self.bytes = [UInt8](rawBytes)
    }

    public func withUnsafeBytes<R>(_ body: (UnsafeRawBufferPointer) throws -> R) rethrows -> R {
        try bytes.withUnsafeBytes(body)
    }

    public func makeIterator() -> Array<UInt8>.Iterator {
        bytes.makeIterator()
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(bytes)
    }

    public static func == (lhs: RawSHA256Digest, rhs: RawSHA256Digest) -> Bool {
        lhs.bytes == rhs.bytes
    }
}
