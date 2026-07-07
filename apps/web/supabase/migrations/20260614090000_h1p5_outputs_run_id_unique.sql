-- ─────────────────────────────────────────────────────────────────────────────
-- H1.P5 Commit 1 — idempotency: ONE output per run, DB-enforced.
--
-- Replaces the prior check-then-insert guard in executeRunSteps/runSteps (race-prone:
-- a reaper re-claim could re-enter finalization between the SELECT and the INSERT and
-- write a DUPLICATE deliverable) with a hard DB guarantee. Re-entry now fails with
-- SQLSTATE 23505, which the code treats as an idempotent no-op (isDuplicateOutputError).
--
-- Partial (WHERE run_id IS NOT NULL) so any future null-run_id output is unaffected.
-- Additive & back-compat: 0 duplicate run_ids verified in prod before applying.
-- ─────────────────────────────────────────────────────────────────────────────
create unique index if not exists outputs_run_id_uniq
  on public.outputs (run_id) where run_id is not null;
