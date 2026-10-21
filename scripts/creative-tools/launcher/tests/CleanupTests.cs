using System;
using System.IO;
using System.Text;
namespace Omnira.Creative.Synthetic {
 internal static class CleanupTests {
  internal static void Run(){
   System.Reflection.Assembly production=System.Reflection.Assembly.LoadFile(Path.Combine(Path.GetDirectoryName(typeof(CleanupTests).Assembly.Location),"SyntheticLauncher.exe"));
   foreach(string name in new[]{"CleanupTestHooks","CrashTestHooks","GuardedHost","CrashHarness"})Assert.True(production.GetType("Omnira.Creative.Synthetic."+name)==null,"production excludes "+name);
   PartialSetupFailures();UnknownFixtureEntryPreserved();FixtureIdentityReplacementRefusesDeletion();
   ProfileDeleteCorroboration();UnverifiedChildKeepsCleanupFalse();UnrelatedCanaryUnchanged();RootDisposalKeepsReadAlive();CaptureMutationIsolation();
  }
  static void PartialSetupFailures(){
   foreach(string stage in new[]{"profile","runtime","pipes","process","token"}){
    CleanupTestHooks.Failure=stage;
    RunObservation o;
    try{o=SyntheticRunner.RunSynthetic();}finally{CleanupTestHooks.Failure=null;}
    Assert.Equal("test-partial-"+stage,o.RefusalCode);Assert.Equal(false,o.Passed);
    Assert.True(o.Cleanup.Complete,"partial setup cleanup "+stage);
    Assert.Equal(0,PipeSession.LivePumps);
    Console.WriteLine("PASS PartialSetupFailures stage="+stage+" primary="+o.RefusalCode+" cleanupComplete=true");
   }
  }
  static void UnknownFixtureEntryPreserved(){
   foreach(bool profile in new[]{false,true}){
    OwnedFixture f=FixtureInput.CreateOwned();string unknown=Path.Combine(profile?Path.GetDirectoryName(f.Runtime):f.InputRoot,"unknown.txt");
    File.WriteAllText(unknown,"OWNED TEST UNKNOWN");OwnedEntries unknownOwner=new OwnedEntries();unknownOwner.Record(unknown,false);f.Dispose();
    Assert.Equal(false,f.Cleanup.FixtureAbsent);Assert.True(File.Exists(unknown),"unknown preserved");
    Assert.True(!f.Cleanup.Complete,"cleanup unverified");
    // This exact test-created file is removed only by its independently captured identity.
    Assert.True(unknownOwner.Delete(new OperationBudget()),"scoped test artifact deletion");
    CleanupObservation later=CleanupTestHooks.Followup(f);
    Assert.True(later.Complete,"independent followup");Assert.True(!f.Cleanup.Complete,"original observation immutable");
    Console.WriteLine("PASS UnknownFixtureEntryPreserved profile="+profile+" failedRunPreserved=true followupComplete=true");
   }
  }
  static void FixtureIdentityReplacementRefusesDeletion(){
   foreach(bool profile in new[]{false,true}){
    OwnedFixture f=FixtureInput.CreateOwned();
    string original=profile?Path.GetDirectoryName(f.Storage):f.InputDirectory;
    if(profile){f.RuntimePin.Dispose();f.RuntimePin=null;}
    string moved=original+".held";
    Directory.Move(original,moved);Directory.CreateDirectory(original);
    f.Dispose();Assert.True(!f.Cleanup.FixtureAbsent&&Directory.Exists(moved)&&Directory.Exists(original),"replaced root preserved");
    Directory.Delete(original,false);Directory.Move(moved,original);
    Assert.True(CleanupTestHooks.Followup(f).Complete,"original identity restored scoped followup");
    Assert.True(!f.Cleanup.Complete,"replacement failure retained");
    Console.WriteLine("PASS FixtureIdentityReplacementRefusesDeletion profile="+profile);
   }
  }
  static void ProfileDeleteCorroboration(){
   CleanupObservation o=new CleanupObservation();o.FixtureAbsent=true;o.ProfileDeleteApiSucceeded=true;o.ProfileStorageAbsent=true;
   Assert.True(!o.Complete,"mapping required");o.ProfileMappingAbsent=true;Assert.True(o.Complete,"all three");
   o.ProfileDeleteApiSucceeded=false;Assert.True(!o.Complete,"API required");o.ProfileDeleteApiSucceeded=true;o.ProfileStorageAbsent=false;Assert.True(!o.Complete,"storage required");
   using(OwnedFixture f=FixtureInput.CreateOwned()){}
   Assert.True(WindowsProcessBoundary.LastCleanup.Complete,"native API storage mapping corroboration");
   Console.WriteLine("PASS ProfileDeleteCorroboration");
  }
  static void UnverifiedChildKeepsCleanupFalse(){
   OwnedFixture f=FixtureInput.CreateOwned();
   using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,f.Budget)){
    IntPtr copy;NativeMethods.Check(NativeMethods.DuplicateHandle(new IntPtr(-1),s.Process.Value,new IntPtr(-1),out copy,0,false,2),"cleanup-test-hold");
    using(NativeHandle held=new NativeHandle(copy)){
     BoundaryTestHooks.Mismatch="sid";
     try{Assert.Refuses("pre-resume-token-mismatch",()=>s.VerifyBeforeResume());}
     finally{BoundaryTestHooks.Mismatch=null;}
     Assert.Equal<uint>(0,NativeMethods.WaitForSingleObject(held.Value,0));
     Assert.True(!s.Resumed,"unverified child never resumed");
    }
   }
   f.Dispose();
   Assert.True(!f.Cleanup.Complete&&!f.Cleanup.ProcessIdentityVerified&&Directory.Exists(f.InputDirectory)&&Directory.Exists(f.Storage),"unverified child preserves artifacts despite held exit");
   Assert.True(CleanupTestHooks.Followup(f).Complete,"separate known never-resumed TEST followup");
   Assert.True(!f.Cleanup.Complete,"original incomplete evidence retained");
   Console.WriteLine("PASS UnverifiedChildKeepsCleanupFalse nativeHeldExit=true originalCleanupComplete=false");
  }
  static void UnrelatedCanaryUnchanged(){
   using(OwnedFixture other=FixtureInput.CreateOwned()){
    string digest=FixtureInput.ReadCanary(other).Sha256;
    using(OwnedFixture f=FixtureInput.CreateOwned()){}
    Assert.Equal(digest,FixtureInput.ReadCanary(other).Sha256);
   }
   Console.WriteLine("PASS UnrelatedCanaryUnchanged");
  }
  static void RootDisposalKeepsReadAlive(){
   using(OwnedFixture f=FixtureInput.CreateOwned()){
    PinnedRoot root=PinnedRoot.OpenOwned(f);using(PinnedRoot.PinnedRead read=root.OpenRead("input/sample.txt")){
     root.Dispose();Assert.Refuses("root-disposed",()=>root.OpenRead("input/sample.txt"));
     bool blocked=false;try{Directory.Move(f.InputRoot,f.InputRoot+".moved");}catch(IOException ex){blocked=(ex.HResult&65535)==32;}Assert.True(blocked,"retained read pins root with native sharing32");
     Assert.Equal("OMNIRA_SYNTHETIC_CANARY_ONLY\n",Encoding.ASCII.GetString(read.ReadBounded(65536)));
    }
    Directory.Move(f.InputRoot,f.InputRoot+".moved");Directory.Move(f.InputRoot+".moved",f.InputRoot);
   }
   Console.WriteLine("PASS RootDisposalKeepsReadAlive nativeSharing32=true");
  }
  static void CaptureMutationIsolation(){
   byte[] source={1,2};CapturedStreams c=new CapturedStreams(source,new byte[]{3},true,false,false);
   source[0]=9;c.Stdout[0]=8;c.Stderr[0]=8;Assert.Equal((byte)1,c.Stdout[0]);Assert.Equal((byte)3,c.Stderr[0]);
   Console.WriteLine("PASS CaptureMutationIsolation");
  }
 }
}

namespace Omnira.Creative.Synthetic {
 internal static class CleanupTestHooks {
  internal static string Failure;
  internal static void At(string stage){if(Failure==stage)throw new SyntheticRefusal("test-partial-"+stage);}
  internal static CleanupObservation Followup(OwnedFixture f){
   CleanupObservation original=f.Cleanup,followup=new CleanupObservation();
   try{
    f.Cleanup=followup;OperationBudget budget=new OperationBudget();
    if(!f.StorageIdentityEstablished&&f.ProfileCreated&&f.Runtime==null){
     IntPtr path;NativeMethods.Check(NativeMethods.GetAppContainerFolderPath(f.ProfileSid,out path)==0,"followup-folder");
     try{f.Storage=System.Runtime.InteropServices.Marshal.PtrToStringUni(path);}finally{System.Runtime.InteropServices.Marshal.FreeCoTaskMem(path);}
     Assert.Equal(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Packages",f.ProfileName,"AC"),f.Storage);
     f.ProfileOwner=new OwnedEntries();f.ProfileOwner.CaptureTree(Path.GetDirectoryName(f.Storage),budget);f.StorageIdentityEstablished=true;
     Console.WriteLine("FOLLOWUP authenticatedCreateProfile=true priorStorageUnverified=true profile="+f.ProfileName);
    }
    FixtureInput.CleanupOwned(f,budget);WindowsProcessBoundary.CleanupProfile(f,budget);
    return followup;
   }finally{f.Cleanup=original;}
  }
 }
}
