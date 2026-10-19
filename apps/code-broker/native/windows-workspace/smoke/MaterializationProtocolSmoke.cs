using System.Text;
using Omnira.CodeBroker.Workspace;
namespace Omnira.CodeBroker.Workspace.Smoke;
internal static class MaterializationProtocolSmoke {
 sealed class PassHost:IHostPreflight{public Task<bool> IsQualifiedAsync(CancellationToken t)=>Task.FromResult(true);}
 sealed class MemoryAttempts:IMaterializationAttemptJournal {
  readonly HashSet<Guid> started=new();internal MaterializationPeer? peer;
  public void BindPeer(WorkspaceRequest r,Guid a,MaterializationPeer p){peer=p;}
  public MaterializationPeer? ReadPeer(WorkspaceRequest r,Guid a)=>peer;
  public IDisposable Begin(WorkspaceRequest r,Guid a,bool cleanup){if(!cleanup&&!started.Add(a))throw new WorkspaceException("resource_conflict");return new Nothing();}
  sealed class Nothing:IDisposable{public void Dispose(){}}
 }
 static WorkspaceRequest Request()=>new("sdf.windows_workspace_request.v1",MaterializationSmoke.Binding.WorkId,MaterializationSmoke.Binding.RepositoryId,MaterializationSmoke.Binding.PinnedBaseSha,MaterializationSmoke.Binding.AdmissionHash,MaterializationSmoke.Binding.ClaimId,1);
 static async Task<SourceSnapshot> Snapshot(){
  var files=SourceFixturePolicy.Paths.ToDictionary(x=>x,x=>Encoding.UTF8.GetBytes("safe fixture\n"));
  foreach(var p in ToolchainProfile.DescriptorPins.Keys)files[p]=File.ReadAllBytes(Path.Combine(@"C:\Users\Andre\Projects\Omnira\.worktrees\c435e423-d964-428b-b5c0-4060d89ce3c6",p));
  string Oid(byte[] b)=>SourceSnapshot.Hex(System.Security.Cryptography.SHA1.HashData(Encoding.ASCII.GetBytes("blob "+b.Length+"\0").Concat(b).ToArray()));
  var tree=string.Join("",files.Select(p=>"100644 blob "+Oid(p.Value)+" "+p.Value.Length+"\t"+p.Key+"\0"));
  return await SourceSnapshot.FromGitAsync(Request(),tree,(b,_)=>Task.FromResult(files[b.Path]),CancellationToken.None);
 }
 internal static async Task Run(Action<string,bool> check){
  var snapshot=await Snapshot();var profile=ToolchainSmoke.Fixture();
  foreach(var mode in new[]{"normal","wrong-peer","early-daemon-drift","lost-volume-create","lost-container-create","lost-archive","lost-start","lost-container-delete","lost-volume-delete","foreign-volume","foreign-container","nonlocal-volume","volume-options","weak-mount","volume-in-use","late-daemon-drift","lost-delete-drift","zero-tests","preexisting","unattempted-container"}){
   var identity=new MaterializationIdentity(Guid.NewGuid(),snapshot.Binding,snapshot.ManifestSha256,profile);var fake=new MaterializationDocker(identity){Fault=mode};
   if(mode=="preexisting")fake.Volume=MaterializationSmoke.Volume(identity);
   var engine=new WindowsMaterializationFixture(fake,new PassHost(),_=>Task.FromResult(snapshot),profile,new MemoryAttempts());
   var r=await engine.RunAsync(Request(),identity.Attempt,CancellationToken.None);
   if(mode is "normal" or "lost-container-delete" or "lost-volume-delete")check("fixture_ok_"+mode,r.Status=="verified_for_fixture"&&r.ContainerRemoved&&r.VolumeRemoved&&r.Fixture!.TotalTests==1&&fake.Starts==1&&fake.Uploads==1&&fake.VolumeCreates==1&&fake.ContainerCreates==1&&fake.Volume==null&&fake.Container==null);
   else check("fixture_refused_"+mode,r.Status!="verified_for_fixture");
   if(mode=="wrong-peer")check("source_wrong_peer_zero_bytes",fake.WrongPeerBytes==0&&fake.Requests.Count==0);
   if(mode is "early-daemon-drift" or "preexisting")check("no_create_"+mode,fake.VolumeCreates==0&&fake.ContainerCreates==0&&fake.VolumeDeletes==0&&fake.ContainerDeletes==0);
   if(mode is "foreign-volume" or "nonlocal-volume" or "volume-options")check("unsafe_volume_not_removed_"+mode,fake.VolumeDeletes==0&&fake.ContainerCreates==0);
   if(mode=="unattempted-container")check("unattempted_container_never_deleted",fake.ContainerCreates==0&&fake.ContainerDeletes==0&&fake.VolumeDeletes==0);
   if(mode=="foreign-container")check("foreign_container_not_removed",fake.ContainerDeletes==0&&fake.Starts==0);
   if(mode is "lost-volume-create" or "lost-container-create" or "lost-archive" or "lost-start")check("uncertain_no_replay_"+mode,r.ContainerRemoved&&r.VolumeRemoved&&fake.Volume==null&&fake.Container==null);
   if(mode is "late-daemon-drift" or "lost-delete-drift")check("late_drift_never_cleanup_proof_"+mode,!r.ContainerRemoved&&!r.VolumeRemoved&&fake.VolumeDeletes==0);
   check("once_"+mode,fake.VolumeCreates<=1&&fake.ContainerCreates<=1&&fake.Uploads<=1&&fake.Starts<=1&&fake.ContainerDeletes<=1&&fake.VolumeDeletes<=1);
  }
  var driftI=new MaterializationIdentity(Guid.NewGuid(),snapshot.Binding,snapshot.ManifestSha256,profile);var driftFake=new MaterializationDocker(driftI){Fault="volume-in-use"};var driftStore=new MemoryAttempts();var driftEngine=new WindowsMaterializationFixture(driftFake,new PassHost(),_=>Task.FromResult(snapshot),profile,driftStore);
  await driftEngine.RunAsync(Request(),driftI.Attempt,CancellationToken.None);driftFake.Changed=true;var afterRestart=await driftEngine.CleanupAsync(Request(),driftI.Attempt,CancellationToken.None);
  check("cleanup_after_daemon_replacement_never_false_absence",afterRestart.Status!="cleaned"&&!afterRestart.ContainerRemoved&&!afterRestart.VolumeRemoved&&driftFake.Volume!=null);
  var raceI=new MaterializationIdentity(Guid.NewGuid(),snapshot.Binding,snapshot.ManifestSha256,profile);var raceFake=new MaterializationDocker(raceI);var barrier=new TaskCompletionSource<SourceSnapshot>(TaskCreationOptions.RunContinuationsAsynchronously);var raceEngine=new WindowsMaterializationFixture(raceFake,new PassHost(),_=>barrier.Task,profile,new MemoryAttempts());
  var first=raceEngine.RunAsync(Request(),raceI.Attempt,CancellationToken.None);var second=await raceEngine.RunAsync(Request(),raceI.Attempt,CancellationToken.None);check("concurrent_same_attempt_no_second_job",second.Reason=="attempt_in_progress"&&raceFake.Requests.Count==0);barrier.SetResult(snapshot);check("single_winner_verified",(await first).Status=="verified_for_fixture");
  var replay=await raceEngine.RunAsync(Request(),raceI.Attempt,CancellationToken.None);check("same_attempt_not_recreated_after_cleanup",replay.Reason=="resource_conflict"&&raceFake.VolumeCreates==1&&raceFake.ContainerCreates==1);
  var absentI=new MaterializationIdentity(Guid.NewGuid(),snapshot.Binding,snapshot.ManifestSha256,profile);var absent=new MaterializationDocker(absentI);var cleanup=new WindowsMaterializationFixture(absent,new PassHost(),_=>Task.FromException<SourceSnapshot>(new Exception("cleanup read source")),profile,new MemoryAttempts());
  var cleaned=await cleanup.CleanupAsync(Request(),absentI.Attempt,CancellationToken.None);check("cleanup_is_not_execution",cleaned.Status=="cleaned"&&cleaned.Fixture==null&&cleaned.Manifest==null&&cleaned.ContainerRemoved&&cleaned.VolumeRemoved&&absent.VolumeCreates==0&&absent.ContainerCreates==0&&absent.Starts==0);
  var blocked=new MaterializationDocker(absentI);var bad=new WindowsMaterializationFixture(blocked,new PassHost(),_=>Task.FromException<SourceSnapshot>(new WorkspaceException("source_policy_denied")),profile,new MemoryAttempts());var refused=await bad.RunAsync(Request(),absentI.Attempt,CancellationToken.None);check("rejected_source_zero_http",refused.Reason=="source_policy_denied"&&blocked.Requests.Count==0);
  var slowI=new MaterializationIdentity(Guid.NewGuid(),snapshot.Binding,snapshot.ManifestSha256,profile);var slow=new MaterializationDocker(slowI){Fault="slow-archive"};var clock=System.Diagnostics.Stopwatch.StartNew();
  var timed=await new WindowsMaterializationFixture(slow,new PassHost(),_=>Task.FromResult(snapshot),profile,new MemoryAttempts(),1500,500).RunAsync(Request(),slowI.Attempt,CancellationToken.None);
  check("total_budget_reserves_cleanup",clock.ElapsedMilliseconds<2500&&timed.Status=="failed"&&timed.ContainerRemoved&&timed.VolumeRemoved);
  check("oversized_archive_before_connect",PathProcessSmoke.Refused(()=>VerifiedDockerRequest.Archive(new string('d',64),new byte[17825793])));
 }
}
