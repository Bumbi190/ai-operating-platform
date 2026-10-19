using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Omnira.CodeBroker.Workspace.Smoke;
if(args.Length>0&&args[0]=="child") {
 if(args[1]=="env"){Console.WriteLine(JsonSerializer.Serialize(new {args=args.Skip(2).ToArray(),secret=Environment.GetEnvironmentVariable("OMNIRA_FIXTURE_SECRET"),git=Environment.GetEnvironmentVariable("GIT_CONFIG_COUNT"),docker=Environment.GetEnvironmentVariable("DOCKER_HOST")}));return 0;}
 if(args[1]=="hold"){await Task.Delay(Timeout.Infinite);return 0;}
 var start=new ProcessStartInfo(@"C:\Program Files\dotnet\dotnet.exe"){UseShellExecute=false};
 start.ArgumentList.Add(Assembly.GetExecutingAssembly().Location);start.ArgumentList.Add("child");start.ArgumentList.Add("hold");
 using var child=Process.Start(start)!;Console.WriteLine("descendant:"+child.Id);Console.Out.Flush();
 if(args[1]=="overflow"){while(true){Console.Write(new string('x',8192));Console.Out.Flush();}}
 await Task.Delay(Timeout.Infinite);return 0;
}
var names=new List<string>();
void Check(string name,bool value){if(!value){Console.Error.WriteLine(JsonSerializer.Serialize(new{failed=name,passed=names}));throw new Exception(name);}names.Add(name);}
if(args.Length!=1)throw new Exception("unknown smoke mode");
if(args[0]=="path-process")await PathProcessSmoke.Run(Check);
else if(args[0]=="worktree")await WorktreeSmoke.Run(Check);
else if(args[0]=="probe")await ProbeSmoke.Run(Check);
else throw new Exception("unknown smoke mode");
Console.WriteLine(JsonSerializer.Serialize(new{passed=names.Count,names}));
return 0;
