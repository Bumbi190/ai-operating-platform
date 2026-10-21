# Atlas Creative P34 - synthetic Node application readiness

Date: 2026-10-21. Parent: P33 Draft #505, commit22f1934.
Scope: ordinary-user diagnostic reference. No worker/editor activation,
real project/ledger input, network request, installed dependency, global
ACL/firewall change, merge or deployment.

P33 established native token inheritance and deliberate job-close shutdown,
leaving application readiness false. P34 tests whether authored JavaScript
actually executes in both a Node parent and its child, including a detached
child, while keeping the same AppContainer/job restrictions.

## Explicit runtime and stdio variants

The source runtime is fixed installed C:\Program Files\nodejs\node.exe,
observed v22.22.3. Both wrapper and native Run reject administrators.
The supervisor compiles/runs under ordinary PowerShell, outside AppContainer.

-RuntimeLocation profile (default) stages that exact executable into only
the fresh GUID profile's native AC/runtime directory. A data-only stream
copy uses CreateNew and flushes before launch, inheriting only the new
fixture directory's security. Existing targets are refused; directory/file
reparse checks and staged/source SHA256 equality are mandatory. An observed
expected-package-SID ReadAndExecute allow ACE is required before execution.
This ACE observation is not a general ACL trust or adversarial race proof.
AppContainer trials use the staged image for both parent and child.
Ordinary before/after controls use the fixed installed source image. The
paths differ despite matching hashes: this is not a one-variable path
comparison. TrialRuntimeImagePath and ControlRuntimeImagePath record that
distinction. The temporary copy is removed with the profile. No installed
runtime or existing ACL is changed.

-RuntimeLocation installed retains the original fixed-image experiment.
No location is tried automatically after another fails. Each run selects
one location and records it. The image fingerprint is an observation, not
an executable allowlist or a race-safe production trust boundary. The
profile is writable; GeneralExecutableTrustVerified remains false.

-StdioMode ignore (default) and inherit are separate named diagnostics.
A selected mode applies identically to all six trials, with no automatic
retry/fallback. inherit refers to the sandbox parent's own stdio state;
the supervisor launches that parent with bInheritHandles=false. Neither
mode establishes a complete inherited-handle audit.

## Execution and readiness

The supervisor creates each fixed/chosen Node parent suspended, assigns it
to an unnamed noninheritable job, checks its actual token, then resumes it.
Exact policy readback requires KILL_ON_JOB_CLOSE, active-process limit4
and no breakaway permission flags. Only a minimal environment is supplied;
inherited NODE_OPTIONS/module/proxy settings are absent.

Only authored inline JavaScript and builtin node:fs/node:child_process
are used. --no-addons disables native addon loading. There is no shell,
repository JS import, credential input or URL. The child uses the same
chosen image, minimal environment and explicit stdio mode with windowsHide.

The parent first publishes a nonce/PID/actual-version start marker. It
also records read-only source/self image metadata visibility and harmless
NUL O_RDONLY/O_WRONLY open/close observations (no data read or written).
Child spawn failure publishes e.code, errno and syscall. Each diagnostic
uses a unique temporary file created with wx, then renameSync after write
completion; marker reads are bounded to256 ASCII bytes.

Successful spawn additionally publishes the parent/child PID relationship.
The child independently executes JS and publishes its own nonce/PID/version.
Within10 seconds, BOTH readiness markers must match exact nonces, PIDs and
Node22.22.3. Missing child readiness never becomes a passing result merely
because the parent start marker exists.

The child's reported identity must match native job enumeration, then its
held process handle must still belong to that exact job and its image must
match the selected runtime. Both actual AppContainer tokens require the
fresh package SID, zero capabilities, Low IL4096, no elevation and no enabled
admin group. Current trials independently collect ordinary-token detail
fields too; historical results with DetailFieldsObserved=false leave those
fields unobserved, and their default values are not measurements.

Native enumeration accounts for the two Node processes and up to two
auxiliary members within unchanged limit4. Each auxiliary must be exact
system conhost.exe and receives held membership/image/liveness/token
observations. Unknown/duplicate members fail. Console token matching is
reported separately from Node token enforcement.

Both ready Node processes and all observed consoles must be live before
the sole job handle closes, then each held handle is checked with a wait
bounded to5s after job closure.
A finite30s child timer is a fallback bound, not the job-close evidence.

Six trials per named configuration: ordinary normal/detached before,
AppContainer normal/detached, ordinary normal/detached after.
Detached uses detached:true, ignored/inherited stdio as explicitly selected,
and child.unref(). This tests that Node API configuration only. Explicit
Windows CREATE_BREAKAWAY_FROM_JOB remains untested.

## Cleanup and limits

Error cleanup terminates/drains only the owned job and waits on verified
held handles. Nonmember/PID-reused handles are closed without termination.
If child containment was not corroborated after parent resume, empty job
membership alone cannot prove no escaped child: overall cleanup remains
unverified and the profile is retained for targeted follow-up.
Profile deletion requires cleanup, followed by package-root enumeration
and registry mapping absence. No recursive manual cleanup is used.

Readiness proves these bounded JS statements ran. It does not establish
editor compatibility, arbitrary application health, malicious same-user
resistance, general file/network isolation, broker containment, supervisor
crash, dedicated worker token, protected approvals or production readiness.
All corresponding result gates remain false. Never elevate these mutable
diagnostic fixtures or reuse their construction as a privileged deployment.

## Validation

Fixed system Framework64 compile-only and Windows PowerShell5.1 parse
checks pass. Independent actual-source reviews addressed atomic marker
publication and explicit console accounting. Runtime findings are recorded
separately, with failures kept distinct from selected configurations.

Reproduce with ordinary PowerShell:
scripts/creative-tools/worker-appcontainer-node-readiness-spike.ps1
[-RuntimeLocation profile|installed] [-StdioMode ignore|inherit].
Keep stacked Draft; no merge/deployment.

Primary references matched to installed Node22.22.3:
- https://nodejs.org/download/release/v22.22.3/docs/api/cli.html
- https://nodejs.org/download/release/v22.22.3/docs/api/child_process.html
- https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
- https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-for-legacy-applications-

## Recorded Windows result

2026-10-21T15:29:10Z, ordinary-user host, profile/ignore: six of six
trials passed. All four ordinary control trials measured Medium IL8192. Both actual
AppContainer parent/child pairs measured the expected package SID, zero
capabilities, Low IL4096, no elevation and no enabled administrator group.
The normal AppContainer pair published JS readiness in178ms; detached178ms.
All Node and observed conhost handles were live before job close and signaled
after close. Profile deletion API, package storage absence and registry
mapping absence all passed. See PROFILE_READINESS_RESULT.json.

The installed-runtime and LocalState-runtime failures are retained as
historical, distinct configurations. Installed-source metadata returned
EPERM from AppContainer even in the successful final run; staged self-image
metadata was accessible. This supports the staging diagnostic but does not
isolate a single causal variable. NUL open/close succeeded in earlier failed
runs and in the successful run; that observation does not audit every libuv
stdio operation. The AC-staged ordinary-control failure separately records
why final ordinary controls use the installed image: a direct staged-image
launch without AppContainer attributes still measured Low IL4096 and its
marker write returned EPERM. Existing file security was never modified.

Only profile/ignore has passed final six-case validation. inherit remains
an available, unexecuted diagnostic variant. Node detached is not an explicit
Windows breakaway request. Worker, crash, broker, executable-trust and
production gates remain false. Later cleanup observations never rewrite the
conservative cleanup fields of original failed results.
