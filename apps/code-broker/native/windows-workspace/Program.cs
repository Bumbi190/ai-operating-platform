using System.Text;
using System.Text.Json;
using Omnira.CodeBroker.Workspace;
try{
 if(!OperatingSystem.IsWindows()||args.Length!=1||(args[0] is not ("prepare" or "probe" or "cleanup-probe" or "materialize-fixture" or "cleanup-materialization")))throw new WorkspaceException("input_invalid");
 using var deadline=new CancellationTokenSource(args[0]=="materialize-fixture"?180000:args[0]=="cleanup-materialization"?30000:args[0]=="prepare"?120000:args[0]=="probe"?30000:15000);
 using var input=Console.OpenStandardInput();var buffer=new byte[4097];int count=0;
 while(count<buffer.Length){int read=await input.ReadAsync(buffer.AsMemory(count),deadline.Token);if(read==0)break;count+=read;}
 if(count>4096)throw new WorkspaceException("input_invalid");
 var json=new UTF8Encoding(false,true).GetString(buffer,0,count);string output;
 if(args[0]=="prepare"){var report=await new WindowsWorktree().PrepareAsync(WorkspaceRequest.Parse(json),deadline.Token);output=JsonSerializer.Serialize(report,WorkspaceJson.Options);}
 else if(args[0] is "materialize-fixture" or "cleanup-materialization"){
  var parsed=MaterializationContracts.Parse(json,args[0]=="cleanup-materialization");var engine=new WindowsMaterializationFixture();
  var result=args[0]=="materialize-fixture"?await engine.RunAsync(parsed.Request,parsed.Attempt,deadline.Token):await engine.CleanupAsync(parsed.Request,parsed.Attempt,deadline.Token);
  output=JsonSerializer.Serialize(result,new JsonSerializerOptions{PropertyNamingPolicy=JsonNamingPolicy.CamelCase});
 }
 else{
  using var document=WorkspaceJson.Document(json);var root=document.RootElement;WorkspaceJson.Keys(root,"schema","attemptId");
  var attempt=WorkspaceJson.String(root,"attemptId");
  if(WorkspaceJson.String(root,"schema")!="sdf.windows_probe_request.v1"||!WorkspaceJson.Uuid(attempt,true))throw new WorkspaceException("input_invalid");
  var probe=new WindowsSandboxProbe();var report=args[0]=="probe"?await probe.RunAsync(Guid.Parse(attempt),deadline.Token):await probe.CleanupAsync(Guid.Parse(attempt),deadline.Token);
  output=JsonSerializer.Serialize(report,new JsonSerializerOptions{PropertyNamingPolicy=JsonNamingPolicy.CamelCase});
 }
 if(Encoding.UTF8.GetByteCount(output)>262144)throw new WorkspaceException("verification_failed");
 Console.WriteLine(output);return 0;
}catch{Console.Error.WriteLine("broker_windows_workspace_failed");return 1;}
