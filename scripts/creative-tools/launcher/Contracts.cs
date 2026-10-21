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
  internal bool ProcessesStopped=true,PumpsStopped=true,InputFixtureAbsent,FixtureAbsent,ProfileDeleteApiSucceeded,ProfileStorageAbsent,ProfileMappingAbsent,CleanupFailed;
  internal bool Complete {get{return !CleanupFailed&&ProcessesStopped&&PumpsStopped&&FixtureAbsent&&ProfileDeleteApiSucceeded&&ProfileStorageAbsent&&ProfileMappingAbsent;}}
 }
 internal sealed class CanaryInput {
  internal readonly byte[] Bytes;internal readonly string Sha256;
  internal CanaryInput(byte[] bytes,string sha256){Bytes=(byte[])bytes.Clone();Sha256=sha256;}
 }
 internal sealed class OwnedFixture:IDisposable {
  internal string InputDirectory,InputRoot;
  internal InputOwnership InputOwner;
  internal readonly string Nonce=Guid.NewGuid().ToString("N");
  internal string ProfileName,ProfileSid,Storage,Runtime,RuntimeHash;
  internal IntPtr Sid;
  internal FileStream RuntimePin;
  internal bool ProfileCreated,Disposed,StorageIdentityEstablished;
  internal readonly CleanupObservation Cleanup=new CleanupObservation();
  public void Dispose(){
   if(Disposed)return;
   Disposed=true;
   try {
    bool inputAbsent=InputOwner==null?InputDirectory==null:InputOwner.Cleanup();
    Cleanup.InputFixtureAbsent=inputAbsent;
    if(!inputAbsent)Cleanup.CleanupFailed=true;
    FileStream pin=RuntimePin;
    RuntimePin=null;
    if(pin!=null){
     Microsoft.Win32.SafeHandles.SafeFileHandle held=null;
     try{held=pin.SafeFileHandle;pin.Dispose();}
     catch{Cleanup.CleanupFailed=true;}
     finally{if(held!=null)held.Dispose();}
    }
    if(ProfileCreated&&Cleanup.ProcessesStopped){
     try{Cleanup.ProfileDeleteApiSucceeded=NativeMethods.DeleteAppContainerProfile(ProfileName)==0;}
     catch{Cleanup.CleanupFailed=true;}
     if(StorageIdentityEstablished){
      try {
       Cleanup.ProfileStorageAbsent=!Directory.Exists(Path.GetDirectoryName(Storage));
       Cleanup.FixtureAbsent=Cleanup.ProfileStorageAbsent&&inputAbsent;
      }catch{Cleanup.CleanupFailed=true;}
     }
     try {
#if TEST
      if(BoundaryTestHooks.MappingObservationFailure)throw new IOException("test mapping observation failure");
#endif
      using(RegistryKey k=Registry.CurrentUser.OpenSubKey(@"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppContainer\Mappings\"+ProfileSid)){
       Cleanup.ProfileMappingAbsent=k==null;
      }
     }catch{Cleanup.CleanupFailed=true;}
    }
   }catch{Cleanup.CleanupFailed=true;}
   finally {
    try{if(Sid!=IntPtr.Zero)NativeMethods.FreeSid(Sid);}
    catch{Cleanup.CleanupFailed=true;}
    finally {
     Sid=IntPtr.Zero;
     WindowsProcessBoundary.LastCleanup=Cleanup;
     try {
      Console.WriteLine("CLEANUP profile="+ProfileName+" api="+Cleanup.ProfileDeleteApiSucceeded+" storageAbsent="+Cleanup.ProfileStorageAbsent+" mappingAbsent="+Cleanup.ProfileMappingAbsent+" stopped="+Cleanup.ProcessesStopped+" cleanupFailed="+Cleanup.CleanupFailed+" storageIdentityEstablished="+StorageIdentityEstablished+" inputAbsent="+Cleanup.InputFixtureAbsent);
     }catch{Cleanup.CleanupFailed=true;}
    }
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
  internal readonly byte[] Stdout,Stderr;
  internal readonly bool Complete,Overflow,PumpFailed;
  internal CapturedStreams(byte[] stdout,byte[] stderr,bool complete,bool overflow,bool failed){
   Stdout=(byte[])stdout.Clone();Stderr=(byte[])stderr.Clone();Complete=complete;Overflow=overflow;PumpFailed=failed;
  }
 }
 internal sealed class RunObservation {
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
