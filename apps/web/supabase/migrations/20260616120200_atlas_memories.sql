-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 1: atlas.memories (consolidated, ranked store).
--
-- Distilled belief (ADR v3 §3.2). M4 holds only the CONSOLIDATING classes
-- (procedural, decision); episodic lives only in atlas.memory_events; semantic = M5.
-- NO `salience` column — salience is computed at read (recall + archive sweep), so
-- there is no nightly full-table recompute and weight-tuning is instant.
--
-- The unique key uses NULLS NOT DISTINCT (PG15+) so world-scope rows (project_id NULL)
-- de-duplicate correctly on the same (scope, class, entity, mem_key) — the upsert target.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists atlas.memories (
  id               uuid primary key default gen_random_uuid(),
  scope            text not null check (scope in ('project','world','org')),
  memory_class     text not null check (memory_class in ('procedural','decision')),
  project_id       uuid references public.projects(id) on delete cascade,
  entity_kind      text not null default '',
  entity_id        text not null default '',
  mem_key          text not null,
  summary          text not null,
  value            jsonb not null default '{}',
  confidence       numeric(4,3) not null default 0.3 check (confidence >= 0 and confidence <= 1),
  source_trust     numeric(4,3) not null default 0.5 check (source_trust >= 0 and source_trust <= 1),
  evidence_count   int not null default 1,
  status           text not null default 'active' check (status in ('active','archived','superseded')),
  superseded_by    uuid references atlas.memories(id),
  pinned           boolean not null default false,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  last_accessed_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint memories_project_scope check ((scope = 'project') = (project_id is not null))
);

-- Upsert target. NULLS NOT DISTINCT so a NULL project_id (world/org) collides on the rest.
create unique index if not exists memories_upsert_key
  on atlas.memories (scope, memory_class, project_id, entity_kind, entity_id, mem_key) nulls not distinct;
-- Recall pre-filter (salience computed inline) + archive sweep.
create index if not exists memories_recall on atlas.memories (scope, project_id, status);
create index if not exists memories_archive_sweep on atlas.memories (last_seen_at);

grant select, insert, update, delete on atlas.memories to service_role;
