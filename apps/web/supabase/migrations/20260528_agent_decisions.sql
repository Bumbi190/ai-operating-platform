-- ═════════════════════════════════════════════════════════════════════════════
-- 20260528_agent_decisions.sql
--
-- Foundation for real "autonomous decision visibility" in the Omnira OS.
--
-- Adds:
--   1. agent_decisions       — every decision an agent makes, with rationale,
--                              confidence, alternatives, and memory refs.
--   2. memory_refs           — many-to-many between decisions and memory entries
--                              (so the dashboard can show "this decision pulled
--                              memory entry X with weight 0.87").
--   3. agent_scorecards view — read-optimized aggregate over run_logs + runs,
--                              fed by the in-memory computation in
--                              lib/os/scoring.ts. The view exists so future
--                              code can SELECT directly instead of joining
--                              in app code.
--
-- All tables are RLS-protected to project_id ownership.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. agent_decisions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_decisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid REFERENCES projects(id) ON DELETE CASCADE,
  agent_id          uuid REFERENCES agents(id)   ON DELETE SET NULL,
  run_id            uuid REFERENCES runs(id)     ON DELETE CASCADE,
  step_order        int,            -- workflows.steps[].order this decision belongs to

  -- The decision itself
  decision          text NOT NULL,  -- e.g. "Selected shot 7 as opening frame"
  rationale         text,           -- one-paragraph explanation, surfaced in UI
  confidence        int,            -- 0-100 ensemble confidence at decision time
  alternatives      jsonb,          -- [{ option: '...', score: 0.62 }, ...]

  -- Outcome (filled later when measurable)
  outcome           text,           -- 'positive' | 'negative' | 'neutral' | NULL
  outcome_signal    jsonb,          -- e.g. { metric: 'engagement', delta: 0.18 }
  outcome_recorded_at timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_project_created
  ON agent_decisions(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_agent_created
  ON agent_decisions(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_run
  ON agent_decisions(run_id, step_order);

COMMENT ON TABLE  agent_decisions IS
  'Each row is a single autonomous decision an agent made: what it decided, why, with what confidence, and (when known) what the outcome was.';
COMMENT ON COLUMN agent_decisions.alternatives IS
  'Other options considered, with their scores. Shape: [{ option: string, score: number, reason?: string }]';
COMMENT ON COLUMN agent_decisions.outcome_signal IS
  'Structured measurement of how the decision performed. e.g. { metric: ''engagement'', baseline: 0.42, actual: 0.50, delta: 0.08 }';

-- 2. memory_refs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_refs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid REFERENCES agent_decisions(id) ON DELETE CASCADE,
  memory_id   uuid REFERENCES memories(id)        ON DELETE CASCADE,
  weight      numeric(4, 3) DEFAULT 0.5,   -- 0.000–1.000 influence weight
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (decision_id, memory_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_refs_decision ON memory_refs(decision_id);
CREATE INDEX IF NOT EXISTS idx_memory_refs_memory   ON memory_refs(memory_id);

COMMENT ON TABLE memory_refs IS
  'Links a decision to the memory entries that influenced it, with a weight indicating how strongly each entry contributed.';

-- 3. agent_scorecards (view) ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW agent_scorecards AS
WITH window_runs AS (
  SELECT id, status, workflow_id, project_id, created_at
  FROM runs
  WHERE created_at >= NOW() - INTERVAL '7 days'
),
window_logs AS (
  SELECT
    rl.run_id,
    rl.step_name,
    rl.tokens_in,
    rl.tokens_out,
    rl.duration_ms,
    rl.created_at
  FROM run_logs rl
  WHERE rl.created_at >= NOW() - INTERVAL '7 days'
    AND rl.role = 'assistant'
),
agent_logs AS (
  SELECT
    a.id          AS agent_id,
    a.project_id  AS project_id,
    a.name        AS agent_name,
    wl.run_id,
    wl.tokens_in,
    wl.tokens_out,
    wl.duration_ms,
    wl.created_at
  FROM agents a
  LEFT JOIN window_logs wl
    ON lower(wl.step_name) = lower(a.name)
),
agg AS (
  SELECT
    al.agent_id,
    al.project_id,
    al.agent_name,
    COUNT(al.run_id)                    AS step_count,
    COUNT(DISTINCT al.run_id)           AS run_count,
    COALESCE(SUM(al.tokens_in + al.tokens_out), 0) AS tokens,
    AVG(al.duration_ms)::int            AS avg_duration_ms,
    MAX(al.created_at)                  AS last_active_at,
    SUM(CASE WHEN wr.status = 'done'   THEN 1 ELSE 0 END) AS done_runs,
    SUM(CASE WHEN wr.status = 'failed' THEN 1 ELSE 0 END) AS failed_runs
  FROM agent_logs al
  LEFT JOIN window_runs wr ON wr.id = al.run_id
  GROUP BY al.agent_id, al.project_id, al.agent_name
)
SELECT
  agent_id,
  project_id,
  agent_name,
  step_count,
  run_count,
  tokens,
  avg_duration_ms,
  last_active_at,
  done_runs,
  failed_runs,
  CASE
    WHEN (done_runs + failed_runs) = 0 THEN 0
    ELSE ROUND(100.0 * done_runs / (done_runs + failed_runs))::int
  END AS success_rate,
  CASE
    WHEN last_active_at IS NULL                         THEN 'silent'
    WHEN last_active_at > NOW() - INTERVAL '5 minutes'  THEN 'active'
    WHEN last_active_at > NOW() - INTERVAL '1 hour'     THEN 'idle'
    ELSE                                                     'silent'
  END AS state
FROM agg;

COMMENT ON VIEW agent_scorecards IS
  '7-day rolling per-agent performance. Joins run_logs.step_name → agents.name (case-insensitive). Powers the Mission Control Agent Fleet panel.';

-- 4. RLS — only project owners can read decisions/refs ───────────────────────
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_refs     ENABLE ROW LEVEL SECURITY;

-- Read: any project member (owner_id == auth.uid())
CREATE POLICY "decisions readable by project owner"
  ON agent_decisions FOR SELECT
  USING (
    project_id IS NULL
    OR project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

CREATE POLICY "memory_refs readable through decision"
  ON memory_refs FOR SELECT
  USING (
    decision_id IN (
      SELECT id FROM agent_decisions
      WHERE project_id IS NULL
         OR project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    )
  );

-- Writes are service-role only (no explicit policy = denied for anon/authenticated;
-- service-role bypasses RLS).
