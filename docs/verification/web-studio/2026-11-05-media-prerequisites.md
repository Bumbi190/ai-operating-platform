# Web Studio: recovered media prerequisites — 2026-11-05

Continues PR #368 from local 80b400b. Local diagnostic replay only; no hosted schema/data writes,
paid resources, model calls, push, merge or deployment.

## Change

The two archived historical media migrations now serve as separately hash-pinned synthetic inputs.
Their original SQL bodies are preserved, with LF normalization only, and preceded by an atomic local guard.
The guard requires a superuser/bypass-RLS role, an empty media_insights table, absence of target columns,
and the BI platform text NOT NULL column. Lock/check/DDL execute in one transaction.

The replay places both inputs after 20260602_atlas_bi_foundation.sql. The first restores
youtube_video_id and facebook_post_id, the unique script_id/platform index and historical comments.
The second restores avg_view_pct numeric and its comment. No invented range constraint is added.
Recovered sources remain in docs/verification/web-studio/recovered-history/, outside canonical/legacy
migration directories. Full-fixture impersonation is refused by the existing executor.

The planner reads these sources through a distinct recoveredMedia input, checks their hashes,
and blocks on missing/drifted source or a changed BI prerequisite. It does not mark hosted replay ready.

## Verification

- The two new initial tests failed because media prerequisites were absent, then passed after implementation.
- All migration-*.test.mjs scripts: 94/94 passed.
- Fresh real isolated PostgreSQL replay: 189/189 applied; completed=true; cronJobRuns=0; cleanup=removed.
  Container network none, no mounts or published ports.
- Two real PostgreSQL cases per source refuse nonempty and pre-upgraded target tables; the empty case
  succeeds. All six media guard cases passed.
- All three existing runs-dispatch guard cases passed.
- All six real database-role checks passed, including denial of direct service_role stop-state modification.
- The real canonical enqueue function called twice still creates exactly one pending website job,
  with correct session/current-run/generation/input binding. Fictional seed transaction rolled back.

## Comparison scope

All 64 named columns across media_insights (21) and runs (43) match the previously captured production
metadata for type, NOT NULL and default-expression text: no missing/extra columns or compared field differences.
Physical column order, all constraints and all triggers were not compared.

The recovered media_insights_script_platform_key index is unique and valid locally. Its pg_get_indexdef
output exactly matches the read-only production query:
CREATE UNIQUE INDEX media_insights_script_platform_key ON public.media_insights USING btree (script_id, platform).

The limited 14-table catalog comparison has only 14 owner differences remaining:
production postgres versus local supabase_admin. No owner changes or assumption of permission equivalence.
All other previously selected catalog fields match. This is not a complete schema/security parity proof.

## Evidence

- docs/validation/migration-bootstrap-replay-media-20261105.json: standard successful replay receipt.
- 2026-11-05-media-behavior.json: role, guard, enqueue, selected columns and index observations.
- 2026-11-05-media-column-comparison.json: deterministic column comparison result.
- 2026-11-05-media-behavior-probe.mjs: exact attended diagnostic adapter used for this run.
  This dated adapter uses the existing local-only runner and external Temp catalog snapshot;
  it is not a supported production CLI.

## Remaining boundary

Before hosted acceptance: compare complete relevant catalogs/security definitions and review role/owner/default
privilege differences; reconcile the wider historical ledger and remaining unverified SQL provenance;
then establish an authorized isolated target for real Supabase Auth and the complete worker/model flow.
The current local enqueue test seeds its session directly and does not prove plan approval or API authorization.
replayReady remains false. Pre-existing showroom/calendar changes were preserved.
