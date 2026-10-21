using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;
namespace Omnira.Creative.Synthetic {
 internal sealed class SyntheticRefusal:Exception {
  internal readonly string Code;internal readonly int? NativeError;
  internal SyntheticRefusal(string code):base(code){Code=code;}
  internal SyntheticRefusal(string code,int error):base(code+" native="+error){Code=code;NativeError=error;}
 }
 internal sealed class OperationBudget {
  readonly Stopwatch clock=Stopwatch.StartNew();
  internal readonly int RunLimitMs=20000,TotalLimitMs=30000;
  internal OperationBudget(){
#if TEST
   RunLimitMs=LifecycleTestHooks.RunMs;TotalLimitMs=LifecycleTestHooks.TotalMs;
#endif
   NativeMethods.Require(RunLimitMs>0&&TotalLimitMs>RunLimitMs&&TotalLimitMs<=30000,"budget-invalid");
  }
  internal long ElapsedMs{get{return clock.ElapsedMilliseconds;}}
  internal int RunRemainingMs{get{return (int)Math.Max(0,RunLimitMs-clock.ElapsedMilliseconds);}}
  internal int CleanupRemainingMs{get{return (int)Math.Max(0,TotalLimitMs-clock.ElapsedMilliseconds);}}
 }
 internal sealed class CleanupObservation {
  internal bool ProcessesStopped=true,PumpsStopped=true,ProcessIdentityVerified=true,InputFixtureAbsent,FixtureAbsent,ProfileDeleteApiSucceeded,ProfileStorageAbsent,ProfileMappingAbsent,CleanupFailed;
  internal bool Complete {get{return !CleanupFailed&&ProcessIdentityVerified&&ProcessesStopped&&PumpsStopped&&FixtureAbsent&&ProfileDeleteApiSucceeded&&ProfileStorageAbsent&&ProfileMappingAbsent;}}
 }
 internal sealed class CanaryInput {
  internal readonly byte[] Bytes;internal readonly string Sha256;
  internal CanaryInput(byte[] bytes,string sha256){Bytes=(byte[])bytes.Clone();Sha256=sha256;}
 }
 internal sealed class OwnedFixture:IDisposable {
  internal string InputDirectory,InputRoot;
  internal InputOwnership InputOwner;
  internal readonly string Nonce=Guid.NewGuid().ToString("N");
  internal OwnedFixture(){}
#if TEST
  internal OwnedFixture(string nonce){Nonce=nonce;}
#endif
  internal string ProfileName,ProfileSid,Storage,Runtime,RuntimeHash;
  internal IntPtr Sid;
  internal FileStream RuntimePin;
  internal bool ProfileCreated,Disposed,StorageIdentityEstablished,ProfileApiRemoved;
  internal CleanupObservation Cleanup=new CleanupObservation();
  internal OperationBudget Budget;
  internal OwnedEntries ProfileOwner;
  public void Dispose(){
   if(Disposed)return;Disposed=true;
   try{
    if(RuntimePin!=null){RuntimePin.Dispose();RuntimePin=null;}
    FixtureInput.CleanupOwned(this,Budget);
    WindowsProcessBoundary.CleanupProfile(this,Budget);
   }catch{Cleanup.CleanupFailed=true;}
   finally{
    if(RuntimePin!=null){try{RuntimePin.Dispose();}catch{Cleanup.CleanupFailed=true;}RuntimePin=null;}
    if(Sid!=IntPtr.Zero){NativeMethods.FreeSid(Sid);Sid=IntPtr.Zero;}
    WindowsProcessBoundary.LastCleanup=Cleanup;
#if TEST
    // Diagnostics must never replace a setup refusal or escape runner finalization.
    try{Console.WriteLine("CLEANUP profile="+ProfileName+" api="+Cleanup.ProfileDeleteApiSucceeded+" storageAbsent="+Cleanup.ProfileStorageAbsent+" mappingAbsent="+Cleanup.ProfileMappingAbsent+" stopped="+Cleanup.ProcessesStopped+" cleanupFailed="+Cleanup.CleanupFailed+" inputAbsent="+Cleanup.InputFixtureAbsent);}
    catch{Cleanup.CleanupFailed=true;}
#endif
   }
  }
 }
}

namespace Omnira.Creative.Synthetic {
 internal sealed class RequestExpectation {
  internal readonly string Nonce,Sha256;internal readonly int ByteCount;
  internal RequestExpectation(string nonce,int byteCount,string sha256){Nonce=nonce;ByteCount=byteCount;Sha256=sha256;}
 }
 // Finite protocol test adapter capture; transport is shared with the general PipeSession.
 internal sealed class ProtocolCapture {
  internal readonly byte[] Stdout,Stderr;internal readonly uint ExitCode;
  internal ProtocolCapture(byte[] stdout,byte[] stderr,uint exitCode){Stdout=(byte[])stdout.Clone();Stderr=(byte[])stderr.Clone();ExitCode=exitCode;}
 }
}

namespace Omnira.Creative.Synthetic {
 internal sealed class CapturedStreams {
  readonly byte[] stdout,stderr;
  internal byte[] Stdout{get{return (byte[])stdout.Clone();}}
  internal byte[] Stderr{get{return (byte[])stderr.Clone();}}
  internal readonly bool Complete,Overflow,PumpFailed;
  internal CapturedStreams(byte[] stdout,byte[] stderr,bool complete,bool overflow,bool failed){
   this.stdout=(byte[])stdout.Clone();this.stderr=(byte[])stderr.Clone();Complete=complete;Overflow=overflow;PumpFailed=failed;
  }
 }
 internal sealed class RunObservation {
  internal int? NativeError;
  internal bool HostIdentityVerified,ResourcesCreated,ExactJobAtReturn,SyntheticTokenAndImageVerified;
  internal string FixtureNonce,InputSha256,HostSha256,ClrSha256,RuntimeSha256,ClrVersion,OsVersion;
  internal bool Passed,Resumed,RootExitedBeforeStop,WriterCompleted,StreamsCompleted;
  internal int InputBytes,RequestBytes,CancelAttempts,CancelAccepted,CancelNotFound,AbortedIo;
  internal uint ChildExitCode;internal bool ChildExitObserved;
  internal string State="Prepared",FailedStage,RefusalCode;
  internal CleanupObservation Cleanup=new CleanupObservation();
  internal long ElapsedMs;
  internal int StdoutBytes,StderrBytes,ObservedMembers,ObservedNodes,RunLimitMs,TotalLimitMs;
  internal readonly bool ActualWorkerTokenVerified=false,RootAclTrustVerified=false,NetworkEgressVerified=false,
   RealHumanApprovalVerified=false,ArbitraryBrokerContainmentVerified=false,GeneralExecutableTrustVerified=false,
   CreativeExecutionAuthorized=false,PublishAuthorized=false,ProductionReady=false;
 }
}