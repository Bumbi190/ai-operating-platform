# P44 prospective administrator ACL inspection — PRE-APPROVAL ONLY

2026-10-23; HULTGREN; development baseline `7201923`, branch
`feat/atlas-creative-p44-acl-audit-design`. This is a read-only audit design.
**No administrator inspection is authorized or performed by this deliverable.**
The actual protected root remains UNKNOWN / not inspected.

## Authority and future operator procedure

An independent human must review the exact literal below, its Windows module
identities, the ancestor assessment and the private evidence protocol. The
operator may copy it ONLY after a separate exact authorization naming HULTGREN,
the ten fixed directories, this literal's reviewed revision, operator, time window
and read-only metadata purpose. Prior P30 approval does not carry forward.
Independent review of this P44 literal is still pending; parser success is not review.

The future operator must arrange a fresh, private administrator console using
the Windows-owned `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
with `-NoProfile` (Windows PowerShell 5.1, Desktop, 64-bit). This document contains
no UAC launch command and does not authorize obtaining elevation. Never load a
repository script, Node module, staging executable or policy file in that console.
Do not change execution policy. Independently verify that Windows, its System32
and GAC module ancestors and binaries are Windows-controlled and free from
untrusted writes/reparse substitution before using this procedure. If that trust
cannot be established independently, STOP; the block cannot bootstrap its own trust.

Use a private local console with no transcript, redirection, screen sharing,
terminal logging, remote session recording or clipboard synchronization. If
mandatory recording could retain raw metadata, STOP before inspection. This
procedure makes no file writes; raw evidence stays only in the private operator
console and process memory. Do not save, paste into chat, upload, screenshot,
pipe to a file, or publish raw owner/SID/ACL/account output. Clear the private
clipboard using the operator's approved handling process and close the console
after review; do not add cleanup commands to this literal.

Freeze concurrent privileged changes. At every prompt the independent operator
must assess the displayed parent metadata *before* permitting the next read.
Pressing Enter or giving any other response stops. No response is inferred.
The manual acknowledgement records only permission to continue this audit; it
does not certify effective ACLs or authorize installation. No automatic repair,
account/ledger/service/firewall change, worker activation or creative execution.

## Reviewed-form literal — not executed, independent approval pending

This fence is reference text, not an elevated worktree script. Do not extract
and run it from the checkout. Review and separately authorize exact bytes first.
All data paths are fixed literals; there are no arbitrary path/account selectors.
The process-local module search restriction is not a persistent setting change.

```powershell
$ErrorActionPreference = 'Stop'
$PSModuleAutoLoadingPreference = 'None'
$env:PSModulePath = 'C:\Windows\System32\WindowsPowerShell\v1.0\Modules'
Microsoft.PowerShell.Core\Set-StrictMode -Version Latest
try {
    if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or
        $PSVersionTable.PSEdition -ne 'Desktop' -or -not [Environment]::Is64BitProcess -or
        [Environment]::MachineName -ine 'HULTGREN' -or
        [Environment]::SystemDirectory -ine 'C:\Windows\System32' -or
        [Diagnostics.Process]::GetCurrentProcess().MainModule.FileName -ine
            'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe') {
        throw 'STOP: unexpected host'
    }
    $homeFixed = 'C:\Windows\System32\WindowsPowerShell\v1.0'
    $gac = 'C:\Windows\Microsoft.Net\assembly\GAC_MSIL'
    # Exact module object Name, Version and Path, including nested modules.
    $allowedModules = @(
        @('Microsoft.PowerShell.Management', '3.1.0.0', "$homeFixed\Modules\Microsoft.PowerShell.Management\Microsoft.PowerShell.Management.psd1"),
        @('Microsoft.PowerShell.Security', '3.0.0.0', "$homeFixed\Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1"),
        @('Microsoft.PowerShell.Utility', '3.1.0.0', "$homeFixed\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1"),
        @('Microsoft.PowerShell.Commands.Management.dll', '3.0.0.0', "$gac\Microsoft.PowerShell.Commands.Management\v4.0_3.0.0.0__31bf3856ad364e35\Microsoft.PowerShell.Commands.Management.dll"),
        @('Microsoft.PowerShell.Security.dll', '3.0.0.0', "$gac\Microsoft.PowerShell.Security\v4.0_3.0.0.0__31bf3856ad364e35\Microsoft.PowerShell.Security.dll"),
        @('Microsoft.PowerShell.Commands.Utility.dll', '3.0.0.0', "$gac\Microsoft.PowerShell.Commands.Utility\v4.0_3.0.0.0__31bf3856ad364e35\Microsoft.PowerShell.Commands.Utility.dll"),
        @('Microsoft.PowerShell.Utility', '0.0', "$homeFixed\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psm1"),
        @('Microsoft.PowerShell.LocalAccounts', '1.0.0.0', "$homeFixed\Modules\Microsoft.PowerShell.LocalAccounts\1.0.0.0\Microsoft.Powershell.LocalAccounts.dll")
    )
    function Assert-P44Modules {
        foreach ($m in @(Microsoft.PowerShell.Core\Get-Module -All)) {
            $matches = 0
            foreach ($a in $allowedModules) {
                if ($m.Name -ceq $a[0] -and $m.Version.ToString() -ceq $a[1] -and $m.Path -ieq $a[2]) { $matches++ }
            }
            if ($matches -ne 1) { throw 'STOP: unexpected loaded module identity' }
        }
    }
    Assert-P44Modules
    $imports = @(
        @('Microsoft.PowerShell.Management', '3.1.0.0', 'eefcb906-b326-4e99-9f54-8b4bb6ef3c6d', "$homeFixed\Modules\Microsoft.PowerShell.Management\Microsoft.PowerShell.Management.psd1"),
        @('Microsoft.PowerShell.Security', '3.0.0.0', 'a94c8c7e-9810-47c0-b8af-65089c13a35a', "$homeFixed\Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1"),
        @('Microsoft.PowerShell.Utility', '3.1.0.0', '1da87e53-152b-403e-98dc-74d7b4d63d59', "$homeFixed\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1"),
        @('Microsoft.PowerShell.LocalAccounts', '1.0.0.0', '8e362604-2c0b-448f-a414-a6a690a644e2', "$homeFixed\Modules\Microsoft.PowerShell.LocalAccounts\1.0.0.0\Microsoft.PowerShell.LocalAccounts.psd1")
    )
    foreach ($pin in $imports) {
        $imported = @(Microsoft.PowerShell.Core\Import-Module -Name $pin[3] -RequiredVersion $pin[1] -PassThru -ErrorAction Stop)
        if ($imported.Count -ne 1 -or $imported[0].Name -cne $pin[0] -or
            $imported[0].Version.ToString() -cne $pin[1] -or
            $imported[0].Guid.ToString() -ine $pin[2]) { throw 'STOP: module pin mismatch' }
        Assert-P44Modules
    }
    function Assert-P44Identity {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = [Security.Principal.WindowsPrincipal]::new($identity)
        if (-not $identity.IsAuthenticated -or $identity.IsSystem -or
            $identity.ImpersonationLevel.ToString() -ne 'None' -or
            -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or
            -not $principal.IsInRole([Security.Principal.SecurityIdentifier]::new('S-1-5-4')) -or
            $identity.User.Value -in @('S-1-5-18', 'S-1-5-19', 'S-1-5-20')) {
            throw 'STOP: fresh interactive administrator identity required'
        }
        $account = Microsoft.PowerShell.LocalAccounts\Get-LocalUser -Name 'omnira-media-worker' -ErrorAction Stop
        if ($account.Enabled -ne $false -or $account.SID.Value -eq $identity.User.Value -or
            $account.SID.Value -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$') { throw 'STOP: worker identity or disabled state unknown/unsafe' }
        $members = @(Microsoft.PowerShell.LocalAccounts\Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop)
        foreach ($member in $members) {
            # Unresolved and nested groups cannot prove nonadmin membership.
            if ($null -eq $member.SID -or $member.ObjectClass -ne 'User' -or
                $member.SID.Value -eq $account.SID.Value) { throw 'STOP: worker nonadmin status unresolved/unsafe' }
        }
        [pscustomobject]@{ OperatorSid = $identity.User.Value; WorkerSid = $account.SID.Value; WorkerDisabled = $true; DirectAdminMembershipAbsent = $true }
    }
    $initialIdentity = Assert-P44Identity
    $initialIdentity | Microsoft.PowerShell.Utility\ConvertTo-Json
    if ((Microsoft.PowerShell.Utility\Read-Host 'Privately confirm fresh operator identity and disabled local nonadmin worker; type IDENTITY-REVIEWED') -cne 'IDENTITY-REVIEWED') {
        throw 'STOP: identity review not confirmed'
    }
    function Read-P44Metadata([string]$fixedPath) {
        $item = Microsoft.PowerShell.Management\Get-Item -LiteralPath $fixedPath -Force -ErrorAction Stop
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'STOP: type/reparse guard'
        }
        $acl = Microsoft.PowerShell.Security\Get-Acl -LiteralPath $fixedPath -ErrorAction Stop
        $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
        if ($owner -notin @('S-1-5-18', 'S-1-5-32-544')) { throw 'STOP: untrusted owner' }
        $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
        [pscustomobject]@{
            Path = $fixedPath; Type = 'directory'; Reparse = $false; OwnerSid = $owner
            InheritanceProtected = $acl.AreAccessRulesProtected
            Rules = @($rules | Microsoft.PowerShell.Core\ForEach-Object {
                [pscustomobject]@{
                    Sid = $_.IdentityReference.Value; AccessType = $_.AccessControlType.ToString()
                    Rights = [long]$_.FileSystemRights; Inherited = [bool]$_.IsInherited
                    InheritanceFlags = [int]$_.InheritanceFlags; PropagationFlags = [int]$_.PropagationFlags
                }
            })
        }
    }
    $paths = @(
        'C:\ProgramData',
        'C:\ProgramData\OmniraCreativeWorker',
        'C:\ProgramData\OmniraCreativeWorker\bin',
        'C:\ProgramData\OmniraCreativeWorker\queue',
        'C:\ProgramData\OmniraCreativeWorker\input',
        'C:\ProgramData\OmniraCreativeWorker\output',
        'C:\ProgramData\OmniraCreativeWorker\temp',
        'C:\ProgramData\OmniraCreativeWorker\receipts',
        'C:\ProgramData\OmniraCreativeWorker\approvals',
        'C:\ProgramData\OmniraCreativeWorker\approvals\nonces'
    )
    $reviewed = @{}
    foreach ($path in $paths) {
        Assert-P44Modules
        $nowIdentity = Assert-P44Identity
        if ($nowIdentity.OperatorSid -cne $initialIdentity.OperatorSid -or
            $nowIdentity.WorkerSid -cne $initialIdentity.WorkerSid) { throw 'STOP: identity drift' }
        # Revalidate only previously reviewed ancestors, from ProgramData down.
        # Do not look up any descendant until every ancestor is reviewed again.
        foreach ($parent in $paths) {
            if ($path.StartsWith($parent + '\', [StringComparison]::OrdinalIgnoreCase)) {
                if (-not $reviewed.ContainsKey($parent)) { throw 'STOP: ancestor not reviewed' }
                $again = Read-P44Metadata $parent | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 6 -Compress
                if ($again -cne $reviewed[$parent]) { throw 'STOP: ancestor metadata drift' }
            }
        }
        $metadata = Read-P44Metadata $path
        $metadata | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 6
        if ((Microsoft.PowerShell.Utility\Read-Host 'Assess owner, all ACEs, applicability, inherited flags and parent replacement rights privately. If safe for NEXT metadata read ONLY, type ANCESTOR-REVIEWED') -cne 'ANCESTOR-REVIEWED') {
            throw 'STOP: ancestor trust not established'
        }
        $reviewed[$path] = $metadata | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 6 -Compress
    }
    # Final root-first drift check; still not a held-handle/effective-access proof.
    foreach ($path in $paths) {
        $again = Read-P44Metadata $path | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 6 -Compress
        if ($again -cne $reviewed[$path]) { throw 'STOP: final metadata drift' }
    }
    Assert-P44Modules
    $finalIdentity = Assert-P44Identity
    if ($finalIdentity.OperatorSid -cne $initialIdentity.OperatorSid -or
        $finalIdentity.WorkerSid -cne $initialIdentity.WorkerSid) { throw 'STOP: final identity drift' }
    Microsoft.PowerShell.Utility\Write-Host 'Metadata-only review complete. All installation, acceptance, execution and publication gates remain CLOSED.'
} catch {
    # Do not serialize exceptions: errors may contain private paths or identities.
    # Core engine exception only: Utility may itself have failed provenance.
    throw 'STOP: audit unverified; inspect no descendants; no changes or repairs authorized.'
}
```

The generic catch intentionally withholds details. Not found, unreadable,
access denied and unavailable queries mean **unverified**, never durable absence
or permission to create. No `Get-ChildItem`, recursion, file-content read, receipt
enumeration, credential read or SACL acquisition occurs. The functions are local
to this reviewed text and called only with the fixed list; do not reuse them with
new paths. A failed leaf stops the entire audit, including remaining siblings.

## Exact stop conditions and manual policy

STOP on missing/unreadable/reparse/non-directory metadata; wrong or unknown
owner; unknown/inconsistent ACE or flags; unexpected deny or duplicate ACE;
identity, module, account-query or host failure; worker enabled; unknown
nonadmin membership; parent review refused; any before/after drift; concurrent
changes; any unavailable private handling or independent review prerequisite.
Do not remove a deny to make the audit pass. Do not repair inheritance or take
ownership. Review ProgramData first and root second; only then inspect fixed
ordinary children, approvals, and finally nonces. Root trust is required before
any child; approvals trust is required before nonces.

SYSTEM and Administrators are trusted owners. For root and ordinary private
children require protected inheritance, explicit SYSTEM/Administrators FullControl
and only the exact disabled local worker's narrow explicit RX on root/bin/queue/
input/receipts, Modify on output/temp. Both trusted ACEs apply to this directory,
subdirectories and files: inheritance flags ContainerInherit|ObjectInherit (3),
propagation None (0), not inherited. Worker ACEs use the same flags. Worker must
never gain WriteData/AppendData/WriteExtendedAttributes/WriteAttributes/Delete on
RX locations, nor DeleteSubdirectoriesAndFiles, ChangePermissions or TakeOwnership
anywhere. Output/temp Modify does not include parent DELETE_CHILD or ACL/owner
control. Private approvals and nonces require exactly the two trusted explicit
FullControl allows, protected inheritance, and **no worker or other ACE**, with
flags 3/0. Reject any unexpected Allow/Deny or ambiguous applicability.

ProgramData is a distinguished ancestor, not a private-ledger folder. Do not
force the private policy onto it or accept it automatically. The independent
operator must interpret every applicable explicit/inherited ACE, owner, group,
inherit-only/no-propagate flag, and this-folder vs descendant scope. Assess
untrusted WriteData, AppendData, DELETE, **DELETE_CHILD on the parent**,
WRITE_DAC/ChangePermissions and WRITE_OWNER/TakeOwnership, including atomic masks
and group-derived rights. A child DACL alone cannot prevent replacement via
parent rights. Creation of unrelated ProgramData children is not by itself proof
of permission to replace this existing root; any unresolved distinction stops
descent. No metadata comparison certifies effective access; actual token/groups,
privileges, owner rights, effective delete semantics and other ancestors remain
independent acceptance work. The literal relies on this explicit manual stop,
not on an automated ACL verdict.

Revalidation cannot prevent a substitution restored between checks. No native
parent-relative open, retained directory handle, share-denial or effective-token
test is implemented. Windows volume/Windows-owned ancestry trust is a separate
precondition; this procedure's project inspection begins at ProgramData and
does not expand into extra paths. Unknown race safety remains a blocker to copy.

## Offline evaluator contract and limitations

`evaluateAclSnapshot(snapshot)` in `p44-acl-policy.mjs` takes only inert, sanitized
in-memory synthetic data. It has no CLI, imports, logging, filesystem, process,
environment, shell or network access. Do not supply raw machine ACLs or run it
elevated. It is deliberately stricter than typical ProgramData metadata; it is
not a live collector or an alternative to the independent ancestor assessment.

Exact finite schema (every listed field required; extra fields rejected):

- Top: `schema: 'omnira.creative.p44.synthetic-acl.v1'`, `worker`, `folders`.
- Worker: `sid` synthetic canonical local-account SID `S-1-5-21-a-b-c-rid`
  with four positive uint32 components; `status: disabled|enabled|unknown`;
  `nonAdmin: true|false|null` (null is unknown).
- Folders: exactly ten distinct IDs `programData`, `root`, `bin`, `queue`,
  `input`, `output`, `temp`, `receipts`, `approvals`, `nonces` (no paths).
  Each has exactly `id`, `state: observed|unknown`, `type: directory|file|null`,
  `reparse: boolean|null`, `ownerSid: SID|null`,
  `inheritanceProtected: boolean|null`, `aces: array|null`.
- ACE: exactly `sid`, `type: Allow` (Deny rejected), `rights` numeric mask,
  `inherited` boolean, `inheritanceFlags` integer 0..3,
  `propagationFlags` integer 0..3. At most 32 ACEs; no duplicate principals.
  Ordinary SID grammar allows revision 1, up to 15 uint32 subauthorities and
  a 48-bit identifier authority. No accessor properties or sparse/extra arrays.
  Inputs are data, not executable Proxy objects; evaluating arbitrary JavaScript
  objects cannot promise isolation from caller-supplied Proxy traps.

Masks are actual .NET FileSystemRights: FullControl 2032127, ReadAndExecute
131241, Modify 197055, Synchronize 1048576. Worker RX/Modify optionally includes
Synchronize (1179817/1245631). The recognized atomic bit set is bounded by
FullControl; negative, zero, fractional, nonnumeric, nonfinite, out-of-uint32,
generic high-bit and undefined-bit masks are rejected before BigInt comparison.
Important atomic masks: WriteData 2, AppendData 4, WriteExtendedAttributes 16,
DeleteSubdirectoriesAndFiles 64, WriteAttributes 256, Delete 65536,
ChangePermissions 262144, TakeOwnership 524288. No signed JS bitwise coercion.

Root/ordinary children and ledger use the exact policy above. The intentionally
minimal synthetic ProgramData fixture has only the two trusted explicit
FullControl ACEs and trusted owner; inherited-state boolean may differ there.
Even this fixture yields `needs-manual-ancestor-check`, never acceptance.
Other actual ProgramData layouts require human assessment and do not become
accepted by being omitted or represented as unknown. Known unsafe evidence is
rejected; schema-valid unknown evidence is unverified. No result says missing.

Output contains only fixed schema/status strings, allowlisted folder IDs,
redacted per-folder statuses, `needsManualAncestorCheck: true`, and false gates.
`candidate-match` means synthetic metadata comparison only, never a real ACL
proof. All eight gates remain false: `protectedAclAcceptanceVerified`,
`independentOperatorVerified`, `realWorkerTokenVerified`, `installationAuthorized`,
`creativeExecutionAuthorized`, `workerActivated`, `publishAuthorized`,
`productionReady`. All nine P42 `authorities` are always false:
ActualWorkerTokenVerified, RootAclTrustVerified, NetworkEgressVerified,
RealHumanApprovalVerified, ArbitraryBrokerContainmentVerified,
GeneralExecutableTrustVerified, CreativeExecutionAuthorized, PublishAuthorized,
ProductionReady. No input authority field can override them.

## Private evidence, future copy blockers and rollback

The independent operator may share only a redacted conclusion: host label,
timestamp/offset, authorized procedure revision, whether independent review took
place, fixed folder IDs with candidate/unverified/blocked verdicts and categorical
reason (ancestor unresolved, unknown owner, unsafe rights, query unavailable,
reparse/type, drift). Omit personal identity, raw SID/ACE/path dumps and receipt
contents. Raw metadata remains exclusively in the private console; any later
durable private evidence capture requires its own reviewed handling procedure.
No output from this audit is a signed approval or ledger receipt.

Any stop condition or unresolved parent replacement right blocks future
protected copy. Even a completed metadata review leaves full ledger/receipt tree,
replay/revocation, key custody, authenticated operator approval anchor, trusted
bootstrap provenance, source/destination held-handle and hardlink protection,
installed bytes/runtime trust, real worker token/groups, network/process/broker
containment and exact target absence unverified. Proposed `bin\launcher`,
`control` and `imports` are outside this ten-folder audit. Nothing here permits
creating or inspecting them. The P43 design's separate A/B0/B1/C/D decisions
remain closed. No source hash or synthetic candidate authorizes a copy or job.

Rollback: **none**. This procedure reads metadata and changes no persistent
state. On failure stop and close the private console; preserve all existing
accounts, directories, receipts, nonces and revocation history. Do not delete,
reset permissions, provision missing paths or attempt recovery automatically.

## Historical evidence — not refreshed by P44

P30 records separately authorized 2026-10-21 administrator observations and
two-directory creation/independent verification. These are historical, not current
P44 ACL acceptance. P43 records non-elevated inventories and a disabled worker
observation on 2026-10-23; protected-root ACL remained UNKNOWN/not_inspected.
P30's isolation evidence does not establish a dedicated worker's effective
network/token acceptance. Those old results are not tests run in this slice.

## Observed P44 development evidence (ordinary sandbox only)

Development used current HULTGREN non-elevated sandbox and existing branch at
`7201923`. Initial Git ownership refusal was handled using per-command
`safe.directory`; no global configuration changed. Status was clean, with a
global-ignore read-permission warning. No root AGENTS.md was present.

The five requested source documents/scripts were read before implementation.
Ordinary system-only module metadata checks observed PowerShell 5.1.26100.9711,
HULTGREN, fixed System32 PowerShell and the versioned LocalAccounts manifest.
Management/Security/Utility manifest versions were 3.1.0.0/3.0.0.0/3.1.0.0;
their nested DLLs used the exact Windows GAC paths pinned above. LocalAccounts
import metadata was version 1.0.0.0 with the pinned DLL path and GUID. These were
non-elevated system-module checks, not protected-root or worker account queries.
Windows ownership/provenance is still a future independent precondition.

Test-first sequence: missing-module setup failure (exit 1), then placeholder
API red run: 0/84 passed, exit 1, failing false-gate assertions. Implementation
green run: 84/84 passed, exit 0. All fixtures are invented in memory; no machine
ACL, token or account is used by the tests.

Final targeted command:
`& 'C:\Program Files\nodejs\node.exe' --test --test-reporter=spec scripts/creative-tools/p44-acl-policy.test.mjs`:
**84 passed, 0 failed, 0 skipped/cancelled, exit 0**, Node v22.22.3.
Coverage includes positive candidate/redaction/all false gates; unknown evidence;
owners, inheritance and flags; unexpected/duplicate/missing ACEs; worker enabled,
admin or unknown nonadmin; malformed/overflow/trusted-principal worker SIDs;
RX writes, ledger access, insufficient Modify; every named atomic write/control
right; invalid masks/sizes/schema/paths; non-directory/reparse; and accessors.

The single Markdown PowerShell fence was passed only to the ordinary session's
`System.Management.Automation.Language.Parser.ParseInput`: **zero parser errors,
exit 0**. No scriptblock invocation, evaluation or administrator execution.
`git diff --check` exited 0. Separate no-index `--check` comparisons against
`/dev/null` covered all three new untracked files with no whitespace errors;
each returned 1 for added-file differences. An intermediate wrapper incorrectly
treated that expected 1 as failure and stopped after the first file; rerunning
with the documented no-index exit semantics checked all three successfully.
Git emitted only its LF-to-CRLF normalization warnings. Final scope inspection
showed exactly these three untracked files and no tracked-file modifications.
An ordinary current-token administrator-role check returned **false**; this is
development-session evidence only, not an actual worker-token qualification.

No native P40/P42 suite, broad CI, paid service, protected-root inspection,
installation, administrator execution, UAC, execution-policy change,
ACL/firewall/account/ledger/service mutation, worker/broker/editor or
SyntheticLauncher execution occurred. No commit, push or PR is authorized.

## Independent-review correction and final ordinary-user qualification (2026-10-23)

A separate **read-only static reviewer** inspected the P44 proposal and found no elevation/installation/creative-execution authority in the literal. It did find one **Medium** issue in the pure offline evaluator: a genuine Array with a custom prototype could expose an inherited Symbol.iterator getter or override, causing caller-controlled code to execute during iteration before a refusal. The original accessor regression covered only an object's own getter. This is an offline evaluator concern, not evidence of Windows ACL compromise.

Three new focused regressions were added: inherited iterator getters on a folders array and on its nested ACE array, a hostile Array subclass, and a separate 40-case matrix of forbidden atomic rights on otherwise *permitted* RX worker ACEs. With original implementation these additions produced **85/87 passed, 2 failed, exit 1**; the failures were in the two custom-array tests. The fix requires exactly Array.prototype (not custom array prototypes) during finite array validation, and traverses validated arrays by bounded own numeric indices rather than inherited iteration. No Windows command or privileged code was added. The final fresh normal-user test run passed **87/87, exit 0, zero skipped**. This supersedes the earlier 84/84 result.

The separate ordinary-user PowerShell static Parser.ParseInput validation extracted exactly one future-inspection literal from this document, **145 lines, 0 parser errors**, without executing it. This is not an elevated or live ACL test. New module source SHA-256: `5fac84401ab8b83b631c8ffd5217d407d5756e0fcf12d31bf651dd64f6f309d5`; corresponding test source SHA-256: `cf48f3417f23c346ffc3d0d4236f8b9114b45daa3654f5ee718325c9186b5853`. Neither hash is an independent signature or trusted installation anchor.

P44 still has **no real protected-root ACL evidence**. The disabled worker remains unchanged, all authorization/acceptance fields are false, and no real console elevation, worker activation, ACL/firewall change, protected copy, creative execution or deployment was performed. The prospective literal needs its own independently approved read-only administrator inspection before anyone runs it; even that later inspection cannot by itself authorize installation or PhotoCraft.
