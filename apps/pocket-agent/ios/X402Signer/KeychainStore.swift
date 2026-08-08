// Keychain-backed SecureStoring: policy/budget state and key material live
// behind the same OS protection as the keys themselves.
import Foundation
import Security

public final class KeychainStore: SecureStoring {
    private let service: String

    public init(service: String = "dev.allowkit.x402core") {
        self.service = service
    }

    private func query(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    public func get(_ key: String) throws -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = out as? Data else {
            throw X402CoreError.keychainError(status)
        }
        return String(data: data, encoding: .utf8)
    }

    public func set(_ key: String, value: String) throws {
        let data = Data(value.utf8)
        var add = query(key)
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecDuplicateItem {
            let update = SecItemUpdate(query(key) as CFDictionary, [kSecValueData as String: data] as CFDictionary)
            guard update == errSecSuccess else { throw X402CoreError.keychainError(update) }
        } else if status != errSecSuccess {
            throw X402CoreError.keychainError(status)
        }
    }

    public func remove(_ key: String) throws {
        let status = SecItemDelete(query(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw X402CoreError.keychainError(status)
        }
    }

    /// Raw-data variants used internally for key material.
    func getData(_ key: String) throws -> Data? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = out as? Data else {
            throw X402CoreError.keychainError(status)
        }
        return data
    }

    func setData(_ key: String, data: Data) throws {
        var add = query(key)
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecDuplicateItem {
            throw X402CoreError.keyAlreadyExists(key)
        } else if status != errSecSuccess {
            throw X402CoreError.keychainError(status)
        }
    }
}
