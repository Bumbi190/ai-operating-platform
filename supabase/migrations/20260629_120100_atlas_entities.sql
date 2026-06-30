-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Atlas Entities — Canonical Entity Registry
--   ───────────────────────────────────────────
--   Stable natural-key registry of entities EI reasons about (projects,
--   metrics, tenants, content items). EI cognitive artifacts reference entities
--   via (kind, key) rather than opaque IDs, so reasoning traces survive data
--   restructuring over a decade. See canonical §14.
--
--   Unique on (kind, key, project_id): same entity name may appear in
--   different projects without collision.
--
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.atlas_entities (
  id          uuid primary key default gen_random_uuid(),

  -- Natural key: (kind, key, project_id) must be unique
  kind        text not null,   -- 'project' | 'metric' | 'tenant' | 'content'
  key         text not null,   -- stable identifier, e.g. metric slug or project slug
  project_id  uuid references public.projects(id) on delete cascade,

  -- Human-readable display name
  name        text,

  -- Arbitrary metadata (schema-less for extensibility)
  meta        jsonb not null default '{}',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint atlas_entities_natural_key unique (kind, key, project_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists atlas_entities_kind_project_idx
  on public.atlas_entities (kind, project_id);

-- ── Row-level security ────────────────────────────────────────────────────────

alter table public.atlas_entities enable row level security;
revoke all on public.atlas_entities from anon, authenticated;

comment on table public.atlas_entities is
  'Atlas EI canonical entity registry. Natural key (kind, key, project_id). '
  'Service-role only. See docs/architecture/ATLAS_EXECUTIVE_INTELLIGENCE.md §14.';
