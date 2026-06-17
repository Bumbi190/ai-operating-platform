-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 2: salience function (ONE source of truth).
--
-- atlas.salience(...) is the single expression used by recall (Commit 5) AND the
-- archive sweep (Commit 3) so the two can never drift (ADR v3 §6). Salience is
-- COMPUTED AT READ — there is no stored salience column — so this function exists
-- purely as a query-time helper. STABLE (it reads now()); not indexed.
--
--   salience = 0.35·confidence
--            + 0.20·(1 − exp(−evidence_count/3))            -- saturating corroboration
--            + 0.30·exp(−Δdays / halflife(class))           -- recency decay
--            + 0.15·type_weight                             -- class priority
-- clamped to [0,1]. halflife days: episodic 14 / procedural 90 / semantic 180 / decision 365.
-- type_weight: decision 1.0 / semantic 0.9 / procedural 0.8 / episodic 0.5.
-- (Pinned override is applied by the caller, not here.)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function atlas.salience(
  p_confidence     numeric,
  p_evidence_count integer,
  p_last_seen_at   timestamptz,
  p_memory_class   text
) returns numeric
language sql
stable
as $$
  select greatest(0::numeric, least(1::numeric,
      0.35 * coalesce(p_confidence, 0)
    + 0.20 * (1 - exp(-greatest(coalesce(p_evidence_count,1), 1)::numeric / 3))
    + 0.30 * exp(
        - (extract(epoch from (now() - coalesce(p_last_seen_at, now()))) / 86400.0)
          / case p_memory_class
              when 'episodic'   then 14
              when 'procedural' then 90
              when 'semantic'   then 180
              when 'decision'   then 365
              else 90
            end
      )
    + 0.15 * case p_memory_class
               when 'decision'   then 1.0
               when 'semantic'   then 0.9
               when 'procedural' then 0.8
               when 'episodic'   then 0.5
               else 0.8
             end
  ));
$$;
