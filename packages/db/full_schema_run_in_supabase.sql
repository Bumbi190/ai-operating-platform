-- ═══════════════════════════════════════════════════════════════════
--  AI Operating Platform — Komplett Schema
--  Kör detta i: supabase.com/dashboard → ditt projekt → SQL Editor
--  Tryck "Run" — allt skapas säkert med IF NOT EXISTS
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
--  DEL 1: BASTABELLER
-- ─────────────────────────────────────────────────────────────────

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
CREATE INDEX IF NOT EXISTS idx_projects_slug  ON projects(slug);

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

CREATE TABLE IF NOT EXISTS workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  steps       JSONB NOT NULL DEFAULT '[]',
  trigger     TEXT NOT NULL DEFAULT 'manual'
                CHECK (trigger IN ('manual', 'cron', 'webhook')),
  cron_expr   TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows(project_id);

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
CREATE INDEX IF NOT EXISTS idx_runs_project  ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_status   ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created  ON runs(created_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_run_logs_run     ON run_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_run_logs_created ON run_logs(created_at ASC);

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
CREATE INDEX IF NOT EXISTS idx_outputs_run     ON outputs(run_id);

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


-- ─────────────────────────────────────────────────────────────────
--  DEL 2: EXTENDED TABELLER (Manager, Approvals, Chat, Planning)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approvals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID REFERENCES runs(id) ON DELETE CASCADE,
  output_key     TEXT NOT NULL,
  content        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'revised')),
  reviewer_notes TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  reviewed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS manager_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'done', 'failed', 'cancelled')),
  priority    TEXT NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  workflow_id UUID REFERENCES workflows(id),
  run_id      UUID REFERENCES runs(id),
  result      TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  from_agent   TEXT NOT NULL,
  to_agent     TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'message'
                 CHECK (message_type IN ('message','request','response','approval_request','feedback','handoff','daily_plan','analysis')),
  content      TEXT NOT NULL,
  metadata     JSONB DEFAULT '{}',
  run_id       UUID REFERENCES runs(id) ON DELETE SET NULL,
  task_id      UUID REFERENCES manager_tasks(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id    UUID REFERENCES approvals(id) ON DELETE CASCADE,
  evaluator_name TEXT NOT NULL,
  score          INTEGER CHECK (score >= 0 AND score <= 100),
  approved       BOOLEAN NOT NULL DEFAULT false,
  issues         JSONB DEFAULT '[]',
  feedback       TEXT,
  raw_response   TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id    UUID NOT NULL,
  title      TEXT NOT NULL DEFAULT 'Ny chatt',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_user_id_idx    ON conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_project_id_idx ON conversations(project_id);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content         TEXT,
  tool_data       JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conv_messages_conv_id_idx ON conversation_messages(conversation_id);

CREATE TABLE IF NOT EXISTS sprints (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  goal       TEXT,
  status     TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'completed', 'planned')),
  start_date DATE,
  end_date   DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planning_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id   UUID REFERENCES sprints(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  type        TEXT NOT NULL DEFAULT 'task'
                CHECK (type IN ('task','goal','improvement','bug','idea')),
  status      TEXT NOT NULL DEFAULT 'backlog'
                CHECK (status IN ('backlog','todo','in_progress','done')),
  priority    TEXT NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low','medium','high')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  content    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'note'
               CHECK (type IN ('note','standup','decision','blocker')),
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────
--  DEL 3: ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows            ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE outputs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories             ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprints              ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_notes          ENABLE ROW LEVEL SECURITY;

-- Bastabeller: ägaren ser sina egna
-- (DROP IF EXISTS + CREATE = säkert att köra flera gånger)
DROP POLICY IF EXISTS "projects_owner"   ON projects;
DROP POLICY IF EXISTS "agents_owner"     ON agents;
DROP POLICY IF EXISTS "workflows_owner"  ON workflows;
DROP POLICY IF EXISTS "runs_owner"       ON runs;
DROP POLICY IF EXISTS "run_logs_owner"   ON run_logs;
DROP POLICY IF EXISTS "outputs_owner"    ON outputs;
DROP POLICY IF EXISTS "memories_owner"   ON memories;
DROP POLICY IF EXISTS "approvals_owner"      ON approvals;
DROP POLICY IF EXISTS "manager_tasks_owner"  ON manager_tasks;
DROP POLICY IF EXISTS "agent_messages_owner" ON agent_messages;
DROP POLICY IF EXISTS "evaluations_owner"    ON evaluations;
DROP POLICY IF EXISTS "conversations_owner"  ON conversations;
DROP POLICY IF EXISTS "conv_messages_owner"  ON conversation_messages;
DROP POLICY IF EXISTS "sprints_owner"        ON sprints;
DROP POLICY IF EXISTS "planning_items_owner" ON planning_items;
DROP POLICY IF EXISTS "daily_notes_owner"    ON daily_notes;

CREATE POLICY "projects_owner"   ON projects   FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "agents_owner"     ON agents     FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
CREATE POLICY "workflows_owner"  ON workflows  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
CREATE POLICY "runs_owner"       ON runs       FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
CREATE POLICY "run_logs_owner"   ON run_logs   FOR ALL USING (run_id IN (SELECT id FROM runs WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())));
CREATE POLICY "outputs_owner"    ON outputs    FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
CREATE POLICY "memories_owner"   ON memories   FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
CREATE POLICY "approvals_owner"      ON approvals      FOR ALL USING (run_id IN (SELECT id FROM runs WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())));
CREATE POLICY "manager_tasks_owner"  ON manager_tasks  FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
CREATE POLICY "agent_messages_owner" ON agent_messages FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
CREATE POLICY "evaluations_owner"    ON evaluations    FOR ALL USING (approval_id IN (SELECT id FROM approvals WHERE run_id IN (SELECT id FROM runs WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))));
CREATE POLICY "conversations_owner"  ON conversations  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "conv_messages_owner"  ON conversation_messages FOR ALL USING (conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid()));
CREATE POLICY "sprints_owner"        ON sprints        FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
CREATE POLICY "planning_items_owner" ON planning_items FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
CREATE POLICY "daily_notes_owner"    ON daily_notes    FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));


-- ─────────────────────────────────────────────────────────────────
--  DEL 4: STORAGE BUCKET för bilder och filer
-- ─────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('run-images', 'run-images', true)
ON CONFLICT DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('outputs', 'outputs', false)
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════
--  KLART! Alla 16 tabeller + storage buckets skapade.
-- ═══════════════════════════════════════════════════════════════════
