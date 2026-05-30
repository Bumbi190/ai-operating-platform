-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Dedup: media_news_items unique constraint on (project_id, url)
--   ──────────────────────────────────────────────────────────────
--   Prevents the same news URL from being inserted twice for the same project.
--   NULL urls are exempt (UNIQUE ignores NULLs in PostgreSQL).
--
--   Step 1: Remove any existing duplicate URLs (keep the oldest row per URL).
--   Step 2: Add the UNIQUE constraint.
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Delete duplicate rows — keep the earliest created_at per (project_id, url)
DELETE FROM media_news_items
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY project_id, url
             ORDER BY created_at ASC  -- keep oldest
           ) AS rn
    FROM media_news_items
    WHERE url IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- 2. Add unique constraint (skips NULLs automatically in Postgres)
ALTER TABLE media_news_items
  ADD CONSTRAINT unique_project_news_url
  UNIQUE (project_id, url);
