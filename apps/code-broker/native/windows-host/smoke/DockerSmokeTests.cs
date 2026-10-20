using System.IO.Pipes;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using Omnira.CodeBroker.Host;
namespace Omnira.CodeBroker.Host.Smoke;
public static class DockerSmokeTests {
    public static async Task Run(Action<string,bool> check) {
        string hash=new('a',64);
        var peer=new PeerEvidence(1,hash,HostProfile.Targets.Single(t=>t.Id=="backend").Path,hash,WindowsIdentity.GetCurrent().User!.Value);
        string version="{\"Os\":\"linux\"}";
        string info="{\"OSType\":\"linux\",\"OperatingSystem\":\"Docker Desktop\",\"Name\":\"docker-desktop\",\"KernelVersion\":\"6.18.0-microsoft-standard-WSL2\",\"ID\":\"fixture-daemon\"}";
        string Response(string body,int status=200)=>$"HTTP/1.1 {status} Fixture\r\nContent-Type: application/json\r\nContent-Length: {Encoding.UTF8.GetByteCount(body)}\r\nConnection: close\r\n\r\n{body}";
        async Task Refuse(string name,FakeConnector connector,string reason) {
            bool refused=false;try{await new DockerObservation(connector).ObserveAsync(CancellationToken.None);}catch(HostCheckException e){refused=e.Reason==reason;}
            check(name,refused);
        }
        var good=new FakeConnector(peer,Response(version),Response(info));
        var observed=await new DockerObservation(good).ObserveAsync(CancellationToken.None);
        check("docker_valid_metadata",observed.OsType=="linux"&&observed.DaemonIdentityHash.Length==64);
        check("docker_only_fixed_get_requests",good.Streams.Count==2&&good.Streams[0].Written.StartsWith("GET /version HTTP/1.1\r\n")&&good.Streams[1].Written.StartsWith("GET /info HTTP/1.1\r\n"));
        await Refuse("docker_non_linux_refused",new(peer,Response("{\"Os\":\"windows\"}"),Response(info)),"docker_metadata_invalid");
        await Refuse("docker_wrong_provider_refused",new(peer,Response(version),Response(info.Replace("Docker Desktop","Other"))),"docker_metadata_invalid");
        await Refuse("docker_redirect_refused",new(peer,Response("",302)),"docker_unavailable");
        await Refuse("docker_oversize_refused",new(peer,Response(new string('x',131073))),"response_too_large");
        var stale=new FakeConnector(peer,Response(version)){PeerFailure="peer_changed"};
        await Refuse("docker_stale_peer_refused",stale,"peer_changed");
        check("docker_no_http_on_stale_peer",stale.Streams.All(s=>s.Written.Length==0));
        var changed=new FakeConnector(peer,Response(version),Response(info)){ChangeSecondPeer=true};
        await Refuse("docker_changed_peer_refused",changed,"peer_changed");
        await Refuse("docker_changed_image_refused",new FakeConnector(peer,Response(version),Response(info)){ChangeSecondImage=true},"peer_changed");
        var timeout=new FakeConnector(peer,""){Stall=true};
        await Refuse("docker_deadline_exercised",timeout,"deadline_exceeded");
        var pipeName="omnira-host-fixture-"+Guid.NewGuid().ToString("N");
        using var server=new NamedPipeServerStream(pipeName,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous);
        using var client=new NamedPipeClientStream(".",pipeName,PipeDirection.InOut,PipeOptions.Asynchronous,TokenImpersonationLevel.Anonymous);
        var accept=server.WaitForConnectionAsync();
        await client.ConnectAsync(1500);await accept;
        bool wrong=false;try{using var unused=NativePipeEvidence.Read(client);}catch(HostCheckException e){wrong=e.Reason=="peer_unproven";}
        check("native_wrong_pipe_server_refused",wrong);
        using var deadline=new CancellationTokenSource(150);
        var data=new byte[1];bool zero=false;
        try{zero=await server.ReadAsync(data,deadline.Token)==0;}catch(OperationCanceledException){zero=true;}
        check("native_wrong_peer_receives_zero_http",zero);
        var real=await new DockerObservation().ObserveAsync(CancellationToken.None);
        check("real_docker_verified_peer",real.OsType=="linux"&&real.OperatingSystem=="Docker Desktop"&&real.BackendIdentityHash.Length==64);
    }
    sealed class FakeConnector:IDockerPeerConnector {
        readonly PeerEvidence peer;readonly Queue<string> responses;
        public readonly List<FixtureStream> Streams=new();
        public string? PeerFailure;public bool ChangeSecondPeer,ChangeSecondImage,Stall;
        public FakeConnector(PeerEvidence peer,params string[] responses){this.peer=peer;this.responses=new(responses);}
        public Task<OwnedPipeObservation> ConnectAsync(CancellationToken cancellation) {
            if(responses.Count==0)throw new HostCheckException("peer_changed");
            var stream=new FixtureStream(responses.Dequeue(),Stall);Streams.Add(stream);
            return Task.FromResult<OwnedPipeObservation>(new FakeOwned(stream,ChangeSecondPeer&&Streams.Count==2?peer with{ProcessIdentityHash=new string('b',64)}:ChangeSecondImage&&Streams.Count==2?peer with{ImageHash=new string('c',64)}:peer,PeerFailure));
        }
    }
    sealed class FakeOwned:OwnedPipeObservation {
        readonly string? failure;
        public FakeOwned(Stream stream,PeerEvidence peer,string? failure):base(stream,peer){this.failure=failure;}
        public override void ValidatePeer(){if(failure!=null)throw new HostCheckException(failure);}
        public override void Dispose()=>Stream.Dispose();
    }
    public sealed class FixtureStream:Stream {
        readonly MemoryStream response;readonly MemoryStream written=new();readonly bool stall;
        public FixtureStream(string text,bool stall){response=new(Encoding.UTF8.GetBytes(text));this.stall=stall;}
        public string Written=>Encoding.ASCII.GetString(written.ToArray());
        public override bool CanRead=>true;public override bool CanWrite=>true;public override bool CanSeek=>false;
        public override long Length=>throw new NotSupportedException();public override long Position{get=>throw new NotSupportedException();set=>throw new NotSupportedException();}
        public override void Flush(){} public override Task FlushAsync(CancellationToken c)=>Task.CompletedTask;
        public override int Read(byte[] b,int o,int n)=>response.Read(b,o,n);
        public override async ValueTask<int> ReadAsync(Memory<byte> b,CancellationToken c=default){if(stall)await Task.Delay(Timeout.Infinite,c);return await response.ReadAsync(b,c);}
        public override void Write(byte[] b,int o,int n)=>written.Write(b,o,n);
        public override ValueTask WriteAsync(ReadOnlyMemory<byte> b,CancellationToken c=default)=>written.WriteAsync(b,c);
        public override long Seek(long o,SeekOrigin s)=>throw new NotSupportedException();
        public override void SetLength(long n)=>throw new NotSupportedException();
    }
}
