# Atlas Creative Worker — Windows 11 Home provisioning (P4)

Date: 2026-10-20 · Machine: HULTGREN · Repo: ai-operating-platform
Branch: `feat/atlas-creative-tools-p0`

## Verified state after operator provisioning

- The operator executed `worker-provision.ps1 -Apply` manually in an elevated
  Windows PowerShell window; the creation receipt reported success and
  `productionReady=false`. Do not rerun this creation step.
- The non-elevated Desktop Commander session independently confirmed that
  local account `omnira-media-worker` **exists**, is **disabled**, and does
  not belong to local Administrators.
- The ordinary non-elevated session could not inspect the protected NTFS ACLs;
  it correctly returned `restrictedAclsVerified=false` and null existence for
  unreadable subfolders. **Operator-reported elevated, read-only verification
  on 2026-10-20 subsequently returned `restrictedAclsVerified=true`.** All seven
  folders (`root`, `bin`, `queue`, `input`, `output`, `temp`, `receipts`) were
  reported present, ACL-readable, inheritance-disabled, with approved worker
  rights and no unexpected Allow ACEs. This result is supported by the full
  PowerShell JSON transcript supplied by the operator; it is not yet a separate
  independent security audit of effective Windows process isolation.
- PhotoCraft 0.10.0 and FilmCraft 0.9.0 are present in the original ArtCraft
  location; the portable program binaries **and both ZIP archives** match
  their separately pinned SHA-256 hashes.
- The pinned staging plan did not copy any files: `changesApplied=false`.
  Its two destinations are inaccessible to this session, so each is marked
  `targetInspection=access_denied` and `targetExists=null`.
- No NTFS permissions, local user state or firewall configuration were changed
  by the follow-up. The worker remains disabled and no creative execution or
  network isolation has been authorized.
- Five Windows provision/staging tests plus 14 synthetic ACL-policy cases
  passed in the updated test harness. These **do not replace an elevated audit**.

## Implemented operator-controlled scripts

`worker-provision.ps1` (no parameters): read-only provisioning preview.
`worker-verify.ps1`: read-only user, group and NTFS ACL audit.
`worker-stage-binaries.ps1` (no parameters): read-only pinned binary staging preview.

These scripts do not grant approval to Atlas and do not run autonomously.

### Elevated ACL inspection: operator-reported PASS; next gate is staged binaries

The provisioning step and elevated read-only `worker-verify.ps1` inspection
have **already been performed**. Never rerun `worker-provision.ps1 -Apply`.
The submitted JSON reported `restrictedAclsVerified=true`, a disabled
non-administrator account and seven individually passing folder ACL checks.
Do not mistake that result for network/process sandbox verification.

**No further command is authorized by this report.** Before any elevated
`worker-stage-binaries.ps1 -Apply`, obtain a separate owner decision and an
independent review of archive extraction, staging destinations and signatures.
The staging script is designed to refuse changed release hashes, inaccessible
or occupied targets, and any elevated ACL audit that fails. The worker must
remain disabled; do not relax ACLs to force a passing result.

**Do not stage programs or enable the account yet.** Binary staging `-Apply`
also enforces this elevated read-only ACL audit and refuses inaccessible or
preexisting destinations; a separate owner approval and independent review
are still needed before staging. Passwords are never shared in chat or logs.

**No automatic enabling** is provided. Do not use `Enable-LocalUser` until
separate application-level authentication, queue, network restrictions,
independent file-boundary tests and human approval have been implemented.

### Provisioned filesystem

`C:\ProgramData\OmniraCreativeWorker`

| Directory | Worker rights (planned) |
| --- | --- |
| bin | read/execute |
| queue | read |
| input | read |
| output | modify |
| temp | modify |
| receipts | read |

SYSTEM and local Administrators are intended to retain full control, with
inheritance disabled and narrowly scoped worker ACEs. **These effective ACLs
have not yet been independently observed from an elevated session.** No
binaries have been staged and the worker is intentionally **disabled**.
If provisioning was incomplete, stop and review; do not rerun it blindly
or relax ACLs.

## Security caveats

A non-admin Windows account plus NTFS ACLs is **hardening**, not a
proof of a secure OS sandbox. It does not automatically prevent network
egress, spawning alternate programs, privilege escalation, or reading
otherwise public Windows resources. Per-executable firewall block rules
would not reliably block all child-process traffic. An independent review,
strong process restrictions or an isolated VM/container can be necessary.

PhotoCraft and FilmCraft are not proprietary Adobe binaries. Do not expose
their general-purpose MCP command channels directly to an autonomous agent.

## Remaining before a first autonomous media job

1. Independently audit the provisioned disabled worker's actual NTFS ACLs
   from an elevated read-only session; get external security sign-off.
2. Separate authenticated creative queue with explicit signed, one-time
   operator approval and non-replayable storage.
3. Low-privilege local worker that has a **fixed recipe** command allowlist,
   verified input scope, controlled environment and output staging.
4. Verified network/process isolation appropriate for untrusted media.
5. Full execution test through trusted queue (not just direct CLI tests).
6. Independent QC and canonical derived Asset admission; preview and
   separate human publication approval in Omnira.

## Whole-archive integrity update

The staging planner additionally checks SHA-256 of the original PhotoCraft and
FilmCraft release ZIPs against pinned hashes in artcraft-lock.json. On a future
operator-approved Apply, it extracts these pinned archives into the restricted
ProgramData bin tree, then verifies the installed executable hash again. This
avoids trusting a potentially modified unpacked portable directory.
