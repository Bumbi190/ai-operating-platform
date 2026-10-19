using System.Net;
using System.Text;
using System.Text.Json;
using System.Security.Principal;
using Omnira.CodeBroker.Host;
namespace Omnira.CodeBroker.Workspace;
internal sealed record DockerReply(int Status,byte[] Body);
internal sealed class VerifiedDockerSession {
 readonly IDockerPeerConnector connector;PeerEvidence? peer;string? daemon;
 internal string? BackendIdentityHash=>peer?.ProcessIdentityHash;
 internal string? DaemonIdentityHash=>daemon;
 internal VerifiedDockerSession(IDockerPeerConnector connector){this.connector=connector;}
 internal async Task InitializeAsync(CancellationToken cancellation){
  using(var version=Json(await SendAsync(VerifiedDockerRequest.Version(),cancellation),200)){
   var root=version.RootElement;
   if(Text(root,"Os")!="linux"||!Version.TryParse(Text(root,"ApiVersion"),out var max)||!Version.TryParse(Text(root,"MinAPIVersion"),out var min)||min>new Version(1,51)||max<new Version(1,51))throw new WorkspaceException("protocol_invalid");
  }
  daemon=await ReadDaemonAsync(cancellation);
 }
 internal async Task EnsureLiveAsync(CancellationToken cancellation){
  if(daemon==null||await ReadDaemonAsync(cancellation)!=daemon)throw new WorkspaceException("peer_changed");
 }
 async Task<string> ReadDaemonAsync(CancellationToken cancellation){
  using var info=Json(await SendAsync(VerifiedDockerRequest.Info(),cancellation),200);var r=info.RootElement;
  var os=Text(r,"OSType");var provider=Text(r,"OperatingSystem");var kernel=Text(r,"KernelVersion");var name=Text(r,"Name");var id=Text(r,"ID");
  if(os!="linux"||provider!="Docker Desktop"||name!="docker-desktop"||!System.Text.RegularExpressions.Regex.IsMatch(kernel,@"^[0-9][0-9A-Za-z._+-]{0,180}microsoft-standard-WSL2$")||!r.TryGetProperty("SwapLimit",out var swap)||swap.ValueKind!=JsonValueKind.True)throw new WorkspaceException("protocol_invalid");
  return NativeFileEvidence.Hash($"docker-v1:{id}:{os}:{provider}:{name}:{kernel}");
 }
 static string Text(JsonElement r,string key){
  if(!r.TryGetProperty(key,out var value)||value.ValueKind!=JsonValueKind.String)throw new WorkspaceException("protocol_invalid");
  var s=value.GetString()!;if(s.Length<1||s.Length>256||s.Any(char.IsControl))throw new WorkspaceException("protocol_invalid");return s;
 }
 internal static JsonDocument Json(DockerReply reply,int status){
  if(reply.Status!=status)throw new WorkspaceException("protocol_invalid");JsonDocument? doc=null;
  try{doc=JsonDocument.Parse(reply.Body,new JsonDocumentOptions{MaxDepth=16});WorkspaceJson.Unique(doc.RootElement);if(doc.RootElement.ValueKind!=JsonValueKind.Object)throw new Exception();return doc;}
  catch{doc?.Dispose();throw new WorkspaceException("protocol_invalid");}
 }
 internal async Task<DockerReply> SendAsync(VerifiedDockerRequest operation,CancellationToken cancellation){
  using var deadline=CancellationTokenSource.CreateLinkedTokenSource(cancellation);deadline.CancelAfter(operation.TimeoutMs);OwnedPipeObservation? owned=null;int connections=0;
  try{
   using var handler=new SocketsHttpHandler{
    AllowAutoRedirect=false,UseProxy=false,UseCookies=false,Credentials=null,MaxResponseHeadersLength=16,MaxConnectionsPerServer=1,
    ConnectCallback=async(_,token)=>{
     if(Interlocked.Increment(ref connections)!=1)throw new WorkspaceException("protocol_invalid"); // Transport retry refused before a second pipe is opened; not observed identity drift.
     owned=await connector.ConnectAsync(token);owned.ValidatePeer();var p=owned.Peer;var expected=HostProfile.Targets.Single(t=>t.Id=="backend");
     if(p.ProcessId<=0||!ProbeSpecification.Hash(p.ProcessIdentityHash)||p.ImageHash!=expected.PinnedSha256||p.UserSid!=WindowsIdentity.GetCurrent().User!.Value||
        !string.Equals(NativeFileEvidence.CanonicalInput(p.ImagePath),NativeFileEvidence.CanonicalInput(expected.Path),StringComparison.OrdinalIgnoreCase)||
        (peer!=null&&(peer.ProcessIdentityHash!=p.ProcessIdentityHash||peer.ImageHash!=p.ImageHash)))throw new WorkspaceException("peer_changed");
     peer??=p;return new BorrowedPipeStream(owned.Stream);
    }
   };
   using var client=new HttpClient(handler){Timeout=Timeout.InfiniteTimeSpan};
   using var request=new HttpRequestMessage(operation.Method,new Uri("http://docker"+operation.Route)){Version=HttpVersion.Version11,VersionPolicy=HttpVersionPolicy.RequestVersionExact};
   request.Headers.ConnectionClose=true;if(operation.Content!=null){request.Content=new ByteArrayContent(operation.Content);request.Content.Headers.ContentType=new(operation.ContentType!);}
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
