# Atlas Creative P35 - explicit Windows breakaway diagnostic

Date: 2026-10-21. Parent: P34 Draft #506, commit c8d4fbf.
Scope: standalone, ordinary-user, throwaway feasibility diagnostic. No
worker/editor activation, real project/ledger inputs, URL/network request,
dependency installation, existing ACL/firewall change, merge or deployment.

P34 passed authored Node JavaScript readiness and detached:true lifecycle.
Node detached is not Windows CREATE_BREAKAWAY_FROM_JOB. P35 directly calls
CreateProcessW with that explicit flag and records its immediate API result.

## Probe and interpretation

The installed C:\Python312 runtime is observed as Python3.12.2 x64.
ctypes calls fixed C:\Windows\System32\kernel32.dll through explicit x64
signatures. STARTUPINFOW must be104 bytes and PROCESS_INFORMATION24.
The payload uses no shell, third-party module, repository import or URL.
The mutable reviewed .py source is loaded by the ordinary supervisor and
passed inline as hex to Python exec, with a bounded command line.

Three trials: ordinary-before, AppContainer, ordinary-after. Each starts
a Python parent suspended, assigns it to a fresh unnamed noninheritable job,
queries its actual token/image, then resumes it. Exact policy readback
requires flags0x2008 (KILL_ON_JOB_CLOSE and ACTIVE_PROCESS limit4), with no
breakaway permissions. All parent launches use bInheritHandles=false and
a minimal environment without inherited Python/module/proxy settings.

Within each parent:
1. Run fixed system curl.exe -q --version with CREATE_NO_WINDOW0x08000000.
   Require exit0 and stopped direct process before attempting breakaway.
2. Run that exact image/command with0x09000000, adding only
   CREATE_BREAKAWAY_FROM_JOB0x01000000. Capture GetLastError immediately
   after a failed CreateProcessW.
3. Repeat the normal control and require exit0.

No curl URL or request is supplied. An unexpectedly successful breakaway
is never suspended; curl --version is finite. The helper waits at most5s
on each directly returned process handle, terminates that owned process on
timeout, and checks shutdown. It never terminates a PID discovered by name.
A timeout exit sentinel fails the probe even if fallback termination works.

Passing requires both normal controls to return0 and the explicit attempt
to fail with ERROR_ACCESS_DENIED5. No result is inferred from a timeout.
This diagnoses the recorded configuration, not arbitrary broker escape,
malicious same-user behavior or universal Windows isolation. No allowed-
breakaway job configuration is tested; no global policy is changed.

## Runtime staging and trust limits

A fixed26-file manifest contains the installed Python executable, core DLL,
VC runtime DLLs, ctypes/libffi and the observed required standard-library
sources. Each file is copied as data using CreateNew into only the fresh
GUID profile AC/runtime subtree, flushed, checked regular/nonreparse, and
compared to its source SHA256. Each staged file must have an observed allow
ACE granting the fresh package SID ReadAndExecute. These are inherited
permissions on new fixtures; existing ACLs are not changed.

An authored python312._pth contains only ., Lib and DLLs and no import site.
Python uses -I -S -B: isolated startup, no site import or bytecode writes.
The staged files are deleted through profile deletion after verified cleanup.
No compiler, runtime, package or dependency is downloaded or installed.

Ordinary controls use the installed source image; restricted trials use
the staged matching-byte executable and dependencies. This changes image
location as well as token context and is not a one-variable comparison.
P34 demonstrated that ordinary launch of an AC-staged image could itself
measure Low IL, so an AC-staged ordinary marker-write control is unsuitable.
Fingerprints and allow-ACE observations are diagnostics, not a race-safe
executable trust boundary. GeneralExecutableTrustVerified remains false.
These mutable sources/fixtures must never be elevated or deployed as a
privileged authority boundary.

## Evidence and lifecycle

A unique started marker independently records nonce, actual PID and actual
Python version. A complete report records those identities and all three
API outcomes (created/error/exit/stopped). Each marker is created wx under
its fresh nonce path, closed and atomically published via MoveFileW.
Supervisor reads are bounded to256 ASCII bytes and reject reparse files.
API execution is only marked observed after a complete validated report.

Before job closure, the supervisor enumerates active native job membership:
the exact Python parent plus at most one exact system conhost.exe. Every
auxiliary handle must independently belong to that exact owned job before
it becomes eligible for cleanup. Its image and token are measured. The
AppContainer parent must have the fresh expected package SID, zero
capabilities, Low IL4096, no elevation or enabled administrator group.
Console details are separate observations, not inferred from the parent.

After finite curl children have exited and a complete report is read,
Python and observed consoles must still be live. Closing the supervisor's
sole job handle must make every held process handle signal; each wait is
individually bounded to5s. A30s Python sleep is a fallback lifetime bound,
not job-close evidence. This is deliberate closure, not supervisor crash.

On error, only the owned job and verified held processes are stopped.
If the parent was resumed but no complete report corroborates all direct
child shutdown, job emptiness alone cannot exclude unexpected breakaway:
overall cleanup remains unverified and the profile is retained for scoped
follow-up. Later follow-ups never rewrite original failure fields.
Profile deletion API success is corroborated by package-root enumeration
and registry mapping absence. No recursive manual profile deletion.

## Validation

The diagnostic asserts ABI before API execution. A preflight caught an
initial missing pair of DWORD fields in STARTUPINFOW (assertion failure,
before process creation). The corrected actual x64 sizes are104 and24.
The C# supervisor compiles against fixed Framework64 system references;
the PowerShell5.1 wrapper parses. Standalone runtime controls are the
relevant checks; application/product code and dependency files are untouched.

Runtime results and independent review findings are recorded separately.
All worker, broker, supervisor-crash, general executable-trust and
production gates remain false regardless of this bounded result.

Reproduce from ordinary PowerShell:
scripts/creative-tools/worker-appcontainer-breakaway-spike.ps1

Keep stacked Draft on #506. No merge/deployment.

Primary references:
- https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags
- https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
- https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw
- https://docs.python.org/3.12/library/ctypes.html
- https://docs.python.org/3.12/library/sys_path_init.html

## Actual Windows result - 2026-10-21

At2026-10-21T16:00:07Z, all three trials passed (ordinary-before,
AppContainer, ordinary-after). Each exact normal curl control before/after
exited0; every explicit flag request returned CreateProcessW=false with
Win32=5. BreakawayCreated=false in all three reports. This is an API denial
observation, not a timeout or an inferred missing child.

Actual Python readiness plus all three API outcomes were reported in183ms,
243ms and181ms respectively. The AppContainer Python parent and separately
observed conhost both had the expected package SID, caps0, Low IL4096,
no elevation and no enabled admin group. Ordinary parents/consoles measured
Medium IL8192. Tokens of the finite curl children were not independently
queried in P35; their matching command exit controls were observed.

Each current job contained exactly Python and fixed system conhost after
the finite curl children exited. Both held processes were live before
job closure and signaled after it. AllProcessesStopped and all three
profile cleanup checks passed. All26 staged-file hash comparisons and
inherited package ReadAndExecute allow observations passed.

A separate fresh check at2026-10-21T16:00:30Z confirmed package storage,
registry mapping and all six observed process IDs absent. The authoritative
lifecycle evidence is the held handles; PID absence is corroboration.
Exact outputs: ATLAS_CREATIVE_P35_BREAKAWAY_RESULT.json and
ATLAS_CREATIVE_P35_FRESH_CLEANUP.json.

Independent actual-source review found no confirmed blocker before execution.
Its minor source-fingerprint concern was fixed: ParentSourceSha256 now hashes
the exact UTF8 source string bytes passed to exec, not a second pathname read.
No final runtime rerun was needed: the fix preceded the recorded execution.
Worker/editor remain inactive; no production readiness or general containment
claim follows. Explicit breakaway execution/denial is established for P35's
recorded configuration only; P33/P34 historical outputs remain unchanged.
