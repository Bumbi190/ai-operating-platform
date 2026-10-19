using System.Security.Principal;
using Omnira.CodeBroker.Host;
namespace Omnira.CodeBroker.Workspace;
internal enum GitOperation {Layout,LocalConfig,ObjectType,ResolvePin,ResolveApprovedBase,RefExists,WorktreeList,WorktreeAdd,Head,SymbolicHead,Status}
internal sealed record GitOperationValues(WorkspaceRequest Request,ProtectedPathLease Repository,ProtectedPathLease Parent,ProtectedPathLease? Target=null);
internal interface IWindowsGit{Task<GitProcessResult> RunAsync(GitOperation operation,GitOperationValues values,CancellationToken cancellation);}
internal sealed class WindowsGitProcess:IWindowsGit {
 internal const string LockReason="omnira-sdf explicit-cleanup-only";
 internal static string[] OperationArguments(GitOperation operation,string workId,string sha,string target){
  if(!WorkspaceJson.Uuid(workId,true)||!System.Text.RegularExpressions.Regex.IsMatch(sha,@"^[0-9a-f]{40}$"))throw new WorkspaceException("input_invalid");
  return operation switch{
   GitOperation.Layout=>new[]{"rev-parse","--show-toplevel","--absolute-git-dir","--git-common-dir","--is-inside-work-tree"},
   GitOperation.LocalConfig=>new[]{"config","--local","--no-includes","--list","-z"},
   GitOperation.ObjectType=>new[]{"cat-file","-t",sha},
   GitOperation.ResolvePin=>new[]{"rev-parse","--verify","--quiet",sha+"^{commit}"},
   GitOperation.ResolveApprovedBase=>new[]{"rev-parse","--verify","--quiet","refs/remotes/origin/main^{commit}"},
   GitOperation.RefExists=>new[]{"show-ref","--verify","--quiet","refs/heads/sdf1/"+workId},
   GitOperation.WorktreeList=>new[]{"worktree","list","--porcelain","-z"},
   GitOperation.WorktreeAdd=>new[]{"worktree","add","--quiet","--lock","--reason",LockReason,"-b","sdf1/"+workId,target,sha},
   GitOperation.Head=>new[]{"rev-parse","--verify","--quiet","HEAD^{commit}"},
   GitOperation.SymbolicHead=>new[]{"symbolic-ref","--quiet","HEAD"},
   GitOperation.Status=>new[]{"status","--porcelain=v1","-z","--untracked-files=all","--ignore-submodules=none"},
   _=>throw new WorkspaceException("input_invalid")
  };
 }
 public async Task<GitProcessResult> RunAsync(GitOperation operation,GitOperationValues values,CancellationToken cancellation){
  values.Request.Validate();values.Repository.ValidateUnchanged();values.Parent.ValidateUnchanged();values.Target?.ValidateUnchanged();
  var user=WindowsIdentity.GetCurrent().User!.Value;using var executable=ProtectedPathLease.Acquire(HostProfile.Targets.Single(t=>t.Id=="git"),user);
  var target=Path.Combine(values.Parent.PathValue,values.Request.WorkId);
  var args=OperationArguments(operation,values.Request.WorkId,values.Request.PinnedBaseSha,target);
  var cwd=operation is GitOperation.Head or GitOperation.SymbolicHead or GitOperation.Status?values.Target?.PathValue??throw new WorkspaceException("unsafe_path"):values.Repository.PathValue;
  var home=Path.Combine(values.Parent.PathValue,".infra-win-"+Guid.NewGuid().ToString("N"));ProtectedPathLease? homeLease=null;
  if(Directory.Exists(home)||File.Exists(home))throw new WorkspaceException("unsafe_path");
  try{
   Directory.CreateDirectory(home);homeLease=ProtectedPathLease.Acquire(new("neutral_home",home,true,null),user);
   var hooks=Path.Combine(home,"hooks");Directory.CreateDirectory(hooks);var empty=Path.Combine(home,"empty.config");File.WriteAllText(empty,"");
   var prefix=new[]{"--no-pager","--no-optional-locks","-c","core.hooksPath="+hooks,"-c","core.fsmonitor=false","-c","credential.helper=","-c","protocol.allow=never","-c","gc.auto=0","-c","maintenance.auto=false","-c","core.untrackedCache=false","-c","advice.detachedHead=false","-c","submodule.recurse=false","-c","core.protectNTFS=true","-c","core.symlinks=false"};
   var environment=new Dictionary<string,string>{
    ["SystemRoot"]=@"C:\Windows",["WINDIR"]=@"C:\Windows",["PATH"]=@"C:\Program Files\Git\cmd;C:\Program Files\Git\mingw64\bin;C:\Windows\System32",
    ["HOME"]=home,["USERPROFILE"]=home,["XDG_CONFIG_HOME"]=home,["TEMP"]=home,["TMP"]=home,
    ["LANG"]="C",["LC_ALL"]="C",["TZ"]="UTC",["GIT_CONFIG_NOSYSTEM"]="1",["GIT_CONFIG_GLOBAL"]=empty,["GIT_CONFIG_SYSTEM"]=empty,
    ["GIT_TERMINAL_PROMPT"]="0",["GIT_NO_LAZY_FETCH"]="1",["GIT_OPTIONAL_LOCKS"]="0",["GIT_ALLOW_PROTOCOL"]="none"
   };
   var result=await NativeProcess.RunAsync(executable,prefix.Concat(args).ToArray(),cwd,environment,60000,262144,cancellation);
   homeLease.ValidateUnchanged();values.Repository.ValidateUnchanged();values.Parent.ValidateUnchanged();values.Target?.ValidateUnchanged();
   return result;
  }finally{
   if(homeLease!=null){homeLease.ValidateUnchanged();homeLease.Dispose();homeLease=null;}
   if(Directory.Exists(home)){
    // This invocation alone created this exact random directory; no caller can name it.
    using(var proof=ProtectedPathLease.Acquire(new("neutral_home",home,true,null),user)){proof.ValidateUnchanged();}
    try{Directory.Delete(home,true);}catch{throw new WorkspaceException("cleanup_retained");}
   }
  }
 }
}
