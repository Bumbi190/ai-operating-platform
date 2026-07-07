-- Business-first dashboard: real data sources for revenue, leads and campaigns.
-- These start empty and are populated by the GainPilot / sales pipeline.

CREATE TABLE IF NOT EXISTS leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text,
  email       text,
  source      text,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new','qualified','converted','lost')),
  value_sek   numeric,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_project ON leads(project_id);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

CREATE TABLE IF NOT EXISTS campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  channel     text,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','ended')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  ended_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_campaigns_project ON campaigns(project_id);

CREATE TABLE IF NOT EXISTS revenue_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount_sek  numeric NOT NULL,
  currency    text NOT NULL DEFAULT 'SEK',
  source      text,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revenue_project ON revenue_events(project_id);
CREATE INDEX IF NOT EXISTS idx_revenue_occurred ON revenue_events(occurred_at);

ALTER TABLE leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;
