# Atlas Creative P30 - independent administrator inspection and isolation evidence

Date: 2026-10-21. Parent: P29 Draft PR #499, commit `1fe83e973564d8085eb5467164a8aa93856e4472`.
Scope: operator runbook and reference text; explicitly authorized two-directory OS creation and independent verification are recorded in the final dated section. No installed service, Atlas launcher, application runtime change or migration.

## Initial P29 baseline (before the authorized directory creation)

- P29 checkout was clean; commit and Draft PR #499 already existed despite the handoff saying they were unfinished.
- `node --test --test-concurrency=1 scripts/creative-tools/*.test.mjs`: 303 passed, 0 failed, 0 skipped; exit 0.
- `node scripts/creative-tools/worker-ledger-bootstrap-plan.mjs`: `admin_presence_and_acl_audit_required`.
- Disabled nonadmin worker and seven ordinary folder ACL checks: true. Private ledger ACL and independent existence proof: false.
- Token isolation, network denial and real human approval: unverified. Execution/publication/activation authorization: false.
- Registry metadata: EditionID `Core`, DisplayVersion `26H2`, build `26300.9711`. ProductName reports `Windows 10 Home`; this legacy string alone must not determine Windows version/support. Confirm edition/build in Settings before selecting a backend. No OS feature was installed or enabled.

## Reviewed operator procedure (actual inspection results below)

Inspect only these directories, in this order:

1. `C:\ProgramData` (ancestor metadata only).
2. `C:\ProgramData\OmniraCreativeWorker` (trusted project root).
3. `C:\ProgramData\OmniraCreativeWorker\approvals`.
4. `C:\ProgramData\OmniraCreativeWorker\approvals\nonces`.

A separate operator must review this exact procedure and explicitly authorize an elevated read-only inspection. That authorization covers metadata collection only. It does not cover creation, ownership changes, ACL repairs, service/account activation, editor execution or firewall changes.

After explicit authorization, the operator can open Run using Win+R, enter `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile`, press Ctrl+Shift+Enter and review the Windows UAC prompt. This starts the system console only; it does not run the inspection block. Use a fresh elevated console. Do not elevate a command, script, Node dependency, executable or imported policy from any user-writable development worktree. Do not change execution policy. Inspect the reviewed built-in commands below directly in that console. Before metadata commands, the block disables automatic module loading, replaces the process-local module search path with the fixed system module directory, imports three exact system manifests and rejects unexpected module names/paths. Verify these Windows-owned system locations are trusted; stop if not. Module qualification and -NoProfile alone would not pin module provenance. All filesystem cmdlets are module-qualified and use literal fixed paths. No repository code is loaded.

The following combined sample was syntax-validated, not executed as a whole. After explicit operator authorization, equivalent per-path inspections were executed separately in the existing elevated context; see the dated result below. Syntax validation itself is not a security audit or host acceptance test.

```powershell
$ErrorActionPreference = 'Stop'
# Process-local module settings only; no persistent environment changes.
$systemHome = 'C:\Windows\System32\WindowsPowerShell\v1.0'
$env:PSModulePath = $systemHome + '\Modules'
$PSModuleAutoLoadingPreference = 'None'
foreach ($name in @('Microsoft.PowerShell.Management', 'Microsoft.PowerShell.Security', 'Microsoft.PowerShell.Utility')) {
    $manifest = $systemHome + '\Modules\' + $name + '\' + $name + '.psd1'
    $loaded = Microsoft.PowerShell.Core\Import-Module -Name $manifest -Force -PassThru -ErrorAction Stop
    if ($loaded.Name -ne $name -or
        -not $loaded.Path.StartsWith($systemHome + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'STOP: unexpected system module provenance'
    }
}
$principal = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'STOP: independent elevated operator console required'
}
$paths = @(
    'C:\ProgramData',
    'C:\ProgramData\OmniraCreativeWorker',
    'C:\ProgramData\OmniraCreativeWorker\approvals',
    'C:\ProgramData\OmniraCreativeWorker\approvals\nonces'
)
foreach ($path in $paths) {
    try {
        $item = Microsoft.PowerShell.Management\Get-Item -LiteralPath $path -Force -ErrorAction Stop
        if (-not $item.PSIsContainer -or
            ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'STOP: unexpected item type or reparse point; do not inspect descendants'
        }
        $acl = Microsoft.PowerShell.Security\Get-Acl -LiteralPath $path -ErrorAction Stop
        $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
        [pscustomobject]@{
            Path = $path
            Observation = 'present_metadata_readable'
            OwnerSid = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
            InheritanceProtected = $acl.AreAccessRulesProtected
            Rules = @($rules | Microsoft.PowerShell.Core\ForEach-Object {
                [pscustomobject]@{
                    Sid = $_.IdentityReference.Value
                    AccessType = $_.AccessControlType.ToString()
                    Rights = [long]$_.FileSystemRights
                    Inherited = [bool]$_.IsInherited
                    InheritanceFlags = $_.InheritanceFlags.ToString()
                    PropagationFlags = $_.PropagationFlags.ToString()
                }
            })
        } | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 5
    } catch {
        [pscustomobject]@{
            Path = $path
            Observation = 'unverified_stop'
            ErrorType = $_.Exception.GetType().FullName
            ErrorId = $_.FullyQualifiedErrorId
            Category = $_.CategoryInfo.Category.ToString()
        } | Microsoft.PowerShell.Utility\ConvertTo-Json
        break
    }
}
```

Do not interpret `unverified_stop`, access denial or `Test-Path=false` as permission to create a folder. A not-found error is an observation that requires corroboration from the independently inspected parent; it does not establish durable absence. Do not take ownership to make an audit pass. Stop on a reparse point, unexpected object or unreadable metadata. `-Force` does not bypass access restrictions.

This block stops on unreadable/type/reparse errors but deliberately does not compute an ACL pass. The independent reviewer must validate each parent before accepting descendant evidence; if root rights are unsafe, discard descendant observations. There is no atomic handle-based snapshot or protection against concurrent administrator changes. Freeze privileged changes during inspection and recheck before any later operation. Folder names/ACL metadata only: do not print nonce receipt bodies, signing keys, tokens or private approval contents, and do not upload raw ACL metadata to GitHub.

## Independent review and decision record

Record host, local time/UTC offset, operator identity, elevation confirmed, inspected paths, owner SIDs, inheritance and explicit/inherited ACE rights. Keep raw evidence in the operator's protected administration record. Add only a redacted conclusion to project review.

| Observation | Required disposition |
| --- | --- |
| Missing or inaccessible path, ambiguous error, or inconsistent parent | Remain blocked; corroborate independently. No automatic provisioning. |
| Reparse point, unexpected type, unsafe project root or untrusted write ACE | Stop; separate security investigation. No recursive traversal or repair. |
| Both private directories readable with expected owner/ACL | Record directory metadata only; not a complete ledger acceptance. |
| All proposed ledger ACL and receipt-tree checks pass later | Still no worker activation; real approval, replay/revocation and process/network controls remain separate gates. |

For the private `approvals` and `nonces` directories, proposed policy remains: owner SYSTEM `S-1-5-18` or Administrators `S-1-5-32-544`; protected inheritance; explicit FullControl allows only for both trusted SIDs; no worker/ordinary-user ACEs; no reparse points. The ProgramData ancestor is not required to use this private-directory ACL. Review its actual ability to replace the protected child; do not modify ProgramData globally. The project root must satisfy the separately reviewed root policy (trusted owner, no untrusted write/delete/change-owner/change-permission rights).

The manual block does not enumerate or validate nonce receipts. Even acceptable directory metadata cannot set `aclVerified=true`, prove external anchors, or establish real reviewer identity. A later protected, independently reviewed full-tree audit must check bounded allowed entries and every receipt's ACL without exposing contents. Do not run existing worktree auditors elevated to fill this gap.

A later provisioning proposal must name exact changes, before/after ACLs, protected implementation provenance, rollback preserving nonce/revocation history, and explicit operator approval. This document does not authorize that proposal or its execution.

## Windows Home isolation: research and acceptance plan, not a selected implementation

Microsoft documentation checked 2026-10-21:

- [Windows Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/): Home is unsupported. Do not enable unofficial Home bypasses or assume a Pro upgrade is approved. Networking is enabled by default even on supported editions.
- [AppContainer isolation](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation): describes resource/capability boundaries. Candidate for a feasibility spike, not evidence that PhotoCraft/FilmCraft or their GPU/export helpers work under it on this build.
- [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects): manages process groups; ordinary CreateProcess children inherit membership by default, but breakaway flags and broker/WMI-created processes need explicit treatment. Job membership alone does not establish network isolation or per-process security.
- [Get-Acl](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/get-acl?view=powershell-5.1) and [Get-Item](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-item?view=powershell-5.1): metadata inspection; Force does not override security restrictions.

Inference for this project: test a restricted process/capability backend using an inert synthetic helper before trying either editor. Do not select an isolation backend from API documentation alone. A disabled nonadmin account, signed binaries and seven folder ACL checks do not prove process containment or egress denial.

| Future isolated synthetic probe | Required evidence before any editor launch |
| --- | --- |
| Effective token and filesystem | Actual token/group/capability evidence; project-only read access, output/temp writes only; denied protected-ledger, other-project and credential access; no inherited privileged handles. |
| Process descendants | All direct/helper descendants remain constrained; attempted breakaway/broker launch denied or accounted for; parent crash/timeout kills remaining processes; missing containment means no resume. |
| Network | Controlled reachable endpoints and positive control outside containment; deny DNS, TCP/UDP, IPv4/IPv6, LAN, loopback, proxy and helper-process paths as applicable. A disconnected host or one failed HTTP request proves nothing. |
| Export compatibility | Only after containment passes: pinned editor plus helpers, synthetic inputs, verified output/provenance; no fallback to unrestricted execution for compatibility. |
| Protected operator handoff | Authentic operator, exact project/input/tool/output scope, expiry, one-time claim, tamper/replay/revocation rejection and independently protected history. A model-generated approval flag never grants authority. |

All probes above are future acceptance criteria, not executed tests. Building a test fixture is within development scope; changing Windows controls or activating the worker still requires the separate approval in the handoff. No paid upgrade, installation or external API use was performed.

## Validation and handoff

Documentation-only change. Validate the embedded PowerShell with the system parser without invoking it, check the diff for whitespace and scope, and review manually for writes, secrets, elevation mechanisms and false readiness claims. The inherited 303-test baseline was re-run on P29; no runtime code changes require another identical regression run. Keep this PR Draft, stacked on #499. No merge or production deployment authorized.

Review record: a fresh reviewer identified unpinned module discovery in the original draft; the procedure now restricts process-local discovery and imports only fixed Windows system manifests, with provenance checks. A minor limitation remains explicit: ACL acceptance of parent metadata is a manual reviewer decision, not an automated stop; descendant observations must be discarded when a parent fails. No runtime implementation was changed.

Original next action was operator review and an explicitly approved read-only elevated inspection. That authorization and inspection are recorded below. The separate creation proposal remains unapproved; do not run an unspecified admin installer.

## Authorized read-only inspection result - 2026-10-21 13:53 Europe/Stockholm

The operator explicitly approved the read-only administrator inspection in the conversation. The remote process reported an effective administrator token. Inspection used a fresh fixed system PowerShell process with NoProfile, fixed protected system module imports and no worktree imports; no UAC elevation, ACL change or editor launch was requested.

Correction to earlier context assumptions: the P29 ambiguous result did not prove that the remote session was unprivileged. The inspected session is elevated. Do not describe prior `inaccessible_or_missing` reports as confirmed access denial.

The inspections were issued separately so parent metadata could be reviewed before proceeding to a child (stronger sequencing than the combined sample above):

| Item | Observed result |
| --- | --- |
| ProgramData ancestor | Readable ordinary directory, no reparse point, SYSTEM-owned; inspected ancestor rights did not grant ordinary users deletion/replacement of the protected existing project root. This is a metadata assessment, not a full effective-token proof. |
| OmniraCreativeWorker root | Readable ordinary directory, protected inheritance, Administrators owner, FullControl for SYSTEM/Administrators and a read/execute-only extra ACE; no untrusted write/delete/change-owner/change-permission grant observed. |
| approvals | Fixed-path Get-Item returned ItemNotFoundException / PathNotFound / ObjectNotFound. Inspection stopped without inspecting nonces. |
| Parent corroboration | Separate fixed-parent .NET top-level lookup for the exact child name approvals returned 0 matching entries at 2026-10-21T11:53:49.5361619Z. |

Conclusion: approvals was absent at observation time, corroborated through the inspected parent. There is no existing approvals subtree at that moment; nonces was not independently inspected. This observation can become stale and is not authorization to create anything. There is no full-tree acceptance, human-identity proof, network/process proof or readiness grant. No protected settings or files changed. Raw ACL metadata and machine-specific principal identifiers are intentionally omitted from this GitHub document.

## Concrete separate change proposal - not approved or applied

| Target | Before (observed) | Proposed after |
| --- | --- | --- |
| C:\ProgramData\OmniraCreativeWorker\approvals | Absent at inspection time | New ordinary directory; owner Administrators S-1-5-32-544; protected inheritance; explicit FullControl Allow ACEs for SYSTEM S-1-5-18 and Administrators S-1-5-32-544 only, applying to this directory and descendants. |
| C:\ProgramData\OmniraCreativeWorker\approvals\nonces | No approvals parent at inspection time | New ordinary directory with the same owner and exact protected two-principal ACL. |

The proposal changes only these two directories. No root/ProgramData ACL edits, existing-directory repair, worker ACE, account activation, approval/key creation, receipt history, firewall settings or media execution. Installation must create each directory with its final protected security descriptor at creation time; do not create with inherited worker-readable permissions and fix them afterwards.

Before implementation: prepare and independently review a protected-system-only creation procedure. Recheck the trusted parent, path absence and reparse/type conditions immediately beforehand. If either target now exists or any check disagrees, stop; do not reuse/overwrite/take ownership. User-writable worktree code must not be elevated. This proposal is an exact change boundary, not an implementation that has already passed review.

After separately approved creation: read back owner, protected inheritance, all ACE rights/flags and allowed empty tree structure independently. Only that observation can support the proposed ACL check; execution stays denied. If the second creation fails, keep execution denied and report partial state. Rollback may remove only directories newly created by this operation, only after proving they are unchanged and empty; never recursive-delete, reset permissions or remove nonce/revocation evidence. If anything has written data or state is uncertain, preserve it and stop for operator review.

Explicit authorization for this creation/ACL change is still outstanding. The earlier approval covered reading only. Existing worker activation, process/network and real-human-approval gates remain unchanged.

## Authorized creation completed - 2026-10-21 14:02 Europe/Stockholm

The operator separately and explicitly approved preparation and execution of the exact two-directory creation with SYSTEM/Administrators-only protected ACLs. That authorization supersedes the earlier pending-approval status for this change alone.

Procedure and validation:

- Reference text: `ATLAS_CREATIVE_P30_LEDGER_CREATION_REVIEW.txt`, default apply=false. This is a review record, not an installed script, service or Atlas capability. No worktree code was loaded or elevated. The reviewed literal was supplied directly to the fixed system PowerShell executable; the only apply-mode difference was setting the literal apply flag to true.
- Fixed protected-system manifests, disabled module autoload, administrator/disabled-worker checks, trusted ancestor owner/ACL and explicit non-null DACL checks, fixed two-path assertions and in-memory final security descriptor acceptance.
- Native helper compiled successfully during no-write preflight; x64 SECURITY_ATTRIBUTES size 24 confirmed. Native CreateDirectoryW uses a full protected system DLL path, explicit Unicode/exact entrypoint and a binary security descriptor at creation. Existing targets cause an error rather than reuse or ACL repair.
- Fresh independent review found a missing ProgramData owner guard. The in-memory regression first demonstrated unsafe owner acceptance, then passed with the guard. Four synthetic scenarios passed: untrusted parent owner rejected, trusted parents accepted, parent delete-child right rejected, root generic-write rejected. Tests create no filesystem objects. An initial test fixture used directory-service DC instead of filesystem delete-child 0x40; that fixture was corrected before the passing run.
- Earlier preparation failures (nested launcher here-string quoting and the LocalAccounts versioned manifest location) occurred before any protected write. Corrected launcher uses encoded literal text and the exact observed system manifest version 1.0.0.0. Final no-write preflight passed.
- Creation returned CreatedDirectories=2, ExactPrivateAclsVerified=true, EmptyNonceDirectory=true, WorkerEnabled=false, ExecutionAuthorized=false, PublishAuthorized=false; exit 0. No automatic rollback or other changes were necessary.
- A separate fresh process then read the directories via .NET and checked raw binary owner/DACL/ACE flags independently of the creation checker: both directories exist without reparse points; owner Administrators, protected DACL, exactly SYSTEM/Administrators FullControl Allow entries, explicit object/container inheritance, no other ACEs. approvals has exactly the nonces child; nonces is empty. Worker remained disabled.
- Independent verification timestamp: 2026-10-21T12:02:08.2757924Z. Read-only binary verifier reference: `ATLAS_CREATIVE_P30_LEDGER_BINARY_VERIFICATION.txt`. Four in-memory guard cases: `ATLAS_CREATIVE_P30_LEDGER_CREATION_GUARD_TESTS.txt`. These text records are not installed or automatically executed. Raw host-specific ACL metadata is omitted.

The previous ambiguous private-directory presence/ACL blocker is resolved at the observation time. This empty directory scaffold contains no signing keys, operator approvals, nonce/revocation history or protected service. Real reviewer identity and effective worker access/isolation have not been proved. No editor, worker account, network/firewall rule, production migration, publication or merge was enabled/performed. No root/ProgramData ACL was changed.

The existing creative Node baseline remains the earlier fresh 303/303 run; no application/runtime implementation changed. This operation was verified by the four in-memory guard cases, real no-write preflight, native creation readback and independent binary ACL/tree audit. No claim is made that the old composite P29 diagnostic was re-run: elevated worktree auditors were deliberately avoided. Next development scope is the existing process/network and real-human-approval acceptance work, while execution remains disabled.

## Synthetic process lifecycle probe completed - 2026-10-21

Continued the already described process/network acceptance work with a bounded throwaway diagnostic, not a product launcher. Repository exploration found no implemented creative AppContainer/Job Object launcher: existing safety reports correctly keep these properties false. Windows system processmodel.dll is present, but file presence does not prove API availability or supported experimental semantics. No experimental sandbox API was called.

The independently reviewed C# reference text `ATLAS_CREATIVE_P30_JOB_LIFECYCLE_PROBE.txt` was compiled and supplied as a literal to fixed system PowerShell, not loaded from a worktree. Fixed Windows system PowerShell parent/child commands only sleep; no editor or worker account was used. The unnamed, noninherited Job Object was transient, with KillOnJobClose and an active process limit of 2. Parent was created suspended, assigned before resume, then spawned one ordinary child. Membership and both live process handles were checked before closing the last job handle.

Actual result on Hultgren, exit 0, duration 1.36 seconds:

```text
ParentAssignedBeforeResume=true
TwoLiveProcessesObserved=true
ChildMembershipVerified=true
KillOnCloseReadBack=true
ParentExitedOnClose=true
ChildExitedOnClose=true
JobProcessLimit=2
ProbeRunsUnderOperatorToken=true
WorkerAccountUsed=false
MediaEditorStarted=false
NetworkIsolationProven=false
ProductionReady=false
```

Both exact process handles were observed signaled after job close; this successful run left neither test process running. No global process-name cleanup, worker activation, AppContainer profile, firewall/ACL change, installation or persistent OS containment setting was introduced. The test's child/parent inherit the operator context: it is not an unprivileged worker security test.

Fresh review caught a wrong WAIT_TIMEOUT constant in the first draft (259, which belongs to STILL_ACTIVE); corrected to 0x102 before any probe process ran. x64 structure layouts were checked at runtime. Known minor in this throwaway diagnostic: failure cleanup does not promote every termination/wait error into a separate cleanup report; a failed future run must therefore be labeled cleanup-unverified unless handle-signaled checks confirm exit. The observed successful run explicitly confirmed both exits. This reference text must not become a production launcher.

What is established: ordinary CreateProcess child membership and last-handle job cleanup work in this bounded operator-token test on this host. What remains unverified: actual restricted worker/AppContainer token, filesystem/project/credential isolation, breakaway/broker/WMI/helper escape, crash/timeout behavior of a production supervisor, every network path and editor compatibility. Do not set childProcessIsolationVerified/networkEgressVerified or any execution gate true based on this diagnostic.

Next feasibility target: an inert AppContainer helper with no network capabilities, controlled reachable positive endpoints, token evidence and explicit cleanup; test files only. Creating a temporary AppContainer profile or changing any ACL/firewall must be separately reviewed and explicitly scoped before execution. Prefer the established AppContainer/Job APIs for the first spike; Microsoft's newer processmodel.dll APIs are documented as experimental and do not by themselves resolve these requirements. No paid OS upgrade is needed merely to research this path; host feasibility must still be tested.

Sources checked 2026-10-21:

- [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects): ordinary child inheritance, breakaway exceptions and separate process security.
- [WaitForSingleObject](https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-waitforsingleobject): WAIT_TIMEOUT = 0x102.
- [Launch an AppContainer](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer): capability-based token and network boundary; requires actual feasibility evidence here.
- [Experimental Create Process In Sandbox](https://learn.microsoft.com/en-us/windows/win32/secauthz/createprocessinsandbox): experimental processmodel.dll APIs, not a proven backend selection.

## AppContainer token/loopback spike - blocked on operator-session launch, not network acceptance

The operator asked to continue the explicitly proposed inert AppContainer token/network test. Only unique temporary own-user AppContainer profiles, fixed system curl, transient process jobs and loopback HTTP listeners were used; no worker/editor activation, existing profile reuse, firewall exception or project ACL change. The probe was separately reviewed and compile-checked before profile creation. Each created process was checked while suspended and failed token assertions prevented resume.

Observed investigation, in order:

1. Elevated ordinary curl positive control reached the IPv4 test listener (exit 0, one accepted connection). The AppContainer launch failed with Win32 203 before token inspection. The deliberately minimal environment omitted LOCALAPPDATA, which Windows requires for this launch. Retaining this known-folder path resolved that specific creation failure without inheriting proxies, configuration or secrets.
2. Actual suspended AppContainer token: IsAppContainer=true, expected profile SID matched, capability count=0, integrity RID=4096. However Elevated=true and the Administrators group was enabled. The guard refused resume. Thus AppContainer identity and low integrity alone were insufficient for this project's nonadmin-token requirement.
3. Same user's linked limited token was inspected without creating a profile/process: token type=2 (impersonation), level=1 (identification), elevation=0. CreateProcessAsUser and DuplicateTokenEx-to-primary were refused with Win32 1346. No other-process token, password, privilege escalation or token-level bypass was used.
4. Documented CreateRestrictedToken(DISABLE_MAX_PRIVILEGE | LUA_TOKEN, flags=5; not SANDBOX_INERT) produced an own-user primary token, type=1, elevation=false, administrator group disabled. Baselines and AppContainer trials were changed to share this single narrowed primary for a fair comparison. The ordinary baseline then exited with 0xC0000142 (DLL initialization failure) before accepting a network connection. This failure's deeper cause remains unproven; it must not be attributed to network blocking. No desktop/window-station permission change was attempted to work around it.

At that point administrative-origin launch variants were stopped. Final throwaway probe source requires a genuinely standard unelevated operator session before creating a profile and uses the same current user context for both normal controls and AppContainer trials. It does not synthesize linked or alternate primary tokens. All real AppContainer assertions remain in place; no elevated fallback.

Operator handoff:

```powershell
powershell.exe -NoProfile -File "C:\Users\Andre\Projects\Omnira\.worktrees\atlas-creative-p30-admin-inspection-runbook\scripts\creative-tools\worker-appcontainer-loopback-spike.ps1"
```

Run from a fresh ordinary PowerShell window, without Run as administrator. The 22-line wrapper rejects administrator context before imports or source-file reads. It then imports only pinned Windows Utility, compiles the known reference source and runs the bounded diagnostic. No execution-policy bypass or automatic elevation. The C# entry point independently verifies nonadmin/unelevated context before profile creation. Fresh standard-session execution remains outstanding; the network probe is NOT approved by any passing result yet.

Final verification in the current elevated session used the reviewed literal (not worktree execution): source compiled, Run returned requires_unelevated_operator_session, ProfileCreated=false, no trials/processes/listeners created. The guard regression passed. Wrapper parser reported zero syntax errors; it was not executed from the elevated worktree. Fresh review found no remaining handoff blockers; the earlier baseline-call signature mismatch was corrected before compiling this final source.

Cleanup evidence: five unique temporary profiles were actually created across the earlier attempts. Every API deletion succeeded and every created process was observed stopped. Independent targeted own-profile package-root and registry-mapping checks corroborate cleanup; no global profile search/delete was used. The initial native-folder cleanup check targeted its AC subfolder after the whole profile parent had been deleted, causing a false unverified report; corrected to inspect the exact own package root and mapping. Final standard-session probe includes both checks and records its own unique profile name/SID for recovery diagnostics.

Current result: real AppContainer identity/capability/low-integrity observation exists, but no successful nonadmin AppContainer execution or IPv4/IPv6 loopback comparison has completed. Do not claim network denial, worker token isolation, editor compatibility, filesystem secrecy or production readiness. DNS, UDP, LAN, Internet, proxies, breakaway and private/project file tests remain outstanding. Worker stays disabled; previous protected ledger ACL success is unaffected.

Sources checked:

- [Launch an AppContainer](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer): capabilities and LOCALAPPDATA.
- [CreateAppContainerProfile](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-createappcontainerprofile) and [DeleteAppContainerProfile](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-deleteappcontainerprofile): own-user temporary profile lifecycle.
- [DuplicateTokenEx](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-duplicatetokenex): primary versus impersonation token requirements.
- [CreateRestrictedToken](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken): documented narrowing flags and own-primary process creation.

## Standard-user wrapper argument bug fixed

The operator's screenshot showed VariableIsUndefined for args before any probe ran. Reproduced in a fresh in-memory PowerShell runspace: CmdletBinding does not supply args; StrictMode rejects the manual args.Count read. Removed that redundant read; advanced binding already rejects unexpected named/positional arguments. Four checks against the actual wrapper header/guard passed: no arguments reaches the next guard without errors, unknown named argument rejected, unknown positional argument rejected, elevated context still rejected before imports/source/profile creation. No network/profile probe was started during these checks. The same standard-user command can now be retried. Network acceptance remains unverified.

### Standard-user IPv4 timeout evidence and reporting correction

Operator supplied actual standard-user output: profile `omnira.artcraft.probe.a4498351e41e403caafa032d2b92d90e`; IPv4 baseline before/after exit 0 and one accept each, restricted exit 28 and zero accepts. Token observations all met the required AppContainer/package SID/zero capability/low integrity/unelevated/admin-disabled conditions. All process and profile cleanup observations were true; worker/editor/firewall/project ACL use remained false. IPv6 was not reached. This is bounded non-connectivity evidence, not verified isolation or production readiness.

The `win32=24` suffix was stale last-error data appended by a managed assertion, not the curl failure code. Reporting now keeps exit 28 inconclusive, records an explicit restricted outcome, and gathers IPv6 evidence before reporting aggregate isolation unverified. Exit 7 with zero accepts remains the only passing restricted result. Native/token/positive-control/cleanup guards are unchanged. Curl primary error reference: https://curl.se/libcurl/c/libcurl-errors.html (7: connection failed; 28: operation timed out).

Verified six classification cases (7/0, 28/0, 0/1, 7/1, 28/1, 0/0), source-to-reviewed-literal equality, no early managed assertion, aggregate placement, and git diff --check. Tests executed only a fixed reviewed pure classification literal; no AppContainer/network probe was run in the administrator remote session. Independent review of supplied logic found no blocker. Await a fresh standard-user run; worker activation remains blocked.
