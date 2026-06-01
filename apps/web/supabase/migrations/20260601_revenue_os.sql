-- ═══════════════════════════════════════════════════════════════════════
--
--   OMNIRA · Revenue Operating System — Phase 5
--   ────────────────────────────────────────────
--   Tabeller för intäktsspårning, leads och AI-kostnads-snapshots.
--   Kör hela filen i Supabase SQL Editor.
--
-- ═══════════════════════════════════════════════════════════════════════

-- ── Revenue Events ────────────────────────────────────────────────────────────
-- Varje intäktshändelse (betalning, prenumeration, engångsköp etc.)
-- Manuellt inmatad eller via Stripe webhook i framtiden.

CREATE TABLE IF NOT EXISTS revenue_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount       NUMERIC(12, 2) NOT NULL,          -- i SEK (eller valfri valuta)
  currency     TEXT NOT NULL DEFAULT 'SEK',
  source       TEXT NOT NULL DEFAULT 'manual',   -- 'stripe' | 'manual' | 'swish' | 'invoice'
  description  TEXT,
  customer_id  TEXT,                             -- extern kund-ID (Stripe etc.)
  event_type   TEXT NOT NULL DEFAULT 'payment'   -- 'payment' | 'subscription' | 'refund' | 'churn'
                 CHECK (event_type IN ('payment', 'subscription', 'refund', 'churn', 'lead_converted')),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata     JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_revenue_project    ON revenue_events(project_id);
CREATE INDEX IF NOT EXISTS idx_revenue_occurred   ON revenue_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_type       ON revenue_events(event_type);

ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "revenue_owner" ON revenue_events
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- ── Leads ─────────────────────────────────────────────────────────────────────
-- GainPilot lead management och pipeline tracking.

CREATE TABLE IF NOT EXISTS leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  company         TEXT,
  source          TEXT DEFAULT 'manual',         -- 'form' | 'instagram' | 'email' | 'referral' | 'manual'
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'qualified', 'warm', 'proposal', 'won', 'lost')),
  estimated_value NUMERIC(12, 2),               -- uppskattad affärsvärde i SEK
  actual_value    NUMERIC(12, 2),               -- faktisk intäkt när avslutad
  notes           TEXT,
  last_contact_at TIMESTAMPTZ,
  follow_up_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_leads_project ON leads(project_id);
CREATE INDEX IF NOT EXISTS idx_leads_status  ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_owner" ON leads
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- ── AI Cost Snapshots ─────────────────────────────────────────────────────────
-- Dagliga snapshots av faktiska API-kostnader per tjänst.
-- Fylls på av /api/media/cron/cost-snapshot (daglig cron).

CREATE TABLE IF NOT EXISTS ai_cost_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE, -- NULL = plattformsglobal
  service      TEXT NOT NULL,                   -- 'claude' | 'openai' | 'elevenlabs' | 'ideogram' | 'remotion'
  model        TEXT,                            -- t.ex. 'claude-sonnet-4-6'
  tokens_in    BIGINT NOT NULL DEFAULT 0,
  tokens_out   BIGINT NOT NULL DEFAULT 0,
  api_calls    INTEGER NOT NULL DEFAULT 0,
  cost_usd     NUMERIC(10, 6) NOT NULL DEFAULT 0,
  cost_sek     NUMERIC(10, 4),                  -- konverterat om känt
  period_start TIMESTAMPTZ NOT NULL,
  period_end   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_snap_project ON ai_cost_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_cost_snap_service ON ai_cost_snapshots(service);
CREATE INDEX IF NOT EXISTS idx_cost_snap_period  ON ai_cost_snapshots(period_start DESC);

ALTER TABLE ai_cost_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cost_snap_owner" ON ai_cost_snapshots
  FOR ALL USING (
    project_id IS NULL
    OR project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- ── Morning Briefings ─────────────────────────────────────────────────────────
-- Genererade morgonbriefingar sparas här för snabb rendering.

CREATE TABLE IF NOT EXISTS morning_briefings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary      TEXT NOT NULL,                   -- 200-ord text från Claude
  revenue_24h  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cost_24h     NUMERIC(10, 4) NOT NULL DEFAULT 0,
  net_24h      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  top_business TEXT,
  top_action   TEXT,
  data_json    JSONB NOT NULL DEFAULT '{}',     -- rådata för dashboarden
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_briefing_generated ON morning_briefings(generated_at DESC);

-- Ingen RLS — read by service role only (no user data)

-- ── Verifiera ─────────────────────────────────────────────────────────────────
SELECT
  'revenue_events'     AS table_name, COUNT(*) AS rows FROM revenue_events
UNION ALL SELECT 'leads',          COUNT(*) FROM leads
UNION ALL SELECT 'ai_cost_snapshots', COUNT(*) FROM ai_cost_snapshots
UNION ALL SELECT 'morning_briefings', COUNT(*) FROM morning_briefings;
