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
  internal int RunRemainingMs{get{return (int)Math.Max(0,20000-clock.ElapsedMilliseconds);}}
  internal int CleanupRemainingMs{get{return (int)Math.Max(0,30000-clock.ElapsedMilliseconds);}}
 }
 internal sealed class CleanupObservation {
  internal bool ProcessesStopped=true,PumpsStopped=true,FixtureAbsent,ProfileDeleteApiSucceeded,ProfileStorageAbsent,ProfileMappingAbsent,CleanupFailed;
  internal bool Complete {get{return !CleanupFailed&&ProcessesStopped&&PumpsStopped&&FixtureAbsent&&ProfileDeleteApiSucceeded&&ProfileStorageAbsent&&ProfileMappingAbsent;}}
 }
 internal sealed class OwnedFixture:IDisposable {
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
       Cleanup.FixtureAbsent=Cleanup.ProfileStorageAbsent;
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
      Console.WriteLine("CLEANUP profile="+ProfileName+" api="+Cleanup.ProfileDeleteApiSucceeded+" storageAbsent="+Cleanup.ProfileStorageAbsent+" mappingAbsent="+Cleanup.ProfileMappingAbsent+" stopped="+Cleanup.ProcessesStopped+" cleanupFailed="+Cleanup.CleanupFailed+" storageIdentityEstablished="+StorageIdentityEstablished);
     }catch{Cleanup.CleanupFailed=true;}
    }
   }
  }
 }
}
