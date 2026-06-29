-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Collectors v1 — Migration 2: Signals Schema Evolution
--
-- Adds two columns to public.atlas_signals:
--   project_id — scopes a signal to a project (NULL = platform-global, e.g. impact scores)
--   source     — identifies the external data source (stripe, instagram, facebook, etc.)
--
-- Existing rows keep NULL in both columns — fully backward compatible.
-- Two new indexes cover the primary collector query patterns.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.atlas_signals
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source     text;

COMMENT ON COLUMN public.atlas_signals.project_id IS
  'Scopes this signal to a specific project. '
  'NULL = platform-global (e.g. content impact score, weekly market summary).';

COMMENT ON COLUMN public.atlas_signals.source IS
  'External data source identifier: stripe, instagram, facebook, youtube, supabase, etc. '
  'NULL for internally-derived signals (impact score, opportunity score).';

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Primary collector query path: "latest signals for project X of kind Y"
CREATE INDEX IF NOT EXISTS atlas_signals_project_kind_idx
  ON public.atlas_signals (project_id, kind, produced_at DESC)
  WHERE project_id IS NOT NULL;

-- Cross-project source query: "all instagram signals in the last 30 days"
CREATE INDEX IF NOT EXISTS atlas_signals_source_kind_idx
  ON public.atlas_signals (source, kind, produced_at DESC)
  WHERE source IS NOT NULL;
