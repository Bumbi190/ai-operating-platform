# Handlarbörsen weekly watch journal P1 — schema approval package

## Later schema status
The reviewed journal schema was installed as ledger20261017200436 after continuation of the concrete schema step. Canonical SQL SHA256687d8cb87f8edf04f15618ed446d14fcae9dd9ebbf979f46b171429b7f7e9691; only its first comment differs from this proposal. See docs/handlarborsen-watch-journal-schema-20261017.md and the scoped production receipt for current evidence. The original approval package below is historical. Execution remains disabled.

## Scope and state
Code is disabled unless HANDLARBORSEN_WATCH_RUN_JOURNAL_ENABLED is exactly true. No route, executor, schedule, provider call or notification is added. This package does not approve activation or source access.

Proposed schema: docs/sql/handlarborsen_watch_runs_p1_proposed.sql.
Normalized LF SHA-256: 25301e60468986f276b2d32e630867782764d94304c38831f368414725939da6.
Actual isolated database receipt: docs/verification/2026-10-17-hb-watch-runs-db.json.

## Requested next approval
Install only the reviewed journal schema, after promoting the unchanged proposal to a canonical migration and updating Migration Guard/security inventory in a separate reviewed change. Two tables (run heads and append-only events), three narrow mutation RPCs and six internal invoker helpers; fixed Handlarbörsen project and weekly kind. Both tables enforce RLS and FORCE RLS with zero client policies/privileges. Service can select; direct writes are denied. No account or existing role/default-privilege changes.

This is a new production schema decision under the project's human approval gate. No production installation is authorized by this code release.

## Verification performed
37 new core/adapter tests cover Stockholm Monday/DST/year periods, malformed or foreign receipts, method-specific outcomes, disabled no-client/no-RPC, lost acknowledgements and no retry. Independent security review has no remaining Critical/Important findings.

The network-isolated PostgreSQL 17.6 fixture passed 21 checks, including actual denied roles, concurrent duplicate enqueue/claim, token/revision fencing, immutable audit, cross-period exclusion and real row-lock waits crossing expiry. A stale-clock defect was reproduced before fixing both claim and finish to sample the clock after required locks. No midnight database-clock simulation is claimed.

The receipt records productionAccess:false, providerCalls:0 and containerRemoved:true. Reproduce with the cached PostgreSQL image using:
node apps/web/scripts/test-handlarborsen-watch-runs-db.mjs
Run from repository root; optional HB_WATCH_RUNS_TEST_RECEIPT writes a sanitized receipt.

## Approved installation sequence, still pending
1. Recheck latest main, production ledger, table absence and flag metadata read-only. If the reviewed SQL changes, rerun isolated proofs and review the delta.
2. Promote exact reviewed SQL to a unique canonical migration; update guard registry and security inventory. Do not allowlist an unknown production name or bypass the guard.
3. Validate canonical migration and actual permissions in an isolated/approved preview database. Preserve rollback-safe code: keep the journal flag absent.
4. After explicit schema approval, apply the canonical migration once, reconcile its exact ledger version/name and verify catalog/RLS/functions/roles. No production test rows are required.
5. Verify normal Preview/production guard and existing inbox/data. Keep flag absent. Record evidence in a follow-up change.

## Separate activation prerequisites
Human-reviewed uncertain-run recovery, live project/role read authorization, evidence/report storage, canonical stop/spend checks on every dispatch, a real request cap and verified project budget, approved sources/access, schedule/budget/activation approval. Journal HTTP counts are completion metadata, not dispatch enforcement. Queued/running/uncertain counts are NULL (unknown); expired work remains uncertain and blocks later periods, never automatic takeover/retry.

The new pure growth-intelligence decision engine may later support verified own-channel analysis. No integration or duplicate provider work is included here.

## Operational behavior
Current-week claims only; one active/uncertain run across periods; max 180-second lease. Exact terminal acknowledgement replay is idempotent. After a lost transport acknowledgement, read/resolve state explicitly: never infer zero activity or retry an external action. P1 deliberately provides no recovery RPC, so execution must remain unimplemented and disabled.
