using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace Omnira.Creative.Review {
 // Owns only observational handles. No fixture adapter or caller-selected leaf.
 internal sealed class PackageSnapshot:IDisposable {
  static readonly string[] Names={"owner.txt","SyntheticLauncher.exe","review-manifest.json","manifest.sha256"};
  static readonly int[] Limits={32,1048576,65536,64};
  SafeFileHandle root;
  readonly SafeFileHandle[] leaves=new SafeFileHandle[4];
  readonly Info[] before=new Info[4];
  Info rootBefore;string canonical;bool disposed;
  [StructLayout(LayoutKind.Sequential,Pack=4)]internal struct Info {internal uint Attributes;internal long Creation,Access,Write;internal uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
  [StructLayout(LayoutKind.Sequential)]struct Unicode {internal ushort Length,MaximumLength;internal IntPtr Buffer;}
  [StructLayout(LayoutKind.Sequential)]struct Attributes {internal uint Length;internal IntPtr Root,ObjectName;internal uint Flags;internal IntPtr Security,Quality;}
  [StructLayout(LayoutKind.Sequential)]struct Status {internal IntPtr Value;internal UIntPtr Information;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFileW(string n,uint a,uint share,IntPtr sa,uint disposition,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
  [DllImport("kernel32.dll",SetLastError=true)]static extern uint GetFileType(SafeFileHandle h);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetHandleInformation(SafeFileHandle h,out uint flags);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder b,uint n,uint flags);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern uint GetDriveTypeW(string root);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool GetVolumeInformationByHandleW(SafeFileHandle h,StringBuilder volume,uint len,out uint serial,out uint max,out uint flags,StringBuilder fs,uint fslen);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool ReadFile(SafeFileHandle h,byte[] b,uint size,out uint read,IntPtr ov);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetFilePointerEx(SafeFileHandle h,long offset,out long position,uint origin);
  [DllImport("ntdll.dll")]static extern int NtCreateFile(out SafeFileHandle h,uint access,ref Attributes attributes,out Status status,IntPtr allocation,uint fileAttributes,uint share,uint disposition,uint options,IntPtr ea,uint eaLength);
  [DllImport("ntdll.dll")]static extern int NtQueryDirectoryFile(SafeFileHandle h,IntPtr ev,IntPtr apc,IntPtr context,out Status status,IntPtr buffer,uint length,uint kind,[MarshalAs(UnmanagedType.U1)]bool single,IntPtr name,[MarshalAs(UnmanagedType.U1)]bool restart);
  static void Need(bool b){if(!b)throw new ReviewRefusal(RefusalCode.InvalidPackage);}
  static void Win(bool b){if(!b)throw new ReviewRefusal(RefusalCode.NativeFailure,Marshal.GetLastWin32Error());}
  static Info Metadata(SafeFileHandle h,bool directory){
   Need(h!=null&&!h.IsInvalid&&!h.IsClosed);uint flags;Win(GetHandleInformation(h,out flags));Need((flags&1)==0&&GetFileType(h)==1);
   Info i;Win(GetFileInformationByHandle(h,out i));Need((i.Attributes&0x400)==0&&((i.Attributes&16)!=0)==directory);
   if(!directory)Need(i.Links==1&&i.SizeHigh==0);return i;
  }
  static bool Same(Info a,Info b){return a.Attributes==b.Attributes&&a.Creation==b.Creation&&a.Write==b.Write&&a.Volume==b.Volume&&a.SizeHigh==b.SizeHigh&&a.SizeLow==b.SizeLow&&a.Links==b.Links&&a.IndexHigh==b.IndexHigh&&a.IndexLow==b.IndexLow;}
  static string Final(SafeFileHandle h){var b=new StringBuilder(1024);uint n=GetFinalPathNameByHandleW(h,b,1024,0);Win(n!=0);Need(n<1024&&n==(uint)b.Length);return b.ToString();}
  static void PathCheck(string p){
   Need(p!=null&&p.Length>=4&&p.Length<=240&&p[0]>='A'&&p[0]<='Z'&&p[1]==':'&&p[2]=='\\'&&p[p.Length-1]!='\\');
   Need(p.IndexOf('/',0)<0&&p.IndexOf(':',2)<0&&p.IndexOf('\0')<0&&Path.GetFullPath(p)==p);
   foreach(string part in p.Substring(3).Split('\\')){Need(part.Length>0&&part!="."&&part!=".."&&!part.EndsWith(".")&&!part.EndsWith(" "));}
   Need(GetDriveTypeW(p.Substring(0,3))==3);
  }
  internal static PackageSnapshot Open(string absoluteDirectory){
#if REVIEW_TEST
   ReviewTestHooks.OpenCount++;
#endif
   var s=new PackageSnapshot();
   try{
    Need(IntPtr.Size==8&&Marshal.SizeOf(typeof(Info))==52&&Marshal.SizeOf(typeof(Attributes))==48&&Marshal.SizeOf(typeof(Status))==16);
    PathCheck(absoluteDirectory);s.canonical=absoluteDirectory;
    s.root=CreateFileW(absoluteDirectory,0x00100081,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
    s.rootBefore=Metadata(s.root,true);Need(Final(s.root)=="\\\\?\\"+absoluteDirectory);
    uint serial,max,flags;var fs=new StringBuilder(32);var volume=new StringBuilder(261);
    Win(GetVolumeInformationByHandleW(s.root,volume,261,out serial,out max,out flags,fs,32));Need(fs.ToString()=="NTFS"&&serial==s.rootBefore.Volume);
    s.Entries();
    for(int i=0;i<4;i++){s.leaves[i]=s.OpenLeaf(Names[i]);s.before[i]=Metadata(s.leaves[i],false);Need(s.before[i].Volume==s.rootBefore.Volume&&s.before[i].SizeLow>0&&s.before[i].SizeLow<=Limits[i]);Need(Final(s.leaves[i])=="\\\\?\\"+absoluteDirectory+"\\"+Names[i]);}
    s.ValidateUnchanged();return s;
   }catch{s.Dispose();throw;}
  }
  SafeFileHandle OpenLeaf(string name){
   IntPtr chars=Marshal.StringToHGlobalUni(name),ptr=IntPtr.Zero;
   try{
    Unicode u=new Unicode{Length=(ushort)(name.Length*2),MaximumLength=(ushort)(name.Length*2),Buffer=chars};
    ptr=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Unicode)));Marshal.StructureToPtr(u,ptr,false);
    Attributes a=new Attributes{Length=48,Root=root.DangerousGetHandle(),ObjectName=ptr,Flags=0x40};
    Status status;SafeFileHandle h;int result=NtCreateFile(out h,0x00100081,ref a,out status,IntPtr.Zero,0,1,1,0x00200060,IntPtr.Zero,0);
    try{if(result<0)throw new ReviewRefusal(RefusalCode.NativeFailure,result);Need(status.Information.ToUInt64()==1);var transferred=h;h=null;return transferred;}finally{if(h!=null)h.Dispose();}
   }finally{if(ptr!=IntPtr.Zero)Marshal.FreeHGlobal(ptr);Marshal.FreeHGlobal(chars);}
  }
  void Entries(){
   IntPtr buffer=Marshal.AllocHGlobal(4096);
   try{
    var seen=new HashSet<string>(StringComparer.Ordinal);int total=0;
    for(int batch=0;batch<8;batch++){
     Status status;int result=NtQueryDirectoryFile(root,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,out status,buffer,4096,12,false,IntPtr.Zero,batch==0);
     if(result==unchecked((int)0x80000006)){Need(seen.Count==4);return;}
     if(result<0)throw new ReviewRefusal(RefusalCode.NativeFailure,result);
     ulong size=status.Information.ToUInt64();Need(size>=12&&size<=4096);int offset=0;
     while(true){
      Need(offset>=0&&(ulong)(offset+12)<=size);int next=Marshal.ReadInt32(buffer,offset),length=Marshal.ReadInt32(buffer,offset+8);
      Need(length>=2&&length<=510&&(length&1)==0&&(ulong)(offset+12+length)<=size);
      string name=Marshal.PtrToStringUni(IntPtr.Add(buffer,offset+12),length/2);Need(++total<=6);
      if(name!="."&&name!=".."){Need(Array.IndexOf(Names,name)>=0&&seen.Add(name));}
      if(next==0)break;Need(next>=12+length&&(next&3)==0&&(ulong)(offset+next)<size);offset+=next;
     }
    }
    throw new ReviewRefusal(RefusalCode.InvalidPackage);
   }finally{Marshal.FreeHGlobal(buffer);}
  }
  internal byte[] Read(string exactName,int maxBytes){
   Need(!disposed);int index=Array.IndexOf(Names,exactName);Need(index>=0&&maxBytes>0&&maxBytes<=Limits[index]);Info original=before[index];Need(original.SizeLow<=maxBytes&&Same(original,Metadata(leaves[index],false)));
   long position;Win(SetFilePointerEx(leaves[index],0,out position,0));Need(position==0);
   byte[] result=new byte[(int)original.SizeLow];int offset=0;byte[] chunk=new byte[Math.Min(65536,result.Length)];
   while(offset<result.Length){uint got;Win(ReadFile(leaves[index],chunk,(uint)Math.Min(chunk.Length,result.Length-offset),out got,IntPtr.Zero));Need(got>0&&got<=chunk.Length&&got<=result.Length-offset);Buffer.BlockCopy(chunk,0,result,offset,(int)got);offset+=(int)got;}
   uint extra;Win(ReadFile(leaves[index],new byte[1],1,out extra,IntPtr.Zero));Need(extra==0&&Same(original,Metadata(leaves[index],false)));return result;
  }
  internal void ValidateUnchanged(){
   Need(!disposed&&Same(rootBefore,Metadata(root,true))&&Final(root)=="\\\\?\\"+canonical);
   for(int i=0;i<4;i++){Need(Same(before[i],Metadata(leaves[i],false))&&Final(leaves[i])=="\\\\?\\"+canonical+"\\"+Names[i]);}
   Entries();
  }
  // Fixed exporter inputs only. Callers cannot reach this through the CLI.
  internal sealed class Source:IDisposable {
   SafeFileHandle handle;Info initial;string path;
   internal Source(string p){path=p;try{PathCheck(p);handle=CreateFileW(p,0x00100081,1,IntPtr.Zero,3,0x00200000,IntPtr.Zero);initial=Metadata(handle,false);Validate();}catch{Dispose();throw;}}
   internal void Validate(){Need(Same(initial,Metadata(handle,false))&&Final(handle)=="\\\\?\\"+path);}
   internal byte[] Read(int limit){Validate();Need(initial.SizeLow>0&&initial.SizeLow<=limit);long position;Win(SetFilePointerEx(handle,0,out position,0));Need(position==0);byte[] b=new byte[(int)initial.SizeLow];int offset=0;
    while(offset<b.Length){byte[] chunk=new byte[Math.Min(65536,b.Length-offset)];uint got;Win(ReadFile(handle,chunk,(uint)chunk.Length,out got,IntPtr.Zero));Need(got>0&&got<=chunk.Length);Buffer.BlockCopy(chunk,0,b,offset,(int)got);offset+=(int)got;}
    uint extra;Win(ReadFile(handle,new byte[1],1,out extra,IntPtr.Zero));Need(extra==0);Validate();return b;
   }
   public void Dispose(){if(handle!=null){handle.Dispose();handle=null;}}
  }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateDirectoryW(string p,IntPtr attributes);
  internal static void NewDirectory(string path){PathCheck(path);Win(CreateDirectoryW(path,IntPtr.Zero));}
  internal sealed class Output:IDisposable {
   SafeFileHandle handle;Info initial;string path;
   internal Output(string p){path=p;try{handle=CreateFileW(p,0x00100081,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero);initial=Metadata(handle,true);Validate();uint serial,max,flags;var fs=new StringBuilder(32);var volume=new StringBuilder(261);Win(GetVolumeInformationByHandleW(handle,volume,261,out serial,out max,out flags,fs,32));Need(fs.ToString()=="NTFS"&&serial==initial.Volume);}catch{Dispose();throw;}}
   void Validate(){Info now=Metadata(handle,true);Need(initial.Volume==now.Volume&&initial.IndexHigh==now.IndexHigh&&initial.IndexLow==now.IndexLow&&initial.Attributes==now.Attributes&&initial.Creation==now.Creation&&Final(handle)=="\\\\?\\"+path);}
   internal void Write(string name,byte[] bytes){
    Need(Array.IndexOf(Names,name)>=0);Validate();IntPtr chars=Marshal.StringToHGlobalUni(name),ptr=IntPtr.Zero;SafeFileHandle h=null;
    try{Unicode u=new Unicode{Length=(ushort)(name.Length*2),MaximumLength=(ushort)(name.Length*2),Buffer=chars};ptr=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Unicode)));Marshal.StructureToPtr(u,ptr,false);
     Attributes a=new Attributes{Length=48,Root=handle.DangerousGetHandle(),ObjectName=ptr,Flags=0x40};Status status;int result=NtCreateFile(out h,0x40100000,ref a,out status,IntPtr.Zero,0,1,2,0x00200060,IntPtr.Zero,0);
     if(result<0)throw new ReviewRefusal(RefusalCode.NativeFailure,result);Need(status.Information.ToUInt64()==2);
     using(var stream=new FileStream(h,FileAccess.Write)){h=null;stream.Write(bytes,0,bytes.Length);stream.Flush(true);}
     Validate();
    }finally{if(h!=null)h.Dispose();if(ptr!=IntPtr.Zero)Marshal.FreeHGlobal(ptr);Marshal.FreeHGlobal(chars);}
   }
   public void Dispose(){if(handle!=null){handle.Dispose();handle=null;}}
  }
  public void Dispose(){if(disposed)return;disposed=true;foreach(var h in leaves)if(h!=null)h.Dispose();if(root!=null)root.Dispose();}
 }
}
