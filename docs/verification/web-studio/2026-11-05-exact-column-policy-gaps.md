# Web Studio: exact column and policy gaps — 2026-11-05

Continuation of PR #368, local base 08cd0c222933bf80f03ef23d1db97e3fcac55054.
Production project identity was checked using Supabase list_projects: AI Operating Platform,
iboepohjwrhtgshrqaol. Only pg_catalog and migration-history metadata SELECT queries ran remotely.
No application rows, secrets, production writes, new hosted branches or paid model calls.

## Reproduced result

A temporary diagnostic adapter invoked the existing runBootstrapReplay with its unchanged
hash-pinned plan. At the existing guarded catalog-query callback, the adapter additionally ran
a fixed SELECT for columns of media_insights/runs and policies of cron_heartbeat/platform_config,
using the same read-only PGOPTIONS and isolated container. No production input was executed.
The adapter then returned the standard catalog query result to the existing harness.

184/184 steps applied, completed=true, cronJobRuns=0, cleanup=removed, replayReady=false.
Production has 64 columns across the two selected tables; local has 60. No local-only columns.

| Table | Missing local column | Production type | Nullable | Default |
| --- | --- | --- | --- | --- |
| media_insights | avg_view_pct | numeric | yes | none |
| media_insights | facebook_post_id | text | yes | none |
| media_insights | youtube_video_id | text | yes | none |
| runs | kind | text | yes | none |

There is also a difference invisible to column counts: runs.workflow_id is nullable in production,
but NOT NULL locally. All other compared common-column types, nullability and default-expression
strings matched. Constraints, indexes, triggers, functions and effective access were not compared.

## Provenance leads, not whole-migration identity claims

- Local legacy supabase/migrations/20260603_marketing_engine_foundation.sql lines 11–12 explicitly
  add runs.kind and drop workflow_id NOT NULL. Production ledger metadata for
  20260603135744 / marketing_engine_foundation confirms both clause patterns are present.
  This is a concrete source lead, not proof that the complete historical SQL equals the local file.
- Production 20260605071529 / media_insights_multiplatform mentions youtube_video_id and facebook_post_id.
- Production 20260605213648 / media_insights_retention mentions avg_view_pct.
  No Git-tracked SQL currently contains avg_view_pct; do not invent the missing migration from its name.
- Production platform_config has one PERMISSIVE SELECT policy for authenticated:
  authenticated_read_platform_config, USING (true), no WITH CHECK. Local has none.
  The same policy is present in legacy 20260528_pass_a_safeguards.sql lines 67–75;
  the current synthetic fixture intentionally extracts only CREATE TABLE and omits that policy/RLS.
- Both environments have zero cron_heartbeat policies. The previous receipt records RLS on in
  production and off locally. Legacy 20260707172102_enable_public_rls_for_internal_tables.sql
  explicitly enables RLS and revokes client table privileges, but is not in the replay fixture sequence.

These findings explain gaps in the diagnostic input set. They do not authorize copying complete
legacy migrations into the canonical directory: those files also modify unrelated tables,
functions, operational settings or data.

## Next implementation boundary

Review schema-only, content-pinned prerequisites for runs.kind/workflow_id and the security
prerequisites separately. Recover exact historical media-insights DDL before reconstructing it.
Prove the run-enqueue path with a real isolated database after the prerequisites are reviewed;
SQL replay alone does not prove the stored procedures can execute against every referenced column.
Keep production ledger, canonical migration filenames and readiness flags unchanged.
Real Supabase Auth, hosted branch replay, worker/model acceptance and full security parity remain unproven.

## Reproduction inputs (outside Git)

C:/Users/Andre/Projects/Omnira/Temp/:
- webbuilder-production-column-policy-20261105.json — metadata export and observed time.
- webbuilder-column-policy-probe-20261105.mjs — fixed diagnostic SELECT and unchanged harness adapter.
- webbuilder-column-policy-replay-20261105.json — full local receipt plus selected local metadata.
- webbuilder-column-policy-diff-20261105.mjs — comparison keyed by table/column.
- webbuilder-column-policy-diff-20261105.json — exact metadata differences.

The adapter and comparison are investigation scripts, not new supported CLI or acceptance gates.
The standard harness regression suite plus fingerprint and ledger suites passed 42/42 tests.
Existing uncommitted showroom test and calendar receipt were preserved. No push/merge was attempted.
