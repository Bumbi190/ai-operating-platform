# Handlarbörsen weekly watch journal — schema installation

This is the bounded schema step following PR395's reviewed proposal. The user requested continuation after the concrete schema installation proposal. Execution activation is outside this step.

## Installed and observed
- Canonical migration: apps/web/supabase/migrations/20261017200038_handlarborsen_watch_runs_v1.sql.
- Production ledger name/version: handlarborsen_watch_runs_v1 / 20261017200436, one statement,16520characters.
- Exact canonical LF SHA256:687d8cb87f8edf04f15618ed446d14fcae9dd9ebbf979f46b171429b7f7e9691.
- Original proposal SHA256:25301e60468986f276b2d32e630867782764d94304c38831f368414725939da6. Only the first comment changed; every SQL body byte is preserved.
- Two empty fixed-project tables, RLS+FORCE, zero policies/client table+column privileges, service SELECT only and no direct writes.
- Three narrow postgres-owned DEFINER mutation RPCs, six private INVOKER helpers, all empty search_path and zero client EXECUTE. Only the writers permit service EXECUTE.
- Five guard/audit triggers enabled.159 ledger rows,152 public tables. Existing cron count38 unchanged.
- Actual scoped catalog receipt: docs/verification/2026-10-17-hb-watch-runs-production.json.
- Journal flag remains absent; no route/executor/source access/scheduler/notification added. No production test runs or synthetic evidence seeded.

## Validation
637 targeted tests passed across46 suites;51 older environment-gated SQL tests skipped. TypeScript noEmit passed. Four new promotion tests observed RED then GREEN bind the reviewed proposal body, canonical source receipt, enforced missing/duplicate ledger guard and truthful table classification.

Actual canonical PostgreSQL17.6 proof:21 checks passed, node exit0, no stderr, networknone/no host ports, no production/provider calls, container removed. Includes real role denials, concurrent enqueues/claims, token/revision fencing, immutable audit and row-lock waits crossing expiry. Receipt: docs/verification/2026-10-17-hb-watch-runs-canonical-db.json.

Independent promotion review: no Critical/Important/minor findings. Frozen legacy/grandfathered exceptions unchanged; no security allowlist added. Canonical guard136files/122enforced/14grandfathered/30legacy-only. The guard must reject a missing or duplicated journal ledger name.

## Release evidence
PR, required CI, exact Preview and production deployment evidence are recorded in the PR body and Notion after completion. The installed schema is forward-compatible with current disabled code. Keep this worktree/branch available for the next increment.

## Remaining before a real weekly report
Human-reviewed uncertain-run recovery; project-authorized journal reads; evidence/report model; canonical stop/spend/request enforcement with a verified project budget; approved sources and access; final schedule and activation approval. Existing generic automatic runs queue remains untouched. Monthly discovery and own-social integrations remain separate increments.

The journal claim never authorizes an external request. HTTP count is completion metadata; NULL remains unknown. There is no automatic retry/takeover or recovery RPC. Oscar's real session test remains pending without account/role changes.
