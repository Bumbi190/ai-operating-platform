using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
namespace Omnira.Creative.Synthetic {
 // All alternate entry points and native supervisor plumbing compile into TEST only.
 internal sealed class GuardedHost:IDisposable {
  internal NativeHandle Process,Thread,Job;
  internal readonly string StdoutPath,StderrPath;
  internal static string Executable{get{return typeof(GuardedHost).Assembly.Location;}}
  internal GuardedHost(string args,string prefix){
   StdoutPath=prefix+".stdout.txt";StderrPath=prefix+".stderr.txt";
   NativeHandle output=null,error=null,input=null;IntPtr list=IntPtr.Zero;bool initialized=false;IntPtr env=IntPtr.Zero;
   try{
    Job=new NativeHandle(NativeMethods.CreateJobObjectW(IntPtr.Zero,null));NativeMethods.Check(!Job.IsInvalid,"guard-job");
    using(NativeBuffer policy=new NativeBuffer(144)){
     NativeMethods.LIMITS p=new NativeMethods.LIMITS();p.Basic.Flags=0x2000;Marshal.StructureToPtr(p,policy.Value,false);
     NativeMethods.Check(NativeMethods.SetInformationJobObject(Job.Value,9,policy.Value,144),"guard-policy");
     NativeMethods.Check(NativeMethods.QueryInformationJobObject(Job.Value,9,policy.Value,144,IntPtr.Zero),"guard-readback");
     p=(NativeMethods.LIMITS)Marshal.PtrToStructure(policy.Value,typeof(NativeMethods.LIMITS));
     NativeMethods.Require(p.Basic.Flags==0x2000,"guard-policy-mismatch");
    }
    output=FileEnd(StdoutPath);error=FileEnd(StderrPath);
    input=new NativeHandle(InputNative.CreateFileW("NUL",0x80000000,3,IntPtr.Zero,3,0,IntPtr.Zero));NativeMethods.Check(!input.IsInvalid,"guard-stdin");
    foreach(NativeHandle h in new[]{output,error,input})NativeMethods.Check(NativeMethods.SetHandleInformation(h.Value,1,1),"guard-inherit");
    IntPtr size=IntPtr.Zero;NativeMethods.InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size);
    NativeMethods.Require(size.ToInt64()>0&&size.ToInt64()<65536,"guard-attribute-bound");
    list=Marshal.AllocHGlobal(size);NativeMethods.Check(NativeMethods.InitializeProcThreadAttributeList(list,2,0,ref size),"guard-attributes");initialized=true;
    using(NativeBuffer jobs=new NativeBuffer(8))using(NativeBuffer handles=new NativeBuffer(24)){
     Marshal.WriteIntPtr(jobs.Value,Job.Value);
     NativeMethods.Check(NativeMethods.UpdateProcThreadAttribute(list,0,new IntPtr(0x2000D),jobs.Value,new IntPtr(8),IntPtr.Zero,IntPtr.Zero),"guard-job-list");
     Marshal.WriteIntPtr(handles.Value,input.Value);Marshal.WriteIntPtr(handles.Value,8,output.Value);Marshal.WriteIntPtr(handles.Value,16,error.Value);
     NativeMethods.Check(NativeMethods.UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles.Value,new IntPtr(24),IntPtr.Zero,IntPtr.Zero),"guard-handle-list");
     NativeMethods.EX startup=new NativeMethods.EX();startup.Startup.Size=112;startup.Startup.Flags=0x100;startup.Startup.In=input.Value;startup.Startup.Out=output.Value;startup.Startup.Err=error.Value;startup.Attributes=list;
     NativeMethods.PROCESS p;
     env=Marshal.StringToHGlobalUni("LOCALAPPDATA="+Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)+"\0PATH=C:\\Windows\\System32\0SystemRoot=C:\\Windows\0WINDIR=C:\\Windows\0\0");
     NativeMethods.Check(NativeMethods.CreateProcessW(Executable,new StringBuilder("\""+Executable+"\" "+args),IntPtr.Zero,IntPtr.Zero,true,0x08080404,env,@"C:\Windows\System32",ref startup,out p),"guard-create");
     Process=new NativeHandle(p.Process);Thread=new NativeHandle(p.Thread);
     bool member;NativeMethods.Check(NativeMethods.IsProcessInJob(Process.Value,Job.Value,out member),"guard-membership");NativeMethods.Require(member,"guard-at-birth");
     VerifyImage(Process.Value,Executable);BoundarySession.VerifyToken(Process.Value,null);
     NativeMethods.Require(NativeMethods.ResumeThread(Thread.Value)==1,"guard-resume");
    }
   }catch{Dispose();throw;}
   finally{
    if(output!=null)output.Dispose();if(error!=null)error.Dispose();if(input!=null)input.Dispose();
    if(env!=IntPtr.Zero)Marshal.FreeHGlobal(env);
    if(initialized)NativeMethods.DeleteProcThreadAttributeList(list);if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list);
   }
  }
  static NativeHandle FileEnd(string path){
   NativeHandle h=new NativeHandle(InputNative.CreateFileW(path,0x40000000,3,IntPtr.Zero,1,0x80,IntPtr.Zero));NativeMethods.Check(!h.IsInvalid,"guard-log-create");return h;
  }
  internal static void VerifyImage(IntPtr process,string expected){
   StringBuilder image=new StringBuilder(1024);uint n=1024;NativeMethods.Check(NativeMethods.QueryFullProcessImageNameW(process,0,image,ref n),"guard-image");
   NativeMethods.Require(string.Equals(image.ToString(),expected,StringComparison.OrdinalIgnoreCase),"guard-image-mismatch");
  }
  internal bool Exited{get{return NativeMethods.WaitForSingleObject(Process.Value,0)==0;}}
  internal uint ExitCode{get{uint code;NativeMethods.Check(NativeMethods.GetExitCodeProcess(Process.Value,out code),"guard-exit");return code;}}
  internal void Kill(){NativeMethods.Check(NativeMethods.TerminateProcess(Process.Value,73),"guard-stop-held-owner");}
  internal string Output{get{
   using(FileStream stream=new FileStream(StdoutPath,FileMode.Open,FileAccess.Read,FileShare.ReadWrite))
   using(StreamReader reader=new StreamReader(stream))return reader.ReadToEnd();
  }}
  public void Dispose(){
   if(Job!=null){Job.Dispose();Job=null;}
   if(Thread!=null){Thread.Dispose();Thread=null;}
   if(Process!=null){Process.Dispose();Process=null;}
  }
 }
 internal static class CrashTestHooks {
  internal static string Phase,Nonce,Sid;
  internal static EventWaitHandle Release;
  internal static OperationBudget Budget;
  internal static bool barrier;
  internal static OwnedFixture Attach(OperationBudget budget){
   Budget=budget;
   OwnedFixture f=new OwnedFixture(Nonce);f.Budget=budget;f.ProfileName="omnira.launcher."+Nonce;f.ProfileSid=Sid;f.ProfileCreated=true;
   f.Storage=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Packages",f.ProfileName,"AC");
   f.StorageIdentityEstablished=true;f.Runtime=Path.Combine(f.Storage,"runtime","node.exe");
   f.RuntimePin=new FileStream(f.Runtime,FileMode.Open,FileAccess.Read,FileShare.Read);f.RuntimeHash=WindowsProcessBoundary.Hash(f.Runtime);
   NativeMethods.Check(DeriveAppContainerSidFromAppContainerName(f.ProfileName,out f.Sid)==0,"crash-profile-sid");
   Assert.Equal(Sid,new System.Security.Principal.SecurityIdentifier(f.Sid).Value);
   f.InputDirectory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Temp","omnira-launcher-input-"+Nonce);
   f.InputRoot=Path.Combine(f.InputDirectory,"root");f.InputOwner=new InputOwnership(f);
   f.InputOwner.Record(f.InputDirectory,true);f.InputOwner.Record(Path.Combine(f.InputDirectory,"owner.txt"),false);
   f.InputOwner.Record(f.InputRoot,true);f.InputOwner.Record(Path.Combine(f.InputRoot,"input"),true);f.InputOwner.Record(Path.Combine(f.InputRoot,"input","sample.txt"),false);
   // Driver retains the original pre-child ownership manifests. Owner never adopts child-created entries.
   f.ProfileOwner=new OwnedEntries();f.ProfileOwner.CaptureTree(Path.GetDirectoryName(f.Storage),budget);
   return f;
  }
  [DllImport(@"C:\Windows\System32\userenv.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern int DeriveAppContainerSidFromAppContainerName(string name,out IntPtr sid);
  internal static void BeforeCreate(){if(Phase=="BeforeCreate")Barrier(null);}
  internal static void AfterCreate(BoundarySession s){if(Phase=="AfterCreateBeforeResume"||Phase=="RetainedJobPositive")Barrier(s);}
  internal static void Ready(BoundarySession s,PipeSession p){
   if(Phase==null||barrier||!p.TestReady("READY-"+Nonce))return;
   if(Phase=="AfterReady"||Phase=="PumpFailStop"||Phase=="BudgetFailStop"){
    Barrier(s);throw new SyntheticRefusal("test-forced-stop");
   }
  }
  static void Barrier(BoundarySession s){
   barrier=true;
   Console.WriteLine("BARRIER "+Phase+" "+Nonce+" "+(s==null?"0 0 0":s.Process.Value.ToInt64()+" "+s.Job.Value.ToInt64()+" "+s.Thread.Value.ToInt64())+" "+WindowsProcessBoundary.ProcessCreateAttempts);
   Console.Out.Flush();
   NativeMethods.Require(Release.WaitOne(Budget.RunRemainingMs),"crash-barrier-timeout");
  }
  internal static void BlockPump(){
   if(Phase!="PumpFailStop")return;
   Console.Error.WriteLine("PUMP_STUCK nonce="+Nonce);
   // Deliberate managed non-I/O stall: CancelSynchronousIo cannot join this pump.
   // Only fail-stop ends it; the driver owns the host and all descendants.
   while(true)Thread.Sleep(1);
  }
  internal static void ExhaustBudget(OperationBudget budget){
   if(Phase!="BudgetFailStop")return;
   Console.Error.WriteLine("BUDGET_EXHAUST nonce="+Nonce);
   while(budget.CleanupRemainingMs>0)Thread.Sleep(Math.Min(5,budget.CleanupRemainingMs));
  }
  [DllImport(@"C:\Windows\System32\kernel32.dll",ExactSpelling=true)]static extern uint SetErrorMode(uint mode);
  internal static int Owner(string[] args){
   SetErrorMode(3);
   Assert.Equal(4,args.Length);Phase=args[1];Nonce=args[2];Sid=args[3];
   using(Release=EventWaitHandle.OpenExisting(@"Local\OmniraCrash-"+Nonce)){
    LifecycleTestHooks.RunMs=3000;LifecycleTestHooks.TotalMs=6000;
    LifecycleTestHooks.Payload="process.stderr.write('READY-"+Nonce+"');process.stdin.resume();setInterval(()=>{},1000);";
    RunObservation o=SyntheticRunner.RunSynthetic();
    Console.WriteLine("UNEXPECTED_RETURN "+o.RefusalCode);return 1;
   }
  }
 }
 internal static class CrashHarness {
  [DllImport(@"C:\Windows\System32\kernel32.dll",ExactSpelling=true,SetLastError=true)]static extern uint SuspendThread(IntPtr thread);
  static string Prefix(string label){return Path.Combine(Path.GetDirectoryName(GuardedHost.Executable),"crash-"+label+"-"+Guid.NewGuid().ToString("N"));}
  static void Wait(Func<bool> condition,OperationBudget budget,string code){
   while(!condition()){NativeMethods.Require(budget.CleanupRemainingMs>0,code);Thread.Sleep(Math.Min(5,budget.CleanupRemainingMs));}
  }
  internal static void Run(){
   DriverCrash();
   foreach(string phase in new[]{"BeforeCreate","RetainedJobPositive","AfterCreateBeforeResume","AfterReady","PumpFailStop","BudgetFailStop"})Case(phase);
  }
  static NativeHandle Duplicate(NativeHandle owner,long value){
   IntPtr h;NativeMethods.Check(NativeMethods.DuplicateHandle(owner.Value,new IntPtr(value),new IntPtr(-1),out h,0,false,2),"crash-duplicate");return new NativeHandle(h);
  }
  static List<NativeHandle> Members(IntPtr job,OwnedFixture fixture){
   List<NativeHandle> result=new List<NativeHandle>();
   try{
    using(NativeBuffer list=new NativeBuffer(40)){
     NativeMethods.Check(NativeMethods.QueryInformationJobObject(job,3,list.Value,40,IntPtr.Zero),"crash-member-snapshot");
     int n=Marshal.ReadInt32(list.Value,4);Assert.True(n>=1&&n<=4&&Marshal.ReadInt32(list.Value)==n,"bounded membership");
     for(int i=0;i<n;i++){
      uint pid=(uint)Marshal.ReadInt64(list.Value,8+8*i);
      NativeHandle h=new NativeHandle(NativeMethods.OpenProcess(NativeMethods.Synchronize|NativeMethods.ProcessQueryLimitedInformation,false,pid));NativeMethods.Check(!h.IsInvalid,"crash-member-open");result.Add(h);
      bool member;NativeMethods.Check(NativeMethods.IsProcessInJob(h.Value,job,out member),"crash-member-exact");Assert.True(member,"exact held membership");
      StringBuilder image=new StringBuilder(1024);uint size=1024;NativeMethods.Check(NativeMethods.QueryFullProcessImageNameW(h.Value,0,image,ref size),"crash-member-image");
      Assert.True(string.Equals(image.ToString(),fixture.Runtime,StringComparison.OrdinalIgnoreCase)||string.Equals(image.ToString(),@"C:\Windows\System32\conhost.exe",StringComparison.OrdinalIgnoreCase),"exact member image");
      BoundarySession.VerifyToken(h.Value,fixture.ProfileSid);
      Console.WriteLine("CRASH_MEMBER pid="+pid+" nonce="+fixture.Nonce+" exactJob=true token=true image=true held=true");
     }
    }
    return result;
   }catch{foreach(NativeHandle h in result)h.Dispose();throw;}
  }
  static void Case(string phase){
   OperationBudget budget=new OperationBudget();OwnedFixture f;
   FixtureInput.CreateOwned(budget,out f);
   string prefix=Prefix(phase);bool corroborated=false;GuardedHost owner=null;NativeHandle job=null,root=null;List<NativeHandle> members=new List<NativeHandle>();
   File.WriteAllText(prefix+".ownership.txt","nonce="+f.Nonce+"\nprofile="+f.ProfileName+"\nsid="+f.ProfileSid+"\nINPUT\n"+f.InputOwner.Manifest()+"PROFILE\n"+f.ProfileOwner.Manifest());
   CleanupObservation failed=new CleanupObservation();failed.CleanupFailed=true;failed.ProcessesStopped=false;failed.PumpsStopped=false;
   try{
    using(EventWaitHandle release=new EventWaitHandle(false,EventResetMode.ManualReset,@"Local\OmniraCrash-"+f.Nonce)){
     Console.WriteLine("CRASH_PREPARED phase="+phase+" nonce="+f.Nonce+" profile="+f.ProfileName+" identitiesCapturedBeforeOwner=true");
     owner=new GuardedHost("CrashOwner "+phase+" "+f.Nonce+" "+f.ProfileSid,prefix);
     string line=null;
     Wait(delegate(){
      string[] lines=owner.Output.Split('\n');foreach(string value in lines)if(value.StartsWith("BARRIER "+phase+" "+f.Nonce+" ")){line=value.Trim();return true;}
      NativeMethods.Require(!owner.Exited,"owner-exited-before-barrier");return false;
     },budget,"crash-phase-timeout");
     string[] parts=line.Split(' ');
     Assert.Equal(7,parts.Length);
     if(phase=="BeforeCreate")Assert.Equal("0",parts[6]);
     else{
      root=Duplicate(owner.Process,long.Parse(parts[3]));job=Duplicate(owner.Process,long.Parse(parts[4]));
      bool exact;NativeMethods.Check(NativeMethods.IsProcessInJob(root.Value,job.Value,out exact),"crash-root-membership");Assert.True(exact,"job at creation return");
      using(NativeBuffer policy=new NativeBuffer(144)){
       NativeMethods.Check(NativeMethods.QueryInformationJobObject(job.Value,9,policy.Value,144,IntPtr.Zero),"crash-inner-policy");
       NativeMethods.LIMITS limits=(NativeMethods.LIMITS)Marshal.PtrToStructure(policy.Value,typeof(NativeMethods.LIMITS));
       Assert.Equal<uint>(0x2008,limits.Basic.Flags);Assert.Equal<uint>(4,limits.Basic.Count);
      }
      GuardedHost.VerifyImage(root.Value,f.Runtime);BoundarySession.VerifyToken(root.Value,f.ProfileSid);
      if(phase=="AfterCreateBeforeResume"||phase=="RetainedJobPositive"){
       using(NativeHandle thread=Duplicate(owner.Process,long.Parse(parts[5]))){
        Assert.Equal<uint>(1,SuspendThread(thread.Value));Assert.Equal<uint>(2,NativeMethods.ResumeThread(thread.Value));
        Console.WriteLine("SUSPEND_CONTROL nativePreviousCount=1 restoredCount=1 nonce="+f.Nonce);
       }
      }
      members=Members(job.Value,f);
      bool rootMatched=false;foreach(NativeHandle m in members)if(NativeMethods.CompareObjectHandles(root.Value,m.Value))rootMatched=true;
      Assert.True(rootMatched,"held root exact object in member snapshot");
      Assert.Equal<uint>(258,NativeMethods.WaitForSingleObject(root.Value,0));
      Console.WriteLine("CRASH_PHASE phase="+phase+" nonce="+f.Nonce+" rootVerified=true suspended="+(phase=="AfterCreateBeforeResume"||phase=="RetainedJobPositive"));
     }
     if(phase=="RetainedJobPositive"){
      owner.Kill();Wait(()=>owner.Exited,budget,"owner-stop-timeout");
      Assert.Equal<uint>(258,NativeMethods.WaitForSingleObject(root.Value,0));
      Console.WriteLine("POSITIVE retainedJobDuplicate=true childStillAlive=true nonce="+f.Nonce);
      job.Dispose();job=null;
     }else{
      if(job!=null){job.Dispose();job=null;}
      Console.WriteLine("OBSERVER_JOB_CLOSED beforeOwnerStop=true nonce="+f.Nonce);
      if(phase=="PumpFailStop"||phase=="BudgetFailStop")release.Set();else owner.Kill();
      Wait(()=>owner.Exited,budget,"owner-stop-timeout");
     }
     foreach(NativeHandle member in members)Assert.Equal<uint>(0,NativeMethods.WaitForSingleObject(member.Value,(uint)budget.CleanupRemainingMs));
     if(root!=null)Assert.Equal<uint>(0,NativeMethods.WaitForSingleObject(root.Value,(uint)budget.CleanupRemainingMs));
     corroborated=true; // Held-process exit evidence is independent of later diagnostic assertions.
     Assert.True(owner.ExitCode!=0,"forced run never successful");
     if(phase=="PumpFailStop"||phase=="BudgetFailStop"){
      Assert.Equal<uint>(0x80131623,owner.ExitCode);
      string diagnostic=File.ReadAllText(owner.StderrPath);
      Assert.True(diagnostic.Contains(phase=="PumpFailStop"?"synthetic-pumps-exceeded-cleanup-deadline":"synthetic-operation-exceeded-cleanup-deadline"),"actual specific FailFast diagnostic");
      Assert.True(!owner.Output.Contains("UNEXPECTED_RETURN"),"fail-stop never returned");
     }
     corroborated=true;
     File.WriteAllText(prefix+".metadata.txt","phase="+phase+"\nnonce="+f.Nonce+"\nownerExit="+owner.ExitCode+"\nrunPassed=false\nrunCleanupComplete=false\nlaterHeldMembersStopped=true\nmembers="+members.Count+"\n");
     Console.WriteLine("PASS Crash phase="+phase+" forcedRunPassed=false forcedCleanupComplete=false laterHeldMembersStopped=true ownerExit="+owner.ExitCode+" evidence="+prefix);
    }
   }finally{
    if(!File.Exists(prefix+".metadata.txt"))File.WriteAllText(prefix+".metadata.txt","phase="+phase+"\nnonce="+f.Nonce+"\nrunPassed=false\nrunCleanupComplete=false\nobserverCorroborated=false\n");
    if(job!=null)job.Dispose();
    if(owner!=null){if(!owner.Exited)owner.Kill();owner.Dispose();}
    foreach(NativeHandle member in members)member.Dispose();if(root!=null)root.Dispose();
    // Original forced-run evidence remains failed. This separately owned fixture
    // predates the owner; only its original identities qualify scoped cleanup.
    f.Cleanup.ProcessesStopped=corroborated;f.Dispose();
    Console.WriteLine("CRASH_FOLLOWUP phase="+phase+" independentlyComplete="+f.Cleanup.Complete+" originalRunComplete="+failed.Complete);
   }
   Assert.True(f.Cleanup.Complete,"scoped crash fixture cleanup");
  }

  internal static int GuardOwner(string nonce){
   OperationBudget budget=new OperationBudget();
   using(GuardedHost leaf=new GuardedHost("GuardLeaf",Prefix("guard-leaf"))){
    Console.WriteLine("GUARD_CHILD "+nonce+" "+leaf.Process.Value.ToInt64()+" "+leaf.Job.Value.ToInt64());Console.Out.Flush();
    while(budget.RunRemainingMs>0)Thread.Sleep(Math.Min(5,budget.RunRemainingMs));
    return 1;
   }
  }
  internal static int GuardLeaf(){OperationBudget budget=new OperationBudget();while(budget.RunRemainingMs>0)Thread.Sleep(Math.Min(5,budget.RunRemainingMs));return 1;}
  static void DriverCrash(){
   OperationBudget budget=new OperationBudget();string nonce=Guid.NewGuid().ToString("N"),prefix=Prefix("DriverCrash");
   using(GuardedHost driver=new GuardedHost("GuardOwner "+nonce,prefix)){
    string line=null;
    Wait(delegate(){foreach(string value in driver.Output.Split('\n'))if(value.StartsWith("GUARD_CHILD "+nonce+" ")){line=value.Trim();return true;}NativeMethods.Require(!driver.Exited,"guard-owner-early-exit");return false;},budget,"guard-owner-barrier");
    string[] parts=line.Split(' ');Assert.Equal(4,parts.Length);
    using(NativeHandle child=Duplicate(driver.Process,long.Parse(parts[2])))
    using(NativeHandle diagnostic=Duplicate(driver.Process,long.Parse(parts[3]))){
     bool exact;NativeMethods.Check(NativeMethods.IsProcessInJob(child.Value,diagnostic.Value,out exact),"guard-child-exact");Assert.True(exact,"guard child membership");
     GuardedHost.VerifyImage(child.Value,GuardedHost.Executable);BoundarySession.VerifyToken(child.Value,null);
     Assert.Equal<uint>(258,NativeMethods.WaitForSingleObject(child.Value,0));
     diagnostic.Dispose();
     driver.Kill();
     Assert.Equal<uint>(0,NativeMethods.WaitForSingleObject(driver.Process.Value,(uint)budget.CleanupRemainingMs));
     Assert.Equal<uint>(0,NativeMethods.WaitForSingleObject(child.Value,(uint)budget.CleanupRemainingMs));
     // driver's own parent guard remains open here, so its disposal cannot cause this result.
     File.WriteAllText(prefix+".metadata.txt","nonce="+nonce+"\nforcedDriverPassed=false\nforcedCleanupComplete=false\nobserverChildExited=true\nouterGuardStillOpen=true\n");
     Console.WriteLine("PASS DriverCrash heldChildExited=true diagnosticJobClosedBeforeKill=true outerGuardStillOpen=true evidence="+prefix);
    }
   }
  }

  internal static int Watchdog(string suite){
   Stopwatch clock=Stopwatch.StartNew();string prefix=Path.Combine(Path.GetDirectoryName(GuardedHost.Executable),suite+".owned");
   using(GuardedHost host=new GuardedHost(suite,prefix)){
    while(!host.Exited&&clock.ElapsedMilliseconds<45000)Thread.Sleep((int)Math.Min(5,45000-clock.ElapsedMilliseconds));
    bool timeout=!host.Exited;
    if(timeout)host.Kill();
    File.WriteAllText(prefix+".metadata.txt","outerLimitMs=45000\natBirthGuard=true\ntimedOut="+timeout+"\ncleanupUnverified="+timeout+"\n");
    Console.WriteLine("OWNED_EVIDENCE "+prefix+" timeout="+timeout);
    if(timeout)return 1;
    return (int)host.ExitCode;
   }
  }
 }
}
