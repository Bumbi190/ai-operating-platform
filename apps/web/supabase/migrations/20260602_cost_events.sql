-- ═══════════════════════════════════════════════════════════════════════
--
--   OMNIRA · Cost Intelligence — Phase 1
--   ────────────────────────────────────
--   Per-call cost tracking. This is the GRANULAR source of truth that powers
--   the Cost Intelligence Center: today/week/month KPIs, cost-per-project,
--   cost-per-agent, the live cost stream and the AI-CFO insights.
--
--   Distinct from `ai_cost_snapshots` (daily aggregates). Snapshots can later
--   be derived from this table; this is where every individual API call lands.
--
--   Kör hela filen i Supabase SQL Editor (eller via migration).
--
-- ═══════════════════════════════════════════════════════════════════════

-- ── Cost Events ─────────────────────────────────────────────────────────────
-- One row per billable API call (LLM completion, voiceover, image, …).

CREATE TABLE IF NOT EXISTS cost_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = plattformsglobal
  provider     TEXT NOT NULL,                    -- 'anthropic' | 'openai' | 'elevenlabs' | 'ideogram' | 'meta' | 'google'
  model        TEXT,                             -- t.ex. 'claude-sonnet-4-6'
  agent        TEXT,                             -- t.ex. 'Script Writer', 'Voice Director', 'QA Agent'
  operation    TEXT,                             -- t.ex. 'Generate Script', 'Generate Voiceover', 'Scene Image'
  unit_type    TEXT NOT NULL DEFAULT 'tokens'    -- 'tokens' | 'characters' | 'images' | 'seconds'
                 CHECK (unit_type IN ('tokens', 'characters', 'images', 'seconds', 'requests')),
  units        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tokens_in    BIGINT NOT NULL DEFAULT 0,
  tokens_out   BIGINT NOT NULL DEFAULT 0,
  cost_usd     NUMERIC(12, 6) NOT NULL DEFAULT 0,
  cost_sek     NUMERIC(12, 4) NOT NULL DEFAULT 0,
  run_id       UUID,                             -- valfri koppling till runs
  script_id    UUID,                             -- valfri koppling till media_scripts
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_events_project  ON cost_events(project_id);
CREATE INDEX IF NOT EXISTS idx_cost_events_provider ON cost_events(provider);
CREATE INDEX IF NOT EXISTS idx_cost_events_agent    ON cost_events(agent);
CREATE INDEX IF NOT EXISTS idx_cost_events_created  ON cost_events(created_at DESC);

ALTER TABLE cost_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cost_events_owner" ON cost_events
  FOR ALL USING (
    project_id IS NULL
    OR project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- ── Cost Rates ──────────────────────────────────────────────────────────────
-- Configurable unit prices (USD) + FX, so cost calc never hardcodes a number
-- in the UI. LLM token prices live in lib/ai/pricing.ts (MODEL_PRICING); this
-- table holds the FX rate and the per-unit prices for non-token providers.

CREATE TABLE IF NOT EXISTS cost_rates (
  key        TEXT PRIMARY KEY,
  value      NUMERIC(14, 6) NOT NULL,
  note       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO cost_rates (key, value, note) VALUES
  ('usd_sek',                       10.50,  'USD→SEK växelkurs (uppdatera vid behov)'),
  ('elevenlabs_usd_per_1k_chars',   0.240,  'ElevenLabs TTS — effektivt pris per 1000 tecken'),
  ('ideogram_v3_usd_per_image',     0.080,  'Ideogram v3 generate — pris per bild (DEFAULT speed)'),
  ('gpt_image_usd_per_image',       0.042,  'OpenAI gpt-image-1 — pris per bild')
ON CONFLICT (key) DO NOTHING;

-- ── Verifiera ─────────────────────────────────────────────────────────────────
SELECT 'cost_events' AS table_name, COUNT(*) AS rows FROM cost_events
UNION ALL SELECT 'cost_rates', COUNT(*) FROM cost_rates;
