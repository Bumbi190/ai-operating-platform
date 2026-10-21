# Atlas Creative P29 — protected approval ledger: plan only, never apply

Date: 2026-10-21
Branch: `feat/atlas-creative-p29-ledger-bootstrap-plan`
Parent: P28 Draft PR #498

## Observed blocker, verified on Hultgren

The existing worker-account and NTFS audit confirms that the Windows
local `omnira-media-worker` account is DISABLED, not a local admin
and that its seven established OS directories have expected ACLs.

The separate read-only `worker-approval-ledger-acl-audit.ps1` reports:

- `rootTrusted=true`: the existing ProgramData creative worker root
  passes the trusted owner/root policy check.
- `approvalsFolder.verified=false`, reason `inaccessible_or_missing`.
- `nonceFolder.verified=false`, reason `inaccessible_or_missing`.
- `aclVerified=false`, `installationAuthorized=false`,
  `workerExecutionEnabled=false`.

An interactive user session **cannot distinguish whether** these
paths do not exist or are simply blocked by protected ACLs. Therefore
it is unsafe to create or overwrite either path without an independent
authorized administrator presence/ACL review.

## Exact proposed boundary (not installer code)

Target paths are fixed, not caller-provided:

```text
C:\ProgramData\OmniraCreativeWorker\approvals
C:\ProgramData\OmniraCreativeWorker\approvals\nonces
```

The separate private ledger must use:

- Ownership: `SYSTEM` (`S-1-5-18`) or
  `BUILTIN\Administrators` (`S-1-5-32-544`).
- **Only** those two principals with explicit `FullControl` ACEs;
  inherited ACEs disabled, no reparse points or indirect links.
- No ACE for the ordinary interactive user, Authenticated Users,
  Everyone or the `omnira-media-worker` identity.
- No worker ability to read/rewrite reviewer/approval decisions or
  nonce-consumption evidence; approval events are not execution grants.
- Independently anchored nonce/revocation history and actual human
  reviewer identity must be verified separately. Correct ACLs alone
  do **not** establish independent human approval.

The P29 script `worker-ledger-bootstrap-plan.mjs` reads only the
existing `worker-verify.ps1` and
`worker-approval-ledger-acl-audit.ps1` tools from fixed local paths,
using the full Windows system PowerShell location.
It outputs status, fixed scope, required manual security reviews
and explicit denial flags for activation, execution and publication.

The script has **NO** `--apply`, no ACL-changing code, no editor launch,
no environment/config option to turn on provisioning, and no privilege
escalation mechanism. It refuses to recommend automatic changes for
inaccessible, missing, partial or suspicious approval ledger states.

## Actual read-only result

On Hultgren P29 returned:

```text
status: admin_presence_and_acl_audit_required
workerIsDisabledNonAdminWithSevenAclChecks: true
rootIsTrusted: true
privateLedgerAclObserved: false
approvalPathsExistenceIndependentlyProven: false
effectiveWorkerTokenIsolation: false
networkEgressDenied: false
realHumanApprovalVerified: false
workerAccountEnableAuthorized: false
executionAuthorized: false
publishAuthorized: false
productionReady: false
changesApplied: false
```

### Testing

- P28's GitHub workflow completed **7/7** standard CI checks successfully.
- P29's 8/8 dedicated offline negative and positive unit tests passed:
  unknown or partial ledger, spoofed approval flags, disabled account
  requirements, owner/admin-only ACL expectations, full ledger still
  not sufficient for execution, malformed input and read-only CLI.
- Full P29 creative Node regression is tracked separately in the
  validation evidence; no database changes in P29.
- Earlier P27 CI passed 41/41 PGlite and 27/27 genuine PG17
  integration checks; those runs do not establish host process isolation.

## Next security decision

Do not run an administrator provisioning operation as the interactive
user or through an arbitrary current worktree script. The next
operator-approved step must be an **independent elevated read-only
existence and ACL inspection** of the two exact ledger paths, from
a protected/system-owned tool in a separately reviewed administration
process. If the paths truly are absent and creation is authorized, that
is a *separate reviewed change* with an exact ACL design and rollback.
Do not enable media worker or expose registration and publication
based solely on an ACL audit.

No OS settings, firewall rules, service accounts, Supabase migrations,
media assets or production servers are changed by P29.
