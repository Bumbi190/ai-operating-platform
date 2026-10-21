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
  internal bool ProcessesStopped=true,PumpsStopped=true,FixtureAbsent,ProfileDeleteApiSucceeded,ProfileStorageAbsent,ProfileMappingAbsent;
  internal bool Complete {get{return ProcessesStopped&&PumpsStopped&&FixtureAbsent&&ProfileDeleteApiSucceeded&&ProfileStorageAbsent&&ProfileMappingAbsent;}}
 }
 internal sealed class OwnedFixture:IDisposable {
  internal readonly string Nonce=Guid.NewGuid().ToString("N");
  internal string ProfileName,ProfileSid,Storage,Runtime,RuntimeHash;
  internal IntPtr Sid;
  internal FileStream RuntimePin;
  internal bool ProfileCreated,Disposed;
  internal readonly CleanupObservation Cleanup=new CleanupObservation();
  public void Dispose(){
   if(Disposed)return;Disposed=true;
   if(RuntimePin!=null){RuntimePin.Dispose();RuntimePin=null;}
   if(ProfileCreated&&Cleanup.ProcessesStopped) {
    Cleanup.ProfileDeleteApiSucceeded=NativeMethods.DeleteAppContainerProfile(ProfileName)==0;
    Cleanup.ProfileStorageAbsent=!Directory.Exists(Path.GetDirectoryName(Storage));
    using(RegistryKey k=Registry.CurrentUser.OpenSubKey(@"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppContainer\Mappings\"+ProfileSid)){Cleanup.ProfileMappingAbsent=k==null;}
    Cleanup.FixtureAbsent=Cleanup.ProfileStorageAbsent;
   }
   if(Sid!=IntPtr.Zero){NativeMethods.FreeSid(Sid);Sid=IntPtr.Zero;}
   WindowsProcessBoundary.LastCleanup=Cleanup;
   Console.WriteLine("CLEANUP profile="+ProfileName+" api="+Cleanup.ProfileDeleteApiSucceeded+" storageAbsent="+Cleanup.ProfileStorageAbsent+" mappingAbsent="+Cleanup.ProfileMappingAbsent+" stopped="+Cleanup.ProcessesStopped);
  }
 }
}