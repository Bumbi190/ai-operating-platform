# Web Studio: runs dispatch prerequisite — 2026-11-05

The fixture-assisted local replay previously omitted runs.kind and kept runs.workflow_id NOT NULL.
The canonical website_build_enqueue function inserts kind='website.static.build.v1' with a NULL workflow_id,
so migration replay success alone could not establish that this function was executable.

## Change

migration-bootstrap-runs.mjs extracts exactly three reviewed statements from legacy
20260603_marketing_engine_foundation.sql: add runs.kind, drop workflow_id NOT NULL, create
runs_kind_pending_idx. The full source, extraction and executable body are separately SHA-256 pinned.
The full marketing migration is prohibited as a replay fixture. No canonical migration was modified.

The local replay places this synthetic prerequisite immediately after the baseline. Its table lock,
owner/bypass check, empty-table check, absence checks and DDL run in one transaction. Nonempty,
partitioned/inherited, already-upgraded or incompatible targets refuse instead of being silently accepted.
This is test tooling for the isolated offline executor, not a hosted migration or production repair.

## Verification

- New tests failed first because the runs prerequisite did not exist, then passed after implementation.
- 61/61 targeted Node tests passed across bootstrap plan, replay, runs, fingerprints and ledger reconciliation.
- New real isolated replay: 185/185 applied, completed=true, cronJobRuns=0, cleanup=removed.
- Selected column comparison now finds no shared-column type/nullability/default differences.
  runs.kind is present and runs.workflow_id nullable, matching the observed production metadata.
- Three real PostgreSQL guard cases passed: accept empty baseline, refuse a nonempty baseline,
  refuse an existing kind column.
- After the full 185-step replay, fictional auth/project/agent/conversation/session rows were created
  in a rollback-only transaction. The real canonical website_build_enqueue was called twice.
  Exactly one pending website.static.build.v1 run existed, workflow_id was NULL, generation stayed 1
  and session/current-run/input references matched. The transaction rolled back.
  The session was seeded directly for this internal-function regression: this does not exercise plan
  approval, API authorization, real Supabase Auth, model calls or the complete worker lifecycle.
- Docker container had network none, no mounts/ports and was removed after each replay.

## Evidence and remaining scope

The committed replay receipt is docs/validation/migration-bootstrap-replay-runs-dispatch-20261105.json.
Behavior checks are recorded in 2026-11-05-runs-dispatch-behavior.json in this directory.
External detailed comparison and investigation adapter scripts are in C:/Users/Andre/Projects/Omnira/Temp/
under webbuilder-runs-dispatch-* and webbuilder-runs-behavior-*.

Three media_insights columns and the earlier cron_heartbeat/platform_config security differences remain.
Production SQL identity, full catalog/RLS parity, real login and hosted worker acceptance are unverified.
replayReady remains false. No hosted schema/data changes, paid resources, push, merge or deploy performed.
Pre-existing showroom/calendar modifications were preserved.
