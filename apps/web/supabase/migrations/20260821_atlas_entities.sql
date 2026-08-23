-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Atlas Entities — Canonical Entity Registry (canonical activation)
--   ─────────────────────────────────────────────────────────────────
--   Derived from the historical, never-applied migration
--   `supabase/migrations/20260629_120100_atlas_entities.sql`
--   (sha256 62ebde75d231bbc6df8187e2db61313b2f853810351d85e142831fd782816006).
--
--   Stable natural-key registry of the entities EI reasons about. Cognitive
--   artifacts name their subject by (kind, key) rather than by an opaque id, so
--   a reasoning trace still resolves after the underlying data is restructured.
--
--   `postgres-store.ts` reconciles an artifact's subject into this registry on
--   every append. That reconciliation is deliberately best-effort (try/catch,
--   non-fatal), so a missing registry would NOT crash brief generation — it
--   would log a warning forever and leave the §14 registry permanently absent.
--   That is precisely why this table belongs in the same activation bundle as
--   the artifact store rather than being deferred.
--
--   ── INTENTIONAL DIFFERENCE FROM THE HISTORICAL FILE ──────────────────────────
--
--   (1) unique (kind, key, project_id)  →  unique nulls not distinct (...)
--
--       The historical comment promised "(kind, key, project_id) must be
--       unique", but a plain UNIQUE in PostgreSQL is NULLS DISTINCT: two rows
--       whose project_id IS NULL do not conflict with each other. Every unique
--       index in this production database confirms the default
--       (pg_index.indnullsnotdistinct = false on all of them).
--
--       That matters because the registry is written through
--         .upsert({...}, { onConflict: 'kind,key,project_id' })
--       and PLATFORM-GLOBAL entities are registered with project_id NULL. Under
--       NULLS DISTINCT the arbiter index can never match for a global entity, so
--       ON CONFLICT would never fire and every reconciliation would INSERT a new
--       duplicate — an unbounded set of rows all claiming to be the same
--       canonical entity, which defeats the registry's only purpose.
--
--       PostgreSQL 15+ (production runs 17.6) supports NULLS NOT DISTINCT, which
--       makes the constraint mean what the historical comment already said.
--       Shipping the registry without this would satisfy a "table exists" check
--       while leaving the natural key broken for exactly the global scope the
--       Executive world brief occupies.
--
--   project_id keeps ON DELETE CASCADE, unlike the artifact store's RESTRICT.
--   The difference is deliberate: this registry is a derived lookup, not an
--   institutional record. An artifact stores its own subject_kind/subject_id
--   inline, so discarding a deleted project's registry rows loses a convenience
--   index, never evidence — and because atlas_intelligence RESTRICTs, a project
--   holding artifacts cannot be deleted in the first place.
--
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.atlas_entities (
  id          uuid primary key default gen_random_uuid(),

  -- Natural key: (kind, key, project_id), with NULL project_id treated as a
  -- single global bucket rather than as infinitely many distinct ones.
  kind        text not null,   -- 'project' | 'metric' | 'tenant' | 'content'
  key         text not null,   -- stable identifier, e.g. metric slug or project slug
  project_id  uuid references public.projects(id) on delete cascade,

  -- Human-readable display name
  name        text,

  -- Arbitrary metadata (schema-less for extensibility)
  meta        jsonb not null default '{}',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint atlas_entities_natural_key
    unique nulls not distinct (kind, key, project_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists atlas_entities_kind_project_idx
  on public.atlas_entities (kind, project_id);

-- ── Row-level security ────────────────────────────────────────────────────────

alter table public.atlas_entities enable row level security;
revoke all on public.atlas_entities from anon, authenticated;

comment on table public.atlas_entities is
  'Atlas EI canonical entity registry. Natural key (kind, key, project_id) with '
  'NULLS NOT DISTINCT so global entities are genuinely unique. Service-role only.';
