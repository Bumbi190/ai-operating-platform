-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Atlas Intelligence — Cognitive Artifact Store
--   ─────────────────────────────────────────────
--   Append-only store for EI cognitive artifacts. EI never updates rows; it
--   supersedes them (old row gains superseded_by FK pointing to the new row).
--   This preserves the full reasoning track record (canonical §8.4, §13.3).
--
--   Every row is a reasoned artifact (P3, P4): it carries body (interpretation),
--   evidence (provenance), confidence, and produced_by (producer identity).
--
--   RLS: only service-role may read/write. EI orchestrators use createAdminClient().
--   No PostgREST access: this table is never exposed to anon/authenticated.
--
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.atlas_intelligence (
  -- Identity
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,

  -- Scope: null = platform-global; set = project-scoped
  project_id      uuid references public.projects(id) on delete set null,

  -- Subject (optional): the entity this artifact is about
  subject_kind    text,        -- 'project' | 'metric' | 'tenant' | 'content'
  subject_id      text,
  subject_name    text,

  -- Cognitive artifact body (interpretation, never raw data — P3)
  body            jsonb not null default '{}',

  -- Provenance (P4): every artifact carries its evidence chain
  evidence        jsonb not null default '[]',

  -- Calibrated confidence 0–1 (§8.2)
  confidence      numeric(5,4) not null
    constraint atlas_intelligence_confidence_range check (confidence >= 0 and confidence <= 1),

  -- Timestamps
  produced_at     timestamptz not null default now(),

  -- Producer identity (version string, e.g. 'brief-producer-1.0.0')
  produced_by     text not null,

  -- Reasoning window (what time range was reasoned over)
  window_since    timestamptz,
  window_until    timestamptz,

  -- Append-only supersession chain (§8.4, §13.3)
  -- When EI produces a new version of an artifact, the old row gains this FK.
  superseded_by   uuid references public.atlas_intelligence(id) on delete set null
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary read pattern: latest non-superseded artifact by kind + project
create index if not exists atlas_intelligence_kind_project_active_idx
  on public.atlas_intelligence (kind, project_id, produced_at desc)
  where superseded_by is null;

-- Subject lookup (for per-entity reasoning history)
create index if not exists atlas_intelligence_subject_idx
  on public.atlas_intelligence (subject_kind, subject_id, produced_at desc)
  where subject_kind is not null;

-- Window overlap queries (for prior brief continuity — §13.3)
create index if not exists atlas_intelligence_window_idx
  on public.atlas_intelligence (kind, project_id, window_since, window_until);

-- ── Row-level security ────────────────────────────────────────────────────────
-- Service-role only. No PostgREST policies.

alter table public.atlas_intelligence enable row level security;
revoke all on public.atlas_intelligence from anon, authenticated;

comment on table public.atlas_intelligence is
  'Atlas EI cognitive artifact store. Append-only. Service-role only. '
  'See docs/architecture/ATLAS_EXECUTIVE_INTELLIGENCE.md §14.';
