using System.Text;
using System.Text.Json;
using Omnira.CodeBroker.Workspace;
try{
 if(!OperatingSystem.IsWindows()||args.Length!=1||(args[0] is not ("prepare" or "probe" or "cleanup-probe" or "materialize-fixture" or "cleanup-materialization")))throw new WorkspaceException("input_invalid");
 using var deadline=new CancellationTokenSource(args[0]=="materialize-fixture"?180000:args[0]=="cleanup-materialization"?30000:args[0]=="prepare"?120000:args[0]=="probe"?30000:15000);
 if(args[0]=="materialize-fixture"){
  // Controlled transport only: stdin stays open as the parent's stop channel; there is no one-shot materialization path.
  var channel=new NativeControlChannel(Console.OpenStandardInput(),Console.OpenStandardOutput());
  var parsed=MaterializationContracts.Parse(await channel.ReadRequestAsync(deadline.Token),false);
  var report=await new WindowsMaterializationFixture().RunAsync(parsed.Request,parsed.Attempt,channel,deadline.Token);
  var json=JsonSerializer.Serialize(report,new JsonSerializerOptions{PropertyNamingPolicy=JsonNamingPolicy.CamelCase});
  if(Encoding.UTF8.GetByteCount(json)>262144)throw new WorkspaceException("verification_failed");
  channel.WriteReport(json);return 0;
 }
 using var input=Console.OpenStandardInput();var buffer=new byte[4097];int count=0;
 while(count<buffer.Length){int read=await input.ReadAsync(buffer.AsMemory(count),deadline.Token);if(read==0)break;count+=read;}
 if(count>4096)throw new WorkspaceException("input_invalid");
 var text=new UTF8Encoding(false,true).GetString(buffer,0,count);string output;
 if(args[0]=="prepare"){var prepared=await new WindowsWorktree().PrepareAsync(WorkspaceRequest.Parse(text),deadline.Token);output=JsonSerializer.Serialize(prepared,WorkspaceJson.Options);}
 else if(args[0]=="cleanup-materialization"){
  var parsed=MaterializationContracts.Parse(text,true);var result=await new WindowsMaterializationFixture().CleanupAsync(parsed.Request,parsed.Attempt,deadline.Token);
  output=JsonSerializer.Serialize(result,new JsonSerializerOptions{PropertyNamingPolicy=JsonNamingPolicy.CamelCase});
 }
 else{
  using var document=WorkspaceJson.Document(text);var root=document.RootElement;WorkspaceJson.Keys(root,"schema","attemptId");
  var attempt=WorkspaceJson.String(root,"attemptId");
  if(WorkspaceJson.String(root,"schema")!="sdf.windows_probe_request.v1"||!WorkspaceJson.Uuid(attempt,true))throw new WorkspaceException("input_invalid");
  var probe=new WindowsSandboxProbe();var observed=args[0]=="probe"?await probe.RunAsync(Guid.Parse(attempt),deadline.Token):await probe.CleanupAsync(Guid.Parse(attempt),deadline.Token);
  output=JsonSerializer.Serialize(observed,new JsonSerializerOptions{PropertyNamingPolicy=JsonNamingPolicy.CamelCase});
 }
 if(Encoding.UTF8.GetByteCount(output)>262144)throw new WorkspaceException("verification_failed");
 Console.WriteLine(output);return 0;
}catch{Console.Error.WriteLine("broker_windows_workspace_failed");return 1;}
