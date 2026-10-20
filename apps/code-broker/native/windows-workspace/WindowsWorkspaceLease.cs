using System.Security.Principal;
using Omnira.CodeBroker.Host;
namespace Omnira.CodeBroker.Workspace;
/** Retains the exact existing registration; never creates or repairs a workspace. */
internal sealed class WindowsWorkspaceLease:IDisposable {
 readonly List<ProtectedPathLease> held=new();readonly List<(string Path,byte[]? Bytes)> configs=new();
 readonly IWindowsGit git; readonly IHostPreflight host;internal GitOperationValues Values{get;private set;}=null!;
 string originalConfig="",originalMain="",originalTarget="";bool mainExists,targetExists;bool disposed;
 WindowsWorkspaceLease(IWindowsGit git,IHostPreflight host){this.git=git;this.host=host;}
 static bool Present(string p){try{File.GetAttributes(p);return true;}catch(FileNotFoundException){return false;}catch(DirectoryNotFoundException){return false;}}
 static byte[] Bytes(string p){if(new FileInfo(p).Length>262144)throw new WorkspaceException("unsafe_git_config");var b=File.ReadAllBytes(p);if(b.Length>262144)throw new WorkspaceException("unsafe_git_config");return b;}
 ProtectedPathLease Hold(TargetDefinition d){var l=ProtectedPathLease.Acquire(d,WindowsIdentity.GetCurrent().User!.Value);held.Add(l);return l;}
 bool Observe(string p){bool exists=Present(p);if(exists)Hold(new("workspace_metadata",p,false,null));configs.Add((p,exists?Bytes(p):null));return exists;}
 void ValidateHeld(){if(disposed)throw new WorkspaceException("workspace_unverified");foreach(var l in held)l.ValidateUnchanged();foreach(var c in configs)if(c.Bytes==null?Present(c.Path):!Present(c.Path)||!Bytes(c.Path).SequenceEqual(c.Bytes))throw new WorkspaceException("evidence_changed");}
 static bool Same(string a,string b)=>string.Equals(NativeFileEvidence.CanonicalInput(a),NativeFileEvidence.CanonicalInput(b),StringComparison.OrdinalIgnoreCase);
 internal static Task<WindowsWorkspaceLease> OpenExistingAsync(WorkspaceRequest r,CancellationToken t)=>OpenExistingAsync(r,RepositoryLocation.Fixed,new WindowsGitProcess(),new NativeHostPreflight(),t);
 internal static async Task<WindowsWorkspaceLease> OpenExistingAsync(WorkspaceRequest r,RepositoryLocation location,IWindowsGit git,IHostPreflight host,CancellationToken t){
  var lease=new WindowsWorkspaceLease(git,host);
  try{
   r.Validate();if(r.RepositoryId!=RepositoryLocation.RepositoryId)throw new WorkspaceException("repository_unknown");
   if(!await host.IsQualifiedAsync(t))throw new WorkspaceException("host_unqualified");
   var root=lease.Hold(location.Root);var parent=lease.Hold(location.Parent);lease.Hold(location.Git);
   var dotgit=Path.Combine(root.PathValue,".git");lease.Hold(new("git_directory",dotgit,true,null));lease.Observe(Path.Combine(dotgit,"config"));
   foreach(var relative in new[]{"objects","refs","worktrees","objects/info","info","refs/heads","refs/remotes","refs/remotes/origin"}){var p=Path.Combine(dotgit,relative.Replace('/',Path.DirectorySeparatorChar));if(Present(p))lease.Hold(new("git_metadata",p,true,null));}
   foreach(var relative in new[]{"commondir","gitdir","objects/info/alternates","objects/info/http-alternates","info/grafts"}){var p=Path.Combine(dotgit,relative.Replace('/',Path.DirectorySeparatorChar));if(Present(p))throw new WorkspaceException("unsafe_path");lease.configs.Add((p,null));}
   foreach(var relative in new[]{"packed-refs","refs/remotes/origin/main"}){var p=Path.Combine(dotgit,relative.Replace('/',Path.DirectorySeparatorChar));lease.Observe(p);}
   lease.Values=new(r,root,parent);
   lease.mainExists=lease.Observe(Path.Combine(dotgit,"config.worktree"));
   lease.originalConfig=await lease.Need(GitOperation.LocalConfig,t);
   lease.originalMain=lease.mainExists?await lease.Need(GitOperation.MainWorktreeConfig,t):"";
   GitRepositoryPolicy.AuditWindowsWorkspace(lease.originalConfig,lease.originalMain);
   var layout=(await lease.Need(GitOperation.Layout,t)).Replace("\r","").TrimEnd('\n').Split('\n');
   if(layout.Length!=4||layout[3]!="true"||!Same(layout[0],root.PathValue)||!Same(layout[1],dotgit)||(layout[2]!=".git"&&!Same(layout[2],dotgit)))throw new WorkspaceException("verification_failed");
   if((await lease.Need(GitOperation.ObjectType,t)).Trim()!="commit"||(await lease.Need(GitOperation.ResolvePin,t)).Trim()!=r.PinnedBaseSha)throw new WorkspaceException("base_unavailable");
   if((await lease.Need(GitOperation.ResolveApprovedBase,t)).Trim()!=r.PinnedBaseSha)throw new WorkspaceException("stale_base");
   var target=Path.Combine(parent.PathValue,r.WorkId);var targetLease=lease.Hold(new("worktree",target,true,null));lease.Hold(new("worktree_pointer",Path.Combine(target,".git"),false,null));
   var pointer=File.ReadAllText(Path.Combine(target,".git")).Trim();if(!pointer.StartsWith("gitdir: "))throw new WorkspaceException("verification_failed");
   var registration=NativeFileEvidence.CanonicalInput(pointer[8..]);var registrationRoot=NativeFileEvidence.CanonicalInput(Path.Combine(dotgit,"worktrees"));
   if(!registration.StartsWith(registrationRoot+"\\",StringComparison.OrdinalIgnoreCase)||registration[(registrationRoot.Length+1)..].Contains('\\'))throw new WorkspaceException("verification_failed");
   var reg=lease.Hold(new("worktree_registration",registration,true,null));
   foreach(var name in new[]{"gitdir","locked","commondir","HEAD"})lease.Observe(Path.Combine(registration,name));
   if(!Same(File.ReadAllText(Path.Combine(registration,"gitdir")).Trim(),Path.Combine(target,".git"))||File.ReadAllText(Path.Combine(registration,"locked")).Trim()!=WindowsGitProcess.LockReason||!Same(Path.GetFullPath(Path.Combine(registration,File.ReadAllText(Path.Combine(registration,"commondir")).Trim())),dotgit))throw new WorkspaceException("verification_failed");
   lease.Values=lease.Values with{Target=targetLease,Registration=reg};
   lease.targetExists=lease.Observe(Path.Combine(registration,"config.worktree"));lease.originalTarget=lease.targetExists?await lease.Need(GitOperation.TargetWorktreeConfig,t):"";GitRepositoryPolicy.AuditWorktreeConfig(lease.originalTarget);
   await lease.ValidateUnchangedAsync(t);return lease;
  }catch{lease.Dispose();throw;}
 }
 async Task<string> Need(GitOperation op,CancellationToken t){ValidateHeld();var result=await git.RunAsync(op,Values,t);ValidateHeld();if(result.TimedOut)throw new WorkspaceException("git_timeout");if(result.OutputLimit)throw new WorkspaceException("git_output_limit");if(result.ExitCode!=0)throw new WorkspaceException("verification_failed");return result.Stdout;}
 internal async Task ValidateUnchangedAsync(CancellationToken t){
  ValidateHeld();if(!await host.IsQualifiedAsync(t))throw new WorkspaceException("host_unqualified");
  var r=Values.Request;
  if((await Need(GitOperation.LocalConfig,t))!=originalConfig||(mainExists&&await Need(GitOperation.MainWorktreeConfig,t)!=originalMain)||(targetExists&&await Need(GitOperation.TargetWorktreeConfig,t)!=originalTarget))throw new WorkspaceException("evidence_changed");
  if((await Need(GitOperation.ResolveApprovedBase,t)).Trim()!=r.PinnedBaseSha)throw new WorkspaceException("stale_base");
  if((await Need(GitOperation.Head,t)).Trim()!=r.PinnedBaseSha||(await Need(GitOperation.SymbolicHead,t)).Trim()!="refs/heads/sdf1/"+r.WorkId||await Need(GitOperation.Status,t)!="")throw new WorkspaceException("workspace_unverified");
  var blocks=(await Need(GitOperation.WorktreeList,t)).Split("\0\0",StringSplitOptions.RemoveEmptyEntries);
  var matches=blocks.Where(b=>b.Split('\0').Any(f=>f.StartsWith("worktree ")&&Same(f[9..],Values.Target!.PathValue))).ToArray();
  if(matches.Length!=1)throw new WorkspaceException("workspace_unverified");var fields=matches[0].Split('\0');
  if(!fields.Contains("branch refs/heads/sdf1/"+r.WorkId)||!fields.Contains("locked "+WindowsGitProcess.LockReason)||!fields.Contains("HEAD "+r.PinnedBaseSha))throw new WorkspaceException("workspace_unverified");ValidateHeld();
 }
 internal Task<string> TreeAsync(CancellationToken t)=>Need(GitOperation.SourceTree,t);
 internal async Task<byte[]> BlobAsync(GitBlobReference b,CancellationToken t){ValidateHeld();if(git is not IWindowsSourceGit source)throw new WorkspaceException("blob_unavailable");var r=await source.ReadBlobAsync(Values,b,t);ValidateHeld();if(r.ExitCode!=0||r.OutputLimit||r.TimedOut)throw new WorkspaceException("blob_unavailable");return r.Stdout;}
 public void Dispose(){disposed=true;for(int i=held.Count-1;i>=0;i--)held[i].Dispose();held.Clear();}
}
