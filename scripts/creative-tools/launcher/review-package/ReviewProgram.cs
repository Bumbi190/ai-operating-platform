using System;
using System.IO;
using System.Text;
using System.Globalization;
namespace Omnira.Creative.Review {
 internal static class ReviewProgram {static int Main(string[] args){return ReviewEntry.Execute(args,Console.Out);}}
 internal static class ReviewEntry {
  internal static int Execute(string[] args,TextWriter output) {
   ReviewResult result;
   if(args!=null&&args.Length==2&&args[0]=="--verify")result=PackageVerifier.Verify(args[1]);
   else if(args!=null&&args.Length==1&&args[0]=="--export")result=ReviewResult.Refused(RefusalCode.NotImplemented);
   else result=ReviewResult.Refused(RefusalCode.InvalidArguments);
   var report=new StringBuilder();
   report.Append("{\"packageConsistent\":").Append(result.PackageConsistent?"true":"false");
   report.Append(",\"refusal\":").Append(result.Code.HasValue?"\""+result.Code.Value.ToString()+"\"":"null");
   report.Append(",\"nativeError\":").Append(result.NativeError.HasValue?result.NativeError.Value.ToString(CultureInfo.InvariantCulture):"null");
   if(result.Manifest!=null)report.Append(",\"manifestObservation\":").Append(Encoding.UTF8.GetString(PackageManifest.Encode(result.Manifest)));
   report.Append(",\"InstallationAuthorized\":false,\"WorkerActivated\":false,\"RuntimeProvenanceVerified\":false,\"ExecutableStarted\":false,\"ProtectedDestinationWritten\":false,\"Authorities\":{");
   bool first=true;foreach(string name in ManifestSchema.AuthorityNames){if(!first)report.Append(",");first=false;report.Append("\""+name+"\":false");}report.Append("}}");
   if(Encoding.UTF8.GetByteCount(report.ToString())>32768)throw new InvalidOperationException();
   output.Write(report.ToString());return result.PackageConsistent?0:2;
  }
 }
}
