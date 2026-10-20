using System.Text.Json;
using Omnira.CodeBroker.Workspace;
namespace Omnira.CodeBroker.Workspace.Smoke;
internal static class ToolchainSmoke {
 internal static NodeToolchainProfile Fixture()=>new("sha256:"+new string('a',64),new string('b',64),new string('c',64),new string('d',64),"10.9.0",new[]{"PATH=/usr/local/bin:/usr/bin:/bin","NODE_VERSION=22.23.3"});
 static JsonDocument Image(NodeToolchainProfile p,string? id=null,string? node=null)=>JsonDocument.Parse(JsonSerializer.Serialize(new{Id=id??p.ImageId,Os="linux",Architecture="amd64",Config=new{User="10001:10001",WorkingDir="/workspace/repo",Entrypoint=new[]{"/usr/local/bin/node","/opt/omnira/fixture-runner.mjs"},Cmd=Array.Empty<string>(),Env=node==null?p.ImageEnvironment:p.ImageEnvironment.Select(e=>e.StartsWith("NODE_VERSION=")?"NODE_VERSION="+node:e).ToArray(),Labels=new Dictionary<string,string>{{"omnira.sdf.node.version","1"},{"omnira.sdf.node.lock",ToolchainProfile.LockSha256},{"omnira.sdf.node.recipe",p.RecipeSha256},{"omnira.sdf.node.runner",p.RunnerSha256}}}}));
 internal static void Run(Action<string,bool> check){
  check("unprovisioned_refused",PathProcessSmoke.Refused(()=>ToolchainProfile.RequireReady(null)));
  var p=Fixture();using(var source=Image(p)){var node=System.Text.Json.Nodes.JsonNode.Parse(source.RootElement.GetRawText())!;node["Config"]!.AsObject().Remove("Cmd");using var omitted=JsonDocument.Parse(node.ToJsonString());check("omitted_empty_image_command",ToolchainProfile.VerifyImage(p,omitted.RootElement)==p.ImageId);}
  using(var image=Image(p))check("immutable_toolchain_image",ToolchainProfile.VerifyImage(p,image.RootElement)==p.ImageId);
  using(var wrong=Image(p,"node:latest"))check("mutable_toolchain_refused",PathProcessSmoke.Refused(()=>ToolchainProfile.VerifyImage(p,wrong.RootElement)));
  using(var wrong=Image(p,"sha256:"+new string('f',64)))check("wrong_toolchain_refused",PathProcessSmoke.Refused(()=>ToolchainProfile.VerifyImage(p,wrong.RootElement)));
  using(var wrong=Image(p,node:"22.0.0"))check("wrong_node_version_refused",PathProcessSmoke.Refused(()=>ToolchainProfile.VerifyImage(p,wrong.RootElement)));
  check("profile_inventory_changes_hash",ToolchainProfile.Hash(p)!=ToolchainProfile.Hash(p with{InventorySha256=new string('e',64)}));
  check("profile_recipe_changes_hash",ToolchainProfile.Hash(p)!=ToolchainProfile.Hash(p with{RecipeSha256=new string('e',64)}));
 }
}
