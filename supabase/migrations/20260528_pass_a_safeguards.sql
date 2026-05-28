-- ═══════════════════════════════════════════════════════════════════════════════
--
--   PASS A — Operationella säkerhetsskydd
--   ──────────────────────────────────────
--   1. Städa upp fastnade renders (video_status stuck at 'rendering')
--   2. platform_config: global pauskontroll + gränsvärden
--   3. retry_count på media_scripts
--
--   Kör i Supabase SQL Editor (Dashboard → SQL Editor → + New query)
--
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1a. Städa upp fastnade Lambda-renders (media_scripts) ────────────────────
--
--   Alla render-jobs äldre än 2 timmar som fortfarande är i 'rendering'-status
--   är garanterat döda (Lambda-timeout är max 10 min). Markera dem som 'failed'.

UPDATE media_scripts
  SET video_status = 'failed'
WHERE video_status = 'rendering'
  AND created_at < NOW() - INTERVAL '2 hours';


-- ── 1b. Städa upp fastnade körningar (runs) ───────────────────────────────────
--
--   Alla workflow-körningar äldre än 30 minuter som fortfarande är i 'running'-
--   status är fastnade. Markera dem som 'failed' så dashboardräknaren nollställs.

UPDATE runs
  SET status     = 'failed',
      finished_at = NOW(),
      error       = 'Automatiskt markerad som misslyckad — körning fastnade (timeout >30 min)'
WHERE status = 'running'
  AND created_at < NOW() - INTERVAL '30 minutes';

-- Verifiera (kör separat efter ovanstående):
-- SELECT id, hook, video_status, created_at
--   FROM media_scripts
--  WHERE video_status IN ('rendering', 'failed')
--  ORDER BY created_at DESC
--  LIMIT 10;
--
-- SELECT id, status, error, created_at, finished_at
--   FROM runs
--  WHERE status = 'failed'
--  ORDER BY created_at DESC
--  LIMIT 5;


-- ── 2. platform_config — global paus + operationella gränsvärden ───────────────
--
--   Enradstabell (id=1 alltid). Läses av varje cron-route vid start.
--   Service-role kan läsa + skriva. Authenticated-användare kan bara läsa.

CREATE TABLE IF NOT EXISTS platform_config (
  id                   INT PRIMARY KEY DEFAULT 1,
  automation_paused    BOOLEAN     NOT NULL DEFAULT FALSE,
  max_daily_renders    INT         NOT NULL DEFAULT 4,
  max_retry_attempts   INT         NOT NULL DEFAULT 3,
  paused_at            TIMESTAMPTZ,
  paused_reason        TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

-- Service-role kan allt (via admin-klient som kringgår RLS)
-- Authenticated kan bara läsa (för dashboard-display)
CREATE POLICY "authenticated_read_platform_config"
  ON platform_config FOR SELECT
  TO authenticated
  USING (true);

-- Sätt standardvärden om raden inte finns
INSERT INTO platform_config (id, automation_paused, max_daily_renders, max_retry_attempts)
VALUES (1, FALSE, 4, 3)
ON CONFLICT (id) DO NOTHING;


-- ── 3. retry_count på media_scripts ───────────────────────────────────────────
--
--   Räknar publish-försök. Stoppas vid max_retry_attempts.
--   publish_failed_reason sparar sista felmeddelande för operatörsgranskning.

ALTER TABLE media_scripts
  ADD COLUMN IF NOT EXISTS retry_count           INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS publish_failed_reason TEXT;


-- ── Verifiering ────────────────────────────────────────────────────────────────
--
--   SELECT * FROM platform_config;
--
--   SELECT id, hook, video_status, retry_count, created_at
--     FROM media_scripts
--    ORDER BY created_at DESC
--    LIMIT 5;
