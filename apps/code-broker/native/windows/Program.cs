using System.Text;
using System.Text.Json;
using Omnira.CodeBroker;

try {
    if (!OperatingSystem.IsWindows() || args.Length < 3) throw new ArgumentException();
    var command = args[0];
    if (command != "generate" && command != "public" && command != "sign") throw new ArgumentException();
    var values = new Dictionary<string, string>(StringComparer.Ordinal);
    for (int i = 1; i < args.Length; i += 2) {
        if (i + 1 >= args.Length || !values.TryAdd(args[i], args[i + 1])) throw new ArgumentException();
    }
    var allowed = command == "sign" ? new[] { "--identity", "--payload-base64" } : new[] { "--identity" };
    if (values.Count != allowed.Length || allowed.Any(flag => !values.ContainsKey(flag))) throw new ArgumentException();
    var id = values["--identity"];
    WindowsIdentityStore.ValidateId(id);
    var store = new WindowsIdentityStore();
    object result;
    if (command == "sign") {
        var encoded = values["--payload-base64"];
        if (encoded.Length > 21848) throw new ArgumentException();
        var payload = Convert.FromBase64String(encoded);
        if (payload.Length > 16384 || Convert.ToBase64String(payload) != encoded) throw new ArgumentException();
        _ = new UTF8Encoding(false, true).GetString(payload);
        result = new { signature = store.Sign(id, payload) };
    } else {
        result = command == "generate" ? store.Generate(id) : store.ReadPublic(id);
    }
    Console.WriteLine(JsonSerializer.Serialize(result));
    return 0;
} catch {
    Console.Error.WriteLine("broker_identity_failed");
    return 1;
}
