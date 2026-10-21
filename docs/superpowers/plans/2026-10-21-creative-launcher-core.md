# Synthetic Creative Launcher Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and qualify one compiled ordinary-user Windows launcher that reads an owned synthetic canary through pinned handles, sends bounded bytes to a fixed AppContainer Node child, validates its result, and verifies bounded shutdown and cleanup.

**Architecture:** A C# .NET Framework x64 host runs outside AppContainer. An internal native boundary owns the fresh profile, staged pinned Node image, explicit three-pipe inheritance list, creation-time job assignment and lifecycle. Fixture input, strict protocol and diagnostic reporting remain separate; no production broker integration is added.

**Tech Stack:** Existing fixed Windows Framework64 csc, explicit Framework references, Win32/NT APIs, installed pinned Node22.22.3, Windows PowerShell5.1 build/test wrappers, custom dependency-free C# tests.

**Spec:** `docs/superpowers/specs/2026-10-21-creative-launcher-core-design.md` at commit1218c915b666bae9ead5f969af73ac6671d6095e (P38 / Draft #510). André approved proceeding to this plan on2026-10-21. This plan still requires human review before implementation.

## Global Constraints

- Windows x64 ordinary user only; refuse elevation before fixture/profile creation. No installs, downloads, account activation, editor runs, existing ACL or firewall changes.
- Node22.22.3 SHA256: `780f44f2c53c108bae261ada21a525b4bfe733c020ac85e41bfe94479090ac9b`.
- One input <=64KiB; encoded request <=96KiB; stdout <=4KiB; stderr <=4KiB. Integer ranges bounded before allocation.
- Job: unnamed, noninheritable, KILL_ON_JOB_CLOSE, active-process limit4, no breakaway permissions; read back exact policy.
- Combined SECURITY_CAPABILITIES (zero capabilities), HANDLE_LIST (exactly3 real inheritable child pipe ends), JOB_LIST (exactly owned job); bInheritHandles=true.
- Creation suspended; exact job/image and AppContainer/package SID/caps0/Low IL4096/no elevation/no enabled administrator group checked before resume. No later AssignProcessToJobObject fallback.
- Parent pipe ends, job and input handles noninheritable. Close parent copies of child ends immediately after creation. Exclusive host spawn gate; reject concurrent/reentrant operation.
- Minimal explicit environment; exclude NODE_OPTIONS, module paths, proxies, tokens and project data. System32 cwd; builtin Node modules, --no-addons, no shell/network/imported repository JS.
- 30s monotonic operation budget: at most20s setup/running +10s reserved cancellation/pump shutdown/cleanup reporting; shared absolute deadlines. Independent harness45s outer bound.
- Fixed authored synthetic operation only. Public CLI accepts exactly `--synthetic-self-test`; no paths, commands, environment, account or capability options.
- State: Prepared -> InputPinned -> ProcessSuspended -> TokenAndJobVerified -> Running -> ProducersStopped -> ResultVerified -> Cleaned; failure enters Refused without skipping cleanup evidence.
- ActualWorkerTokenVerified, RootAclTrustVerified, NetworkEgressVerified, RealHumanApprovalVerified, ArbitraryBrokerContainmentVerified, GeneralExecutableTrustVerified, CreativeExecutionAuthorized, PublishAuthorized, ProductionReady remain false.
- Preserve historical P32-P36 sources/evidence. Do not change local-broker's false gate, handoff inventory, queue wiring or protected deployment.
- Unsupported native combination/ABI is explicit refusal, never skip-as-pass, broad inheritance, unrestricted launch or permissive ACL repair.

## Review Focus

1. Numeric handle reuse: compare underlying sentinel objects after bounded duplication from the exact held child; a reused integer must not count as inheritance proof (Task1).
2. Descendant holds a stdout writer after parent exit: drain/stop must remain bounded and report failure, never accept partial output (Task4).
3. Partial setup failure after profile creation: preserve original failure stage and independent cleanup outcome (Task5).
4. Child has emitted valid JSON but is still running: success requires terminal producers, exit and completed pumps (Task4).
5. Unexpected fixture entry during cleanup: preserve it and report cleanup unverified; never recursively remove it (Task5).

## File map and shared contracts

All new implementation files live under `scripts/creative-tools/launcher/`.
No existing product file is modified. Build artifacts live only in an owned ordinary Temp build directory; commit no executables.

| File | Responsibility |
| --- | --- |
| build.ps1 | Fixed compiler, exact source/reference manifests, two separate executables |
| Contracts.cs | Internal immutable observations, refusal codes, budgets and interfaces |
| NativeMethods.cs | Native declarations/ABI checks only |
| NativeResources.cs | SafeHandle/buffer ownership and disposal |
| WindowsProcessBoundary.cs | Profile, runtime, job, pipes, spawn and token checks |
| FixtureInput.cs | Owned fixture and P32-derived same-handle bounded reads |
| SyntheticProtocol.cs | Exact bounded request/result encoding and verification |
| PipeSession.cs | Concurrent bounded stdin write and stdout/stderr drains/cancellation |
| SyntheticRunner.cs | Single-operation state machine and lifecycle |
| ObservationWriter.cs | Bounded diagnostic JSON without content/raw stderr/authority |
| Program.cs | Strict production-executable synthetic entry point |
| tests/TestProgram.cs | Separate compiled test entry, suite dispatch and assertions |
| tests/BoundaryTests.cs | Attribute/handle/token/native controls |
| tests/InputTests.cs | Native input/path/mutation controls |
| tests/ProtocolTests.cs | Strict wire format and bounds |
| tests/LifecycleTests.cs | Backpressure, cancellation, exit and ownership failures |
| tests/CleanupTests.cs | Exact fixture/profile cleanup and preservation |
| tests/CrashHarness.cs | Independently held host/member handles and phase barriers |
| tests/run.ps1 | Fixed test binary invocation and bounded outer watchdog |

Shared namespace: `Omnira.Creative.Synthetic`. Internal test types are compiled into the TEST executable only; never add a fault-mode CLI to Program.cs.
Contracts.cs defines:
- `OwnedFixture : IDisposable`: identity, exact expected entries, generated profile name and fixture nonce; created only internally.
- `CanaryInput`: copied `byte[] Bytes`, `string Sha256`; input pathname/handles are never child parameters.
- `RequestExpectation`: `string Nonce`, `int ByteCount`, `string Sha256`.
- `OperationBudget`: monotonic start, `int RunRemainingMs`, `int CleanupRemainingMs`; every wait consumes the same absolute endpoints.
- `BoundarySession : IDisposable`: held process/thread/job, parent pipe ends, expected profile SID/runtime identity and observed members; no transfer of the job to the child.
- `CapturedStreams`: immutable stdout/stderr bytes and complete/overflow/pump-failure observations, bounded during capture.
- `RunObservation`: `bool Passed`, `string FailedStage`, `string RefusalCode`, separate `CleanupObservation Cleanup`, limits/timing/token/job metadata and the fixed false authority fields.
- `CleanupObservation`: `bool ProcessesStopped`, `bool PumpsStopped`, `bool FixtureAbsent`, profile delete API/storage/mapping observations, preserved-artifact identities; incomplete evidence is false.
- `SyntheticRefusal : Exception`: stable `Code`, optional bounded native error number; no arbitrary diagnostic text.

Tests use `Assert.True`, `Assert.Equal<T>`, `Assert.Refuses(string, Action)` supplied in TestProgram.cs. No external test package.
build.ps1 outputs one JSON object containing HostExe/TestExe/BuildRoot and source digests. Compile shared files twice with distinct explicit entry points. Production excludes all tests; tests exclude Program.cs. No wildcard source discovery, runtime Add-Type or dynamic source compilation.
Use `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`, /noconfig /nostdlib+ /platform:x64 /target:exe /optimize+ and explicit references to mscorlib.dll, System.dll, System.Core.dll, System.Runtime.Serialization.dll in the same Framework directory. No SDK8 selection.
Use a bounded purpose-specific UTF8 JSON lexer in SyntheticProtocol for the flat three-field schemas. Inspect raw integer lexemes/property names before materializing values, so duplicates and exponent/fraction counts cannot be normalized away. Support standard JSON escapes, compare decoded field names, reject unpaired surrogates and escaped duplicate aliases. No dictionary-first parser or child JSON.parse before duplicate detection. The fixed Node payload carries the same flat-schema scanner, exercised by malformed vectors; add no dependency.

## Task1: Qualify the combined native boundary first

**Files:** Create build.ps1, Program.cs (refusal-only bootstrap), Contracts.cs, NativeMethods.cs, NativeResources.cs, WindowsProcessBoundary.cs, tests/TestProgram.cs, tests/BoundaryTests.cs, tests/run.ps1.
**Interfaces:** `WindowsProcessBoundary.CreateSuspended(OwnedFixture fixture, OperationBudget budget) -> BoundarySession`; `BoundarySession.VerifyBeforeResume() -> void`; `BoundarySession.Resume() -> void`. Internal test-only `BoundaryTests.Run() -> void`.
Task1 defines internal `WindowsProcessBoundary.PrepareOwnedFixture() -> OwnedFixture` for fresh identity/runtime scaffolding; Task2 moves this exact setup into FixtureInput.CreateOwned and updates callers. Task1 uses a fixed small stdio qualification payload, replaced by Task3's strict canary payload. The allowed-sentinel positive control adds one handle only in the test executable; production always requires exactly three pipe ends and exposes no override.

- [ ] **Step1: Write failing native tests** in BoundaryTests.cs, with compiled test-only payloads exercising the actual production CreateSuspended method.
  `CombinedAttributesRoundTrip`: assert expected AC token, exact job at first return, three functioning streams and EOF.
  `SentinelControls`: excluded inheritable event must not match the original event object after exact-child duplication; deliberately allowed test-only positive control must match. Close every positive-control duplicate writer before EOF. Assert numeric equality alone cannot pass.
  `PreResumeMismatchRefuses`: wrong expected SID/image/job, nonzero capabilities and unexpected job flags each refuse before Resume.
  `SpawnGateRejectsReentry`: second/reentrant operation refuses while first is active; failure releases gate.
  `NoBroadInheritanceFallback`: unsupported attribute creation refuses with native error; no unrestricted second process is created.
```csharp
// PreResumeMismatchRefuses: held session is suspended; test-only SID mismatch selected.
Assert.Refuses("pre-resume-token-mismatch", () => session.VerifyBeforeResume());
```

- [ ] **Step2: Run** `& .\scripts\creative-tools\launcher\tests\run.ps1 -Suite Boundary`. Expected initially: nonzero explicit missing build/source error; preserve this red result.
- [ ] **Step3: Implement** listed signatures and fixed build harness. Port narrow ABI/token/job ownership mechanics from P34/P36 evidence, but create an attribute list of THREE entries, including JOB_LIST at CreateProcess. Program.Main initially returns exit2 without creating resources for every argument; test executable exercises the boundary until Task6 exposes the complete operation. Verify the compiled ordinary host starts and refuses. Use SafeHandles and finally disposal; all native allocations have one owner. Validate x64 sizes before creating resources. Stage fixed Node with CreateNew/flush/hash and observed inherited package RX; minimal env has SystemRoot/WINDIR and System32 PATH only. No profile, input or runtime path comes from caller options.
- [ ] **Step4: Run** the same Boundary command on Hultgren ordinary session. Expected: exit0, `Suite=Boundary, Passed=true, Skipped=0`, actual compiled host outside AC, real child token/stdio/job/sentinel evidence and complete cleanup. Hash and report both compiled executables. Unsupported combination is STOP: no downstream tasks until revised design is reviewed.
- [ ] **Step5: Commit** only listed new sources: `feat: qualify explicit AppContainer pipes and creation-time job boundary`. Require independent native-boundary review before Task2; keep reported platform failures intact.

## Task2: Integrate owned pinned input

**Files:** Create FixtureInput.cs and tests/InputTests.cs; modify build.ps1 explicit manifests, Contracts.cs/WindowsProcessBoundary.cs only to move the Task1 fixture bootstrap into FixtureInput without changing its behavior.
**Interfaces:** `FixtureInput.CreateOwned() -> OwnedFixture`; `FixtureInput.ReadCanary(OwnedFixture fixture) -> CanaryInput`. Internal `PinnedRoot.OpenRead(string relative) -> PinnedRead`, `PinnedRead.ReadBounded(int max) -> byte[]`, IDisposable ownership as P32.
Consumes Task1 owned identity/runtime scaffolding. Runner will consume copied bytes only.

- [ ] **Step1: Write failing tests** `NestedSameHandleRead` (exact canary bytes and SHA256), `PinnedMutationControls` (unpinned root/parent rename, leaf delete/write succeed; pinned attempts fail sharing violation32; disposal restores controls), `PathAndLinkRefusals` (junction/hardlink positive controls first, then refusal; reject ../, ADS, UNC, device path, CON.txt, backslash, trailing dot, >5 components, >64-character component), `ExactReadBounds` (65536 succeeds,65537 refuses; read-after-disposal/repeated read refuses), `NoSourceHandlesInherited` (new input handles noninheritable and excluded from list).
```csharp
// ExactReadBounds: test fixture builder created a 65537-byte leaf.
using (PinnedRead read = root.OpenRead("input/sample.txt"))
    Assert.Refuses("file-size-rejected", () => read.ReadBounded(65536));
```

- [ ] **Step2: Run** `& .\scripts\creative-tools\launcher\tests\run.ps1 -Suite Input`; expected FAIL due missing reader, not a skipped platform test.
- [ ] **Step3: Implement** FixtureInput from P32 native relative NtCreateFile rules: OBJ_DONT_REPARSE/FILE_OPEN_REPARSE_POINT, held root/parent/leaf chain, NTFS fixed canonical root, final identity/type/link checks and before/after size/write-time checks, same-handle read/hash. Bound allocations before reading. Internally generated fresh fixture only; no public arbitrary root adapter.
- [ ] **Step4: Run** Input and Boundary suites. Expected exit0, zero skipped, exact controls/mutation refusals and cleanup evidence from new core, unrelated canary unchanged.
- [ ] **Step5: Commit** `feat: read synthetic launcher input through pinned native handles`.

## Task3: Enforce the exact synthetic protocol

**Files:** Create SyntheticProtocol.cs and tests/ProtocolTests.cs; modify build.ps1 explicit manifests.
**Interfaces:** `SyntheticProtocol.EncodeRequest(CanaryInput input, string nonce) -> byte[]`; `SyntheticProtocol.VerifyResult(byte[] stdout, RequestExpectation expected) -> void`; `SyntheticProtocol.FixedNodePayload -> string` (authored constant only).
Wire request fields exactly `nonce` (32 lowercase hex chars), `byteCount` (integer0..65536), `bytesBase64` (canonical standard base64). Result exactly `nonce`, `byteCount`, `sha256` (64 lowercase hex chars). No BOM; exactly one object; no trailing bytes, including whitespace. Properties may arrive in any order but once each. No nested values/coercion/exponent/fraction counts.

- [ ] **Step1: Write failing tests**:
  `ExactRoundTripVectors`: empty, one-byte and65536-byte inputs produce matching count/hash/nonce.
  `RejectMalformedProtocol`: invalid UTF8, BOM, duplicate/unknown/missing names, nested values, trailing object/byte/whitespace, invalid/noncanonical base64 in child request, escaped duplicate names/unpaired surrogates, count -1/65537/fraction/exponent/string, wrong nonce/hash all refuse.
  `BoundBeforeAllocation`: request<=98304, input<=65536, result<=4096; oversized encoded/decoded values refuse without allocating their declared size.
  `AuthoredPayloadOnly`: fixed payload uses builtin crypto and stdio only; no imported script, shell, network or input-dependent eval.
```csharp
// RejectMalformedProtocol: expected comes from the valid vector.
Assert.Refuses("protocol-schema", () => SyntheticProtocol.VerifyResult(
    Encoding.UTF8.GetBytes("{\"nonce\":\"x\",\"nonce\":\"x\"}"), expected));
```

- [ ] **Step2: Run** Protocol suite; expected FAIL for missing codec.
- [ ] **Step3: Implement** exact signatures using strict UTF8 and token-level schema validation, bounded count and canonical base64 re-encoding comparison. SHA256 is over decoded bytes. Fixed Node payload caps request while reading, performs same strict schema/nonce/count checks, emits only the exact result object and exits0. No input in argv/env/AC input file.
- [ ] **Step4: Run** Protocol suite plus Boundary with fixed payload. Expected exit0, all vectors and malformed cases exercised; no raw input or stderr in test evidence.
- [ ] **Step5: Commit** `feat: enforce bounded synthetic canary protocol`.

## Task4: Bound pumps and process lifetime

**Files:** Create PipeSession.cs, SyntheticRunner.cs and tests/LifecycleTests.cs; modify build.ps1 manifest and Contracts.cs observations.
**Interfaces:** `PipeSession.Start(BoundarySession session, byte[] request, OperationBudget budget) -> PipeSession`; `PipeSession.CompleteAfterStop() -> CapturedStreams`; `PipeSession.CancelAndJoin() -> void`; `SyntheticRunner.RunSynthetic() -> RunObservation`.
BoundarySession adds `StopOwnedJob(OperationBudget budget) -> void`, `ObserveMembers() -> void`, `WaitForObservedExit(OperationBudget budget) -> bool`. Only held exact-job members may be stopped. Tests use internal compile-only payload/phase seams; no production switches.

- [ ] **Step1: Write failing tests** `ConcurrentPipeBackpressure` (65536 input, simultaneous stdout/stderr drains), `FloodEachStream` (4097 bytes stdout or stderr refuses during read), `StalledReader` (no stdin consumption cancels/joins), `EarlyExit` (broken pipe refuses without hang), `ValidJsonStillRunning` (cannot pass), `DescendantWriterHeldOpen` (owned descendant keeps writer; bounded failure stops job and joins pumps), `TokenFailureNeverResumes`, `UnknownJobMemberRefuses`, `SharedDeadlineDoesNotAccumulate` and `NoPumpOutlivesRun`.
```csharp
// NoPumpOutlivesRun: test-only stalled-reader stimulus was corroborated.
Assert.Equal(false, observation.Passed);
Assert.Equal(true, observation.Cleanup.PumpsStopped);
```

- [ ] **Step2: Run** Lifecycle suite; expected FAIL for missing runner/pump.
- [ ] **Step3: Implement** runner state transitions, concurrent owned I/O threads, per-stream caps and native cancellation. Use dedicated threads (not pooled threads), held native thread handles with THREAD_TERMINATE rights, a stop flag checked before each new I/O, and CancelSynchronousIo plus job-stop/writer-close orchestration. Cancellation is not completion: handle ERROR_NOT_FOUND and normal/aborted/error races, repeat cancellation while blocked within the shared deadline, and join before disposing buffers/handles. CancellationToken alone does not cancel blocking native I/O. If this cannot be proven with anonymous pipes, stop for revised I/O design. Never return with live pumps; fail-stop the owned host if reserved cleanup budget cannot join. Native membership/held image/token guards follow P34/P36, bounded job limit4, unknown members refuse. Success requires expected exit0, terminal streams/producers before protocol verification.
- [ ] **Step4: Run** Lifecycle, Boundary, Input, Protocol suites. Expected exit0 with each adversarial stimulus corroborated, 20s running/30s total software deadlines respected in observations; test harness45s bound remains independent.
- [ ] **Step5: Commit** `feat: bound synthetic launcher streams and owned process shutdown`. Independent lifecycle review before Task5.

## Task5: Verify cleanup and supervisor crash behavior

**Files:** Create tests/CleanupTests.cs, tests/CrashHarness.cs; modify FixtureInput.cs, WindowsProcessBoundary.cs, SyntheticRunner.cs, tests/run.ps1 and explicit build manifest.
**Interfaces:** `FixtureInput.CleanupOwned(OwnedFixture fixture, OperationBudget budget) -> CleanupObservation`; `WindowsProcessBoundary.CleanupProfile(OwnedFixture fixture, OperationBudget budget) -> CleanupObservation`; `CrashHarness.Run() -> void`.
Harness owns the exact compiled test-host process handle and phase barriers. It knows fixture/profile identity before child creation, holds verified member handles where available, closes diagnostic job duplicates BEFORE terminating the host. Barriers exist in test executable only.

- [ ] **Step1: Write failing tests** `PartialSetupFailures` (after profile create/runtime stage/pipe create/process create/token verification; preserve primary stage plus cleanup independently), `UnknownFixtureEntryPreserved`, `FixtureIdentityReplacementRefusesDeletion`, `ProfileDeleteCorroboration` (API/storage/mapping all necessary), `UnverifiedChildKeepsCleanupFalse`, `UnrelatedCanaryUnchanged`.
  Crash cases: `BeforeCreate`, `AfterCreateBeforeResume`, `AfterReady`. Include retained-job-handle positive control proving an observer-held duplicate would keep children alive; close it before kill-on-close assertions. Native held members must signal on last-job-handle close. Before-create barrier must show no child created. Immediately-after-create case must corroborate exact membership while suspended, release all extra job handles, terminate only held host, and observe no live/suspended orphan through held process evidence. A forced host death is recorded as failed/incomplete cleanup, not a successful run.
```csharp
// UnknownFixtureEntryPreserved: unknownPath belongs to this test fixture.
Assert.Equal(false, cleanup.FixtureAbsent);
Assert.Equal(true, File.Exists(unknownPath));
```

- [ ] **Step2: Run** Cleanup and Crash suites; expected FAIL for missing exact cleanup/crash hooks.
- [ ] **Step3: Implement** bounded known-entry deletion with ownership/identity/reparse validation, no recursive deletion. Unknown entry/evidence failure preserves fixture. DeleteAppContainerProfile requires API success plus package storage and mapping absence. Crash harness independently verifies exact host/member identities, token/image/job and phase; any45s outer timeout stops only its owned host and preserves incomplete cleanup. Scoped follow-up cleanup is separate and never overwrites failed-run evidence.
- [ ] **Step4: Run** Cleanup/Crash plus all prior suites. Expected exit0 for asserted cases, zero skipped; forced-run observations remain failed with separate corroborated member exit and any later scoped cleanup. No by-name/by-PID-only process termination.
- [ ] **Step5: Commit** `test: verify synthetic launcher cleanup and supervisor crash boundaries`.

## Task6: Ship the diagnostic entry and regression evidence

**Files:** Modify Program.cs; create ObservationWriter.cs, `docs/ATLAS_CREATIVE_P40_LAUNCHER_CORE.md`, `docs/ATLAS_CREATIVE_P40_LAUNCHER_CORE_OBSERVATION.json`; modify tests/TestProgram.cs and build.ps1 only for CLI/report tests. P40 names identify the planned implementation follow-up; no claim it has run yet.
**Interfaces:** `Program.Main(string[] args) -> int`; `ObservationWriter.Write(RunObservation observation, TextWriter output) -> void`. Exit0 only for complete success; exit2 for refused/failed run; unsupported/unknown CLI arguments exit2 before fixture/profile creation.

- [ ] **Step1: Write failing tests** `CliIsSyntheticOnly` (no args/unknown/extra/path/account flags refuse before resources), `ElevatedHostRefusesBeforeSetup` (inject internal identity provider in test only; never run worktree code elevated), `ReportCannotGrantAuthority` (all nine fixed fields false on success and every failure), `ReportIsBoundedAndRedacted` (<=32768 UTF8 bytes, no input bytes/raw stderr/credentials; limited enum stages/native numbers), `NoProductImports` (broker/queue/editor files do not import launcher).
```csharp
// ReportCannotGrantAuthority: apply to every success/failure vector.
Assert.Equal(false, observation.ProductionReady);
Assert.Equal(false, observation.CreativeExecutionAuthorized);
Assert.Equal(false, observation.PublishAuthorized);
```

- [ ] **Step2: Run** CLI suite; expected FAIL for absent entry/report.
- [ ] **Step3: Implement** exact CLI and reporting signatures. Public entry accepts only --synthetic-self-test and internally creates everything. No fixture-name or fault selector. Report success, failed stage, cleanup, sizes/digests, host/runtime hashes, token/job/limits/timing and explicit authority false. Document observed failures without promoting historical probes.
- [ ] **Step4: Verify** `& .\scripts\creative-tools\launcher\tests\run.ps1 -Suite All` yields exit0, Skipped=0, every suite passed. Build production host separately; run returned HostExe with --synthetic-self-test once; exit0 only with complete new-core canary/exit/pump/cleanup evidence. Record exact command, UTC, ordinary identity, OS/runtime/compiler/Node versions and hashes. If qualification fails, record refusal and STOP; do not publish success.
- [ ] **Step5: Run existing creative regression** from repo root: `& 'C:\Program Files\nodejs\node.exe' --test scripts/creative-tools/*.test.mjs`. Expected current baseline304 tests pass0 failures0 skipped, plus any deliberately added tests; investigate actual discrepancy. Verify local-broker gate and authority tests unchanged, git diff --check clean; no artifacts committed.
- [ ] **Step6: Commit** `feat: expose synthetic launcher self-test and record native evidence`. Request independent whole-branch review of actual diff and evidence before Draft handoff. Push and create stacked Draft only; no merge, deploy, live queue or worker activation.

## Execution and review handoff

This plan is documentation only. Recommended execution method: subagent-driven with serial implementation tasks and a fresh reviewer at each gate, because native ownership contracts and crash failure paths make an unnoticed mistake costly. Do not run tasks concurrently against shared sources or fixtures. Human chooses method before execution; native execution is the lower-overhead alternative with whole-branch independent review.

Task1 native qualification is the first blocking implementation gate. A passing older probe, passing unit test or plausible JSON cannot substitute for it.
No privileged account/deployment/network/human approval work is included.

Self-review: every P38 acceptance row maps to Tasks1-6; all five Review Focus items have named owning tests; signatures and byte/time values were checked across task interfaces. Only plan text has been written; no build, runtime test, account or editor action was performed for P39.

Primary I/O references checked2026-10-21: https://learn.microsoft.com/en-us/windows/win32/fileio/canceling-pending-i-o-operations and https://learn.microsoft.com/en-us/windows/win32/api/ioapiset/nf-ioapiset-cancelsynchronousio . Native cancellation never substitutes for observed terminal completion.
