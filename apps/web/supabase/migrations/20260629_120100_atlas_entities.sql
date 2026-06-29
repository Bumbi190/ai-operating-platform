-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Entities — canonical subjects intelligence can be about.
--
-- A stable registry so every intelligence object (and future relationship /
-- graph node) references the SAME company / person / topic by its natural key
-- (kind, key). Identity is (kind, key); display_name + attributes evolve.
--
-- Reconciles conceptually with atlas.memories.entity_kind/entity_id, but this is
-- the canonical, deduplicated registry that atlas_intelligence.subject_ref points
-- at when subject_kind = 'entity'.
--
-- Relationships between entities are deliberately NOT modeled in P0 (YAGNI until
-- a producer needs traversal). The Relationship contract exists in TypeScript;
-- when a graph backend (Graphify) is evaluated, entities + relationships move
-- behind IntelligenceStore without changing producers or consumers.
--
-- See OMNIRA_ATLAS_INTELLIGENCE_ADR.md.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.atlas_entities (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('company','person','product','topic','project','content')),
  key           text not null,
  display_name  text not null,
  attributes    jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint atlas_entities_key_nonempty  check (length(trim(key)) > 0),
  constraint atlas_entities_name_nonempty check (length(trim(display_name)) > 0),
  -- Upsert target: identity is the natural key (kind, key).
  constraint atlas_entities_identity unique (kind, key)
);

create index atlas_entities_kind_idx on public.atlas_entities(kind);

alter table public.atlas_entities enable row level security;

-- Admin-only via service role, mirroring atlas_signals / atlas_intelligence.
create policy atlas_entities_service_role_only
  on public.atlas_entities
  for all
  to authenticated
  using (false)
  with check (false);

comment on table public.atlas_entities is
  'Canonical registry of entities (company/person/product/topic/project/content) that Atlas Intelligence is about. Identity = (kind, key). See OMNIRA_ATLAS_INTELLIGENCE_ADR.md.';
comment on column public.atlas_entities.key is
  'Stable natural key, unique within kind (lowercase slug, e.g. ''openai''). atlas_intelligence.subject_ref points here for entity subjects.';
