using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using Omnira.CodeBroker.Workspace;
namespace Omnira.CodeBroker.Workspace.Smoke;
/** Test-only always-continue control for engine-level smokes that predate the controlled transport. */
internal sealed class ContinueAll:IStopCheckpoint {
 internal static readonly ContinueAll Instance=new();
 public CancellationToken Stopped=>CancellationToken.None;public string? Reason=>null;
 public Task CheckpointAsync(string phase,CancellationToken token){token.ThrowIfCancellationRequested();return Task.CompletedTask;}
}
/** Captures child→parent lines and lets a scripted parent answer each one. */
internal sealed class LineSink:Stream {
 readonly MemoryStream line=new();readonly Action<byte[]> onLine;internal readonly List<string> Lines=new();internal long Total;
 internal LineSink(Action<byte[]> onLine){this.onLine=onLine;}
 public override bool CanRead=>false;public override bool CanWrite=>true;public override bool CanSeek=>false;public override long Length=>Total;public override long Position{get=>Total;set=>throw new NotSupportedException();}
 public override void Flush(){}public override int Read(byte[] b,int o,int n)=>throw new NotSupportedException();public override long Seek(long o,SeekOrigin s)=>throw new NotSupportedException();public override void SetLength(long n)=>throw new NotSupportedException();
 public override void Write(byte[] b,int o,int n){for(int i=o;i<o+n;i++){Total++;if(b[i]==(byte)'\n'){var bytes=line.ToArray();line.SetLength(0);lock(Lines)Lines.Add(Encoding.UTF8.GetString(bytes));onLine(bytes);}else line.WriteByte(b[i]);}}
}
internal static class ControlChannelSmoke {
 static readonly string[] Phases={"before_resources","before_volume_create","before_container_create","before_upload","before_start","before_report"};
 sealed class Parent:IDisposable {
  readonly AnonymousPipeServerStream server=new(PipeDirection.Out,HandleInheritability.None);internal readonly AnonymousPipeClientStream Client;readonly object gate=new();bool closed;
  internal Parent(){Client=new(PipeDirection.In,server.ClientSafePipeHandle);}
  internal void Send(byte[] bytes){lock(gate){if(closed)return;try{server.Write(bytes);server.Flush();}catch(IOException){}}}
  internal void Line(string text)=>Send(Encoding.UTF8.GetBytes(text+"\n"));
  internal void Close(){lock(gate){if(closed)return;closed=true;server.Dispose();}}
  public void Dispose(){Close();Client.Dispose();}
 }
 sealed record Outcome(MaterializationReport? Report,List<string> Lines,MaterializationDocker Fake,long ElapsedMs,string? RequestError);
 /** script(phase, seq, parent) answers one checkpoint; returning false means "send nothing". */
 static async Task<Outcome> Run(Func<string,int,Parent,MaterializationDocker,bool> script,string fault="",Func<CancellationToken,Task<SourceSnapshot>>? source=null,Action<Parent>? afterRequest=null,int replyMs=4000,byte[]? request=null,bool eofAfterRequest=false){
  var snapshot=await Snapshot();var profile=ToolchainSmoke.Fixture();var identity=new MaterializationIdentity(Guid.NewGuid(),snapshot.Binding,snapshot.ManifestSha256,profile);
  var fake=new MaterializationDocker(identity){Fault=fault};var engine=new WindowsMaterializationFixture(fake,new PassHost(),source??(_=>Task.FromResult(snapshot)),profile,new MemoryAttempts());
  using var parent=new Parent();NativeControlChannel? channel=null;
  var sink=new LineSink(bytes=>{
   try{using var doc=JsonDocument.Parse(bytes);var r=doc.RootElement;if(r.GetProperty("t").GetString()!="checkpoint")return;
    var phase=r.GetProperty("phase").GetString()!;var seq=r.GetProperty("seq").GetInt32();_=Task.Run(()=>{if(script(phase,seq,parent,fake))parent.Line("{\"t\":\"continue\",\"seq\":"+seq+"}");});}catch{}
  });
  var clock=System.Diagnostics.Stopwatch.StartNew();
  channel=new NativeControlChannel(parent.Client,sink,replyMs);
  // Send from another task: an oversized request can exceed the pipe buffer once the reader refuses it.
  var bytes=request??Encoding.UTF8.GetBytes(RequestJson(identity.Attempt)+"\n");_=Task.Run(()=>{parent.Send(bytes);if(eofAfterRequest)parent.Close();});
  string json;
  try{json=await channel.ReadRequestAsync(CancellationToken.None);}catch(WorkspaceException e){return new(null,sink.Lines,fake,clock.ElapsedMilliseconds,e.Reason);}
  afterRequest?.Invoke(parent);
  var parsed=MaterializationContracts.Parse(json,false);
  var report=await engine.RunAsync(parsed.Request,parsed.Attempt,channel,CancellationToken.None);
  channel.WriteReport(JsonSerializer.Serialize(report,new JsonSerializerOptions{PropertyNamingPolicy=JsonNamingPolicy.CamelCase}));
  return new(report,sink.Lines,fake,clock.ElapsedMilliseconds,null);
 }
 sealed class PassHost:IHostPreflight{public Task<bool> IsQualifiedAsync(CancellationToken t)=>Task.FromResult(true);}
 sealed class MemoryAttempts:IMaterializationAttemptJournal {
  internal MaterializationPeer? peer;
  public void BindPeer(WorkspaceRequest r,Guid a,MaterializationPeer p){peer=p;}
  public MaterializationPeer? ReadPeer(WorkspaceRequest r,Guid a)=>peer;
  public IDisposable Begin(WorkspaceRequest r,Guid a,bool cleanup)=>new Nothing();
  sealed class Nothing:IDisposable{public void Dispose(){}}
 }
 static string RequestJson(Guid attempt){var b=MaterializationSmoke.Binding;return JsonSerializer.Serialize(new{schema="sdf.windows_materialization_request.v1",workId=b.WorkId,repositoryId=b.RepositoryId,pinnedBaseSha=b.PinnedBaseSha,admissionHash=b.AdmissionHash,claimId=b.ClaimId,fence=1,attemptId=attempt.ToString()});}
 static async Task<SourceSnapshot> Snapshot(){
  var files=SourceFixturePolicy.Paths.ToDictionary(x=>x,x=>Encoding.UTF8.GetBytes("safe fixture\n"));
  foreach(var p in ToolchainProfile.DescriptorPins.Keys)files[p]=File.ReadAllBytes(Path.Combine(@"C:\Users\Andre\Projects\Omnira\.worktrees\c435e423-d964-428b-b5c0-4060d89ce3c6",p));
  string Oid(byte[] b)=>SourceSnapshot.Hex(System.Security.Cryptography.SHA1.HashData(Encoding.ASCII.GetBytes("blob "+b.Length+"\0").Concat(b).ToArray()));
  var tree=string.Join("",files.Select(p=>"100644 blob "+Oid(p.Value)+" "+p.Value.Length+"\t"+p.Key+"\0"));
  var b=MaterializationSmoke.Binding;var request=new WorkspaceRequest("sdf.windows_workspace_request.v1",b.WorkId,b.RepositoryId,b.PinnedBaseSha,b.AdmissionHash,b.ClaimId,1);
  return await SourceSnapshot.FromGitAsync(request,tree,(x,_)=>Task.FromResult(files[x.Path]),CancellationToken.None);
 }
 static List<string> Checkpoints(Outcome o)=>o.Lines.Where(l=>l.Contains("\"checkpoint\"")).Select(l=>JsonDocument.Parse(l).RootElement.GetProperty("phase").GetString()!).ToList();
 static bool Absent(Outcome o)=>o.Fake.Volume==null&&o.Fake.Container==null;
 static bool Stopped(Outcome o,string reason)=>o.Report!=null&&o.Report.Status=="stopped"&&o.Report.Reason==reason&&o.Report.Fixture==null&&o.Report.ContainerRemoved&&o.Report.VolumeRemoved&&Absent(o);
 static bool OneReportLast(Outcome o)=>o.Lines.Count>0&&o.Lines[^1].StartsWith("{\"t\":\"report\",")&&o.Lines.Count(l=>l.StartsWith("{\"t\":\"report\""))==1&&o.Lines.Where(l=>l.Contains("\"checkpoint\"")).All(l=>Encoding.UTF8.GetByteCount(l)<=256);
 internal static async Task Run(Action<string,bool> verify){
  // Optional local trace for diagnosing a hung case; it never changes results.
  var trace=Environment.GetEnvironmentVariable("SDF_SMOKE_TRACE")=="1";Action<string,bool> check=(n,v)=>{if(trace)Console.Error.WriteLine("checked "+n+" "+v);verify(n,v);};
  var normal=await Run((_,_,_,_)=>true);
  check("all_continue_verified",normal.Report!.Status=="verified_for_fixture"&&normal.Report.Fixture!=null&&Absent(normal)&&Checkpoints(normal).SequenceEqual(Phases)&&OneReportLast(normal));
  check("seq_strictly_increasing",normal.Lines.Where(l=>l.Contains("\"checkpoint\"")).Select(l=>JsonDocument.Parse(l).RootElement.GetProperty("seq").GetInt32()).SequenceEqual(new[]{1,2,3,4,5,6}));
  for(int i=0;i<Phases.Length;i++){
   var at=Phases[i];var o=await Run((phase,_,p,_)=>{if(phase==at){p.Line("{\"t\":\"stop\"}");return false;}return true;});
   check("stop_at_"+at,Stopped(o,"stop_requested")&&Checkpoints(o).SequenceEqual(Phases.Take(i+1))&&OneReportLast(o));
   var f=o.Fake;
   check("no_mutation_after_"+at,i switch{
    0=>f.VolumeCreates==0&&f.ContainerCreates==0&&f.Requests.All(r=>r.StartsWith("GET")),
    1=>f.VolumeCreates==0&&f.ContainerCreates==0,
    2=>f.VolumeCreates==1&&f.ContainerCreates==0&&f.VolumeDeletes==1,
    3=>f.ContainerCreates==1&&f.Uploads==0&&f.ContainerDeletes==1&&f.VolumeDeletes==1,
    4=>f.Uploads==1&&f.Starts==0&&f.ContainerDeletes==1,
    _=>f.Starts==1&&f.ContainerDeletes==1&&f.VolumeDeletes==1});
  }
  var eof=await Run((phase,_,p,_)=>{if(phase=="before_container_create"){p.Close();return false;}return true;});
  check("eof_is_stop",Stopped(eof,"stop_requested")&&eof.Fake.ContainerCreates==0&&eof.Fake.VolumeDeletes==1);
  var silent=await Run((phase,_,_,_)=>phase!="before_upload",replyMs:300);
  check("missed_continue_control_lost",Stopped(silent,"control_lost")&&silent.Fake.Uploads==0&&silent.ElapsedMs<3000);
  var malformed=new Dictionary<string,Func<int,byte[]>>{
   {"wrong_seq",s=>Encoding.UTF8.GetBytes("{\"t\":\"continue\",\"seq\":"+(s+1)+"}\n")},
   {"duplicate_key",s=>Encoding.UTF8.GetBytes("{\"t\":\"continue\",\"t\":\"continue\",\"seq\":"+s+"}\n")},
   {"extra_key",s=>Encoding.UTF8.GetBytes("{\"t\":\"continue\",\"seq\":"+s+",\"phase\":\"x\"}\n")},
   {"unknown_type",s=>Encoding.UTF8.GetBytes("{\"t\":\"resume\",\"seq\":"+s+"}\n")},
   {"invalid_utf8",s=>new byte[]{0x7b,0x22,0x74,0x22,0x3a,0x22,0xff,0xfe,0x22,0x7d,0x0a}},
   {"oversized_line",s=>Encoding.UTF8.GetBytes("{\"t\":\"continue\",\"seq\":"+s+",\"pad\":\""+new string('x',140)+"\"}\n")},
   {"string_seq",s=>Encoding.UTF8.GetBytes("{\"t\":\"continue\",\"seq\":\""+s+"\"}\n")},
   {"not_json",s=>Encoding.UTF8.GetBytes("continue\n")},
  };
  foreach(var (name,bytes) in malformed){
   var o=await Run((phase,seq,p,_)=>{p.Send(bytes(seq));return false;});
   check("malformed_"+name+"_control_lost",Stopped(o,"control_lost")&&o.Fake.VolumeCreates==0&&o.Fake.ContainerCreates==0&&Checkpoints(o).Count==1);
  }
  var unsolicited=await Run((_,_,_,_)=>true,afterRequest:p=>p.Line("{\"t\":\"continue\",\"seq\":1}"),source:async t=>{await Task.Delay(300,t);return await Snapshot();});
  check("unsolicited_continue_control_lost",Stopped(unsolicited,"control_lost")&&unsolicited.Fake.VolumeCreates==0);
  var twice=await Run((phase,_,p,_)=>{if(phase=="before_upload"){p.Line("{\"t\":\"stop\"}");p.Line("{\"t\":\"stop\"}");return false;}return true;});
  check("second_stop_ignored",Stopped(twice,"stop_requested")&&twice.Fake.ContainerDeletes==1&&twice.Fake.VolumeDeletes==1);
  var waiting=await Run((phase,_,p,_)=>{if(phase=="before_start")_=Task.Delay(400).ContinueWith(_=>p.Line("{\"t\":\"stop\"}"));return true;},fault:"hold-wait");
  check("stop_during_container_wait",Stopped(waiting,"stop_requested")&&waiting.Fake.Starts==1&&waiting.Fake.ContainerDeletes==1&&waiting.Fake.VolumeDeletes==1&&waiting.ElapsedMs<5000&&!Checkpoints(waiting).Contains("before_report"));
  var waitEof=await Run((phase,_,p,_)=>{if(phase=="before_start")_=Task.Delay(400).ContinueWith(_=>p.Close());return true;},fault:"hold-wait");
  check("eof_during_container_wait",Stopped(waitEof,"stop_requested")&&waitEof.Fake.ContainerDeletes==1&&waitEof.Fake.VolumeDeletes==1);
  var hashing=await Run((_,_,_,_)=>true,afterRequest:p=>_=Task.Delay(300).ContinueWith(_=>p.Line("{\"t\":\"stop\"}")),source:async t=>{await Task.Delay(Timeout.Infinite,t);throw new InvalidOperationException();});
  check("stop_during_source_snapshot",Stopped(hashing,"stop_requested")&&hashing.Fake.Requests.Count==0&&Checkpoints(hashing).Count==0&&hashing.ElapsedMs<3000);
  var foreign=await Run((phase,_,p,_)=>{if(phase=="before_upload"){p.Line("{\"t\":\"stop\"}");return false;}return true;},fault:"foreign-container");
  check("foreign_container_never_deleted",foreign.Report!.Status=="failed"&&foreign.Report.Reason=="cleanup_retained"&&foreign.Fake.ContainerDeletes==0&&foreign.Report.Fixture==null);
  var replaced=await Run((phase,_,p,f)=>{if(phase=="before_upload"){f.Changed=true;p.Line("{\"t\":\"stop\"}");return false;}return true;});
  check("replaced_daemon_never_false_absence",replaced.Report!.Status=="failed"&&replaced.Report.Reason=="cleanup_retained"&&!replaced.Report.ContainerRemoved&&!replaced.Report.VolumeRemoved&&replaced.Fake.ContainerDeletes==0&&replaced.Fake.VolumeDeletes==0);
  var big=await Run((_,_,_,_)=>true,request:Encoding.UTF8.GetBytes(new string(' ',4097)+"\n"));
  check("oversized_request_refused",big.RequestError=="input_invalid"&&big.Fake.Requests.Count==0&&big.Lines.Count==0);
  var unterminated=await Run((_,_,_,_)=>true,request:Encoding.UTF8.GetBytes(RequestJson(Guid.NewGuid())),eofAfterRequest:true);
  check("unterminated_request_refused",unterminated.RequestError=="input_invalid"&&unterminated.Lines.Count==0);
  var badUtf=await Run((_,_,_,_)=>true,request:new byte[]{0x7b,0xff,0x7d,0x0a});
  check("invalid_utf8_request_refused",badUtf.RequestError=="input_invalid"&&badUtf.Lines.Count==0);
 }
}
