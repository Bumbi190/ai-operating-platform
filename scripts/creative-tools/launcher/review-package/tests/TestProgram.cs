using System;
namespace Omnira.Creative.Review {
 internal static class TestProgram {
  static int Main(string[] args) {
   try { if(args.Length!=1||args[0]!="Codec")throw new Exception("suite");
    ManifestTests.Run();Console.WriteLine("PASS Codec assertions="+ManifestTests.Assertions);return 0;
   } catch(Exception e){Console.Error.WriteLine("FAIL "+e.GetType().Name+" "+e.Message);return 1;}
  }
 }
}
