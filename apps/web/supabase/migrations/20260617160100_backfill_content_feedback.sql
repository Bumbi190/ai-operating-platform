-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 7: backfill content_feedback → atlas.memory_events
-- (event_type='feedback' → procedural).
--
-- Replays the historical approval/rejection feedback as memory events that the
-- consolidation cron folds into the SAME procedural memories the live approval
-- emitter (Commit 4) writes to — same entity space and dedupe_key convention:
--   entity_kind = 'output_type', entity_id = output_type, dedupe_key = 'feedback:'||output_type
-- so backfilled history adds evidence_count to the live beliefs rather than
-- creating parallel ones.
--
-- consolidated_at = NULL → these enter the consolidation queue (feedback is
-- procedural, not episodic), matching public.atlas_record_event's behaviour.
--
-- IDEMPOTENT: source='content_feedback', source_id=content_feedback.id, on the
-- (source, source_id, event_type) partial unique index → re-run adds 0. The
-- distinct source ('content_feedback' vs the live 'approval') means backfill and
-- live writes never collide on the idempotency key while still consolidating onto
-- the same memory. NON-DESTRUCTIVE — content_feedback left intact.
--
-- Run separately AFTER dual-write is verified (plan §6 C7). Rollback: delete
-- rows where source='content_feedback' (legacy intact); re-runnable.
-- ─────────────────────────────────────────────────────────────────────────────

insert into atlas.memory_events (
  scope, event_type, project_id, entity_kind, entity_id, subject, content,
  structured, confidence, source, source_id, dedupe_key, occurred_at, consolidated_at
)
select
  'project',
  'feedback',
  cf.project_id,
  'output_type',
  cf.output_type,
  'Content feedback: ' || cf.output_type,
  cf.decision || ': ' || cf.output_type
    || coalesce(' — ' || nullif(left(coalesce(cf.rejection_reason, cf.revision_notes, ''), 200), ''), ''),
  jsonb_build_object(
    'decision', cf.decision,
    'outputType', cf.output_type,
    'qualityPatterns', to_jsonb(cf.quality_patterns),
    'evalScoreAtDecision', cf.eval_score_at_decision
  ),
  case cf.decision when 'rejected' then 0.80 when 'approved' then 0.70 else 0.50 end,
  'content_feedback',
  cf.id::text,
  'feedback:' || cf.output_type,            -- dedupe_key = mem_key (matches live emitter)
  cf.created_at,
  null                                      -- procedural → enters consolidation queue
from public.content_feedback cf
on conflict (source, source_id, event_type) where source_id is not null
do nothing;
