-- ─────────────────────────────────────────────────────────────────────────────
-- H0 hardening — codify RLS + project_id integrity for the media tables.
--
-- WHY: media_news_items / media_scripts were created (20260520_media_tables.sql)
-- with NO row-level security and a NULLABLE project_id. RLS was later enabled
-- by hand in the live project but never written down — so a rebuild from
-- migrations would silently recreate these tables WITHOUT RLS (anon-readable).
-- This migration makes the live state reproducible and adds the owner-scoped
-- policy used by every other project-native table (e.g. cost_events).
--
-- Idempotent + safe: enabling RLS is a no-op if already on; service-role (the
-- admin client used by the media API routes) bypasses RLS, so route behaviour
-- is unchanged. The policies only GRANT the owner read/write via the
-- anon/authenticated client (which previously had none). Verified 0 rows with
-- NULL project_id before adding NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. project_id integrity — must always identify the owning project.
ALTER TABLE media_news_items ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE media_scripts    ALTER COLUMN project_id SET NOT NULL;

-- 2. Row-level security (owner-scoped, matches cost_events / approvals pattern).
ALTER TABLE media_news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_scripts    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "media_news_items_owner" ON media_news_items;
CREATE POLICY "media_news_items_owner" ON media_news_items
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "media_scripts_owner" ON media_scripts;
CREATE POLICY "media_scripts_owner" ON media_scripts
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );
