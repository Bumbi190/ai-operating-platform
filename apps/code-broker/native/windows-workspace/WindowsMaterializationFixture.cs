using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Omnira.CodeBroker.Host;
namespace Omnira.CodeBroker.Workspace;
public sealed class WindowsMaterializationFixture {
 readonly IDockerPeerConnector connector;readonly IHostPreflight host;readonly Func<CancellationToken,Task<SourceSnapshot>> source;readonly NodeToolchainProfile? profile;readonly IMaterializationAttemptJournal journal;readonly int workMs,cleanupMs;
 public WindowsMaterializationFixture():this(new NativeDockerPeerConnector(),new NativeHostPreflight(),null,ToolchainProfile.Current,new MaterializationAttemptJournal()){}
 internal WindowsMaterializationFixture(IDockerPeerConnector c,IHostPreflight h,Func<CancellationToken,Task<SourceSnapshot>>? source,NodeToolchainProfile? p,IMaterializationAttemptJournal journal,int workMs=150000,int cleanupMs=30000){connector=c;host=h;this.source=source??(_=>throw new WorkspaceException("workspace_unverified"));profile=p;this.journal=journal;this.workMs=workMs;this.cleanupMs=cleanupMs;useRealSource=source==null;}
 readonly bool useRealSource;
 static WorkspaceBinding Binding(WorkspaceRequest r)=>new(r.WorkId,r.RepositoryId,r.PinnedBaseSha,r.AdmissionHash,r.ClaimId,r.Fence);
 static void Validate(WorkspaceRequest r,Guid a){r.Validate();if(r.RepositoryId!=RepositoryLocation.RepositoryId||!WorkspaceJson.Uuid(a.ToString(),true))throw new WorkspaceException("input_invalid");}
 public async Task<MaterializationReport> RunAsync(WorkspaceRequest request,Guid attempt,CancellationToken cancellation){
  Validate(request,attempt);var clock=Stopwatch.StartNew();var session=new DockerMaterializationSession(connector);SourceSnapshot? snapshot=null;MaterializationIdentity? identity=null;NodeFixtureResult? fixture=null;string? image=null,reason=null,id=null;bool volumeMayExist=false,containerMayExist=false,containerRemoved=false,volumeRemoved=false;IDisposable? guard=null,record=null;WindowsWorkspaceLease? workspace=null;
  using var work=CancellationTokenSource.CreateLinkedTokenSource(cancellation);work.CancelAfter(workMs);
  try{
   guard=new MaterializationAttemptGuard(attempt);record=journal.Begin(request,attempt,false);
   if(!await host.IsQualifiedAsync(work.Token))throw new WorkspaceException("host_unqualified");var p=ToolchainProfile.RequireReady(profile);
   if(useRealSource){workspace=await WindowsWorkspaceLease.OpenExistingAsync(request,work.Token);snapshot=await SourceSnapshot.BuildAsync(workspace,work.Token);}else snapshot=await source(work.Token);
   if(snapshot.Binding!=Binding(request)||snapshot.PolicyId!=SourceFixturePolicy.Id)throw new WorkspaceException("source_policy_denied");
   foreach(var pin in ToolchainProfile.DescriptorPins)if(snapshot.Files.SingleOrDefault(f=>f.Path==pin.Key)?.Sha256!=pin.Value)throw new WorkspaceException("toolchain_mismatch");
   identity=new(attempt,Binding(request),snapshot.ManifestSha256,p);identity.Validate();var tar=DeterministicSourceTar.Write(snapshot);
   await session.InitializeAsync(work.Token);image=await session.ImageAsync(p,work.Token);
   using(var existing=await session.VolumeAsync(attempt,work.Token))if(existing!=null)throw new WorkspaceException("resource_conflict");
   using(var existing=await session.ContainerAsync(MaterializationSpecification.ContainerName(attempt),work.Token))if(existing!=null)throw new WorkspaceException("resource_conflict");
   journal.BindPeer(request,attempt,new(session.BackendIdentityHash!,session.DaemonIdentityHash!,identity.ProfileHash,identity.ManifestSha256));
   volumeMayExist=true;await session.CreateVolumeAsync(identity,work.Token);string mount;
   using(var volume=await session.VolumeAsync(attempt,work.Token)){if(volume==null)throw new WorkspaceException("materialization_unverified");mount=MaterializationSpecification.VerifyVolume(volume.RootElement,identity);}
   containerMayExist=true;id=await session.CreateContainerAsync(identity,work.Token);
   using(var inspect=await session.ContainerAsync(id,work.Token)){if(inspect==null)throw new WorkspaceException("materialization_unverified");MaterializationSpecification.VerifyContainer(inspect.RootElement,identity,mount,id,true);}
   if(workspace!=null)await workspace.ValidateUnchangedAsync(work.Token);
   await session.UploadAsync(id,tar,work.Token);await session.StartAsync(id,work.Token);var exit=await session.WaitAsync(id,work.Token);
   using(var inspect=await session.ContainerAsync(id,work.Token)){if(inspect==null)throw new WorkspaceException("materialization_unverified");MaterializationSpecification.VerifyContainer(inspect.RootElement,identity,mount,id,finished:exit==0);}
   var logs=MaterializationContracts.Frames(await session.LogsAsync(id,work.Token));
   try{journal.Diagnostic(request,attempt,new UTF8Encoding(false,true).GetString(logs.Out)+"\n"+new UTF8Encoding(false,true).GetString(logs.Error));}catch{/* Evidence is returned in the success DTO; failed diagnostics never confer execution authority. */}
   if(exit!=0||logs.Error.Length!=0)throw new WorkspaceException("fixture_failed");
   fixture=MaterializationContracts.Fixture(logs.Out,snapshot.ManifestSha256);
   if(workspace!=null)await workspace.ValidateUnchangedAsync(work.Token);
  }catch(WorkspaceException e){reason=MaterializationContracts.Map(e.Reason);fixture=null;}
  catch(OperationCanceledException){reason="deadline_exceeded";fixture=null;}
  catch(HostCheckException){reason="host_unqualified";fixture=null;}
  catch{reason="protocol_invalid";fixture=null;}
  finally{
   if(identity!=null&&volumeMayExist){
    var left=Math.Min(cleanupMs,workMs+cleanupMs-(int)Math.Min(int.MaxValue,clock.ElapsedMilliseconds));
    if(left>0){using var cleanup=new CancellationTokenSource(left);try{(containerRemoved,volumeRemoved)=await RemoveAsync(session,identity,containerMayExist,id,cleanup.Token);}catch{containerRemoved=false;volumeRemoved=false;}}
    if(!containerRemoved||!volumeRemoved){fixture=null;reason="cleanup_retained";}
   }
   workspace?.Dispose();record?.Dispose();guard?.Dispose();
  }
  JsonElement? manifest=snapshot==null?null:JsonSerializer.Deserialize<JsonElement>(snapshot.ManifestBytes);
  var status=fixture!=null&&containerRemoved&&volumeRemoved?"verified_for_fixture":reason is "host_unqualified" or "toolchain_unprovisioned" or "toolchain_mismatch" or "workspace_unverified" or "stale_base" or "source_policy_denied" or "secret_pattern_found" or "source_limit" or "blob_unavailable"?"blocked":"failed";
  return new(status,attempt.ToString(),Binding(request),fixture!=null?null:reason??"fixture_failed",SourceFixturePolicy.Id,manifest,snapshot?.ManifestSha256,identity?.ProfileHash,image,session.BackendIdentityHash,session.DaemonIdentityHash,fixture,containerRemoved,volumeRemoved,WorkspaceJson.Now());
 }
 public async Task<MaterializationReport> CleanupAsync(WorkspaceRequest r,Guid attempt,CancellationToken cancellation){
  Validate(r,attempt);using var deadline=CancellationTokenSource.CreateLinkedTokenSource(cancellation);deadline.CancelAfter(cleanupMs);var session=new DockerMaterializationSession(connector);string? reason=null,image=null,profileHash=null;bool cr=false,vr=false;
  try{
   using var guard=new MaterializationAttemptGuard(attempt);using var record=journal.Begin(r,attempt,true);if(!await host.IsQualifiedAsync(deadline.Token))throw new WorkspaceException("host_unqualified");
   var p=ToolchainProfile.RequireReady(profile);profileHash=ToolchainProfile.Hash(p);var prior=journal.ReadPeer(r,attempt);await session.InitializeAsync(deadline.Token);
   if(prior!=null&&(prior.BackendIdentityHash!=session.BackendIdentityHash||prior.DaemonIdentityHash!=session.DaemonIdentityHash||prior.ToolchainProfileHash!=profileHash))throw new WorkspaceException("peer_changed");
   using var volume=await session.VolumeAsync(attempt,deadline.Token);using var container=await session.ContainerAsync(MaterializationSpecification.ContainerName(attempt),deadline.Token);
   if(volume==null&&container==null){cr=true;vr=true;}
   else{
    if(prior==null)throw new WorkspaceException("resource_conflict");
    var metadata=volume?.RootElement.GetProperty("Labels")??container!.RootElement.GetProperty("Config").GetProperty("Labels");
    var hash=MaterializationSpecification.Text(metadata,"omnira.sdf.materialization.sourceManifestSha256");if(!ProbeSpecification.Hash(hash)||hash!=prior.SourceManifestSha256)throw new WorkspaceException("resource_conflict");
    var identity=new MaterializationIdentity(attempt,Binding(r),hash,p);image=await session.ImageAsync(p,deadline.Token);
    (cr,vr)=await RemoveAsync(session,identity,container!=null,null,deadline.Token);
    if(!cr||!vr)throw new WorkspaceException("cleanup_retained");
   }
  }catch(WorkspaceException e){reason=MaterializationContracts.Map(e.Reason);}catch(OperationCanceledException){reason="deadline_exceeded";}catch{reason="cleanup_retained";}
  return new(reason==null?"cleaned":reason is "host_unqualified" or "toolchain_unprovisioned"?"blocked":"failed",attempt.ToString(),Binding(r),reason,SourceFixturePolicy.Id,null,null,profileHash,image,session.BackendIdentityHash,session.DaemonIdentityHash,null,cr,vr,WorkspaceJson.Now());
 }
 internal static async Task<(bool ContainerRemoved,bool VolumeRemoved)> RemoveAsync(DockerMaterializationSession session,MaterializationIdentity i,bool containerMayExist,string? id,CancellationToken t){
  using var volume=await session.VolumeAsync(i.Attempt,t);string? mount=volume==null?null:MaterializationSpecification.VerifyVolume(volume.RootElement,i);
  bool cr;
  using(var container=await session.ContainerAsync(id??MaterializationSpecification.ContainerName(i.Attempt),t)){
   if(container==null)cr=true;
   else{
    if(!containerMayExist||mount==null)throw new WorkspaceException("cleanup_retained");id=MaterializationSpecification.VerifyContainer(container.RootElement,i,mount,id);
    try{await session.DeleteContainerAsync(id,t);}catch(WorkspaceException e)when(e.Reason is "protocol_invalid" or "deadline_exceeded" or "cleanup_retained"){}
    using var after=await session.ContainerAsync(id,t);cr=after==null;
   }
  }
  if(!cr)return(false,false);
  if(volume!=null){try{await session.DeleteVolumeAsync(i.Attempt,t);}catch(WorkspaceException e)when(e.Reason is "protocol_invalid" or "deadline_exceeded" or "cleanup_retained"){}}
  using var afterVolume=await session.VolumeAsync(i.Attempt,t);return(true,afterVolume==null);
 }
}
