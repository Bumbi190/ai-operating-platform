-- ═══════════════════════════════════════════════════════════════════
--  MANUAL RECOVERY RUNBOOK ONLY — DO NOT RUN AS A NORMAL MIGRATION
--
--  Evaluation + Memory Layer — CLEAN INSTALL
--  Run this manually in Supabase SQL Editor only if
--  20260522_evaluation_memory.sql failed mid-way and left a disposable
--  setup database in a broken state.
--
--  This file intentionally contains DROP TABLE statements and is therefore
--  outside supabase/migrations. It is not part of Stage 1 migration history.
--  Do not run against production or any database containing data to preserve.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Drop everything from any prior partial run ─────────────────
-- Note: DROP TABLE CASCADE removes policies automatically — no need
-- to DROP POLICY first (which would error if the table doesn't exist).
DROP TABLE IF EXISTS platform_memory  CASCADE;
DROP TABLE IF EXISTS content_feedback CASCADE;
DROP TABLE IF EXISTS evaluations      CASCADE;

-- ── 2. EVALUATIONS ────────────────────────────────────────────────
CREATE TABLE evaluations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- What was evaluated (one of these will be set)
  output_id         UUID        REFERENCES outputs(id) ON DELETE SET NULL,
  script_id         UUID,       -- soft ref to media_scripts.id

  -- Content type
  content_type      TEXT        NOT NULL
                    CHECK (content_type IN ('script','hook','caption','image_prompt','news','text')),

  -- Scores (0.0 – 10.0)
  hook_strength     NUMERIC(4,1),
  slop_score        NUMERIC(4,1),   -- higher = MORE slop = worse
  brand_alignment   NUMERIC(4,1),
  specificity       NUMERIC(4,1),
  pacing_quality    NUMERIC(4,1),
  overall_score     NUMERIC(4,1),

  -- Pass/fail
  passed            BOOLEAN     NOT NULL DEFAULT false,

  -- Detected signals
  hard_fails        TEXT[]      NOT NULL DEFAULT '{}',
  soft_fails        TEXT[]      NOT NULL DEFAULT '{}',
  pass_signals      TEXT[]      NOT NULL DEFAULT '{}',
  slop_phrases      TEXT[]      NOT NULL DEFAULT '{}',

  -- Reasoning
  issues            JSONB       NOT NULL DEFAULT '[]',
  suggestion        TEXT,
  content_preview   TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_evaluations_project ON evaluations(project_id);
CREATE INDEX idx_evaluations_output  ON evaluations(output_id);
CREATE INDEX idx_evaluations_script  ON evaluations(script_id);
CREATE INDEX idx_evaluations_passed  ON evaluations(passed);
CREATE INDEX idx_evaluations_created ON evaluations(created_at DESC);

-- ── 3. CONTENT FEEDBACK ───────────────────────────────────────────
CREATE TABLE content_feedback (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Soft references (no FK — linked tables may not always exist)
  approval_id       UUID,
  evaluation_id     UUID        REFERENCES evaluations(id) ON DELETE SET NULL,

  output_type       TEXT        NOT NULL,
  decision          TEXT        NOT NULL
                    CHECK (decision IN ('approved','rejected','revised')),

  rejection_reason  TEXT,
  revision_notes    TEXT,
  quality_patterns  TEXT[]      NOT NULL DEFAULT '{}',
  content_excerpt   TEXT,
  eval_score_at_decision NUMERIC(4,1),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_feedback_project  ON content_feedback(project_id);
CREATE INDEX idx_content_feedback_approval ON content_feedback(approval_id);
CREATE INDEX idx_content_feedback_decision ON content_feedback(decision);
CREATE INDEX idx_content_feedback_created  ON content_feedback(created_at DESC);

-- ── 4. PLATFORM MEMORY ────────────────────────────────────────────
CREATE TABLE platform_memory (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  category        TEXT         NOT NULL
                  CHECK (category IN (
                    'hook_patterns',
                    'avoided_phrases',
                    'brand_voice',
                    'content_patterns',
                    'rejection_triggers'
                  )),
  key             TEXT         NOT NULL,
  value           JSONB        NOT NULL,
  confidence      NUMERIC(3,2) NOT NULL DEFAULT 0.50
                  CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count  INTEGER      NOT NULL DEFAULT 1,
  last_seen_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE(project_id, category, key)
);

CREATE INDEX idx_platform_memory_project    ON platform_memory(project_id);
CREATE INDEX idx_platform_memory_category   ON platform_memory(project_id, category);
CREATE INDEX idx_platform_memory_confidence ON platform_memory(confidence DESC);

-- ── 5. ROW LEVEL SECURITY ─────────────────────────────────────────
ALTER TABLE evaluations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_memory  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evaluations_owner" ON evaluations
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

CREATE POLICY "content_feedback_owner" ON content_feedback
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

CREATE POLICY "platform_memory_owner" ON platform_memory
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );
