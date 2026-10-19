using System.Text;
using System.Text.Json;
namespace Omnira.CodeBroker.Workspace;
/** Parent-owned cooperative stop. A checkpoint either returns (parent said continue) or throws; it never re-arms after stop. */
internal interface IStopCheckpoint {
 CancellationToken Stopped{get;}
 string? Reason{get;}
 Task CheckpointAsync(string phase,CancellationToken token);
}
/**
 * sdf.native_control.v1 over the helper's own stdio.
 * stdin: one request line (<=4096 UTF-8 bytes) then only {"t":"continue","seq":n} / {"t":"stop"} lines (<=128 bytes). EOF = stop.
 * stdout: {"t":"checkpoint","seq":n,"phase":P} lines, then exactly one {"t":"report","report":R}.
 * Any malformed, unsolicited or mismatched control line permanently stops with control_lost.
 */
internal sealed class NativeControlChannel:IStopCheckpoint {
 internal static readonly string[] Phases={"before_resources","before_volume_create","before_container_create","before_upload","before_start","before_report"};
 const int MaxRequest=4096,MaxControl=128,MaxCheckpoint=256,MaxTotal=262144;
 readonly Stream input,output;readonly int replyMs;readonly object gate=new();readonly CancellationTokenSource stop=new();
 int seq,phase=-1,pendingSeq;TaskCompletionSource? pending;string? reason;long written;bool reported,reading;
 internal NativeControlChannel(Stream input,Stream output,int replyMs=4000){
  if(replyMs<1||replyMs>4000)throw new WorkspaceException("input_invalid");this.input=input;this.output=output;this.replyMs=replyMs;
 }
 public CancellationToken Stopped=>stop.Token;
 public string? Reason{get{lock(gate)return reason;}}
 /** Reads exactly one newline-terminated request, then starts the background control reader. */
 internal async Task<string> ReadRequestAsync(CancellationToken token){
  lock(gate){if(reading)throw new WorkspaceException("input_invalid");reading=true;}
  var line=new MemoryStream();var buffer=new byte[1];
  while(true){
   int n=await input.ReadAsync(buffer,token);
   if(n==0)throw new WorkspaceException("input_invalid");
   if(buffer[0]==(byte)'\n')break;
   if(line.Length>=MaxRequest)throw new WorkspaceException("input_invalid");
   line.WriteByte(buffer[0]);
  }
  string json;try{json=new UTF8Encoding(false,true).GetString(line.ToArray());}catch{throw new WorkspaceException("input_invalid");}
  _=Task.Run(ControlLoop);
  return json;
 }
 void ControlLoop(){
  var line=new MemoryStream();var buffer=new byte[256];
  try{
   while(!stop.IsCancellationRequested){
    int n=input.Read(buffer,0,buffer.Length);
    if(n==0){Stop("stop_requested");return;}
    for(int i=0;i<n;i++){
     if(buffer[i]==(byte)'\n'){Handle(line.ToArray());line.SetLength(0);if(stop.IsCancellationRequested)return;continue;}
     if(line.Length>=MaxControl){Stop("control_lost");return;}
     line.WriteByte(buffer[i]);
    }
   }
  }catch{Stop("control_lost");}
 }
 void Handle(byte[] bytes){
  try{
   var text=new UTF8Encoding(false,true).GetString(bytes);
   using var doc=JsonDocument.Parse(text,new JsonDocumentOptions{MaxDepth=2});var r=doc.RootElement;WorkspaceJson.Unique(r);
   if(r.ValueKind!=JsonValueKind.Object||!r.TryGetProperty("t",out var t)||t.ValueKind!=JsonValueKind.String)throw new WorkspaceException("control_lost");
   if(t.GetString()=="stop"){WorkspaceJson.Keys(r,"t");Stop("stop_requested");return;}
   if(t.GetString()!="continue")throw new WorkspaceException("control_lost");
   WorkspaceJson.Keys(r,"t","seq");var s=r.GetProperty("seq");if(s.ValueKind!=JsonValueKind.Number||!s.TryGetInt32(out var value))throw new WorkspaceException("control_lost");
   TaskCompletionSource? ready;
   lock(gate){if(pending==null||value!=pendingSeq||reason!=null){ready=null;}else{ready=pending;pending=null;}}
   if(ready==null){Stop("control_lost");return;}
   ready.TrySetResult();
  }catch{Stop("control_lost");}
 }
 /** First reason wins; stopping is irreversible and fails any waiting checkpoint. */
 internal void Stop(string why){
  TaskCompletionSource? waiting;
  lock(gate){if(reason!=null)return;reason=why;waiting=pending;pending=null;}
  try{stop.Cancel();}catch(ObjectDisposedException){}
  waiting?.TrySetCanceled();
 }
 public async Task CheckpointAsync(string name,CancellationToken token){
  int index=Array.IndexOf(Phases,name);TaskCompletionSource wait=new(TaskCreationOptions.RunContinuationsAsynchronously);int number;
  lock(gate){
   if(index<=phase||reported)throw new WorkspaceException("protocol_invalid");
   if(reason!=null)throw new OperationCanceledException(stop.Token);
   phase=index;number=++seq;pendingSeq=number;pending=wait;
  }
  token.ThrowIfCancellationRequested();
  Write("{\"t\":\"checkpoint\",\"seq\":"+number+",\"phase\":\""+name+"\"}",MaxCheckpoint);
  using var linked=CancellationTokenSource.CreateLinkedTokenSource(token,stop.Token);
  var timer=Task.Delay(replyMs,linked.Token);
  var done=await Task.WhenAny(wait.Task,timer);
  if(done==wait.Task&&wait.Task.IsCompletedSuccessfully)return;
  if(Reason==null&&!token.IsCancellationRequested)Stop("control_lost");
  throw new OperationCanceledException(stop.IsCancellationRequested?stop.Token:token);
 }
 internal void WriteReport(string json){
  lock(gate){if(reported)throw new WorkspaceException("protocol_invalid");reported=true;}
  Write("{\"t\":\"report\",\"report\":"+json+"}",MaxTotal);
 }
 void Write(string line,int max){
  var bytes=Encoding.UTF8.GetBytes(line+"\n");
  lock(gate){
   if(bytes.Length>max+1||written+bytes.Length>MaxTotal+MaxCheckpoint*Phases.Length)throw new WorkspaceException("verification_failed");
   written+=bytes.Length;output.Write(bytes);output.Flush();
  }
 }
}
