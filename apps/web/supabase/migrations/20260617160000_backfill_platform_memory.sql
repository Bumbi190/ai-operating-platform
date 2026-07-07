-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 7: backfill platform_memory → atlas.memories (procedural).
--
-- Seeds the consolidated memory store with the cumulative patterns the legacy
-- platform_memory KV store already learned (hook_patterns, avoided_phrases,
-- brand_voice, content_patterns, rejection_triggers). These become procedural
-- beliefs Atlas can recall immediately, without waiting for new feedback to
-- re-accumulate.
--
-- IDEMPOTENT (ON CONFLICT DO NOTHING on the memories upsert key) → re-run adds 0.
-- NON-DESTRUCTIVE — platform_memory is left intact (dual-source).
--
-- Distinct entity space from feedback-derived memories: entity_kind = category
-- (not 'output_type'), so this backfill never collides with the content_feedback
-- procedural memories (entity_kind='output_type').
--
-- Run separately AFTER dual-write is verified (plan §6 C7). Rollback: delete the
-- backfilled rows (legacy intact); re-runnable.
-- ─────────────────────────────────────────────────────────────────────────────

insert into atlas.memories (
  scope, memory_class, project_id, entity_kind, entity_id, mem_key,
  summary, value, confidence, source_trust, evidence_count, status,
  first_seen_at, last_seen_at
)
select
  'project',
  'procedural',
  pm.project_id,
  pm.category,                              -- entity_kind
  pm.key,                                   -- entity_id
  pm.key,                                   -- mem_key (per-concept, within (project,category))
  coalesce(
    nullif(pm.value->>'note', ''),
    nullif(pm.value->>'example', ''),
    pm.category || ':' || pm.key
  ),                                        -- summary (never null)
  pm.value,
  least(greatest(pm.confidence, 0), 1),
  0.5,                                      -- source_trust (static default; ADR v3)
  greatest(pm.evidence_count, 1),
  'active',
  pm.created_at,
  pm.last_seen_at
from public.platform_memory pm
on conflict (scope, memory_class, project_id, entity_kind, entity_id, mem_key)
do nothing;
