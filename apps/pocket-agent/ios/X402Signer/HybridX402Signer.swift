// The Nitro HybridObject implementation: adapts the generated spec to
// X402Core. All byte payloads cross the JSI boundary as hex strings; private
// keys never do.
import Foundation
import LocalAuthentication
import NitroModules

final class HybridX402Signer: HybridX402SignerSpec {
    private let soft = SoftKeySigner()
    private let enclave = SecureEnclaveSigner()

    var isSecureHardwareAvailable: Bool {
        SecureEnclaveSigner.isAvailable
    }

    /// Policy-escalation gate: fresh OS-level user authentication.
    /// Biometrics first, device passcode as fallback — the strongest prompt
    /// available on the device. Resolves false on cancel/failure.
    func authenticate(reason: String) throws -> Promise<Bool> {
        let promise = Promise<Bool>()
        let context = LAContext()
        var error: NSError?

        // Fail CLOSED when the device has no usable authentication. Note the
        // simulator quirk: with neither passcode nor biometrics enrolled it
        // still reports .deviceOwnerAuthentication as evaluable, then presents
        // a passcode sheet that can never be satisfied. Require biometrics to
        // be enrolled OR a passcode to be set before prompting at all.
        let hasBiometrics = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        let hasAnyAuth = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
        guard hasBiometrics || (hasAnyAuth && Self.devicePasscodeIsSet()) else {
            promise.resolve(withResult: false)
            return promise
        }
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, _ in
            promise.resolve(withResult: success)
        }
        return promise
    }

    // MARK: software keys
    func generateSoftKey(alias: String, curve: String) throws -> String {
        let c = try parseCurve(curve)
        return try soft.generateKey(alias: alias, curve: c).hex
    }

    func softPublicKey(alias: String) throws -> String? {
        try soft.publicKey(alias: alias)?.hex
    }

    func signSoftDigest(alias: String, digestHex: String) throws -> String {
        try soft.signDigest(alias: alias, digest: digestHex.hexData).hex
    }

    func signSoftMessage(alias: String, messageHex: String) throws -> String {
        try soft.signMessage(alias: alias, message: messageHex.hexData).hex
    }

    func deleteSoftKey(alias: String) throws {
        try soft.deleteKey(alias: alias)
    }

    // MARK: Secure Enclave
    func generateEnclaveKey(alias: String, requireBiometry: Bool) throws -> String {
        try enclave.generateKey(alias: alias, requireBiometry: requireBiometry).hex
    }

    func enclavePublicKey(alias: String) throws -> String? {
        try enclave.publicKey(alias: alias)?.hex
    }

    func signEnclaveDigest(alias: String, digestHex: String) throws -> String {
        try enclave.signDigest(alias: alias, digest: digestHex.hexData).hex
    }

    func deleteEnclaveKey(alias: String) throws {
        try enclave.deleteKey(alias: alias)
    }

    /// Probe whether a device passcode exists by attempting to add (then
    /// remove) a Keychain item protected by `.whenPasscodeSetThisDeviceOnly`,
    /// which fails outright when no passcode is configured.
    private static func devicePasscodeIsSet() -> Bool {
        let probeKey = "dev.allowkit.x402core.passcode-probe"
        guard
            let access = SecAccessControlCreateWithFlags(
                nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, [], nil
            )
        else { return false }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: probeKey,
            kSecAttrAccount as String: probeKey,
            kSecValueData as String: Data([0x01]),
            kSecAttrAccessControl as String: access,
        ]
        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        SecItemDelete(query as CFDictionary)
        return status == errSecSuccess
    }

    private func parseCurve(_ s: String) throws -> SoftKeyCurve {
        switch s {
        case "secp256k1": return .secp256k1
        case "ed25519": return .ed25519
        default: throw X402CoreError.invalidKeyMaterial
        }
    }
}

private extension Data {
    var hex: String { map { String(format: "%02x", $0) }.joined() }
}

private extension String {
    var hexData: Data {
        var s = Substring(self)
        if s.hasPrefix("0x") { s = s.dropFirst(2) }
        var out = Data(capacity: s.count / 2)
        var idx = s.startIndex
        while idx < s.endIndex, let next = s.index(idx, offsetBy: 2, limitedBy: s.endIndex) {
            if let b = UInt8(s[idx..<next], radix: 16) { out.append(b) }
            idx = next
        }
        return out
    }
}
