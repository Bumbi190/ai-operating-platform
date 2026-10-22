using System.Security.Cryptography;
using System.Text.Json;

namespace Omnira.CodeBroker.Smoke;

/// <summary>Test-only lease: creates its own random identity and deletes only that identity.</summary>
internal static class FixtureLease {
    public static async Task Run() {
        var id = Guid.NewGuid().ToString();
        var store = new WindowsIdentityStore();
        bool owned = false;
        try {
            var identity = store.Generate(id); owned = true;
            Console.WriteLine(JsonSerializer.Serialize(identity)); Console.Out.Flush();
            var release = await Console.In.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(45));
            if (release != "release") throw new Exception("invalid fixture release");
        } finally {
            if (owned) {
                using var key = CngKey.Open("com.omnira.code-broker." + id, CngProvider.MicrosoftSoftwareKeyStorageProvider);
                key.Delete();
                Console.WriteLine(JsonSerializer.Serialize(new { fixtureRemoved = !CngKey.Exists("com.omnira.code-broker." + id, CngProvider.MicrosoftSoftwareKeyStorageProvider) }));
            }
        }
    }
}
