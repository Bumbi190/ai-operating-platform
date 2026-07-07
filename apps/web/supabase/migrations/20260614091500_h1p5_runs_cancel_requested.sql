-- ─────────────────────────────────────────────────────────────────────────────
-- H1.P5 Commit 3 — cooperative cancel flag.
--
-- Adds runs.cancel_requested (additive, NOT NULL default false). A durable flag set
-- by POST /api/runs/[id]/cancel for the 'running' case; the drain reads it at claim
-- and the executor reads it at each step boundary (both gated by H1_CANCEL, default
-- OFF) and transitions the run to 'cancelled' via a claim_id-fenced write (Commit 2).
--
-- No CHECK change needed: runs.status already allows 'cancelled' (H1.P1) and
-- approvals.status already allows 'returned' (D1 — cancel of awaiting_approval
-- resolves the pending approval). INERT until H1_CANCEL is on: the flag may be set
-- but the cooperative checks ignore it, so a running run completes normally.
--
-- Additive & back-compat: pre-Commit-3 code ignores the column. Rollback = drop
-- column (nothing depends on it when H1_CANCEL is off).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.runs add column if not exists cancel_requested boolean not null default false;
