using System;
using System.IO;
using System.Text;
using System.Globalization;
namespace Omnira.Creative.Synthetic {
 // Shared entry logic keeps TEST seams out of the production entry assembly.
 internal static class SyntheticEntry {
  internal static int Execute(string[] args,TextWriter output){
   RunObservation result;
   if(args==null||args.Length!=1||args[0]!="--synthetic-self-test")result=Refusal("unsupported-arguments",null);
   else {
    try {
     OperationBudget budget=new OperationBudget();
#if TEST
     if(CliTestHooks.VerifyIdentity!=null)CliTestHooks.VerifyIdentity();else
#endif
     BoundarySession.VerifyHost();
#if TEST
     result=CliTestHooks.Run!=null?CliTestHooks.Run():SyntheticRunner.RunSynthetic(budget);
#else
     result=SyntheticRunner.RunSynthetic(budget);
#endif
    }catch(SyntheticRefusal e){result=Refusal(e.Code,e.NativeError);}
    catch(Exception){result=Refusal("internal-failure",null);}
   }
   if(result.Passed&&!(result.State=="Cleaned"&&result.Cleanup!=null&&result.Cleanup.Complete&&result.HostIdentityVerified&&result.ExactJobAtReturn&&result.SyntheticTokenAndImageVerified&&result.Resumed&&result.RootExitedBeforeStop&&result.ChildExitObserved&&result.ChildExitCode==0&&result.WriterCompleted&&result.StreamsCompleted)){
    result.Passed=false;result.FailedStage=result.State;result.State="Refused";result.RefusalCode="invalid-completion";
   }
   try{ObservationWriter.Write(result,output);output.Flush();}catch{return 2;}
   return result.Passed?0:2;
  }
  static RunObservation Refusal(string code,int? error){
   var r=new RunObservation{State="Refused",FailedStage="Prepared",RefusalCode=code,NativeError=error};
   r.Cleanup.CleanupFailed=true;return r;
  }
 }
 internal static class ObservationWriter {
  const string Stages=" Prepared InputPinned ProcessSuspended TokenAndJobVerified Running ProducersStopped ResultVerified Cleaned Refused ";
  const string Codes=" unsupported-arguments invalid-completion metadata-failure after-runtime attribute-init attribute-size boundary-refused budget-invalid capture-incomplete child-exit cleanup-budget cleanup-capture-bound cleanup-disposition cleanup-entry-bound cleanup-exact-job cleanup-identity cleanup-identity-budget cleanup-identity-open cleanup-image cleanup-image-mismatch cleanup-missing-entry cleanup-open cleanup-unknown-entry cleanup-unverified cleanup-wrong-job clear-inheritance combined-create-refused console-member-bound file-change-rejected file-growth-rejected file-size-rejected final-path-unavailable handle-metadata-unavailable handle-type-rejected hard-link-rejected image-query input-cleanup-marker input-create-directory input-create-parent input-create-root input-fixture-required input-handle-flags input-handle-inheritable input-identity-open input-owner-identity input-owner-marker input-root-duplicate input-root-identity internal-failure invalid-boundary-state invalid-relative-path job-at-return-mismatch job-at-return-query job-create job-member-bound job-member-id job-members-query job-query job-set-policy job-stop leaf-final-path-mismatch local-canonical-root-required local-fixed-drive-required member-exact-job member-image member-open member-root-duplicate membership-query membership-state member-wrong-job native-attribute-refused native-buffer-bound native-invalid-handle observed-member-bound operation-busy pipe-create pipe-request-bound pre-resume-token-mismatch process-exit-query producers-not-stopped profile-cleanup-budget profile-cleanup-ownership profile-create profile-path profile-path-mismatch protocol-bound protocol-schema pump-native-failure pumps-not-terminal pump-start-failed pump-start-timeout pump-thread-flags pump-thread-handle pump-thread-inheritable read-bound-rejected read-disposed-or-consumed read-inheritance reparse-ancestor reparse-rejected resume-failed resume-refused root-disposed root-final-path-mismatch root-open-failed runtime-inherited-package-rx run-timeout runtime-pin runtime-pin-flags runtime-pin-inheritable setup-budget short-read-rejected spawn-gate-busy staged-runtime-pin stdin-broken-pipe stdin-write streams-incomplete token-group-bound token-open token-read token-size unexpected-inheritable-handle unexpected-job-member unknown-job-member unsupported-native-abi ";
  static string Enum(string value,string allowed,string fallback){return value!=null&&value.Length<=80&&value.IndexOf(' ')<0&&allowed.IndexOf(" "+value+" ",StringComparison.Ordinal)>=0?value:fallback;}
  static string Hex(string value,int length){
   if(value==null||value.Length!=length)return null;
   foreach(char c in value)if(!(c>='0'&&c<='9')&&!(c>='a'&&c<='f'))return null;return value;
  }
  static string Version(string value){
   if(value==null||value.Length>64)return null;
   foreach(char c in value)if(!(c>='0'&&c<='9')&&c!='.')return null;return value;
  }
  sealed class Json {
   internal readonly StringBuilder Text=new StringBuilder("{");
   internal void Raw(string key,string value){if(Text.Length>1)Text.Append(',');Text.Append('"').Append(key).Append("\":").Append(value);}
   internal void Bool(string key,bool value){Raw(key,value?"true":"false");}
   internal void Number(string key,long value){Raw(key,value.ToString(CultureInfo.InvariantCulture));}
   internal void String(string key,string safeValue){Raw(key,safeValue==null?"null":"\""+safeValue+"\"");}
  }
  internal static void Write(RunObservation o,TextWriter output){
   if(o==null||output==null)throw new ArgumentNullException();
   Json j=new Json();j.String("Schema","omnira.creative.synthetic-launcher.v1");
   j.Bool("Passed",o.Passed);j.String("State",Enum(o.State,Stages,"Unknown"));
   j.String("FailedStage",o.FailedStage==null?null:Enum(o.FailedStage,Stages,"Unknown"));
   j.String("RefusalCode",o.RefusalCode==null?null:Enum(o.RefusalCode,Codes,"unrecognized-refusal"));
   j.Raw("NativeError",o.NativeError.HasValue?o.NativeError.Value.ToString(CultureInfo.InvariantCulture):"null");
   j.Bool("HostIdentityVerified",o.HostIdentityVerified);j.Bool("ResourcesCreated",o.ResourcesCreated);
   j.String("FixtureNonce",Hex(o.FixtureNonce,32));j.String("InputSha256",Hex(o.InputSha256,64));
   j.String("HostSha256",Hex(o.HostSha256,64));j.String("ClrSha256",Hex(o.ClrSha256,64));j.String("NodeSha256",Hex(o.RuntimeSha256,64));
   j.String("ClrVersion",Version(o.ClrVersion));j.String("EnvironmentOsVersion",Version(o.OsVersion));
   j.String("OsVersionSource","Environment.OSVersion-compatibility-view");
   j.Number("InputBytes",o.InputBytes);j.Number("RequestBytes",o.RequestBytes);j.Number("StdoutBytes",o.StdoutBytes);j.Number("StderrBytes",o.StderrBytes);
   j.Number("InputLimitBytes",65536);j.Number("RequestLimitBytes",98304);j.Number("StdoutLimitBytes",4096);j.Number("StderrLimitBytes",4096);j.Number("ReportLimitBytes",32768);
   j.Number("RunLimitMs",o.RunLimitMs);j.Number("TotalLimitMs",o.TotalLimitMs);j.Number("ElapsedMs",o.ElapsedMs);
   j.Bool("ExactJobAtReturn",o.ExactJobAtReturn);j.Bool("SyntheticTokenAndImageVerified",o.SyntheticTokenAndImageVerified);
   // Values are the exact conjunctive policy that VerifyBeforeResume checked.
   j.Raw("ObservedJobFlags",o.SyntheticTokenAndImageVerified?"8200":"null");j.Raw("ObservedActiveProcessLimit",o.SyntheticTokenAndImageVerified?"4":"null");
   j.Raw("ObservedCapabilityCount",o.SyntheticTokenAndImageVerified?"0":"null");j.Raw("ObservedIntegrityRid",o.SyntheticTokenAndImageVerified?"4096":"null");
   j.Raw("ObservedChildElevated",o.SyntheticTokenAndImageVerified?"false":"null");j.Raw("ObservedEnabledAdministrator",o.SyntheticTokenAndImageVerified?"false":"null");
   j.Bool("Resumed",o.Resumed);j.Bool("RootExitedBeforeStop",o.RootExitedBeforeStop);j.Bool("ChildExitObserved",o.ChildExitObserved);
   j.Raw("ChildExitCode",o.ChildExitObserved?o.ChildExitCode.ToString(CultureInfo.InvariantCulture):"null");
   j.Bool("WriterCompleted",o.WriterCompleted);j.Bool("StreamsCompleted",o.StreamsCompleted);j.Number("ObservedMembers",o.ObservedMembers);j.Number("ObservedNodes",o.ObservedNodes);
   j.Number("CancelAttempts",o.CancelAttempts);j.Number("CancelAccepted",o.CancelAccepted);j.Number("CancelNotFound",o.CancelNotFound);j.Number("AbortedIo",o.AbortedIo);
   CleanupObservation c=o.Cleanup??new CleanupObservation();
   Json cleanup=new Json();cleanup.Bool("Complete",c.Complete);cleanup.Bool("ProcessesStopped",c.ProcessesStopped);cleanup.Bool("PumpsStopped",c.PumpsStopped);cleanup.Bool("ProcessIdentityVerified",c.ProcessIdentityVerified);
   cleanup.Bool("InputFixtureAbsent",c.InputFixtureAbsent);cleanup.Bool("FixtureAbsent",c.FixtureAbsent);cleanup.Bool("ProfileDeleteApiSucceeded",c.ProfileDeleteApiSucceeded);cleanup.Bool("ProfileStorageAbsent",c.ProfileStorageAbsent);cleanup.Bool("ProfileMappingAbsent",c.ProfileMappingAbsent);cleanup.Bool("CleanupFailed",c.CleanupFailed);
   cleanup.Text.Append('}');j.Raw("Cleanup",cleanup.Text.ToString());
   // Literal false is deliberate: no observation or request can grant authority.
   j.Bool("ActualWorkerTokenVerified",false);j.Bool("RootAclTrustVerified",false);j.Bool("NetworkEgressVerified",false);j.Bool("RealHumanApprovalVerified",false);j.Bool("ArbitraryBrokerContainmentVerified",false);j.Bool("GeneralExecutableTrustVerified",false);j.Bool("CreativeExecutionAuthorized",false);j.Bool("PublishAuthorized",false);j.Bool("ProductionReady",false);
   j.Text.Append('}');string json=j.Text.ToString();if(Encoding.UTF8.GetByteCount(json)>32768)throw new InvalidOperationException("report-bound");
   output.Write(json);
  }
 }
}
