# Task 1 implementation report

Scope: strict v2 manifest/contracts, isolated tool/test build, refusal-only CLI, Codec tests and owned finite captures. Base 3b7475efb262949d2b1f0276f1ed73c7ef3ed57d, branch feat/atlas-creative-p42-release-review-package. Read task-1-brief.md first and the binding design; did not read the whole plan. No helpers, reviewers, native suites, editors, runtime execution, worker/protected operations or legacy regression were run. All P40 source is unchanged. Nine historical residual pairs and the manual P41 packet were neither adopted nor deleted.

## Changes and interfaces

Seven new files under scripts/creative-tools/launcher/review-package:
- PackageContracts.cs: immutable Manifest, copied read-only SourceDigests, immutable all-false AuthorityObservation, finite RefusalCode/ReviewRefusal and immutable ReviewResult.
- PackageManifest.cs: Parse(byte[])->Manifest and Encode(Manifest)->byte[]. A complete bounded grammar/decoded-name/integer validation pass precedes schema materialization. Strict UTF8, no BOM, 65536-byte bound, depth<=3/property<=64, no arrays/null/coercions/trailing bytes, exact finite schema/source keys/runtime pin. Canonical UTF8 output, no newline.
- ReviewProgram.cs: ReviewEntry.Execute(string[],TextWriter)->int always emits finite NotImplemented refusal with all false authority and exit 2 until Tasks 2/3.
- build.ps1: unchanged parent build invocation; explicit shared/production/test source lists; production/main and REVIEW_TEST test/main compile separately with Framework64 csc and explicit references. Original HostExe/TestExe/BuildRoot/SourceDigests retained; ReviewExe/ReviewTestExe/ReviewSourceDigests added.
- tests/TestProgram.cs and tests/ManifestTests.cs: Codec entry and nine requested named cases (59 assertions).
- tests/run.ps1: owned process, independent 45000ms outer deadline, async captures, unique nonce paths, CreateNew stdout/stderr/metadata, flush; failures retained.

Manifest constructor:
Manifest(string nonce,string sourceCommit,int hostLength,string hostSha256,string runtimeSha256,string compilerSha256,string compilerVersion,IDictionary<string,string> digests).

ReviewResult constructor:
ReviewResult(bool consistent,bool exported,bool incomplete,RefusalCode? code,int? nativeError,Manifest manifest,string exportNonce).
Fields: PackageConsistent,ExportCompleted,IncompleteOutput,Code,NativeError,Manifest,ExportNonce,Authorities and readonly false InstallationAuthorized,WorkerActivated,RuntimeProvenanceVerified,ExecutableStarted,ProtectedDestinationWritten.
Refusal enum: InvalidManifest,IncompatibleIdentity,InvalidArguments,NotImplemented,InvalidPackage,NativeFailure,SourceMismatch,IncompleteExport,UnexpectedFailure.
Later tasks should preserve these interfaces or explicitly record necessary integration amendments.

Generated ReleaseBuildContext has HostSha256,HostLength,SourceCommit,CompilerSha256,CompilerVersion,RuntimeSha256 constants and SourceDigests property returning a fresh fixed map. Generated source uses canonical escaped C# literals from fixed wrapper observations only. No package input reaches code generation. There is no new generated test context; parent's generated test-only context remains confined to its test build. No TEST symbol is passed to either review build.

## Actual RED

Tests were written before implementation. Remote command compiled only the two new tests while Manifest/contracts were absent:
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe /out:"<fresh-red-dir>\Red.exe" "<worktree>\scripts\creative-tools\launcher\review-package\tests\TestProgram.cs" "<worktree>\scripts\creative-tools\launcher\review-package\tests\ManifestTests.cs"

Fresh directory:
.superpowers/sdd/creative-release-review/task1-red-222aa6dd53004bd09ca597b914ccaad6/
Files stdout.txt,stderr.txt,metadata.txt preserved. Actual compiler stdout:
c:\Users\Andre\Projects\Omnira\.worktrees\atlas-creative-p38-launcher-design\scripts\creative-tools\launcher\review-package\tests\ManifestTests.cs(11,19): error CS0246: The type or namespace name 'Manifest' could not be found (are you missing a using directive or an assembly reference?)

ManifestTests SHA256 at RED: 950c46a1bb8024b8cf0b11ac35e47deb6ce7164d852f735fa34a1298184228eb.
TestProgram SHA256 at RED: f0237322798f22a1a471708dd37e4a875777d125878dc85e38a5a38f66363c97.
The initial ad hoc RED used Start-Process RedirectStandardOutput/RedirectStandardError within a GUID-new directory, rather than explicit CreateNew for those two streams. Its metadata records a blank process exit observation; the compiler diagnostic is the actual RED evidence. This capture limitation is retained, not repaired or overwritten. The implemented wrapper/runner use explicit CreateNew and observed exit codes.

## Build/Codec GREEN and production exclusion

Exact covering command:
& 'C:\Users\Andre\Projects\Omnira\.worktrees\atlas-creative-p38-launcher-design\scripts\creative-tools\launcher\review-package\tests\run.ps1' -Suite Codec

First invocation refused "unexpected compiler version" because FileVersion includes a textual suffix. Corrected to numeric fixed file version components; did not weaken the manifest dotted-numeric rule. Original refusal remains in remote command output. Final output:
PASS Codec assertions=59

Build root:
C:\Users\Andre\AppData\Local\Temp\omnira-launcher-build-a25477b81e07497bb80e8f3d97b80744
Codec evidence:
Codec-0ca53d21e40a4ccbb63bbff1c705ec4c.metadata.json
Observed ExitCode=0, TimedOut=false, CaptureComplete=true, OuterLimitMs=45000. Codec stdout/stderr remain at corresponding .stdout.txt/.stderr.txt paths; stderr empty.
review-production.metadata.json/review-tests.metadata.json retain exact compiler argument arrays and separate stdout/stderr (empty); both compiler exits 0. Parent compile.log preserved by unchanged parent wrapper.
review-build.metadata.json retains parent and new source identities; appended verbatim below.
Generated context: host 79360 bytes, SHA256 325884206c444ee996935765b55dd2ef09640ac175211a95e0793b78f185feab; compiler SHA256 eca02e6b15cde93009a59a3d129d5a77fb5008f2e1cf62cf573b6737c747ecc3; compiler numeric version 14.8.10001.0; runtime declared/observed pin 780f44f2c53c108bae261ada21a525b4bfe733c020ac85e41bfe94479090ac9b.

Production exclusion was checked by reading executable bytes as data (no assembly load) and inspecting the explicit compile source lists in compiler metadata:
production-exclusion-58ef137eb7604e7a9325f9dd1a5834cf.json
HostHasManifestTests=false; HostHasReleaseBuildContext=false; ReviewProductionHasTestProgram=false; ReviewProductionHasManifestTests=false; ReviewTestsHaveManifestTests=true; ReviewTestsHaveTestProgram=true.
The first ad hoc exclusion command used reserved PowerShell $host and failed; its empty production-exclusion-bc04281ca5ce4d5999341574a076635a.json is preserved. The corrected command used $hostBytes and created a new evidence file. No implementation change followed the covering green.

Exact final hygiene commands: git diff --check; git status --short. diff check emitted no errors. Only the new review-package directory was untracked before staging. No binary is staged.

## Limits / concerns

This Task 1 build is not an exporter/verifier qualification. CLI deliberately refuses; PackageSnapshot/PackageVerifier/PackageExporter are for later tasks. Parent source/compiler observations remain mutable-checkout qualification observations, not source authentication or permissions. Compiler is observed at the fixed Framework64 path with numeric metadata and before/after hash equality; no new independent compiler provenance anchor is claimed. Runtime is hashed but never started. P40's source/parent-build TOCTOU trust limitations remain; readonly handles are used during individual observation hashes, not a claimed hostile-same-user build sandbox. Hash consistency is not authentication. A coherent foreign manifest is explicitly accepted as bounded data while every authority remains false.

The initial ad hoc RED capture/blank exit observation and failed first exclusion check above are evidence limitations, not hidden passing results. Final build/test streams and metadata use unique CreateNew capture. Full outer expiry was not deliberately triggered. No optional audit expansion was performed after covering Codec green.

## Exact final build identities


{"HostExe":"C:\\Users\\Andre\\AppData\\Local\\Temp\\omnira-launcher-build-a25477b81e07497bb80e8f3d97b80744\\SyntheticLauncher.exe","BuildRoot":"C:\\Users\\Andre\\AppData\\Local\\Temp\\omnira-launcher-build-a25477b81e07497bb80e8f3d97b80744","SourceDigests":{"NativeMethods.cs":"061f8283cc0f0c5cb2cc6087b08b760e5f1859b180b6f47180db311475161cf1","tests\\BoundaryTests.cs":"7ec548f1ff2d98485f06a82fca36999416d533c19f1e66332c51fb10c98b7719","PipeSession.cs":"53777623e512d2d90cdc20c9f2b11b87d97d12dca164e317a8371af4b91f633c","SyntheticProtocol.cs":"7cc7ff29cdfbf052879a5f0c53793c6618c1000b8fea0aa6c131ea1a8976aa2c","tests\\TestProgram.cs":"0dba42954330ab2e530ea61391071c21d876decfeb7b17c73ba7b606ccca1bee","tests\\CrashHarness.cs":"5588451385225301040261bf93a80bf62d304c11ba2799ed78ce1db4a9c51c75","tests\\LifecycleTests.cs":"063e45274745cc5ac383fcd83c2fed17501c4a8889824d5bf886c3fc58e2983d","Program.cs":"7524643016511acb661e216b9027ad9201254e54627a7866b094ea58997bfb6d","FixtureInput.cs":"dbca71aeb9951c818cf5c9819667ccddf56a875eb295d6ba3965e6fa5f97eff3","ObservationWriter.cs":"b1635b66d792a948b11a4633ee5aa627cc48242fc4676af5e8cc93cdf07c09be","Contracts.cs":"b2dd5a5c4b69ebf9fa643daea6b5f40c6c93b11698becf7b4f3e49cab20f7bec","WindowsProcessBoundary.cs":"f99d7eac91e9a0158ee3b5a4d2b99c7c94065b4bdd880988fd617a6a95f5b7a8","NativeResources.cs":"0b795e5697d304a3bc894fd210c3d72d15a0c181c956d67eeb0a6c52f43d0d43","tests\\CleanupTests.cs":"e38ebfe250dc86e887f44f01e81d4817298157b328821f41520f3ccfbbb3d6b7","tests\\ProtocolTests.cs":"9e746bb8aa43a9e38ba6331df32eea3c4b5609d5b8da971b0f1ecf76dec631e8","SyntheticRunner.cs":"cb363c1244223381a387fbf7d0f293e7052f0c38ee965f04f7a3e1aff355ed53","tests\\InputTests.cs":"429a834a3182c05fbb60b0461b1c44928c944b01e517243422425dec37458dd6"},"TestExe":"C:\\Users\\Andre\\AppData\\Local\\Temp\\omnira-launcher-build-a25477b81e07497bb80e8f3d97b80744\\SyntheticLauncher.Tests.exe","ReviewExe":"C:\\Users\\Andre\\AppData\\Local\\Temp\\omnira-launcher-build-a25477b81e07497bb80e8f3d97b80744\\LauncherReview.exe","ReviewTestExe":"C:\\Users\\Andre\\AppData\\Local\\Temp\\omnira-launcher-build-a25477b81e07497bb80e8f3d97b80744\\LauncherReview.Tests.exe","ReviewSourceDigests":{"build.ps1":"a3c3b50412fba10f4513de3826ee5c7e01528508ac73f6a5dd8169ddb4f0662d","PackageManifest.cs":"a274b0eb3961e6f450259410c7cb4270859d2b7110554c5cf4e731c88bc7872b","tests\\ManifestTests.cs":"950c46a1bb8024b8cf0b11ac35e47deb6ce7164d852f735fa34a1298184228eb","generated:ReleaseBuildContext.cs":"658a1caf0505f8fe6ff5a815fea06bd992c0be4b3b7441039842177a501a0a95","tests\\TestProgram.cs":"f0237322798f22a1a471708dd37e4a875777d125878dc85e38a5a38f66363c97","ReviewProgram.cs":"df8890fe8afd1c2c1fae39a8efe15f1146760ca4c5545cdb0e69d07228a95aea","tests\\run.ps1":"322d04f6826306e430f890ebd4f4db5c98818d4595467343567526663bd7193a","PackageContracts.cs":"b914775353f0df02678d1006e2a36ad42cad103ac60161136782ae46569ee9d2"}}
