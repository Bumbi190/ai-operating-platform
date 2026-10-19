using System.Net;
using System.Text;
using System.Text.Json;
using System.Security.Principal;
using Omnira.CodeBroker.Host;
namespace Omnira.CodeBroker.Workspace;
internal sealed record DockerReply(int Status,byte[] Body);
internal sealed class DockerProbeSession {
 readonly IDockerPeerConnector connector;PeerEvidence? peer;string? daemon;
 internal string? BackendIdentityHash=>peer?.ProcessIdentityHash;
 internal string? DaemonIdentityHash=>daemon;
 internal DockerProbeSession(IDockerPeerConnector connector){this.connector=connector;}
 internal async Task InitializeAsync(CancellationToken cancellation){
  using(var version=Json(await RequestAsync(HttpMethod.Get,"/version",null,5000,cancellation),200)){
   var root=version.RootElement;
   if(Text(root,"Os")!="linux"||!Version.TryParse(Text(root,"ApiVersion"),out var max)||!Version.TryParse(Text(root,"MinAPIVersion"),out var min)||min>new Version(1,51)||max<new Version(1,51))throw new WorkspaceException("protocol_invalid");
  }
  daemon=await ReadDaemonAsync(cancellation);
 }
 internal async Task EnsureLiveAsync(CancellationToken cancellation){
  if(daemon==null||await ReadDaemonAsync(cancellation)!=daemon)throw new WorkspaceException("peer_changed");
 }
 async Task<string> ReadDaemonAsync(CancellationToken cancellation){
  using var info=Json(await RequestAsync(HttpMethod.Get,"/v1.51/info",null,5000,cancellation),200);var r=info.RootElement;
  var os=Text(r,"OSType");var provider=Text(r,"OperatingSystem");var kernel=Text(r,"KernelVersion");var name=Text(r,"Name");var id=Text(r,"ID");
  if(os!="linux"||provider!="Docker Desktop"||name!="docker-desktop"||!System.Text.RegularExpressions.Regex.IsMatch(kernel,@"^[0-9][0-9A-Za-z._+-]{0,180}microsoft-standard-WSL2$")||!r.TryGetProperty("SwapLimit",out var swap)||swap.ValueKind!=JsonValueKind.True)throw new WorkspaceException("protocol_invalid");
  return NativeFileEvidence.Hash($"docker-v1:{id}:{os}:{provider}:{name}:{kernel}");
 }
 internal async Task<string> ImageAsync(CancellationToken cancellation){
  var reply=await RequestAsync(HttpMethod.Get,"/v1.51/images/"+Uri.EscapeDataString(WindowsSandboxProbe.ImageReference)+"/json",null,5000,cancellation);
  if(reply.Status==404)throw new WorkspaceException("image_missing");
  using var image=Json(reply,200);var r=image.RootElement;var id=Text(r,"Id");
  if(!ProbeSpecification.ImageId(id)||Text(r,"Os")!="linux"||Text(r,"Architecture")!="amd64"||!r.TryGetProperty("RepoDigests",out var digests)||digests.ValueKind!=JsonValueKind.Array||
     !digests.EnumerateArray().Any(v=>v.ValueKind==JsonValueKind.String&&(v.GetString()=="alpine@"+WindowsSandboxProbe.ImageDigest||v.GetString()==WindowsSandboxProbe.ImageReference)))throw new WorkspaceException("image_invalid");
  return id;
 }
 internal async Task<string> CreateAsync(Guid attempt,string image,CancellationToken cancellation){
  await EnsureLiveAsync(cancellation);
  using var result=Json(await RequestAsync(HttpMethod.Post,"/v1.51/containers/create?name="+ProbeSpecification.Name(attempt),ProbeSpecification.Create(attempt,image),5000,cancellation),201);
  var id=Text(result.RootElement,"Id");if(!ProbeSpecification.ContainerId(id))throw new WorkspaceException("protocol_invalid");return id;
 }
 internal async Task<JsonDocument?> InspectAsync(string owned,CancellationToken cancellation){
  if(!ProbeSpecification.ContainerId(owned)&&!ProbeSpecification.IsName(owned))throw new WorkspaceException("protocol_invalid");
  var response=await RequestAsync(HttpMethod.Get,"/v1.51/containers/"+owned+"/json",null,5000,cancellation);return response.Status==404?null:Json(response,200);
 }
 internal async Task StartAsync(string id,CancellationToken cancellation){RequireId(id);await EnsureLiveAsync(cancellation);var r=await RequestAsync(HttpMethod.Post,"/v1.51/containers/"+id+"/start",null,5000,cancellation);if(r.Status!=204)throw new WorkspaceException("probe_failed");}
 internal async Task WaitAsync(string id,CancellationToken cancellation){
  RequireId(id);using var result=Json(await RequestAsync(HttpMethod.Post,"/v1.51/containers/"+id+"/wait?condition=not-running",null,10000,cancellation),200);
  if(!result.RootElement.TryGetProperty("StatusCode",out var code)||!code.TryGetInt64(out var exit)||exit!=0||
     (result.RootElement.TryGetProperty("Error",out var error)&&error.ValueKind!=JsonValueKind.Null))throw new WorkspaceException("probe_failed");
 }
 internal async Task<byte[]> LogsAsync(string id,CancellationToken cancellation){RequireId(id);var r=await RequestAsync(HttpMethod.Get,"/v1.51/containers/"+id+"/logs?stdout=1&stderr=1&timestamps=0&follow=0",null,5000,cancellation);if(r.Status!=200)throw new WorkspaceException("probe_failed");return r.Body;}
 internal async Task DeleteAsync(string id,CancellationToken cancellation){RequireId(id);await EnsureLiveAsync(cancellation);var r=await RequestAsync(HttpMethod.Delete,"/v1.51/containers/"+id+"?force=1",null,5000,cancellation);if(r.Status is not (204 or 404))throw new WorkspaceException("cleanup_retained");}
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
 async Task<DockerReply> RequestAsync(HttpMethod method,string route,object? body,int timeout,CancellationToken cancellation){
  using var deadline=CancellationTokenSource.CreateLinkedTokenSource(cancellation);deadline.CancelAfter(timeout);OwnedPipeObservation? owned=null;int connections=0;
  try{
   using var handler=new SocketsHttpHandler{
    AllowAutoRedirect=false,UseProxy=false,UseCookies=false,Credentials=null,MaxResponseHeadersLength=16,MaxConnectionsPerServer=1,
    ConnectCallback=async(_,token)=>{
     if(Interlocked.Increment(ref connections)!=1)throw new WorkspaceException("peer_changed");
     owned=await connector.ConnectAsync(token);owned.ValidatePeer();var p=owned.Peer;var expected=HostProfile.Targets.Single(t=>t.Id=="backend");
     if(p.ProcessId<=0||!ProbeSpecification.Hash(p.ProcessIdentityHash)||p.ImageHash!=expected.PinnedSha256||p.UserSid!=WindowsIdentity.GetCurrent().User!.Value||
        !string.Equals(NativeFileEvidence.CanonicalInput(p.ImagePath),NativeFileEvidence.CanonicalInput(expected.Path),StringComparison.OrdinalIgnoreCase)||
        (peer!=null&&(peer.ProcessIdentityHash!=p.ProcessIdentityHash||peer.ImageHash!=p.ImageHash)))throw new WorkspaceException("peer_changed");
     peer??=p;return new BorrowedPipeStream(owned.Stream);
    }
   };
   using var client=new HttpClient(handler){Timeout=Timeout.InfiniteTimeSpan};
   using var request=new HttpRequestMessage(method,new Uri("http://docker"+route)){Version=HttpVersion.Version11,VersionPolicy=HttpVersionPolicy.RequestVersionExact};
   request.Headers.ConnectionClose=true;if(body!=null){request.Content=new ByteArrayContent(JsonSerializer.SerializeToUtf8Bytes(body));request.Content.Headers.ContentType=new("application/json");}
   using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,deadline.Token);
   if(response.Content.Headers.ContentLength>262144)throw new WorkspaceException("protocol_invalid");
   using var stream=await response.Content.ReadAsStreamAsync(deadline.Token);using var bytes=new MemoryStream();var buffer=new byte[8192];
   while(true){int read=await stream.ReadAsync(buffer,deadline.Token);if(read==0)break;if(bytes.Length+read>262144)throw new WorkspaceException("protocol_invalid");bytes.Write(buffer,0,read);}
   if(owned==null)throw new WorkspaceException("peer_changed");owned.ValidatePeer();return new((int)response.StatusCode,bytes.ToArray());
  }catch(OperationCanceledException){throw new WorkspaceException("deadline_exceeded");}
  catch(Exception e){
   for(Exception? current=e;current!=null;current=current.InnerException){if(current is WorkspaceException w)throw new WorkspaceException(w.Reason);if(current is HostCheckException h)throw new WorkspaceException(h.Reason=="deadline_exceeded"?"deadline_exceeded":"peer_changed");}
   throw new WorkspaceException("protocol_invalid");
  }finally{owned?.Dispose();}
 }
}
