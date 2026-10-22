using System;
namespace Omnira.Creative.Review {
 internal static class TestProgram {
  static int Main(string[] args) {
   try { if(args.Length!=1||(args[0]!="Codec"&&args[0]!="Files"&&args[0]!="All"))throw new Exception("suite");
    if(args[0]!="Files"){ManifestTests.Run();Console.WriteLine("PASS Codec assertions="+ManifestTests.Assertions);}if(args[0]!="Codec"){FileTests.Run();Console.WriteLine("PASS Files assertions="+FileTests.Assertions);}return 0;
   } catch(Exception e){Console.Error.WriteLine("FAIL "+e.GetType().Name+" "+e.Message);return 1;}
  }
 }
}
