using System.Text.Json;
using System.Text.RegularExpressions;
using Omnira.CodeBroker.Host;
namespace Omnira.CodeBroker.Workspace;
internal sealed record NodeToolchainProfile(string ImageId,string RecipeSha256,string RunnerSha256,string InventorySha256,string NpmVersion,string[] ImageEnvironment);
internal static class ToolchainProfile {
 internal const string BaseReference="docker.io/library/node@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562";
 internal const string LockSha256="17ba6aedc7139835f0de6c62fc13c727682b737fe142ee7e99d452673625de80";
 internal static readonly IReadOnlyDictionary<string,string> DescriptorPins=new SortedDictionary<string,string>(StringComparer.Ordinal){
  ["package.json"]="d04f1e73243bd9d023a352fdc42b1892474d76f8c0519acd08819b926d500fdd",
  ["package-lock.json"]=LockSha256,
  ["apps/web/package.json"]="def6e3795da9eb4250e703446080ddb824d2128a6e6869949c09efd374944313",
  ["packages/local-text-contract/package.json"]="662e5cee1fd9e5bb13002f31793f54b50ea0a1eb67ab34a2931977f583c27cb3"
 };
 // Explicit operator setup output is enrolled in source; runtime never discovers or enrolls.
 internal static NodeToolchainProfile? Current=>new("sha256:3c16f0769a58c732a92dc1e7badcf327c86a24eec4bcd559801ba6b9783a3c54","e6ef6c4447bcc35f1868ca253e6114c5ef21dbe5aee62068bf3fecc780119f54","3e7cb7974f1c3ce261ca9f698937a633d8062cc4f763b9fcf9d319e547a9c77e","0aeb2cd8a20c5b57c5e2a57283860e0b7d21e07831c90c3ec4b6b923a95d1ed3","10.9.9",new[]{"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin","NODE_VERSION=22.23.3","YARN_VERSION=1.22.22","HOME=/tmp","LANG=C.UTF-8","NODE_ENV=test"});
 internal static NodeToolchainProfile RequireReady(NodeToolchainProfile? p){
  if(p==null)throw new WorkspaceException("toolchain_unprovisioned");
  if(!ProbeSpecification.ImageId(p.ImageId)||!ProbeSpecification.Hash(p.RecipeSha256)||!ProbeSpecification.Hash(p.RunnerSha256)||!ProbeSpecification.Hash(p.InventorySha256)||!Regex.IsMatch(p.NpmVersion,@"^[0-9]+\.[0-9]+\.[0-9]+$"))throw new WorkspaceException("toolchain_mismatch");
  var keys=new HashSet<string>(StringComparer.Ordinal);
  foreach(var env in p.ImageEnvironment){
   var at=env.IndexOf('=');if(at<1||env.Length>2048||env.Any(char.IsControl)||!keys.Add(env[..at])||!new[]{"PATH","NODE_VERSION","YARN_VERSION","HOME","LANG","NODE_ENV"}.Contains(env[..at]))throw new WorkspaceException("toolchain_mismatch");
  }
  if(!p.ImageEnvironment.Contains("NODE_VERSION=22.23.3"))throw new WorkspaceException("toolchain_mismatch");return p;
 }
 internal static string Hash(NodeToolchainProfile p){
  RequireReady(p);
  return NativeFileEvidence.Hash(JsonSerializer.Serialize(new{schema="sdf.node_toolchain_profile.v1",imageId=p.ImageId,baseReference=BaseReference,sourcePolicyId=SourceFixturePolicy.Id,descriptorPins=DescriptorPins,lockSha256=LockSha256,recipeSha256=p.RecipeSha256,runnerSha256=p.RunnerSha256,inventorySha256=p.InventorySha256,nodeVersion="22.23.3",npmVersion=p.NpmVersion,typeScriptVersion="5.9.3",vitestVersion="2.1.9",imageEnvironment=p.ImageEnvironment}));
 }
 internal static string VerifyImage(NodeToolchainProfile p,JsonElement image){
  RequireReady(p);
  void Need(bool ok){if(!ok)throw new WorkspaceException("toolchain_mismatch");}
  string Text(JsonElement e,string key){if(!e.TryGetProperty(key,out var v)||v.ValueKind!=JsonValueKind.String)throw new WorkspaceException("toolchain_mismatch");return v.GetString()!;}
  string[] Strings(JsonElement e,string key){if(!e.TryGetProperty(key,out var v)){if(key=="Cmd")return Array.Empty<string>();throw new WorkspaceException("toolchain_mismatch");}if(v.ValueKind==JsonValueKind.Null)return Array.Empty<string>();if(v.ValueKind!=JsonValueKind.Array||v.EnumerateArray().Any(x=>x.ValueKind!=JsonValueKind.String))throw new WorkspaceException("toolchain_mismatch");return v.EnumerateArray().Select(x=>x.GetString()!).ToArray();}
  Need(Text(image,"Id")==p.ImageId&&Text(image,"Os")=="linux"&&Text(image,"Architecture")=="amd64");
  if(!image.TryGetProperty("Config",out var config))throw new WorkspaceException("toolchain_mismatch");
  Need(Text(config,"User")=="10001:10001"&&Text(config,"WorkingDir")=="/workspace/repo"&&Strings(config,"Entrypoint").SequenceEqual(new[]{"/usr/local/bin/node","/opt/omnira/fixture-runner.mjs"})&&Strings(config,"Cmd").Length==0);
  Need(Strings(config,"Env").Order(StringComparer.Ordinal).SequenceEqual(p.ImageEnvironment.Order(StringComparer.Ordinal)));
  if(!config.TryGetProperty("Labels",out var labels)||labels.ValueKind!=JsonValueKind.Object)throw new WorkspaceException("toolchain_mismatch");
  Need(labels.EnumerateObject().Count()==4&&Text(labels,"omnira.sdf.node.version")=="1"&&Text(labels,"omnira.sdf.node.lock")==LockSha256&&Text(labels,"omnira.sdf.node.recipe")==p.RecipeSha256&&Text(labels,"omnira.sdf.node.runner")==p.RunnerSha256);
  return p.ImageId;
 }
}
