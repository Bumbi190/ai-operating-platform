using System;
using System.Text;
using System.Security.Cryptography;
using Omnira.Creative.Synthetic;
namespace Omnira.Creative.Review {
#if REVIEW_TEST
 internal static class ReviewTestHooks {internal static bool RefuseIdentity;internal static int OpenCount;}
#endif
 internal static class PackageVerifier {
  internal static string Hash(byte[] bytes){using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
  internal static void Identity(){
#if REVIEW_TEST
   if(ReviewTestHooks.RefuseIdentity)throw new ReviewRefusal(RefusalCode.IncompatibleIdentity);
#endif
   try{BoundarySession.VerifyHost();}catch(SyntheticRefusal){throw new ReviewRefusal(RefusalCode.IncompatibleIdentity);}
  }
  internal static ReviewResult VerifyExport(PackageSnapshot.Output output,Manifest expected,byte[] expectedRaw){
   Identity();using(var snapshot=output.Snapshot())return Verify(snapshot,expected,expectedRaw);
  }
  static ReviewResult Verify(PackageSnapshot snapshot,Manifest expected,byte[] expectedRaw){
     byte[] raw=snapshot.Read("review-manifest.json",65536);Manifest manifest=PackageManifest.Parse(raw);
     byte[] owner=snapshot.Read("owner.txt",32),digest=snapshot.Read("manifest.sha256",64),host=snapshot.Read("SyntheticLauncher.exe",1048576);
     if(owner.Length!=32||Encoding.ASCII.GetString(owner)!=manifest.Nonce||digest.Length!=64||Encoding.ASCII.GetString(digest)!=Hash(raw)||host.Length!=manifest.HostLength||Hash(host)!=manifest.HostSha256)throw new ReviewRefusal(RefusalCode.InvalidPackage);
     if(expected!=null&&(manifest.Nonce!=expected.Nonce||manifest.HostLength!=expected.HostLength||manifest.HostSha256!=expected.HostSha256||Hash(raw)!=Hash(expectedRaw)||Hash(PackageManifest.Encode(manifest))!=Hash(PackageManifest.Encode(expected))))throw new ReviewRefusal(RefusalCode.InvalidPackage);
     snapshot.ValidateUnchanged();
     return new ReviewResult(true,false,false,null,null,manifest,null);
  }
  internal static ReviewResult Verify(string absoluteDirectory){
   try{
    Identity();
    using(var snapshot=PackageSnapshot.Open(absoluteDirectory)){
     return Verify(snapshot,null,null);
    }
   }catch(ReviewRefusal e){return new ReviewResult(false,false,false,e.Code,e.NativeError,null,null);}
   catch{return ReviewResult.Refused(RefusalCode.UnexpectedFailure);}
  }
 }
}
