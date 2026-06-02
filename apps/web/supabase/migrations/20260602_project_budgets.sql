-- ═══════════════════════════════════════════════════════════════════════
--
--   OMNIRA · Cost Intelligence — Phase 2 (Budgetvakt)
--   ─────────────────────────────────────────────────
--   Per-projekt månadsbudget i SEK. Driver budget-progress-baren och
--   varning/kritisk-status i Cost Intelligence Center.
--
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_budgets (
  project_id  UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  monthly_sek NUMERIC(12, 2) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_budgets_owner" ON project_budgets
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- Startbudgetar (justera fritt — eller via UI senare)
INSERT INTO project_budgets (project_id, monthly_sek)
SELECT id, CASE slug
  WHEN 'ai-media-automation' THEN 700
  WHEN 'familje-stunden'     THEN 500
  WHEN 'gainpilot'           THEN 300
  ELSE 0 END
FROM projects
WHERE slug IN ('ai-media-automation', 'familje-stunden', 'gainpilot')
ON CONFLICT (project_id) DO NOTHING;
