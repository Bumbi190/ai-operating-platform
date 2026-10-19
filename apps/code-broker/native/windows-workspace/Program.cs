using System.Text;
using System.Text.Json;
using Omnira.CodeBroker.Workspace;
try{
 if(!OperatingSystem.IsWindows()||args.Length!=1||args[0]!="prepare")throw new WorkspaceException("input_invalid");
 using var deadline=new CancellationTokenSource(120000);
 using var input=Console.OpenStandardInput();var buffer=new byte[4097];int count=0;
 while(count<buffer.Length){int read=await input.ReadAsync(buffer.AsMemory(count),deadline.Token);if(read==0)break;count+=read;}
 if(count>4096)throw new WorkspaceException("input_invalid");
 var request=WorkspaceRequest.Parse(new UTF8Encoding(false,true).GetString(buffer,0,count));
 var report=await new WindowsWorktree().PrepareAsync(request,deadline.Token);
 var output=JsonSerializer.Serialize(report,WorkspaceJson.Options);
 if(Encoding.UTF8.GetByteCount(output)>262144)throw new WorkspaceException("verification_failed");
 Console.WriteLine(output);return 0;
}catch{Console.Error.WriteLine("broker_windows_workspace_failed");return 1;}
