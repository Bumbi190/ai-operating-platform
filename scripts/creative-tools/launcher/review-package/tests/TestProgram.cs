using System;
namespace Omnira.Creative.Review {
 internal static class TestProgram {
  static int Main(string[] args) {
   try { if(args.Length!=1)throw new Exception("suite");
    switch(args[0]){
     case "Codec":ManifestTests.Run();Console.WriteLine("PASS Codec assertions="+ManifestTests.Assertions);break;
     case "Files":FileTests.Run();Console.WriteLine("PASS Files assertions="+FileTests.Assertions);break;
     case "Export":ExportTests.Run();Console.WriteLine("PASS Export assertions="+ExportTests.Assertions);break;
     default:throw new Exception("suite");
    }return 0;
   }catch(Exception e){Console.Error.WriteLine("FAIL "+e.GetType().Name+" "+e.Message);return 1;}
  }
 }
}