-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 2: emit wrapper.
--
-- public.atlas_record_event(...) — the SECURITY DEFINER wrapper the app calls to
-- write a memory event. `atlas` is NEVER exposed to PostgREST (ADR v3 §4); the app
-- reaches the private atlas tables only through this public function, exactly like
-- public.claim_runs / public.omnira_applied_migrations.
--
--  • Idempotent on (source, source_id, event_type) when source_id is present
--    (matches the partial unique index) → returns NULL when deduped.
--  • Episodic events (outcome/reflection/correction) get consolidated_at = now() at
--    insert so they bypass the consolidation queue (they are never materialized into
--    atlas.memories; recall reads them straight from the event spine).
--  • dedupe_key CONTRACT: materializable classes (procedural = feedback/observation,
--    decision) MUST carry a dedupe_key — it is the mem_key the Commit-3 consolidation
--    upserts on. A missing key is an emitter-contract violation → FAIL-FAST (raise),
--    the event is NOT written (no un-keyable row, no silent fragmentation). semantic
--    (fact_assertion) and episodic are exempt (semantic keyed in M5; episodic keyed by
--    source:source_id and never materialized). recordMemoryEvent stays non-throwing for
--    the host op and logs the error. NO process markers are ever written to the spine —
--    semantic is identified solely by event_type='fact_assertion' (observability lives
--    in the Commit 5 health metrics).
--  • EXECUTE granted to service_role only (system emit). Not anon/authenticated.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.atlas_record_event(
  p_scope        text,
  p_event_type   text,
  p_content      text,
  p_source       text,
  p_project_id   uuid        default null,
  p_entity_kind  text        default '',
  p_entity_id    text        default '',
  p_subject      text        default null,
  p_structured   jsonb       default '{}'::jsonb,
  p_confidence   numeric     default 0.5,
  p_source_id    text        default null,
  p_dedupe_key   text        default null,
  p_occurred_at  timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_consolidated timestamptz := null;
begin
  -- dedupe_key contract (fail-fast, BEFORE any write): materializable classes require it.
  if p_event_type in ('feedback','observation','decision')
     and (p_dedupe_key is null or btrim(p_dedupe_key) = '') then
    raise exception 'atlas_record_event: dedupe_key is required for materializable event_type "%" (procedural/decision)', p_event_type
      using errcode = 'check_violation';
  end if;

  -- Episodic classes are not consolidated → stamp consolidated_at at insert.
  if p_event_type in ('outcome','reflection','correction') then
    v_consolidated := now();
  end if;

  insert into atlas.memory_events (
    scope, event_type, project_id, entity_kind, entity_id, subject, content,
    structured, confidence, source, source_id, dedupe_key, occurred_at, consolidated_at
  ) values (
    p_scope, p_event_type, p_project_id, coalesce(p_entity_kind,''), coalesce(p_entity_id,''),
    p_subject, p_content, coalesce(p_structured,'{}'::jsonb), p_confidence, p_source,
    p_source_id, p_dedupe_key, coalesce(p_occurred_at, now()), v_consolidated
  )
  on conflict (source, source_id, event_type) where source_id is not null do nothing
  returning id into v_id;

  return v_id;  -- NULL when deduped
end $$;

revoke all on function public.atlas_record_event(text,text,text,text,uuid,text,text,text,jsonb,numeric,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.atlas_record_event(text,text,text,text,uuid,text,text,text,jsonb,numeric,text,text,timestamptz) to service_role;
