using System;
namespace Omnira.Creative.Synthetic {
 internal static class BoundaryTests {
  internal static void Run() {
   foreach(Action test in new Action[]{RuntimePinPreventsMutation,CombinedAttributesRoundTrip,SentinelControls,PreResumeMismatchRefuses,SpawnGateRejectsReentry,NoBroadInheritanceFallback}){
    test();Assert.True(WindowsProcessBoundary.LastCleanup.Complete,"every test cleanup must be corroborated");
   }
  }
  static void RuntimePinPreventsMutation() {
   using(OwnedFixture f=WindowsProcessBoundary.PrepareOwnedFixture()) {
    bool blocked=false;
    try {using(System.IO.FileStream writer=new System.IO.FileStream(f.Runtime,System.IO.FileMode.Open,System.IO.FileAccess.Write,System.IO.FileShare.Read)){}}
    catch(System.IO.IOException e){blocked=(e.HResult&65535)==32;}
    Assert.True(blocked,"staged runtime must remain pinned against writes");
   }
   Console.WriteLine("PASS RuntimePinPreventsMutation writeDenied=sharingViolation");
  }
  static void CombinedAttributesRoundTrip() {
   using(OwnedFixture f=WindowsProcessBoundary.PrepareOwnedFixture())
   using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())) {
    Assert.True(s.ExactJobAtReturn,"creation-time job");
    s.VerifyBeforeResume(); Assert.True(s.TokenVerified,"token"); s.Resume(); s.QualificationRoundTrip();
    Console.WriteLine("PASS CombinedAttributesRoundTrip token=AppContainer caps=0 IL=4096 job=exact streams=3 EOF=true");
   }
   Assert.True(WindowsProcessBoundary.LastCleanup.Complete,"cleanup");
  }
  static void SentinelControls() {
   using(OwnedFixture f=WindowsProcessBoundary.PrepareOwnedFixture())
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
    using(OwnedFixture f=WindowsProcessBoundary.PrepareOwnedFixture())
    using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())) {
     BoundaryTestHooks.Mismatch=mismatch;
     try {Assert.Refuses("pre-resume-token-mismatch",()=>s.VerifyBeforeResume());Assert.True(!s.Resumed,"remained suspended");}
     finally {BoundaryTestHooks.Mismatch=null;}
    }
   }
   Console.WriteLine("PASS PreResumeMismatchRefuses sid,image,job,capabilities,flags");
  }
  static void SpawnGateRejectsReentry() {
   using(OwnedFixture f=WindowsProcessBoundary.PrepareOwnedFixture()) {
    using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())) {Assert.Refuses("spawn-gate-busy",()=>WindowsProcessBoundary.CreateSuspended(f,new OperationBudget()));}
    using(BoundarySession s=WindowsProcessBoundary.CreateSuspended(f,new OperationBudget())){}
   }
   Console.WriteLine("PASS SpawnGateRejectsReentry gateReleased=true");
  }
  static void NoBroadInheritanceFallback() {
   using(OwnedFixture f=WindowsProcessBoundary.PrepareOwnedFixture()) {
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
 }
}