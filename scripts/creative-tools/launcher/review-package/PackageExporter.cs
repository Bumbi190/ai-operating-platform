using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
namespace Omnira.Creative.Review {
#if REVIEW_TEST
 internal static class ReviewExportHooks {internal static bool SourceMismatch;internal static Action<int,string> Stage;}
#endif
 internal static class PackageExporter {
  static void Stage(int stage,string path){
#if REVIEW_TEST
   if(stage==0)Console.WriteLine("EXPORT_CANDIDATE "+path);
   if(ReviewExportHooks.Stage!=null)ReviewExportHooks.Stage(stage,path);
#endif
  }
  static void Match(bool value){if(!value)throw new ReviewRefusal(RefusalCode.SourceMismatch);}
  internal static ReviewResult Export(){
   bool owned=false;string nonce=null;var sources=new List<PackageSnapshot.Source>();
   try{
    PackageVerifier.Identity();
#if REVIEW_TEST
    if(ReviewExportHooks.SourceMismatch)throw new ReviewRefusal(RefusalCode.SourceMismatch);
#endif
    // All paths originate in the fixed wrapper or this executable's own directory.
    var digests=ReleaseBuildContext.SourceDigests;
    foreach(string key in ManifestSchema.SourceKeys){
     var source=new PackageSnapshot.Source(Path.Combine(ReleaseBuildContext.SourceRoot,key));sources.Add(source);
     Match(PackageVerifier.Hash(source.Read(1048576))==digests[key]);
    }
    var host=new PackageSnapshot.Source(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"SyntheticLauncher.exe"));sources.Add(host);
    byte[] bytes=host.Read(1048576);Match(bytes.Length==ReleaseBuildContext.HostLength&&PackageVerifier.Hash(bytes)==ReleaseBuildContext.HostSha256);
    // Construct/validate the finite context before creating anything.
    string candidate=Guid.NewGuid().ToString("N");
    Manifest manifest=new Manifest(candidate,ReleaseBuildContext.SourceCommit,bytes.Length,ReleaseBuildContext.HostSha256,ReleaseBuildContext.RuntimeSha256,ReleaseBuildContext.CompilerSha256,ReleaseBuildContext.CompilerVersion,digests);
    byte[] raw=PackageManifest.Encode(manifest);
    string temp=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Temp");
    Match(Path.IsPathRooted(temp)&&Directory.Exists(temp));
    string path=Path.Combine(temp,"omnira-launcher-review-"+candidate);Stage(0,path);
    PackageSnapshot.NewDirectory(path);owned=true;nonce=candidate;
    using(var output=new PackageSnapshot.Output(path)){
     Stage(1,path);output.Write("owner.txt",Encoding.ASCII.GetBytes(candidate));Stage(2,path);
     output.Write("SyntheticLauncher.exe",bytes);host.Validate();Stage(3,path);
     output.Write("review-manifest.json",raw);Stage(4,path);
     output.Write("manifest.sha256",Encoding.ASCII.GetBytes(PackageVerifier.Hash(raw)));Stage(5,path);
     foreach(var source in sources)source.Validate();
    }
    ReviewResult verified=PackageVerifier.Verify(path);
    if(!verified.PackageConsistent)return new ReviewResult(false,false,true,verified.Code,verified.NativeError,null,nonce);
    return new ReviewResult(true,true,false,null,null,verified.Manifest,nonce);
   }catch(ReviewRefusal e){return new ReviewResult(false,false,owned,e.Code,e.NativeError,null,nonce);}
   catch{return new ReviewResult(false,false,owned,RefusalCode.UnexpectedFailure,null,null,nonce);}
   finally{foreach(var source in sources)source.Dispose();}
  }
 }
}
