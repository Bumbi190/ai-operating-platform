-- Memory & Organizational Knowledge 2.0 — Stage 1 foundation reconciliation
--
-- Non-destructive migration:
-- - creates canonical Stage 1 tables when missing
-- - adds canonical columns when an older evaluations table exists
-- - adds audit-preserving lifecycle/correction fields to platform_memory
-- - does not drop or purge existing data

CREATE TABLE IF NOT EXISTS evaluations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  output_id         UUID REFERENCES outputs(id) ON DELETE SET NULL,
  script_id         UUID,
  content_type      TEXT NOT NULL CHECK (content_type IN ('script','hook','caption','image_prompt','news','text')),
  hook_strength     NUMERIC(4,1),
  slop_score        NUMERIC(4,1),
  brand_alignment   NUMERIC(4,1),
  specificity       NUMERIC(4,1),
  pacing_quality    NUMERIC(4,1),
  overall_score     NUMERIC(4,1),
  passed            BOOLEAN NOT NULL DEFAULT false,
  hard_fails        TEXT[] NOT NULL DEFAULT '{}',
  soft_fails        TEXT[] NOT NULL DEFAULT '{}',
  pass_signals      TEXT[] NOT NULL DEFAULT '{}',
  slop_phrases      TEXT[] NOT NULL DEFAULT '{}',
  issues            JSONB NOT NULL DEFAULT '[]',
  suggestion        TEXT,
  content_preview   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS output_id UUID REFERENCES outputs(id) ON DELETE SET NULL;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS script_id UUID;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS content_type TEXT;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS hook_strength NUMERIC(4,1);
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS slop_score NUMERIC(4,1);
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS brand_alignment NUMERIC(4,1);
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS specificity NUMERIC(4,1);
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS pacing_quality NUMERIC(4,1);
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS overall_score NUMERIC(4,1);
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS passed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS hard_fails TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS soft_fails TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS pass_signals TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS slop_phrases TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS suggestion TEXT;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS content_preview TEXT;

DO $$
BEGIN
  ALTER TABLE evaluations
    ADD CONSTRAINT evaluations_content_type_stage1_check
    CHECK (content_type IN ('script','hook','caption','image_prompt','news','text'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_evaluations_project ON evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_output ON evaluations(output_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_script ON evaluations(script_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_passed ON evaluations(passed);
CREATE INDEX IF NOT EXISTS idx_evaluations_created ON evaluations(created_at DESC);

CREATE TABLE IF NOT EXISTS content_feedback (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  approval_id       UUID,
  evaluation_id     UUID REFERENCES evaluations(id) ON DELETE SET NULL,
  output_type       TEXT NOT NULL,
  decision          TEXT NOT NULL CHECK (decision IN ('approved','rejected','revised')),
  rejection_reason  TEXT,
  revision_notes    TEXT,
  quality_patterns  TEXT[] NOT NULL DEFAULT '{}',
  content_excerpt   TEXT,
  eval_score_at_decision NUMERIC(4,1),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_feedback_project ON content_feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_content_feedback_approval ON content_feedback(approval_id);
CREATE INDEX IF NOT EXISTS idx_content_feedback_decision ON content_feedback(decision);
CREATE INDEX IF NOT EXISTS idx_content_feedback_created ON content_feedback(created_at DESC);

CREATE TABLE IF NOT EXISTS platform_memory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category          TEXT NOT NULL CHECK (category IN (
                      'hook_patterns',
                      'avoided_phrases',
                      'brand_voice',
                      'content_patterns',
                      'rejection_triggers'
                    )),
  key               TEXT NOT NULL,
  value             JSONB NOT NULL,
  confidence        NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count    INTEGER NOT NULL DEFAULT 1,
  lifecycle_state   TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_state IN ('active','inactive','corrected','tombstoned')),
  correction_state  TEXT,
  tombstoned_at     TIMESTAMPTZ,
  tombstoned_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  audit_events      JSONB NOT NULL DEFAULT '[]',
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, category, key)
);

ALTER TABLE platform_memory ADD COLUMN IF NOT EXISTS lifecycle_state TEXT;
ALTER TABLE platform_memory ADD COLUMN IF NOT EXISTS correction_state TEXT;
ALTER TABLE platform_memory ADD COLUMN IF NOT EXISTS tombstoned_at TIMESTAMPTZ;
ALTER TABLE platform_memory ADD COLUMN IF NOT EXISTS tombstoned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE platform_memory ADD COLUMN IF NOT EXISTS audit_events JSONB;

UPDATE platform_memory
SET lifecycle_state = 'active'
WHERE lifecycle_state IS NULL;

UPDATE platform_memory
SET audit_events = '[]'::jsonb
WHERE audit_events IS NULL;

ALTER TABLE platform_memory ALTER COLUMN lifecycle_state SET DEFAULT 'active';
ALTER TABLE platform_memory ALTER COLUMN lifecycle_state SET NOT NULL;
ALTER TABLE platform_memory ALTER COLUMN audit_events SET DEFAULT '[]'::jsonb;
ALTER TABLE platform_memory ALTER COLUMN audit_events SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE platform_memory
    ADD CONSTRAINT platform_memory_lifecycle_state_stage1_check
    CHECK (lifecycle_state IN ('active','inactive','corrected','tombstoned'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_platform_memory_project ON platform_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_platform_memory_category ON platform_memory(project_id, category);
CREATE INDEX IF NOT EXISTS idx_platform_memory_confidence ON platform_memory(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_platform_memory_active ON platform_memory(project_id, lifecycle_state);

ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evaluations_owner" ON evaluations;
DROP POLICY IF EXISTS "content_feedback_owner" ON content_feedback;
DROP POLICY IF EXISTS "platform_memory_owner" ON platform_memory;

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
