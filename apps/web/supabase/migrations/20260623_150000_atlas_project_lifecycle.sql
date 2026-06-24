-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Collectors v1 — Migration 1: Project Lifecycle Mode
--
-- Adds `atlas_mode` to public.projects as a text field with a CHECK constraint.
-- Four states:
--   active   = full Atlas pipeline (signals → analysis → opportunities → execution)
--   observer = collect + analyse only; no execution surface
--   hibernate = no collection; architecture-ready only
--   archived  = permanently retired; data preserved; no new collection
--
-- Default: 'observer' (safe conservative: collects data but no execution).
-- Seed: sets known internal projects to their correct modes.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS atlas_mode text NOT NULL DEFAULT 'observer'
    CONSTRAINT projects_atlas_mode_check
    CHECK (atlas_mode IN ('active', 'observer', 'hibernate', 'archived'));

COMMENT ON COLUMN public.projects.atlas_mode IS
  'Atlas project lifecycle mode. '
  'active = full pipeline including execution; '
  'observer = collect + analyse, no execution; '
  'hibernate = no collection, architecture-ready; '
  'archived = permanently retired, data preserved.';

-- Seed known internal projects to their correct modes.
-- Any project not listed here keeps the default ''observer'' (safe).
UPDATE public.projects SET atlas_mode = 'active'    WHERE slug = 'ai-media-automation';
UPDATE public.projects SET atlas_mode = 'observer'  WHERE slug = 'familje-stunden';
UPDATE public.projects SET atlas_mode = 'hibernate' WHERE slug = 'gainpilot';
