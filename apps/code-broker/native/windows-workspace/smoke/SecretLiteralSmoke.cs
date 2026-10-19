using System.Text;
using System.Text.Json;
namespace Omnira.CodeBroker.Workspace.Smoke;
internal static class SecretLiteralSmoke {
 internal static readonly string[] Secrets={
  "const password = \"abcdefghij'klmnopqrst\";",
  "const password = 'abcdefghij\"klmnopqrst';",
  "const apiKey = \"abcdefghij\\\"klmnopqrst\";",
  "const private_key = 'abcdefghij\\'klmnopqrst';",
  "const password = \""+new string('a',19)+"\\u0062\";",
  "const password = '"+new string('a',19)+"\\x62';",
  "\"secret_access_key\": \""+new string('a',20)+"\""
 };
 internal static readonly string[] Safe={
  "const password = \""+new string('a',19)+"\";",
  "const password = \""+new string('a',18)+"\\u0062\";",
  "const password = '"+new string('a',18)+"\\x62';",
  "const message = \"abcdefghij'klmnopqrst\";"
 };
 internal static async Task Source(Action<string,bool> check){
  for(int n=0;n<Secrets.Length;n++){
   var text=Secrets[n];var request=new WorkspaceRequest("sdf.windows_workspace_request.v1",MaterializationSmoke.Binding.WorkId,MaterializationSmoke.Binding.RepositoryId,MaterializationSmoke.Binding.PinnedBaseSha,MaterializationSmoke.Binding.AdmissionHash,MaterializationSmoke.Binding.ClaimId,1);
   var identity=MaterializationSmoke.Identity();var fake=new MaterializationDocker(identity);
   async Task<SourceSnapshot> Snapshot(CancellationToken _){
    var files=SourceFixturePolicy.Paths.ToDictionary(p=>p,p=>Encoding.UTF8.GetBytes("safe fixture\n"));files[SourceFixturePolicy.Paths[0]]=Encoding.UTF8.GetBytes(text);
    string Oid(byte[] b)=>SourceSnapshot.Hex(System.Security.Cryptography.SHA1.HashData(Encoding.ASCII.GetBytes("blob "+b.Length+"\0").Concat(b).ToArray()));
    var tree=string.Join("",files.Select(p=>"100644 blob "+Oid(p.Value)+" "+p.Value.Length+"\t"+p.Key+"\0"));
    return await SourceSnapshot.FromGitAsync(request,tree,(b,_)=>Task.FromResult(files[b.Path]),CancellationToken.None);
   }
   var report=await new WindowsMaterializationFixture(fake,new PassHost(),Snapshot,identity.Profile,new MemoryAttempts()).RunAsync(request,identity.Attempt,CancellationToken.None);
   check("secret_literal_before_archive_or_docker_"+n,report.Reason=="secret_pattern_found"&&report.Manifest==null&&fake.Requests.Count==0&&fake.Uploads==0&&fake.VolumeCreates==0&&fake.ContainerCreates==0);
  }
  for(int n=0;n<Safe.Length;n++){SourceFixturePolicy.ValidateText(Encoding.UTF8.GetBytes(Safe[n]));check("below_threshold_or_unrelated_"+n,true);}
 }
 internal static void Output(Action<string,bool> check){
  for(int n=0;n<Secrets.Length;n++){
   var text=Secrets[n];var result=MaterializationContracts.Fixture(Result(text),new string('e',64));
   check("published_fixture_redacts_literal_"+n,result.RedactedStdout==Expected(n));
  }
  foreach(var text in Safe)check("published_fixture_retains_safe",MaterializationContracts.Fixture(Result(text),new string('e',64)).RedactedStdout==text);
 }
 internal static void Diagnostic(Action<string,bool> check){
  var root=PathProcessSmoke.Fixture();Directory.CreateDirectory(root);
  try{
   for(int n=0;n<Secrets.Length;n++){
    var id=Guid.NewGuid();var raw=JsonSerializer.Serialize(new{schema="sdf.node_fixture_failure.v1",stage="fixture-result",code="fixed_fixture_failed",redactedStdout=Secrets[n],redactedStderr=""});
    new MaterializationAttemptJournal(root).Diagnostic(new("sdf.windows_workspace_request.v1",MaterializationSmoke.Binding.WorkId,MaterializationSmoke.Binding.RepositoryId,MaterializationSmoke.Binding.PinnedBaseSha,MaterializationSmoke.Binding.AdmissionHash,MaterializationSmoke.Binding.ClaimId,1),id,raw);
    using var doc=JsonDocument.Parse(File.ReadAllText(Path.Combine(root,id+".diagnostic.txt")));
    check("persisted_diagnostic_redacts_decoded_literal_"+n,doc.RootElement.GetProperty("redactedStdout").GetString()==Expected(n));
   }
  }finally{Directory.Delete(root,true);}
 }
 static string Expected(int n)=>n<6?"const [redacted-assignment];":"[redacted-assignment]";
 static byte[] Result(string text)=>JsonSerializer.SerializeToUtf8Bytes(new{schema="sdf.node_fixture_result.v1",uid=10001,gid=10001,nodeVersion="22.23.3",typeScriptVersion="5.9.3",vitestVersion="2.1.9",totalTests=1,passedTests=1,failedTests=0,skippedTests=0,exitCode=0,durationMs=1,sourceManifestSha256=new string('e',64),beforeAfterSourceEqual=true,stdoutSha256=new string('a',64),stderrSha256=new string('b',64),redactedStdout=text,redactedStderr=""});
 sealed class PassHost:IHostPreflight{public Task<bool> IsQualifiedAsync(CancellationToken t)=>Task.FromResult(true);}
 sealed class MemoryAttempts:IMaterializationAttemptJournal{
  public IDisposable Begin(WorkspaceRequest r,Guid a,bool cleanup)=>new Noop();
  public void BindPeer(WorkspaceRequest r,Guid a,MaterializationPeer p){}
  public MaterializationPeer? ReadPeer(WorkspaceRequest r,Guid a)=>null;
  sealed class Noop:IDisposable{public void Dispose(){}}
 }
}