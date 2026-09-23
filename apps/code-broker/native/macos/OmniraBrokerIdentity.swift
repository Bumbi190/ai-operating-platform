import Foundation
import Security
import CryptoKit

enum BrokerError: Error { case invalidArguments, keyUnavailable, keyCreation, publicKey, signature }

let args = CommandLine.arguments
func argument(_ name: String) throws -> String {
    guard let index = args.firstIndex(of: name), index + 1 < args.count else { throw BrokerError.invalidArguments }
    return args[index + 1]
}
func tag(_ identity: String) -> Data { Data("com.omnira.code-broker.\(identity)".utf8) }
func lookup(_ identity: String) throws -> SecKey {
    let query: [String: Any] = [kSecClass as String: kSecClassKey,
        kSecAttrApplicationTag as String: tag(identity), kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecReturnRef as String: true]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let key = result as! SecKey? else { throw BrokerError.keyUnavailable }
    return key
}
func publicResult(_ identity: String, _ key: SecKey, _ storage: String?) throws -> [String: Any] {
    guard let publicKey = SecKeyCopyPublicKey(key),
          let bytes = SecKeyCopyExternalRepresentation(publicKey, nil) as Data?, bytes.count == 65, bytes[0] == 4 else { throw BrokerError.publicKey }
    let x = bytes[1..<33].base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    let y = bytes[33..<65].base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    let canonical = "{\"crv\":\"P-256\",\"kty\":\"EC\",\"x\":\"\(x)\",\"y\":\"\(y)\"}"
    let thumb = Data(SHA256.hash(data: Data(canonical.utf8))).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    let attributes = SecKeyCopyAttributes(key) as? [String: Any]
    let inferred = (attributes?[kSecAttrTokenID as String] as? String) == (kSecAttrTokenIDSecureEnclave as String) ? "secure_enclave" : "keychain"
    return ["identityId": identity, "publicJwk": ["kty": "EC", "crv": "P-256", "x": x, "y": y], "keyThumbprint": thumb, "storage": storage ?? inferred]
}
func generate(_ identity: String, allowFallback: Bool) throws -> [String: Any] {
    let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly, .privateKeyUsage, nil)!
    func attributes(secure: Bool) -> [String: Any] {
        var result: [String: Any] = [kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom, kSecAttrKeySizeInBits as String: 256,
            kSecPrivateKeyAttrs as String: [kSecAttrIsPermanent as String: true, kSecAttrApplicationTag as String: tag(identity), kSecAttrAccessControl as String: access]]
        if secure { result[kSecAttrTokenID as String] = kSecAttrTokenIDSecureEnclave }
        return result
    }
    var error: Unmanaged<CFError>?
    if let key = SecKeyCreateRandomKey(attributes(secure: true) as CFDictionary, &error) { return try publicResult(identity, key, "secure_enclave") }
    guard allowFallback else { throw BrokerError.keyCreation }
    error = nil
    guard let key = SecKeyCreateRandomKey(attributes(secure: false) as CFDictionary, &error) else { throw BrokerError.keyCreation }
    return try publicResult(identity, key, "keychain")
}
do {
    guard args.count >= 2 else { throw BrokerError.invalidArguments }
    let command = args[1], identity = try argument("--identity")
    let output: [String: Any]
    if command == "generate" { output = try generate(identity, allowFallback: args.contains("--allow-keychain-fallback")) }
    else if command == "public" { output = try publicResult(identity, try lookup(identity), nil) }
    else if command == "sign" {
        guard let payload = Data(base64Encoded: try argument("--payload-base64")) else { throw BrokerError.invalidArguments }
        let key = try lookup(identity)
        guard SecKeyIsAlgorithmSupported(key, .sign, .ecdsaSignatureMessageX962SHA256),
              let signature = SecKeyCreateSignature(key, .ecdsaSignatureMessageX962SHA256, payload as CFData, nil) as Data? else { throw BrokerError.signature }
        output = ["signature": signature.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")]
    } else { throw BrokerError.invalidArguments }
    let data = try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys])
    FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10]))
} catch {
    FileHandle.standardError.write(Data("broker identity operation failed\n".utf8)); exit(1)
}
