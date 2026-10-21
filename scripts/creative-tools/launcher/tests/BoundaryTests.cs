using System;
namespace Omnira.Creative.Synthetic {
 internal static class BoundaryTests {
  internal static void Run() {
   SetupCleanupFailurePreservesPrimary();
   foreach(Action test in new Action[]{VerificationFailureIsTerminal,RuntimePinPreventsMutation,CombinedAttributesRoundTrip,SentinelControls,PreResumeMismatchRefuses,SpawnGateRejectsReentry,NoBroadInheritanceFallback}){
    test();Assert.True(WindowsProcessBoundary.LastCleanup.Complete,"every test cleanup must be corroborated");
   }
  }
  static NativeHandle HoldProcess(BoundarySession session) {
   IntPtr copy;NativeMethods.Check(NativeMethods.DuplicateHandle(new IntPtr(-1),session.Process.Value,new IntPtr(-1),out copy,0,false,2),"test-hold-process");
   return new NativeHandle(copy);
  }
  static void VerificationFailureIsTerminal() {
   foreach(bool verifyFirst in new[]{true,false}) {
    using(OwnedFixture f=FixtureInput.CreateOwned()) {
     using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget()))
     using(NativeHandle held=HoldProcess(s)) {
      if(verifyFirst)s.VerifyBeforeResume();
      BoundaryTestHooks.Mismatch="sid";
      try {Assert.Refuses("pre-resume-token-mismatch",()=>s.VerifyBeforeResume());}
      finally {BoundaryTestHooks.Mismatch=null;}
      Assert.Refuses("resume-refused",()=>s.Resume());
      Assert.Refuses("boundary-refused",()=>s.VerifyBeforeResume());
      Assert.True(!s.Resumed,"refused session cannot resume");
      Assert.Equal<uint>(0,NativeMethods.WaitForSingleObject(held.Value,0));
      using(BoundarySession next=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())){}
     }
    }
    Assert.True(WindowsProcessBoundary.LastCleanup.Complete,"terminal refusal cleanup");
   }
   Console.WriteLine("PASS VerificationFailureIsTerminal firstFailure=true reverifyFailure=true processStopped=true gateReleased=true");
  }
  static void SetupCleanupFailurePreservesPrimary() {
   foreach(string stage in new[]{"before-folder","after-runtime"}) {
    BoundaryTestHooks.SetupFailure=stage;
    BoundaryTestHooks.MappingObservationFailure=true;
    BoundaryTestHooks.LastFixture=null;
    try {Assert.Refuses(stage=="before-folder"?"test-setup-before-folder":"test-setup-after-runtime",()=>{using(OwnedFixture unexpected=FixtureInput.CreateOwned()){} });}
    finally {BoundaryTestHooks.SetupFailure=null;BoundaryTestHooks.MappingObservationFailure=false;}
    OwnedFixture f=BoundaryTestHooks.LastFixture;
    Assert.True(f!=null&&f.Disposed&&f.Sid==IntPtr.Zero&&f.RuntimePin==null,"native resources released despite cleanup failure");
    Assert.True(object.ReferenceEquals(f.Cleanup,WindowsProcessBoundary.LastCleanup),"cleanup published despite failure");
    Assert.True(!f.Cleanup.ProfileMappingAbsent&&!f.Cleanup.Complete,"failed cleanup remains unverified");
    if(stage=="before-folder")Assert.True(!f.Cleanup.ProfileStorageAbsent&&!f.Cleanup.FixtureAbsent,"unresolved storage identity cannot prove absence");
    f.Dispose();
    Console.WriteLine("PASS SetupCleanupFailurePreservesPrimary stage="+stage+" originalRefusal=true SIDReleased=true runtimePinReleased=true cleanupPublished=true mappingAbsent=false");
   }
  }
  static void RuntimePinPreventsMutation() {
   using(OwnedFixture f=FixtureInput.CreateOwned()) {
    bool blocked=false;
    try {using(System.IO.FileStream writer=new System.IO.FileStream(f.Runtime,System.IO.FileMode.Open,System.IO.FileAccess.Write,System.IO.FileShare.Read)){}}
    catch(System.IO.IOException e){blocked=(e.HResult&65535)==32;}
    Assert.True(blocked,"staged runtime must remain pinned against writes");
   }
   Console.WriteLine("PASS RuntimePinPreventsMutation writeDenied=sharingViolation");
  }
  static void CombinedAttributesRoundTrip() {
   using(OwnedFixture f=FixtureInput.CreateOwned())
   using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())) {
    Assert.True(s.ExactJobAtReturn,"creation-time job");
    s.VerifyBeforeResume(); Assert.True(s.TokenVerified,"token"); s.Resume(); s.QualificationRoundTrip();
    Console.WriteLine("PASS CombinedAttributesRoundTrip token=AppContainer caps=0 IL=4096 job=exact streams=3 EOF=true");
   }
   Assert.True(WindowsProcessBoundary.LastCleanup.Complete,"cleanup");
  }
  static void SentinelControls() {
   using(OwnedFixture f=FixtureInput.CreateOwned())
   using(NativeHandle sentinel=NativeMethods.Event()) {
    using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())) {
     Assert.True(!s.ChildObjectMatches(sentinel),"excluded event");
     Assert.True(!BoundarySession.ObjectIdentityDecision(true,false),"numeric equality cannot prove inheritance");
    }
    BoundaryTestHooks.AllowedSentinel=sentinel;
    try { using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())) {
     Assert.True(s.ChildObjectMatches(sentinel),"allowed positive control");s.VerifyBeforeResume();s.Resume();s.QualificationRoundTrip();
    }} finally {BoundaryTestHooks.AllowedSentinel=null;}
   }
   Assert.True(WindowsProcessBoundary.LastCleanup.Complete,"cleanup");
   Console.WriteLine("PASS SentinelControls excluded=false allowed=true numericEqualityInsufficient=true");
  }
  static void PreResumeMismatchRefuses() {
   foreach(string mismatch in new[]{"sid","image","job","capabilities","flags"}) {
    using(OwnedFixture f=FixtureInput.CreateOwned())
    using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())) {
     BoundaryTestHooks.Mismatch=mismatch;
     try {Assert.Refuses("pre-resume-token-mismatch",()=>s.VerifyBeforeResume());Assert.True(!s.Resumed,"remained suspended");}
     finally {BoundaryTestHooks.Mismatch=null;}
    }
   }
   Console.WriteLine("PASS PreResumeMismatchRefuses sid,image,job,capabilities,flags");
  }
  static void SpawnGateRejectsReentry() {
   using(OwnedFixture f=FixtureInput.CreateOwned()) {
    using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())) {Assert.Refuses("spawn-gate-busy",()=>WindowsProcessBoundary.CreateSuspended(f,new OperationBudget()));}
    using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())){}
   }
   Console.WriteLine("PASS SpawnGateRejectsReentry gateReleased=true");
  }
  static void NoBroadInheritanceFallback() {
   using(OwnedFixture f=FixtureInput.CreateOwned()) {
    int before=WindowsProcessBoundary.ProcessCreateAttempts;BoundaryTestHooks.UnsupportedAttribute=true;
    try {Assert.Refuses("native-attribute-refused",()=>WindowsProcessBoundary.CreateSuspended(f,new OperationBudget()));}
    finally {BoundaryTestHooks.UnsupportedAttribute=false;}
    Assert.Equal<int>(before,WindowsProcessBoundary.ProcessCreateAttempts);
    using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())){}
   }
   Console.WriteLine("PASS NoBroadInheritanceFallback attempts=0 errorPreserved=true gateReleased=true");
  }
 }
 internal static class BoundaryTestHooks {
  internal static NativeHandle AllowedSentinel;
  internal static string Mismatch;
  internal static bool UnsupportedAttribute;
  internal static string SetupFailure;
  internal static bool MappingObservationFailure;
  internal static OwnedFixture LastFixture;
 }
}