using System.Diagnostics;
using System.Text.Json;
using Omnira.CodeBroker.Host;
using Omnira.CodeBroker.Workspace;
namespace Omnira.CodeBroker.Workspace.Smoke;
internal sealed class RepoFixture:IDisposable {
 public string Folder{get;}=PathProcessSmoke.Fixture();
 public string Root=>Path.Combine(Folder,"source with spaces");public string Parent=>Path.Combine(Folder,"worktrees");
 public RepositoryLocation Location=>new(new("checkout",Root,true,null),new("worktree_parent",Parent,true,null),HostProfile.Targets.Single(t=>t.Id=="git"));
 public string Head{get;}
 public RepoFixture(){
  Directory.CreateDirectory(Root);Directory.CreateDirectory(Parent);Directory.CreateDirectory(Path.Combine(Folder,"hooks"));
  Git("init","-b","main");Git("config","user.name","Owned fixture");Git("config","user.email","fixture@example.invalid");
  Git("config","remote.origin.url","https://github.com/bumbi190/ai-operating-platform.git");
  File.WriteAllText(Path.Combine(Root,"file.txt"),"original\n");File.WriteAllText(Path.Combine(Root,".gitignore"),".env\nnode_modules/\n");Git("add","file.txt",".gitignore");Git("commit","-m","Owned synthetic base");
  Head=Git("rev-parse","HEAD").Trim();Git("update-ref","refs/remotes/origin/main",Head);
  File.WriteAllText(Path.Combine(Root,".env"),"ignored fixture secret");Directory.CreateDirectory(Path.Combine(Root,"node_modules"));File.WriteAllText(Path.Combine(Root,"node_modules","fixture"),"ignored");
 }
 public WorkspaceRequest Request()=>new("sdf.windows_workspace_request.v1",Guid.NewGuid().ToString(),RepositoryLocation.RepositoryId,Head,new string('a',64),Guid.NewGuid().ToString(),1);
 public string Git(params string[] argv){
  var start=new ProcessStartInfo(HostProfile.Targets.Single(t=>t.Id=="git").Path){WorkingDirectory=Root,UseShellExecute=false,RedirectStandardOutput=true,RedirectStandardError=true};
  start.Environment.Clear();start.Environment["SystemRoot"]=@"C:\Windows";start.Environment["PATH"]=@"C:\Program Files\Git\cmd;C:\Windows\System32";start.Environment["HOME"]=Folder;start.Environment["GIT_CONFIG_NOSYSTEM"]="1";start.Environment["GIT_CONFIG_GLOBAL"]="NUL";
  start.ArgumentList.Add("-c");start.ArgumentList.Add("core.hooksPath="+Path.Combine(Folder,"hooks"));start.ArgumentList.Add("-c");start.ArgumentList.Add("commit.gpgsign=false");
  foreach(var value in argv)start.ArgumentList.Add(value);
  using var process=Process.Start(start)!;var output=process.StandardOutput.ReadToEnd();var error=process.StandardError.ReadToEnd();if(!process.WaitForExit(10000)||process.ExitCode!=0)throw new Exception("fixture Git failed: "+error);return output;
 }
 public WindowsWorktree Engine(IWindowsGit? runner=null)=>new(Location,runner??new WindowsGitProcess(),new PassingHost());
 public void Dispose(){if(Directory.Exists(Folder))DeleteOwned(Folder);}
 static void DeleteOwned(string path){
  foreach(var entry in Directory.EnumerateFileSystemEntries(path)){
   var attrs=File.GetAttributes(entry);
   if((attrs&FileAttributes.Directory)!=0){if((attrs&FileAttributes.ReparsePoint)!=0)Directory.Delete(entry);else DeleteOwned(entry);}
   else{if((attrs&FileAttributes.ReparsePoint)==0)File.SetAttributes(entry,attrs&~FileAttributes.ReadOnly);File.Delete(entry);}
  }
  File.SetAttributes(path,File.GetAttributes(path)&~FileAttributes.ReadOnly);Directory.Delete(path);
 }
 sealed class PassingHost:IHostPreflight{public Task<bool> IsQualifiedAsync(CancellationToken cancellation)=>Task.FromResult(true);}
}
internal sealed class RecordingGit:IWindowsGit {
 readonly IWindowsGit inner=new WindowsGitProcess();public int Adds;public bool FailHead,ChangeBase;int baseReads;
 public async Task<GitProcessResult> RunAsync(GitOperation op,GitOperationValues values,CancellationToken cancellation){
  if(op==GitOperation.WorktreeAdd)Interlocked.Increment(ref Adds);
  if(op==GitOperation.Head&&FailHead)return new(1,"",false,false);
  var result=await inner.RunAsync(op,values,cancellation);
  if(op==GitOperation.ResolveApprovedBase&&ChangeBase&&Interlocked.Increment(ref baseReads)>1)return result with{Stdout=new string('c',40)+"\n"};
  return result;
 }
}
internal static class WorktreeSmoke {
 sealed class AllowedHost:IHostPreflight{public Task<bool> IsQualifiedAsync(CancellationToken cancellation)=>Task.FromResult(true); }
 public static async Task Run(Action<string,bool> check){
  using(var f=new RepoFixture()){
   var request=f.Request();var runner=new RecordingGit();var engine=f.Engine(runner);
   var first=await engine.PrepareAsync(request,CancellationToken.None);
   check("real_synthetic_worktree_prepared",first.Status=="prepared"&&first.HeadSha==request.PinnedBaseSha&&first.BranchName=="sdf1/"+request.WorkId&&first.WorkspaceRetained);
   var target=Path.Combine(f.Parent,request.WorkId);
   check("source_file_materialized",File.ReadAllText(Path.Combine(target,"file.txt"))=="original\n");
   check("ignored_env_modules_not_copied",!File.Exists(Path.Combine(target,".env"))&&!Directory.Exists(Path.Combine(target,"node_modules")));
   check("main_checkout_unchanged",File.ReadAllText(Path.Combine(f.Root,"file.txt"))=="original\n");
   check("worktree_locked",f.Git("worktree","list","--porcelain").Contains("locked omnira-sdf explicit-cleanup-only"));
   var again=await engine.PrepareAsync(request,CancellationToken.None);check("target_and_branch_collisions_refused",again.Status=="refused"&&again.Reason=="target_exists"&&runner.Adds==1);
   check("missing_or_stale_pin_refused",(await engine.PrepareAsync(request with{WorkId=Guid.NewGuid().ToString(),PinnedBaseSha=new string('b',40)},CancellationToken.None)).Status=="refused");
   var stale=f.Request();File.WriteAllText(Path.Combine(f.Root,"file.txt"),"next\n");f.Git("add","file.txt");f.Git("commit","-m","Second owned fixture commit");f.Git("update-ref","refs/remotes/origin/main",f.Git("rev-parse","HEAD").Trim());
   check("stale_base_exact_ref_refused",(await engine.PrepareAsync(stale,CancellationToken.None)).Status=="stale_base");
  }
  using(var f=new RepoFixture()){f.Git("config","remote.origin.url","https://github.com/other/repository.git");check("wrong_remote_refused",(await f.Engine().PrepareAsync(f.Request(),CancellationToken.None)).Reason=="remote_identity_mismatch");}
  foreach(var key in new[]{"filter.fixture.smudge","core.hooksPath","include.path","credential.helper","core.fsmonitor","core.worktree"}){
   using var f=new RepoFixture();f.Git("config",key,key=="extensions.worktreeConfig"?"true":"fixture-untrusted");
   check("unsafe_filter_hook_include_refused_"+key,(await f.Engine().PrepareAsync(f.Request(),CancellationToken.None)).Status=="refused");
  }
  using(var f=new RepoFixture()){
   var r=f.Request();f.Git("branch","sdf1/"+r.WorkId,f.Head);check("existing_branch_refused",(await f.Engine().PrepareAsync(r,CancellationToken.None)).Reason=="branch_exists");
   r=f.Request();Directory.CreateDirectory(Path.Combine(f.Parent,r.WorkId));check("existing_directory_refused",(await f.Engine().PrepareAsync(r,CancellationToken.None)).Reason=="target_exists");
  }
  using(var f=new RepoFixture()){
   var r=f.Request();var engine=f.Engine();var race=await Task.WhenAll(engine.PrepareAsync(r,CancellationToken.None),engine.PrepareAsync(r,CancellationToken.None));
   check("same_workid_one_winner",race.Count(v=>v.Status=="prepared")==1&&race.Count(v=>v.Status!="prepared")==1);
  }
  using(var f=new RepoFixture()){
   var runner=new RecordingGit{FailHead=true};var r=f.Request();var result=await f.Engine(runner).PrepareAsync(r,CancellationToken.None);
   check("post_add_failure_retained",result.Status=="failed"&&result.WorkspaceRetained&&Directory.Exists(Path.Combine(f.Parent,r.WorkId))&&runner.Adds==1);
  }
  using(var f=new RepoFixture()){
   var runner=new RecordingGit{ChangeBase=true};var r=f.Request();var result=await f.Engine(runner).PrepareAsync(r,CancellationToken.None);
   check("base_drift_after_preflight_never_prepared",result.Status=="failed"&&result.WorkspaceRetained);
  }
  using(var f=new RepoFixture()){
   var link=Path.Combine(f.Folder,"linked parent");Omnira.CodeBroker.Host.Smoke.FixtureJunction.Create(link,f.Parent);
   try{var location=f.Location with{Parent=new("worktree_parent",link,true,null)};var result=await new WindowsWorktree(location,new WindowsGitProcess(),new AllowedHost()).PrepareAsync(f.Request(),CancellationToken.None);check("replaced_ancestor_refused",result.Status=="refused"&&result.Reason=="unsafe_path");}
   finally{Directory.Delete(link);}
  }
  using(var f=new RepoFixture()){
   var marker=Path.Combine(f.Folder,"hook-ran");var hookFolder=Path.Combine(f.Folder,"hostile hooks");Directory.CreateDirectory(hookFolder);
   File.WriteAllText(Path.Combine(hookFolder,"post-checkout"),"#!/bin/sh\necho wrong > '"+marker.Replace('\\','/')+"'\n");
   File.WriteAllText(Path.Combine(f.Folder,".gitconfig"),"[core]\n hooksPath = \""+hookFolder.Replace('\\','/')+"\"\n[credential]\n helper = !echo wrong\n");
   var home=Environment.GetEnvironmentVariable("HOME");var config=Environment.GetEnvironmentVariable("GIT_CONFIG_GLOBAL");
   Environment.SetEnvironmentVariable("HOME",f.Folder);Environment.SetEnvironmentVariable("GIT_CONFIG_GLOBAL",Path.Combine(f.Folder,".gitconfig"));
   try{check("global_hook_credential_sentinels_untouched",(await f.Engine().PrepareAsync(f.Request(),CancellationToken.None)).Status=="prepared"&&!File.Exists(marker));}
   finally{Environment.SetEnvironmentVariable("HOME",home);Environment.SetEnvironmentVariable("GIT_CONFIG_GLOBAL",config);}
   var json=System.Text.Json.JsonSerializer.Serialize(f.Request(),WorkspaceJson.Options);
   check("extra_input_refused",PathProcessSmoke.Refused(()=>WorkspaceRequest.Parse(json[..^1]+",\"cwd\":\"C:/tmp\"}")));
   check("duplicate_input_refused",PathProcessSmoke.Refused(()=>WorkspaceRequest.Parse(json[..^1]+",\"fence\":2}")));
  }
  foreach(var name in new[]{"fetch","pull","commit","push","clone","reset","restore","exec","shell","cleanup"})check("forbidden_git_operation_"+name,!Enum.TryParse<GitOperation>(name,true,out _));
  check("undefined_git_operation_refused",PathProcessSmoke.Refused(()=>WindowsGitProcess.OperationArguments((GitOperation)999,Guid.NewGuid().ToString(),new string('b',40),"C:/fixed/uuid")));
  var vectors=System.Text.Json.JsonDocument.Parse(File.ReadAllText(Path.Combine(Environment.CurrentDirectory,"apps/web/lib/qa/fixtures/sdf-windows-git-policy-vectors.json")));
  using(vectors)foreach(var vector in vectors.RootElement.EnumerateArray()){
   bool allowed=true;try{GitRepositoryPolicy.AuditConfig(vector.GetProperty("config").GetString()!);}catch(WorkspaceException){allowed=false;}
   check("git_policy_parity_"+vector.GetProperty("id").GetString(),allowed==vector.GetProperty("allowed").GetBoolean());
  }

  await EntryChecks(check);
 }

 static async Task EntryChecks(Action<string,bool> check){
  var helper=Path.Combine(Environment.CurrentDirectory,"apps/code-broker/native/windows-workspace/bin/Release/net8.0-windows/OmniraBrokerWorkspace.dll");
  foreach(var item in new[]{(new[]{"unexpected"},""),(new[]{"prepare","extra"},""),(new[]{"prepare"},"{}"),(new[]{"prepare"},"{\"fence\":1,\"fence\":2}"),(new[]{"prepare"},new string('x',4097))}){
   var start=new ProcessStartInfo(HostProfile.Targets.Single(t=>t.Id=="dotnet").Path){UseShellExecute=false,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
   start.ArgumentList.Add(helper);foreach(var arg in item.Item1)start.ArgumentList.Add(arg);
   using var process=Process.Start(start)!;await process.StandardInput.WriteAsync(item.Item2);process.StandardInput.Close();var output=await process.StandardOutput.ReadToEndAsync();var error=await process.StandardError.ReadToEndAsync();await process.WaitForExitAsync();
   check("helper_closed_entry_"+Guid.NewGuid().ToString("N"),process.ExitCode==1&&output==""&&error.Trim()=="broker_windows_workspace_failed");
  }
 }
}
