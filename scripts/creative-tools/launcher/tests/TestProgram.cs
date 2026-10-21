using System;
namespace Omnira.Creative.Synthetic {
 internal static class Assert {
  internal static void True(bool value,string message){if(!value)throw new Exception("assert:"+message);}
  internal static void Equal<T>(T expected,T actual){if(!object.Equals(expected,actual))throw new Exception("assert:expected="+expected+" actual="+actual);}
  internal static void Refuses(string code,Action action){try{action();}catch(SyntheticRefusal e){Equal<string>(code,e.Code);Console.WriteLine("REFUSAL code="+e.Code+" native="+e.NativeError);return;}throw new Exception("assert:expected refusal "+code);}
 }
 internal static class TestProgram {
  static int Main(string[] args){
   try{if(args.Length==1&&args[0]=="GuardLeaf"){BoundarySession.VerifyHost();return CrashHarness.GuardLeaf();}if(args.Length==2&&args[0]=="GuardOwner"){BoundarySession.VerifyHost();return CrashHarness.GuardOwner(args[1]);}if(args.Length==4&&args[0]=="CrashOwner")return CrashTestHooks.Owner(args);if(args.Length==2&&args[0]=="Watchdog")return CrashHarness.Watchdog(args[1]);Assert.True(args.Length==1&&(args[0]=="Boundary"||args[0]=="Input"||args[0]=="Protocol"||args[0]=="Lifecycle"||args[0]=="LifecycleDeadline"||args[0]=="Cleanup"||args[0]=="Crash"),"suite");BoundarySession.VerifyHost();Console.WriteLine("HOST outsideAppContainer=true elevated=false");if(args[0]=="Cleanup")CleanupTests.Run();else if(args[0]=="Crash")CrashHarness.Run();else if(args[0]=="Input")InputTests.Run();else if(args[0]=="Protocol")ProtocolTests.Run();else if(args[0]=="Lifecycle")LifecycleTests.Run();else if(args[0]=="LifecycleDeadline")LifecycleTests.ProductionDeadline();else BoundaryTests.Run();Console.WriteLine("Suite="+args[0]+", Passed=true, Skipped=0");return 0;}
   catch(Exception e){Console.WriteLine("Suite="+(args.Length==1?args[0]:"invalid")+", Passed=false, Skipped=0");Console.WriteLine(e.ToString());return 1;}
  }
 }
}