using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;
using INFO=Omnira.Creative.Synthetic.InputNative.INFO;
using US=Omnira.Creative.Synthetic.InputNative.US;
using OA=Omnira.Creative.Synthetic.InputNative.OA;
using IOS=Omnira.Creative.Synthetic.InputNative.IOS;
namespace Omnira.Creative.Synthetic {
 internal static class FixtureInput {
  const string Pin="780f44f2c53c108bae261ada21a525b4bfe733c020ac85e41bfe94479090ac9b";




  static void OrdinaryDirectory(string path){for(DirectoryInfo d=new DirectoryInfo(path);d!=null;d=d.Parent)NativeMethods.Require((d.Attributes&FileAttributes.ReparsePoint)==0,"reparse-ancestor");}
  internal static OwnedFixture CreateOwned(){OwnedFixture f;return CreateOwned(new OperationBudget(),out f);}
  internal static OwnedFixture CreateOwned(OperationBudget budget,out OwnedFixture f) {
   NativeMethods.ValidateAbi();BoundarySession.VerifyHost();
#if TEST
   if(CrashTestHooks.Phase!=null){f=CrashTestHooks.Attach(budget);return f;}
#endif
   f=new OwnedFixture();f.Budget=budget;
   try {
    string source=@"C:\Program Files\nodejs\node.exe";OrdinaryDirectory(Path.GetDirectoryName(source));
    NativeMethods.Require((File.GetAttributes(source)&(FileAttributes.ReparsePoint|FileAttributes.Directory))==0&&WindowsProcessBoundary.Hash(source)==Pin,"runtime-pin");
    f.ProfileName="omnira.launcher."+f.Nonce;
    int hr=NativeMethods.CreateAppContainerProfile(f.ProfileName,"Omnira synthetic launcher","Owned ordinary-user synthetic fixture",IntPtr.Zero,0,out f.Sid);
    if(hr!=0)throw new SyntheticRefusal("profile-create",hr);f.ProfileCreated=true;f.ProfileSid=new SecurityIdentifier(f.Sid).Value;
#if TEST
    BoundaryTestHooks.LastFixture=f;
    if(BoundaryTestHooks.SetupFailure=="before-folder")throw new SyntheticRefusal("test-setup-before-folder");

#endif
    IntPtr folder;hr=NativeMethods.GetAppContainerFolderPath(f.ProfileSid,out folder);if(hr!=0)throw new SyntheticRefusal("profile-path",hr);
    try{f.Storage=Marshal.PtrToStringUni(folder);}finally{Marshal.FreeCoTaskMem(folder);}
    string expected=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Packages",f.ProfileName,"AC");
    NativeMethods.Require(string.Equals(f.Storage,expected,StringComparison.OrdinalIgnoreCase),"profile-path-mismatch");f.StorageIdentityEstablished=true;OrdinaryDirectory(f.Storage);
    f.ProfileOwner=new OwnedEntries();f.ProfileOwner.CaptureTree(Path.GetDirectoryName(f.Storage),budget);
#if TEST
    CleanupTestHooks.At("profile");
#endif

    string dir=Path.Combine(f.Storage,"runtime");Directory.CreateDirectory(dir);OrdinaryDirectory(dir);f.ProfileOwner.Record(dir,true);f.Runtime=Path.Combine(dir,"node.exe");
    using(FileStream input=File.OpenRead(source))using(FileStream output=new FileStream(f.Runtime,FileMode.CreateNew,FileAccess.Write,FileShare.None)){input.CopyTo(output);output.Flush(true);}
    f.ProfileOwner.Record(f.Runtime,false);
    f.RuntimePin=new FileStream(f.Runtime,FileMode.Open,FileAccess.Read,FileShare.Read);
    uint pinFlags;NativeMethods.Check(NativeMethods.GetHandleInformation(f.RuntimePin.SafeFileHandle.DangerousGetHandle(),out pinFlags),"runtime-pin-flags");NativeMethods.Require((pinFlags&1)==0,"runtime-pin-inheritable");
    using(SHA256 hash=SHA256.Create()){f.RuntimeHash=BitConverter.ToString(hash.ComputeHash(f.RuntimePin)).Replace("-","").ToLowerInvariant();f.RuntimePin.Position=0;}
    NativeMethods.Require(f.RuntimeHash==Pin,"staged-runtime-pin");
    bool rx=false;foreach(FileSystemAccessRule rule in File.GetAccessControl(f.Runtime).GetAccessRules(true,true,typeof(SecurityIdentifier)))
     if(rule.IdentityReference.Value==f.ProfileSid&&rule.IsInherited&&rule.AccessControlType==AccessControlType.Allow&&(rule.FileSystemRights&FileSystemRights.ReadAndExecute)==FileSystemRights.ReadAndExecute)rx=true;
    NativeMethods.Require(rx,"runtime-inherited-package-rx");
    #if TEST
    CleanupTestHooks.At("runtime");
    if(BoundaryTestHooks.SetupFailure=="after-runtime")throw new SyntheticRefusal("test-setup-after-runtime");
#endif
#if TEST
    Console.WriteLine("FIXTURE profile="+f.ProfileName+" sid="+f.ProfileSid+" runtimeHash="+f.RuntimeHash+" inheritedRX=true");
#endif
    CreateInput(f);
    return f;
   }catch{f.Dispose();throw;}
  }
  internal static CleanupObservation CleanupOwned(OwnedFixture f,OperationBudget budget){
   if(!f.Cleanup.ProcessesStopped||!f.Cleanup.PumpsStopped||!f.Cleanup.ProcessIdentityVerified){f.Cleanup.CleanupFailed=true;return f.Cleanup;}
   f.Cleanup.InputFixtureAbsent=f.InputOwner==null?f.InputDirectory==null:f.InputOwner.Cleanup(budget);
   if(!f.Cleanup.InputFixtureAbsent)f.Cleanup.CleanupFailed=true;
   return f.Cleanup;
  }
  static void CreateInput(OwnedFixture f){
   string temp=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Temp");
   OrdinaryDirectory(temp);
   string owned=Path.Combine(temp,"omnira-launcher-input-"+f.Nonce);
   NativeMethods.Check(InputNative.CreateDirectoryW(owned,IntPtr.Zero),"input-create-directory");
   f.InputDirectory=owned;f.InputRoot=Path.Combine(owned,"root");f.InputOwner=new InputOwnership(f);
   f.InputOwner.Record(owned,true);
   string marker=Path.Combine(owned,"owner.txt");
   using(FileStream s=new FileStream(marker,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
    byte[] nonce=Encoding.ASCII.GetBytes(f.Nonce);s.Write(nonce,0,nonce.Length);s.Flush(true);
   }
   f.InputOwner.Record(marker,false);
   NativeMethods.Check(InputNative.CreateDirectoryW(f.InputRoot,IntPtr.Zero),"input-create-root");f.InputOwner.Record(f.InputRoot,true);
   string parent=Path.Combine(f.InputRoot,"input");
   NativeMethods.Check(InputNative.CreateDirectoryW(parent,IntPtr.Zero),"input-create-parent");f.InputOwner.Record(parent,true);
   string leaf=Path.Combine(parent,"sample.txt");
   using(FileStream s=new FileStream(leaf,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
    byte[] bytes=Encoding.ASCII.GetBytes("OMNIRA_SYNTHETIC_CANARY_ONLY\n");s.Write(bytes,0,bytes.Length);s.Flush(true);
   }
   f.InputOwner.Record(leaf,false);
  }
  internal static CanaryInput ReadCanary(OwnedFixture f){
   using(PinnedRoot root=PinnedRoot.OpenOwned(f))
   using(PinnedRoot.PinnedRead read=root.OpenRead("input/sample.txt")){
    byte[] bytes=read.ReadBounded(65536);
    using(SHA256 hash=SHA256.Create())return new CanaryInput(bytes,BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-","").ToLowerInvariant());
   }
  }
#if TEST
  internal static void RefreshTestLeafIdentity(OwnedFixture f){f.InputOwner.RefreshTestLeaf();}
#endif
 }
 // No arbitrary-root adapter: the constructor is private and requires the fresh fixture's identity.
 internal sealed class PinnedRoot:IDisposable {
  internal static PinnedRoot OpenOwned(OwnedFixture f){
   NativeMethods.Require(f!=null&&!f.Disposed&&f.InputOwner!=null,"input-fixture-required");
   return new PinnedRoot(f);
  }
#if TEST
  internal IntPtr[] TestHandles(PinnedRead read){List<IntPtr> result=new List<IntPtr>();result.Add(root);result.AddRange(read.held);return result.ToArray();}
#endif
 IntPtr root;readonly string finalRoot;readonly object sync=new object();
 static void Demand(bool ok,string code){if(!ok)throw new SyntheticRefusal(code);}
 internal static INFO Info(IntPtr h,bool directory){
  uint handleFlags;NativeMethods.Check(NativeMethods.GetHandleInformation(h,out handleFlags),"input-handle-flags");Demand((handleFlags&1)==0,"input-handle-inheritable");
  INFO info=new INFO();Demand(InputNative.GetFileType(h)==1&&InputNative.GetFileInformationByHandle(h,out info),"handle-metadata-unavailable");
  Demand((info.Attributes&0x400)==0,"reparse-rejected");
  Demand(((info.Attributes&0x10)!=0)==directory,"handle-type-rejected");
  if(!directory)Demand(info.Links==1,"hard-link-rejected");return info;
 }
 static string Final(IntPtr h){
  StringBuilder path=new StringBuilder(1024);uint n=InputNative.GetFinalPathNameByHandleW(h,path,1024,0);
  Demand(n>0&&n<1024,"final-path-unavailable");return path.ToString();
 }
 private PinnedRoot(OwnedFixture fixture){
  Demand(IntPtr.Size==8&&Marshal.SizeOf(typeof(US))==16&&Marshal.SizeOf(typeof(OA))==48&&Marshal.SizeOf(typeof(IOS))==16&&Marshal.SizeOf(typeof(INFO))==52,"unsupported-ABI");
  string path=fixture.InputRoot;fixture.InputOwner.RequireRoot(fixture);
  string full=Path.GetFullPath(path).TrimEnd('\\');
  Demand(full.Length>3&&char.IsLetter(full[0])&&full[1]==':'&&full[2]=='\\'&&full.IndexOf(':',2)<0&&!full.StartsWith(@"\\")&&string.Equals(full,path.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase),"local-canonical-root-required");
  Demand(new DriveInfo(Path.GetPathRoot(full)).DriveType==DriveType.Fixed,"local-fixed-drive-required");
  root=InputNative.CreateFileW(full,0x100081,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
  if(root==new IntPtr(-1)){root=IntPtr.Zero;throw new SyntheticRefusal("root-open-failed");}
  try{
   INFO info=Info(root,true);fixture.InputOwner.RequireRootIdentity(info);
   StringBuilder fs=new StringBuilder(32),label=new StringBuilder(64);uint serial,max,flags;
   Demand(InputNative.GetVolumeInformationByHandleW(root,label,64,out serial,out max,out flags,fs,32)&&fs.ToString()=="NTFS"&&serial==info.Volume,"local-NTFS-required");
   finalRoot=Final(root);Demand(string.Equals(finalRoot,@"\\?\"+full,StringComparison.OrdinalIgnoreCase),"root-final-path-mismatch");
  }catch{InputNative.CloseHandle(root);root=IntPtr.Zero;throw;}
 }
 static string[] Parts(string relative){
  Demand(relative!=null&&relative.Length>0&&relative.Length<=320,"invalid-relative-path");
  string[] parts=relative.Split('/');Demand(parts.Length<=5,"invalid-relative-path");
  foreach(string part in parts){
   Demand(Regex.IsMatch(part,@"\A[A-Za-z0-9][A-Za-z0-9._-]{0,63}\z")&&!part.EndsWith(".")&&part!="."&&part!="..","invalid-relative-path");
   string stem=part.Split('.')[0];Demand(!Regex.IsMatch(stem,@"\A(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\z",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant),"invalid-relative-path");
  }
  return parts;
 }
 static IntPtr Relative(IntPtr parent,string name,bool directory){
  IntPtr text=Marshal.StringToHGlobalUni(name),unicode=IntPtr.Zero,handle=IntPtr.Zero;
  try{
   US us=new US();us.Length=(ushort)(name.Length*2);us.MaximumLength=(ushort)(us.Length+2);us.Buffer=text;
   unicode=Marshal.AllocHGlobal(16);Marshal.StructureToPtr(us,unicode,false);
   OA oa=new OA();oa.Length=48;oa.Root=parent;oa.Name=unicode;oa.Attributes=0x1040;
   IOS io;int status=InputNative.NtCreateFile(out handle,0x100081,ref oa,out io,IntPtr.Zero,0,1,1,(directory?1u:0x40u)|0x20|0x200000,IntPtr.Zero,0);
   if(status!=0){if(handle!=IntPtr.Zero&&handle!=new IntPtr(-1)){InputNative.CloseHandle(handle);handle=IntPtr.Zero;}
    if(unchecked((uint)status)==0xC000050B)throw new SyntheticRefusal("reparse-rejected");
    throw new SyntheticRefusal("native-open-failed-0x"+unchecked((uint)status).ToString("X8"));
   }
   Demand(handle!=IntPtr.Zero&&handle!=new IntPtr(-1),"native-invalid-handle");
   Info(handle,directory);IntPtr result=handle;handle=IntPtr.Zero;return result;
  }finally{if(handle!=IntPtr.Zero&&handle!=new IntPtr(-1))InputNative.CloseHandle(handle);if(unicode!=IntPtr.Zero)Marshal.FreeHGlobal(unicode);Marshal.FreeHGlobal(text);}
 }
 internal PinnedRead OpenRead(string relative){
  string[] parts=Parts(relative);List<IntPtr> held=new List<IntPtr>();
  lock(sync){
   Demand(root!=IntPtr.Zero,"root-disposed");IntPtr parent=root;
   try{
    for(int i=0;i<parts.Length;i++){parent=Relative(parent,parts[i],i<parts.Length-1);held.Add(parent);}
    string expected=finalRoot+"\\"+string.Join("\\",parts);
    Demand(string.Equals(Final(parent),expected,StringComparison.OrdinalIgnoreCase),"leaf-final-path-mismatch");
    IntPtr rootCopy;NativeMethods.Check(NativeMethods.DuplicateHandle(new IntPtr(-1),root,new IntPtr(-1),out rootCopy,0,false,2),"input-root-duplicate");held.Insert(0,rootCopy);
    return new PinnedRead(held,parent);
   }catch{for(int i=held.Count-1;i>=0;i--)InputNative.CloseHandle(held[i]);throw;}
  }
 }
 internal sealed class PinnedRead : IDisposable {
  internal List<IntPtr> held;readonly IntPtr file;bool consumed;readonly object readSync=new object();
  internal PinnedRead(List<IntPtr> handles,IntPtr leaf){held=handles;file=leaf;}
  internal byte[] ReadBounded(int max){lock(readSync){
   Demand(held!=null&&!consumed,"read-disposed-or-consumed");consumed=true;Demand(max>0&&max<=65536,"read-bound-rejected");
   INFO before=Info(file,false);Demand(before.SizeHigh==0&&before.SizeLow<=(uint)max,"file-size-rejected");
   byte[] bytes=new byte[(int)before.SizeLow];int got=0;
   using(SafeFileHandle safe=new SafeFileHandle(file,false))
   using(FileStream stream=new FileStream(safe,FileAccess.Read,4096,false)){
    while(got<bytes.Length){int n=stream.Read(bytes,got,bytes.Length-got);Demand(n>0,"short-read-rejected");got+=n;}
    Demand(stream.ReadByte()==-1,"file-growth-rejected");
   }
   INFO after=Info(file,false);
   Demand(before.Volume==after.Volume&&before.IndexHigh==after.IndexHigh&&before.IndexLow==after.IndexLow&&before.SizeHigh==after.SizeHigh&&before.SizeLow==after.SizeLow&&before.Write.Low==after.Write.Low&&before.Write.High==after.Write.High&&after.Links==1,"file-change-rejected");
   return bytes;
  }}
  public void Dispose(){lock(readSync){if(held!=null){for(int i=held.Count-1;i>=0;i--)InputNative.CloseHandle(held[i]);held=null;}}}
 }
 public void Dispose(){lock(sync){if(root!=IntPtr.Zero){InputNative.CloseHandle(root);root=IntPtr.Zero;}}}

 }
 internal sealed class InputOwnership {
  sealed class Entry {internal string Path;internal bool Directory;internal INFO Identity;}
  readonly OwnedFixture fixture;readonly List<Entry> entries=new List<Entry>();
  internal InputOwnership(OwnedFixture f){fixture=f;}
  static INFO Identity(string path,bool directory){
   IntPtr h=InputNative.CreateFileW(path,0x100081,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
   if(h==new IntPtr(-1))throw new SyntheticRefusal("input-identity-open",Marshal.GetLastWin32Error());
   try{return PinnedRoot.Info(h,directory);}finally{InputNative.CloseHandle(h);}
  }
  static bool Same(INFO a,INFO b){return a.Volume==b.Volume&&a.IndexHigh==b.IndexHigh&&a.IndexLow==b.IndexLow;}
  bool MarkerMatches(Entry entry){
   IntPtr h=InputNative.CreateFileW(entry.Path,0x100081,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
   if(h==new IntPtr(-1))return false;
   try{
    INFO before=PinnedRoot.Info(h,false);
    if(!Same(entry.Identity,before)||before.SizeHigh!=0||before.SizeLow!=32)return false;
    byte[] bytes=new byte[33];int total=0;
    using(SafeFileHandle safe=new SafeFileHandle(h,false))
    using(FileStream stream=new FileStream(safe,FileAccess.Read,64,false)){
     while(total<bytes.Length){int n=stream.Read(bytes,total,bytes.Length-total);if(n==0)break;total+=n;}
    }
    INFO after=PinnedRoot.Info(h,false);
    return total==32&&Same(before,after)&&after.SizeHigh==0&&after.SizeLow==32&&before.Write.Low==after.Write.Low&&before.Write.High==after.Write.High&&Encoding.ASCII.GetString(bytes,0,32)==fixture.Nonce;
   }finally{InputNative.CloseHandle(h);}
  }
  internal void Record(string path,bool directory){entries.Add(new Entry{Path=path,Directory=directory,Identity=Identity(path,directory)});}
  internal void RequireRoot(OwnedFixture f){
   NativeMethods.Require(object.ReferenceEquals(f,fixture)&&!f.Disposed&&entries.Count==5&&f.InputDirectory==entries[0].Path&&f.InputRoot==entries[2].Path,"input-fixture-required");
   NativeMethods.Require(Same(entries[0].Identity,Identity(f.InputDirectory,true)),"input-owner-identity");
   string marker=Path.Combine(f.InputDirectory,"owner.txt");
   NativeMethods.Require(MarkerMatches(entries[1]),"input-owner-marker");
  }
  internal void RequireRootIdentity(INFO identity){NativeMethods.Require(Same(entries[2].Identity,identity),"input-root-identity");}
#if TEST
  internal void RefreshTestLeaf(){entries[4].Identity=Identity(entries[4].Path,false);}
#endif
  bool cleaned;
#if TEST
  internal string Manifest(){
   StringBuilder text=new StringBuilder();
   foreach(Entry e in entries)text.AppendLine(e.Path+"\t"+e.Directory+"\t"+e.Identity.Volume+"\t"+e.Identity.IndexHigh+"\t"+e.Identity.IndexLow);
   return text.ToString();
  }
#endif
  internal bool Cleanup(OperationBudget budget){
   if(cleaned)return !Directory.Exists(fixture.InputDirectory);
   try{
    Entry marker=entries.Find(delegate(Entry e){return Path.GetFileName(e.Path)=="owner.txt";});
    if(marker!=null)NativeMethods.Require(MarkerMatches(marker),"input-cleanup-marker");
    OwnedEntries exact=new OwnedEntries();
    foreach(Entry e in entries)exact.RecordCaptured(e.Path,e.Directory,e.Identity);
    cleaned=exact.Delete(budget);return cleaned;

   }catch{return false;}
  }
 }
}
namespace Omnira.Creative.Synthetic {
 // A bounded manifest captured only while constructing an owned synthetic tree.
 // Deletion holds no-delete-share handles to every entry, checks the full set,
 // then marks those same handles for deletion. Unknown children make the parent
 // delete fail; no recursive path removal or profile API can conceal them.
 internal sealed class OwnedEntries {
  sealed class Entry {internal string Path;internal bool Directory;internal INFO Identity;}
  readonly List<Entry> entries=new List<Entry>();
  bool deleted;
  internal void Record(string path,bool directory){RecordCaptured(path,directory,ReadIdentity(path,directory));}
  internal void RecordCaptured(string path,bool directory,INFO identity){NativeMethods.Require(entries.Count<128,"cleanup-entry-bound");entries.Add(new Entry{Path=path,Directory=directory,Identity=identity});}
  internal static INFO ReadIdentity(string path,bool directory){
   IntPtr h=InputNative.CreateFileW(path,0x100081,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
   NativeMethods.Check(h!=new IntPtr(-1),"cleanup-identity-open");
   try{return PinnedRoot.Info(h,directory);}finally{InputNative.CloseHandle(h);}
  }
  static bool Same(INFO a,INFO b){return a.Volume==b.Volume&&a.IndexHigh==b.IndexHigh&&a.IndexLow==b.IndexLow;}
  internal void CaptureTree(string path,OperationBudget budget){Capture(path,budget,0);}
  void Capture(string path,OperationBudget budget,int depth){
   NativeMethods.Require(depth<=8&&budget.RunRemainingMs>0,"cleanup-capture-bound");
   bool directory=(File.GetAttributes(path)&FileAttributes.Directory)!=0;Record(path,directory);
   if(directory)foreach(string child in Directory.EnumerateFileSystemEntries(path))Capture(child,budget,depth+1);
  }
#if TEST
  internal string Manifest(){
   StringBuilder text=new StringBuilder();
   foreach(Entry e in entries)text.AppendLine(e.Path+"\t"+e.Directory+"\t"+e.Identity.Volume+"\t"+e.Identity.IndexHigh+"\t"+e.Identity.IndexLow);
   return text.ToString();
  }
#endif
  internal bool Delete(OperationBudget budget){
   if(deleted)return entries.Count==0||!Directory.Exists(entries[0].Path)&&!File.Exists(entries[0].Path);
   List<IntPtr> held=new List<IntPtr>();
   try{
    foreach(Entry e in entries){
     NativeMethods.Require(budget!=null&&budget.CleanupRemainingMs>0,"cleanup-budget");
     IntPtr h=InputNative.CreateFileW(e.Path,0x110081,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
     NativeMethods.Check(h!=new IntPtr(-1),"cleanup-open");held.Add(h);
     NativeMethods.Require(Same(e.Identity,PinnedRoot.Info(h,e.Directory)),"cleanup-identity");
     // A held parent cannot be renamed/replaced while its children are opened.
     if(e.Directory){
      int actual=0,expected=0;
      foreach(Entry child in entries)if(Path.GetDirectoryName(child.Path)==e.Path)expected++;
      foreach(string path in Directory.EnumerateFileSystemEntries(e.Path)){
       NativeMethods.Require(++actual<=expected,"cleanup-unknown-entry");
       bool known=false;foreach(Entry child in entries)if(child.Path==path){known=true;break;}
       NativeMethods.Require(known,"cleanup-unknown-entry");
      }
      NativeMethods.Require(actual==expected,"cleanup-missing-entry");
     }
    }
    for(int i=entries.Count-1;i>=0;i--){
     NativeMethods.Require(budget.CleanupRemainingMs>0,"cleanup-budget");
     int disposition=1;
     NativeMethods.Check(InputNative.SetFileInformationByHandle(held[i],4,ref disposition,4),"cleanup-disposition");
     InputNative.CloseHandle(held[i]);held[i]=IntPtr.Zero;
    }
    deleted=true;return entries.Count==0||!Directory.Exists(entries[0].Path)&&!File.Exists(entries[0].Path);
   }catch{return false;}
   finally{foreach(IntPtr h in held)if(h!=IntPtr.Zero)InputNative.CloseHandle(h);}
  }
 }
}
