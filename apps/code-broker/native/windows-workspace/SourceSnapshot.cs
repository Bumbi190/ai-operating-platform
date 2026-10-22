using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
namespace Omnira.CodeBroker.Workspace;
internal sealed class GitBlobReference {
 internal string Path{get;} internal string Oid{get;} internal int ByteLength{get;}
 GitBlobReference(string path,string oid,int length){Path=path;Oid=oid;ByteLength=length;}
 internal static IReadOnlyList<GitBlobReference> ParseTree(string tree){
  if(Encoding.UTF8.GetByteCount(tree)>262144||!tree.EndsWith('\0'))throw new WorkspaceException("source_policy_denied");
  var result=new List<GitBlobReference>();var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
  foreach(var row in tree[..^1].Split('\0')){
   if(result.Count>=128)throw new WorkspaceException("source_limit");
   var m=Regex.Match(row,@"^100644 blob ([a-f0-9]{40}) +([0-9]+)\t([^\t]+)$",RegexOptions.CultureInvariant);
   if(!m.Success)throw new WorkspaceException("source_policy_denied");
   var path=m.Groups[3].Value;SourceFixturePolicy.ValidatePath(path);
   if(!SourceFixturePolicy.Paths.Contains(path,StringComparer.Ordinal)||!seen.Add(path))throw new WorkspaceException("source_policy_denied");
   if(!int.TryParse(m.Groups[2].Value,out var length)||length>SourceFixturePolicy.MaxFileBytes)throw new WorkspaceException("source_limit");
   total+=length;if(total>SourceFixturePolicy.MaxTotalBytes)throw new WorkspaceException("source_limit");
   result.Add(new(path,m.Groups[1].Value,length));
  }
  if(result.Count!=SourceFixturePolicy.Paths.Length)throw new WorkspaceException("source_policy_denied");
  return result.OrderBy(f=>f.Path,StringComparer.Ordinal).ToArray();
 }
}
internal sealed record SourceFile(string Path,string GitBlobId,string Sha256,int ByteLength,[property:JsonIgnore]byte[] Bytes);
internal sealed record SourceSnapshot(WorkspaceBinding Binding,string PolicyId,IReadOnlyList<SourceFile> Files,byte[] ManifestBytes,string ManifestSha256,int ContentBytes){
 internal static async Task<SourceSnapshot> FromGitAsync(WorkspaceRequest request,string tree,Func<GitBlobReference,CancellationToken,Task<byte[]>> read,CancellationToken token){
  request.Validate();if(request.RepositoryId!=RepositoryLocation.RepositoryId)throw new WorkspaceException("source_policy_denied");
  var references=GitBlobReference.ParseTree(tree);var files=new List<SourceFile>();int count=0;
  foreach(var blob in references){
   token.ThrowIfCancellationRequested();var bytes=await read(blob,token);
   if(bytes.Length!=blob.ByteLength||bytes.Length>SourceFixturePolicy.MaxFileBytes)throw new WorkspaceException("blob_unavailable");
   var header=Encoding.ASCII.GetBytes("blob "+bytes.Length.ToString(System.Globalization.CultureInfo.InvariantCulture)+"\0");
   using var hash=IncrementalHash.CreateHash(HashAlgorithmName.SHA1);hash.AppendData(header);hash.AppendData(bytes);
   if(Hex(hash.GetHashAndReset())!=blob.Oid)throw new WorkspaceException("blob_unavailable");
   SourceFixturePolicy.ValidateText(bytes);count=checked(count+bytes.Length);
   if(count>SourceFixturePolicy.MaxTotalBytes)throw new WorkspaceException("source_limit");
   files.Add(new(blob.Path,blob.Oid,Hex(SHA256.HashData(bytes)),bytes.Length,bytes.ToArray()));
  }
  var binding=new WorkspaceBinding(request.WorkId,request.RepositoryId,request.PinnedBaseSha,request.AdmissionHash,request.ClaimId,request.Fence);
  var manifest=JsonSerializer.SerializeToUtf8Bytes(new{schema="sdf.windows_source_manifest.v1",binding,policyId=SourceFixturePolicy.Id,baseSha=request.PinnedBaseSha,files},new JsonSerializerOptions{PropertyNamingPolicy=JsonNamingPolicy.CamelCase});
  return new(binding,SourceFixturePolicy.Id,files.AsReadOnly(),manifest,Hex(SHA256.HashData(manifest)),count);
 }
 internal static async Task<SourceSnapshot> BuildAsync(WindowsWorkspaceLease lease,CancellationToken token){
  await lease.ValidateUnchangedAsync(token);
  var tree=await lease.TreeAsync(token);
  var result=await FromGitAsync(lease.Values.Request,tree,lease.BlobAsync,token);
  await lease.ValidateUnchangedAsync(token);return result;
 }
 internal static string Hex(byte[] bytes)=>Convert.ToHexString(bytes).ToLowerInvariant();
}
