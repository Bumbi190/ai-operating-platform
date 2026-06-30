-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 7: backfill dream_issues → atlas.memory_events
-- (event_type='reflection' → episodic).
--
-- Seeds the episodic spine with the current dream-issue ledger so recall can
-- surface known recurring issues from night one. Mirrors the live Dream emitter
-- (Commit 4): reflection → episodic, source='dream', source_id='<issue_id>:<date>'.
--
-- Episodic: consolidated_at = now() at insert → bypasses the consolidation queue
-- (never materialized into atlas.memories; recall reads it from the event spine),
-- matching public.atlas_record_event. dedupe_key is NULL — episodic is exempt from
-- the dedupe_key contract.
--
-- One event per ledger row, keyed by issue + last_seen date (a single nightly
-- snapshot of the current state). The live emitter continues writing per-night
-- events going forward.
--
-- IDEMPOTENT on (source, source_id, event_type) → re-run adds 0. NON-DESTRUCTIVE
-- — dream_issues left intact. Run separately AFTER dual-write is verified.
-- Rollback: delete rows where source='dream' and event_type='reflection'.
-- ─────────────────────────────────────────────────────────────────────────────

insert into atlas.memory_events (
  scope, event_type, project_id, entity_kind, entity_id, subject, content,
  structured, confidence, source, source_id, dedupe_key, occurred_at, consolidated_at
)
select
  'project',
  'reflection',
  di.project_id,
  'dream_issue',
  di.issue_id,
  'Dream issue: ' || coalesce(nullif(di.title, ''), di.issue_id),
  coalesce(nullif(di.latest_insight, ''), nullif(di.title, ''), di.issue_id)
    || coalesce(' → ' || nullif(di.latest_action, ''), ''),
  jsonb_build_object(
    'issueId', di.issue_id,
    'severity', di.severity,
    'occurrences', di.occurrences,
    'latestMemoryKey', di.latest_memory_key
  ),
  0.50,
  'dream',
  di.issue_id || ':' || to_char(di.last_seen_at, 'YYYY-MM-DD'),
  null,                                     -- episodic: dedupe_key exempt
  di.last_seen_at,
  now()                                     -- episodic → stamped (bypass queue)
from public.dream_issues di
on conflict (source, source_id, event_type) where source_id is not null
do nothing;
