-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 5: recall wrapper.
--
-- public.atlas_recall(...) — the SECURITY DEFINER wrapper the app calls to READ
-- memory. `atlas` is NEVER exposed to PostgREST (ADR v3 §4); recall reaches the
-- private atlas tables only through this public function, exactly like
-- public.atlas_record_event.
--
-- Returns a unified, ranked candidate set:
--   • atlas.memories      — consolidated procedural/decision beliefs (status=active)
--   • atlas.memory_events — episodic spine (outcome/reflection/correction), never
--                           materialized; read straight from the event log within
--                           a recency window.
--
-- Salience is COMPUTED AT READ via atlas.salience(...) — the SAME function the
-- archive sweep uses (one source of truth, ADR v3 §6). Pinned override and focus
-- boost are applied by the CALLER (recall-memories.ts), not here, so this wrapper
-- stays a pure scoped projection.
--
-- ISOLATION (the critical guardrail): a row is returned only when it is world-scope
-- OR its project_id is in p_project_ids (the caller's allowed set from
-- getAllowedProjectIds). An empty p_project_ids → only world rows. The caller adds
-- a defensive belt filter on top (recall-memories.ts) + an isolation unit test.
--
-- EXECUTE granted to service_role only. Not anon/authenticated.
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
  -- Consolidated memories (procedural/decision), active, in-scope.
  select
    'memory'::text                                                      as kind,
    m.id,
    m.scope,
    m.project_id,
    m.memory_class,
    m.entity_kind,
    m.entity_id,
    m.summary,
    m.confidence,
    m.evidence_count,
    m.last_seen_at,
    m.pinned,
    atlas.salience(m.confidence, m.evidence_count, m.last_seen_at, m.memory_class) as salience,
    (cardinality(p_focus_ids) > 0
      and m.entity_kind = any(p_focus_kinds)
      and m.entity_id   = any(p_focus_ids))                            as focus_match
  from atlas.memories m
  where m.status = 'active'
    and (m.scope = 'world'
         or (m.scope = 'project' and m.project_id = any(p_project_ids)))

  union all

  -- Episodic event spine (never materialized): outcome/reflection/correction in window.
  select
    'event'::text                                                      as kind,
    e.id,
    e.scope,
    e.project_id,
    'episodic'::text                                                   as memory_class,
    e.entity_kind,
    e.entity_id,
    e.content                                                          as summary,
    e.confidence,
    1                                                                  as evidence_count,
    e.occurred_at                                                      as last_seen_at,
    false                                                              as pinned,
    atlas.salience(e.confidence, 1, e.occurred_at, 'episodic')         as salience,
    (cardinality(p_focus_ids) > 0
      and e.entity_kind = any(p_focus_kinds)
      and e.entity_id   = any(p_focus_ids))                            as focus_match
  from atlas.memory_events e
  where e.event_type in ('outcome','reflection','correction')
    and e.occurred_at > now() - make_interval(days => greatest(p_episodic_days, 0))
    and (e.scope = 'world'
         or (e.scope = 'project' and e.project_id = any(p_project_ids)))

  order by salience desc
  limit greatest(p_limit, 0);
$$;

revoke all on function public.atlas_recall(uuid[],text[],text[],integer,integer)
  from public, anon, authenticated;
grant execute on function public.atlas_recall(uuid[],text[],text[],integer,integer)
  to service_role;

comment on function public.atlas_recall(uuid[],text[],text[],integer,integer) is
  'Atlas Memory recall wrapper (ADR v3 §4/§6). Scoped, salience-ranked candidate set '
  'of consolidated memories + episodic events. service_role only; atlas not PostgREST-exposed.';
