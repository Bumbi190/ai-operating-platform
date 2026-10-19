using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32.SafeHandles;
using Omnira.CodeBroker.Host;

namespace Omnira.CodeBroker.Workspace;
/** Internal primitive. Only the closed Git adapter can select a production launch. */
internal static class NativeProcess {
 [StructLayout(LayoutKind.Sequential)]struct Security{public int Length;public IntPtr Descriptor;[MarshalAs(UnmanagedType.Bool)]public bool Inherit;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Startup {
  public int Size;public IntPtr Reserved,Desktop,Title;public uint X,Y,XSize,YSize,XCount,YCount,Fill,Flags;public ushort Show,ReservedSize;public IntPtr ReservedBytes,In,Out,Err;
 }
 [StructLayout(LayoutKind.Sequential)]struct StartupEx{public Startup Start;public IntPtr Attributes;}
 [StructLayout(LayoutKind.Sequential)]struct ProcessInfo{public IntPtr Process,Thread;public uint Id,ThreadId;}
 [StructLayout(LayoutKind.Sequential)]struct BasicLimits{public long ProcessTime,JobTime;public uint Flags;public UIntPtr MinWorking,MaxWorking;public uint ActiveProcesses;public UIntPtr Affinity;public uint Priority,Scheduling;}
 [StructLayout(LayoutKind.Sequential)]struct IoCounters{public ulong ReadOperations,WriteOperations,OtherOperations,ReadBytes,WriteBytes,OtherBytes;}
 [StructLayout(LayoutKind.Sequential)]struct ExtendedLimits{public BasicLimits Basic;public IoCounters Io;public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory;}
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool CreatePipe(out SafeFileHandle read,out SafeFileHandle write,ref Security security,int size);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetHandleInformation(SafeFileHandle handle,uint mask,uint flags);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFileW(string name,uint access,uint share,ref Security security,uint create,uint flags,IntPtr template);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateJobObjectW(IntPtr attributes,string? name);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr job,int kind,ref ExtendedLimits info,uint size);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref UIntPtr size);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,UIntPtr attribute,IntPtr value,UIntPtr size,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")]static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateProcessW(string application,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string cwd,ref StartupEx startup,out ProcessInfo process);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll")]static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll")]static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")]static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);

 internal static string Quote(string value){
  if(value.IndexOf('\0')>=0)throw new WorkspaceException("input_invalid");
  var result=new StringBuilder("\"");int slash=0;
  foreach(char c in value){if(c=='\\'){slash++;continue;}if(c=='"'){result.Append('\\',slash*2+1).Append('"');slash=0;continue;}result.Append('\\',slash).Append(c);slash=0;}
  return result.Append('\\',slash*2).Append('"').ToString();
 }
 internal static async Task<GitProcessResult> RunAsync(ProtectedPathLease executable,IReadOnlyList<string> arguments,string cwd,IReadOnlyDictionary<string,string> environment,int timeoutMs,int maxBytes,CancellationToken cancellation){
  if(!OperatingSystem.IsWindows()||timeoutMs<1||timeoutMs>60000||maxBytes<1||maxBytes>262144||arguments.Count>96)throw new WorkspaceException("input_invalid");
  executable.ValidateUnchanged();using var directory=ProtectedPathLease.Acquire(new("process_directory",cwd,true,null),WindowsIdentity.GetCurrent().User!.Value);
  var env=new SortedDictionary<string,string>(StringComparer.OrdinalIgnoreCase);
  foreach(var pair in environment){if(pair.Key.Length==0||pair.Key.Contains('=')||pair.Key.Contains('\0')||pair.Value.Contains('\0')||!env.TryAdd(pair.Key,pair.Value))throw new WorkspaceException("input_invalid");}
  var envBlock=string.Join('\0',env.Select(p=>p.Key+"="+p.Value))+"\0\0";if(envBlock.Length>32767)throw new WorkspaceException("input_invalid");
  var security=new Security{Length=Marshal.SizeOf<Security>(),Inherit=true};SafeFileHandle? outRead=null,outWrite=null,errRead=null,errWrite=null,input=null;
  IntPtr job=IntPtr.Zero,attributes=IntPtr.Zero,handleList=IntPtr.Zero,envPointer=IntPtr.Zero;ProcessInfo process=default;bool attributesReady=false,assigned=false;
  int stopped=0,overflow=0;var gate=new object();
  void Kill(){lock(gate){if(job!=IntPtr.Zero){CloseHandle(job);job=IntPtr.Zero;}}}
  try{
   if(!CreatePipe(out outRead,out outWrite,ref security,0)||!CreatePipe(out errRead,out errWrite,ref security,0)||!SetHandleInformation(outRead,1,0)||!SetHandleInformation(errRead,1,0))throw new WorkspaceException("git_unavailable");
   input=CreateFileW("NUL",0x80000000,3,ref security,3,0,IntPtr.Zero);if(input.IsInvalid)throw new WorkspaceException("git_unavailable");
   job=CreateJobObjectW(IntPtr.Zero,null);var limits=new ExtendedLimits{Basic=new BasicLimits{Flags=0x2000}};
   if(job==IntPtr.Zero||!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf<ExtendedLimits>()))throw new WorkspaceException("git_unavailable");
   UIntPtr attributeSize=UIntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref attributeSize);
   attributes=Marshal.AllocHGlobal(checked((int)attributeSize.ToUInt64()));if(!InitializeProcThreadAttributeList(attributes,1,0,ref attributeSize))throw new WorkspaceException("git_unavailable");attributesReady=true;
   handleList=Marshal.AllocHGlobal(IntPtr.Size*3);Marshal.WriteIntPtr(handleList,0,input.DangerousGetHandle());Marshal.WriteIntPtr(handleList,IntPtr.Size,outWrite.DangerousGetHandle());Marshal.WriteIntPtr(handleList,IntPtr.Size*2,errWrite.DangerousGetHandle());
   if(!UpdateProcThreadAttribute(attributes,0,(UIntPtr)0x20002,handleList,(UIntPtr)(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero))throw new WorkspaceException("git_unavailable");
   var startup=new StartupEx{Start=new Startup{Size=Marshal.SizeOf<StartupEx>(),Flags=0x100,In=input.DangerousGetHandle(),Out=outWrite.DangerousGetHandle(),Err=errWrite.DangerousGetHandle()},Attributes=attributes};
   envPointer=Marshal.StringToHGlobalUni(envBlock);
   var command=new StringBuilder(Quote(executable.PathValue)+" "+string.Join(' ',arguments.Select(Quote)));
   if(!CreateProcessW(executable.PathValue,command,IntPtr.Zero,IntPtr.Zero,true,0x08080404,envPointer,cwd,ref startup,out process))throw new WorkspaceException("git_unavailable");
   if(!AssignProcessToJobObject(job,process.Process))throw new WorkspaceException("git_unavailable");assigned=true;
   outWrite.Dispose();outWrite=null;errWrite.Dispose();errWrite=null;input.Dispose();input=null;
   using var deadline=CancellationTokenSource.CreateLinkedTokenSource(cancellation);deadline.CancelAfter(timeoutMs);
   using var registration=deadline.Token.Register(()=>{Interlocked.Exchange(ref stopped,1);Kill();});
   var stdout=ReadBounded(outRead,maxBytes,()=>{Interlocked.Exchange(ref overflow,1);Kill();});outRead=null;
   var stderr=ReadBounded(errRead,maxBytes,()=>{Interlocked.Exchange(ref overflow,1);Kill();});errRead=null;
   if(Volatile.Read(ref stopped)==0&&ResumeThread(process.Thread)==uint.MaxValue)throw new WorkspaceException("git_unavailable");
   var waited=await Task.Run(()=>WaitForSingleObject(process.Process,(uint)(timeoutMs+5000)));
   if(waited!=0){Interlocked.Exchange(ref stopped,1);Kill();if(WaitForSingleObject(process.Process,5000)!=0)throw new WorkspaceException("git_unavailable");}
   GetExitCodeProcess(process.Process,out var exit);
   Kill(); // Includes any descendant which outlived its parent, even after an otherwise normal exit.
   var output=await stdout;await stderr;
   directory.ValidateUnchanged();executable.ValidateUnchanged();
   return new(Volatile.Read(ref stopped)!=0||Volatile.Read(ref overflow)!=0?null:checked((int)exit),new UTF8Encoding(false,true).GetString(output),Volatile.Read(ref stopped)!=0,Volatile.Read(ref overflow)!=0);
  }finally{
   Kill();if(process.Process!=IntPtr.Zero){if(!assigned)TerminateProcess(process.Process,1);CloseHandle(process.Process);}if(process.Thread!=IntPtr.Zero)CloseHandle(process.Thread);
   outRead?.Dispose();outWrite?.Dispose();errRead?.Dispose();errWrite?.Dispose();input?.Dispose();
   if(attributesReady)DeleteProcThreadAttributeList(attributes);if(attributes!=IntPtr.Zero)Marshal.FreeHGlobal(attributes);if(handleList!=IntPtr.Zero)Marshal.FreeHGlobal(handleList);if(envPointer!=IntPtr.Zero)Marshal.FreeHGlobal(envPointer);
  }
 }
 static Task<byte[]> ReadBounded(SafeFileHandle handle,int maxBytes,Action exceeded)=>Task.Run(()=>{
  using var stream=new FileStream(handle,FileAccess.Read,4096,false);using var bytes=new MemoryStream();var buffer=new byte[8192];bool marked=false;
  while(true){int count=stream.Read(buffer);if(count==0)break;int keep=(int)Math.Min(count,maxBytes-bytes.Length);if(keep>0)bytes.Write(buffer,0,keep);if(count>keep&&!marked){marked=true;exceeded();}}
  return bytes.ToArray();
 });
}
