using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
namespace Omnira.Creative.Review {
 internal enum RefusalCode { InvalidManifest, IncompatibleIdentity, InvalidArguments, NotImplemented, InvalidPackage, NativeFailure, SourceMismatch, IncompleteExport, UnexpectedFailure }
 internal sealed class ReviewRefusal:Exception {
  internal readonly RefusalCode Code;internal readonly int? NativeError;
  internal ReviewRefusal(RefusalCode code):base(code.ToString()){Code=code;}
  internal ReviewRefusal(RefusalCode code,int native):base(code.ToString()){Code=code;NativeError=native;}
 }
 internal sealed class AuthorityObservation {
  internal readonly bool ActualWorkerTokenVerified=false,RootAclTrustVerified=false,NetworkEgressVerified=false,RealHumanApprovalVerified=false,ArbitraryBrokerContainmentVerified=false,GeneralExecutableTrustVerified=false,CreativeExecutionAuthorized=false,PublishAuthorized=false,ProductionReady=false;
 }
 internal static class ManifestSchema {
  internal const string Name="omnira.creative.launcher-review-package.v2";
  internal const string RuntimePin="780f44f2c53c108bae261ada21a525b4bfe733c020ac85e41bfe94479090ac9b";
  static readonly string[] sources={"Contracts.cs","NativeMethods.cs","NativeResources.cs","WindowsProcessBoundary.cs","FixtureInput.cs","SyntheticProtocol.cs","PipeSession.cs","SyntheticRunner.cs","ObservationWriter.cs","Program.cs","tests\\TestProgram.cs","tests\\BoundaryTests.cs","tests\\InputTests.cs","tests\\ProtocolTests.cs","tests\\LifecycleTests.cs","tests\\CleanupTests.cs","tests\\CrashHarness.cs"};
  static readonly string[] authorities={"ActualWorkerTokenVerified","RootAclTrustVerified","NetworkEgressVerified","RealHumanApprovalVerified","ArbitraryBrokerContainmentVerified","GeneralExecutableTrustVerified","CreativeExecutionAuthorized","PublishAuthorized","ProductionReady"};
  internal static string[] SourceKeys{get{return (string[])sources.Clone();}}
  internal static string[] AuthorityNames{get{return (string[])authorities.Clone();}}
 }
 internal sealed class Manifest {
  internal readonly string Schema=ManifestSchema.Name,Nonce,SourceCommit,HostSha256,RuntimeSha256,CompilerSha256,CompilerVersion;
  internal readonly int HostLength;
  internal readonly AuthorityObservation Authorities=new AuthorityObservation();
  internal readonly bool InstallationAuthorized=false,WorkerActivated=false;
  readonly ReadOnlyDictionary<string,string> sourceDigests;
  internal IDictionary<string,string> SourceDigests{get{return sourceDigests;}}
  internal Manifest(string nonce,string sourceCommit,int hostLength,string hostSha256,string runtimeSha256,string compilerSha256,string compilerVersion,IDictionary<string,string> digests) {
   Nonce=nonce;SourceCommit=sourceCommit;HostLength=hostLength;HostSha256=hostSha256;RuntimeSha256=runtimeSha256;CompilerSha256=compilerSha256;CompilerVersion=compilerVersion;
   if(digests==null)throw new ReviewRefusal(RefusalCode.InvalidManifest);
   var copy=new Dictionary<string,string>(StringComparer.Ordinal);foreach(var p in digests)copy.Add(p.Key,p.Value);
   sourceDigests=new ReadOnlyDictionary<string,string>(copy);PackageManifest.Validate(this);
  }
 }
 internal sealed class ReviewResult {
  internal readonly bool PackageConsistent,ExportCompleted,IncompleteOutput;
  internal readonly RefusalCode? Code;internal readonly int? NativeError;
  internal readonly Manifest Manifest;internal readonly string ExportNonce;
  internal readonly AuthorityObservation Authorities=new AuthorityObservation();
  internal readonly bool InstallationAuthorized=false,WorkerActivated=false,RuntimeProvenanceVerified=false,ExecutableStarted=false,ProtectedDestinationWritten=false;
  internal ReviewResult(bool consistent,bool exported,bool incomplete,RefusalCode? code,int? nativeError,Manifest manifest,string exportNonce) {
   PackageConsistent=consistent;ExportCompleted=exported;IncompleteOutput=incomplete;Code=code;NativeError=nativeError;Manifest=manifest;ExportNonce=exportNonce;
  }
  internal static ReviewResult Refused(RefusalCode code){return new ReviewResult(false,false,false,code,null,null,null);}
 }
}
