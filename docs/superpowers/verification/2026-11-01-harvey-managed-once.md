# Harvey managed one-shot drafting — verification, 1 November 2026

Work ID: HARVEY-B2B-386. Existing Draft PR: https://github.com/Bumbi190/ai-operating-platform/pull/386. Base application/worker commit: 61ddec2a7f0d4351a60c8a22ce693aa7c9daa763.

## Problem and correction

The documented `cli run --once` command used the legacy credential key and direct HTTPS transport even for a managed connection. It therefore missed both the journal's rotated worker credential and the protected Preview transport. Managed one-shot execution now shares the host's configuration, installation verification and connection loader, takes the same `host.lock`, and uses the current journal credential.

The command respects the server's running/paused state, model readiness and unresolved initial/reply dispatch journals. It runs at most one available initial job, which can contain 1–5 contacts. It does not select an exact job ID. No mailbox, reply or send loop starts, even if their saved flags are enabled. Managed `run` without `--once` fails closed before network or model access; legacy `connect`/`run` behavior is preserved.

A second defect was found during review: `worker.run_once` can return `False` after a model or completion failure, but the host previously cleared its dispatch journal regardless. The common helper now clears only after confirmed successful completion (`worked is True`). False, interruption or exception after the dispatch marker preserves its identifiers and blocks another initial run until reconciliation. This correction applies to both one-shot and continuous hosting.

## Verification

| Check | Result | Scope |
| --- | --- | --- |
| Python suite on stationary Hultgren, Python 3.12 | 169 passed, exit 0 | All worker unit/integration fixtures, including 18 added regression tests |
| Focused scratch/Linux run | 81 passed, exit 0 | Managed one-shot, lifecycle, connection, Preview transport, runtime auth, sales worker, reply worker and send host |
| Independent code review | No blocking findings | Actual five-file implementation/test/documentation diff; reviewer did not independently rerun tests |
| Installed native CLI doctor | ready=true, version 2.1.296 | Version, safe-mode surface and first-party auth preflight; no inference |

Windows command: `C:\Python312\python.exe -m unittest discover -s workers/sales/tests -v`.

Evidence on Hultgren: `C:\Users\Andre\Projects\Omnira\Temp\harvey-resume-20261101\worker-windows-tests.log`, `worker-windows-tests.exit`, `runtime-doctor.json`, `managed-once-apply.json` and the source payload.

The new regression cases use actual journals, locks, ManagedConnection, ProtectedPreviewClient and the initial worker between synthetic network/model boundaries. They cover a stale bootstrap reference versus the current journal reference, lock contention, source/root pin failure, project/worker mismatch, pause and missing execution state, blocked readiness, unresolved initial/reply dispatch, lost completion receipts, interruption and partial managed configuration.

## Operational limits

This verification did not create a real customer job, call a model, rotate a live credential, start the managed host or send mail. The previously completed owner read-view and bounded reconnection remain historical evidence for the unchanged application API. A real company-to-persisted-draft acceptance test still remains.

The changed worker needs its own immutable package and manifest selection before live use. The active 61d package must not be edited in place. A managed one-shot may renew its worker credential through the existing management protocol; it is not a read-only diagnostic.

After a failed one-shot dispatch, the last reported host status may temporarily remain ready until its heartbeat ages out. The returned reconciliation reason and preserved journal still prevent another claim.

No application code, SQL, migration policy or provider configuration is changed by this worker correction. The separate already-applied SQL source, guard inventory and security-registry reconciliation in this continuation is documented in [ledger source synchronization](2026-11-01-harvey-ledger-source-sync.md). Full repository tests were not rerun; the previous full-suite comparison at 203faea remains historical and is not represented as green.
