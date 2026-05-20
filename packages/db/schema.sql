-- ═══════════════════════════════════════════════════════════════════
--  AI Operations Platform — Database Schema
--  Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────
--  PROJECTS
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  settings   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);

-- ─────────────────────────────────────
--  AGENTS
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  system_prompt  TEXT NOT NULL,
  model          TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  skill_ids      TEXT[] NOT NULL DEFAULT '{}',
  config         JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id);

-- ─────────────────────────────────────
--  WORKFLOWS
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  steps       JSONB NOT NULL DEFAULT '[]',
  -- steps format:
  -- [{ "order": 1, "name": "...", "agent_id": "uuid",
  --    "input_template": "...", "output_key": "..." }]
  trigger     TEXT NOT NULL DEFAULT 'manual'
                CHECK (trigger IN ('manual', 'cron', 'webhook')),
  cron_expr   TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows(project_id);

-- ─────────────────────────────────────
--  RUNS
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'running', 'done', 'failed')),
  input        JSONB NOT NULL DEFAULT '{}',
  context      JSONB NOT NULL DEFAULT '{}',
  error        TEXT,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runs_workflow ON runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);

-- ─────────────────────────────────────
--  RUN LOGS
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_order  INTEGER,
  step_name   TEXT,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content     TEXT NOT NULL,
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  duration_ms INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_logs_run ON run_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_run_logs_created ON run_logs(created_at ASC);

-- ─────────────────────────────────────
--  OUTPUTS
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS outputs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('text', 'pdf', 'image', 'json')),
  content     TEXT,
  file_url    TEXT,
  file_size   INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outputs_project ON outputs(project_id);
CREATE INDEX IF NOT EXISTS idx_outputs_run ON outputs(run_id);

-- ─────────────────────────────────────
--  MEMORIES
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  source      TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, key)
);

CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);

-- ═══════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE outputs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories  ENABLE ROW LEVEL SECURITY;

-- Projects: owner sees own
CREATE POLICY "projects_owner" ON projects
  FOR ALL USING (owner_id = auth.uid());

-- Agent isolation via projects
CREATE POLICY "agents_owner" ON agents
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

CREATE POLICY "workflows_owner" ON workflows
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

CREATE POLICY "runs_owner" ON runs
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

CREATE POLICY "run_logs_owner" ON run_logs
  FOR ALL USING (
    run_id IN (
      SELECT id FROM runs WHERE
        project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY "outputs_owner" ON outputs
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

CREATE POLICY "memories_owner" ON memories
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════
--  STORAGE BUCKET
--  Run separately in Supabase Dashboard → Storage → New bucket
--  Or via SQL below (requires storage extension)
-- ═══════════════════════════════════════════════════════════════════

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('outputs', 'outputs', false)
-- ON CONFLICT DO NOTHING;

-- CREATE POLICY "outputs_owner" ON storage.objects
--   FOR ALL USING (
--     bucket_id = 'outputs' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );
