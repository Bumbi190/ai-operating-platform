-- ═══════════════════════════════════════════════════════════════════════
--   OMNIRA · Atlas BI Foundation — Phase 3 (reuse model)
--   No new agent_events / social_metrics / lead_events: we extend the tables
--   that already hold this data (runs+cost_events, media_insights, leads).
-- ═══════════════════════════════════════════════════════════════════════

-- Social analytics: extend existing media_insights (not a parallel social_metrics)
ALTER TABLE media_insights ADD COLUMN IF NOT EXISTS platform         TEXT NOT NULL DEFAULT 'instagram';
ALTER TABLE media_insights ADD COLUMN IF NOT EXISTS impressions      INTEGER;
ALTER TABLE media_insights ADD COLUMN IF NOT EXISTS profile_visits   INTEGER;
ALTER TABLE media_insights ADD COLUMN IF NOT EXISTS link_clicks      INTEGER;
ALTER TABLE media_insights ADD COLUMN IF NOT EXISTS followers_gained INTEGER;

-- Lead intelligence: extend existing leads (not a new lead_events)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;

-- Infra/subscription costs (monthly, not per-call) — complements cost_events
CREATE TABLE IF NOT EXISTS infra_costs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL,
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  period_month DATE NOT NULL,
  amount_sek   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_infra_costs_period ON infra_costs(period_month DESC);

ALTER TABLE infra_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "infra_costs_owner" ON infra_costs
  FOR ALL USING (
    project_id IS NULL OR project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );
