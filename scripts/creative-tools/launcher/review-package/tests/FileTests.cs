using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
namespace Omnira.Creative.Review {
 internal static class FileTests {
  internal static int Assertions;
  static readonly string[] Names={"owner.txt","SyntheticLauncher.exe","review-manifest.json","manifest.sha256"};
  static void Check(bool value,string label){Assertions++;if(!value)throw new Exception(label);}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateDirectoryW(string path,IntPtr attributes);
  static void NewFixtureDirectory(string path){if(!CreateDirectoryW(path,IntPtr.Zero))throw new IOException("fixture create-only refusal");}
  sealed class Fixture:IDisposable {
   internal readonly string Parent=Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Temp"),"omnira-review-test-"+Guid.NewGuid().ToString("N"));
   internal string Root { get { return Path.Combine(Parent,"package"); } }
   internal Fixture(){Console.WriteLine("OWNED_FIXTURE "+Root);NewFixtureDirectory(Parent);NewFixtureDirectory(Root);Set(new byte[]{77,90,0,0,1});initial=false;}
   bool initial=true;
   internal void Set(byte[] host){
    Manifest sample=ManifestTests.Sample();
    Manifest m=new Manifest(sample.Nonce,sample.SourceCommit,host.Length,PackageVerifier.Hash(host),sample.RuntimeSha256,sample.CompilerSha256,sample.CompilerVersion,sample.SourceDigests);
    byte[] manifest=PackageManifest.Encode(m);
    Put("owner.txt",Encoding.ASCII.GetBytes(m.Nonce));Put("SyntheticLauncher.exe",host);Put("review-manifest.json",manifest);Put("manifest.sha256",Encoding.ASCII.GetBytes(PackageVerifier.Hash(manifest)));
   }
   internal string P(string n){return Path.Combine(Root,n);}
   internal void Put(string n,byte[] b){using(var f=new FileStream(P(n),initial?FileMode.CreateNew:FileMode.Create,FileAccess.Write,FileShare.Read)){f.Write(b,0,b.Length);f.Flush(true);}}
   public void Dispose(){foreach(string n in Names)if(File.Exists(P(n)))File.Delete(P(n));Directory.Delete(Root);Directory.Delete(Parent);Console.WriteLine("REMOVED_FIXTURE "+Root);}
  }
  static void Good(ReviewResult r,string label){Check(r.PackageConsistent,label);Check(!r.InstallationAuthorized&&!r.WorkerActivated&&!r.ExecutableStarted&&!r.RuntimeProvenanceVerified&&!r.ProtectedDestinationWritten,label+" authority");foreach(var f in typeof(AuthorityObservation).GetFields(System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic))Check(!(bool)f.GetValue(r.Authorities),label+" "+f.Name);}
  static void Bad(string p,string label){Check(!PackageVerifier.Verify(p).PackageConsistent,label);}
  internal static void Run(){ExactPackageReadOnly();UnknownMissingNestedEntry();NonCanonicalPath();ManifestHashAndHostMismatch();PoisonedPathNotFollowed();CorrelatedTamperingStillNoAuthority();IdentityRefusalBeforeOpen();MutationWhileHeld();RootJunctionAndHardlink();}
  static void ExactPackageReadOnly(){using(var f=new Fixture()){string[] bytes=new string[4];long[] times=new long[4];for(int i=0;i<4;i++){bytes[i]=Convert.ToBase64String(File.ReadAllBytes(f.P(Names[i])));times[i]=File.GetLastWriteTimeUtc(f.P(Names[i])).Ticks;}Good(PackageVerifier.Verify(f.Root),"exact");Check(Directory.GetFileSystemEntries(f.Root).Length==4,"entry unchanged");for(int i=0;i<4;i++){Check(bytes[i]==Convert.ToBase64String(File.ReadAllBytes(f.P(Names[i]))),"bytes unchanged");Check(times[i]==File.GetLastWriteTimeUtc(f.P(Names[i])).Ticks,"time unchanged");}}}
  static void UnknownMissingNestedEntry(){using(var f=new Fixture()){f.Put("test.exe",new byte[]{1});Bad(f.Root,"extra");File.Delete(f.P("test.exe"));Directory.CreateDirectory(f.P("nested"));Bad(f.Root,"nested");Directory.Delete(f.P("nested"));File.Delete(f.P("owner.txt"));Bad(f.Root,"missing");}}
  static void NonCanonicalPath(){using(var f=new Fixture()){Bad(f.Root+"\\.","dot");Bad(f.Root+"\\","trailing");Bad(f.Root+":ads","ads");Bad("relative","relative");Bad("\\\\localhost\\C$\\Temp","UNC");Bad("\\\\?\\"+f.Root,"device");}}
  static void ManifestHashAndHostMismatch(){using(var f=new Fixture()){f.Put("owner.txt",Encoding.ASCII.GetBytes(new string('a',32)));Bad(f.Root,"nonce");f.Set(new byte[]{1});f.Put("manifest.sha256",Encoding.ASCII.GetBytes(new string('a',64)));Bad(f.Root,"manifest hash");f.Set(new byte[]{1});f.Put("SyntheticLauncher.exe",new byte[]{2});Bad(f.Root,"host hash");f.Put("SyntheticLauncher.exe",new byte[]{2,3});Bad(f.Root,"host length");}}
  static void PoisonedPathNotFollowed(){using(var f=new Fixture()){byte[] poison=Encoding.UTF8.GetBytes("MZ C:\\nonexistent-review-poison\\node.exe powershell.exe");f.Set(poison);Good(PackageVerifier.Verify(f.Root),"poison bytes");string manifest=Encoding.UTF8.GetString(File.ReadAllBytes(f.P("review-manifest.json"))).Replace("Contracts.cs","C:\\\\poison\\\\source.cs");byte[] b=Encoding.UTF8.GetBytes(manifest);f.Put("review-manifest.json",b);f.Put("manifest.sha256",Encoding.ASCII.GetBytes(PackageVerifier.Hash(b)));Bad(f.Root,"poison source key");}}
  static void CorrelatedTamperingStillNoAuthority(){using(var f=new Fixture()){f.Set(Encoding.ASCII.GetBytes("arbitrary foreign bytes"));Good(PackageVerifier.Verify(f.Root),"correlated foreign");}}
  static void IdentityRefusalBeforeOpen(){ReviewTestHooks.RefuseIdentity=true;ReviewTestHooks.OpenCount=0;try{ReviewResult r=PackageVerifier.Verify("poison");Check(r.Code==RefusalCode.IncompatibleIdentity&&ReviewTestHooks.OpenCount==0,"identity first");}finally{ReviewTestHooks.RefuseIdentity=false;}}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool MoveFileW(string a,string b);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool DeleteFileW(string a);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateHardLinkW(string a,string b,IntPtr s);
  static void MutationWhileHeld(){using(var f=new Fixture()){
   string p=f.P("SyntheticLauncher.exe"), moved=f.P("moved");
   Check(MoveFileW(p,moved)&&MoveFileW(moved,p),"rename positive before");
   using(var w=new FileStream(p,FileMode.Open,FileAccess.Write,FileShare.Read)){Check(w.CanWrite,"write before");}
   using(var s=PackageSnapshot.Open(f.Root)){
    Check(!MoveFileW(p,moved),"rename held");Check(!DeleteFileW(p),"delete held");
    bool blocked=false;try{using(var w=new FileStream(p,FileMode.Open,FileAccess.Write,FileShare.Read)){} }catch(IOException){blocked=true;}Check(blocked,"write held");
    Check(!MoveFileW(f.Root,f.Root+"-moved"),"root rename held");
    Check(s.Read("SyntheticLauncher.exe",1048576).Length==5,"held read");
    bool bound=false;try{s.Read("SyntheticLauncher.exe",1);}catch(ReviewRefusal){bound=true;}Check(bound,"read bound");s.ValidateUnchanged();
    bool parentMoved=MoveFileW(f.Parent,f.Parent+"-moved");Console.WriteLine("PARENT_MOVE_HELD "+parentMoved);
    if(parentMoved){try{Check(s.Read("SyntheticLauncher.exe",1048576).Length==5,"held parent read");bool rejected=false;try{s.ValidateUnchanged();}catch(ReviewRefusal){rejected=true;}Check(rejected,"changed canonical refused");}finally{Check(MoveFileW(f.Parent+"-moved",f.Parent),"restore owned parent");}}
    f.Put("unexpected",new byte[]{1});try{bool rejected=false;try{s.ValidateUnchanged();}catch(ReviewRefusal){rejected=true;}Check(rejected,"final entry recheck");}finally{File.Delete(f.P("unexpected"));}

   }
   Check(MoveFileW(p,moved)&&MoveFileW(moved,p),"rename after");using(var w=new FileStream(p,FileMode.Open,FileAccess.Write,FileShare.Read)){Check(w.CanWrite,"write after");}
   Check(DeleteFileW(p),"delete after");
  }}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern Microsoft.Win32.SafeHandles.SafeFileHandle CreateFileW(string p,uint a,uint share,IntPtr sa,uint disposition,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool DeviceIoControl(Microsoft.Win32.SafeHandles.SafeFileHandle h,uint code,byte[] input,int length,IntPtr output,int outlen,out int returned,IntPtr overlap);
  static void Junction(string link,string target){
   Directory.CreateDirectory(link);byte[] substitute=Encoding.Unicode.GetBytes("\\??\\"+target),print=Encoding.Unicode.GetBytes(target);
   byte[] data=new byte[16+substitute.Length+2+print.Length+2];
   Buffer.BlockCopy(BitConverter.GetBytes(0xa0000003u),0,data,0,4);Buffer.BlockCopy(BitConverter.GetBytes((ushort)(data.Length-8)),0,data,4,2);
   Buffer.BlockCopy(BitConverter.GetBytes((ushort)substitute.Length),0,data,10,2);Buffer.BlockCopy(BitConverter.GetBytes((ushort)(substitute.Length+2)),0,data,12,2);Buffer.BlockCopy(BitConverter.GetBytes((ushort)print.Length),0,data,14,2);
   Buffer.BlockCopy(substitute,0,data,16,substitute.Length);Buffer.BlockCopy(print,0,data,18+substitute.Length,print.Length);
   using(var h=CreateFileW(link,0x40000000,0,IntPtr.Zero,3,0x02200000,IntPtr.Zero)){int returned;Check(!h.IsInvalid&&DeviceIoControl(h,0x900a4,data,data.Length,IntPtr.Zero,0,out returned,IntPtr.Zero),"create junction");}
  }
  static void RootJunctionAndHardlink(){using(var target=new Fixture()){
   string junction=target.Root+"-junction";Console.WriteLine("OWNED_JUNCTION "+junction);
   try{Junction(junction,target.Root);Check(File.ReadAllBytes(Path.Combine(junction,"owner.txt")).Length==32,"junction positive");Bad(junction,"root junction");
    string nested=target.P("nested-link");try{Junction(nested,target.Root);Bad(target.Root,"nested reparse");}finally{Directory.Delete(nested);}
   }finally{Directory.Delete(junction);Console.WriteLine("REMOVED_JUNCTION "+junction);}
  }using(var f=new Fixture()){string link=f.P("link");Check(CreateHardLinkW(link,f.P("SyntheticLauncher.exe"),IntPtr.Zero),"hardlink control");Bad(f.Root,"extra hardlink");File.Delete(f.P("SyntheticLauncher.exe"));File.Move(link,f.P("SyntheticLauncher.exe"));string external=f.Root+"-link";Check(CreateHardLinkW(external,f.P("SyntheticLauncher.exe"),IntPtr.Zero),"hardlink external");try{Bad(f.Root,"single-name multiple-link");}finally{File.Delete(external);}}}
 }
}
