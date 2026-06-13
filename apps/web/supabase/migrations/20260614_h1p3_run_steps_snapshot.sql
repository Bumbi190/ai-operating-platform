-- ─────────────────────────────────────────────────────────────────────────────
-- H1.P3 — Durable resume: immutable per-run workflow snapshot (ADDITIVE, INERT).
--
-- Adds runs.steps_snapshot: the workflow's `steps` JSON captured at run-creation
-- time. The drain/executor read this snapshot instead of the live workflows.steps,
-- so editing a workflow while a run is pending/retrying can no longer skip a changed
-- step and reuse a different agent's output (audit finding M3 / #6).
--
-- Back-compatible: existing rows have NULL steps_snapshot; the drain falls back to
-- live workflows.steps for them, preserving today's behavior. Nothing reads or writes
-- this column until the H1.P3 application code ships, so applying this migration is
-- inert on its own.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS steps_snapshot jsonb;

COMMENT ON COLUMN public.runs.steps_snapshot IS
  'H1.P3 durable resume: immutable copy of workflows.steps captured at run creation. '
  'Drain/executor prefer this over live workflows.steps; NULL ⇒ fall back to live steps '
  '(pre-P3 runs). Marketing runs (workflow_id IS NULL, dispatched by kind) leave it NULL.';
