using System;
using System.IO;
namespace Omnira.Creative.Review {
 internal static class ReviewProgram {static int Main(string[] args){return ReviewEntry.Execute(args,Console.Out);}}
 internal static class ReviewEntry {
  internal static int Execute(string[] args,TextWriter output) {
   output.Write("{\"packageConsistent\":false,\"refusal\":\"NotImplemented\",\"InstallationAuthorized\":false,\"WorkerActivated\":false,\"RuntimeProvenanceVerified\":false,\"ExecutableStarted\":false,\"ProtectedDestinationWritten\":false,\"Authorities\":{");
   bool first=true;foreach(string name in ManifestSchema.AuthorityNames){if(!first)output.Write(",");first=false;output.Write("\""+name+"\":false");}output.Write("}}");return 2;
  }
 }
}
