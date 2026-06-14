-- ─────────────────────────────────────────────────────────────────────────────
-- H1.P4 (PR1) — Per-run policy snapshot (ADDITIVE, INERT).
--
-- Adds runs.policy_class: a snapshot of the workflow's `side_effect_class` captured
-- at run creation, so the H1.P4 policy gate (drain → done vs awaiting_approval) is
-- decided against an IMMUTABLE per-run value — a mid-run reclassification of the
-- workflow cannot change a run's gate. Same immutability philosophy as P3's
-- runs.steps_snapshot.
--
-- INERT in PR1: nothing READS policy_class yet (the gate lands in PR2). PR1 only
-- captures it at enqueue/resume/retry so PR2 is a behavior-only change.
-- Back-compatible: existing rows have NULL policy_class (PR2 treats NULL as the
-- fail-safe Default Deny — approval_required).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS policy_class text;

COMMENT ON COLUMN public.runs.policy_class IS
  'H1.P4 policy snapshot: side_effect_class captured at run creation so the gate decision '
  'is immutable per-run. NULL ⇒ PR2 fail-safe (Default Deny → approval_required).';
