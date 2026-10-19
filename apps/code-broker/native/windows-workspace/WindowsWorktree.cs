using System.Security.Principal;
using System.Text.Json;
using Omnira.CodeBroker.Host;
namespace Omnira.CodeBroker.Workspace;
internal sealed record RepositoryLocation(TargetDefinition Root,TargetDefinition Parent,TargetDefinition Git){
 internal const string RepositoryId="github.com/bumbi190/ai-operating-platform";
 internal static RepositoryLocation Fixed=>new(HostProfile.Targets.Single(t=>t.Id=="checkout"),HostProfile.Targets.Single(t=>t.Id=="worktree_parent"),HostProfile.Targets.Single(t=>t.Id=="git"));
}
internal interface IHostPreflight{Task<bool> IsQualifiedAsync(CancellationToken cancellation);}
internal sealed class NativeHostPreflight:IHostPreflight{public async Task<bool> IsQualifiedAsync(CancellationToken cancellation)=>(await HostQualification.EvaluateAsync(cancellation)).Status=="qualified_for_health_probe";}
public sealed class WindowsWorktree {
 readonly RepositoryLocation location;readonly IWindowsGit git;readonly IHostPreflight host;
 public WindowsWorktree():this(RepositoryLocation.Fixed,new WindowsGitProcess(),new NativeHostPreflight()){}
 internal WindowsWorktree(RepositoryLocation location,IWindowsGit git,IHostPreflight host){this.location=location;this.git=git;this.host=host;}
 public async Task<WorkspaceReport> PrepareAsync(WorkspaceRequest input,CancellationToken cancellation){
  var held=new List<ProtectedPathLease>();bool mutation=false;
  var user=WindowsIdentity.GetCurrent().User!.Value;
  ProtectedPathLease Hold(TargetDefinition target){var lease=ProtectedPathLease.Acquire(target,user);held.Add(lease);return lease;}
  try{
   input.Validate();if(input.RepositoryId!=RepositoryLocation.RepositoryId)return new("refused",false,"repository_unknown");
   if(!await host.IsQualifiedAsync(cancellation))return new("refused",false,"host_unqualified");
   var root=Hold(location.Root);var parent=Hold(location.Parent);Hold(location.Git);
   var dotGit=Path.Combine(root.PathValue,".git");Hold(new("git_directory",dotGit,true,null));
   Hold(new("git_config",Path.Combine(dotGit,"config"),false,null));
   // Prove the object/ref/registration roots as real owned directories, not redirected Git metadata.
   foreach(var relative in new[]{"objects","refs","worktrees","objects/info","refs/heads","refs/remotes","refs/remotes/origin"}){
    var path=Path.Combine(dotGit,relative.Replace('/',Path.DirectorySeparatorChar));if(Directory.Exists(path)||File.Exists(path))Hold(new("git_metadata",path,true,null));
   }
   foreach(var relative in new[]{"commondir","gitdir","objects/info/alternates","objects/info/http-alternates"})if(File.Exists(Path.Combine(dotGit,relative.Replace('/',Path.DirectorySeparatorChar))))throw new WorkspaceException("unsafe_path");
   foreach(var relative in new[]{"packed-refs","refs/remotes/origin/main"}){var path=Path.Combine(dotGit,relative.Replace('/',Path.DirectorySeparatorChar));if(File.Exists(path))Hold(new("git_ref",path,false,null));}
   var values=new GitOperationValues(input,root,parent);
   async Task<GitProcessResult> Run(GitOperation op,GitOperationValues? v=null){var result=await git.RunAsync(op,v??values,cancellation);if(result.TimedOut)throw new WorkspaceException("git_timeout");if(result.OutputLimit)throw new WorkspaceException("git_output_limit");if(result.ExitCode==null)throw new WorkspaceException("git_unavailable");return result;}
   static string Need(GitProcessResult r,string code){if(r.ExitCode!=0)throw new WorkspaceException(code);return r.Stdout;}
   var config=Need(await Run(GitOperation.LocalConfig),"unsafe_git_config");var remoteHash=GitRepositoryPolicy.AuditConfig(config);
   var layout=Need(await Run(GitOperation.Layout),"verification_failed").Replace("\r","").TrimEnd('\n').Split('\n');
   bool Same(string a,string b)=>string.Equals(NativeFileEvidence.CanonicalInput(a),NativeFileEvidence.CanonicalInput(b),StringComparison.OrdinalIgnoreCase);
   if(layout.Length!=4||layout[3]!="true"||!Same(layout[0],root.PathValue)||!Same(layout[1],dotGit)||(layout[2]!=".git"&&!Same(layout[2],dotGit)))throw new WorkspaceException("verification_failed");
   if(Need(await Run(GitOperation.ObjectType),"base_unavailable").Trim()!="commit"||Need(await Run(GitOperation.ResolvePin),"base_unavailable").Trim()!=input.PinnedBaseSha)throw new WorkspaceException("base_unavailable");
   var observed=Need(await Run(GitOperation.ResolveApprovedBase),"base_unavailable").Trim();
   if(observed!=input.PinnedBaseSha)return new("stale_base",false,PinnedBaseSha:input.PinnedBaseSha,ObservedBaseSha:observed);
   var target=Path.Combine(parent.PathValue,input.WorkId);var branch="sdf1/"+input.WorkId;var branchRef="refs/heads/"+branch;
   bool Present(string path){try{File.GetAttributes(path);return true;}catch(FileNotFoundException){return false;}catch(DirectoryNotFoundException){return false;}}
   if(Present(target))return new("refused",false,"target_exists");
   var exists=await Run(GitOperation.RefExists);if(exists.ExitCode==0)return new("refused",false,"branch_exists");if(exists.ExitCode!=1)throw new WorkspaceException("verification_failed");
   var list=Need(await Run(GitOperation.WorktreeList),"verification_failed");
   bool Registered(string data,string path,string reference,bool locked)=>data.Split("\0\0",StringSplitOptions.RemoveEmptyEntries).Any(block=>{
    var fields=block.Split('\0',StringSplitOptions.RemoveEmptyEntries);
    return fields.Any(v=>v.StartsWith("worktree ")&&Same(v[9..],path))&&fields.Contains("branch "+reference)&&(!locked||fields.Contains("locked "+WindowsGitProcess.LockReason));
   });
   if(list.Split('\0').Any(v=>v=="branch "+branchRef||(v.StartsWith("worktree ")&&Same(v[9..],target))))return new("refused",false,"worktree_conflict");
   foreach(var lease in held)lease.ValidateUnchanged();
   mutation=true;var added=await Run(GitOperation.WorktreeAdd);if(added.ExitCode!=0)return new("failed",true,"worktree_add_failed");
   var targetLease=Hold(new("worktree",target,true,null));var targetValues=values with{Target=targetLease};
   var head=Need(await Run(GitOperation.Head,targetValues),"verification_failed").Trim();
   if(head!=input.PinnedBaseSha||Need(await Run(GitOperation.SymbolicHead,targetValues),"verification_failed").Trim()!=branchRef||Need(await Run(GitOperation.Status,targetValues),"verification_failed")!="")throw new WorkspaceException("verification_failed");
   if(!Registered(Need(await Run(GitOperation.WorktreeList),"verification_failed"),target,branchRef,true))throw new WorkspaceException("verification_failed");
   // Reciprocal registration must point back to this exact worktree, not an arbitrary .git file.
   var pointer=File.ReadAllText(Path.Combine(target,".git")).Trim();
   if(!pointer.StartsWith("gitdir: "))throw new WorkspaceException("verification_failed");
   var registration=NativeFileEvidence.CanonicalInput(pointer[8..]);
   var registrationRoot=NativeFileEvidence.CanonicalInput(Path.Combine(dotGit,"worktrees"));
   if(!registration.StartsWith(registrationRoot+"\\",StringComparison.OrdinalIgnoreCase)||registration[(registrationRoot.Length+1)..].Contains('\\'))throw new WorkspaceException("verification_failed");
   Hold(new("worktree_registration",registration,true,null));Hold(new("worktree_gitdir",Path.Combine(registration,"gitdir"),false,null));Hold(new("worktree_lock",Path.Combine(registration,"locked"),false,null));
   if(!Same(File.ReadAllText(Path.Combine(registration,"gitdir")).Trim(),Path.Combine(target,".git"))||File.ReadAllText(Path.Combine(registration,"locked")).Trim()!=WindowsGitProcess.LockReason)throw new WorkspaceException("verification_failed");
   if(Need(await Run(GitOperation.ResolveApprovedBase),"base_unavailable").Trim()!=input.PinnedBaseSha||Need(await Run(GitOperation.LocalConfig),"unsafe_git_config")!=config)throw new WorkspaceException("evidence_changed");
   foreach(var lease in held)lease.ValidateUnchanged();
   return new("prepared",true,Binding:new(input.WorkId,input.RepositoryId,input.PinnedBaseSha,input.AdmissionHash,input.ClaimId,input.Fence),ObservedBaseSha:observed,HeadSha:head,BranchName:branch,WorktreePathHash:NativeFileEvidence.Hash("worktree-path:"+targetLease.PathValue),RemoteIdentityHash:remoteHash,WorkspaceIdentityHash:NativeFileEvidence.Hash("workspace-v1:"+JsonSerializer.Serialize(targetLease.Evidence)),ObservedAt:WorkspaceJson.Now());
  }catch(WorkspaceException e){return new(mutation?"failed":"refused",mutation,e.Reason);}
  catch(HostCheckException){return new(mutation?"failed":"refused",mutation,"unsafe_path");}
  catch(OperationCanceledException){return new(mutation?"failed":"refused",mutation,"git_timeout");}
  catch{return new(mutation?"failed":"refused",mutation,"verification_failed");}
  finally{for(int i=held.Count-1;i>=0;i--)held[i].Dispose();}
 }
}
