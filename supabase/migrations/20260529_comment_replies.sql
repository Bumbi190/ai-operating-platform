-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Comment replies queue
--   ─────────────────────
--   Inkommande kommentarer från Instagram + Facebook sparas här.
--   Reply-cronnen plockar upp rader där reply_at <= NOW() och
--   reply_status = 'pending', genererar ett AI-svar och postar det.
--
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS comment_replies (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform       TEXT        NOT NULL,                    -- 'instagram' | 'facebook'
  comment_id     TEXT        NOT NULL UNIQUE,             -- plattformens egna ID
  post_id        TEXT        NOT NULL,                    -- media/post-ID inlägget tillhör
  commenter_name TEXT,                                    -- visningsnamn / username
  comment_text   TEXT        NOT NULL,
  reply_text     TEXT,                                    -- genererat svar (fylls av cron)
  reply_status   TEXT        NOT NULL DEFAULT 'pending',  -- pending | replied | skipped | failed
  received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reply_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
  replied_at     TIMESTAMPTZ,
  error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_comment_replies_pending
  ON comment_replies (reply_status, reply_at)
  WHERE reply_status = 'pending';

ALTER TABLE comment_replies ENABLE ROW LEVEL SECURITY;

-- Service-role kan allt (admin-klient kringgår RLS)
-- Authenticated kan bara läsa (för eventuell dashboard-display)
CREATE POLICY "authenticated_read_comment_replies"
  ON comment_replies FOR SELECT
  TO authenticated
  USING (true);

-- ── pg_cron: reply-cron var 2:a minut ─────────────────────────────────────────
--
--   Kör EFTER att tabellen skapats. Om pg_cron inte är aktiverat i projektet
--   kan dessa rader ignoreras och cronnen triggas manuellt / via Vercel crons.

SELECT cron.schedule(
  'reply-comments',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url    := current_setting('app.cron_base_url') || '/api/media/cron/reply-comments',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.cron_secret')
      )
    );
  $$
) ON CONFLICT (jobname) DO UPDATE
  SET schedule  = EXCLUDED.schedule,
      command   = EXCLUDED.command,
      active    = true;
