using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Omnira.CodeBroker;

public sealed record BrokerPublicJwk(string kty, string crv, string x, string y);
public sealed record IdentityPublicResult(string identityId, BrokerPublicJwk publicJwk, string keyThumbprint, string storage);

/// <summary>Current-user CNG keys. No private-key import, export or deletion API.</summary>
public sealed class WindowsIdentityStore {
    private const string Prefix = "com.omnira.code-broker.";
    private static readonly Regex IdPattern = new("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOptions.CultureInvariant);
    public static void ValidateId(string id) {
        if (id == null || id.Length != 36 || !IdPattern.IsMatch(id))
            throw new ArgumentException("invalid_identity");
    }
    private static string Name(string id) { ValidateId(id); return Prefix + id; }
    private static void ValidateKey(CngKey key) {
        if (key.IsEphemeral || key.Algorithm != CngAlgorithm.ECDsaP256 ||
            key.Provider != CngProvider.MicrosoftSoftwareKeyStorageProvider ||
            key.ExportPolicy != CngExportPolicies.None || key.KeyUsage != CngKeyUsages.Signing)
            throw new CryptographicException("unsupported_identity");
    }
    private static CngKey Open(string id) {
        var key = CngKey.Open(Name(id), CngProvider.MicrosoftSoftwareKeyStorageProvider, CngKeyOpenOptions.None);
        try { ValidateKey(key); return key; } catch { key.Dispose(); throw; }
    }
    public IdentityPublicResult Generate(string id) {
        var name = Name(id);
        if (CngKey.Exists(name, CngProvider.MicrosoftSoftwareKeyStorageProvider))
            throw new CryptographicException("identity_exists");
        using var key = CngKey.Create(CngAlgorithm.ECDsaP256, name, new CngKeyCreationParameters {
            Provider = CngProvider.MicrosoftSoftwareKeyStorageProvider,
            ExportPolicy = CngExportPolicies.None, KeyUsage = CngKeyUsages.Signing,
            KeyCreationOptions = CngKeyCreationOptions.None,
        });
        try { ValidateKey(key); return Project(id, key); }
        catch { key.Delete(); throw; } // Only this just-created key belongs to this operation.
    }
    public IdentityPublicResult ReadPublic(string id) {
        using var key = Open(id); return Project(id, key);
    }
    public string Sign(string id, byte[] payload) {
        ValidateId(id);
        if (payload == null || payload.Length > 16384) throw new ArgumentException("payload_limit");
        using var key = Open(id);
        using var signer = new ECDsaCng(key);
        return Base64Url(signer.SignData(payload, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence));
    }
    private static IdentityPublicResult Project(string id, CngKey key) {
        using var signer = new ECDsaCng(key);
        var p = signer.ExportParameters(false);
        if (p.Q.X?.Length != 32 || p.Q.Y?.Length != 32) throw new CryptographicException("invalid_public_key");
        var x = Base64Url(p.Q.X); var y = Base64Url(p.Q.Y);
        var canonical = JsonSerializer.Serialize(new { crv = "P-256", kty = "EC", x, y });
        var thumb = Base64Url(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
        return new(id, new("EC", "P-256", x, y), thumb, "windows_cng");
    }
    private static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
