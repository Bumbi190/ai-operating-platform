using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using Omnira.CodeBroker.Host;
using Omnira.CodeBroker.Workspace;

namespace Omnira.CodeBroker.Workspace.Smoke;
internal static class PathProcessSmoke {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint create,uint flags,IntPtr template);
 static bool ReparseWriteBlocked(string path){using var handle=CreateFileW(path,0x40000000,0,IntPtr.Zero,3,0x02200000,IntPtr.Zero);return handle.IsInvalid&&Marshal.GetLastWin32Error()==32;}
 internal static string FixtureRoot(){
  var requested=Environment.GetEnvironmentVariable("SDF_WINDOWS_FIXTURE_ROOT");var expected=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,".superpowers/sdd/2026-10-19-windows-source-materialization"));
  if(requested==null)return Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,".superpowers/sdd/2026-10-18-windows-workspace-sandbox"));
  var owner=File.ReadAllText(Path.Combine(expected,"plan-path")).Trim();var relative="docs/superpowers/plans/2026-10-19-windows-source-materialization.md";
  var repo=Path.GetFullPath(Environment.CurrentDirectory).Replace('\\','/');var msys="/"+char.ToLowerInvariant(repo[0])+repo[2..]+"/"+relative;
  if(!string.Equals(Path.GetFullPath(requested),expected,StringComparison.OrdinalIgnoreCase)||(owner!=relative&&owner!=msys))throw new Exception("fixture path escaped");
  return expected;
 }
 internal static string Fixture()=>Path.Combine(FixtureRoot(),"f-"+Convert.ToBase64String(Guid.NewGuid().ToByteArray()).TrimEnd('=').Replace('+','-').Replace('/','_'));
 internal static bool Refused(Action action){try{action();return false;}catch(HostCheckException){return true;}catch(WorkspaceException){return true;}}
 internal static bool IoRefused(Action action){try{action();return false;}catch(IOException){return true;}catch(UnauthorizedAccessException){return true;}}
 public static async Task Run(Action<string,bool> check) {
  var root=Fixture();Directory.CreateDirectory(root);var user=WindowsIdentity.GetCurrent().User!.Value;
  try{
   var folder=Path.Combine(root,"directory with spaces");Directory.CreateDirectory(folder);var target=new TargetDefinition("fixture",folder,true,null);
   using(var held=ProtectedPathLease.Acquire(target,user)) {
    check("space_path_accepted",held.Evidence.Components.Length>2);check("retained_directory_blocks_rename",IoRefused(()=>Directory.Move(folder,folder+"-moved")));held.ValidateUnchanged();
    check("held_directory_blocks_reparse_write",ReparseWriteBlocked(folder));
   }
   Directory.Move(folder,folder+"-moved");Directory.Move(folder+"-moved",folder);check("released_directory_can_rename",Directory.Exists(folder));
   var config=Path.Combine(folder,"config");File.WriteAllText(config,"safe");
   using(var held=ProtectedPathLease.Acquire(new("fixture",config,false,null),user)){
    check("held_config_blocks_write",IoRefused(()=>File.WriteAllText(config,"changed")));held.ValidateUnchanged();check("held_config_bytes_preserved",File.ReadAllText(config)=="safe");
   }
   var link=Path.Combine(root,"junction");Omnira.CodeBroker.Host.Smoke.FixtureJunction.Create(link,folder);
   try{check("reparse_component_refused",Refused(()=>ProtectedPathLease.Acquire(new("fixture",link,true,null),user).Dispose()));}
   finally{Directory.Delete(link);}
   var acl=FileSystemAclExtensions.GetAccessControl(new FileInfo(config));acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-1-0"),FileSystemRights.WriteData,AccessControlType.Allow));FileSystemAclExtensions.SetAccessControl(new FileInfo(config),acl);
   check("unsafe_acl_refused",Refused(()=>ProtectedPathLease.Acquire(new("fixture",config,false,null),user).Dispose()));
   acl.RemoveAccessRuleAll(new FileSystemAccessRule(new SecurityIdentifier("S-1-1-0"),FileSystemRights.WriteData,AccessControlType.Allow));FileSystemAclExtensions.SetAccessControl(new FileInfo(config),acl);
   foreach(var path in new[]{@"\\server\share\a",@"\\?\C:\a",config+":ads","C:/a/../b","C:/PROGRA~1/a","C:/a/trailing.","C:/a/CON"})check("alias_ads_unc_device_refused_"+Guid.NewGuid().ToString("N"),Refused(()=>ProtectedPathLease.Acquire(new("fixture",path,false,null),user).Dispose()));
   check("case_sensitive_refused",!HostPolicy.Evaluate(new("fixture",new[]{new ComponentEvidence(@"C:\","h",user,Array.Empty<AceEvidence>(),true,false,false),new ComponentEvidence(folder,"h",user,Array.Empty<AceEvidence>(),true,false,true)},null),target,user).Allowed);
   await ProcessChecks(root,check);
  }finally{Directory.Delete(root,true);}
  check("released_fixture_removed",!Directory.Exists(root));
 }
 static async Task ProcessChecks(string root,Action<string,bool> check){
  var assembly=Assembly.GetExecutingAssembly().Location;var dotnet=HostProfile.Targets.Single(t=>t.Id=="dotnet");using var exe=ProtectedPathLease.Acquire(dotnet,WindowsIdentity.GetCurrent().User!.Value);
  Environment.SetEnvironmentVariable("OMNIRA_FIXTURE_SECRET","must-not-inherit");Environment.SetEnvironmentVariable("GIT_CONFIG_COUNT","99");Environment.SetEnvironmentVariable("DOCKER_HOST","tcp://wrong:1");
  try{
   var result=await NativeProcess.RunAsync(exe,new[]{assembly,"child","env","space value","quote\"and\\trail\\"},root,new Dictionary<string,string>{{"SystemRoot",@"C:\Windows"},{"WINDIR",@"C:\Windows"}},3000,262144,CancellationToken.None);
   check("exact_executable_and_argv",result.ExitCode==0);
   using var data=JsonDocument.Parse(result.Stdout);check("argv_quoted_without_shell",data.RootElement.GetProperty("args").EnumerateArray().Select(v=>v.GetString()).SequenceEqual(new[]{"space value","quote\"and\\trail\\"}));
   check("parent_secret_absent",data.RootElement.GetProperty("secret").ValueKind==JsonValueKind.Null);check("hostile_git_docker_env_absent",data.RootElement.GetProperty("git").ValueKind==JsonValueKind.Null&&data.RootElement.GetProperty("docker").ValueKind==JsonValueKind.Null);
   foreach(var mode in new[]{"tree","overflow","cancel"}){
    using var cancel=new CancellationTokenSource();if(mode=="cancel")cancel.CancelAfter(1400);
    result=await NativeProcess.RunAsync(exe,new[]{assembly,"child",mode=="cancel"?"tree":mode},root,new Dictionary<string,string>{{"SystemRoot",@"C:\Windows"}},mode=="tree"?1400:5000,mode=="overflow"?16384:262144,cancel.Token);
    var line=result.Stdout.Split('\n').FirstOrDefault(l=>l.StartsWith("descendant:"));check(mode+"_descendant_started",line!=null);
    var pid=int.Parse(line!["descendant:".Length..].Trim());await Task.Delay(100);
    bool exited;try{using var child=Process.GetProcessById(pid);exited=child.HasExited;}catch(ArgumentException){exited=true;}
    check(mode=="overflow"?"overflow_kills_descendant":mode=="tree"?"timeout_kills_descendant":"cancellation_closes_handles",exited&&(mode=="overflow"?result.OutputLimit:result.TimedOut));
   }
  }finally{Environment.SetEnvironmentVariable("OMNIRA_FIXTURE_SECRET",null);Environment.SetEnvironmentVariable("GIT_CONFIG_COUNT",null);Environment.SetEnvironmentVariable("DOCKER_HOST",null);}
 }
}
