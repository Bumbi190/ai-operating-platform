using System;
namespace Omnira.Creative.Synthetic {
 internal static class Assert {
  internal static void True(bool value,string message){if(!value)throw new Exception("assert:"+message);}
  internal static void Equal<T>(T expected,T actual){if(!object.Equals(expected,actual))throw new Exception("assert:expected="+expected+" actual="+actual);}
  internal static void Refuses(string code,Action action){try{action();}catch(SyntheticRefusal e){Equal<string>(code,e.Code);Console.WriteLine("REFUSAL code="+e.Code+" native="+e.NativeError);return;}throw new Exception("assert:expected refusal "+code);}
 }
 internal static class TestProgram {
  static int Main(string[] args){
   try{if(args.Length==1&&args[0]=="GuardLeaf"){BoundarySession.VerifyHost();return CrashHarness.GuardLeaf();}if(args.Length==2&&args[0]=="GuardOwner"){BoundarySession.VerifyHost();return CrashHarness.GuardOwner(args[1]);}if(args.Length==4&&args[0]=="CrashOwner")return CrashTestHooks.Owner(args);if(args.Length==2&&args[0]=="Watchdog")return CrashHarness.Watchdog(args[1]);Assert.True(args.Length==1&&(args[0]=="Cli"||args[0]=="Boundary"||args[0]=="Input"||args[0]=="Protocol"||args[0]=="Lifecycle"||args[0]=="LifecycleDeadline"||args[0]=="Cleanup"||args[0]=="Crash"),"suite");BoundarySession.VerifyHost();Console.WriteLine("HOST outsideAppContainer=true elevated=false");if(args[0]=="Cli")CliTests.Run();else if(args[0]=="Cleanup")CleanupTests.Run();else if(args[0]=="Crash")CrashHarness.Run();else if(args[0]=="Input")InputTests.Run();else if(args[0]=="Protocol")ProtocolTests.Run();else if(args[0]=="Lifecycle")LifecycleTests.Run();else if(args[0]=="LifecycleDeadline")LifecycleTests.ProductionDeadline();else BoundaryTests.Run();Console.WriteLine("Suite="+args[0]+", Passed=true, Skipped=0");return 0;}
   catch(Exception e){Console.WriteLine("Suite="+(args.Length==1?args[0]:"invalid")+", Passed=false, Skipped=0");Console.WriteLine(e.ToString());return 1;}
  }
 }
}
namespace Omnira.Creative.Synthetic {
 internal static class CliTestHooks {
  internal static Action VerifyIdentity;
  internal static Func<RunObservation> Run;
 }
 internal static class CliTests {
  static readonly string[] Authorities={"ActualWorkerTokenVerified","RootAclTrustVerified","NetworkEgressVerified","RealHumanApprovalVerified","ArbitraryBrokerContainmentVerified","GeneralExecutableTrustVerified","CreativeExecutionAuthorized","PublishAuthorized","ProductionReady"};
  internal static void Run(){
   CliIsSyntheticOnly();ElevatedHostRefusesBeforeSetup();ReportCannotGrantAuthority();ReportIsBoundedAndRedacted();NoProductImports();
  }
  static void CliIsSyntheticOnly(){
   int identities=0,runs=0,creates=WindowsProcessBoundary.ProcessCreateAttempts;
   CleanupObservation before=WindowsProcessBoundary.LastCleanup;
   CliTestHooks.VerifyIdentity=()=>{identities++;};CliTestHooks.Run=()=>{runs++;return new RunObservation();};
   try{
    foreach(string[] args in new[]{new string[0],new[]{"unknown"},new[]{"--synthetic-self-test","extra"},new[]{"--path","secret"},new[]{"--account","secret"},new[]{"--SYNTHETIC-SELF-TEST"},new[]{"--synthetic-self-test=1"}}){
     using(System.IO.StringWriter output=new System.IO.StringWriter()){
      Assert.Equal(2,SyntheticEntry.Execute(args,output));Assert.True(output.ToString().Contains("\"RefusalCode\":\"unsupported-arguments\""),"fixed CLI refusal");CheckAuthorities(output.ToString());
     }
    }
    Assert.Equal(0,identities);Assert.Equal(0,runs);Assert.Equal(creates,WindowsProcessBoundary.ProcessCreateAttempts);
    Assert.True(object.ReferenceEquals(before,WindowsProcessBoundary.LastCleanup),"no setup before CLI rejection");
    Assert.Equal(2,SyntheticEntry.Execute(new[]{"--synthetic-self-test"},new System.IO.StringWriter()));Assert.Equal(1,runs);Assert.Equal(1,identities);
    CliTestHooks.Run=()=>new RunObservation{Passed=true,State="Cleaned"};
    Assert.Equal(2,SyntheticEntry.Execute(new[]{"--synthetic-self-test"},new System.IO.StringWriter()));
    CliTestHooks.Run=()=>new RunObservation{Passed=true,State="Cleaned",HostIdentityVerified=true,ExactJobAtReturn=true,SyntheticTokenAndImageVerified=true,Resumed=true,RootExitedBeforeStop=true,ChildExitObserved=true,WriterCompleted=true,StreamsCompleted=true,Cleanup=new CleanupObservation{FixtureAbsent=true,InputFixtureAbsent=true,ProfileDeleteApiSucceeded=true,ProfileStorageAbsent=true,ProfileMappingAbsent=true}};
    Assert.Equal(0,SyntheticEntry.Execute(new[]{"--synthetic-self-test"},new System.IO.StringWriter()));
   }finally{CliTestHooks.VerifyIdentity=null;CliTestHooks.Run=null;}
   // Real production entry shares the helper and has no TEST seams.
   System.Reflection.Assembly host=System.Reflection.Assembly.LoadFile(System.IO.Path.Combine(System.IO.Path.GetDirectoryName(typeof(CliTests).Assembly.Location),"SyntheticLauncher.exe"));
   Assert.True(host.GetType("Omnira.Creative.Synthetic.CliTestHooks")==null,"production excludes CLI hooks");
   var old=Console.Out;var capture=new System.IO.StringWriter();
   try{Console.SetOut(capture);Assert.Equal(2,(int)host.EntryPoint.Invoke(null,new object[]{new string[0]}));}finally{Console.SetOut(old);}
   Assert.True(capture.ToString().StartsWith("{")&&capture.ToString().TrimEnd().EndsWith("}"),"production refusal JSON");CheckAuthorities(capture.ToString());
   Console.WriteLine("PASS CliIsSyntheticOnly noResources=true productionEntry=true");
  }
  static void ElevatedHostRefusesBeforeSetup(){
   int runs=0,creates=WindowsProcessBoundary.ProcessCreateAttempts;CleanupObservation before=WindowsProcessBoundary.LastCleanup;
   CliTestHooks.VerifyIdentity=()=>{throw new SyntheticRefusal("pre-resume-token-mismatch");};
   CliTestHooks.Run=()=>{runs++;return new RunObservation();};
   try{using(var output=new System.IO.StringWriter()){
    Assert.Equal(2,SyntheticEntry.Execute(new[]{"--synthetic-self-test"},output));
    Assert.True(output.ToString().Contains("\"RefusalCode\":\"pre-resume-token-mismatch\""),"identity refusal");CheckAuthorities(output.ToString());
   }}finally{CliTestHooks.VerifyIdentity=null;CliTestHooks.Run=null;}
   Assert.Equal(0,runs);Assert.Equal(creates,WindowsProcessBoundary.ProcessCreateAttempts);Assert.True(object.ReferenceEquals(before,WindowsProcessBoundary.LastCleanup),"identity gate before resources");
   Console.WriteLine("PASS ElevatedHostRefusesBeforeSetup injectedIdentityOnly=true");
  }
  static void CheckAuthorities(string json){
   foreach(string name in Authorities)Assert.True(json.Contains("\""+name+"\":false"),"false authority "+name);
  }
  static void ReportCannotGrantAuthority(){
   foreach(string state in new[]{"Prepared","InputPinned","ProcessSuspended","TokenAndJobVerified","Running","ProducersStopped","ResultVerified","Cleaned","Refused"}){
    RunObservation o=new RunObservation{State=state,FailedStage=state,Passed=state=="Cleaned",RefusalCode="internal-failure"};
    foreach(string name in Authorities){var field=typeof(RunObservation).GetField(name,System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic);Assert.True(field.IsInitOnly,"immutable "+name);Assert.Equal(false,(bool)field.GetValue(o));}
    using(var output=new System.IO.StringWriter()){ObservationWriter.Write(o,output);CheckAuthorities(output.ToString());}
   }
   Console.WriteLine("PASS ReportCannotGrantAuthority nine=false allStages=true");
  }
  static void ReportIsBoundedAndRedacted(){
   string poison="SECRET-CREDENTIAL-raw-stderr-canary-"+new string('x',40000);
   var o=new RunObservation{State=poison,FailedStage=poison,RefusalCode=poison,Passed=false};
   using(var output=new System.IO.StringWriter()){
    ObservationWriter.Write(o,output);string json=output.ToString();
    Assert.True(System.Text.Encoding.UTF8.GetByteCount(json)<=32768,"bounded report");Assert.True(!json.Contains("SECRET")&&!json.Contains("xxxx"),"redacted unknown strings");CheckAuthorities(json);
    Assert.True(json.Contains("\"State\":\"Unknown\"")&&json.Contains("\"RefusalCode\":\"unrecognized-refusal\""),"strict enums");
   }
   foreach(string code in new[]{"stdout-read","stderr-read","stdout-overflow","stderr-overflow","local-NTFS-required","unsupported-ABI"}){
    using(var output=new System.IO.StringWriter()){
     ObservationWriter.Write(new RunObservation{RefusalCode=code},output);
     Assert.True(output.ToString().Contains("\"RefusalCode\":\""+code+"\""),"preserved finite refusal "+code);
    }
   }
   foreach(string code in new[]{"arbitrary-refusal","native-open-failed-0xc0000022"}){
    using(var output=new System.IO.StringWriter()){
     ObservationWriter.Write(new RunObservation{RefusalCode=code},output);
     Assert.True(output.ToString().Contains("\"RefusalCode\":\"unrecognized-refusal\"")&&!output.ToString().Contains(code),"redacted dynamic refusal");
    }
   }
   Console.WriteLine("PASS ReportIsBoundedAndRedacted maxUtf8Bytes=32768 finiteSixPreserved=true dynamicRedacted=true");
  }
  static void NoProductImports(){
   int count=0;foreach(string file in System.IO.Directory.GetFiles(System.IO.Path.Combine(BuildContext.RepositoryRoot,"scripts","creative-tools"),"*.mjs")){
    string text=System.IO.File.ReadAllText(file);foreach(string forbidden in new[]{"/launcher/","launcher\\","SyntheticLauncher","Omnira.Creative.Synthetic"})Assert.True(!text.Contains(forbidden),"no product reference "+System.IO.Path.GetFileName(file));count++;
   }
   Assert.True(count>0,"product audit nonempty");Console.WriteLine("PASS NoProductImports creativeToolsMjsFiles="+count);
  }
 }
}
