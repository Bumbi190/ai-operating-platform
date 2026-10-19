using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace Omnira.CodeBroker.Workspace;
internal sealed record MaterializationPeer(string BackendIdentityHash,string DaemonIdentityHash,string ToolchainProfileHash,string SourceManifestSha256);
internal interface IMaterializationAttemptJournal {
 IDisposable Begin(WorkspaceRequest request,Guid attempt,bool cleanup);
 void BindPeer(WorkspaceRequest request,Guid attempt,MaterializationPeer peer);
 MaterializationPeer? ReadPeer(WorkspaceRequest request,Guid attempt);
 void Diagnostic(WorkspaceRequest request,Guid attempt,string text){}
}
internal sealed class MaterializationAttemptJournal:IMaterializationAttemptJournal {
 readonly string root;
 internal MaterializationAttemptJournal():this(Path.Combine(AppContext.BaseDirectory,"attempts")){}
 internal MaterializationAttemptJournal(string root){this.root=root;}
 internal static string ReservationName(Guid a)=>a.ToString()+".reserved.json";
 static string StartedName(Guid a)=>a.ToString()+".started.json";
 public IDisposable Begin(WorkspaceRequest request,Guid attempt,bool cleanup){
  request.Validate();if(!WorkspaceJson.Uuid(attempt.ToString(),true))throw new WorkspaceException("input_invalid");
  var held=new List<ProtectedPathLease>();var user=WindowsIdentity.GetCurrent().User!.Value;
  ProtectedPathLease Hold(string p,bool dir){var l=ProtectedPathLease.Acquire(new("materialization_attempt",p,dir,null),user);held.Add(l);return l;}
  try{
   Hold(root,true);var reservation=Path.Combine(root,ReservationName(attempt));Hold(reservation,false);var bytes=Read(reservation);Validate(bytes,request,attempt);
   var started=Path.Combine(root,StartedName(attempt));
   if(!cleanup||!File.Exists(started)){
    try{using var file=new FileStream(started,FileMode.CreateNew,FileAccess.Write,FileShare.Read);file.Write(bytes);file.Flush(true);}catch(IOException){throw new WorkspaceException("resource_conflict");}
   }
   if(File.Exists(started)){Hold(started,false);Validate(Read(started),request,attempt);}
   return new Held(held);
  }catch{for(int n=held.Count-1;n>=0;n--)held[n].Dispose();throw;}
 }
 static byte[] Read(string p){if(new FileInfo(p).Length>4096)throw new WorkspaceException("input_invalid");var bytes=File.ReadAllBytes(p);if(bytes.Length>4096)throw new WorkspaceException("input_invalid");return bytes;}
 static void Validate(byte[] bytes,WorkspaceRequest request,Guid attempt){
  using var doc=WorkspaceJson.Document(new UTF8Encoding(false,true).GetString(bytes));var r=doc.RootElement;WorkspaceJson.Keys(r,"schema","workId","repositoryId","pinnedBaseSha","admissionHash","claimId","fence","attemptId");
  if(WorkspaceJson.String(r,"schema")!="sdf.windows_materialization_reservation.v1"||WorkspaceJson.String(r,"attemptId")!=attempt.ToString()||WorkspaceJson.String(r,"workId")!=request.WorkId||WorkspaceJson.String(r,"repositoryId")!=request.RepositoryId||WorkspaceJson.String(r,"pinnedBaseSha")!=request.PinnedBaseSha||WorkspaceJson.String(r,"admissionHash")!=request.AdmissionHash||WorkspaceJson.String(r,"claimId")!=request.ClaimId||!r.GetProperty("fence").TryGetInt64(out var fence)||fence!=request.Fence)throw new WorkspaceException("input_invalid");
 }
 static string BindingHash(WorkspaceRequest r)=>Omnira.CodeBroker.Host.NativeFileEvidence.Hash(JsonSerializer.Serialize(new WorkspaceBinding(r.WorkId,r.RepositoryId,r.PinnedBaseSha,r.AdmissionHash,r.ClaimId,r.Fence),WorkspaceJson.Options));
 public void BindPeer(WorkspaceRequest r,Guid a,MaterializationPeer peer){
  foreach(var value in new[]{peer.BackendIdentityHash,peer.DaemonIdentityHash,peer.ToolchainProfileHash,peer.SourceManifestSha256})if(!ProbeSpecification.Hash(value))throw new WorkspaceException("workspace_unverified");
  var bytes=JsonSerializer.SerializeToUtf8Bytes(new{schema="sdf.windows_materialization_peer.v1",attemptId=a.ToString(),bindingHash=BindingHash(r),peer.BackendIdentityHash,peer.DaemonIdentityHash,peer.ToolchainProfileHash,peer.SourceManifestSha256},WorkspaceJson.Options);
  using var file=new FileStream(Path.Combine(root,a.ToString()+".peer.json"),FileMode.CreateNew,FileAccess.Write,FileShare.Read);file.Write(bytes);file.Flush(true);
 }
 public MaterializationPeer? ReadPeer(WorkspaceRequest r,Guid a){
  var path=Path.Combine(root,a.ToString()+".peer.json");if(!File.Exists(path))return null;
  using var held=ProtectedPathLease.Acquire(new("materialization_peer",path,false,null),WindowsIdentity.GetCurrent().User!.Value);using var doc=WorkspaceJson.Document(new UTF8Encoding(false,true).GetString(Read(path)));var data=doc.RootElement;
  WorkspaceJson.Keys(data,"schema","attemptId","bindingHash","backendIdentityHash","daemonIdentityHash","toolchainProfileHash","sourceManifestSha256");
  if(WorkspaceJson.String(data,"schema")!="sdf.windows_materialization_peer.v1"||WorkspaceJson.String(data,"attemptId")!=a.ToString()||WorkspaceJson.String(data,"bindingHash")!=BindingHash(r))throw new WorkspaceException("workspace_unverified");
  var result=new MaterializationPeer(WorkspaceJson.String(data,"backendIdentityHash"),WorkspaceJson.String(data,"daemonIdentityHash"),WorkspaceJson.String(data,"toolchainProfileHash"),WorkspaceJson.String(data,"sourceManifestSha256"));
  foreach(var value in new[]{result.BackendIdentityHash,result.DaemonIdentityHash,result.ToolchainProfileHash,result.SourceManifestSha256})if(!ProbeSpecification.Hash(value))throw new WorkspaceException("workspace_unverified");held.ValidateUnchanged();return result;
 }
 public void Diagnostic(WorkspaceRequest r,Guid a,string text){
  // This is scoped infrastructure bookkeeping; no job/model chooses a path or gets a file-write API.
  var safe=Regex.Replace(text,@"(?:sk-proj-|sk-ant-|sk-)[A-Za-z0-9_-]{20,}","[redacted-token]",RegexOptions.CultureInvariant,TimeSpan.FromSeconds(1));
  safe=Regex.Replace(safe,@"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----","[redacted-key]",RegexOptions.Singleline|RegexOptions.CultureInvariant,TimeSpan.FromSeconds(1));
  var bytes=Encoding.UTF8.GetBytes(safe);if(bytes.Length>65536)bytes=bytes[..65536];var target=Path.Combine(root,a.ToString()+".diagnostic.txt");
  using var file=new FileStream(target,FileMode.CreateNew,FileAccess.Write,FileShare.Read);file.Write(bytes);file.Flush(true);
 }
 sealed class Held:IDisposable{readonly List<ProtectedPathLease> held;internal Held(List<ProtectedPathLease> held){this.held=held;}public void Dispose(){for(int n=held.Count-1;n>=0;n--)held[n].Dispose();held.Clear();}}
}
internal sealed class MaterializationAttemptGuard:IDisposable {
 readonly Semaphore semaphore;bool acquired;
 internal MaterializationAttemptGuard(Guid a){
  if(!WorkspaceJson.Uuid(a.ToString(),true))throw new WorkspaceException("input_invalid");
  var user=Omnira.CodeBroker.Host.NativeFileEvidence.Hash(WindowsIdentity.GetCurrent().User!.Value)[..16];
  semaphore=new Semaphore(1,1,"Local\\OmniraSdfMaterialization-"+user+"-"+a.ToString("N"));
  if(!semaphore.WaitOne(0)){semaphore.Dispose();throw new WorkspaceException("attempt_in_progress");}acquired=true;
 }
 public void Dispose(){if(acquired){acquired=false;semaphore.Release();semaphore.Dispose();}}
}
