using Omnira.CodeBroker.Workspace;
namespace Omnira.CodeBroker.Workspace.Smoke;
internal sealed class ConfigRecordingGit:IWindowsGit {
 readonly WindowsGitProcess inner=new();internal int Adds,Heads,ConfigReads;internal Action<GitOperation,GitOperationValues>? Before,After;internal bool ChangeConfigReply;
 public async Task<GitProcessResult> RunAsync(GitOperation op,GitOperationValues values,CancellationToken token){
  Before?.Invoke(op,values);if(op==GitOperation.WorktreeAdd)Adds++;if(op==GitOperation.Head)Heads++;
  var result=await inner.RunAsync(op,values,token);After?.Invoke(op,values);
  if(op.ToString()=="MainWorktreeConfig"&&++ConfigReads>1&&ChangeConfigReply)return result with{Stdout="core.autocrlf\ntrue\0"};
  return result;
 }
}
internal static class WorktreeConfigSmoke {
 static string MainConfig(RepoFixture f)=>Path.Combine(f.Root,".git","config.worktree");
 static string Registration(GitOperationValues v)=>File.ReadAllText(Path.Combine(v.Parent.PathValue,v.Request.WorkId,".git")).Trim()[8..];
 static void Enable(RepoFixture f,string? config=null){f.Git("config","extensions.worktreeConfig","true");if(config!=null)File.WriteAllText(MainConfig(f),config);}
 public static async Task Run(Action<string,bool> check){
  foreach(bool exists in new[]{false,true}){
   using var f=new RepoFixture();Enable(f,exists?"[core]\n autocrlf = false\n":null);var runner=new ConfigRecordingGit();
   var before=File.ReadAllBytes(Path.Combine(f.Root,".git","config"));var local=exists?File.ReadAllBytes(MainConfig(f)):null;
   var result=await f.Engine(runner).PrepareAsync(f.Request(),CancellationToken.None);
   check(exists?"worktree_config_harmless_prepared":"worktree_config_absent_prepared",result.Status=="prepared"&&runner.Adds==1);
   check("worktree_config_shared_settings_unchanged_"+exists,File.ReadAllBytes(Path.Combine(f.Root,".git","config")).SequenceEqual(before)&&(exists?File.ReadAllBytes(MainConfig(f)).SequenceEqual(local!):!File.Exists(MainConfig(f))));
  }
  foreach(var item in new[]{
   ("hook","[core]\n hooksPath = fixture-untrusted\n"),
   ("include","[include]\n path = fixture-untrusted\n"),
   ("filter","[filter \"fixture\"]\n smudge = fixture-untrusted\n"),
   ("credential","[credential]\n helper = !fixture-untrusted\n"),
   ("fsmonitor","[core]\n fsmonitor = fixture-untrusted\n"),
   ("worktree","[core]\n worktree = ../redirected\n"),
   ("bare","[core]\n bare = true\n"),
   ("remote","[remote \"origin\"]\n url = https://github.com/foreign/repo.git\n")}){
   using var f=new RepoFixture();Enable(f,item.Item2);var runner=new ConfigRecordingGit();var result=await f.Engine(runner).PrepareAsync(f.Request(),CancellationToken.None);
   check("unsafe_per_worktree_"+item.Item1+"_before_add",result.Status=="refused"&&!result.WorkspaceRetained&&runner.Adds==0);
  }
  using(var f=new RepoFixture()){
   Enable(f,"[core]\n autocrlf = false\n");bool denied=false;var runner=new ConfigRecordingGit{Before=(op,v)=>{if(op==GitOperation.WorktreeAdd){try{File.AppendAllText(MainConfig(f),"# unexpected");}catch(IOException){denied=true;}}}};
   var result=await f.Engine(runner).PrepareAsync(f.Request(),CancellationToken.None);
   check("existing_per_worktree_file_write_blocked_through_add",result.Status=="prepared"&&denied);
  }
  using(var f=new RepoFixture()){
   Enable(f);var runner=new ConfigRecordingGit{After=(op,v)=>{if(op==GitOperation.ResolvePin)File.WriteAllText(MainConfig(f),"[core]\n autocrlf=false\n");}};
   var result=await f.Engine(runner).PrepareAsync(f.Request(),CancellationToken.None);
   check("absent_per_worktree_file_appearing_before_add_refused",result.Status=="refused"&&result.Reason=="evidence_changed"&&runner.Adds==0);
  }
  foreach(bool unsafeConfig in new[]{false,true}){
   using var f=new RepoFixture();Enable(f);var runner=new ConfigRecordingGit{After=(op,v)=>{if(op==GitOperation.WorktreeAdd)File.WriteAllText(Path.Combine(Registration(v),"config.worktree"),unsafeConfig?"[core]\n worktree=../redirected\n":"[core]\n autocrlf=false\n");}};
   var result=await f.Engine(runner).PrepareAsync(f.Request(),CancellationToken.None);
   check("new_registration_config_checked_before_head_"+unsafeConfig,unsafeConfig?result.Status=="failed"&&result.WorkspaceRetained&&runner.Heads==0:result.Status=="prepared"&&result.HeadSha==f.Head&&runner.Heads>=1);
  }
  using(var f=new RepoFixture()){
   Enable(f,"[core]\n autocrlf=false\n");var runner=new ConfigRecordingGit{ChangeConfigReply=true};
   var result=await f.Engine(runner).PrepareAsync(f.Request(),CancellationToken.None);
   check("per_worktree_audit_reply_drift_retains_workspace",result.Status=="failed"&&result.WorkspaceRetained&&result.Reason=="evidence_changed");
  }
  using(var f=new RepoFixture()){
   var marker=Path.Combine(f.Folder,"per-config-hook-ran");var hooks=Path.Combine(f.Folder,"per-config-hooks");Directory.CreateDirectory(hooks);
   File.WriteAllText(Path.Combine(hooks,"post-checkout"),"#!/bin/sh\necho wrong > '"+marker.Replace('\\','/')+"'\n");
   Enable(f,"[core]\n hooksPath = \""+hooks.Replace('\\','/')+"\"\n");var runner=new ConfigRecordingGit();
   var result=await f.Engine(runner).PrepareAsync(f.Request(),CancellationToken.None);
   check("per_worktree_hook_sentinel_never_executed",result.Status=="refused"&&runner.Adds==0&&!File.Exists(marker));
  }
  bool refused=false;try{GitRepositoryPolicy.AuditConfig("remote.origin.url\nhttps://github.com/bumbi190/ai-operating-platform.git\0extensions.worktreeConfig\ntrue\0");}catch(WorkspaceException){refused=true;}
  check("default_git_policy_still_refuses_extension",refused);
 }
}
