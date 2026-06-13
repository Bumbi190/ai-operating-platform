-- ─────────────────────────────────────────────────────────────────────────────
-- H1.P1 — Execution-unification schema foundation (ADDITIVE, INERT).
--
-- Nothing in the app reads `side_effect_class` or writes the new run statuses yet
-- (the policy gate lands in H1.P4, cancel in H1.P5). This migration only widens
-- the schema and classifies existing workflows so later phases are behavior-only
-- changes. Verified safe: no existing run violates the widened CHECK, and the new
-- column is unread.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Widen runs.status to allow the durable lifecycle's future states.
--    'awaiting_approval' = completed steps, blocked on human approval (gated work).
--    'cancelled'         = stopped cooperatively via cancel_requested (H1.P5).
ALTER TABLE public.runs DROP CONSTRAINT IF EXISTS runs_status_check;
ALTER TABLE public.runs ADD CONSTRAINT runs_status_check
  CHECK (status IN ('pending','running','done','failed','awaiting_approval','cancelled'));

-- 2. Per-workflow side-effect class. Default 'approval_required' is FAIL-SAFE:
--    any new/unclassified workflow is gated until explicitly marked safe.
--    Per-step override lives in workflows.steps JSON as an optional "gated" bool
--    (no schema change needed; read by the engine in H1.P4).
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS side_effect_class text NOT NULL DEFAULT 'approval_required'
  CHECK (side_effect_class IN ('non_destructive','approval_required'));

-- 3. Classify EXISTING workflows to preserve today's operational behavior:
--    research / content-prep / analytics / rendering → non_destructive (auto-run).
--    Only outbound publishing stays approval_required (the fail-safe default).
UPDATE public.workflows
SET side_effect_class = 'non_destructive'
WHERE name NOT IN ('Publish to Social', 'Publish to YouTube');

-- 'Publish to Social' and 'Publish to YouTube' intentionally keep the default
-- 'approval_required'. (Their real outbound posting also runs through the media
-- pipeline's own confirm-gated publish path; this classifies the agent-step view.)

COMMENT ON COLUMN public.workflows.side_effect_class IS
  'H1 execution policy: non_destructive = auto-run; approval_required = gate via awaiting_approval. Per-step "gated" in steps JSON overrides.';
