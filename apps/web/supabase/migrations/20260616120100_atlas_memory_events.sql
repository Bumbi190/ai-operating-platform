-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 1: atlas.memory_events (append-only event spine).
--
-- The immutable source of truth (ADR v3 §3.1). `memory_class` is NOT stored — it is
-- derived from event_type in code. Episodic events get consolidated_at set at insert
-- (they are never materialized into atlas.memories); only procedural/decision events
-- stay in the consolidation queue (consolidated_at IS NULL).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists atlas.memory_events (
  id              uuid primary key default gen_random_uuid(),
  scope           text not null check (scope in ('project','world','org')),
  event_type      text not null check (event_type in
                    ('observation','decision','outcome','feedback','fact_assertion','reflection','correction')),
  project_id      uuid references public.projects(id) on delete cascade,
  entity_kind     text not null default '',
  entity_id       text not null default '',
  subject         text,
  content         text not null,
  structured      jsonb not null default '{}',
  confidence      numeric(4,3) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  source          text not null,
  source_id       text,
  dedupe_key      text,
  occurred_at     timestamptz not null default now(),
  ingested_at     timestamptz not null default now(),
  consolidated_at timestamptz,
  constraint memory_events_project_scope check ((scope = 'project') = (project_id is not null))
);

-- Idempotent emit: one event per (source, source_id, event_type) when source_id is present.
create unique index if not exists memory_events_idem
  on atlas.memory_events (source, source_id, event_type) where source_id is not null;
-- Consolidation queue (procedural/decision awaiting fold-in).
create index if not exists memory_events_consolidation_queue
  on atlas.memory_events (consolidated_at) where consolidated_at is null;
-- Episodic recall scan.
create index if not exists memory_events_recall
  on atlas.memory_events (scope, project_id, occurred_at desc);
create index if not exists memory_events_entity on atlas.memory_events (entity_kind, entity_id);
create index if not exists memory_events_dedupe on atlas.memory_events (dedupe_key);

grant select, insert, update, delete on atlas.memory_events to service_role;
