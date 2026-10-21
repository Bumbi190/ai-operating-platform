using System;
using System.Threading;
namespace Omnira.Creative.Synthetic {
 internal static class LifecycleTestHooks {
  internal static string Payload;
  internal static int RunMs=20000,TotalMs=30000;
  internal static bool UnknownMember,LargeInput,HoldWriter;
  internal static NativeHandle Writer;
  internal static CapturedStreams Capture;
  internal static RequestExpectation Expected;
  internal static void Reset(){Payload=null;RunMs=20000;TotalMs=30000;UnknownMember=false;LargeInput=false;HoldWriter=false;if(Writer!=null){Writer.Dispose();Writer=null;}Capture=null;Expected=null;BoundaryTestHooks.Mismatch=null;}
 }
 internal static class LifecycleTests {
  internal static void Run(){
   System.Reflection.Assembly production=System.Reflection.Assembly.LoadFile(System.IO.Path.Combine(System.IO.Path.GetDirectoryName(typeof(LifecycleTests).Assembly.Location),"SyntheticLauncher.exe"));
   Assert.True(production.GetType("Omnira.Creative.Synthetic.LifecycleTestHooks")==null,"lifecycle seams absent from production");
   Console.WriteLine("PASS ProductionExcludesLifecycleHooks");
   RunObservation normal=SyntheticRunner.RunSynthetic();
   Assert.True(normal.Passed,"normal lifecycle code="+normal.RefusalCode);Assert.True(normal.Cleanup.Complete,"normal cleanup");
   Assert.Equal(20000,normal.RunLimitMs);Assert.Equal(30000,normal.TotalLimitMs);
   Assert.Equal(0,PipeSession.LivePumps);
   Console.WriteLine("PASS NormalProductionBudget runLimitMs="+normal.RunLimitMs+" totalLimitMs="+normal.TotalLimitMs+" elapsedMs="+normal.ElapsedMs);
   Check("ConcurrentPipeBackpressure","process.stdout.write('x'.repeat(4096));process.stderr.write('y'.repeat(4096));process.stdin.resume();process.stdin.on('end',()=>process.exit(0));","protocol-schema",true);
   Check("FloodStdout","process.stdout.write('x'.repeat(4097));setInterval(()=>{},1000);","stdout-overflow",false);
   Check("FloodStderr","process.stderr.write('x'.repeat(4097));setInterval(()=>{},1000);","stderr-overflow",false);
   Check("StalledReader","process.stdout.write('READY');setInterval(()=>{},1000);","run-timeout",true);
   Check("EarlyExit","process.stdout.write(\'EXIT7\',()=>process.exit(7));",null,true);
   Check("ValidJsonStillRunning",SyntheticProtocol.FixedNodePayload+";setInterval(()=>{},1000);","run-timeout",false);
   Check("DescendantWriterHeldOpen","require('child_process').spawn(process.execPath,['--no-addons','-e',\"process.stdout.write('DESCENDANT_READY');setInterval(()=>{},1000)\"],{detached:true,windowsHide:true,stdio:[0,1,2]}).unref();process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>process.exit(0),300));","run-timeout",true);
   LifecycleTestHooks.HoldWriter=true;
   Check("NativeCancelCompletionRace","process.stdin.resume();process.stdin.on('end',()=>process.exit(0));","run-timeout",false);
   LifecycleTestHooks.UnknownMember=true;
   Check("UnknownJobMemberRefuses","setInterval(()=>{},1000);","unknown-job-member",false);
   BoundaryTestHooks.Mismatch="capabilities";
   Check("TokenFailureNeverResumes",null,"pre-resume-token-mismatch",false);
   Console.WriteLine("PASS NoPumpOutlivesRun SharedDeadlineDoesNotAccumulate");
  }
  internal static void ProductionDeadline(){
   try{
    LifecycleTestHooks.Payload=SyntheticProtocol.FixedNodePayload+";setInterval(()=>{},1000);";
    RunObservation o=SyntheticRunner.RunSynthetic();
    Assert.Equal(false,o.Passed);Assert.Equal("run-timeout",o.RefusalCode);
    Assert.Equal(20000,o.RunLimitMs);Assert.Equal(30000,o.TotalLimitMs);
    Assert.True(o.ElapsedMs>=20000&&o.ElapsedMs<30000,"production shared deadline");
    Assert.True(o.WriterCompleted&&!o.RootExitedBeforeStop,"valid bytes from still-running child");
    SyntheticProtocol.VerifyResult(LifecycleTestHooks.Capture.Stdout,LifecycleTestHooks.Expected);
    Assert.True(o.Cleanup.Complete,"production timeout cleanup");Assert.Equal(0,PipeSession.LivePumps);
    Console.WriteLine("PASS ProductionDeadline runLimitMs=20000 totalLimitMs=30000 validJson=true rootWasRunning=true elapsedMs="+o.ElapsedMs);
   }finally{LifecycleTestHooks.Reset();}
  }
  static void Check(string name,string payload,string expected,bool large){
   LifecycleTestHooks.Payload=payload;LifecycleTestHooks.RunMs=3000;LifecycleTestHooks.TotalMs=8000;LifecycleTestHooks.LargeInput=large;
   try{
    RunObservation o=SyntheticRunner.RunSynthetic();
    Assert.Equal(false,o.Passed);if(expected!=null)Assert.Equal(expected,o.RefusalCode);
    Assert.True(o.Cleanup.PumpsStopped&&o.Cleanup.ProcessesStopped,"terminal pumps and processes");
    Assert.Equal("Refused",o.State);Assert.Equal(0,PipeSession.LivePumps);Assert.True(o.ElapsedMs<8000,"shared deadline");
    if(expected=="run-timeout")Assert.True(o.ElapsedMs>=3000&&o.ElapsedMs<4500,"setup and run do not accumulate fresh waits");
    if(name=="TokenFailureNeverResumes"||name=="UnknownJobMemberRefuses")Assert.Equal(false,o.Resumed);
    if(name=="ConcurrentPipeBackpressure"){Assert.Equal(65536,o.InputBytes);Assert.True(o.WriterCompleted&&o.StreamsCompleted,"simultaneous drain and full write");Assert.Equal(4096,o.StdoutBytes);Assert.Equal(4096,o.StderrBytes);}
    if(name=="StalledReader"){Assert.Equal(5,o.StdoutBytes);Assert.True(!o.WriterCompleted&&!o.RootExitedBeforeStop,"ready child leaves blocked writer");}
    if(name=="EarlyExit")Assert.True(o.StdoutBytes==5&&!o.WriterCompleted&&(o.RefusalCode=="stdin-broken-pipe"||o.RefusalCode=="child-exit"),"early-exit stimulus code="+o.RefusalCode+" writer="+o.WriterCompleted+" stdout="+o.StdoutBytes);
    if(name=="FloodStdout")Assert.Equal(4097,o.StdoutBytes);
    if(name=="FloodStderr")Assert.Equal(4097,o.StderrBytes);
    if(name=="ValidJsonStillRunning"){Assert.True(!o.RootExitedBeforeStop&&o.WriterCompleted,"still running after input");SyntheticProtocol.VerifyResult(LifecycleTestHooks.Capture.Stdout,LifecycleTestHooks.Expected);}
    if(name=="DescendantWriterHeldOpen")Assert.True(o.RootExitedBeforeStop&&o.ObservedNodes>=2&&o.StdoutBytes==16&&!o.StreamsCompleted,"held descendant writer");
    if(name=="NativeCancelCompletionRace")Assert.True(o.CancelAccepted>0&&o.CancelNotFound>0&&o.AbortedIo>0,"actual native cancellation and completion race");
    if(name=="UnknownJobMemberRefuses"||name=="TokenFailureNeverResumes"){
     Assert.True(!o.Cleanup.Complete&&!o.Cleanup.FixtureAbsent,"unknown identity preserves artifacts");
     Assert.True(o.Cleanup.ProcessesStopped,"held native exit before separate followup");
     Assert.True(CleanupTestHooks.Followup(BoundaryTestHooks.LastFixture).Complete,"independent known TEST mismatch followup");
     Assert.True(!o.Cleanup.Complete,"original identity refusal remains incomplete");
    }
    Console.WriteLine("PASS "+name+" code="+o.RefusalCode+" elapsedMs="+o.ElapsedMs+" pumps="+PipeSession.LivePumps+" outputBytes="+o.StdoutBytes+" errorBytes="+o.StderrBytes+" observedMembers="+o.ObservedMembers+" exitObserved="+o.ChildExitObserved+" exitCode="+o.ChildExitCode+" cancelAccepted="+o.CancelAccepted+" cancelNotFound="+o.CancelNotFound+" abortedIo="+o.AbortedIo);
   }finally{LifecycleTestHooks.Reset();}
  }
 }
}