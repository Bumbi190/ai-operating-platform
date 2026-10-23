using System;
using System.IO;
using System.Text;
namespace Omnira.Creative.Review {
 internal static class ExportTests {
  internal static int Assertions;
  static readonly string[] Names={"owner.txt","SyntheticLauncher.exe","review-manifest.json","manifest.sha256"};
  static void Check(bool b,string label){Assertions++;if(!b)throw new Exception(label);}
  static string Root(ReviewResult r){return Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Temp"),"omnira-launcher-review-"+r.ExportNonce);}
  static void Clean(ReviewResult r){if(r.ExportNonce==null)return;string p=Root(r);foreach(string n in Names)if(File.Exists(Path.Combine(p,n)))File.Delete(Path.Combine(p,n));if(Directory.Exists(p)){Directory.Delete(p);Console.WriteLine("REMOVED_EXPORT "+p);}}
  static void FalseFlags(ReviewResult r){Check(!r.InstallationAuthorized&&!r.WorkerActivated&&!r.ExecutableStarted&&!r.RuntimeProvenanceVerified&&!r.ProtectedDestinationWritten,"side effects false");foreach(var f in typeof(AuthorityObservation).GetFields(System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic))Check(!(bool)f.GetValue(r.Authorities),"authority "+f.Name);}
  internal static void Run(){CreateBoundaryRefusal();VerificationDirectoryReplacement();VerificationSubstitution();CreateAcquisitionReplacement();ExportOwnSiblingOnly();SourceDriftRefuses();CreateNewNoOverwrite();PartialExportPreserved();UnknownEntryPreserved();NoExecutionOrPrivilegedEffects();ExportThenVerify();PublicModesStrict();BoundedRedactedFailure();}
  static void CreateBoundaryRefusal(){
   ReviewResult r=null;ReviewExportHooks.Stage=delegate(int stage,string p){if(stage==6)throw new ReviewRefusal(RefusalCode.SourceMismatch);};
   try{r=PackageExporter.Export();Check(r.Code==RefusalCode.SourceMismatch&&r.IncompleteOutput&&!r.ExportCompleted&&r.ExportNonce!=null,"create-return refusal retains ownership evidence");Check(Directory.Exists(Root(r))&&Directory.GetFileSystemEntries(Root(r)).Length==0,"incomplete empty creation retained");}
   finally{ReviewExportHooks.Stage=null;if(r!=null)Clean(r);}
  }
  static void CreateAcquisitionReplacement(){
   string path=null,moved=null;bool attempted=false,blocked=false;ReviewResult r=null;
   ReviewExportHooks.Stage=delegate(int stage,string p){if(stage!=6)return;attempted=true;path=p;moved=p+".test-moved";
    try{Directory.Move(p,moved);}catch(IOException){blocked=true;return;}catch(UnauthorizedAccessException){blocked=true;return;}
    Directory.CreateDirectory(p);File.WriteAllText(Path.Combine(p,"unknown"),"replacement");
   };
   try{r=PackageExporter.Export();Check(attempted,"create boundary reached");Check(blocked,"created directory acquired atomically before replacement");Check(r.ExportCompleted,"blocked replacement leaves valid export");}
   finally{ReviewExportHooks.Stage=null;if(moved!=null&&Directory.Exists(moved)){Check(Directory.GetFileSystemEntries(moved).Length==0,"displaced creation untouched");Directory.Delete(moved);File.Delete(Path.Combine(path,"unknown"));}if(r!=null)Clean(r);}
  }
  static void WritePacket(string p,Manifest m,byte[] host,byte[] raw){
   File.WriteAllBytes(Path.Combine(p,"SyntheticLauncher.exe"),host);File.WriteAllBytes(Path.Combine(p,"review-manifest.json"),raw);
   File.WriteAllText(Path.Combine(p,"owner.txt"),m.Nonce);File.WriteAllText(Path.Combine(p,"manifest.sha256"),PackageVerifier.Hash(raw));
  }
  static void RemoveKnownPacket(string p){foreach(string n in Names)File.Delete(Path.Combine(p,n));Directory.Delete(p);}
  static void VerificationDirectoryReplacement(){
   string moved=null;bool attempted=false,blocked=false;ReviewResult r=null;ReviewTestHooks.OpenCount=0;
   ReviewExportHooks.Stage=delegate(int stage,string p){if(stage!=7)return;attempted=true;moved=p+".test-moved";
    try{Directory.Move(p,moved);}catch(IOException){blocked=true;return;}catch(UnauthorizedAccessException){blocked=true;return;}
    Directory.CreateDirectory(p);Manifest m=ManifestTests.Sample();byte[] host=new byte[]{42};
    m=new Manifest(m.Nonce,m.SourceCommit,host.Length,PackageVerifier.Hash(host),m.RuntimeSha256,m.CompilerSha256,m.CompilerVersion,m.SourceDigests);
    WritePacket(p,m,host,PackageManifest.Encode(m));
   };
   try{r=PackageExporter.Export();Check(attempted,"directory verification boundary reached");Check(blocked,"export directory retained through verification");Check(r.ExportCompleted,"blocked directory substitution export");Check(ReviewTestHooks.OpenCount==0,"export never reopens directory path");}
   finally{ReviewExportHooks.Stage=null;if(moved!=null&&Directory.Exists(moved))RemoveKnownPacket(moved);if(r!=null)Clean(r);}
  }
  static void VerificationSubstitution(){
   for(int variant=0;variant<3;variant++){
    bool attempted=false;ReviewResult r=null;int which=variant;string expectedNonce=null,rawHash=null,hostHash=null;
    ReviewExportHooks.Stage=delegate(int stage,string p){if(stage!=7)return;attempted=true;
     Manifest original=PackageManifest.Parse(File.ReadAllBytes(Path.Combine(p,"review-manifest.json")));
     expectedNonce=original.Nonce;Manifest m=which==0?ManifestTests.Sample():original;
     byte[] host=which==0?new byte[]{42}:File.ReadAllBytes(Path.Combine(p,"SyntheticLauncher.exe"));
     m=new Manifest(m.Nonce,which==1?new string(original.SourceCommit[0]=='a'?'b':'a',40):m.SourceCommit,host.Length,PackageVerifier.Hash(host),m.RuntimeSha256,m.CompilerSha256,m.CompilerVersion,m.SourceDigests);
     byte[] raw=PackageManifest.Encode(m);if(which==2)raw=Encoding.UTF8.GetBytes(" "+Encoding.UTF8.GetString(raw));
     rawHash=PackageVerifier.Hash(raw);hostHash=PackageVerifier.Hash(host);WritePacket(p,m,host,raw);
     Check(PackageVerifier.Verify(p).PackageConsistent,"substituted packet coherent variant="+which);
    };
    try{r=PackageExporter.Export();Check(attempted,"verification boundary reached");Check(r.Code==RefusalCode.InvalidPackage&&!r.PackageConsistent&&!r.ExportCompleted&&r.IncompleteOutput,"coherent substitution refuses variant="+which);Check(r.ExportNonce==expectedNonce,"exact new nonce retained");Check(Directory.GetFileSystemEntries(Root(r)).Length==4&&PackageVerifier.Hash(File.ReadAllBytes(Path.Combine(Root(r),"review-manifest.json")))==rawHash&&PackageVerifier.Hash(File.ReadAllBytes(Path.Combine(Root(r),"SyntheticLauncher.exe")))==hostHash,"substitution evidence retained");}
    finally{ReviewExportHooks.Stage=null;if(r!=null)Clean(r);}
   }
  }
  static void ExportOwnSiblingOnly(){ReviewResult r=PackageExporter.Export();try{Check(r.PackageConsistent&&r.ExportCompleted&&!r.IncompleteOutput,"own sibling export code="+r.Code+" native="+r.NativeError+" nonce="+r.ExportNonce);Check(Directory.GetFileSystemEntries(Root(r)).Length==4,"exact four");byte[] host=File.ReadAllBytes(Path.Combine(Root(r),"SyntheticLauncher.exe"));Check(host.Length==ReleaseBuildContext.HostLength&&PackageVerifier.Hash(host)==ReleaseBuildContext.HostSha256,"bound host bytes");Check(!File.Exists(Path.Combine(Root(r),"LauncherReview.Tests.exe"))&&!File.Exists(Path.Combine(Root(r),"node.exe")),"no test/runtime");}finally{Clean(r);}}
  static void SourceDriftRefuses(){
   string sibling=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"SyntheticLauncher.exe"),backup=sibling+"."+Guid.NewGuid().ToString("N")+".owned";
   File.Move(sibling,backup);
   try{using(var f=new FileStream(sibling,FileMode.CreateNew,FileAccess.Write)){f.WriteByte(1);f.Flush(true);}
    ReviewResult changed=PackageExporter.Export();Check(changed.Code==RefusalCode.SourceMismatch&&!changed.IncompleteOutput&&changed.ExportNonce==null,"actual changed sibling refused");
   }finally{File.Delete(sibling);File.Move(backup,sibling);}
ReviewExportHooks.SourceMismatch=true;try{ReviewResult r=PackageExporter.Export();Check(r.Code==RefusalCode.SourceMismatch&&!r.IncompleteOutput&&r.ExportNonce==null,"source drift");}finally{ReviewExportHooks.SourceMismatch=false;}}
  static void CreateNewNoOverwrite(){
   ReviewExportHooks.Stage=delegate(int s,string p){if(s==1)using(var f=new FileStream(Path.Combine(p,"owner.txt"),FileMode.CreateNew)){f.WriteByte(29);}};
   ReviewResult leaf=null;try{leaf=PackageExporter.Export();Check(leaf.Code==RefusalCode.NativeFailure&&leaf.IncompleteOutput&&!leaf.ExportCompleted,"existing leaf refusal");Check(File.ReadAllBytes(Path.Combine(Root(leaf),"owner.txt"))[0]==29,"existing leaf preserved");}finally{ReviewExportHooks.Stage=null;if(leaf!=null)Clean(leaf);}
string path=null;ReviewExportHooks.Stage=delegate(int s,string p){if(s==0){path=p;Directory.CreateDirectory(p);using(var f=new FileStream(Path.Combine(p,"unknown"),FileMode.CreateNew)){f.WriteByte(19);}}};try{ReviewResult r=PackageExporter.Export();Check(!r.PackageConsistent&&!r.IncompleteOutput&&r.ExportNonce==null,"collision not owned");Check(File.ReadAllBytes(Path.Combine(path,"unknown"))[0]==19,"collision preserved");}finally{ReviewExportHooks.Stage=null;if(path!=null){File.Delete(Path.Combine(path,"unknown"));Directory.Delete(path);}}}
  static void PartialExportPreserved(){ReviewExportHooks.Stage=delegate(int s,string p){if(s==2)throw new ReviewRefusal(RefusalCode.SourceMismatch);};ReviewResult r=null;try{r=PackageExporter.Export();Check(r.Code==RefusalCode.SourceMismatch&&r.IncompleteOutput&&!r.ExportCompleted,"primary distinct incomplete");Check(File.Exists(Path.Combine(Root(r),"owner.txt"))&&Directory.GetFileSystemEntries(Root(r)).Length==1,"partial preserved");}finally{ReviewExportHooks.Stage=null;if(r!=null)Clean(r);}}
  static void UnknownEntryPreserved(){ReviewExportHooks.Stage=delegate(int s,string p){if(s==1)using(var f=new FileStream(Path.Combine(p,"unknown"),FileMode.CreateNew)){f.WriteByte(23);}};ReviewResult r=null;try{r=PackageExporter.Export();Check(!r.PackageConsistent&&r.IncompleteOutput,"unknown refuses");Check(File.ReadAllBytes(Path.Combine(Root(r),"unknown"))[0]==23,"unknown preserved");}finally{ReviewExportHooks.Stage=null;if(r!=null){File.Delete(Path.Combine(Root(r),"unknown"));Clean(r);}}}
  static void NoExecutionOrPrivilegedEffects(){ReviewTestHooks.RefuseIdentity=true;ReviewTestHooks.OpenCount=0;try{ReviewResult r=PackageExporter.Export();Check(r.Code==RefusalCode.IncompatibleIdentity&&r.ExportNonce==null&&ReviewTestHooks.OpenCount==0,"identity before resources");FalseFlags(r);}finally{ReviewTestHooks.RefuseIdentity=false;}}
  static void ExportThenVerify(){ReviewResult r=PackageExporter.Export();try{string p=Root(r);string[] hashes=new string[4];long[] times=new long[4];for(int i=0;i<4;i++){hashes[i]=PackageVerifier.Hash(File.ReadAllBytes(Path.Combine(p,Names[i])));times[i]=File.GetLastWriteTimeUtc(Path.Combine(p,Names[i])).Ticks;}ReviewResult v=PackageVerifier.Verify(p);Check(v.PackageConsistent,"verify exported");FalseFlags(v);Check(Directory.GetFileSystemEntries(p).Length==4,"entries remain");for(int i=0;i<4;i++){Check(hashes[i]==PackageVerifier.Hash(File.ReadAllBytes(Path.Combine(p,Names[i]))),"verify bytes");Check(times[i]==File.GetLastWriteTimeUtc(Path.Combine(p,Names[i])).Ticks,"verify times");}}finally{Clean(r);}}
  static void PublicModesStrict(){foreach(string[] a in new[]{new string[0],new[]{"--EXPORT"},new[]{"--export","poison"},new[]{"--verify"},new[]{"--verify","poison","extra"},new[]{"--source","poison"}}){var w=new StringWriter();Check(ReviewEntry.Execute(a,w)==2,"strict shape");Check(!w.ToString().Contains("poison"),"redacted argument");}}
  static void BoundedRedactedFailure(){var w=new StringWriter();Check(ReviewEntry.Execute(new[]{"--verify",new string('x',40000)},w)==2,"bad path refusal");Check(Encoding.UTF8.GetByteCount(w.ToString())<=32768&&!w.ToString().Contains(new string('x',100)),"bounded redacted");}
 }
}
