using System;
using System.IO;
using System.Text;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Runtime.InteropServices;
using System.Threading;
namespace Omnira.Creative.Synthetic {
 internal static class WindowsProcessBoundary {
  internal static CleanupObservation LastCleanup;
  internal static int ProcessCreateAttempts;
  static int gate;
  internal static void ReleaseGate(){Interlocked.Exchange(ref gate,0);}
  internal static string Hash(string path){using(FileStream f=File.OpenRead(path))using(SHA256 h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
  internal static BoundarySession CreateSuspended(OwnedFixture f,OperationBudget budget) {
   if(Interlocked.CompareExchange(ref gate,1,0)!=0)throw new SyntheticRefusal("spawn-gate-busy");
   BoundarySession s=new BoundarySession(f,budget);
   try{s.Create();return s;}catch{s.Dispose();throw;}
  }
  internal static void CountCreate(){ProcessCreateAttempts++;}
 }
 internal sealed class BoundarySession:IDisposable {
  readonly OwnedFixture fixture;readonly OperationBudget budget;
  internal NativeHandle Process,Thread,Job,Input,Output,Error;
  internal bool ExactJobAtReturn,TokenVerified,Resumed;
  bool disposed,verified,refused;
  internal BoundarySession(OwnedFixture f,OperationBudget b){fixture=f;budget=b;}
  static IntPtr H(NativeHandle h){return h==null?IntPtr.Zero:h.Value;}
  static void Close(ref NativeHandle h){if(h!=null){h.Dispose();h=null;}}
  static void Noninherit(NativeHandle h){NativeMethods.Check(NativeMethods.SetHandleInformation(h.Value,1,0),"clear-inheritance");uint flags;NativeMethods.Check(NativeMethods.GetHandleInformation(h.Value,out flags),"read-inheritance");NativeMethods.Require((flags&1)==0,"unexpected-inheritable-handle");}
  static void Pipe(out NativeHandle r,out NativeHandle w) {
   NativeMethods.SA sa=new NativeMethods.SA();sa.Size=24;sa.Inherit=true;IntPtr a,b;
   NativeMethods.Check(NativeMethods.CreatePipe(out a,out b,ref sa,4096),"pipe-create");r=new NativeHandle(a);w=new NativeHandle(b);
  }
  internal void Create(){
   NativeMethods.ValidateAbi();NativeMethods.Require(budget.RunRemainingMs>0&&!fixture.Disposed,"setup-budget");
   NativeHandle childIn=null,childOut=null,childErr=null;
   try {
    Pipe(out childIn,out Input);Noninherit(Input);Pipe(out Output,out childOut);Noninherit(Output);Pipe(out Error,out childErr);Noninherit(Error);
    Job=new NativeHandle(NativeMethods.CreateJobObjectW(IntPtr.Zero,null));NativeMethods.Check(!Job.IsInvalid,"job-create");Noninherit(Job);
    using(NativeBuffer policy=new NativeBuffer(144)){
     NativeMethods.LIMITS limits=new NativeMethods.LIMITS();limits.Basic.Flags=0x2008;limits.Basic.Count=4;Marshal.StructureToPtr(limits,policy.Value,false);
     NativeMethods.Check(NativeMethods.SetInformationJobObject(Job.Value,9,policy.Value,144),"job-set-policy");VerifyPolicy(policy);
    }
    IntPtr size=IntPtr.Zero;NativeMethods.InitializeProcThreadAttributeList(IntPtr.Zero,3,0,ref size);
    NativeMethods.Require(size.ToInt64()>0&&size.ToInt64()<=65536,"attribute-size");
    using(NativeBuffer list=new NativeBuffer((int)size))
    using(NativeBuffer caps=new NativeBuffer(24))
    using(NativeBuffer jobList=new NativeBuffer(8))
    using(NativeBuffer handles=new NativeBuffer(32)){
     bool initialized=false;IntPtr env=IntPtr.Zero;
     try {
      NativeMethods.Check(NativeMethods.InitializeProcThreadAttributeList(list.Value,3,0,ref size),"attribute-init");initialized=true;
      NativeMethods.CAPS c=new NativeMethods.CAPS();c.Sid=fixture.Sid;Marshal.StructureToPtr(c,caps.Value,false);
      NativeMethods.Check(NativeMethods.UpdateProcThreadAttribute(list.Value,0,new IntPtr(0x20009),caps.Value,new IntPtr(24),IntPtr.Zero,IntPtr.Zero),"native-attribute-refused");
      Marshal.WriteIntPtr(handles.Value,0,childIn.Value);Marshal.WriteIntPtr(handles.Value,8,childOut.Value);Marshal.WriteIntPtr(handles.Value,16,childErr.Value);
      int count=3;
#if TEST
      if(BoundaryTestHooks.AllowedSentinel!=null){Marshal.WriteIntPtr(handles.Value,24,BoundaryTestHooks.AllowedSentinel.Value);count=4;}
#endif
      NativeMethods.Check(NativeMethods.UpdateProcThreadAttribute(list.Value,0,new IntPtr(0x20002),handles.Value,new IntPtr(count*8),IntPtr.Zero,IntPtr.Zero),"native-attribute-refused");
      Marshal.WriteIntPtr(jobList.Value,Job.Value);
      IntPtr attribute=new IntPtr(0x2000D);
#if TEST
      if(BoundaryTestHooks.UnsupportedAttribute)attribute=new IntPtr(0x2ffff);
#endif
      NativeMethods.Check(NativeMethods.UpdateProcThreadAttribute(list.Value,0,attribute,jobList.Value,new IntPtr(8),IntPtr.Zero,IntPtr.Zero),"native-attribute-refused");
      NativeMethods.EX startup=new NativeMethods.EX();startup.Startup.Size=112;startup.Startup.Flags=0x100;startup.Startup.In=childIn.Value;startup.Startup.Out=childOut.Value;startup.Startup.Err=childErr.Value;startup.Attributes=list.Value;
      env=Marshal.StringToHGlobalUni("LOCALAPPDATA="+Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)+"\0PATH=C:\\Windows\\System32\0SystemRoot=C:\\Windows\0WINDIR=C:\\Windows\0\0");
      string js="let b='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>{b+=x;if(b.length>16)process.exit(4)});process.stdin.on('end',()=>{if(b!=='ping')process.exit(3);process.stdout.write('pong');process.stderr.write('qualification');});";
      string loader="eval(Buffer.from(process.argv[1],'base64').toString('utf8'))";
      StringBuilder command=new StringBuilder("\""+fixture.Runtime+"\" --no-addons --eval \""+loader+"\" "+Convert.ToBase64String(Encoding.UTF8.GetBytes(js)));
      NativeMethods.PROCESS p;WindowsProcessBoundary.CountCreate();
      bool ok=NativeMethods.CreateProcessW(fixture.Runtime,command,IntPtr.Zero,IntPtr.Zero,true,0x08080404,env,@"C:\Windows\System32",ref startup,out p);
      int nativeError=Marshal.GetLastWin32Error();
      if(!ok)throw new SyntheticRefusal("combined-create-refused",nativeError);
      Process=new NativeHandle(p.Process);Thread=new NativeHandle(p.Thread);
      // Parent copies close before any token inspection or resume.
      Close(ref childIn);Close(ref childOut);Close(ref childErr);
      bool member;NativeMethods.Check(NativeMethods.IsProcessInJob(Process.Value,Job.Value,out member),"job-at-return-query");NativeMethods.Require(member,"job-at-return-mismatch");ExactJobAtReturn=true;
      using(NativeBuffer members=new NativeBuffer(40)){
       NativeMethods.Check(NativeMethods.QueryInformationJobObject(Job.Value,3,members.Value,40,IntPtr.Zero),"job-members-query");
       NativeMethods.Require(Marshal.ReadInt32(members.Value,0)==1&&Marshal.ReadInt32(members.Value,4)==1&&(uint)Marshal.ReadInt64(members.Value,8)==p.Pid,"unexpected-job-member");
      }
      Console.WriteLine("CREATE pid="+p.Pid+" suspended=true combinedAttributes=3 inheritHandles=true exactJobAtReturn=true");
     }finally{if(initialized)NativeMethods.DeleteProcThreadAttributeList(list.Value);if(env!=IntPtr.Zero)Marshal.FreeHGlobal(env);}
    }
   }finally{Close(ref childIn);Close(ref childOut);Close(ref childErr);}
  }
  void VerifyPolicy(NativeBuffer buffer) {
   NativeMethods.Check(NativeMethods.QueryInformationJobObject(Job.Value,9,buffer.Value,144,IntPtr.Zero),"job-query");
   NativeMethods.LIMITS p=(NativeMethods.LIMITS)Marshal.PtrToStructure(buffer.Value,typeof(NativeMethods.LIMITS));
   uint expectedFlags=0x2008;
#if TEST
   if(BoundaryTestHooks.Mismatch=="flags")expectedFlags=0;
#endif
   NativeMethods.Require(p.Basic.Flags==expectedFlags&&p.Basic.Count==4,"pre-resume-token-mismatch");
  }
  static NativeBuffer TokenData(NativeHandle token,int kind) {
   int n;NativeMethods.GetTokenInformation(token.Value,kind,IntPtr.Zero,0,out n);
   NativeBuffer b=new NativeBuffer(n);try{NativeMethods.Check(NativeMethods.GetTokenInformation(token.Value,kind,b.Value,n,out n),"token-read");return b;}catch{b.Dispose();throw;}
  }
  static void VerifyToken(IntPtr process,string expected) {
   IntPtr raw;NativeMethods.Check(NativeMethods.OpenProcessToken(process,8,out raw),"token-open");
   using(NativeHandle token=new NativeHandle(raw)){
    bool ac,elevated,admin=false;int caps,il;string sid=null;
    using(NativeBuffer b=TokenData(token,29))ac=Marshal.ReadInt32(b.Value)!=0;
    using(NativeBuffer b=TokenData(token,20))elevated=Marshal.ReadInt32(b.Value)!=0;
    using(NativeBuffer b=TokenData(token,30))caps=Marshal.ReadInt32(b.Value);
    using(NativeBuffer b=TokenData(token,31)){IntPtr p=Marshal.ReadIntPtr(b.Value);if(p!=IntPtr.Zero)sid=new SecurityIdentifier(p).Value;}
    using(NativeBuffer b=TokenData(token,25)){string value=new SecurityIdentifier(Marshal.ReadIntPtr(b.Value)).Value;il=int.Parse(value.Substring(value.LastIndexOf('-')+1));}
    using(NativeBuffer b=TokenData(token,2)){
     int n=Marshal.ReadInt32(b.Value);NativeMethods.Require(n>=0&&n<=512&&8+n*16<=b.Size,"token-group-bound");
     for(int i=0;i<n;i++){uint flags=(uint)Marshal.ReadInt32(b.Value,16+i*16);if(new SecurityIdentifier(Marshal.ReadIntPtr(b.Value,8+i*16)).Value=="S-1-5-32-544"&&(flags&4)!=0&&(flags&16)==0)admin=true;}
    }
    int expectedCaps=0;
#if TEST
    if(expected!=null&&BoundaryTestHooks.Mismatch=="capabilities")expectedCaps=1;
#endif
    NativeMethods.Require(expected==null?(!ac&&!elevated&&!admin):(ac&&sid==expected&&caps==expectedCaps&&il==4096&&!elevated&&!admin),"pre-resume-token-mismatch");
   }
  }
  internal static void VerifyHost(){VerifyToken(new IntPtr(-1),null);}
  internal void VerifyBeforeResume(){
   if(refused)throw new SyntheticRefusal("boundary-refused");
   verified=false;
   try {
   NativeMethods.Require(!Resumed&&!disposed,"invalid-boundary-state");
   string expectedSid=fixture.ProfileSid,expectedImage=fixture.Runtime;
#if TEST
   if(BoundaryTestHooks.Mismatch=="sid")expectedSid="S-1-15-2-1";
   if(BoundaryTestHooks.Mismatch=="image")expectedImage=@"C:\Windows\System32\not-the-owned-node.exe";
#endif
   VerifyToken(Process.Value,expectedSid);
   StringBuilder image=new StringBuilder(1024);uint n=1024;NativeMethods.Check(NativeMethods.QueryFullProcessImageNameW(Process.Value,0,image,ref n),"image-query");
   NativeMethods.Require(string.Equals(image.ToString(),expectedImage,StringComparison.OrdinalIgnoreCase)&&WindowsProcessBoundary.Hash(fixture.Runtime)==fixture.RuntimeHash,"pre-resume-token-mismatch");
   {
    IntPtr expectedJob=Job.Value;
#if TEST
    if(BoundaryTestHooks.Mismatch=="job"){
     using(NativeHandle wrongJob=new NativeHandle(NativeMethods.CreateJobObjectW(IntPtr.Zero,null))){
      NativeMethods.Check(!wrongJob.IsInvalid,"test-job-create");bool wrongMember;
      NativeMethods.Check(NativeMethods.IsProcessInJob(Process.Value,wrongJob.Value,out wrongMember),"test-membership-query");
      NativeMethods.Require(wrongMember,"pre-resume-token-mismatch");
     }
    }
#endif
    bool member;NativeMethods.Check(NativeMethods.IsProcessInJob(Process.Value,expectedJob,out member),"membership-query");NativeMethods.Require(member,"pre-resume-token-mismatch");
   }
   using(NativeBuffer b=new NativeBuffer(144))VerifyPolicy(b);
   TokenVerified=true;verified=true;
   }catch{refused=true;verified=false;TokenVerified=false;Dispose();throw;}
  }
  internal void Resume(){NativeMethods.Require(verified&&!refused&&!Resumed&&!disposed&&budget.RunRemainingMs>0,"resume-refused");NativeMethods.Require(NativeMethods.ResumeThread(Thread.Value)==1,"resume-failed");Resumed=true;}
  internal static bool ObjectIdentityDecision(bool numericEqual,bool objectsEqual){return objectsEqual;}
  internal bool ChildObjectMatches(NativeHandle original) {
   NativeMethods.Require(!Resumed&&budget.RunRemainingMs>0,"sentinel-state");IntPtr copy;
   if(!NativeMethods.DuplicateHandle(Process.Value,original.Value,new IntPtr(-1),out copy,0,false,2)){int error=Marshal.GetLastWin32Error();NativeMethods.Require(error==6,"sentinel-duplicate-unexpected");Console.WriteLine("SENTINEL sourceValue="+original.Value+" duplicateError="+error+" objectsEqual=false");return false;}
   using(NativeHandle duplicate=new NativeHandle(copy)){
    bool same=NativeMethods.CompareObjectHandles(original.Value,copy);
    Console.WriteLine("SENTINEL sourceValue="+original.Value+" duplicateValue="+copy+" objectsEqual="+same+" comparison=CompareObjectHandles");
    return ObjectIdentityDecision(copy==original.Value,same);
   }
  }
  // Small qualification I/O uses PeekNamedPipe to avoid an unbounded synchronous read.
  internal void QualificationRoundTrip() {
   NativeMethods.Require(Resumed,"qualification-not-running");byte[] ping=Encoding.ASCII.GetBytes("ping");uint written;
   NativeMethods.Check(NativeMethods.WriteFile(Input.Value,ping,4,out written,IntPtr.Zero)&&written==4,"qualification-write");Close(ref Input);
   MemoryStream stdout=new MemoryStream(),stderr=new MemoryStream();bool outEof=false,errEof=false;
   while(budget.RunRemainingMs>0&&!(outEof&&errEof&&NativeMethods.WaitForSingleObject(Process.Value,0)==0)){
    Drain(Output,stdout,ref outEof);Drain(Error,stderr,ref errEof);System.Threading.Thread.Sleep(5);
   }
   NativeMethods.Require(outEof&&errEof&&NativeMethods.WaitForSingleObject(Process.Value,0)==0,"qualification-timeout");
   using(NativeBuffer members=new NativeBuffer(40)){
    NativeMethods.Check(NativeMethods.QueryInformationJobObject(Job.Value,3,members.Value,40,IntPtr.Zero),"terminal-job-members");
    NativeMethods.Require(Marshal.ReadInt32(members.Value,0)==0&&Marshal.ReadInt32(members.Value,4)==0,"live-job-producer");
   }
   uint exit;NativeMethods.Check(NativeMethods.GetExitCodeProcess(Process.Value,out exit),"qualification-exit");NativeMethods.Require(exit==0&&Encoding.ASCII.GetString(stdout.ToArray())=="pong"&&Encoding.ASCII.GetString(stderr.ToArray())=="qualification","qualification-stream-mismatch");
  }
  static void Drain(NativeHandle h,MemoryStream target,ref bool eof){
   if(eof)return;uint available;
   if(!NativeMethods.PeekNamedPipe(h.Value,IntPtr.Zero,0,IntPtr.Zero,out available,IntPtr.Zero)){int error=Marshal.GetLastWin32Error();if(error==109){eof=true;return;}throw new SyntheticRefusal("pipe-peek",error);}
   if(available==0)return;NativeMethods.Require(available<=4096&&target.Length+available<=4096,"qualification-overflow");byte[] data=new byte[(int)available];uint read;NativeMethods.Check(NativeMethods.ReadFile(h.Value,data,available,out read,IntPtr.Zero),"pipe-read");target.Write(data,0,(int)read);
  }
  public void Dispose(){
   if(disposed)return;disposed=true;
   try {
    if(Job!=null&&!Job.IsInvalid)NativeMethods.TerminateJobObject(Job.Value,2);
    if(Process!=null&&!Process.IsInvalid){
     if(!ExactJobAtReturn)NativeMethods.TerminateProcess(Process.Value,2);
     bool stopped=NativeMethods.WaitForSingleObject(Process.Value,(uint)budget.CleanupRemainingMs)==0;fixture.Cleanup.ProcessesStopped&=stopped;
    }
   }finally{Close(ref Input);Close(ref Output);Close(ref Error);Close(ref Thread);Close(ref Process);Close(ref Job);WindowsProcessBoundary.ReleaseGate();}
  }
 }
}