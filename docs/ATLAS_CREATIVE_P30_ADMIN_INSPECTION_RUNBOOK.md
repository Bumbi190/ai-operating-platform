# Atlas Creative P30 - independent administrator inspection and isolation evidence

Date: 2026-10-21. Parent: P29 Draft PR #499, commit `1fe83e973564d8085eb5467164a8aa93856e4472`.
Scope: reviewable operator instructions only. No installer, launcher, migration or runtime change.

## Current evidence, independently rechecked in this session

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
