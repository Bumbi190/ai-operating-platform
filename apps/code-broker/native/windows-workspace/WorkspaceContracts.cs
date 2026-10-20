using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
namespace Omnira.CodeBroker.Workspace;
public sealed class WorkspaceException:Exception {
 public string Reason{get;}
 public WorkspaceException(string reason):base("Windows workspace operation refused"){Reason=reason;}
}
internal sealed record NativeBytesResult(int? ExitCode,byte[] Stdout,bool TimedOut,bool OutputLimit);
internal sealed record GitProcessResult(int? ExitCode,string Stdout,bool TimedOut,bool OutputLimit);
internal static class WorkspaceJson {
 internal static readonly JsonSerializerOptions Options=new(){PropertyNamingPolicy=JsonNamingPolicy.CamelCase,DefaultIgnoreCondition=JsonIgnoreCondition.WhenWritingNull};
 internal static JsonDocument Document(string json){
  if(System.Text.Encoding.UTF8.GetByteCount(json)>4096)throw new WorkspaceException("input_invalid");
  try{var doc=JsonDocument.Parse(json,new JsonDocumentOptions{MaxDepth=16});Unique(doc.RootElement);return doc;}catch{throw new WorkspaceException("input_invalid");}
 }
 internal static void Unique(JsonElement value){
  if(value.ValueKind==JsonValueKind.Object){var names=new HashSet<string>(StringComparer.Ordinal);foreach(var p in value.EnumerateObject()){if(!names.Add(p.Name))throw new WorkspaceException("input_invalid");Unique(p.Value);}}
  else if(value.ValueKind==JsonValueKind.Array)foreach(var v in value.EnumerateArray())Unique(v);
 }
 internal static void Keys(JsonElement root,params string[] keys){
  if(root.ValueKind!=JsonValueKind.Object||!root.EnumerateObject().Select(p=>p.Name).Order().SequenceEqual(keys.Order()))throw new WorkspaceException("input_invalid");
 }
 internal static string String(JsonElement root,string key){if(!root.TryGetProperty(key,out var value)||value.ValueKind!=JsonValueKind.String)throw new WorkspaceException("input_invalid");return value.GetString()!;}
 internal static bool Uuid(string s,bool v4=false)=>Regex.IsMatch(s,v4?@"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$":@"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",RegexOptions.CultureInvariant);
 internal static string Now()=>DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ",CultureInfo.InvariantCulture);
}
public sealed record WorkspaceRequest(string Schema,string WorkId,string RepositoryId,string PinnedBaseSha,string AdmissionHash,string ClaimId,long Fence){
 internal void Validate(){
  if(Schema!="sdf.windows_workspace_request.v1"||!WorkspaceJson.Uuid(WorkId,true)||!WorkspaceJson.Uuid(ClaimId)||!Regex.IsMatch(PinnedBaseSha,@"^[0-9a-f]{40}$")||!Regex.IsMatch(AdmissionHash,@"^[0-9a-f]{64}$")||RepositoryId.Length>256||Fence<1||Fence>9007199254740991)throw new WorkspaceException("input_invalid");
 }
 internal static WorkspaceRequest Parse(string json){
  using var doc=WorkspaceJson.Document(json);var root=doc.RootElement;
  WorkspaceJson.Keys(root,"schema","workId","repositoryId","pinnedBaseSha","admissionHash","claimId","fence");
  if(!root.GetProperty("fence").TryGetInt64(out var fence))throw new WorkspaceException("input_invalid");
  var result=new WorkspaceRequest(WorkspaceJson.String(root,"schema"),WorkspaceJson.String(root,"workId"),WorkspaceJson.String(root,"repositoryId"),WorkspaceJson.String(root,"pinnedBaseSha"),WorkspaceJson.String(root,"admissionHash"),WorkspaceJson.String(root,"claimId"),fence);result.Validate();return result;
 }
}
public sealed record WorkspaceBinding(string WorkId,string RepositoryId,string PinnedBaseSha,string AdmissionHash,string ClaimId,long Fence);
public sealed record WorkspaceReport(string Status,bool WorkspaceRetained,string? Reason=null,WorkspaceBinding? Binding=null,string? PinnedBaseSha=null,string? ObservedBaseSha=null,string? HeadSha=null,string? BranchName=null,string? WorktreePathHash=null,string? RemoteIdentityHash=null,string? WorkspaceIdentityHash=null,string? ObservedAt=null){
 public string Schema=>"sdf.windows_workspace_report.v1";
 public bool ProductionAuthority=>false;
}
