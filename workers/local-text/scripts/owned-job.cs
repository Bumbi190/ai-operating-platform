// Windows 10+: atomically create children in an unnamed, non-inheritable job.
// Child output goes to NUL. The only inheritable handle is explicitly listed.
using System;using System.Text;using System.Runtime.InteropServices;using System.ComponentModel;
namespace Omnira.LocalText {
 public sealed class OwnedChild:IDisposable {
  internal IntPtr Handle;public bool AssignedBeforeResume {get;private set;}public uint Id {get;private set;}internal OwnedChild(IntPtr handle,uint id){Handle=handle;Id=id;AssignedBeforeResume=true;}
  public bool Exited {get {return Native.WaitForSingleObject(Handle,0)==0;}}
  public void Dispose(){if(Handle!=IntPtr.Zero){Native.CloseHandle(Handle);Handle=IntPtr.Zero;}}
 }
 public sealed class OwnedJob:IDisposable {
  IntPtr job;
  public OwnedJob(){job=Native.CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new Win32Exception();var limits=new Native.ExtendedLimits();limits.Basic.LimitFlags=0x2000;int size=Marshal.SizeOf(limits);IntPtr ptr=Marshal.AllocHGlobal(size);try{Marshal.StructureToPtr(limits,ptr,false);if(!Native.SetInformationJobObject(job,9,ptr,(uint)size))throw new Win32Exception();}catch{Dispose();throw;}finally{Marshal.FreeHGlobal(ptr);}}
  public OwnedChild Start(string exe,string args,string directory,string[] environment){
   if(job==IntPtr.Zero||String.IsNullOrEmpty(exe)||exe.IndexOf('"')>=0||args.IndexOf('\0')>=0)throw new ArgumentException();
   var security=new Native.Security();security.Length=Marshal.SizeOf(security);security.Inherit=1;
   IntPtr nul=Native.CreateFile("NUL",0xC0000000,3,ref security,3,0,IntPtr.Zero);if(nul==new IntPtr(-1))throw new Win32Exception();
   IntPtr attrs=IntPtr.Zero,jobValue=IntPtr.Zero,handleValue=IntPtr.Zero,env=IntPtr.Zero;var pi=new Native.ProcessInfo();
   try {
    IntPtr bytes=IntPtr.Zero;Native.InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref bytes);attrs=Marshal.AllocHGlobal(bytes);if(!Native.InitializeProcThreadAttributeList(attrs,2,0,ref bytes))throw new Win32Exception();
    jobValue=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobValue,job);handleValue=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(handleValue,nul);
    // PROC_THREAD_ATTRIBUTE_JOB_LIST and HANDLE_LIST. No breakaway flags.
    if(!Native.UpdateProcThreadAttribute(attrs,0,(IntPtr)0x2000D,jobValue,(IntPtr)IntPtr.Size,IntPtr.Zero,IntPtr.Zero)||!Native.UpdateProcThreadAttribute(attrs,0,(IntPtr)0x20002,handleValue,(IntPtr)IntPtr.Size,IntPtr.Zero,IntPtr.Zero))throw new Win32Exception();
    foreach(string entry in environment)if(entry.IndexOf('\0')>=0||entry.IndexOf('=')<1)throw new ArgumentException();Array.Sort(environment,StringComparer.OrdinalIgnoreCase);env=Marshal.StringToHGlobalUni(String.Join("\0",environment)+"\0\0");
    var si=new Native.StartupEx();si.Startup.Size=Marshal.SizeOf(si);si.Startup.Flags=0x100;si.Startup.Input=nul;si.Startup.Output=nul;si.Startup.Error=nul;si.Attributes=attrs;
    if(!Native.CreateProcess(exe,new StringBuilder("\""+exe+"\" "+args),IntPtr.Zero,IntPtr.Zero,true,0x08080404,env,directory,ref si,out pi))throw new Win32Exception();
    bool inJob;if(!Native.IsProcessInJob(pi.Process,job,out inJob)||!inJob)throw new Win32Exception();
    if(Native.ResumeThread(pi.Thread)==0xFFFFFFFF)throw new Win32Exception();var child=new OwnedChild(pi.Process,pi.ProcessId);pi.Process=IntPtr.Zero;return child;
   }catch{if(pi.Process!=IntPtr.Zero){Native.TerminateProcess(pi.Process,1);Native.WaitForSingleObject(pi.Process,5000);}throw;}
   finally{if(pi.Thread!=IntPtr.Zero)Native.CloseHandle(pi.Thread);if(pi.Process!=IntPtr.Zero)Native.CloseHandle(pi.Process);if(attrs!=IntPtr.Zero){Native.DeleteProcThreadAttributeList(attrs);Marshal.FreeHGlobal(attrs);}if(jobValue!=IntPtr.Zero)Marshal.FreeHGlobal(jobValue);if(handleValue!=IntPtr.Zero)Marshal.FreeHGlobal(handleValue);if(env!=IntPtr.Zero)Marshal.FreeHGlobal(env);Native.CloseHandle(nul);}
  }
  public uint Active {get{var info=new Native.Accounting();if(!Native.QueryInformationJobObject(job,1,out info,(uint)Marshal.SizeOf(info),IntPtr.Zero))throw new Win32Exception();return info.Active;}}
  public bool TerminateAndWait(int timeoutMs){if(!Native.TerminateJobObject(job,1))throw new Win32Exception();var until=DateTime.UtcNow.AddMilliseconds(timeoutMs);do{if(Active==0)return true;System.Threading.Thread.Sleep(20);}while(DateTime.UtcNow<until);return false;}
  public void Dispose(){if(job!=IntPtr.Zero){Native.CloseHandle(job);job=IntPtr.Zero;}GC.SuppressFinalize(this);}~OwnedJob(){Dispose();}
 }
 internal static class Native {
  [StructLayout(LayoutKind.Sequential)] internal struct Security {internal int Length;internal IntPtr Descriptor;internal int Inherit;}
  [StructLayout(LayoutKind.Sequential)] internal struct BasicLimits {internal long ProcessTime,JobTime;internal uint LimitFlags;internal UIntPtr Min,Max;internal uint Active;internal UIntPtr Affinity;internal uint Priority,Scheduling;}
  [StructLayout(LayoutKind.Sequential)] internal struct Io {internal ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes;}
  [StructLayout(LayoutKind.Sequential)] internal struct ExtendedLimits {internal BasicLimits Basic;internal Io Io;internal UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory;}
  [StructLayout(LayoutKind.Sequential)] internal struct Accounting {internal long User,Kernel,PeriodUser,PeriodKernel;internal uint Faults,Total,Active,Terminated;}
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] internal struct Startup {internal int Size;internal string Reserved,Desktop,Title;internal uint X,Y,XSize,YSize,XCount,YCount,Fill,Flags;internal short Show,ReservedSize;internal IntPtr ReservedBytes,Input,Output,Error;}
  [StructLayout(LayoutKind.Sequential)] internal struct StartupEx {internal Startup Startup;internal IntPtr Attributes;}
  [StructLayout(LayoutKind.Sequential)] internal struct ProcessInfo {internal IntPtr Process,Thread;internal uint ProcessId,ThreadId;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] internal static extern IntPtr CreateJobObject(IntPtr attrs,string name);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool SetInformationJobObject(IntPtr job,int kind,IntPtr info,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool QueryInformationJobObject(IntPtr job,int kind,out Accounting info,uint size,IntPtr length);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] internal static extern IntPtr CreateFile(string file,uint access,uint share,ref Security security,uint disposition,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
  [DllImport("kernel32.dll")] internal static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] internal static extern bool CreateProcess(string application,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string directory,ref StartupEx startup,out ProcessInfo info);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll")] internal static extern uint WaitForSingleObject(IntPtr handle,uint ms);
 }
}
