-- ─────────────────────────────────────────────────────────────────────────────
-- H1.P4 (PR2) — Add 'rejected' to runs.status (ADDITIVE, behavior-neutral).
--
-- 'rejected' = a run that reached awaiting_approval and whose approval was REJECTED
-- by a human. First-class TERMINAL status — deliberately distinct from:
--   • 'failed'    (technical/runtime failure), and
--   • 'cancelled' (cooperative cancel via cancel_requested, lands in H1.P5).
-- A rejected run executed successfully and produced output; the outcome is a
-- business decision, not a technical failure. Keeping it separate gives clean
-- analytics later (approval rate, rejection rate, most-rejected workflows).
--
-- INERT in PR2 commit 1: no row is written 'rejected' yet. The policy gate that
-- produces awaiting_approval — and the approval-PATCH transition that produces
-- rejected — are flag-gated (H1_POLICY_GATE) and land in PR2 commit 3/4. This
-- migration only WIDENS the allowed set so commit 2's code can reference the
-- status without breaking. Back-compatible: only expands the CHECK; no existing
-- row violates it, no row is rewritten by the ALTER.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.runs DROP CONSTRAINT IF EXISTS runs_status_check;
ALTER TABLE public.runs ADD CONSTRAINT runs_status_check
  CHECK (status IN ('pending','running','done','failed','awaiting_approval','cancelled','rejected'));

COMMENT ON COLUMN public.runs.status IS
  'pending | running | done | failed | awaiting_approval (gated, awaiting human decision) | '
  'rejected (approval rejected, terminal) | cancelled (cooperative cancel, H1.P5).';
