-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 3: consolidation + archive (DB-internal, pg_cron-driven).
--
-- H1 eliminated by design — atlas.memories can ONLY ever hold procedural/decision:
--   (1) select-time: the queue filter picks ONLY class ∈ {procedural,decision};
--       episodic is already consolidated_at-stamped at insert (never in the queue),
--       semantic (fact_assertion) is filtered out and left for M5 (no spine mutation,
--       surfaced by the Commit 5 health metric); and the filter also requires a
--       non-blank dedupe_key (ingress already guarantees it — defensive, never
--       fabricates a key);
--   (2) constraint-time: atlas.memories.memory_class CHECK ('procedural','decision')
--       is the hard backstop — any forbidden class fails loudly.
--
-- value is a FIXED 3-key object (last_source/last_event_id/last_event_at) rebuilt each
-- upsert — never accumulated (bounded by construction). evidence_count is the counter.
-- Confidence accumulates upward in M4 (correction is episodic → not consolidated);
-- contradiction/lineage is M5. Idempotent via consolidated_at + ON CONFLICT.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function atlas.consolidate_memory_events(p_batch integer default 500)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; v_class text; v_trust numeric; v_delta numeric; n integer := 0;
begin
  for r in
    select e.* from atlas.memory_events e
    where e.consolidated_at is null
      and atlas.event_type_to_class(e.event_type) in ('procedural','decision')
      and coalesce(btrim(e.dedupe_key), '') <> ''
    order by e.occurred_at
    for update skip locked
    limit p_batch
  loop
    v_class := atlas.event_type_to_class(r.event_type);
    v_trust := case r.source
                 when 'human' then 0.95 when 'operator' then 0.85 when 'approval' then 0.80
                 when 'dream' then 0.60 when 'model' then 0.60 else 0.50 end;
    v_delta := (case r.event_type when 'decision' then 0.10 else 0.05 end) * v_trust;

    insert into atlas.memories (
      scope, memory_class, project_id, entity_kind, entity_id, mem_key,
      summary, value, confidence, source_trust, evidence_count, status,
      first_seen_at, last_seen_at, created_at, updated_at
    ) values (
      r.scope, v_class, r.project_id, r.entity_kind, r.entity_id, r.dedupe_key,
      left(r.content, 500),
      jsonb_build_object('last_source', r.source, 'last_event_id', r.id, 'last_event_at', r.occurred_at),
      greatest(0.05, least(0.99, 0.3 + v_delta)),
      v_trust, 1, 'active',
      r.occurred_at, r.occurred_at, now(), now()
    )
    on conflict (scope, memory_class, project_id, entity_kind, entity_id, mem_key) do update set
      evidence_count = atlas.memories.evidence_count + 1,
      last_seen_at   = greatest(atlas.memories.last_seen_at, excluded.last_seen_at),
      confidence     = greatest(0.05, least(0.99, atlas.memories.confidence + v_delta)),
      source_trust   = greatest(atlas.memories.source_trust, excluded.source_trust),
      summary        = excluded.summary,
      value          = jsonb_build_object('last_source', r.source, 'last_event_id', r.id, 'last_event_at', r.occurred_at),
      updated_at     = now();

    update atlas.memory_events set consolidated_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Archive sweep: soft-archive genuinely dead memories. Threshold 0.08 is intentionally
-- conservative — procedural/decision are durable (long half-lives + type-weight floor),
-- so this is a near-inert safety valve in M4, not active pruning. Never throws.
create or replace function atlas.archive_stale_memories()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update atlas.memories set status = 'archived', updated_at = now()
  where status = 'active' and not pinned
    and last_seen_at < now() - interval '30 days'
    and atlas.salience(confidence, evidence_count, last_seen_at, memory_class) < 0.08;
  get diagnostics n = row_count;
  return n;
end $$;
