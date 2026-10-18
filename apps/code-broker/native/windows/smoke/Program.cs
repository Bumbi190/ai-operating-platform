using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Omnira.CodeBroker;
var names = new List<string>();
void Check(string name, bool value) { if (!value) throw new Exception(name); names.Add(name); }
void Refuses(string name, Action action) {
    try { action(); } catch { names.Add(name); return; }
    throw new Exception(name);
}
var id = Guid.NewGuid().ToString();
var missing = Guid.NewGuid().ToString();
bool owned = false;
try {
    var store = new WindowsIdentityStore();
    var first = store.Generate(id); owned = true;
    Check("storage_is_truthful", first.storage == "windows_cng");
    Check("public_is_p256", first.publicJwk.kty == "EC" && first.publicJwk.crv == "P-256");
    Check("reopen_keeps_public_identity", store.ReadPublic(id) == first);
    Refuses("duplicate_generate_refused", () => store.Generate(id));
    Check("duplicate_preserves_identity", store.ReadPublic(id) == first);
    using (var key = CngKey.Open("com.omnira.code-broker." + id, CngProvider.MicrosoftSoftwareKeyStorageProvider)) {
        Check("export_policy_none", key.ExportPolicy == CngExportPolicies.None);
        Refuses("private_export_refused", () => key.Export(CngKeyBlobFormat.EccPrivateBlob));
        var bytes = Encoding.UTF8.GetBytes("Atlas Windows proof åäö");
        var encoded = store.Sign(id, bytes);
        var signature = Convert.FromBase64String(encoded.Replace('-', '+').Replace('_', '/').PadRight((encoded.Length + 3) / 4 * 4, '='));
        using var verifier = new ECDsaCng(key);
        Check("signature_der_valid", verifier.VerifyData(bytes, signature, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence));
        Check("altered_payload_refused", !verifier.VerifyData(Encoding.UTF8.GetBytes("altered"), signature, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence));
    }
    Refuses("missing_public_refused", () => store.ReadPublic(missing));
    Refuses("missing_sign_refused", () => store.Sign(missing, new byte[]{1}));
    Check("missing_identity_not_created", !CngKey.Exists("com.omnira.code-broker." + missing, CngProvider.MicrosoftSoftwareKeyStorageProvider));
    Refuses("invalid_uuid_refused", () => store.Generate("00000000-0000-9000-8000-000000000001"));
    Refuses("oversize_payload_refused", () => store.Sign(id, new byte[16385]));
} finally {
    if (owned) {
        using var key = CngKey.Open("com.omnira.code-broker." + id, CngProvider.MicrosoftSoftwareKeyStorageProvider);
        key.Delete();
    }
}
Check("fixture_key_removed", !CngKey.Exists("com.omnira.code-broker." + id, CngProvider.MicrosoftSoftwareKeyStorageProvider));
Console.WriteLine(JsonSerializer.Serialize(new { passed = names.Count, names }));
