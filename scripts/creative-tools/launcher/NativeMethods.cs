using System;
using System.Runtime.InteropServices;
using System.Text;
namespace Omnira.Creative.Synthetic {
 internal static class NativeMethods {
  const string K=@"C:\Windows\System32\kernel32.dll", A=@"C:\Windows\System32\advapi32.dll", U=@"C:\Windows\System32\userenv.dll";
  [StructLayout(LayoutKind.Sequential)] internal struct BASIC {internal long P,J;internal uint Flags;internal UIntPtr Min,Max;internal uint Count;internal UIntPtr Affinity;internal uint Priority,Scheduling;}
  [StructLayout(LayoutKind.Sequential)] internal struct IO {internal ulong A,B,C,D,E,F;}
  [StructLayout(LayoutKind.Sequential)] internal struct LIMITS {internal BASIC Basic;internal IO Io;internal UIntPtr P,J,PP,PJ;}
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] internal struct STARTUP {internal uint Size;internal string Reserved,Desktop,Title;internal uint X,Y,W,H,XC,YC,Fill,Flags;internal ushort Show,ExtraSize;internal IntPtr Extra,In,Out,Err;}
  [StructLayout(LayoutKind.Sequential)] internal struct EX {internal STARTUP Startup;internal IntPtr Attributes;}
  [StructLayout(LayoutKind.Sequential)] internal struct PROCESS {internal IntPtr Process,Thread;internal uint Pid,Tid;}
  [StructLayout(LayoutKind.Sequential)] internal struct CAPS {internal IntPtr Sid,Capabilities;internal uint Count,Reserved;}
  [StructLayout(LayoutKind.Sequential)] internal struct SA {internal int Size;internal IntPtr Descriptor;[MarshalAs(UnmanagedType.Bool)]internal bool Inherit;}
  [DllImport(K,CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)] internal static extern IntPtr CreateJobObjectW(IntPtr a,string n);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool SetInformationJobObject(IntPtr j,int k,IntPtr p,uint n);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool QueryInformationJobObject(IntPtr j,int k,IntPtr p,uint n,IntPtr returned);
  [DllImport(K,CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)] internal static extern bool CreateProcessW(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,[MarshalAs(UnmanagedType.Bool)]bool inherit,uint flags,IntPtr env,string cwd,ref EX startup,out PROCESS process);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern uint ResumeThread(IntPtr t);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern uint WaitForSingleObject(IntPtr p,uint ms);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool GetExitCodeProcess(IntPtr p,out uint code);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool TerminateProcess(IntPtr p,uint code);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool TerminateJobObject(IntPtr p,uint code);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool IsProcessInJob(IntPtr p,IntPtr j,out bool member);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool CloseHandle(IntPtr h);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool InitializeProcThreadAttributeList(IntPtr p,int count,uint flags,ref IntPtr bytes);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool UpdateProcThreadAttribute(IntPtr p,uint flags,IntPtr attr,IntPtr value,IntPtr bytes,IntPtr old,IntPtr returned);
  [DllImport(K,ExactSpelling=true)] internal static extern void DeleteProcThreadAttributeList(IntPtr p);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SA sa,uint size);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool SetHandleInformation(IntPtr h,uint mask,uint flags);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool GetHandleInformation(IntPtr h,out uint flags);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool ReadFile(IntPtr h,byte[] b,uint n,out uint read,IntPtr overlap);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool WriteFile(IntPtr h,byte[] b,uint n,out uint written,IntPtr overlap);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool PeekNamedPipe(IntPtr h,IntPtr b,uint n,IntPtr read,out uint available,IntPtr left);
  [DllImport(K,ExactSpelling=true,SetLastError=true)] internal static extern bool DuplicateHandle(IntPtr source,IntPtr handle,IntPtr target,out IntPtr duplicate,uint access,bool inherit,uint options);
  [DllImport(@"C:\Windows\System32\KernelBase.dll",ExactSpelling=true,SetLastError=true)] internal static extern bool CompareObjectHandles(IntPtr a,IntPtr b);
  [DllImport(K,CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)] internal static extern IntPtr CreateEventW(ref SA sa,bool manual,bool state,string name);
  [DllImport(K,CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)] internal static extern bool QueryFullProcessImageNameW(IntPtr p,uint flags,StringBuilder image,ref uint size);
  [DllImport(A,ExactSpelling=true,SetLastError=true)] internal static extern bool OpenProcessToken(IntPtr p,uint rights,out IntPtr token);
  [DllImport(A,ExactSpelling=true,SetLastError=true)] internal static extern bool GetTokenInformation(IntPtr t,int kind,IntPtr info,int size,out int need);
  [DllImport(A,ExactSpelling=true)] internal static extern IntPtr FreeSid(IntPtr sid);
  [DllImport(U,CharSet=CharSet.Unicode,ExactSpelling=true)] internal static extern int CreateAppContainerProfile(string name,string display,string description,IntPtr caps,uint count,out IntPtr sid);
  [DllImport(U,CharSet=CharSet.Unicode,ExactSpelling=true)] internal static extern int DeleteAppContainerProfile(string name);
  [DllImport(U,CharSet=CharSet.Unicode,ExactSpelling=true)] internal static extern int GetAppContainerFolderPath(string sid,out IntPtr path);
  internal static void Check(bool ok,string code) {if(!ok)throw new SyntheticRefusal(code,Marshal.GetLastWin32Error());}
  internal static void Require(bool ok,string code){if(!ok)throw new SyntheticRefusal(code);}
  internal static void ValidateAbi(){Require(IntPtr.Size==8&&Marshal.SizeOf(typeof(LIMITS))==144&&Marshal.SizeOf(typeof(EX))==112&&Marshal.SizeOf(typeof(CAPS))==24&&Marshal.SizeOf(typeof(SA))==24,"unsupported-native-abi");}
  internal static NativeHandle Event(){SA a=new SA();a.Size=24;a.Inherit=true;IntPtr h=CreateEventW(ref a,true,false,null);Check(h!=IntPtr.Zero,"sentinel-create");return new NativeHandle(h);}
 }
}