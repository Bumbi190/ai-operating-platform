using System.Net;
using System.Text;
using System.Text.Json;
using System.Security.Principal;
using Omnira.CodeBroker.Host;
namespace Omnira.CodeBroker.Workspace;
internal sealed class DockerProbeSession {
 readonly VerifiedDockerSession transport;
 internal string? BackendIdentityHash=>transport.BackendIdentityHash;
 internal string? DaemonIdentityHash=>transport.DaemonIdentityHash;
 internal DockerProbeSession(IDockerPeerConnector connector){transport=new(connector);}
 internal Task InitializeAsync(CancellationToken t)=>transport.InitializeAsync(t);
 internal Task EnsureLiveAsync(CancellationToken t)=>transport.EnsureLiveAsync(t);
 internal async Task<string> ImageAsync(CancellationToken cancellation){
  var reply=await transport.SendAsync(VerifiedDockerRequest.HealthImage(),cancellation);
  if(reply.Status==404)throw new WorkspaceException("image_missing");
  using var image=Json(reply,200);var r=image.RootElement;var id=Text(r,"Id");
  if(!ProbeSpecification.ImageId(id)||Text(r,"Os")!="linux"||Text(r,"Architecture")!="amd64"||!r.TryGetProperty("RepoDigests",out var digests)||digests.ValueKind!=JsonValueKind.Array||
     !digests.EnumerateArray().Any(v=>v.ValueKind==JsonValueKind.String&&(v.GetString()=="alpine@"+WindowsSandboxProbe.ImageDigest||v.GetString()==WindowsSandboxProbe.ImageReference)))throw new WorkspaceException("image_invalid");
  return id;
 }
 internal async Task<string> CreateAsync(Guid attempt,string image,CancellationToken cancellation){
  await EnsureLiveAsync(cancellation);
  using var result=Json(await transport.SendAsync(VerifiedDockerRequest.HealthCreate(attempt,image),cancellation),201);
  var id=Text(result.RootElement,"Id");if(!ProbeSpecification.ContainerId(id))throw new WorkspaceException("protocol_invalid");return id;
 }
 internal async Task<JsonDocument?> InspectAsync(string owned,CancellationToken cancellation){
  if(!ProbeSpecification.ContainerId(owned)&&!ProbeSpecification.IsName(owned))throw new WorkspaceException("protocol_invalid");
  // Container presence AND absence are evidence only from the initialized daemon.
  await EnsureLiveAsync(cancellation);
  var response=await transport.SendAsync(VerifiedDockerRequest.ContainerInspect(owned),cancellation);
  await EnsureLiveAsync(cancellation);
  return response.Status==404?null:Json(response,200);
 }
 internal async Task StartAsync(string id,CancellationToken cancellation){RequireId(id);await EnsureLiveAsync(cancellation);var r=await transport.SendAsync(VerifiedDockerRequest.Start(id),cancellation);if(r.Status!=204)throw new WorkspaceException("probe_failed");}
 internal async Task WaitAsync(string id,CancellationToken cancellation){
  RequireId(id);using var result=Json(await transport.SendAsync(VerifiedDockerRequest.Wait(id),cancellation),200);
  if(!result.RootElement.TryGetProperty("StatusCode",out var code)||!code.TryGetInt64(out var exit)||exit!=0||
     (result.RootElement.TryGetProperty("Error",out var error)&&error.ValueKind!=JsonValueKind.Null))throw new WorkspaceException("probe_failed");
 }
 internal async Task<byte[]> LogsAsync(string id,CancellationToken cancellation){RequireId(id);var r=await transport.SendAsync(VerifiedDockerRequest.Logs(id),cancellation);if(r.Status!=200)throw new WorkspaceException("probe_failed");return r.Body;}
 internal async Task DeleteAsync(string id,CancellationToken cancellation){RequireId(id);await EnsureLiveAsync(cancellation);var r=await transport.SendAsync(VerifiedDockerRequest.DeleteContainer(id),cancellation);if(r.Status is not (204 or 404))throw new WorkspaceException("cleanup_retained");}
 static void RequireId(string id){if(!ProbeSpecification.ContainerId(id))throw new WorkspaceException("protocol_invalid");}
 static string Text(JsonElement r,string key){
  if(!r.TryGetProperty(key,out var value)||value.ValueKind!=JsonValueKind.String)throw new WorkspaceException("protocol_invalid");
  var s=value.GetString()!;if(s.Length<1||s.Length>256||s.Any(char.IsControl))throw new WorkspaceException("protocol_invalid");return s;
 }
 static JsonDocument Json(DockerReply reply,int status){
  if(reply.Status!=status)throw new WorkspaceException("protocol_invalid");JsonDocument? doc=null;
  try{doc=JsonDocument.Parse(reply.Body,new JsonDocumentOptions{MaxDepth=16});WorkspaceJson.Unique(doc.RootElement);if(doc.RootElement.ValueKind!=JsonValueKind.Object)throw new Exception();return doc;}
  catch{doc?.Dispose();throw new WorkspaceException("protocol_invalid");}
 }

}
