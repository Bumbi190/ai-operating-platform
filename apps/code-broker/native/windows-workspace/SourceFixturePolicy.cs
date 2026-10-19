using System.Text;
using System.Text.RegularExpressions;
namespace Omnira.CodeBroker.Workspace;
internal static class SourceFixturePolicy {
 internal const string Id="sdf.windows_source_fixture.v1";
 internal const int MaxFileBytes=1048576,MaxTotalBytes=16777216,MaxTarBytes=17825792;
 internal static readonly string[] Paths={"apps/web/lib/atlas/authorization/build.ts","apps/web/lib/atlas/authorization/derive.ts","apps/web/lib/atlas/authorization/types.ts","apps/web/lib/atlas/code-work/binding.ts","apps/web/lib/atlas/code-work/capability.ts","apps/web/lib/atlas/code-work/command-registry.ts","apps/web/lib/atlas/code-work/evidence.ts","apps/web/lib/atlas/code-work/lifecycle.ts","apps/web/lib/atlas/code-work/patch-protocol.ts","apps/web/lib/atlas/code-work/path-policy.ts","apps/web/lib/atlas/code-work/policy.ts","apps/web/lib/atlas/code-work/repository-registry.ts","apps/web/lib/atlas/code-work/terminal-evidence.ts","apps/web/lib/atlas/code-work/types.ts","apps/web/lib/atlas/code-work/worker-registry.ts","apps/web/lib/qa/__stubs__/server-only.ts","apps/web/lib/qa/sdf1a-code-work-contracts.test.ts","apps/web/package.json","apps/web/tsconfig.json","package-lock.json","package.json","packages/local-text-contract/package.json"};
 internal static void ValidatePath(string path){
  if(path.Length==0||path.Length>200||!Regex.IsMatch(path,@"^[A-Za-z0-9._/-]+$",RegexOptions.CultureInvariant))throw new WorkspaceException("source_policy_denied");
  var parts=path.Split('/');
  foreach(var p in parts){
   if(p.Length==0||p is "." or ".."||p.EndsWith('.')||p.StartsWith(".env",StringComparison.OrdinalIgnoreCase)||Regex.IsMatch(p,@"^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant))throw new WorkspaceException("source_policy_denied");
   if(new[]{".git",".npmrc",".netrc",".ssh",".aws",".gnupg","credentials","secrets","node_modules",".omnira-source-manifest.json"}.Contains(p,StringComparer.OrdinalIgnoreCase))throw new WorkspaceException("source_policy_denied");
  }
  if(Regex.IsMatch(path,@"\.(?:pem|p12|pfx|key|crt|cer|keystore)$",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant))throw new WorkspaceException("source_policy_denied");
 }
 internal static void ValidateText(byte[] bytes){
  if(bytes.Length>MaxFileBytes)throw new WorkspaceException("source_limit");
  string text;try{text=new UTF8Encoding(false,true).GetString(bytes);}catch{throw new WorkspaceException("source_policy_denied");}
  if(text.Any(c=>c=='\0'||(c<' '&&c is not ('\t' or '\r' or '\n')))||text.StartsWith("version https://git-lfs.github.com/spec/v1",StringComparison.Ordinal))throw new WorkspaceException("source_policy_denied");
  if(SecretTextPolicy.Contains(text))throw new WorkspaceException("secret_pattern_found");
 }
}
