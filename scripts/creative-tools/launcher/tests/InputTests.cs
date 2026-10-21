using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
namespace Omnira.Creative.Synthetic {
 internal static class InputTests {
  const string K=@"C:\Windows\System32\kernel32.dll";
  [DllImport(K,CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)] static extern bool MoveFileExW(string a,string b,uint flags);
  [DllImport(K,CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)] static extern bool DeleteFileW(string path);
  [DllImport(K,CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)] static extern bool CreateHardLinkW(string a,string b,IntPtr security);
  [DllImport(K,CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)] static extern bool RemoveDirectoryW(string path);
  [DllImport(K,CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)] static extern IntPtr CreateFileW(string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] static extern bool DeviceIoControl(IntPtr h,uint c,byte[] b,uint n,IntPtr o,uint z,out uint r,IntPtr overlap);
  static string Leaf(OwnedFixture f){return Path.Combine(f.InputRoot,"input","sample.txt");}
  static void Bytes(byte[] expected,byte[] actual){Assert.Equal(Convert.ToBase64String(expected),Convert.ToBase64String(actual));}
  static string Digest(byte[] bytes){using(SHA256 h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
  internal static void Run(){
   foreach(Action test in new Action[]{NestedSameHandleRead,PinnedMutationControls,PathAndLinkRefusals,ExactReadBounds,NoSourceHandlesInherited}){
    test();Assert.True(WindowsProcessBoundary.LastCleanup.InputFixtureAbsent,"owned input absent");Assert.True(WindowsProcessBoundary.LastCleanup.Complete,"complete input/profile cleanup");
   }
  }
  static void NestedSameHandleRead(){
   using(OwnedFixture f=FixtureInput.CreateOwned()){
    byte[] expected=Encoding.ASCII.GetBytes("OMNIRA_SYNTHETIC_CANARY_ONLY\n");
    CanaryInput input=FixtureInput.ReadCanary(f);Bytes(expected,input.Bytes);Assert.Equal(Digest(expected),input.Sha256);Console.WriteLine("INPUT bytes="+input.Bytes.Length+" sha256="+input.Sha256);
   }
   Console.WriteLine("PASS NestedSameHandleRead");
  }
  static void MoveControl(string path){Assert.True(MoveFileExW(path,path+"-renamed",0)&&MoveFileExW(path+"-renamed",path,0),"rename control");}
  static void WriteControl(string path,bool pinned){
   IntPtr h=CreateFileW(path,0x40000000,1,IntPtr.Zero,3,0,IntPtr.Zero);int error=Marshal.GetLastWin32Error();
   if(h!=new IntPtr(-1))NativeMethods.CloseHandle(h);
   if(pinned)Assert.True(h==new IntPtr(-1)&&error==32,"write sharing violation32");
   else Assert.True(h!=new IntPtr(-1),"unpinned write control");
  }
  static void Sharing(bool result){int error=Marshal.GetLastWin32Error();Assert.True(!result&&error==32,"sharing violation32");}
  static void PinnedMutationControls(){
   using(OwnedFixture f=FixtureInput.CreateOwned()){
    string leaf=Leaf(f),parent=Path.GetDirectoryName(leaf);byte[] content=File.ReadAllBytes(leaf);
    MoveControl(f.InputRoot);MoveControl(parent);Assert.True(DeleteFileW(leaf),"delete control");File.WriteAllBytes(leaf,content);WriteControl(leaf,false);
    using(PinnedRoot root=PinnedRoot.OpenOwned(f))
    using(PinnedRoot.PinnedRead read=root.OpenRead("input/sample.txt")){
     Bytes(content,read.ReadBounded(65536));Sharing(MoveFileExW(f.InputRoot,f.InputRoot+"-renamed",0));Sharing(MoveFileExW(parent,parent+"-renamed",0));Sharing(DeleteFileW(leaf));WriteControl(leaf,true);
    }
    MoveControl(f.InputRoot);MoveControl(parent);WriteControl(leaf,false);
    Assert.True(DeleteFileW(leaf),"delete after disposal");File.WriteAllBytes(leaf,content);
    // Mutation controls intentionally replace the authored leaf; adopt only its known exact test identity.
    FixtureInput.RefreshTestLeafIdentity(f);
   }
   Console.WriteLine("PASS PinnedMutationControls unpinned=true pinnedNative=32 disposalRestores=true");
  }
  static void Junction(string path,string target){
   Directory.CreateDirectory(path);IntPtr h=CreateFileW(path,0x40000000,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);Assert.True(h!=new IntPtr(-1),"junction open");
   try{
    byte[] substitute=Encoding.Unicode.GetBytes(@"\??\"+target),print=Encoding.Unicode.GetBytes(target);
    byte[] data=new byte[16+substitute.Length+2+print.Length+2];
    Array.Copy(BitConverter.GetBytes(0xA0000003u),0,data,0,4);Array.Copy(BitConverter.GetBytes((ushort)(data.Length-8)),0,data,4,2);
    Array.Copy(BitConverter.GetBytes((ushort)substitute.Length),0,data,10,2);Array.Copy(BitConverter.GetBytes((ushort)(substitute.Length+2)),0,data,12,2);
    Array.Copy(BitConverter.GetBytes((ushort)print.Length),0,data,14,2);Array.Copy(substitute,0,data,16,substitute.Length);Array.Copy(print,0,data,16+substitute.Length+2,print.Length);
    uint n;Assert.True(DeviceIoControl(h,0x900A4,data,(uint)data.Length,IntPtr.Zero,0,out n,IntPtr.Zero),"junction create");
   }finally{NativeMethods.CloseHandle(h);}
  }
  static void PathAndLinkRefusals(){
   using(OwnedFixture f=FixtureInput.CreateOwned()){
    string outside=Path.Combine(f.InputDirectory,"outside"),secret=Path.Combine(outside,"secret.txt");
    string junction=Path.Combine(f.InputRoot,"junction"),hard=Path.Combine(f.InputRoot,"hard.txt");
    byte[] other=Encoding.ASCII.GetBytes("UNRELATED_SYNTHETIC_ONLY\n");
    Directory.CreateDirectory(outside);File.WriteAllBytes(secret,other);
    try{
     Junction(junction,outside);Assert.True(CreateHardLinkW(hard,secret,IntPtr.Zero),"hardlink create");
     Bytes(other,File.ReadAllBytes(Path.Combine(junction,"secret.txt")));Bytes(other,File.ReadAllBytes(hard));
     Console.WriteLine("CONTROL junction=true hardlink=true");
     using(PinnedRoot root=PinnedRoot.OpenOwned(f)){
      Assert.Refuses("reparse-rejected",()=>{using(PinnedRoot.PinnedRead r=root.OpenRead("junction/secret.txt"))r.ReadBounded(65536);});
      Assert.Refuses("hard-link-rejected",()=>{using(PinnedRoot.PinnedRead r=root.OpenRead("hard.txt"))r.ReadBounded(65536);});
      foreach(string bad in new[]{"../outside/secret.txt","input/sample.txt:ads",@"\\host\share\file",@"\\?\C:\file","CON.txt",@"input\sample.txt","input./sample.txt","a/b/c/d/e/f",new string('a',65)})
       Assert.Refuses("invalid-relative-path",()=>{using(PinnedRoot.PinnedRead r=root.OpenRead(bad)){}});
     }
     Bytes(other,File.ReadAllBytes(secret));Bytes(Encoding.ASCII.GetBytes("OMNIRA_SYNTHETIC_CANARY_ONLY\n"),File.ReadAllBytes(Leaf(f)));
    }finally{
     if(File.Exists(hard))Assert.True(DeleteFileW(hard),"hardlink cleanup");
     if(Directory.Exists(junction))Assert.True(RemoveDirectoryW(junction),"junction cleanup");
     File.Delete(secret);Directory.Delete(outside);
    }
   }
   Console.WriteLine("PASS PathAndLinkRefusals unrelatedCanaryUnchanged=true");
  }
  static void ExactReadBounds(){
   using(OwnedFixture f=FixtureInput.CreateOwned()){
    foreach(int size in new[]{65536,65537}){
     File.WriteAllBytes(Leaf(f),new byte[size]);FixtureInput.RefreshTestLeafIdentity(f);
     using(PinnedRoot root=PinnedRoot.OpenOwned(f)){
      PinnedRoot.PinnedRead r=root.OpenRead("input/sample.txt");
      using(r){
       if(size==65536)Assert.Equal(size,r.ReadBounded(65536).Length);
       else Assert.Refuses("file-size-rejected",()=>r.ReadBounded(65536));
       Assert.Refuses("read-disposed-or-consumed",()=>r.ReadBounded(65536));
      }
      Assert.Refuses("read-disposed-or-consumed",()=>r.ReadBounded(65536));
     }
    }
   }
   Console.WriteLine("PASS ExactReadBounds exact65536=true rejected65537=true consumedAndDisposed=true");
  }
  static void NoSourceHandlesInherited(){
   using(OwnedFixture f=FixtureInput.CreateOwned())
   using(PinnedRoot root=PinnedRoot.OpenOwned(f))
   using(PinnedRoot.PinnedRead read=root.OpenRead("input/sample.txt")){
    IntPtr[] handles=root.TestHandles(read);
    foreach(IntPtr h in handles){uint flags;NativeMethods.Check(NativeMethods.GetHandleInformation(h,out flags),"input-flags");Assert.True((flags&1)==0,"source noninheritable");}
    using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())){
     foreach(IntPtr h in handles){using(NativeHandle source=new NativeHandle(h)){try{Assert.True(!s.ChildObjectMatches(source),"source excluded from handle list");}finally{source.SetHandleAsInvalid();}}}
     s.VerifyBeforeResume();s.Resume();s.QualificationRoundTrip();
    }
   }
   Console.WriteLine("PASS NoSourceHandlesInherited rootParentLeafNoninheritable=true childObjectMatches=false");
  }
 }
}
