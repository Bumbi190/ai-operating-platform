# ArtCraft P28 — real Windows read-only safety audit

Date: 2026-10-21
Branch: `feat/atlas-creative-p28-worker-audit`
Parent: P27 Draft PR #497, after the isolated PGlite/PG17 checks passed.

## What actually ran on Hultgren

The existing **read-only** scripts were invoked from the P26/P28
integration chain:

- `worker-verify.ps1`: NTFS/account inspection.
- `worker-archive-audit.ps1`: original locked PhotoCraft/FilmCraft
  ZIP metadata/digests and CLI/GUI Authenticode checks.
- `worker-approval-ledger-acl-audit.ps1`: proposed private decision/
  nonce ledger ACL inspection.
- Read-only Windows firewall profile/rule listing and read-only process
  count. No custom outbound deny rule was recognized for the creative
  worker, PhotoCraft or FilmCraft. This is **not** an authoritative
  evaluation of effective egress for a future worker token/process.

No editors, Windows worker process, elevation, ACL writes, service
installation, firewall change or live job were initiated.

### Confirmed observations

| Area | Observation | Can grant creative execution? |
| --- | --- | --- |
| `omnira-media-worker` account | Exists, DISABLED and not in the local Administrators group | No |
| `OmniraCreativeWorker` NTFS folder policy | Existing read-only audit verifies all 7 expected directories' ACLs: root, bin, queue, input, output, temp and receipts | No |
| PhotoCraft and FilmCraft release archives | Both digest-pinned ZIPs have 9 expected entries, safe bounds, CLI digest and CLI/GUI Authenticode verified by the existing audit | No |
| Proposed approval ledger under `approvals/nonces` | **UNVERIFIED**: both paths reported `inaccessible_or_missing` and its ACL invariant is false | No |
| Network egress | **UNVERIFIED**: firewall rules/profiles alone do not attest effective outbound denial, including possible child processes | No |
| Windows process tree / child process isolation | **UNVERIFIED** without an authorized, contained worker instance and independently proven OS restrictions | No |
| Real operator decision, authenticated creative queue | Not activated or verified end to end | No |
| PhotoCraft/FilmCraft processes | No corresponding CLI processes were observed during the read-only check | No |

The result is **NOT READY** and must remain fail-closed.

### P28 additions

- `scripts/creative-tools/worker-safety-report.mjs` combines those
  three *existing* read-only audit programs, validates their reported
  schema and expected fields, and returns a concise, non-secret diagnostic
  with explicit failed requirements.
- `worker-safety-report.test.mjs` exercises false positives:
  altered account state, extra claim flags, missing ledger, invalid
  archive signatures, missing directories and fully green disk
  observations. **Even all-green disk evidence cannot authorize execution
  or publication.**
- Neither new file starts a program other than these **fixed, known
  read-only PowerShell audit scripts**. No transport or HTTP endpoint is
  added, and the result is not an OS security attestation.

### Reproduce on the workstation (read-only)

```powershell
node scripts/creative-tools/worker-safety-report.mjs
```

The printed JSON is diagnostic only. It can inform a later human
review, **not** serve as a token to start a worker, enable a Windows
account, run creative tools or publish an asset.

## Blockers and next actions

1. Independently review/provision the private decision and nonce ledger
   using a separate privileged operator-approved process, not this audit.
2. Design and validate actual network egress deny, filesystem reparse
   protection, child process constraints and restricted token execution,
   including an effective OS-level test from inside the isolated worker.
   Windows 11 Home must not be assumed equivalent to a hardened sandbox.
3. Verify genuine human approval identity, exact project ownership,
   durable nonce consumption and authenticated worker proof of
   possession against full staging DB/SQL boundaries.
4. Only after those checks pass should a human explicitly approve a
   *single synthetic, private* PhotoCraft job in a sandbox. Review
   output quality and separate publish permission are further gates.

The frozen P27 SQL test workflow already passed **41/41 PGlite, 27/27
PostgreSQL 17 and 3/3 SQL isolation checks**. It did not validate actual
Windows process/network isolation.

No account was enabled. No Supabase SQL migration applied, no
production deployment and no user media touched. Keep this PR Draft.
