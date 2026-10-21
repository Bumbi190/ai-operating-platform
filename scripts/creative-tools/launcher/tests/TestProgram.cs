using System;
namespace Omnira.Creative.Synthetic {
 internal static class Assert {
  internal static void True(bool value,string message){if(!value)throw new Exception("assert:"+message);}
  internal static void Equal<T>(T expected,T actual){if(!object.Equals(expected,actual))throw new Exception("assert:expected="+expected+" actual="+actual);}
  internal static void Refuses(string code,Action action){try{action();}catch(SyntheticRefusal e){Equal<string>(code,e.Code);Console.WriteLine("REFUSAL code="+e.Code+" native="+e.NativeError);return;}throw new Exception("assert:expected refusal "+code);}
 }
 internal static class TestProgram {
  static int Main(string[] args){
   try{Assert.True(args.Length==1&&args[0]=="Boundary","suite");BoundarySession.VerifyHost();Console.WriteLine("HOST outsideAppContainer=true elevated=false");BoundaryTests.Run();Console.WriteLine("Suite=Boundary, Passed=true, Skipped=0");return 0;}
   catch(Exception e){Console.WriteLine("Suite=Boundary, Passed=false, Skipped=0");Console.WriteLine(e.ToString());return 1;}
  }
 }
}