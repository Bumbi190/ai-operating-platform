using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace Omnira.CodeBroker.Host;

public sealed record DockerEvidence(string BackendImageHash,string BackendIdentityHash,string OsType,string OperatingSystem,string KernelVersion,string Name,string DaemonIdentityHash);
public sealed class DockerObservation {
    readonly IDockerPeerConnector connector;
    public DockerObservation():this(new NativeDockerPeerConnector()){}
    public DockerObservation(IDockerPeerConnector connector){this.connector=connector;}
    public async Task<DockerEvidence> ObserveAsync(CancellationToken cancellation) {
        var version=await ReadAsync("/version",null,cancellation);
        using(version.Document) {
            if(Field(version.Document.RootElement,"Os")!="linux")throw new HostCheckException("docker_metadata_invalid");
            var info=await ReadAsync("/info",version.Peer,cancellation);
            using(info.Document) {
                var root=info.Document.RootElement;
                var os=Field(root,"OSType");var provider=Field(root,"OperatingSystem");
                var name=Field(root,"Name");var kernel=Field(root,"KernelVersion");var id=Field(root,"ID");
                if(os!="linux"||provider!="Docker Desktop"||name!="docker-desktop"||
                   !Regex.IsMatch(kernel,@"^[0-9][0-9A-Za-z._+-]{0,180}microsoft-standard-WSL2$",RegexOptions.CultureInvariant))
                    throw new HostCheckException("docker_metadata_invalid");
                return new(info.Peer.ImageHash,info.Peer.ProcessIdentityHash,os,provider,kernel,name,NativeFileEvidence.Hash($"docker-v1:{id}:{os}:{provider}:{name}:{kernel}"));
            }
        }
    }
    static string Field(JsonElement root,string key) {
        if(root.ValueKind!=JsonValueKind.Object||!root.TryGetProperty(key,out var value)||value.ValueKind!=JsonValueKind.String)
            throw new HostCheckException("docker_metadata_invalid");
        var text=value.GetString()!;
        if(text.Length==0||text.Length>256||text.Any(char.IsControl))throw new HostCheckException("docker_metadata_invalid");
        return text;
    }
    async Task<(JsonDocument Document,PeerEvidence Peer)> ReadAsync(string route,PeerEvidence? prior,CancellationToken cancellation) {
        using var deadline=CancellationTokenSource.CreateLinkedTokenSource(cancellation);deadline.CancelAfter(5000);
        OwnedPipeObservation? owned=null;int connects=0;
        try {
            using var handler=new SocketsHttpHandler {
                AllowAutoRedirect=false,UseProxy=false,UseCookies=false,Credentials=null,
                MaxResponseHeadersLength=16,MaxConnectionsPerServer=1,
                ConnectCallback=async (_,token)=>{
                    if(Interlocked.Increment(ref connects)!=1)throw new HostCheckException("peer_changed");
                    owned=await connector.ConnectAsync(token);
                    owned.ValidatePeer();
                    if(prior!=null&&(prior.ProcessIdentityHash!=owned.Peer.ProcessIdentityHash||prior.ImageHash!=owned.Peer.ImageHash))
                        throw new HostCheckException("peer_changed");
                    return new BorrowedPipeStream(owned.Stream);
                }
            };
            using var client=new HttpClient(handler){Timeout=Timeout.InfiniteTimeSpan};
            using var request=new HttpRequestMessage(HttpMethod.Get,new Uri("http://docker"+route)){Version=HttpVersion.Version11,VersionPolicy=HttpVersionPolicy.RequestVersionExact};
            request.Headers.ConnectionClose=true;
            using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,deadline.Token);
            if(response.StatusCode!=HttpStatusCode.OK)throw new HostCheckException("docker_unavailable");
            if(response.Content.Headers.ContentLength>131072)throw new HostCheckException("response_too_large");
            using var stream=await response.Content.ReadAsStreamAsync(deadline.Token);
            using var body=new MemoryStream();var buffer=new byte[8192];
            while(true) {
                int read=await stream.ReadAsync(buffer,deadline.Token);if(read==0)break;
                if(body.Length+read>131072)throw new HostCheckException("response_too_large");
                body.Write(buffer,0,read);
            }
            if(owned==null)throw new HostCheckException("peer_unproven");
            owned.ValidatePeer();
            var doc=JsonDocument.Parse(body.ToArray(),new JsonDocumentOptions{MaxDepth=16});
            if(doc.RootElement.ValueKind!=JsonValueKind.Object||doc.RootElement.EnumerateObject().GroupBy(p=>p.Name,StringComparer.Ordinal).Any(g=>g.Count()!=1)) {
                doc.Dispose();throw new HostCheckException("docker_metadata_invalid");
            }
            return(doc,owned.Peer);
        } catch(HostCheckException){throw;}
        catch(OperationCanceledException){throw new HostCheckException("deadline_exceeded");}
        catch(JsonException){throw new HostCheckException("docker_metadata_invalid");}
        catch(HttpRequestException e) when(e.InnerException is HostCheckException host){throw host;}
        catch{throw new HostCheckException("docker_unavailable");}
        finally{owned?.Dispose();}
    }
}
