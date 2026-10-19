using System.Buffers.Binary;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Omnira.CodeBroker.Host;
using Omnira.CodeBroker.Workspace;
namespace Omnira.CodeBroker.Workspace.Smoke;
internal sealed class FakeDocker:IDockerPeerConnector {
 internal bool WrongPeer,ChangePeer,MissingImage,WeakInspect,ForeignContainer,LostCreate,LostDelete,FailDelete,ChunkedLogs,MalformedLogs,DaemonDrift;
 internal int DelayMs;
 internal int Creates,Starts,Deletes,Connections,WrongPeerBytes;internal JsonObject? Container;internal readonly List<string> Requests=new();
 internal string Id=new('d',64),Image="sha256:"+new string('a',64);internal Guid Attempt;
 public async Task<OwnedPipeObservation> ConnectAsync(CancellationToken cancellation){
  if(DelayMs>0)await Task.Delay(DelayMs,cancellation);
  int sequence=Interlocked.Increment(ref Connections);bool changed=ChangePeer&&sequence>=5;
  var peer=new PeerEvidence(17,new string(changed?'c':'b',64),WrongPeer?"C:/wrong/backend.exe":HostProfile.Targets.Single(t=>t.Id=="backend").Path,HostProfile.Targets.Single(t=>t.Id=="backend").PinnedSha256!,WindowsIdentity.GetCurrent().User!.Value);
  var stream=new Duplex(request=>Reply(request),count=>{if(WrongPeer||changed)Interlocked.Add(ref WrongPeerBytes,count);});
  return new Owned(stream,peer);
 }
 sealed class Owned:OwnedPipeObservation{public Owned(Stream stream,PeerEvidence peer):base(stream,peer){}public override void ValidatePeer(){}public override void Dispose()=>Stream.Dispose();}
 byte[] Reply(string request){
  var line=request.Split("\r\n")[0];Requests.Add(line);var parts=line.Split(' ');var method=parts[0];var path=parts[1];var body=request[(request.IndexOf("\r\n\r\n",StringComparison.Ordinal)+4)..];
  if(path=="/version")return Http(200,new{Os="linux",ApiVersion="1.56",MinAPIVersion="1.44"});
  if(path.EndsWith("/info"))return Http(200,new{OSType="linux",OperatingSystem="Docker Desktop",Name="docker-desktop",KernelVersion="6.6.87.2-microsoft-standard-WSL2",ID=DaemonDrift&&Requests.Count>=4?"other":"fixture-daemon",SwapLimit=true});
  if(path.Contains("/images/"))return MissingImage?Http(404,new{message="missing"}):Http(200,new{Id=Image,RepoDigests=new[]{"alpine@"+WindowsSandboxProbe.ImageDigest},Os="linux",Architecture="amd64"});
  if(method=="POST"&&path.Contains("/containers/create")){
   Creates++;Container=MakeContainer(JsonNode.Parse(body)!.AsObject());
   if(ForeignContainer){Container["Config"]!["Labels"]!["omnira.sdf.windows.attempt"]=Guid.NewGuid().ToString();return Http(409,new{message="conflict"});}
   if(LostCreate)return Array.Empty<byte>();return Http(201,new{Id,Warnings=Array.Empty<string>()});
  }
  if(method=="DELETE"){Deletes++;if(FailDelete)return Http(500,new{message="fixture failure"});Container=null;return LostDelete?Array.Empty<byte>():Http(204,null);}
  if(Container==null)return Http(404,new{message="not found"});
  if(path.EndsWith("/json")){var inspect=Container.DeepClone().AsObject();if(WeakInspect)inspect["HostConfig"]!["NetworkMode"]="bridge";return Http(200,inspect);}
  if(path.EndsWith("/start")){Starts++;Container["State"]=new JsonObject{{"Running",false},{"Status","exited"},{"ExitCode",0}};return Http(204,null);}
  if(path.Contains("/wait?"))return Http(200,new{StatusCode=0,Error=(object?)null});
  if(path.Contains("/logs?")){
   var text=Encoding.UTF8.GetBytes("uid=10001 gid=10001 groups=10001\n");var frame=new byte[text.Length+8];frame[0]=1;BinaryPrimitives.WriteUInt32BigEndian(frame.AsSpan(4),checked((uint)text.Length));text.CopyTo(frame,8);if(MalformedLogs)frame[1]=1;
   return HttpBytes(200,frame,ChunkedLogs);
  }
  throw new Exception("unexpected fake request "+line);
 }
 JsonObject MakeContainer(JsonObject request){
  var config=request.DeepClone().AsObject();config.Remove("HostConfig");config["Env"]=new JsonArray("PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin","HOME=/tmp","LANG=C.UTF-8");
  return new JsonObject{{"Id",Id},{"Name","/omnira-sdf-win-probe-"+Attempt.ToString("N")},{"Image",Image},{"Config",config},{"HostConfig",request["HostConfig"]!.DeepClone()},{"Mounts",new JsonArray()},{"State",new JsonObject{{"Running",false},{"Status","created"},{"ExitCode",0}}}};
 }
 static byte[] Http(int status,object? body)=>HttpBytes(status,body==null?Array.Empty<byte>():JsonSerializer.SerializeToUtf8Bytes(body),false);
 static byte[] HttpBytes(int status,byte[] body,bool chunked){
  var head=Encoding.ASCII.GetBytes("HTTP/1.1 "+status+" Fixture\r\nConnection: close\r\n"+(chunked?"Transfer-Encoding: chunked\r\n":"Content-Length: "+body.Length+"\r\n")+"\r\n");
  if(!chunked)return head.Concat(body).ToArray();
  return head.Concat(Encoding.ASCII.GetBytes(body.Length.ToString("x")+"\r\n")).Concat(body).Concat(Encoding.ASCII.GetBytes("\r\n0\r\n\r\n")).ToArray();
 }
 sealed class Duplex:Stream{
  readonly MemoryStream sent=new();MemoryStream? reply;readonly Func<string,byte[]> create;readonly Action<int> written;
  internal Duplex(Func<string,byte[]> create,Action<int> written){this.create=create;this.written=written;}
  public override bool CanRead=>true;public override bool CanWrite=>true;public override bool CanSeek=>false;public override long Length=>throw new NotSupportedException();public override long Position{get=>throw new NotSupportedException();set=>throw new NotSupportedException();}
  public override void Flush(){}public override Task FlushAsync(CancellationToken c)=>Task.CompletedTask;
  public override void Write(byte[] b,int o,int n){sent.Write(b,o,n);written(n);}
  public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer,CancellationToken c=default){sent.Write(buffer.Span);written(buffer.Length);return ValueTask.CompletedTask;}
  public override int Read(byte[] b,int o,int n){reply??=new(create(Encoding.UTF8.GetString(sent.ToArray())));return reply.Read(b,o,n);}
  public override ValueTask<int> ReadAsync(Memory<byte> b,CancellationToken c=default){c.ThrowIfCancellationRequested();reply??=new(create(Encoding.UTF8.GetString(sent.ToArray())));return ValueTask.FromResult(reply.Read(b.Span));}
  public override long Seek(long o,SeekOrigin s)=>throw new NotSupportedException();public override void SetLength(long n)=>throw new NotSupportedException();
  protected override void Dispose(bool disposing){if(disposing){sent.Dispose();reply?.Dispose();}base.Dispose(disposing);}
 }
}
internal static class ProbeSmoke {
 sealed class PassHost:IHostPreflight{public Task<bool> IsQualifiedAsync(CancellationToken cancellation)=>Task.FromResult(true);}
 internal static WindowsSandboxProbe Engine(FakeDocker fake)=>new(fake,new PassHost());
 public static async Task Run(Action<string,bool> check){
  foreach(var mode in new[]{"normal","wrong","changed","missing","weak","lost-create","foreign","lost-delete","delete-fails","chunked","bad-logs","daemon-drift"}){
   var fake=new FakeDocker{Attempt=Guid.NewGuid(),WrongPeer=mode=="wrong",ChangePeer=mode=="changed",MissingImage=mode=="missing",WeakInspect=mode=="weak",LostCreate=mode=="lost-create",ForeignContainer=mode=="foreign",LostDelete=mode=="lost-delete",FailDelete=mode=="delete-fails",ChunkedLogs=mode=="chunked",MalformedLogs=mode=="bad-logs",DaemonDrift=mode=="daemon-drift"};
   var result=await Engine(fake).RunAsync(fake.Attempt,CancellationToken.None);
   if(mode is "normal" or "chunked" or "lost-delete")check(mode=="chunked"?"bounded_chunked_multiplex_logs":mode=="lost-delete"?"lost_delete_reply_verified_absent":"fixed_probe_all_protections",result.Status=="ok"&&result.Uid==10001&&result.Gid==10001&&result.ContainerRemoved&&fake.Creates==1&&fake.Starts==1&&fake.Deletes==1);
   else if(mode=="wrong")check("wrong_peer_receives_zero_http",result.Status!="ok"&&fake.WrongPeerBytes==0&&fake.Requests.Count==0);
   else if(mode=="changed")check("changed_peer_before_mutation_refused",result.Status!="ok"&&fake.Creates==0&&fake.WrongPeerBytes==0);
   else if(mode=="missing")check("absent_image_no_create",result.Reason=="image_missing"&&fake.Creates==0);
   else if(mode=="weak")check("invalid_inspect_never_started",result.Status!="ok"&&fake.Starts==0);
   else if(mode=="lost-create")check("lost_create_reply_owned_cleanup",result.Status!="ok"&&result.ContainerRemoved&&fake.Creates==1&&fake.Deletes==1);
   else if(mode=="foreign")check("foreign_same_name_never_removed",result.Status!="ok"&&fake.Deletes==0&&fake.Container!=null);
   else if(mode=="delete-fails")check("cleanup_failure_not_ok",result.Status=="failed"&&!result.ContainerRemoved&&result.Reason=="cleanup_retained"&&fake.Deletes==1);
   else if(mode=="bad-logs")check("malformed_multiplex_logs_refused",result.Status!="ok"&&result.ContainerRemoved);
   else if(mode=="daemon-drift")check("daemon_drift_refuses_mutation",result.Status!="ok"&&fake.Creates==0);
   check("mutation_never_retried_"+mode,fake.Creates<=1&&fake.Deletes<=1);
  }
  var absent=new FakeDocker{Attempt=Guid.NewGuid()};var cleanup=await Engine(absent).CleanupAsync(absent.Attempt,CancellationToken.None);
  check("cleanup_success_is_not_probe_success",cleanup.Status=="cleaned"&&cleanup.ContainerRemoved&&cleanup.Uid==null&&cleanup.Gid==null&&cleanup.Inspected.Length==0&&absent.Creates==0&&absent.Starts==0);
  var blocked=new FakeDocker{Attempt=Guid.NewGuid()};var blockedResult=await new WindowsSandboxProbe(blocked,new BlockedHost()).RunAsync(blocked.Attempt,CancellationToken.None);
  check("blocked_host_has_zero_http_mutations",blockedResult.Status=="blocked"&&blockedResult.Reason=="host_unqualified"&&blocked.Requests.Count==0&&blocked.Creates==0&&blocked.Starts==0);
  var slow=new FakeDocker{Attempt=Guid.NewGuid(),DelayMs=2000};var clock=System.Diagnostics.Stopwatch.StartNew();
  var timed=await Engine(slow).RunAsync(slow.Attempt,CancellationToken.None);clock.Stop();
  check("overall_probe_deadline_includes_cleanup",clock.ElapsedMilliseconds<31000&&timed.Status!="ok");
  await EntryCheck(check);
 }

 static async Task EntryCheck(Action<string,bool> check){
  var helper=Path.Combine(Environment.CurrentDirectory,"apps/code-broker/native/windows-workspace/bin/Release/net8.0-windows/OmniraBrokerWorkspace.dll");
  var start=new System.Diagnostics.ProcessStartInfo(HostProfile.Targets.Single(t=>t.Id=="dotnet").Path){UseShellExecute=false,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
  start.ArgumentList.Add(helper);start.ArgumentList.Add("cleanup-probe");using var process=System.Diagnostics.Process.Start(start)!;
  await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new{schema="sdf.windows_probe_request.v1",attemptId=Guid.NewGuid().ToString()}));process.StandardInput.Close();
  var output=await process.StandardOutput.ReadToEndAsync();var error=await process.StandardError.ReadToEndAsync();await process.WaitForExitAsync();
  check("actual_cleanup_entry_returns_closed_report",process.ExitCode==0&&error=="");
  using var doc=JsonDocument.Parse(output);var r=doc.RootElement;
  check("actual_cleanup_of_absent_attempt_has_no_probe_claim",r.GetProperty("status").GetString()=="cleaned"&&r.GetProperty("containerRemoved").GetBoolean()&&r.GetProperty("uid").ValueKind==JsonValueKind.Null&&!r.GetProperty("productionAuthority").GetBoolean());
 }

 internal static void DumpSpec()=>Console.WriteLine(JsonSerializer.Serialize(ProbeSpecification.Create(Guid.Parse("33333333-3333-4333-8333-333333333333"),"sha256:"+new string('d',64))));
 internal static async Task CreateRealFixture(){
  using var input=WorkspaceJson.Document(await Console.In.ReadToEndAsync());WorkspaceJson.Keys(input.RootElement,"attemptId");
  var text=WorkspaceJson.String(input.RootElement,"attemptId");if(!WorkspaceJson.Uuid(text,true))throw new Exception("invalid fixture attempt");var attempt=Guid.Parse(text);
  using var deadline=new CancellationTokenSource(30000);
  if(!await new NativeHostPreflight().IsQualifiedAsync(deadline.Token))throw new Exception("real fixture host unqualified");
  var session=new DockerProbeSession(new NativeDockerPeerConnector());await session.InitializeAsync(deadline.Token);var image=await session.ImageAsync(deadline.Token);
  string? id=null;bool retain=false;
  try{
   id=await session.CreateAsync(attempt,image,deadline.Token);
   using var inspect=await session.InspectAsync(id,deadline.Token);if(inspect==null)throw new Exception("real fixture missing");
   var root=inspect.RootElement;ProbeSpecification.Verify(root,attempt,image,id,beforeStart:true);
   var config=root.GetProperty("Config");var host=root.GetProperty("HostConfig");
   var projected=new{
    attemptId=text,containerId=id,imageId=image,retained=true,
    config=new{user=config.GetProperty("User"),env=config.GetProperty("Env"),entrypoint=config.GetProperty("Entrypoint"),cmd=config.GetProperty("Cmd"),workingDir=config.GetProperty("WorkingDir"),tty=config.GetProperty("Tty")},
    host=new{network=host.GetProperty("NetworkMode"),readonlyRootfs=host.GetProperty("ReadonlyRootfs"),privileged=host.GetProperty("Privileged"),capDrop=host.GetProperty("CapDrop"),securityOpt=host.GetProperty("SecurityOpt"),pids=host.GetProperty("PidsLimit"),memory=host.GetProperty("Memory"),swap=host.GetProperty("MemorySwap"),cpus=host.GetProperty("NanoCpus"),tmpfs=host.GetProperty("Tmpfs")},
    mounts=root.GetProperty("Mounts"),state=root.GetProperty("State").GetProperty("Status"),productionAuthority=false
   };
   Console.WriteLine(JsonSerializer.Serialize(projected));retain=true;
  }finally{if(!retain&&id!=null)await new WindowsSandboxProbe().CleanupAsync(attempt,CancellationToken.None);}
 }
 sealed class BlockedHost:IHostPreflight{public Task<bool> IsQualifiedAsync(CancellationToken cancellation)=>Task.FromResult(false);}
}
