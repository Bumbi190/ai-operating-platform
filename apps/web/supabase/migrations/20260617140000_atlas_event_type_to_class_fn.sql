-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 3: single source of class derivation.
--
-- atlas.event_type_to_class(event_type) is the ONE DB-side encoding of the taxonomy.
-- The TS eventTypeToClass (Commit 2) mirrors it; the consolidation filter is built on
-- it. Keeping one source removes drift (review M1). IMMUTABLE (pure function of input).
--
-- Mapping (ADR v3 §3.1): feedback/observation → procedural · decision → decision ·
-- fact_assertion → semantic (M5) · outcome/reflection/correction → episodic.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function atlas.event_type_to_class(p_event_type text)
returns text language sql immutable as $$
  select case p_event_type
    when 'decision'       then 'decision'
    when 'feedback'       then 'procedural'
    when 'observation'    then 'procedural'
    when 'fact_assertion' then 'semantic'
    when 'outcome'        then 'episodic'
    when 'reflection'     then 'episodic'
    when 'correction'     then 'episodic'
    else 'unknown'
  end;
$$;
