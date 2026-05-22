-- ═══════════════════════════════════════════════════════════════════
--  Evaluation + Memory Layer
--  Migration: 20260522_evaluation_memory.sql
--
--  Adds three tables:
--    evaluations      — scores for every generated output
--    content_feedback — human approval/rejection decisions + reasons
--    platform_memory  — learned patterns derived from feedback
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────
--  EVALUATIONS
--  One row per output evaluated.
--  Linked to outputs (workflow system) or media_scripts (media pipeline).
--  Scores are 0–10. slop_score is inverted: higher = more slop = worse.
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS evaluations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Link to what was evaluated (one of these will be set)
  output_id         UUID        REFERENCES outputs(id) ON DELETE SET NULL,
  script_id         UUID,       -- references media_scripts.id (no FK — optional table)

  -- Content classification
  content_type      TEXT        NOT NULL
                    CHECK (content_type IN ('script', 'hook', 'caption', 'image_prompt', 'news', 'text')),

  -- Quality scores (0.0 – 10.0)
  hook_strength     NUMERIC(4,1),   -- Does the opening create genuine curiosity?
  slop_score        NUMERIC(4,1),   -- AI slop density (HIGH = bad: more slop)
  brand_alignment   NUMERIC(4,1),   -- Matches The Prompt editorial voice
  specificity       NUMERIC(4,1),   -- Concrete facts vs vague generalities
  pacing_quality    NUMERIC(4,1),   -- Sentence rhythm, varied length, punch
  overall_score     NUMERIC(4,1),   -- Weighted composite

  -- Pass/fail gate
  passed            BOOLEAN     NOT NULL DEFAULT false,

  -- Detected signals
  hard_fails        TEXT[]      NOT NULL DEFAULT '{}',
  soft_fails        TEXT[]      NOT NULL DEFAULT '{}',
  pass_signals      TEXT[]      NOT NULL DEFAULT '{}',
  slop_phrases      TEXT[]      NOT NULL DEFAULT '{}',  -- exact slop phrases found

  -- Reasoning
  issues            JSONB       NOT NULL DEFAULT '[]',  -- [{ "dimension": "...", "detail": "..." }]
  suggestion        TEXT,                               -- one-line improvement hint

  -- Source snippet for display (first 300 chars of evaluated content)
  content_preview   TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_project   ON evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_output    ON evaluations(output_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_script    ON evaluations(script_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_passed    ON evaluations(passed);
CREATE INDEX IF NOT EXISTS idx_evaluations_created   ON evaluations(created_at DESC);

-- ─────────────────────────────────────
--  CONTENT FEEDBACK
--  Captures human decisions: why approved, why rejected, what changed.
--  One row per approval decision (can have multiple per output if revised).
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_feedback (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- What was decided
  -- approval_id is a soft reference to approvals.id (no FK — approvals table may not exist yet)
  approval_id       UUID,
  evaluation_id     UUID        REFERENCES evaluations(id) ON DELETE SET NULL,
  output_type       TEXT        NOT NULL,  -- mirrors evaluations.content_type
  decision          TEXT        NOT NULL
                    CHECK (decision IN ('approved', 'rejected', 'revised')),

  -- Human reasoning
  rejection_reason  TEXT,        -- WHY was it rejected (free text)
  revision_notes    TEXT,        -- what the reviewer wants changed
  quality_patterns  TEXT[]   NOT NULL DEFAULT '{}',  -- detected patterns: 'weak_hook', 'too_generic', etc.

  -- Snapshot of content state at decision time
  content_excerpt   TEXT,        -- first 300 chars of content when decision was made
  eval_score_at_decision NUMERIC(4,1),  -- overall_score at time of decision

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_feedback_project    ON content_feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_content_feedback_approval   ON content_feedback(approval_id);
CREATE INDEX IF NOT EXISTS idx_content_feedback_decision   ON content_feedback(decision);
CREATE INDEX IF NOT EXISTS idx_content_feedback_created    ON content_feedback(created_at DESC);

-- ─────────────────────────────────────
--  PLATFORM MEMORY
--  Learned operational knowledge — derived from feedback over time.
--  Key-value with confidence tracking.
--
--  Categories:
--    hook_patterns       — hooks that got approved consistently
--    avoided_phrases     — phrases that triggered rejections
--    brand_voice         — voice characteristics that were approved
--    content_patterns    — structural patterns that work
--    rejection_triggers  — content patterns that always get rejected
-- ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_memory (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  category          TEXT        NOT NULL
                    CHECK (category IN (
                      'hook_patterns',
                      'avoided_phrases',
                      'brand_voice',
                      'content_patterns',
                      'rejection_triggers'
                    )),
  key               TEXT        NOT NULL,   -- the pattern identifier
  value             JSONB       NOT NULL,   -- { "example": "...", "note": "...", "count": N }

  confidence        NUMERIC(3,2) NOT NULL DEFAULT 0.50
                    CHECK (confidence >= 0 AND confidence <= 1),

  evidence_count    INTEGER     NOT NULL DEFAULT 1,  -- how many feedback events support this
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(project_id, category, key)
);

CREATE INDEX IF NOT EXISTS idx_platform_memory_project    ON platform_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_platform_memory_category   ON platform_memory(project_id, category);
CREATE INDEX IF NOT EXISTS idx_platform_memory_confidence ON platform_memory(confidence DESC);

-- ─────────────────────────────────────
--  ROW LEVEL SECURITY
-- ─────────────────────────────────────
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
