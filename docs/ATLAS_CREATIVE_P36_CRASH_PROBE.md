# Atlas Creative P36 - abrupt supervisor termination

Date: 2026-10-21. Parent: P35 Draft #507, commit9fb8949.
Scope: ordinary-user standalone throwaway diagnostic. No worker/editor,
real project/ledger inputs, dependency installation, network request,
existing ACL/firewall change, merge or deployment.

P34 established JavaScript readiness, inherited AppContainer tokens and
deliberate job-close shutdown. P35 directly observed explicit Windows
breakaway denial. Neither exercised abrupt death of the job-owning process.

P36 tests forced TerminateProcess of an owned synthetic supervisor. It is
not an unhandled-exception, power-loss, machine-crash or actual worker test.

## Process roles

The outer observer stays alive to collect evidence and delete the fixture.
It creates a fresh GUID profile and stages the fixed installed Node22.22.3
image into AC/runtime using the P34 data-only CreateNew/flush/hash checks.
The staged file must have an observed inherited expected-package-SID
ReadAndExecute allow ACE. No existing file security is changed.

Each job-owning supervisor is fixed system Windows PowerShell -NoProfile
-NonInteractive, executing only the diagnostic's RunOwner entry point.
It runs unelevated outside AppContainer. Its TEMP/TMP point only to a new
LocalState/owner-compiler-<nonce> folder in this fresh profile, so Add-Type
can compile without writing to the Windows directory. Node's separate
minimal environment does not inherit these compiler settings.
It creates an unnamed job with
one noninheritable handle, exact readback flags0x2008 (KILL_ON_JOB_CLOSE,
ACTIVE_PROCESS limit4), and no breakaway permissions.

The supervisor starts the selected Node parent suspended, assigns it before
resume, checks image/token, and lets authored inline JavaScript spawn a
normal or detached child. Minimal environment, --no-addons, stdio ignore,
windowsHide and no shell/repository import/URL match P34. Both parent and
child must independently execute JS and publish nonce/PID/version markers.
Native enumeration must contain the pair and at most two exact system
conhost.exe members; held handles, exact membership, images and tokens are
checked before arming. AppContainer Node tokens strictly require expected
package SID, caps0, Low IL4096, no elevation/enabled admin group. Console
tokens are measured separately.

Once armed, the supervisor publishes a bounded atomic nonce/own-PID/
pair-PIDs/own-job-handle report, then waits60s before fallback cleanup.
Node fallback timers are120s. These timers are never the success evidence.

## Independent observer and abrupt stimulus

The observer starts and retains the supervisor's CreateProcess-returned
handle. It never reopens a reported supervisor PID. The owner-reported
job handle is duplicated only from that exact live supervisor into the
observer as a noninheritable handle.

Through that temporary job handle the observer independently checks exact
job policy and native membership. It opens each current member, verifies
that held handle belongs to that exact job before making it eligible for
cleanup, and checks image/token/liveness. The Node pair's complete JS
markers are independently validated against exact native PIDs and version.
Unknown/duplicate members fail. The job handle is a controlled diagnostic
protocol, not an authority input suitable for privileged production.

For a normal crash trial, the observer closes its temporary job handle
BEFORE it calls TerminateProcess on the owned supervisor with exit0xE036.
It waits on that held supervisor handle and requires the actual exit code.
The owner finally marker must remain absent; this corroborates the explicit
forced-exit stimulus, rather than establishing a crash from a missing file.

Every held Node/console handle must then become signaled, with an individual
wait bound of5s. Passing is decided before any direct fallback member
termination. The observer does not call TerminateJobObject or terminate
members on the passing path.

Readiness has a20s deadline; stimulus must occur within25s of starting the
supervisor. Thus owner60s and Node120s timers cannot explain a passing
shutdown result. This is synthetic abrupt process termination, not proof
of all possible supervisor failure modes.

## Retained-handle control and seven trials

An extra ordinary control deliberately keeps the observer's job handle
open while terminating the supervisor. All held members must remain live
at the check after500ms. Closing the retained handle must then stop them.
This checks the last-handle mechanism and guards against accidentally
keeping a job handle open during the actual crash trials. It is a bounded
observation, not continuous liveness telemetry.

Seven configurations:
- ordinary retained-handle control;
- ordinary normal/detached crash trials before;
- AppContainer normal/detached crash trials;
- ordinary normal/detached crash trials after.

Ordinary controls use installed Node; AppContainer uses the matching-byte
staged image, so image location and token context both differ. This is not
an AppContainer-only causal comparison. Both ordinary and AppContainer
token details are observed. Node detached:true still is not an explicit
Windows breakaway request; that distinct API experiment remains P35.

## Error cleanup and limits

Only the observer-created supervisor, owned/duplicated job, and native
members with verified held-handle membership are eligible for termination.
No unrelated processes are stopped by name or PID. Temporary job duplicates
are closed even on failure. If complete membership evidence was unavailable,
cleanup remains unverified unless an actual owner-finally report explicitly
corroborates its own bounded cleanup. A drained job alone is insufficient
to exclude an unverified child. The profile is retained on unverified cleanup.

Profile deletion success is followed by package-root enumeration and
registry mapping absence. No recursive manual profile removal is used.
The source, marker protocol, hash and allow-ACE observations are mutable
diagnostics, not general executable trust or adversarial race protection.
SourceSha256 observes the supervisor source pathname; it is not a lock
binding every later owner compilation against concurrent modification.
Never elevate this diagnostic.

No actual worker token, arbitrary broker containment, general filesystem/
network isolation, editor compatibility, unhandled exception or machine
crash is established. All such production gates remain false.

## Validation

Fixed Framework64 compile-only and PowerShell5.1 parse checks are required.
Independent actual-source review precedes runtime execution; actual output
and fresh cleanup corroboration are recorded separately. Only diagnostic
and evidence files change, so product/application test suites are outside
this standalone probe's validation scope.

Run from ordinary PowerShell:
scripts/creative-tools/worker-appcontainer-supervisor-crash-spike.ps1

Keep stacked Draft on #507. No merge/deployment.

Primary references:
- https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-createjobobjectw
- https://learn.microsoft.com/en-us/windows/win32/api/handleapi/nf-handleapi-duplicatehandle
- https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess
- https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects

## Initial bootstrap failure and separate cleanup

The first run stopped before the retained-handle control armed, at516ms.
It never observed a Node pair or a termination stimulus. The original
failure/cleanup-unverified fields are preserved in
ATLAS_CREATIVE_P36_INITIAL_BOOTSTRAP_RESULT.json.

An isolated owner compile-only bootstrap with captured stderr reproduced
exit1: Add-Type raised UnauthorizedAccessException trying to create
C:\Windows\zatctwla.tmp because the clean environment omitted TEMP/TMP.
This preflight did not invoke RunOwner or create a test job. The fix creates
only a fresh own-profile LocalState compiler directory and supplies its
path as TEMP/TMP to the ordinary owner bootstrap.

A separate follow-up at2026-10-21T16:33:54Z queried57 current-session Node/
console processes with zero unreadable and zero matching package tokens;
the initial owner PID was absent. Exact profile deletion returned0, package
enumeration0, mapping absent. These scoped facts are in
ATLAS_CREATIVE_P36_BOOTSTRAP_CLEANUP_FOLLOWUP.json and do not overwrite the
initial failure or prove arbitrary broker/cross-session containment.

## Actual Windows result - 2026-10-21

Final execution completed at2026-10-21T16:34:47Z with Error=null and seven
passing configurations: one retained-handle control and six abrupt owner
termination cases. Exact output is ATLAS_CREATIVE_P36_CRASH_RESULT.json.

| Configuration | Native members | Owner-ready ms | Post-termination observation ms |
| --- | ---: | ---: | ---: |
| Retained ordinary handle control | 4 | 1002 | 530 (includes500ms retained interval) |
| Ordinary normal before | 4 | 869 | 31 |
| Ordinary detached before | 3 | 818 | 16 |
| AppContainer normal | 4 | 1181 | 19 |
| AppContainer detached | 3 | 927 | 33 |
| Ordinary normal after | 4 | 821 | 15 |
| Ordinary detached after | 3 | 823 | 18 |

Every owner actually exited with forced code57398 (0xE036), and each owner
finally marker was absent. All six crash cases closed the observer's job
handle before owner termination. In the retained control all four members
were live at the500ms check after owner termination, then signaled after
the observer released its retained handle. All25 held member processes
were live before the stimulus and signaled afterward; no direct fallback
member termination preceded a passing observation.

Both AppContainer Node pairs and all their separately observed console
hosts measured expected package SID, caps0, Low IL4096, non-elevated and
no enabled admin group. Ordinary nodes/consoles measured Medium IL8192.
All Node parent/child JS markers independently matched nonce, native PIDs
and version22.22.3. Supervisors remained ordinary non-AppContainer processes.

AllProcessesStopped and profile delete/storage/mapping checks passed.
Fresh corroboration at2026-10-21T16:35:20Z found package storage, registry
mapping, and all32 recorded owner/member PIDs absent. See
ATLAS_CREATIVE_P36_FRESH_CLEANUP.json. Held handles remain the identity and
lifecycle evidence; later PID absence is corroboration only.

The actual final source compiled without warnings after the TEMP/TMP fix;
PowerShell wrapper parse passed. Independent actual-source review found no
confirmed blocker both before runtime and for the compiler-temp fix.
No product code or dependency files changed. The result establishes this
forced-termination configuration only; unhandled exception, machine crash,
actual worker, broker, executable trust and production gates remain false.
