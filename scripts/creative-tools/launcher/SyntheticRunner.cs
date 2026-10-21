using System;
using System.Threading;
namespace Omnira.Creative.Synthetic {
 internal static class SyntheticRunner {
  static int active;
  internal static RunObservation RunSynthetic(){return RunSynthetic(new OperationBudget());}
  internal static RunObservation RunSynthetic(OperationBudget budget){
   // Starts before any host verification or fixture setup, not at process launch.
   if(budget==null)throw new ArgumentNullException("budget");
   RunObservation result=new RunObservation();result.RunLimitMs=budget.RunLimitMs;result.TotalLimitMs=budget.TotalLimitMs;
   if(Interlocked.CompareExchange(ref active,1,0)!=0){
    result.State="Refused";result.FailedStage="Prepared";result.RefusalCode="operation-busy";result.Cleanup.CleanupFailed=true;return result;
   }
   OwnedFixture fixture=null;BoundarySession boundary=null;PipeSession pipes=null;
   try{
    BoundarySession.VerifyHost();result.HostIdentityVerified=true;
    result.HostSha256=WindowsProcessBoundary.Hash(typeof(SyntheticRunner).Assembly.Location);
    result.ClrSha256=WindowsProcessBoundary.Hash(System.IO.Path.Combine(System.Runtime.InteropServices.RuntimeEnvironment.GetRuntimeDirectory(),"clr.dll"));
    result.ClrVersion=Environment.Version.ToString();result.OsVersion=Environment.OSVersion.Version.ToString();
    NativeMethods.Require(budget.RunRemainingMs>0,"setup-budget");
    FixtureInput.CreateOwned(budget,out fixture);result.Cleanup=fixture.Cleanup;result.RuntimeSha256=fixture.RuntimeHash;
    NativeMethods.Require(budget.RunRemainingMs>0,"setup-budget");
    CanaryInput input=FixtureInput.ReadCanary(fixture);result.State="InputPinned";
#if TEST
    if(LifecycleTestHooks.LargeInput){
     byte[] bytes=new byte[65536];for(int i=0;i<bytes.Length;i++)bytes[i]=(byte)(i%251);
     using(System.Security.Cryptography.SHA256 hash=System.Security.Cryptography.SHA256.Create())
      input=new CanaryInput(bytes,BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-","").ToLowerInvariant());
    }
#endif
    byte[] request=SyntheticProtocol.EncodeRequest(input,fixture.Nonce);result.InputSha256=input.Sha256;result.InputBytes=input.Bytes.Length;result.RequestBytes=request.Length;
#if TEST
    LifecycleTestHooks.Expected=new RequestExpectation(fixture.Nonce,input.Bytes.Length,input.Sha256);
#endif
    boundary=WindowsProcessBoundary.CreateSuspended(fixture,budget);result.State="ProcessSuspended";
    result.ExactJobAtReturn=boundary.ExactJobAtReturn;boundary.VerifyBeforeResume();result.SyntheticTokenAndImageVerified=boundary.TokenVerified;result.State="TokenAndJobVerified";
    boundary.ObserveMembers();
    pipes=PipeSession.Start(boundary,request,budget);
    boundary.Resume();result.Resumed=true;result.State="Running";
    while(true){
     NativeMethods.Require(budget.RunRemainingMs>0,"run-timeout");
     if(pipes.Failure!=null)throw new SyntheticRefusal(pipes.Failure);
#if TEST
     CrashTestHooks.Ready(boundary,pipes);
#endif
     boundary.ObserveMembers();int members=boundary.ActiveMemberCount;
     if(boundary.RootExited&&members==0&&pipes.Finished)break;
     NativeMethods.Require(budget.RunRemainingMs>0,"run-timeout");
     Thread.Sleep(Math.Min(5,budget.RunRemainingMs));
    }
    NativeMethods.Require(boundary.ExitCode==0,"child-exit");
    NativeMethods.Require(pipes.StreamsComplete,"streams-incomplete");
    NativeMethods.Require(boundary.WaitForObservedExit(budget),"producers-not-stopped");
    result.State="ProducersStopped";
    CapturedStreams capture=pipes.CompleteAfterStop();
    NativeMethods.Require(capture.Complete&&!capture.Overflow&&!capture.PumpFailed,"capture-incomplete");
    SyntheticProtocol.VerifyResult(capture.Stdout,new RequestExpectation(fixture.Nonce,input.Bytes.Length,input.Sha256));
    result.State="ResultVerified";
   }catch(SyntheticRefusal e){result.NativeError=e.NativeError;Refuse(result,e.Code);}
   catch(Exception){Refuse(result,"internal-failure");}
   finally{
    if(pipes!=null){
     result.RootExitedBeforeStop=boundary.RootExited;result.WriterCompleted=pipes.WriterComplete;result.StreamsCompleted=pipes.StreamsComplete;
     pipes.CancelAndJoin();
#if TEST
     LifecycleTestHooks.Capture=pipes.CompleteAfterStop();
#endif
     result.CancelAttempts=pipes.CancelAttempts;result.CancelAccepted=pipes.CancelAccepted;result.CancelNotFound=pipes.CancelNotFound;result.AbortedIo=pipes.AbortedIo;
#if TEST
     if(LifecycleTestHooks.Writer!=null){LifecycleTestHooks.Writer.Dispose();LifecycleTestHooks.Writer=null;}
#endif
     result.StdoutBytes=pipes.StdoutCount;result.StderrBytes=pipes.StderrCount;
     result.Cleanup.PumpsStopped=true;
    }
#if TEST
    CrashTestHooks.ExhaustBudget(budget);
#endif
    if(boundary!=null&&!boundary.IsDisposed){
     result.ObservedMembers=boundary.ObservedMemberCount;result.ObservedNodes=boundary.ObservedNodeCount;
     try{boundary.StopOwnedJob(budget);}catch{result.Cleanup.CleanupFailed=true;}
     try{result.Cleanup.ProcessesStopped&=boundary.WaitForObservedExit(budget);result.ChildExitCode=boundary.ExitCode;result.ChildExitObserved=true;}
     catch{result.Cleanup.ProcessesStopped=false;result.Cleanup.CleanupFailed=true;}
     boundary.Dispose();
    }
    if(fixture!=null){result.ResourcesCreated=true;result.FixtureNonce=fixture.Nonce;result.RuntimeSha256=fixture.RuntimeHash;result.Cleanup=fixture.Cleanup;fixture.Dispose();}
    else result.Cleanup.CleanupFailed=true;
    result.ElapsedMs=budget.ElapsedMs;
    if(budget.CleanupRemainingMs==0){
#if TEST
     Console.Error.WriteLine("FAILSTOP synthetic-operation-exceeded-cleanup-deadline");Console.Error.Flush();
#endif
     Environment.FailFast("synthetic-operation-exceeded-cleanup-deadline");
    }
    if(result.State!="Refused"){
     if(result.Cleanup.Complete){result.State="Cleaned";result.Passed=true;}
     else Refuse(result,"cleanup-unverified");
    }
    Interlocked.Exchange(ref active,0);
   }
   return result;
  }
  static void Refuse(RunObservation result,string code){
   if(result.State=="Refused")return;
   result.FailedStage=result.State;result.RefusalCode=code;result.State="Refused";result.Passed=false;
  }
 }
}