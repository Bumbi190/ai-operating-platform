# Creative Launcher Release Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (selected) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and qualify an ordinary-user fixed-source package exporter and non-executing offline consistency verifier.

**Architecture:** A separate Framework64 executable compiles with the existing native declarations and host identity check but never invokes the P40 runner. Strict finite manifest handling, held native package files and export are separate units. Existing P40 source and CLI stay unchanged.

**Tech Stack:** Existing Framework64 csc, explicit Framework references, Windows x64, PowerShell5.1 wrappers, dependency-free C# tests. No installation or downloads.

**Spec:** docs/superpowers/specs/2026-10-22-creative-launcher-release-review-design.md at86471741ee257f6906f43039a85befca6d0ab9b9 / Draft515. André approved this design and explicitly asked to finish the work and supply a chat handoff summary on2026-10-22; preserve the previously selected independent implementer/reviewer method.

## Global Constraints

- Ordinary non-elevated Windows host outside AppContainer; refuse incompatible identity before creating/reading package resources. Never elevate worktree code.
- Exactly four package entries: owner.txt, SyntheticLauncher.exe, review-manifest.json, manifest.sha256; flat directory, host <=1048576 bytes, manifest <=65536 UTF8 bytes.
- Nonce32 lowerhex, SHA25664 lowerhex; JSON depth<=3 and<=64 properties per object. Strict UTF8/no BOM, unique decoded names, exact integer lexemes, exact schema, no unknown fields or trailing bytes.
- Existing fixed compiler C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe; /noconfig /nostdlib+ /platform:x64 /target:exe /optimize+; explicit mscorlib/System/System.Core/System.Runtime.Serialization references. No SDK/NuGet/Add-Type.
- Existing Node pin780f44f2c53c108bae261ada21a525b4bfe733c020ac85e41bfe94479090ac9b. Offline verification checks declared pin only; never follows package-provided runtime/source paths, loads an assembly, starts a process, imports a script or writes a package.
- Export builds only the fixed internal P40 sources. Export command copies only its own build-bound sibling SyntheticLauncher.exe; no caller executable/output/account/capability selector. Fresh owned ordinary Temp package, CreateNew files, flush, same-held-stream hash/copy and destination hash.
- Verifier accepts one canonical absolute local fixed-NTFS directory. Root and four leaves held noninheritable without write/delete sharing; ordinary types/no reparse/single-link leaves, exact identity/size/time before/after. Relative native leaf opens and handle-based bounded directory enumeration; do not enumerate by reopening a caller pathname.
- No existing P40 or broker/queue/editor/old handoff files changed. New files under scripts/creative-tools/launcher/review-package/. Existing native/input classes may compile as dependencies but their fixture-only adapters are not weakened.
- All nine authority fields readonlyfalse and serialized literalfalse: ActualWorkerTokenVerified,RootAclTrustVerified,NetworkEgressVerified,RealHumanApprovalVerified,ArbitraryBrokerContainmentVerified,GeneralExecutableTrustVerified,CreativeExecutionAuthorized,PublishAuthorized,ProductionReady. InstallationAuthorized,WorkerActivated,RuntimeProvenanceVerified,ExecutableStarted,ProtectedDestinationWritten remainfalse.
- Hash consistency is not authentication. A coherent forged package may be consistent but never trusted/authorized. The sibling manifest hash is not an external anchor.
- No protected writes/account changes/ACL/firewall/service/editor/network actions. Nine P40 preserved pairs and manual P41 packet excluded from deletion/adoption. Partial new exports may be preserved, reporting primary refusal and own incomplete output separately; no recursive cleanup or overwrite.
- Wrapper/test evidence uses unique fresh paths/CreateNew, retains original failures. Tests have owned45s outer bound. Do not rerun unchanged P40 native suites; run existing304 regression once at final integration.

## Review Focus

1. Correlated manifest+host tampering remains merely consistency, never approval; positive forged-data control.
2. Escaped duplicate JSON names and malformed integers reject before object materialization.
3. Directory/junction replacement or hardlink leaf cannot redirect held reads; native mutation controls and handle enumeration.
4. Partial export leaves exact owned incomplete evidence; unknown output is preserved, never overwritten/deleted.
5. Verifier is observational even for an apparent executable/embedded path or poisoned strings; no code load/process start or runtime-path access.

## File map and exact contracts

All new .cs use namespace Omnira.Creative.Review. Existing compiled dependencies remain Omnira.Creative.Synthetic and unchanged.

| File | Responsibility |
| --- | --- |
| PackageContracts.cs | immutable data/results, refusal codes, literalfalse authority |
| PackageManifest.cs | strict finite parser/canonical writer |
| PackageFiles.cs | native root/leaf ownership, bounded enumeration and same-handle reads |
| PackageVerifier.cs | read-only exact package consistency |
| PackageExporter.cs | fixed own-sibling export and incomplete observations |
| ReviewProgram.cs | exact CLI/report, no P40 entry changes |
| build.ps1 | invokes existing parent build, separately compiles tool/test with explicit sources and generated build-bound context |
| tests/TestProgram.cs | custom assertions/test entry |
| tests/ManifestTests.cs | strict codec/authority cases |
| tests/FileTests.cs | native verifier/read-only/path controls |
| tests/ExportTests.cs | build-bound export/integration cases |
| tests/run.ps1 | independently owned45s test process, unique captured evidence |

Interfaces:
- PackageManifest.Parse(byte[] bytes)->Manifest; PackageManifest.Encode(Manifest value)->byte[].
- Manifest immutable data; source-digest map copied, authorities never caller-settable.
- PackageSnapshot.Open(string absoluteDirectory)->PackageSnapshot : IDisposable; Read(string exactName,int maxBytes)->byte[]; root and all four leaves held through verification; enumerates exact entry set through held root. Holds <=oneMiB host buffer and bounded metadata, no path reopens.
- PackageVerifier.Verify(string absoluteDirectory)->ReviewResult. Reads only; result never grants authority; code enum/native number, no arbitrary exception/argument strings.
- PackageExporter.Export()->ReviewResult. Own sibling path and expected host/source/compiler observations are generated compiled ReleaseBuildContext constants by wrapper, not CLI inputs.
- ReviewEntry.Execute(string[] args,TextWriter output)->int. Exact --export OR --verify <absoluteDirectory>; exit0 only completed consistency/export+consistency, exit2 refusal; report<=32768 UTF8 bytes. Verifier paths do not echo in report; generated export location may be represented by nonce under fixed ordinary Temp prefix.

Automated manifest schema omnira.creative.launcher-review-package.v2 (manual v1 remains unchanged): exactly Schema,Nonce,SourceCommit,HostLength,HostSha256,RuntimeSha256,CompilerSha256,CompilerVersion,SourceDigests,Authorities,InstallationAuthorized,WorkerActivated. SourceCommit40 lowerhex; HostLength integer1..1048576; CompilerVersion numeric dotted <=64chars. SourceDigests has exactly the17 existing parent build SourceDigests keys (10 production shared/entry files plus7 qualification test files), lowercase hashes; these describe P40 artifact qualification sources, not permission or package tool source authentication. Keys are that fixed source list, never dereferenced. Authorities exactly the9 names/allfalse; InstallationAuthorized/WorkerActivated false. No timestamp/path field. owner.txt exactly32 ASCII nonce bytes; manifest.sha256 exactly64 ASCII bytes, hash of raw manifest bytes. Writer emits canonical UTF8/no BOM/no newline; parser allows JSON whitespace internally/leading but none after closing root. Bounded scanner validates decoded duplicates and integers before materializing values; no dictionary-first JSON parser.

Build returns original HostExe/TestExe/BuildRoot/SourceDigests plus ReviewExe/ReviewTestExe/ReviewSourceDigests; never replaces parent metadata. New package-only test hooks use REVIEW_TEST (not TEST), so unchanged P40 shared sources compile without their legacy test-hook dependencies. Generated test context is excluded from both production executables. New tool may include generated production ReleaseBuildContext with exact host SHA256, source commit/digests and compiler metadata; generated code is from fixed wrapper observations only, never package data. Use canonical escaped literals. Build wrapper is ordinary only and refuses unexpected compiler/runtime observations rather than downloading/updating.

## Task 1: Strict manifest and isolated tool build

**Files:** Create PackageContracts.cs,PackageManifest.cs,ReviewProgram.cs refusal-only stub,build.ps1,tests/TestProgram.cs,tests/ManifestTests.cs,tests/run.ps1 under review-package/.
**Consumes:** unchanged parent build and native shared source declarations; **Produces:** Manifest codec/contracts/build outputs and Codec suite, defined interfaces above.

- [ ] Write tests before implementation: ValidCanonicalRoundTrip,Utf8BomSurrogates,DuplicateEscapedAliases,UnknownMissingFields,CountLexemes,DepthPropertyBounds,FixedSourceKeysAndPins,AuthorityCannotGrant,CoherentForeignDataIsNotAuthority.
  Assert parse rejects duplicate Nonce including escaped alias, SourceDigests key aliases, true authority, unknown fields, 65537-byte manifest, depth4, property65, HostLength0/1048577/-1/1.0/1e0/leadingzero/string, bad hashes/runtime pin/SourceCommit and trailing data. Genuine max HostLength accepted as metadata without allocation. Unknown source names never trigger reads.
- [ ] Run tests Codec; retain meaningful compiler/runtime RED. Implement bounded purpose-built scanner/writer and immutable contracts. Stub CLI rejects until Tasks2/3.
- [ ] Implement explicit separate wrapper builds and finite test runner with unique file captures; parent files untouched. Tests may use shorter finite cases but outer45 unchanged.
- [ ] Run Codec green/build production; verify production excludes test classes, no emitted binaries tracked; git diff --check.
- [ ] Commit feat: define bounded release-review manifest and tool build; report exact commands/output/source hashes, interfaces and concerns.

## Task 2: Held-file offline verifier

**Files:** Create PackageFiles.cs,PackageVerifier.cs,tests/FileTests.cs; modify new ReviewProgram/build/tests dispatch only.
**Consumes:** Manifest/ReviewResult and generated context; **Produces:** PackageSnapshot/PackageVerifier and --verify.

- [ ] Write native tests: ExactPackageReadOnly,UnknownMissingNestedEntry,RootJunctionAndHardlink,NonCanonicalPath,MutationWhileHeld,ManifestHashAndHostMismatch,PoisonedPathNotFollowed,CorrelatedTamperingStillNoAuthority,IdentityRefusalBeforeOpen.
  Fixture uses fresh marked Temp only. Positive exact four entries/hash pair. Assert no byte/time/entry changes after verify; reject extra/absent/test exe/nested dirs/reparse/hardlink/ADS/UNC/dot paths and wrong nonce/hash/size. Held snapshot blocks native write/delete/rename with matching unpinned control then permits mutations after disposal. Replacing parent/root cannot change held reads. ReadBound rejects overrun/change; unknown data never removed. A coherent arbitrary-host-data package returns consistency only, all authorityfalse, no executable load.
- [ ] Run Files RED then implement native root-relative leaves and bounded held-root enumeration. Root canonical/final path/fixedNTFS, handle flags, metadata and volume checks; validate ABI/returned buffers/lengths. May add private native declarations in new PackageFiles.cs; do not refactor P40.
- [ ] Implement exact --verify path CLI and bounded redacted results, ordinary identity gate before resources. No argument echo/manifest paths used. Read all four held files through same handles, validate nonce+manifest hash+host metadata/hash and literalfalse authorities.
- [ ] Run Files+Codec green; production real --verify on own fixture and unsupported-argument refusal, assert original bytes unchanged. Retain actual observations/source digests; no AppContainer/P40 suite reruns.
- [ ] Commit feat: verify review packages through held native files; report interfaces/evidence/concerns.

## Task 3: Fixed-source export and final qualification

**Files:** Create PackageExporter.cs,tests/ExportTests.cs; modify only new ReviewProgram/build/tests files. Create docs/ATLAS_CREATIVE_P42_RELEASE_REVIEW.md and _OBSERVATION.json.
**Consumes:** generated host binding, Manifest writer and offline verifier; **Produces:** --export and exact evidence/handoff.

- [ ] Write tests: ExportOwnSiblingOnly,SourceDriftRefuses,CreateNewNoOverwrite,PartialExportPreserved,UnknownEntryPreserved,NoExecutionOrPrivilegedEffects,ExportThenVerify,PublicModesStrict,BoundedRedactedFailure.
  TEST seams compiled out production may inject stage failures/identity/source mismatch only; no public fault selector. Real copied host exactly build-bound bytes/hash/source/compiler; all4 entries, no test exe/runtime binary. Hash/copy from same source handle and flush destination. Reject changed source, existing candidate directory/leaf or malformed context; preserve incomplete own output and unknown entries, original refusal separate. Generated nonce/path only, verifier never receives write permission.
- [ ] Run Export RED then implement minimal exporter and exact --export CLI. Fresh output CreateDirectory uniqueness, CreateNew files, no overwrite. Verify completed package with same verifier after writer handles close; output consistency never grants trust. Use finite waits/bounds; no host start.
- [ ] Run new tests All (Codec/Files/Export independently45s), one actual production --export then actual --verify on its output; capture unique files/metadata, assert no executable invocation/protected/account mutations by implemented paths and authorityfalse. Record UTC, exact tool/hash/build manifest, export path privately and nonce/documented source identity, primary failures and partial ownership observations. Compare package bytes before/after --verify.
- [ ] Run existing creative304 regression once and existing P40 Cli suite only if shared integration concern is introduced (default no P40 source changes). git diff --check, product/old sources unchanged. Do not claim unrun P40 native suites ran.
- [ ] Document observations and actual limitations: ordinary-user writable packet/consistency only; actual installed runtime unverified; nine old preserved pairs/full45s expiry limitation unchanged. No protected copy/account/editor changes. Commit feat: export and qualify synthetic launcher review packages.

## Completion

Fresh task reviews (spec+quality) precede dependent tasks. Final whole-branch review on most capable available model, one final fix wave/scoped re-review if needed. Push own feature and create stacked Draft against feat/atlas-creative-p41-protected-handoff-design; no merge/deploy. Preserve packet/evidence for review. Final user handoff summarizes entire chat, actual checks, remaining protected install/runtime/worker/root/network/broker/human approval/PhotoCraft then FilmCraft gates, and any rulings with costs. User explicitly requested this handoff after completion; do not stop at the plan artifact.
