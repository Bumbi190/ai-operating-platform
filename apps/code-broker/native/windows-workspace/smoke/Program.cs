using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Omnira.CodeBroker.Workspace.Smoke;
using Omnira.CodeBroker.Workspace;
if(args.Length>0&&args[0]=="child") {
 if(args[1]=="job-parent"){
  var pidFile=Path.GetFullPath(args[2]);var owned=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,".superpowers/sdd/2026-10-18-windows-workspace-sandbox"))+Path.DirectorySeparatorChar;
  if(!pidFile.StartsWith(owned,StringComparison.OrdinalIgnoreCase))throw new Exception("fixture path escaped");
  using var tool=ProtectedPathLease.Acquire(Omnira.CodeBroker.Host.HostProfile.Targets.Single(t=>t.Id=="dotnet"),System.Security.Principal.WindowsIdentity.GetCurrent().User!.Value);
  await NativeProcess.RunAsync(tool,new[]{Assembly.GetExecutingAssembly().Location,"child","tree-file",pidFile},Path.GetDirectoryName(pidFile)!,new Dictionary<string,string>{{"SystemRoot",@"C:\Windows"}},60000,262144,CancellationToken.None);return 0;
 }
 if(args[1]=="env"){Console.WriteLine(JsonSerializer.Serialize(new {args=args.Skip(2).ToArray(),secret=Environment.GetEnvironmentVariable("OMNIRA_FIXTURE_SECRET"),git=Environment.GetEnvironmentVariable("GIT_CONFIG_COUNT"),docker=Environment.GetEnvironmentVariable("DOCKER_HOST")}));return 0;}
 if(args[1]=="hold"){await Task.Delay(Timeout.Infinite);return 0;}
 var start=new ProcessStartInfo(@"C:\Program Files\dotnet\dotnet.exe"){UseShellExecute=false};
 start.ArgumentList.Add(Assembly.GetExecutingAssembly().Location);start.ArgumentList.Add("child");start.ArgumentList.Add("hold");
 using var child=Process.Start(start)!;if(args[1]=="tree-file")File.WriteAllText(args[2],JsonSerializer.Serialize(new[]{new{pid=Environment.ProcessId,started=Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks},new{pid=child.Id,started=child.StartTime.ToUniversalTime().Ticks}}));Console.WriteLine("descendant:"+child.Id);Console.Out.Flush();
 if(args[1]=="overflow"){while(true){Console.Write(new string('x',8192));Console.Out.Flush();}}
 await Task.Delay(Timeout.Infinite);return 0;
}
if(args.Length==2&&args[0]=="verify-pids"){
 var owned=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,".superpowers/sdd/2026-10-18-windows-workspace-sandbox"))+Path.DirectorySeparatorChar;
 var path=Path.GetFullPath(args[1]);if(!path.StartsWith(owned,StringComparison.OrdinalIgnoreCase))throw new Exception("fixture path escaped");
 using var doc=JsonDocument.Parse(File.ReadAllText(path));var alive=new List<int>();
 foreach(var item in doc.RootElement.EnumerateArray()){
  try{using var process=Process.GetProcessById(item.GetProperty("pid").GetInt32());if(!process.HasExited&&process.StartTime.ToUniversalTime().Ticks==item.GetProperty("started").GetInt64())alive.Add(process.Id);}catch(ArgumentException){}
 }
 Console.WriteLine(JsonSerializer.Serialize(new{alive}));return 0;
}
if(args.Length==1&&args[0]=="probe-spec"){ProbeSmoke.DumpSpec();return 0;}
if(args.Length==1&&args[0]=="create-probe"){await ProbeSmoke.CreateRealFixture();return 0;}
var names=new List<string>();
void Check(string name,bool value){if(!value){Console.Error.WriteLine(JsonSerializer.Serialize(new{failed=name,passed=names}));throw new Exception(name);}names.Add(name);}
if(args.Length!=1)throw new Exception("unknown smoke mode");
if(args[0]=="path-process")await PathProcessSmoke.Run(Check);
else if(args[0]=="worktree")await WorktreeSmoke.Run(Check);
else if(args[0]=="worktree-config")await WorktreeConfigSmoke.Run(Check);
else if(args[0]=="probe")await ProbeSmoke.Run(Check);
else throw new Exception("unknown smoke mode");
Console.WriteLine(JsonSerializer.Serialize(new{passed=names.Count,names}));
return 0;
