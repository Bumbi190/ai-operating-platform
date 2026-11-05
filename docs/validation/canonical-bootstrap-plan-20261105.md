# Canonical bootstrap plan (offline, 2026-11-05)

Status: **design + static plan only. Not executed. Not clean-bootstrap or production readiness evidence.**

## Question

Can a disposable local test prove that every file in `apps/web/supabase/migrations` replays, unmodified, on top of a
minimal *preexisting* schema, without touching existing SQL, the production DB, the migration ledger or hosted services?

## Static answer (`apps/web/scripts/migration-bootstrap-plan.mjs`)

The planner reuses `inspectBaselineProvenance`, `relationRefs`, `createdRelations`, `orderReplayMigrations` and
`sha256`. It composes only existing, hash-reported files:

| Step | Source | Provides | Placement |
| --- | --- | --- | --- |
| baseline | `packages/db/full_schema_run_in_supabase.sql` (untracked) | 7 of 8 early tables | before replay |
| fixture | `supabase/migrations/20260528_pg_cron_setup.sql` (legacy) | `omnira_cron` schema | before replay (preexisting) |
| fixture | `supabase/migrations/20260601_media_insights.sql` (legacy) | `media_insights` | **after canonical `20260520_media_tables.sql`** |
| fixture (pinned, local-only) | `supabase/migrations/20260603_cron_heartbeat.sql` (legacy, LF SHA-256 `f3c28dcd…bd831`) | `cron_heartbeat` | position 0: after `20260528_pg_cron_setup.sql`, before canonical `20260623_150300_atlas_collector_cron.sql` |
| fixture (pinned, local-only) | `supabase/migrations/20260609_dream_issues_ledger.sql` (legacy, LF SHA-256 `efc2b09e…10089`) | `dream_issues` | position 0: after baseline, before canonical `20260617160200_backfill_dream_issues.sql` |
| column prerequisite (pinned, local-only) | `supabase/migrations/20260609_manager_task_dream_link.sql` (legacy, LF SHA-256 `c1fb7723…a767a`) | columns `manager_tasks.owner`, `.source`, `.source_key` + `idx_manager_tasks_source` (no relation) | position 0: after `20260609_dream_issues_ledger.sql`, before canonical `20260820_manager_tasks_work_packages.sql` |

The early-window provenance scan stops at the last grandfathered migration. So it cannot see that canonical
`20260617160200_backfill_dream_issues.sql` reads `public.dream_issues`, which no canonical file creates. The disposable
replay (`migration-bootstrap-replay-full-20261105.json`) failed there. `SUPPLEMENTAL_FIXTURES` in the planner pins
the existing legacy creator by LF SHA-256. If the file is missing or its hash drifts, the planner fails closed with
`fixture_source_missing` or `fixture_sha_mismatch`. The planner places the file with the same dependency-scan
placement as the other fixtures. Its DDL-time dependencies (`projects`, `manager_tasks`, `memories`) are all in the
baseline, so it lands at the earliest position. The SQL is unmodified and nothing is skipped. It is still an **untracked
test input**: it has no canonical migration or ledger row and adds a fourth `fixture_untracked` blocker. It applies only
to a disposable local replay. It does not make clean bootstrap possible and is not evidence for it.

The same applies to `20260603_cron_heartbeat.sql`: canonical `20260623_150300_atlas_collector_cron.sql` seeds
`public.cron_heartbeat`, which no canonical file creates. The pinned legacy creator has no public DDL-time dependencies,
so it lands at position 0, after `pg_cron_setup` (fixtures at one position apply in file-name order). Besides the table
it creates the SECURITY DEFINER bridge `public.cron_job_status()` (reads `cron.job`; execute granted only to
`service_role`) and schedules `omnira_heartbeat`, which would call `omnira_cron.call_vercel`. The executor runs with
`cron.launch_active_jobs=off` and `--network none`, so the job is registered but never launched. It adds a fifth
`fixture_untracked` blocker.

Local replay v3 (`migration-bootstrap-replay-v3-20261105.json`) stopped at step 58, canonical
`20260820_manager_tasks_work_packages.sql`, because column `manager_tasks.source` did not exist. The baseline creates
`manager_tasks` without `owner`, `source` or `source_key`. Legacy `20260609_manager_task_dream_link.sql` adds them and the
`(project_id, source, source_key)` index, but it creates no relation, so relation-based detection cannot find it, and it
is deliberately not made to. `COLUMN_PREREQUISITES` in the planner declares it explicitly (table, columns, index,
expected first canonical user) and pins it by LF SHA-256. Before it is placed, the planner checks all of these and fails
closed on any difference:

- File missing or hash drift: `fixture_source_missing` / `fixture_sha_mismatch`.
- SQL shape: every statement must be a bare single-column `ADD COLUMN IF NOT EXISTS <col> <type>` or
  `CREATE INDEX IF NOT EXISTS` on `public.manager_tasks`. The added columns and the index must equal the declaration.
  It must create no relation. Otherwise: `column_prerequisite_mismatch`.
- Baseline: it must create `manager_tasks` with a parseable column list that lacks every declared column and has
  every other indexed column (`project_id`). Otherwise: `column_prerequisite_mismatch`.
- First use: the first canonical file in replay order that references `public.manager_tasks` and names a declared column
  (outside comments and string literals) must be the declared `20260820_manager_tasks_work_packages.sql`. That file
  must not add the column itself. Otherwise: `column_prerequisite_mismatch`.

The executor allows only `execution_not_run`, `fixture_interleaved` and `fixture_untracked`, so any new blocker
code refuses execution. Placement reuses the dependency scan. The file needs only `manager_tasks`, which is in the baseline,
so it lands at position 0, before its first user. It adds a sixth `fixture_untracked` blocker. Like the other pins, it is
a disposable local test input. It is not a canonical migration, ledger row or clean-bootstrap evidence.

`media_insights` references `media_scripts`, which only canonical `20260520_media_tables.sql` creates. So no existing source
can supply all eight early dependencies as a preexisting baseline. A replay is possible only with an interleaved
fixture, and that is a different property from "clean bootstrap".

Plan blockers (always fail closed; `ok`, `replayReady`, `executionValidated` stay `false`):
`fixture_untracked` ×6, `fixture_interleaved` (media_insights), `execution_not_run`.

Limits of the column prerequisite check: it is static and lexical. It does not compare column types against
hosted production. Column first use is found by matching tokens: false positives move first use earlier and fail
closed, but a use that never names the column (for example `select *`) would not be seen. It does not prove that
canonical files after step 58 replay. A new local replay run is needed for that.

## Disposable executor design (not implemented here)

If it is approved, a separate executor should consume the plan's `sequence` and reuse the isolation guards from
`verify-calendar-full-ledger-local.mjs` without changing them:
local npipe/unix Docker context, `--pull=never`, `--network none`, no mounts or ports, an owned label, synthetic
password, `cron.launch_active_jobs=off`, and the same platform plumbing (auth stub, pinned storage-api tenant
migrations). It should apply each step with `ON_ERROR_STOP` and verify each step's `lfSha256` before execution. It must not
apply adaptations or reordering, and it must stop at the first failure and report it. Its output should record
`replayReady: false` while any fixture is untracked or interleaved.

What a green run would prove: the canonical files replay in plan order on that fixture stack in that image.
What it would not prove: a clean bootstrap from an empty database, parity with the hosted schema, or ledger correctness.

## Remaining blockers to a true clean bootstrap

1. No tracked or registered baseline: the 7 early tables, `omnira_cron`, `media_insights`, `cron_heartbeat`, `dream_issues` and the `manager_tasks` owner/source/source_key columns have no canonical migration or ledger row.
2. `media_insights` cannot be preexisting because it depends on canonical `media_scripts`.
3. Fixture side effects: `pg_cron_setup` inserts a placeholder config row and schedules 12 jobs, `cron_heartbeat` adds a SECURITY DEFINER function and a 13th job, and the full schema writes `storage.buckets`.
4. Executor not yet written or run. Historical 177/177 ledger replay used selected prefixes, one reorder and one adaptation, so it does not cover canonical files.
5. Resolving 1–2 requires a reviewed baseline-migration decision. That is a policy change outside this test-only work.
