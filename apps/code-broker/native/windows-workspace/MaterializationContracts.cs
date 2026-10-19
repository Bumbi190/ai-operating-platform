using System.Buffers.Binary;
using System.Text;
using System.Text.Json;
namespace Omnira.CodeBroker.Workspace;
public sealed record NodeFixtureResult(string Schema,int Uid,int Gid,string NodeVersion,string TypeScriptVersion,string VitestVersion,int TotalTests,int PassedTests,int FailedTests,int SkippedTests,int ExitCode,long DurationMs,string SourceManifestSha256,bool BeforeAfterSourceEqual,string StdoutSha256,string StderrSha256,string RedactedStdout,string RedactedStderr);
public sealed record MaterializationReport(string Status,string AttemptId,WorkspaceBinding Binding,string? Reason,string SourcePolicyId,JsonElement? Manifest,string? ManifestSha256,string? ToolchainProfileHash,string? ImageId,string? BackendIdentityHash,string? DaemonIdentityHash,NodeFixtureResult? Fixture,bool ContainerRemoved,bool VolumeRemoved,string ObservedAt){
 public string Schema=>"sdf.windows_materialization_report.v1";public bool ProductionAuthority=>false;
}
internal static class MaterializationContracts {
 internal static readonly string[] Reasons={"input_invalid","host_unqualified","workspace_unverified","stale_base","source_policy_denied","secret_pattern_found","source_limit","blob_unavailable","toolchain_unprovisioned","toolchain_mismatch","attempt_in_progress","resource_conflict","peer_changed","protocol_invalid","archive_invalid","materialization_unverified","fixture_failed","deadline_exceeded","cleanup_retained"};
 internal static (WorkspaceRequest Request,Guid Attempt) Parse(string json,bool cleanup){
  using var doc=WorkspaceJson.Document(json);var r=doc.RootElement;WorkspaceJson.Keys(r,"schema","workId","repositoryId","pinnedBaseSha","admissionHash","claimId","fence","attemptId");
  if(WorkspaceJson.String(r,"schema")!=(cleanup?"sdf.windows_materialization_cleanup.v1":"sdf.windows_materialization_request.v1")||!r.GetProperty("fence").TryGetInt64(out var fence))throw new WorkspaceException("input_invalid");
  var request=new WorkspaceRequest("sdf.windows_workspace_request.v1",WorkspaceJson.String(r,"workId"),WorkspaceJson.String(r,"repositoryId"),WorkspaceJson.String(r,"pinnedBaseSha"),WorkspaceJson.String(r,"admissionHash"),WorkspaceJson.String(r,"claimId"),fence);request.Validate();
  var attempt=WorkspaceJson.String(r,"attemptId");if(!WorkspaceJson.Uuid(attempt,true))throw new WorkspaceException("input_invalid");return(request,Guid.Parse(attempt));
 }
 internal static (byte[] Out,byte[] Error) Frames(byte[] body){
  using var stdout=new MemoryStream();using var stderr=new MemoryStream();int offset=0;
  while(offset<body.Length){if(body.Length-offset<8||body[offset] is not (1 or 2)||body[offset+1]!=0||body[offset+2]!=0||body[offset+3]!=0)throw new WorkspaceException("fixture_failed");
   var n=BinaryPrimitives.ReadUInt32BigEndian(body.AsSpan(offset+4,4));if(n>262144||n>body.Length-offset-8)throw new WorkspaceException("fixture_failed");(body[offset]==1?stdout:stderr).Write(body,offset+8,(int)n);offset+=8+(int)n;
  }return(stdout.ToArray(),stderr.ToArray());
 }
 internal static NodeFixtureResult Fixture(byte[] bytes,string manifest){
  if(bytes.Length>262144)throw new WorkspaceException("fixture_failed");
  using var doc=JsonDocument.Parse(bytes,new JsonDocumentOptions{MaxDepth=16});var r=doc.RootElement;WorkspaceJson.Unique(r);
  WorkspaceJson.Keys(r,"schema","uid","gid","nodeVersion","typeScriptVersion","vitestVersion","totalTests","passedTests","failedTests","skippedTests","exitCode","durationMs","sourceManifestSha256","beforeAfterSourceEqual","stdoutSha256","stderrSha256","redactedStdout","redactedStderr");
  int N(string key){if(!r.GetProperty(key).TryGetInt32(out var n))throw new WorkspaceException("fixture_failed");return n;}
  string S(string key)=>WorkspaceJson.String(r,key);
  var total=N("totalTests");var output=S("redactedStdout");var error=S("redactedStderr");
  if(S("schema")!="sdf.node_fixture_result.v1"||N("uid")!=10001||N("gid")!=10001||S("nodeVersion")!="22.23.3"||S("typeScriptVersion")!="5.9.3"||S("vitestVersion")!="2.1.9"||total<1||N("passedTests")!=total||N("failedTests")!=0||N("skippedTests")!=0||N("exitCode")!=0||!r.GetProperty("durationMs").TryGetInt64(out var duration)||duration<0||duration>90000||S("sourceManifestSha256")!=manifest||r.GetProperty("beforeAfterSourceEqual").ValueKind!=JsonValueKind.True||!ProbeSpecification.Hash(S("stdoutSha256"))||!ProbeSpecification.Hash(S("stderrSha256"))||Encoding.UTF8.GetByteCount(output)+Encoding.UTF8.GetByteCount(error)>65536)throw new WorkspaceException("fixture_failed");
  return new("sdf.node_fixture_result.v1",10001,10001,"22.23.3","5.9.3","2.1.9",total,total,0,0,0,duration,manifest,true,S("stdoutSha256"),S("stderrSha256"),output,error);
 }
 internal static string Map(string reason)=>Reasons.Contains(reason)?reason:reason is "git_timeout"?"deadline_exceeded":reason is "git_output_limit"?"source_limit":reason is "base_unavailable" or "git_unavailable"?"blob_unavailable":"workspace_unverified";
}
