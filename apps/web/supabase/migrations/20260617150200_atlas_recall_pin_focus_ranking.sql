-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — C3 fix: rank+limit atlas_recall by EFFECTIVE salience.
--
-- Pre-merge review C3: the original atlas_recall ordered by BASE salience and
-- LIMIT n, while the pin override (→1.0) and focus boost (+0.15) were applied
-- only in TS afterward. A pinned or focus-relevant memory whose base salience
-- fell outside the top-n was therefore dropped by the SQL LIMIT before the caller
-- could promote it.
--
-- Fix: order + limit by the SAME effective-salience expression the caller uses,
-- so pinned/focus rows survive the LIMIT. The function still RETURNS base salience
-- (`salience`) — the caller (recall-memories.ts assembleMemoryPack) re-applies the
-- pin/focus formula for final ranking, so there is no double-application.
--
-- ⚠ The effective-salience formula (pin → 1.0; else base + 0.15·focus, clamped to
-- 1.0) is duplicated here and in recall-memories.ts (PINNED_SALIENCE / FOCUS_BOOST).
-- The two MUST stay in sync; they are cross-referenced in both files. (A future
-- C1 SQL test suite should pin this.)
--
-- CREATE OR REPLACE only — no schema change, no data change. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.atlas_recall(
  p_project_ids   uuid[]   default '{}'::uuid[],
  p_focus_kinds   text[]   default '{}'::text[],
  p_focus_ids     text[]   default '{}'::text[],
  p_episodic_days integer  default 90,
  p_limit         integer  default 60
) returns table (
  kind           text,
  id             uuid,
  scope          text,
  project_id     uuid,
  memory_class   text,
  entity_kind    text,
  entity_id      text,
  summary        text,
  confidence     numeric,
  evidence_count integer,
  last_seen_at   timestamptz,
  pinned         boolean,
  salience       numeric,
  focus_match    boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  with candidates as (
    -- Consolidated memories (procedural/decision), active, in-scope.
    select
      'memory'::text as kind, m.id, m.scope, m.project_id, m.memory_class,
      m.entity_kind, m.entity_id, m.summary, m.confidence, m.evidence_count,
      m.last_seen_at, m.pinned,
      atlas.salience(m.confidence, m.evidence_count, m.last_seen_at, m.memory_class) as base_salience,
      (cardinality(p_focus_ids) > 0
        and m.entity_kind = any(p_focus_kinds)
        and m.entity_id   = any(p_focus_ids)) as focus_match
    from atlas.memories m
    where m.status = 'active'
      and (m.scope = 'world' or (m.scope = 'project' and m.project_id = any(p_project_ids)))

    union all

    -- Episodic event spine (never materialized): outcome/reflection/correction in window.
    select
      'event'::text, e.id, e.scope, e.project_id, 'episodic'::text,
      e.entity_kind, e.entity_id, e.content, e.confidence, 1,
      e.occurred_at, false,
      atlas.salience(e.confidence, 1, e.occurred_at, 'episodic'),
      (cardinality(p_focus_ids) > 0
        and e.entity_kind = any(p_focus_kinds)
        and e.entity_id   = any(p_focus_ids))
    from atlas.memory_events e
    where e.event_type in ('outcome','reflection','correction')
      and e.occurred_at > now() - make_interval(days => greatest(p_episodic_days, 0))
      and (e.scope = 'world' or (e.scope = 'project' and e.project_id = any(p_project_ids)))
  )
  select
    c.kind, c.id, c.scope, c.project_id, c.memory_class, c.entity_kind, c.entity_id,
    c.summary, c.confidence, c.evidence_count, c.last_seen_at, c.pinned,
    c.base_salience as salience,            -- raw salience; caller applies pin/focus
    c.focus_match
  from candidates c
  -- C3: order + limit by EFFECTIVE salience so pinned/focus rows survive the LIMIT.
  order by (case when c.pinned then 1.0
                 else least(1.0, c.base_salience + case when c.focus_match then 0.15 else 0 end)
            end) desc
  limit greatest(p_limit, 0);
$$;

revoke all on function public.atlas_recall(uuid[],text[],text[],integer,integer)
  from public, anon, authenticated;
grant execute on function public.atlas_recall(uuid[],text[],text[],integer,integer)
  to service_role;
