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
  internal static CleanupObservation CleanupProfile(OwnedFixture f,OperationBudget budget){
   CleanupObservation c=f.Cleanup;
   if(!c.ProcessesStopped||!c.PumpsStopped||!c.ProcessIdentityVerified){c.CleanupFailed=true;return c;}
   try{
    if(!f.ProfileCreated){c.ProfileDeleteApiSucceeded=c.ProfileStorageAbsent=c.ProfileMappingAbsent=true;c.FixtureAbsent=c.InputFixtureAbsent;return c;}
    NativeMethods.Require(f.StorageIdentityEstablished&&f.ProfileOwner!=null&&budget.CleanupRemainingMs>0,"profile-cleanup-ownership");
    // Delete only the pre-child manifest via held exact identities, before API removal.
    if(!f.ProfileOwner.Delete(budget)){c.CleanupFailed=true;return c;}
    NativeMethods.Require(budget.CleanupRemainingMs>0,"profile-cleanup-budget");
    c.ProfileDeleteApiSucceeded=f.ProfileApiRemoved||NativeMethods.DeleteAppContainerProfile(f.ProfileName)==0;f.ProfileApiRemoved=c.ProfileDeleteApiSucceeded;
    c.ProfileStorageAbsent=!Directory.Exists(Path.GetDirectoryName(f.Storage));
#if TEST
    if(BoundaryTestHooks.MappingObservationFailure)throw new IOException("test mapping observation failure");
#endif
    using(Microsoft.Win32.RegistryKey key=Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppContainer\Mappings\"+f.ProfileSid))c.ProfileMappingAbsent=key==null;
    c.FixtureAbsent=c.InputFixtureAbsent&&c.ProfileStorageAbsent;
   }catch{c.CleanupFailed=true;}
   return c;
  }
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
  internal bool IsDisposed{get{return disposed;}}
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
#if TEST
   CrashTestHooks.BeforeCreate();
#endif
   NativeHandle childIn=null,childOut=null,childErr=null;
   try {
    Pipe(out childIn,out Input);Noninherit(Input);Pipe(out Output,out childOut);Noninherit(Output);Pipe(out Error,out childErr);Noninherit(Error);
#if TEST
    if(LifecycleTestHooks.HoldWriter){
     IntPtr held;NativeMethods.Check(NativeMethods.DuplicateHandle(new IntPtr(-1),childOut.Value,new IntPtr(-1),out held,0,false,2),"test-held-writer");
     LifecycleTestHooks.Writer=new NativeHandle(held);Noninherit(LifecycleTestHooks.Writer);
    }
#endif
#if TEST
    CleanupTestHooks.At("pipes");
#endif
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
      string js=SyntheticProtocol.FixedNodePayload;
#if TEST
      if(ProtocolTestHooks.Payload!=null)js=ProtocolTestHooks.Payload;
      if(LifecycleTestHooks.Payload!=null)js=LifecycleTestHooks.Payload;
#endif
      string loader="eval(Buffer.from(process.argv[1],'base64').toString('utf8'))";
      StringBuilder command=new StringBuilder("\""+fixture.Runtime+"\" --no-addons --eval \""+loader+"\" "+Convert.ToBase64String(Encoding.UTF8.GetBytes(js)));
      NativeMethods.PROCESS p;WindowsProcessBoundary.CountCreate();
      bool ok=NativeMethods.CreateProcessW(fixture.Runtime,command,IntPtr.Zero,IntPtr.Zero,true,0x08080404,env,@"C:\Windows\System32",ref startup,out p);
      int nativeError=Marshal.GetLastWin32Error();
      if(!ok)throw new SyntheticRefusal("combined-create-refused",nativeError);
      Process=new NativeHandle(p.Process);Thread=new NativeHandle(p.Thread);
#if TEST
      CrashTestHooks.AfterCreate(this);
#endif
      // Parent copies close before any token inspection or resume.
      Close(ref childIn);Close(ref childOut);Close(ref childErr);
      bool member;NativeMethods.Check(NativeMethods.IsProcessInJob(Process.Value,Job.Value,out member),"job-at-return-query");NativeMethods.Require(member,"job-at-return-mismatch");ExactJobAtReturn=true;
      using(NativeBuffer members=new NativeBuffer(40)){
       NativeMethods.Check(NativeMethods.QueryInformationJobObject(Job.Value,3,members.Value,40,IntPtr.Zero),"job-members-query");
       NativeMethods.Require(Marshal.ReadInt32(members.Value,0)==1&&Marshal.ReadInt32(members.Value,4)==1&&(uint)Marshal.ReadInt64(members.Value,8)==p.Pid,"unexpected-job-member");
      }
#if TEST
      CleanupTestHooks.At("process");
#endif
#if TEST
      Console.WriteLine("CREATE pid="+p.Pid+" suspended=true combinedAttributes=3 inheritHandles=true exactJobAtReturn=true");
#endif
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
   int minimum=(kind==NativeMethods.TokenIntegrityLevel?16:(kind==NativeMethods.TokenAppContainerSid||kind==NativeMethods.TokenGroups||kind==NativeMethods.TokenCapabilities)?8:4);
   int n=4;
   // These two ABI classes are fixed DWORDs; TokenElevation's zero-byte probe
   // returns ERROR_BAD_LENGTH on this OS, so query the known layout directly.
   if(kind!=NativeMethods.TokenElevation&&kind!=NativeMethods.TokenIsAppContainer){
    bool probe=NativeMethods.GetTokenInformation(token.Value,kind,IntPtr.Zero,0,out n);
    int error=Marshal.GetLastWin32Error();
    NativeMethods.Require(!probe&&error==NativeMethods.ErrorInsufficientBuffer&&n>=minimum&&n<=65536,"token-size");
   }
   NativeBuffer b=new NativeBuffer(n);try{
    NativeMethods.Check(NativeMethods.GetTokenInformation(token.Value,kind,b.Value,b.Size,out n),"token-read");
    NativeMethods.Require(n>=minimum&&n<=b.Size,"token-size");return b;
   }catch{b.Dispose();throw;}
  }
  internal static void VerifyToken(IntPtr process,string expected) {
   IntPtr raw;NativeMethods.Check(NativeMethods.OpenProcessToken(process,8,out raw),"token-open");
   using(NativeHandle token=new NativeHandle(raw)){
    bool ac,elevated,admin=false;int caps,il;string sid=null;
    using(NativeBuffer b=TokenData(token,NativeMethods.TokenIsAppContainer))ac=Marshal.ReadInt32(b.Value)!=0;
    using(NativeBuffer b=TokenData(token,NativeMethods.TokenElevation))elevated=Marshal.ReadInt32(b.Value)!=0;
    using(NativeBuffer b=TokenData(token,NativeMethods.TokenCapabilities))caps=Marshal.ReadInt32(b.Value);
    using(NativeBuffer b=TokenData(token,NativeMethods.TokenAppContainerSid)){IntPtr p=Marshal.ReadIntPtr(b.Value);if(p!=IntPtr.Zero)sid=new SecurityIdentifier(p).Value;}
    using(NativeBuffer b=TokenData(token,NativeMethods.TokenIntegrityLevel)){string value=new SecurityIdentifier(Marshal.ReadIntPtr(b.Value)).Value;il=int.Parse(value.Substring(value.LastIndexOf('-')+1));}
    using(NativeBuffer b=TokenData(token,NativeMethods.TokenGroups)){
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
   verified=false;TokenVerified=false;
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
#if TEST
   CleanupTestHooks.At("token");
#endif
   }catch{refused=true;verified=false;if(!TokenVerified)fixture.Cleanup.ProcessIdentityVerified=false;TokenVerified=false;Dispose();throw;}
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
  // Finite protocol qualification adapter uses the same cancellable PipeSession as RunSynthetic.
  internal void QualificationRoundTrip() {
   byte[] bytes=new byte[0];string hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
   string nonce=fixture.Nonce;
   ProtocolCapture capture=CanaryRoundTrip(SyntheticProtocol.EncodeRequest(new CanaryInput(bytes,hash),nonce));
   NativeMethods.Require(capture.ExitCode==0&&capture.Stderr.Length==0,"qualification-stream-mismatch");
   SyntheticProtocol.VerifyResult(capture.Stdout,new RequestExpectation(nonce,0,hash));
  }
  internal ProtocolCapture CanaryRoundTrip(byte[] request) {
   NativeMethods.Require(Resumed&&!disposed&&request!=null,"qualification-not-running");
   PipeSession pipes=null;
   try{
    ObserveMembers();
    pipes=PipeSession.Start(this,request,budget);
    while(true){
     NativeMethods.Require(budget.RunRemainingMs>0,"qualification-timeout");
     string failure=pipes.Failure;
     NativeMethods.Require(failure==null||failure=="stdin-broken-pipe","qualification-pump-failure");
     ObserveMembers();
     if(RootExited&&ActiveMemberCount==0&&pipes.Finished)break;
     NativeMethods.Require(budget.RunRemainingMs>0,"qualification-timeout");
     System.Threading.Thread.Sleep(Math.Min(5,budget.RunRemainingMs));
    }
    uint exit=ExitCode;
    NativeMethods.Require(pipes.OutputComplete&&(pipes.WriterComplete||exit!=0),"qualification-stream-incomplete");
    NativeMethods.Require(pipes.Failure==null||exit!=0,"qualification-write-failed");
    NativeMethods.Require(WaitForObservedExit(budget),"qualification-live-member");
    CapturedStreams capture=pipes.CompleteAfterStop();
    NativeMethods.Require(!capture.Overflow,"qualification-overflow");
    return new ProtocolCapture(capture.Stdout,capture.Stderr,exit);
   }finally{
    if(pipes!=null)pipes.CancelAndJoin();
    try{StopOwnedJob(budget);}catch{fixture.Cleanup.CleanupFailed=true;}
    try{fixture.Cleanup.ProcessesStopped&=WaitForObservedExit(budget);}catch{fixture.Cleanup.ProcessesStopped=false;}
   }
  }
  sealed class Member {
   internal readonly NativeHandle Handle;internal readonly uint Pid;internal bool Verified;
   internal Member(NativeHandle handle,uint pid){Handle=handle;Pid=pid;}
  }
  readonly System.Collections.Generic.List<Member> observed=new System.Collections.Generic.List<Member>();
  int consoleMembers,nodeMembers;
  internal int ObservedNodeCount{get{return nodeMembers;}}
  internal int ObservedMemberCount{get{return observed.Count;}}
  internal void MarkCleanupFailure(){fixture.Cleanup.CleanupFailed=true;}
  internal uint ExitCode{get{uint code;NativeMethods.Check(NativeMethods.GetExitCodeProcess(Process.Value,out code),"process-exit-query");return code;}}
  internal bool RootExited{get{return NativeMethods.WaitForSingleObject(Process.Value,0)==0;}}
  internal int ActiveMemberCount{get;private set;}
  internal void ObserveMembers(){
   NativeMethods.Require(Job!=null&&!disposed,"membership-state");
   using(NativeBuffer list=new NativeBuffer(40)){
    NativeMethods.Check(NativeMethods.QueryInformationJobObject(Job.Value,3,list.Value,40,IntPtr.Zero),"job-members-query");
    int assigned=Marshal.ReadInt32(list.Value),count=Marshal.ReadInt32(list.Value,4);
    NativeMethods.Require(assigned==count&&count>=0&&count<=4,"job-member-bound");
    for(int i=0;i<count;i++){
     long id=Marshal.ReadInt64(list.Value,8+i*8);NativeMethods.Require(id>0&&id<=uint.MaxValue,"job-member-id");
     uint pid=(uint)id;Member known=null;
     foreach(Member m in observed)if(m.Pid==pid){known=m;break;}
     if(known==null){
      IntPtr handle;
      if(pid==NativeMethods.GetProcessId(Process.Value))
       NativeMethods.Check(NativeMethods.DuplicateHandle(new IntPtr(-1),Process.Value,new IntPtr(-1),out handle,0,false,2),"member-root-duplicate");
      else{
       handle=NativeMethods.OpenProcess(NativeMethods.Synchronize|NativeMethods.ProcessQueryLimitedInformation,false,pid);
       NativeMethods.Check(handle!=IntPtr.Zero,"member-open");
      }
      NativeHandle held=new NativeHandle(handle);bool exact;
      if(observed.Count>=4){held.Dispose();throw new SyntheticRefusal("observed-member-bound");}
      try{
       NativeMethods.Check(NativeMethods.IsProcessInJob(held.Value,Job.Value,out exact),"member-exact-job");
       NativeMethods.Require(exact,"member-wrong-job");
       known=new Member(held,pid);observed.Add(known);
      }catch{held.Dispose();throw;}
      // PID is only lookup input. All image/token decisions use the retained exact-job handle.
      StringBuilder image=new StringBuilder(1024);uint length=1024;
      NativeMethods.Check(NativeMethods.QueryFullProcessImageNameW(held.Value,0,image,ref length),"member-image");
      string allowedImage=fixture.Runtime;
#if TEST
      if(LifecycleTestHooks.UnknownMember)allowedImage=@"C:\Windows\System32\not-the-owned-image.exe";
#endif
      bool node=string.Equals(image.ToString(),allowedImage,StringComparison.OrdinalIgnoreCase);
      bool console=string.Equals(image.ToString(),@"C:\Windows\System32\conhost.exe",StringComparison.OrdinalIgnoreCase);
      NativeMethods.Require(node||console,"unknown-job-member");
      if(console){consoleMembers++;NativeMethods.Require(consoleMembers<=2,"console-member-bound");}
      else nodeMembers++;
      VerifyToken(held.Value,fixture.ProfileSid);
      known.Verified=true;
#if TEST
      Console.WriteLine("MEMBER pid="+pid+" role="+(console?"system-console":"pinned-node")+" exactJob=true imageVerified=true tokenVerified=true held=true");
#endif
     }
     NativeMethods.Require(known.Verified,"unknown-job-member");
    }
    ActiveMemberCount=count;
   }
  }
  internal void StopOwnedJob(OperationBudget operation){
   NativeMethods.Require(object.ReferenceEquals(operation,budget),"budget-mismatch");
   if(Job==null||Job.IsInvalid)return;
   Exception observationFailure=null;
   try{if(!disposed)ObserveMembers();}catch(Exception e){observationFailure=e;fixture.Cleanup.CleanupFailed=true;fixture.Cleanup.ProcessIdentityVerified=false;}
   NativeMethods.Check(NativeMethods.TerminateJobObject(Job.Value,2),"job-stop");
   if(observationFailure!=null)throw observationFailure;
  }
  internal bool WaitForObservedExit(OperationBudget operation){
   NativeMethods.Require(object.ReferenceEquals(operation,budget),"budget-mismatch");
   bool stopped=Process==null||NativeMethods.WaitForSingleObject(Process.Value,(uint)budget.CleanupRemainingMs)==0;
   foreach(Member member in observed)stopped&=NativeMethods.WaitForSingleObject(member.Handle.Value,(uint)budget.CleanupRemainingMs)==0;
   // Terminated job can take time to publish its empty membership.
   while(budget.CleanupRemainingMs>0){
    using(NativeBuffer list=new NativeBuffer(40)){
     if(!NativeMethods.QueryInformationJobObject(Job.Value,3,list.Value,40,IntPtr.Zero)){stopped=false;break;}
     if(Marshal.ReadInt32(list.Value)==0&&Marshal.ReadInt32(list.Value,4)==0){fixture.Cleanup.ProcessesStopped&=stopped;return stopped;}
    }
    System.Threading.Thread.Sleep(Math.Min(5,budget.CleanupRemainingMs));
   }
   fixture.Cleanup.ProcessesStopped=false;return false;
  }
  public void Dispose(){
   if(disposed)return;disposed=true;
   try {
    // A setup exception may occur before VerifyBeforeResume was called.
    // Corroborate the held created process before claiming cleanup, without
    // ever upgrading an earlier failed identity observation.
    if(Process!=null&&!Process.IsInvalid&&!TokenVerified&&fixture.Cleanup.ProcessIdentityVerified){
     try{
      NativeMethods.Require(budget.CleanupRemainingMs>0,"cleanup-identity-budget");
      bool exact;NativeMethods.Check(NativeMethods.IsProcessInJob(Process.Value,Job.Value,out exact),"cleanup-exact-job");
      NativeMethods.Require(exact,"cleanup-wrong-job");
      VerifyToken(Process.Value,fixture.ProfileSid);
      StringBuilder image=new StringBuilder(1024);uint length=1024;
      NativeMethods.Check(NativeMethods.QueryFullProcessImageNameW(Process.Value,0,image,ref length),"cleanup-image");
      NativeMethods.Require(string.Equals(image.ToString(),fixture.Runtime,StringComparison.OrdinalIgnoreCase),"cleanup-image-mismatch");
     }catch{fixture.Cleanup.ProcessIdentityVerified=false;fixture.Cleanup.CleanupFailed=true;}
    }
    if(Job!=null&&!Job.IsInvalid)NativeMethods.TerminateJobObject(Job.Value,2);
    if(Process!=null&&!Process.IsInvalid){
     if(!ExactJobAtReturn)NativeMethods.TerminateProcess(Process.Value,2);
     bool stopped=NativeMethods.WaitForSingleObject(Process.Value,(uint)budget.CleanupRemainingMs)==0;fixture.Cleanup.ProcessesStopped&=stopped;
    }
   }finally{foreach(Member member in observed)member.Handle.Dispose();Close(ref Input);Close(ref Output);Close(ref Error);Close(ref Thread);Close(ref Process);Close(ref Job);WindowsProcessBoundary.ReleaseGate();}
  }
 }
}