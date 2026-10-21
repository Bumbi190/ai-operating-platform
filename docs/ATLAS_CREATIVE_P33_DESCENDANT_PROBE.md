# Atlas Creative P33 - AppContainer child token and native job lifecycle

Date: 2026-10-21. Parent: P32 Draft #502, commit a41d56e.
Scope: standard-user throwaway diagnostics. No worker/editor activation,
project reads, network request, global ACL/firewall change or deployment.

## System child probe

The runnable system probe is ATLAS_CREATIVE_P33_SYSTEM_CHILD_PROBE.txt,
with scripts/creative-tools/worker-appcontainer-system-child-spike.ps1.
Both native Run and wrapper reject administrator context before setup.

The supervisor starts fixed system cmd.exe suspended, with /d disabling
AutoRun and /q /s /c executing only fixed system Windows PowerShell:
-NoProfile -NonInteractive -EncodedCommand for Thread.Sleep(30000).
There are no worktree scripts, editors or custom executables inside the
AppContainer. The supervisor itself loads the reviewed diagnostic source.

The parent is assigned before resume to an unnamed noninheritable job.
Exact job policy readback requires KILL_ON_JOB_CLOSE and ACTIVE_PROCESS
limit4, with no breakaway permission flags. The supervisor launches the parent with bInheritHandles=false.
The restricted parent receives a fresh GUID profile and zero capabilities.

Three trials use the same command/environment: ordinary-before,
AppContainer and ordinary-after. Native job enumeration must show exactly
three processes: cmd.exe, the PowerShell child and fixed system conhost.exe.
The original two-process expectation failed an ordinary control before
profile creation; the additional console host is now explicitly accounted. The opened child handle must still belong to that exact job
before any fallback termination is permitted, and its image must be the
exact fixed system PowerShell executable. Both parent and child tokens
are queried from held process handles. The AppContainer trial requires
the expected package SID, zero capabilities, Low IL4096, non-elevated and
disabled administrator group on BOTH tokens.

The console host also has held membership/image checks and a separately
reported token. Its AppContainer match is observed explicitly, not inferred
from the PowerShell token. Ordinary-trial detail fields are unobserved when
DetailFieldsObserved=false; their default zero/false values are not measurements.

All three native processes must be live before the supervisor closes its only
job handle, and all three held process handles must become signaled within5s.
This verifies native process/token inheritance and deliberate job-close
lifecycle only. It DOES NOT prove the child initialized the CLR, executed
the sleep body, or became application-ready. ChildApplicationReadyVerified
remains false. The source does not infer readiness from process creation.

Error cleanup terminates the owned job, corroborates zero active members
and waits on known handles before profile deletion. API deletion success
is corroborated by package-root enumeration and mapping absence.

## Blocked CLR helper and breakaway experiment

The separate ATLAS_CREATIVE_P33_DESCENDANT_PROBE.txt and its
worker-appcontainer-descendant-spike.ps1 wrapper preserve the blocked
experiment. They compile a temporary inert helper within its own profile,
then require ordinary startup and a same-AppContainer curl --version
positive control before a controlled CREATE_BREAKAWAY_FROM_JOB attempt.
No URL/network request is made. These are NOT the passing system probe.

Ordinary full-helper startup timed out from the native profile AC directory
at5s and15s, before any AppContainer parent was created. The absent marker
alone did not locate the block relative to Main. Identical helper launches
from ordinary GUID Temp succeeded with inherited and minimal environment,
through both Process.Start and native CreateProcess.

A smaller identical executable with Main returning42 then reproduced:
Temp exit42/51ms; fresh profile AC timeout258 at3002ms (exit STILL_ACTIVE259);
same profile LocalState exit42/44ms. All handles and that fixture were
removed. This isolates an observed storage-location difference, not its
underlying Windows/CLR cause.

Moving the full helper to own-profile LocalState restored ordinary startup
(exit0/49ms), but the actual AppContainer parent produced no report within10s.
Its token was confirmed correct; native child inheritance and breakaway
were not established by that experiment. The owned job was drained and
known processes stopped. Overall cleanup was conservatively unverified
because a missing report cannot exclude an unexpected breakaway.

The original failed JSON is retained in ATLAS_CREATIVE_P33_CLR_BLOCKED_RESULT.json.
A later independent check found no inert-descendant/curl processes; exact
profile deletion returned0, package enumeration0 and mapping absent at
2026-10-21T13:52:18.1528302Z. These follow-up facts are recorded separately
in ATLAS_CREATIVE_P33_STARTUP_FINDINGS.json; the original result is unchanged.
No automatic passing fallback was added to the blocked wrapper.

## Remaining gates

BreakawayTestExecuted, arbitrary broker containment, dedicated worker token,
supervisor-crash scenario, child application readiness and ProductionReady
remain false in the system probe. Deliberately closing a job handle is not
a supervisor-crash test. No editor compatibility or general filesystem/
network containment conclusion follows. The synthetic source and mutable
paths are not a production authority boundary; never elevate these probes.

## Validation

Both sources receive compile-only checks against fixed system Framework64
references; both wrappers parse with Windows PowerShell5.1. Independent
review of actual source covered ABI, command quoting, PID-reuse guards,
matching breakaway control and cleanup. Review found no confirmed blocker
for the narrowed system probe before execution.

Runtime results are recorded below. Keep stacked Draft; no merge/deployment.

Microsoft API references:
- https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-for-legacy-applications-
- https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
- https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags

## Actual system-probe result - 2026-10-21

The assistant automatically ran the final wrapper from ordinary system
PowerShell -NoProfile. It exited0 at 2026-10-21T13:59:53.7235194Z; Error=null and
all three trials passed. Exact structured output is in
ATLAS_CREATIVE_P33_SYSTEM_CHILD_RESULT.json.

The restricted trial held parent PID27740, PowerShell child PID2216 and
console host PID44796. All three exact system images were native job members.
All three actual tokens matched the fresh package SID, had zero capabilities,
Low IL4096, no elevation and disabled administrator group. All were live
before job closure and all three held handles became signaled afterward.
Both ordinary controls also passed native lifecycle checks.

Profile deletion returned success; package enumeration and mapping were
absent and AllProcessesStopped=true. A fresh supervising-process check at
2026-10-21T14:00:33.8639716Z independently found0 package entries and
mapping absent. This result does not upgrade the
separately blocked CLR-helper/breakaway experiment or any remaining gate.
