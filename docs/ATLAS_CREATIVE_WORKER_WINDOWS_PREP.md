# Atlas Creative Worker — Windows 11 Home provisioning (P4)

Date: 2026-10-20 · Machine: HULTGREN · Repo: ai-operating-platform
Branch: `feat/atlas-creative-tools-p0`

## Verified state

- This remote Desktop Commander session is **not elevated** as administrator.
- Account `omnira-media-worker` does not exist.
- `C:\ProgramData\OmniraCreativeWorker` does not exist.
- PhotoCraft 0.10.0 and FilmCraft 0.9.0 portable binaries are present under
  `C:\Users\Andre\Projects\Omnira\External\ArtCraft`.
- The binary staging plan independently verified both SHA-256 digests against
  `scripts/creative-tools/artcraft-lock.json`.
- Neither a Windows account nor NTFS ACLs nor firewall rules were changed.
- The production creative execution gate remains `false`.
- 30/30 local Node tests passed, including 3 Windows provisioning tests.

## Implemented operator-controlled scripts

`worker-provision.ps1` (no parameters): read-only provisioning preview.
`worker-verify.ps1`: read-only user, group and NTFS ACL audit.
`worker-stage-binaries.ps1` (no parameters): read-only pinned binary staging preview.

These scripts do not grant approval to Atlas and do not run autonomously.

### Optional future manual provisioning

**Not performed here.** After independent code review, an operator physically at
the computer can open an **elevated Windows PowerShell** window and run:

1. `& 'C:\Users\Andre\Projects\Omnira\.worktrees\atlas-creative-tools-p0\scripts\creative-tools\worker-provision.ps1' -Apply`
2. Provide a unique strong password interactively, **never in ChatGPT, GitHub,
   or a shell command line**. The script creates a **disabled** non-admin account.
3. Run the read-only `worker-verify.ps1` and inspect every ACL result.
4. If all checks pass, manually run
   `worker-stage-binaries.ps1 -Apply` from the same elevated session.
5. Run `worker-stage-binaries.ps1` without arguments again and verify that
   staged executable hashes still match. No account activation is implied.

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

SYSTEM and local Administrators retain full control. Inheritance is disabled
on each folder. No program binaries are placed under an unrestricted write
location for the future worker. The worker is intentionally **disabled**
after provisioning. If the scripts fail halfway, stop and review the
partial account/folders; do not rerun blindly or relax ACLs.

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

1. Provision + independently audit a restricted worker.
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
