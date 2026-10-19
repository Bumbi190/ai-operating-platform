using System.Buffers.Binary;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Omnira.CodeBroker.Host;
namespace Omnira.CodeBroker.Workspace.Smoke;
internal sealed class MaterializationDocker:IDockerPeerConnector {
 internal readonly MaterializationIdentity Identity;
 internal JsonObject? Volume,Container;
 internal int VolumeCreates,ContainerCreates,Uploads,Starts,ContainerDeletes,VolumeDeletes,Connections,WrongPeerBytes;
 internal readonly List<string> Requests=new();
 internal string Fault="";internal bool Changed,LogsServed,SlowPending;internal string? UploadedManifest;
 internal MaterializationDocker(MaterializationIdentity i){Identity=i;}
 public async Task<OwnedPipeObservation> ConnectAsync(CancellationToken token){
  if(SlowPending){SlowPending=false;await Task.Delay(3000,token);}
  Connections++;bool wrong=Fault=="wrong-peer";var expected=HostProfile.Targets.Single(t=>t.Id=="backend");
  var peer=new PeerEvidence(17,new string('b',64),wrong?"C:/wrong/backend.exe":expected.Path,expected.PinnedSha256!,WindowsIdentity.GetCurrent().User!.Value);
  return new Observation(new Duplex(Reply,n=>{if(wrong)WrongPeerBytes+=n;}),peer);
 }
 sealed class Observation:OwnedPipeObservation{internal Observation(Stream s,PeerEvidence p):base(s,p){}public override void ValidatePeer(){}public override void Dispose()=>Stream.Dispose();}
 byte[] Reply(byte[] request){
  var headEnd=request.AsSpan().IndexOf("\r\n\r\n"u8);var header=Encoding.ASCII.GetString(request,0,headEnd);var line=header.Split("\r\n")[0];Requests.Add(line);var args=line.Split(' ');var method=args[0];var route=args[1];var body=request[(headEnd+4)..];
  if(route=="/version")return Http(200,new{Os="linux",ApiVersion="1.56",MinAPIVersion="1.44"});
  if(route.EndsWith("/info"))return Http(200,new{OSType="linux",OperatingSystem="Docker Desktop",Name="docker-desktop",KernelVersion="6.6.87.2-microsoft-standard-WSL2",ID=Changed?"changed-daemon":"fixture-daemon",SwapLimit=true});
  if(route.Contains("/images/")){
   var p=Identity.Profile;return Http(200,new{Id=p.ImageId,Os="linux",Architecture="amd64",Config=new{User="10001:10001",WorkingDir="/workspace/repo",Entrypoint=new[]{"/usr/local/bin/node","/opt/omnira/fixture-runner.mjs"},Cmd=Array.Empty<string>(),Env=p.ImageEnvironment,Labels=new Dictionary<string,string>{{"omnira.sdf.node.version","1"},{"omnira.sdf.node.lock",ToolchainProfile.LockSha256},{"omnira.sdf.node.recipe",p.RecipeSha256},{"omnira.sdf.node.runner",p.RunnerSha256}}}});
  }
  if(method=="POST"&&route=="/v1.51/volumes/create"){VolumeCreates++;Volume=MaterializationSmoke.Volume(Identity);if(Fault=="unattempted-container"){Container=MaterializationSmoke.Container(Identity);return Array.Empty<byte>();}if(Fault=="foreign-volume")Volume["Labels"]!["omnira.sdf.materialization.bindingHash"]=new string('f',64);if(Fault=="nonlocal-volume")Volume["Driver"]="foreign";if(Fault=="volume-options")Volume["Options"]=new JsonObject{{"device","/"}};return Fault=="lost-volume-create"?Array.Empty<byte>():Http(201,Volume);}
  if(route.StartsWith("/v1.51/volumes/")){
   if(method=="GET"){if(Changed)return Http(404,new{message="absent on replacement daemon"});
    if(Fault=="early-daemon-drift"&&Volume==null){Changed=true;return Http(404,new{message="missing"});}
    return Volume==null?Http(404,new{message="missing"}):Http(200,Volume);
   }
   if(method=="DELETE"){VolumeDeletes++;if(Changed)throw new Exception("delete on changed daemon");if(Fault=="volume-in-use"||Container!=null)return Http(409,new{message="in use"});Volume=null;return Fault=="lost-volume-delete"?Array.Empty<byte>():Http(204,null);}
  }
  if(method=="POST"&&route.StartsWith("/v1.51/containers/create")){
   ContainerCreates++;Container=MaterializationSmoke.Container(Identity);
   if(Fault=="foreign-container")Container["Config"]!["Labels"]!["omnira.sdf.materialization.bindingHash"]=new string('f',64);
   return Fault=="lost-container-create"?Array.Empty<byte>():Http(201,new{Id=new string('d',64),Warnings=Array.Empty<string>()});
  }
  if(route.Contains("/containers/")){
   if(method=="GET"&&route.EndsWith("/json")){if(Changed)return Http(404,new{message="absent on replacement daemon"});
    if(Fault=="late-daemon-drift"&&LogsServed&&Container==null){Changed=true;return Http(404,new{message="missing on changed daemon"});}
    if(Container==null)return Http(404,new{message="missing"});
    var copy=Container.DeepClone().AsObject();if(Fault=="weak-mount")copy["Mounts"]![0]!["Source"]="/foreign";return Http(200,copy);
   }
   if(method=="DELETE"){ContainerDeletes++;if(Changed)throw new Exception("delete on changed daemon");if(Fault=="lost-delete-drift"){Changed=true;return Array.Empty<byte>();}Container=null;return Fault=="lost-container-delete"?Array.Empty<byte>():Http(204,null);}
   if(method=="PUT"&&route.Contains("/archive?")){
    Uploads++;using(var reader=new System.Formats.Tar.TarReader(new MemoryStream(body))){System.Formats.Tar.TarEntry? e;while((e=reader.GetNextEntry())!=null)if(e.Name==".omnira-source-manifest.json"){using var b=new MemoryStream();e.DataStream!.CopyTo(b);UploadedManifest=SourceSnapshot.Hex(System.Security.Cryptography.SHA256.HashData(b.ToArray()));}}
    if(Fault=="slow-archive")SlowPending=true;return Fault=="lost-archive"?Array.Empty<byte>():Http(200,null);
   }
   if(method=="POST"&&route.EndsWith("/start")){Starts++;Container!["State"]=new JsonObject{{"Running",false},{"Status","exited"},{"ExitCode",0},{"OOMKilled",false}};return Fault=="lost-start"?Array.Empty<byte>():Http(204,null);}
   if(route.Contains("/wait?"))return Http(200,new{StatusCode=0,Error=(object?)null});
   if(route.Contains("/logs?")){
    LogsServed=true;var empty=SourceSnapshot.Hex(System.Security.Cryptography.SHA256.HashData(Array.Empty<byte>()));
    var result=new{schema="sdf.node_fixture_result.v1",uid=10001,gid=10001,nodeVersion="22.23.3",typeScriptVersion="5.9.3",vitestVersion="2.1.9",totalTests=Fault=="zero-tests"?0:1,passedTests=Fault=="zero-tests"?0:1,failedTests=0,skippedTests=0,exitCode=0,durationMs=10,sourceManifestSha256=UploadedManifest,beforeAfterSourceEqual=true,stdoutSha256=empty,stderrSha256=empty,redactedStdout="",redactedStderr=""};
    var bytes=JsonSerializer.SerializeToUtf8Bytes(result);var frame=new byte[bytes.Length+9];frame[0]=1;BinaryPrimitives.WriteUInt32BigEndian(frame.AsSpan(4),(uint)bytes.Length+1);bytes.CopyTo(frame,8);frame[^1]=(byte)'\n';return HttpBytes(200,frame);
   }
  }
  throw new Exception("unexpected request "+line);
 }
 static byte[] Http(int code,object? body)=>HttpBytes(code,body==null?Array.Empty<byte>():JsonSerializer.SerializeToUtf8Bytes(body));
 static byte[] HttpBytes(int code,byte[] bytes)=>Encoding.ASCII.GetBytes("HTTP/1.1 "+code+" Fixture\r\nConnection: close\r\nContent-Length: "+bytes.Length+"\r\n\r\n").Concat(bytes).ToArray();
 sealed class Duplex:Stream{
  readonly MemoryStream sent=new();MemoryStream? reply;readonly Func<byte[],byte[]> create;readonly Action<int> written;
  internal Duplex(Func<byte[],byte[]> create,Action<int> written){this.create=create;this.written=written;}
  public override bool CanRead=>true;public override bool CanWrite=>true;public override bool CanSeek=>false;public override long Length=>throw new NotSupportedException();public override long Position{get=>throw new NotSupportedException();set=>throw new NotSupportedException();}
  public override void Flush(){}public override Task FlushAsync(CancellationToken c)=>Task.CompletedTask;
  public override void Write(byte[] b,int o,int n){sent.Write(b,o,n);written(n);}public override ValueTask WriteAsync(ReadOnlyMemory<byte> b,CancellationToken c=default){sent.Write(b.Span);written(b.Length);return ValueTask.CompletedTask;}
  public override int Read(byte[] b,int o,int n){reply??=new(create(sent.ToArray()));return reply.Read(b,o,n);}public override ValueTask<int> ReadAsync(Memory<byte> b,CancellationToken c=default){c.ThrowIfCancellationRequested();reply??=new(create(sent.ToArray()));return ValueTask.FromResult(reply.Read(b.Span));}
  public override long Seek(long o,SeekOrigin s)=>throw new NotSupportedException();public override void SetLength(long n)=>throw new NotSupportedException();protected override void Dispose(bool d){if(d){sent.Dispose();reply?.Dispose();}base.Dispose(d);}
 }
}
