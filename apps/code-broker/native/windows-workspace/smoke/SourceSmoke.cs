using System.Formats.Tar;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Omnira.CodeBroker.Workspace;
namespace Omnira.CodeBroker.Workspace.Smoke;
internal static class SourceSmoke {
 static readonly WorkspaceRequest Request=new("sdf.windows_workspace_request.v1","c435e423-d964-428b-b5c0-4060d89ce3c6",RepositoryLocation.RepositoryId,new string('b',40),new string('a',64),"2e0f09eb-cf7e-4619-834b-d78aa0ca5a7a",1);
 static string Oid(byte[] b)=>Convert.ToHexString(SHA1.HashData(Encoding.ASCII.GetBytes("blob "+b.Length+"\0").Concat(b).ToArray())).ToLowerInvariant();
 static string Tree(Dictionary<string,byte[]> files,string mode="100644")=>string.Join("",files.OrderBy(p=>p.Key,StringComparer.Ordinal).Select(p=>mode+" blob "+Oid(p.Value)+" "+p.Value.Length+"\t"+p.Key+"\0"));
 static Dictionary<string,byte[]> Files()=>SourceFixturePolicy.Paths.ToDictionary(p=>p,p=>Encoding.UTF8.GetBytes("safe fixture\n"));
 static async Task<SourceSnapshot> Make(Dictionary<string,byte[]> files,string? tree=null,bool wrong=false)=>await SourceSnapshot.FromGitAsync(Request,tree??Tree(files),(blob,_)=>Task.FromResult(wrong?Encoding.UTF8.GetBytes("substituted"):files[blob.Path]),CancellationToken.None);
 static async Task<bool> Refused(Func<Task> f,string? reason=null){try{await f();return false;}catch(WorkspaceException e){return reason==null||e.Reason==reason;}}
 public static async Task Run(Action<string,bool> check){
  var files=Files();var snapshot=await Make(files);check("exact_selected_files",snapshot.Files.Count==22);
  var tar=DeterministicSourceTar.Write(snapshot);check("deterministic_archive",tar.SequenceEqual(DeterministicSourceTar.Write(await Make(files))));
  using(var reader=new TarReader(new MemoryStream(tar))){int count=0;TarEntry? entry;var seen=new HashSet<string>();while((entry=reader.GetNextEntry())!=null){check("tar_regular_or_directory_"+count,entry.EntryType is TarEntryType.RegularFile or TarEntryType.Directory);check("tar_no_duplicate_"+count,seen.Add(entry.Name));check("tar_owner_"+count,entry.Uid==10001&&entry.Gid==10001);count++;}check("tar_has_manifest",seen.Contains(".omnira-source-manifest.json"));}
  using(var manifest=JsonDocument.Parse(snapshot.ManifestBytes)){check("manifest_schema",manifest.RootElement.GetProperty("schema").GetString()=="sdf.windows_source_manifest.v1");check("manifest_hash",snapshot.ManifestSha256==Convert.ToHexString(SHA256.HashData(snapshot.ManifestBytes)).ToLowerInvariant());}
  check("wrong_blob_hash",await Refused(async()=>{await Make(files,wrong:true);},"blob_unavailable"));
  foreach(var mode in new[]{"120000","160000","100755"})check("mode_refused_"+mode,await Refused(async()=>{await Make(files,Tree(files,mode));}));
  foreach(var path in new[]{"../.env","a:b","AUX.txt","x//a","x\\a","/root/a","a/../b",".env","x/.git/config","x/node_modules/a","x/secret.pem",".omnira-source-manifest.json","a\u00e9"})check("path_refused_"+path,PathProcessSmoke.Refused(()=>SourceFixturePolicy.ValidatePath(path)));
  foreach(var bytes in new[]{new byte[]{0},new byte[]{0xff,0xfe},Encoding.UTF8.GetBytes("version https://git-lfs.github.com/spec/v1\noid sha256:"+new string('a',64)),Encoding.UTF8.GetBytes("-----BEGIN PRIVATE KEY-----"),Encoding.UTF8.GetBytes("sk-proj-"+new string('a',24)),Encoding.UTF8.GetBytes("const apiKey = \""+new string('b',24)+"\";")}){
   var changed=Files();changed[SourceFixturePolicy.Paths[0]]=bytes;check("unsafe_content_"+Convert.ToHexString(SHA256.HashData(bytes))[..8],await Refused(async()=>{await Make(changed);}));
  }
  var missing=Files();missing.Remove(SourceFixturePolicy.Paths[0]);check("missing_selection",await Refused(async()=>{await Make(missing);}));
  var extra=Files();extra["unselected.ts"]=Encoding.UTF8.GetBytes("x");check("unselected_refused",await Refused(async()=>{await Make(extra);}));
  var large=Files();large[SourceFixturePolicy.Paths[0]]=new byte[1048577];check("file_limit",await Refused(async()=>{await Make(large);}));
  var total=Files();foreach(var p in total.Keys.ToArray())total[p]=Enumerable.Repeat((byte)'x',1048576).ToArray();check("total_limit",await Refused(async()=>{await Make(total);}));
  check("duplicate_tree",await Refused(async()=>{await Make(files,Tree(files)+Tree(files));}));
  await ExistingLease(check);
 }
 static async Task ExistingLease(Action<string,bool> check){
  using var f=new RepoFixture();
  foreach(var path in SourceFixturePolicy.Paths){var dest=Path.Combine(f.Root,path);Directory.CreateDirectory(Path.GetDirectoryName(dest)!);File.WriteAllText(dest,path==SourceFixturePolicy.Paths[0]?new string('x',1048576):"safe fixture\n",new UTF8Encoding(false));}
  File.WriteAllText(Path.Combine(f.Root,".gitattributes"),"* text eol=crlf\n",new UTF8Encoding(false));f.Git("add","--",".");f.Git("commit","-m","selected files");var head=f.Git("rev-parse","HEAD").Trim();f.Git("update-ref","refs/remotes/origin/main",head);
  var request=f.Request() with{PinnedBaseSha=head};var prepared=await f.Engine().PrepareAsync(request,CancellationToken.None);check("source_owned_fixture_prepared",prepared.Status=="prepared");
  using(var lease=await WindowsWorkspaceLease.OpenExistingAsync(request,f.Location,new WindowsGitProcess(),new SourcePassingHost(),CancellationToken.None)){
   var snapshot=await SourceSnapshot.BuildAsync(lease,CancellationToken.None);check("real_git_snapshot22",snapshot.Files.Count==22);check("raw_blob_one_megabyte",snapshot.Files[0].ByteLength==1048576);check("checkout_crlf_never_substitutes_git_lf",File.ReadAllBytes(Path.Combine(f.Parent,request.WorkId,SourceFixturePolicy.Paths[1])).SequenceEqual(Encoding.UTF8.GetBytes("safe fixture\r\n"))&&snapshot.Files[1].Bytes.SequenceEqual(Encoding.UTF8.GetBytes("safe fixture\n")));
   check("retained_target_blocks_replace",PathProcessSmoke.IoRefused(()=>Directory.Move(Path.Combine(f.Parent,request.WorkId),Path.Combine(f.Parent,request.WorkId)+"-moved")));
   var reg=lease.Values.Registration!.PathValue;check("retained_registration_blocks_replace",PathProcessSmoke.IoRefused(()=>Directory.Move(reg,reg+"-moved")));
   await lease.ValidateUnchangedAsync(CancellationToken.None);
  }
  var target=Path.Combine(f.Parent,request.WorkId);var selected=Path.Combine(target,SourceFixturePolicy.Paths[0]);File.AppendAllText(selected,"dirty");check("dirty_source_refused",await Refused(async()=>{using var l=await WindowsWorkspaceLease.OpenExistingAsync(request,f.Location,new WindowsGitProcess(),new SourcePassingHost(),CancellationToken.None);}));
  f.Git("-C",target,"restore","--",SourceFixturePolicy.Paths[0]);
  File.WriteAllText(Path.Combine(target,"untracked.txt"),"x");check("untracked_source_refused",await Refused(async()=>{using var l=await WindowsWorkspaceLease.OpenExistingAsync(request,f.Location,new WindowsGitProcess(),new SourcePassingHost(),CancellationToken.None);}));File.Delete(Path.Combine(target,"untracked.txt"));
  // A replace ref must not substitute raw source objects.
  f.Git("replace",head,head+"~1");
  using(var l=await WindowsWorkspaceLease.OpenExistingAsync(request,f.Location,new WindowsGitProcess(),new SourcePassingHost(),CancellationToken.None))check("replace_refs_do_not_substitute",(await SourceSnapshot.BuildAsync(l,CancellationToken.None)).Files.Count==22);
  f.Git("replace","-d",head);
  f.Git("config","extensions.worktreeConfig","true");var registration=File.ReadAllText(Path.Combine(target,".git")).Trim()[8..];var config=Path.Combine(registration,"config.worktree");File.WriteAllText(config,"[core]\n hooksPath=untrusted\n");
  check("source_malicious_registration_config_refused",await Refused(async()=>{using var l=await WindowsWorkspaceLease.OpenExistingAsync(request,f.Location,new WindowsGitProcess(),new SourcePassingHost(),CancellationToken.None);}));File.Delete(config);
  File.WriteAllText(Path.Combine(f.Root,".git/info/grafts"),"");check("legacy_graft_refused",await Refused(async()=>{using var l=await WindowsWorkspaceLease.OpenExistingAsync(request,f.Location,new WindowsGitProcess(),new SourcePassingHost(),CancellationToken.None);}));File.Delete(Path.Combine(f.Root,".git/info/grafts"));
  var missing=request with{WorkId=Guid.NewGuid().ToString()};check("missing_source_does_not_prepare",await Refused(async()=>{using var l=await WindowsWorkspaceLease.OpenExistingAsync(missing,f.Location,new WindowsGitProcess(),new SourcePassingHost(),CancellationToken.None);})&&!Directory.Exists(Path.Combine(f.Parent,missing.WorkId)));
 }
 sealed class SourcePassingHost:IHostPreflight{public Task<bool> IsQualifiedAsync(CancellationToken t)=>Task.FromResult(true);}
}
