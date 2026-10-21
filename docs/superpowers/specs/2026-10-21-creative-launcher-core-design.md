# Creative launcher core: synthetic integration design

Date: 2026-10-21. P38, base P37 commit81327b3 / Draft #509.
Status: proposed architecture for human review. No implementation approval,
protected installation, account activation or editor execution is implied.

## Purpose and success

Build one reusable, compiled Windows launcher core that joins the previously
separate input-handle, AppContainer token, job-lifecycle and bounded-result
mechanisms. Its first operation runs authored synthetic data only. Success
means a complete bounded input -> constrained process -> verified result
cycle through the new core, including deterministic refusal and cleanup.
It does not mean PhotoCraft, FilmCraft, a dedicated worker or publication
has become authorized.

André's intended direction is an Atlas-controlled creative worker with
human approval. The current development authorization covers preparation
and ordinary-user synthetic work. P37's real-worker/network/human authority
requirements remain binding. This proposal selects only the first launcher
slice; the privileged deployment model is deliberately not selected here.

## Context from actual source and host

- local-broker.mjs has a hard false execution gate before staging/execPinned.
  Its execFile path is an ordinary interactive pilot, not an isolation
  backend. Keep the gate false and do not wire this new core to that path.
- The handoff manifest describes12 proposed protected files and is not an
  installer. Adding a launcher later requires a new reviewed inventory.
- P32 proved bounded same-handle synthetic reads; root ACL trust and general
  adversarial race protection were explicitly unverified.
- P34/P36 established Node JS readiness, actual tokens, native membership,
  last-job-handle lifecycle and forced supervisor termination in their
  recorded configurations. These are references, not a deployed library.
- Host inspection found fixed Framework64 csc, Framework registry release
  534296/version4.8.10008, and SDK8.0.204/ref pack8.0.4. Presence is not patch,
  signature or installation provenance attestation.
- The existing fixed Windows compiler can build an ordinary x64 managed
  executable without installing packages. The managed host remains OUTSIDE
  AppContainer; no reliance is placed on the blocked P33 CLR child.
- Installed Node22.22.3 has observed digest
  780f44f2c53c108bae261ada21a525b4bfe733c020ac85e41bfe94479090ac9b.
  This is a synthetic-runtime pin, not approval to deploy a general editor.

## Options and selection

| Option | Benefit | Cost / decision |
| --- | --- | --- |
| Compiled ordinary C# host using existing Windows Framework, with a narrow native adapter | Reuses tested native ABI without per-run Add-Type; no new dependency installation | Recommended for this Windows-only synthetic slice; deployment provenance still unresolved |
| Continue PowerShell Add-Type as the runtime host | Small immediate script change | Adds mutable-source/per-run compiler/temp dependencies to every launch; keep existing probes as evidence instead |
| Introduce a privileged Windows service now | Could own protected authority and account launch | Adds installer, service identity and protected IPC before their design/approval; outside this slice |

The selected host is a compiled ordinary-user executable, not a service.
A small PowerShell build/test wrapper may call only fixed system csc with
explicit system references. The runtime launcher does not evaluate scripts,
compile worktree source, consult PATH for tools or expose a shell.

No claim that the existing SDK8 is production-current is made. Official
.NET policy lists .NET8 end of support on2026-11-10 and requires current
servicing patches. This design does not install or select that SDK for the
security-sensitive deployed host. Framework support follows the underlying
Windows lifecycle; OS/runtime provenance and patch acceptance remain future
deployment checks.

## Components and ownership

Proposed source lives under scripts/creative-tools/launcher/ with four
independent responsibilities; exact implementation tasks follow design review.

| Component | Owns | Must not do |
| --- | --- | --- |
| FixtureInput | Fresh ordinary-user test root; pinned root/parent/leaf handles; <=64KiB canary bytes and digest | Accept arbitrary project paths, change existing ACLs, read real approvals or credentials |
| WindowsProcessBoundary | Fresh AppContainer profile, exact runtime pin, pipe/job/process SafeHandles, deadline and termination | Choose arbitrary commands, enable accounts, grant execution authority |
| SyntheticProtocol | Fixed authored Node operation; exact request/result schema and digest relationship | Import repository JS, accept executable code or output paths from a request |
| ObservationWriter | Small diagnostic result after lifecycle evidence and cleanup | Turn observations into approval, sign output as a protected worker or publish an asset |

The input reader passes bounded bytes to the process boundary. It never
passes its source file/directory handles or source pathname to the child.
The result verifier sees bounded captured bytes, not a child-selected
filesystem destination.

## Only supported first operation

RunSyntheticCanary has no tool/operation selector supplied by an agent.
Its request contains exactly a generated nonce, byte count and base64 canary
bytes. Only a fresh internally created fixture is accepted. The child returns
exactly nonce, byte count and SHA256 of the decoded bytes as one UTF8 JSON
object. No media conversion is implemented.

Limits: one input <=64KiB; encoded request <=96KiB; stdout <=4KiB; stderr
<=4KiB; reject duplicate/unknown properties, invalid UTF8/base64, extra bytes
after the single JSON object, inconsistent lengths, wrong nonce/hash and
nonzero process exit. All integer ranges are bounded before allocation.
Diagnostic evidence records sizes/digests, not input contents or raw stderr.

The public executable accepts only the fixed synthetic self-test entry
point with no caller paths, executable, arguments, environment, capability
or account options. Native adversarial fixtures are controlled test code,
not agent-accessible execution modes. A request boolean cannot grant access.

## Input and runtime files

Create one GUID-owned ordinary Temp fixture and pin its directory chain
before reading a small authored nested canary using the P32 native relative
open rules. Keep handles alive through same-handle hashing/read, then transfer
only copied bounded bytes. Reject reparse points, alternate streams, unsafe
components, multi-link leaves, identity/length/timestamp changes or unsupported
flags. No check-path/reopen fallback.

Fixture ownership/marker/identity checks limit test setup and cleanup.
They do not prove a production root's DACL trust. The core exposes no real
project-root adapter in this slice; root ACL acceptance remains a separate
mandatory implementation before real input.

The ordinary host executable is built outside AC storage. Only the fixed,
digest-matching Node image is staged as data into the fresh AC runtime
directory with CreateNew/flush and inherited package read/execute observation,
as in P34. The temporary runtime is writable diagnostic storage, so
GeneralExecutableTrustVerified stays false. No existing ACL is edited.
No project/media bytes enter argv, environment or temporary input files
within the AppContainer.

## Explicit pipe-handle boundary: new qualification requirement

Use anonymous pipes for stdin, stdout and stderr. STARTF_USESTDHANDLES selects
only the corresponding child ends. Supply SECURITY_CAPABILITIES,
PROC_THREAD_ATTRIBUTE_HANDLE_LIST and PROC_THREAD_ATTRIBUTE_JOB_LIST together
in STARTUPINFOEX. The job list contains exactly the owned job, without
making that job handle inheritable. The handle-inheritance list contains
exactly three real pipe handles; no pseudo handle, job, project file, directory,
token, signing key or parent-side pipe end is included.

Microsoft requires list members to be inheritable and bInheritHandles=true.
The earlier bInheritHandles=false probes therefore do NOT qualify this new
launch configuration. Parent-side pipe ends, job and source-file handles
remain noninheritable. Close the parent's copies of child-side pipe ends
immediately after successful creation so EOF cannot depend on a leaked copy.
All handles/buffers have explicit disposal ownership. The first host runs
one operation only, rejects reentrant/concurrent runs and has no plugin or
callback that can spawn processes. All host process creation shares one
exclusive spawn gate while child pipe ends are inheritable; a separate
broad-inheritance launch on another thread would otherwise leak those ends.

This combination of AppContainer, handle list, creation-time job list and
Node stdio is UNVERIFIED
on this host. Its actual qualification is the first native implementation
acceptance test. A failed CreateProcess, invalid child pipe or missing EOF
refuses the configuration; no fallback to broad inheritance, unrestricted
execution, command-line input or permissive ACL repair is allowed.

An independent inherited-handle test must include a deliberately inheritable
benign sentinel object excluded from the list, an allowed sentinel positive
control in the test harness, and exact kernel-object comparison of held
handles (CompareObjectHandles after a bounded duplicate from the exact child
process). An invalid/reused numeric handle by itself is not sufficient
evidence. Positive-control duplicate pipe-writer handles must be closed before
any EOF assertion. This is a bounded inheritance test, not a complete OS broker audit.

## Process launch, lifetime and completion

The ordinary host creates an unnamed noninheritable job, reads back
KILL_ON_JOB_CLOSE, active-process limit4 and no breakaway permissions.
It creates the exact Node image suspended with zero capabilities, the
explicit pipe list and creation-time job assignment. Require native exact
job membership immediately on CreateProcess return, before token checks or
resume; there is no later AssignProcessToJobObject fallback. Read actual
image/token through held process handles.

Creation-time assignment is required to address a gap not covered by
P36's already-armed crash observations:
a controller killed between plain suspended creation and later job assignment
can leave an orphan suspended child. Microsoft's creation-time job-list
mechanism is therefore a required part of the new backend, not an optional
optimization. Its combination with the other two attributes still needs
qualification on this host; unsupported combinations refuse before use. Require AppContainer, exact package SID,
caps0, Low IL4096, no elevation and no enabled administrator group.
If any pre-resume condition fails, terminate without resuming.

The authored Node payload uses builtin modules only, --no-addons, no shell,
no network calls and no external/imported JS. A minimal explicit environment
excludes NODE_OPTIONS, module paths, proxies, tokens and project data.
Use System32 cwd; the ordinary host's compiler/temp settings are not passed
to the child. The job handle is never in the inherit list.

Input writing and both output drains run concurrently with process
observation. Do not wait for process exit before draining pipes. The host
uses a30s monotonic operation budget: at most20s for setup/running and the
remaining10s reserved for cancellation, producer/pump shutdown and cleanup
reporting. All waits share absolute deadlines; do not stack per-handle waits
past the shared budget. The independent test harness has a45s outer bound,
knows the fixture/profile identity before child creation, and force-stops
only its owned host if the inner budget is exceeded. That is a failed run
with cleanup unverified and artifacts preserved, never a passing timeout.
These are software acceptance budgets, not real-time OS-call guarantees.
The core caps streams while reading and closes stdin after the request. Output caps apply even if the child stalls,
floods stderr or exits early. Any overflow, failed pump, invalid protocol
or timeout stops the owned job before returning a refusal.

Pipe pumping must be cancellable and bounded. Merely passing CancellationToken
to a synchronous native read is insufficient. Use owned I/O threads with
explicit cancellation/handle-close orchestration, verified to unblock on
job termination and closed writers; no blocked pump may outlive RunSynthetic.
If pumps cannot finish within the reserved cleanup budget, the host must
fail-stop rather than return a result with live pumps; the independent
harness records the failed run and incomplete cleanup. If bounded shutdown
cannot be demonstrated, the configuration is not accepted.

Record actual native job membership/images for known children and bounded
system consoles, following P34/P36 held-handle guards. Unknown members fail
the run. No discovered PID is eligible for termination until its held handle
is verified in the exact owned job. Capture process exit and terminal stream
state; verify result bytes only after no producer can modify them.

Successful evidence requires expected child exit, bounded complete stdout,
matching nonce/count/hash, terminated observed members, completed pumps and
verified fixture/profile cleanup. A valid-looking JSON object alone is not
success. Error results preserve the failed stage separately from cleanup.

## Failure state and cleanup

State is monotonic: Prepared -> InputPinned -> ProcessSuspended ->
TokenAndJobVerified -> Running -> ProducersStopped -> ResultVerified -> Cleaned.
Any stage may enter Refused, which still requires bounded cleanup observation.
No state transition changes worker/account/publish authorization.

All error paths close only owned handles and stop only the owned job and
verified processes. A current empty job is insufficient evidence for a child
whose membership/identity was never corroborated. Keep cleanup unverified
and preserve the fixture for a scoped follow-up when evidence is incomplete.

Cleanup of the synthetic root must be identity-checked and bounded to the
exact expected entries; no broad recursive path deletion. DeleteAppContainerProfile
is followed by package-storage and registry-mapping absence checks.
Never remove unknown entries or nonce/revocation history to make a test green.

## Acceptance criteria for the implementation plan

| Requirement | Real evidence needed |
| --- | --- |
| Build/runtime host | Fixed system compiler succeeds; actual compiled ordinary host starts outside AppContainer; no package install/download |
| Combined handle configuration | Authored Node consumes stdin and produces stdout/stderr inside the actual expected AppContainer; excluded sentinel is not inherited with working positive controls |
| Same-handle input | Nested canary exact digest; link/path/oversize refusals; pinned mutation controls and disposal behavior from the new core |
| Protocol/output limits | Wrong nonce/hash, invalid JSON/UTF8, duplicate/unknown fields, flood, stalled input reader and early exit fail without hanging |
| Native lifecycle | Exact token/job/image observations; normal completion and timeout stop observed members; forced controller termination before create, immediately after create return/before resume, and after readiness has bounded observed outcomes without a suspended orphan |
| Cleanup | No live held processes/pumps; exact fixture/profile absence or explicit preserved cleanup failure; unrelated canaries unchanged |
| Existing authority | Existing creative tests remain green; local pilot/worker gates stay false; no editor or queue import wires this core into execution |

Adapt tests to call the new core, not copies of its implementation. Use
positive controls for permissions and failure stimuli. A platform/API/ABI
mismatch is reported explicitly; it cannot be silently skipped as passed.
The existing P32-P36 records remain immutable historical evidence.

## Threat boundary and deferred production work

The ordinary host and development source are trusted for synthetic authored
fixtures only. A hostile same-user desktop process, administrator, compromised
kernel, or writable deployed host is not contained by this design. The
AppContainer child is treated as untrusted for output size, protocol and
lifetime; no claim of comprehensive isolation follows from a valid result.

The first core issues diagnostic observations only. ActualWorkerTokenVerified,
RootAclTrustVerified,NetworkEgressVerified,RealHumanApprovalVerified,
ArbitraryBrokerContainmentVerified,GeneralExecutableTrustVerified,
CreativeExecutionAuthorized,PublishAuthorized and ProductionReady remain false.

Before any real PhotoCraft run, later reviewed designs/acceptance must supply:
the protected deployment/runtime provenance and dedicated account launch;
real project-root and bounded writable-output trust; effective network and
broker controls; durable independently authenticated approval/nonce/revocation
and exact project/key binding. The account activation/provisioning proposal
requires its separate concrete human authorization. No existing broker flag,
environment value or new observation can bypass these requirements.

## Review and next handoff

This document is the architecture artifact. After human review/approval,
write the implementation plan with test-first tasks, exact source/build
layout, native resource ownership and independent review checkpoints.
No product implementation or detailed execution plan is included in P38.
The first plan must qualify the combined capabilities, inherited-pipe and
creation-time-job attributes before treating that configuration as available. If unsupported, stop and return a revised design for review.

Research checked2026-10-21, primary references:
- https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation
- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew
- https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
- https://learn.microsoft.com/en-us/windows/win32/procthread/creating-a-child-process-with-redirected-input-and-output
- https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute
- https://learn.microsoft.com/en-us/windows/win32/api/handleapi/nf-handleapi-compareobjecthandles
- https://devblogs.microsoft.com/oldnewthing/20230209-00/?p=107812
- https://devblogs.microsoft.com/oldnewthing/20200306-00/?p=103538
- https://learn.microsoft.com/en-us/dotnet/framework/get-started/system-requirements
- https://learn.microsoft.com/en-us/lifecycle/faq/dotnet-framework
- https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core

Architecture review record: independent review of the actual specification
found no remaining Important findings after the creation-time job-list,
shared deadline, spawn gate and EOF clarifications. This is a design review,
not native API qualification, build validation or human spec approval.
Only this document changed; no runtime tests or launcher implementation ran.
