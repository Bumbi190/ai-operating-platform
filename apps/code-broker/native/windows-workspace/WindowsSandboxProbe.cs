using Omnira.CodeBroker.Host;
namespace Omnira.CodeBroker.Workspace;
public sealed record ProbeReport(string Status,string AttemptId,string? Reason,string? BackendIdentityHash,string? DaemonIdentityHash,string? ImageId,string? ContainerId,int? Uid,int? Gid,string[] Inspected,bool ContainerRemoved){
 public string Schema=>"sdf.windows_sandbox_probe.v1";public bool ProductionAuthority=>false;
}
public sealed class WindowsSandboxProbe {
 public const string ImageDigest="sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6";
 public const string ImageReference="docker.io/library/alpine@"+ImageDigest;
 readonly IDockerPeerConnector connector;readonly IHostPreflight host;
 public WindowsSandboxProbe():this(new NativeDockerPeerConnector(),new NativeHostPreflight()){}
 internal WindowsSandboxProbe(IDockerPeerConnector connector,IHostPreflight host){this.connector=connector;this.host=host;}
 public async Task<ProbeReport> RunAsync(Guid attemptId,CancellationToken cancellation){
  if(!WorkspaceJson.Uuid(attemptId.ToString(),true))throw new WorkspaceException("input_invalid");
  using var deadline=CancellationTokenSource.CreateLinkedTokenSource(cancellation);deadline.CancelAfter(20000); // Reserve the remaining ten seconds for cleanup within the overall thirty-second probe.
  var session=new DockerProbeSession(connector);string? image=null,id=null,reason=null;bool mayExist=false,proven=false,removed=false;
  try{
   if(!await host.IsQualifiedAsync(deadline.Token))throw new WorkspaceException("host_unqualified");
   await session.InitializeAsync(deadline.Token);image=await session.ImageAsync(deadline.Token);
   mayExist=true;id=await session.CreateAsync(attemptId,image,deadline.Token);
   using(var inspect=await session.InspectAsync(id,deadline.Token)){if(inspect==null)throw new WorkspaceException("probe_failed");ProbeSpecification.Verify(inspect.RootElement,attemptId,image,id,beforeStart:true);}
   await session.StartAsync(id,deadline.Token);await session.WaitAsync(id,deadline.Token);
   using(var inspect=await session.InspectAsync(id,deadline.Token)){if(inspect==null)throw new WorkspaceException("probe_failed");ProbeSpecification.Verify(inspect.RootElement,attemptId,image,id,finished:true);}
   ProbeSpecification.VerifyLogs(await session.LogsAsync(id,deadline.Token));proven=true;
  }catch(WorkspaceException e){reason=e.Reason;}
  catch(OperationCanceledException){reason="deadline_exceeded";}
  catch{reason="protocol_invalid";}
  finally{
   if(mayExist){
    using var cleanupDeadline=new CancellationTokenSource(10000);
    try{var cleanup=await RemoveOwnedAsync(session,attemptId,image!,id,cleanupDeadline.Token);removed=cleanup.Removed;id=cleanup.Id??id;}catch{removed=false;}
    if(!removed){proven=false;reason="cleanup_retained";}
   }
  }
  if(proven&&removed)return new("ok",attemptId.ToString(),null,session.BackendIdentityHash,session.DaemonIdentityHash,image,id,10001,10001,ProbeSpecification.Protections.ToArray(),true);
  var blocked=reason is "host_unqualified" or "image_missing" or "image_invalid";
  return new(blocked?"blocked":"failed",attemptId.ToString(),reason??"probe_failed",session.BackendIdentityHash,session.DaemonIdentityHash,image,id,null,null,Array.Empty<string>(),removed);
 }
 public async Task<ProbeReport> CleanupAsync(Guid attemptId,CancellationToken cancellation){
  if(!WorkspaceJson.Uuid(attemptId.ToString(),true))throw new WorkspaceException("input_invalid");
  using var deadline=CancellationTokenSource.CreateLinkedTokenSource(cancellation);deadline.CancelAfter(15000);var session=new DockerProbeSession(connector);string? image=null,id=null;
  try{
   if(!await host.IsQualifiedAsync(deadline.Token))throw new WorkspaceException("host_unqualified");
   await session.InitializeAsync(deadline.Token);
   using(var inspect=await session.InspectAsync(ProbeSpecification.Name(attemptId),deadline.Token)){
    if(inspect==null)return new("cleaned",attemptId.ToString(),null,session.BackendIdentityHash,session.DaemonIdentityHash,null,null,null,null,Array.Empty<string>(),true);
   }
   image=await session.ImageAsync(deadline.Token);var cleanup=await RemoveOwnedAsync(session,attemptId,image,null,deadline.Token);id=cleanup.Id;
   if(!cleanup.Removed)throw new WorkspaceException("cleanup_retained");
   return new("cleaned",attemptId.ToString(),null,session.BackendIdentityHash,session.DaemonIdentityHash,image,id,null,null,Array.Empty<string>(),true);
  }catch(WorkspaceException e){return new(e.Reason=="host_unqualified"?"blocked":"failed",attemptId.ToString(),e.Reason,session.BackendIdentityHash,session.DaemonIdentityHash,image,id,null,null,Array.Empty<string>(),false);}
  catch{return new("failed",attemptId.ToString(),"cleanup_retained",session.BackendIdentityHash,session.DaemonIdentityHash,image,id,null,null,Array.Empty<string>(),false);}
 }
 static async Task<(bool Removed,string? Id)> RemoveOwnedAsync(DockerProbeSession session,Guid attempt,string image,string? id,CancellationToken cancellation){
  await session.EnsureLiveAsync(cancellation);
  using(var inspect=await session.InspectAsync(id??ProbeSpecification.Name(attempt),cancellation)){
   if(inspect==null)return(true,id);
   id=ProbeSpecification.Verify(inspect.RootElement,attempt,image,id);
  }
  try{await session.DeleteAsync(id,cancellation);}catch(WorkspaceException e) when(e.Reason is "protocol_invalid" or "deadline_exceeded" or "cleanup_retained"){/* Reconcile an uncertain reply once on the original daemon; identity drift is never swallowed. */}
  using var after=await session.InspectAsync(id,cancellation);return(after==null,id);
 }
}