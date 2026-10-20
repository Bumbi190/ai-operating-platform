# Windows Host Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Windows broker a truthful, tested qualification report for its fixed tools, project directories and local Docker Desktop connection before any workspace or code execution is enabled.

**Architecture:** A separate dependency-free Windows helper inspects fixed source-owned targets using native handles/ACLs, then performs two read-only Docker API requests through a verified local pipe connection. A TypeScript facade validates its closed report. This report describes observations and never grants authority or enables the existing execution substrate.

**Tech Stack:** Existing Node/TypeScript/Vitest; installed .NET SDK 8.0.204; Windows handle/security/process APIs; .NET HTTP over NamedPipeClientStream. No external .NET packages, paid service or new agent framework.

**Spec:** docs/superpowers/specs/2026-10-18-atlas-first-code-job-design.md (approved 2026-10-18), section 1. Prior implementation/report: docs/verification/2026-10-18-windows-broker-identity.md.

## Global Constraints

- Preserve the already selected Native execution method: implement inline, one independent whole-branch review at the end.
- Base this plan on local branch codex/atlas-code-worker-design-20261018, verified predecessor 60ff708df9e3b7f2757d5c924e09fed625355ea1. Do not merge, push, enroll or deploy merely to execute this plan.
- First repository remains Omnira only. Paths, tool locations, daemon endpoint and inspection operations come from source, never a job, model, HTTP body, CLI path or environment.
- This plan is READ-ONLY for real project files, ACLs, installed tools and Docker state. It creates only its own build output and test fixtures.
- Production helper accepts exactly one argument: qualify. It cannot run shell/Git, create a worktree, create/start/remove a container, pull images, write files/ACLs or access credentials/CNG keys.
- Existing Mac/Linux isolation behavior, command grammar and production admission guards remain unchanged.
- Native helper execution: fixed dotnet path and package-relative DLL, shell false, 15000 ms, max 262144 output bytes. Docker connection timeout 1500 ms; HTTP request deadline 5000 ms; response body limit 131072 bytes per response; no redirects/proxy/network sockets.
- A positive result is qualified_for_health_probe, never ready_for_code_work. Missing/unproven native evidence is blocked; an unavailable helper is reported separately. No boolean from a report is a runtime capability.
- No full-repository test run, new CI job, paid API probe, dependency installation, image pull or machine permission change. Report the known broader baseline and actual OS coverage honestly.
- Later jobs retain two worker iterations, eight changed files, 131072 diff bytes and 1200 seconds; this plan does not activate those jobs.

## Review Focus

1. Junctions, device paths, alternate streams and case aliases must not let a fixed target refer to another object. Task 1 covers native handles and synthetic fixtures.
2. Ordinary Windows drive ancestors permit creating unrelated children; accept that without accepting rights to replace or alter a protected target. Task 1 separates ancestor and immediate-parent policy.
3. A pipe bearing Docker's name may belong to another process. Verify the actual connection before any HTTP request, not just an earlier probe of the same name. Task 2 owns this.
4. A legitimate Docker restart can invalidate a snapshot. A report is observation only; stale/failed connections block and are never reused as execution authority. Tasks 2/3 cover this.
5. Missing files, changed executable hashes, malformed/truncated output, timeout and wrong-platform invocation must fail closed without repairing installations or permissions. Tasks 1/3/4 cover this.

---

## Scope and observed environment

Previous Windows identity/diagnostic implementation is complete locally: 116 focused tests including five native tests, both typechecks, one independent review. Its three deferred minor items remain documented and are not bundled into this work.

Read-only observations on 2026-10-18:
- Fixed Git/Docker files have valid Windows signatures; Git publisher is Johannes Schindelin, Docker publisher Docker Inc.
- Repository/worktree parents grant the sandbox-users group read/execute rather than write.
- Connecting anonymously to the fixed dockerDesktopLinuxEngine pipe and calling GetNamedPipeServerProcessId returned com.docker.backend.exe from the fixed Docker Desktop installation.
- Docker reports Linux with a microsoft-standard-WSL2 kernel. This is not independent VM attestation.
- The pinned Alpine health-probe image is absent. It is not pulled in this plan.

This plan qualifies the host only. Windows worktree/Git hardening, sandbox health execution, named-volume materialization, patching/testing and job orchestration follow. Keeping these separate avoids admitting code execution on the strength of metadata alone.

## File map and contracts

Create native project under apps/code-broker/native/windows-host/:
- OmniraBrokerHost.csproj: net8.0-windows, UseAppHost=false, no PackageReference; exclude smoke/**/*.cs. Build as a library for Tasks 1–2, executable when Task 3 adds the closed entrypoint.
- HostProfile.cs: immutable fixed target registry, hash pins and owner policy.
- NativeFileEvidence.cs: read-only handles, final normalized paths, reparse tags, file identities and DACL projection.
- HostPolicy.cs: pure target/owner/ACL/pin decisions.
- NativePipeEvidence.cs: identify the peer of an already connected stream and retain process/stream handles.
- DockerObservation.cs: verified pipe and closed GET /version and GET /info.
- HostQualification.cs: compose target and Docker observations into the closed report.
- Program.cs: exact qualify parser, bounded JSON projection, generic errors.
- smoke/Smoke.csproj and Program.cs: native synthetic fixture tests and real qualification assertions.

Create TypeScript:
- apps/code-broker/src/isolation/windows/host-qualification.ts: fixed helper launch, strict projection validation, explicit blocked status.
- apps/web/lib/qa/sdf-windows-host.test.ts: portable contract/protocol/structure tests.
- apps/web/lib/qa/sdf-windows-host-native.test.ts: opt-in native helper, fixtures and real read-only observation.
- docs/verification/2026-10-18-windows-host-qualification.md: real source, results, limitations, next gate.

Modify only setup/test boundaries where needed:
- apps/code-broker/package.json: native:build:windows-host script.
- apps/code-broker/.gitignore: native/windows-host/**/bin and obj; .native already ignored.
- apps/web/lib/qa/sdf1c-trusted-broker.test.ts: exact child_process importer list adds the single host-qualification module. Keep the no-model/no-execution and six-route assertions.
- No changes to web repository authority registry, database, broker signer or operational endpoints.

Native internal records:
- TargetDefinition(string Id,string Path,bool IsDirectory,string? PinnedSha256).
- ComponentEvidence(string CanonicalPath,string FileIdHash,string OwnerSid,AceEvidence[] Aces,bool IsDirectory,bool IsReparsePoint,bool CaseSensitiveDirectory).
- TargetEvidence(string TargetId,ComponentEvidence[] Components,string? Sha256). Components are ordered drive root to target; each component is inspected and evaluated with its own descriptor.
- AceEvidence(string Kind,string Sid,uint Mask,bool InheritOnly).
- ObjectDecision(bool Allowed,string[] Reasons).
- PeerEvidence(int ProcessId,string ProcessIdentityHash,string ImagePath,string ImageHash,string UserSid).
- OwnedPipeObservation: IDisposable, containing the actual NamedPipeClientStream, retained process handle and PeerEvidence. Disposal closes only its own handles.
- DockerEvidence(string BackendImageHash,string BackendIdentityHash,string OsType,string OperatingSystem,string KernelVersion,string Name,string DaemonIdentityHash).
Raw ACLs, SIDs and paths remain inside the helper. Public JSON exposes only target ids, hashes, closed status/reason codes and the bounded Docker fields below.

Public JSON:
- schema: sdf.windows_host_qualification.v1
- profileId: andre_desktop_windows_v1
- status: qualified_for_health_probe | blocked
- observedAt: UTC ISO timestamp
- targetChecks: exact ids git,docker,backend,dotnet,checkout,worktree_parent; each {id,ok,identityHash:string|null,reasons}; null identityHash only for a failed/unreadable target
- docker: null or {backendIdentityHash,daemonIdentityHash,osType,provider,kernelFamily}
- reasons: array of closed reason tokens; no arbitrary provider/error text
Docker provider is docker_desktop_wsl2; kernelFamily is microsoft_wsl2. Both are local correlated observations, not hardware attestation.

## Task 1: Fixed target registry and native path/ACL proof

**Interfaces**
- Produces HostProfile.Targets, NativeFileEvidence.Inspect(TargetDefinition target), HostPolicy.Evaluate(TargetEvidence evidence,TargetDefinition expected,string userSid):ObjectDecision.
- Native reads use metadata/read-control access and never request write rights. Normalize each source-owned slash-separated path with Path.GetFullPath before native comparison; no user path enters the registry.
- Fixed paths:
  git: C:/Program Files/Git/cmd/git.exe
  docker: C:/Users/Andre/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe
  backend: C:/Users/Andre/AppData/Local/Programs/DockerDesktop/resources/com.docker.backend.exe
  dotnet: C:/Program Files/dotnet/dotnet.exe
  checkout: C:/Users/Andre/Projects/Omnira/Code/ai-operating-platform
  worktree_parent: C:/Users/Andre/Projects/Omnira/.worktrees
- SHA256 pins:
  git bd1bf0469426e2e67a27300176303b5e43e1dda81babc1c24c9c2ce627b97960
  docker 6c699720bb9523dedb9eb5d22a49951ea9210dbdb1314a3554029eee9be76896
  backend 37deeeae5bf632014b22fc6487cb9a531072f8d32d062acf6982a914fa6e8585
  dotnet 7967467e8bad9c686de2ab2c1994112d5331a7c3d20f0b8a4fff7480221a1c37
A legitimate update changes a pin and blocks until a separately reviewed profile update. Never auto-learn a replacement hash.

- [ ] Write smoke tests for correct fixed targets, foreign owner, null/unknown DACL, untrusted WriteData/AppendData/Delete/DeleteChild/WriteDac/WriteOwner/WriteAttributes/WriteEA, inherit-only ACEs and a changed hash. Assert protected target + parent refuses untrusted mutation; higher ancestors permit CreateFile/CreateDirectory alone but refuse delete/replace/ACL/reparse-relevant rights.
- [ ] Run native build/tests and observe missing policy/evidence implementation fail.
- [ ] Implement metadata handles with FILE_FLAG_OPEN_REPARSE_POINT and FILE_FLAG_BACKUP_SEMANTICS; inspect every component including ancestors, GetFinalPathNameByHandleW and FileAttributeTagInfo. Reject all reparse tags, UNC/device/extended-prefix input, ADS, dot/traversal components, trailing dot/space, short-name alias and case-sensitive directories. Compare the handle's normalized DOS path using OrdinalIgnoreCase after stripping only the API-returned DOS prefix. Hash file identity from volume serial + file id; never trust lexical containment alone.
- [ ] Implement conservative DACL evaluation. Trusted writers/owners: current user SID, LocalSystem S-1-5-18, Administrators S-1-5-32-544 and TrustedInstaller service SID S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464. Expand generic masks before checking. Ignore inherit-only ACEs for the current object. Do not use a deny ACE to optimistically cancel an unsafe allow ACE. Unknown/object/conditional ACE kinds or an unreadable descriptor block.
- [ ] Test real fixture junction/reparse handling, deliberately unsafe ACLs and a path containing spaces. Fixtures live only under a harness-owned random directory and cleanup touches only that directory. Keep real machine ACLs unchanged.
- [ ] Run native smoke green and commit feat(broker): add fixed Windows host object qualification.

## Task 2: Observe Docker through the verified same pipe connection

**Interfaces**
- Consumes Task 1 backend object policy and fixed SHA pin.
- Produces Task<DockerEvidence> DockerObservation.ObserveAsync(CancellationToken cancellation).
- IDockerPeerConnector.ConnectAsync(CancellationToken):Task<OwnedPipeObservation> supplies a retained stream/peer. Production uses NativeDockerPeerConnector with the fixed pipe; only the internal dependency seam permits test connectors, never CLI/HTTP/job input.
- NativePipeEvidence.Read(NamedPipeClientStream stream):OwnedPipeObservation obtains the actual server identity from that stream. Native tests may open their own fixture stream and call this library method; the production helper still has no caller-selected pipe.
- Fixed connection: local dot/dockerDesktopLinuxEngine. No caller selects host, pipe, route, context or protocol.

- [ ] Write tests using harness-owned fake pipes: wrong server process, stale/exited backend, a changed executable identity, non-Linux daemon, incorrect Docker Desktop metadata, redirect, timeout and oversized HTTP body must block. Assert the fake server receives zero HTTP bytes when peer verification fails.
- [ ] Run tests RED before adding production pipe logic.
- [ ] Connect with NamedPipeClientStream using TokenImpersonationLevel.Anonymous, bounded connect time, and retain that actual stream. Query GetNamedPipeServerProcessId on its SafePipeHandle, hold a process handle and verify the process image path, file hash/ACL policy, current-user process token SID and creation-time identity. Reject an unreadable or nonmatching peer.
- [ ] Use SocketsHttpHandler.ConnectCallback to return only a newly verified fixed pipe stream; never open TCP/Unix sockets or a remote pipe. Disable proxy, redirects, credentials and automatic retry. Send only GET /version and GET /info; enforce deadlines and streaming byte limits. Validate peer liveness/identity on the stream used for each request, not a separate earlier connection.
- [ ] Require OSType linux, OperatingSystem Docker Desktop, Name docker-desktop and a microsoft-standard-WSL2 kernel. Produce source-defined hashes from backend process identity and daemon identity; redact raw host details. A backend/pipe restart or malformed response blocks, without restarting Docker.
- [ ] Run smoke green, plus the real desktop read-only observation. Commit feat(broker): verify the local Docker peer before host observation.

## Task 3: Closed TypeScript qualification facade

**Interfaces**
- Produces readWindowsHostQualification():Promise<QualificationReadResult>.
- QualificationReadResult = {status:observed,report:WindowsHostQualification} | {status:unavailable,reason:unsupported_platform|helper_unavailable|helper_failed|deadline_exceeded|response_too_large|invalid_report}. Never fabricate target evidence for a transport failure.
- WindowsHostQualification is the closed public JSON shape above, requiring all six target ids. It is descriptive data; do not brand it as executable authority, wire it to claims, or make it satisfy satisfiesProductionIsolation.
- Export a pure parseWindowsHostQualification(input:unknown):WindowsHostQualification for validation. Parser validates structure, not truth of native observations.

- [ ] Write failing portable tests: malformed/missing/extra fields, unknown ids/reasons, duplicate target ids, malformed hashes/timestamp, inconsistent positive status, non-Windows use, missing helper, process timeout and output overflow. Explicitly exercise timeout/overflow rejection rather than only asserting options.
- [ ] Add native HostQualification.EvaluateAsync(CancellationToken):Task<HostQualificationReport> and the closed Program entrypoint; switch the project to executable. Always emit all six target checks; skip Docker requests if prerequisite dotnet/backend evidence is not approved. Missing objects use null identityHash and explicit reasons; positive status requires every check and Docker evidence.
- [ ] Implement fixed .NET and package-relative .native/windows-host/OmniraBrokerHost.dll invocation, argument array [DLL,qualify], shell false and the stated bounds. Reuse the predecessor's UUID-independent native invocation principles without adding helper paths through environment. Verify pinned dotnet executable bytes before launch. Source-built helper and current OS user remain trusted bootstrap assumptions; this is not remote attestation of its own code.
- [ ] Define closed reason vocabulary in native profile and TS parser: unsupported_platform,missing_target,unreadable_target,path_alias,reparse_point,case_sensitive_directory,owner_untrusted,acl_unproven,acl_writable,hash_changed,pipe_unavailable,peer_unproven,peer_changed,docker_unavailable,docker_metadata_invalid,response_too_large,deadline_exceeded,helper_unavailable,helper_failed,invalid_report. Parity-test exact vocabulary/profile id between the two components.
- [ ] Preserve the distinction between an observed native blocked report and unavailable helper transport; neither permits progression. Never turn exit zero, missing reasons or absent Docker metadata into qualification. A positive status requires all six checks ok and matching Docker metadata.
- [ ] Add the exact native-launch importer to structural allowlist; assert helper CLI cannot invoke Git/Docker commands or mutate state and broker CLI remains generate/enroll/diagnostic. Run existing 116-test identity/transport regression and new portable tests green.
- [ ] Commit feat(broker): expose truthful Windows host qualification.

## Task 4: Native evidence, review and next-stage handoff

**Interfaces**
- Consumes Tasks 1–3 and produces the verification report.
- Gate SDF_WINDOWS_HOST_REQUIRED=1: Windows and built helper mandatory; wrong OS/prerequisite fails. Without flag, native tests say skipped, never passed.

- [ ] Write native tests for real fixed-object metadata, real Docker peer observation, refusal of malformed helper args and harness-only ACL/junction/pipe negative cases. Record each native check separately; inability to create a required fixture is blocked/unverified, never a silently green skip.
- [ ] Run required native tests RED before helper setup, then add native:build:windows-host using installed .NET and the predecessor's cleared NuGet source config; no PackageReference or tool upgrades. Re-run GREEN only if the actual environment proves all gates. If a genuine ACL/pin/peer blocker appears, record it and leave it blocked; do not change real ACLs or relax policy.
- [ ] Verify real repository files, worktrees and Docker containers/images are unchanged by the qualification run. No test-image download is needed for GET-only observation. Do not delete or touch other chats' temporary files.
- [ ] Run both TypeScript checks and the focused portable/native/identity regression suites. Keep known full-repo failures and unavailable POSIX test runtime as limits. Add no paid CI job.
- [ ] Commission one independent whole-branch review using the preserved Native method; fix only material findings with failing regressions first, document deferred minors and every ruling. Do not repeat a review solely to confirm test-covered fixes.
- [ ] Commit docs/verification/2026-10-18-windows-host-qualification.md with exact source and hashes, actual counts, OS/peer/ACL coverage and explicit no-execution/no-activation limits. Commit all source; preserve the worktree.

## Self-review and handoff

Spec section 1 maps to Tasks 1–4 for fixed local tools, paths, peer and truthful Windows evidence. Protected worktree preparation, sandbox execution and job context are explicitly deferred, not claimed complete. Existing production isolation guard remains Mac-only until a later health-execution plan adds a separately proven Windows profile.

Threat boundary: the trusted Windows owner/admin and reviewed helper installation can control their host and WSL environment. We protect against untrusted task/model inputs and unintended paths/endpoints; this is not protection against a malicious host owner, kernel compromise or other privileged WSL access. Microsoft documents that same-user WSL distributions are not a security boundary.

Native execution method is already approved and retained. The written plan must be reviewed before product implementation. No re-selection of implementation method is needed.

Primary technical references checked during planning:
- https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeserverprocessid
- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew
- https://docs.docker.com/desktop/features/wsl/
- https://docs.docker.com/desktop/setup/install/windows-permission-requirements/
- https://github.com/microsoft/WSL/blob/master/doc/docs/technical-documentation/security.md

A read-only local observation confirmed the pipe API works on the connected client handle and resolves the fixed Docker backend on this machine. That observation is not the yet-unbuilt native qualification or a passing runtime test.
