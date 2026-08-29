-- ═══════════════════════════════════════════════════════════════════════════════
--
--   projects.execution_paused — the column the workflow scheduler needs (PR3)
--   ────────────────────────────────────────────────────────────────────────
--   DISCOVERED WHILE VERIFYING PR3, and worth stating plainly because it is a
--   pre-existing production gap rather than anything this PR introduced:
--
--     The per-project kill switch (P8) DOES NOT EXIST IN PRODUCTION.
--
--   `supabase/migrations/20260606_killswitch_cancel.sql` is committed and
--   describes `projects.execution_paused`, a pause filter inside `claim_runs`,
--   `set_project_execution_paused()` and `request_run_cancel()`. None of it is in
--   the database: the columns are absent, both functions are absent, the
--   migration is not in the ledger, and the live `claim_runs` has no pause
--   filter at all.
--
--   The cause is structural, not a mistake by whoever wrote it. That file lives
--   in the REPO-ROOT `supabase/migrations/`, which `check-migrations.mjs` does
--   not scan — the same blindness that hid the Executive Intelligence schema
--   until EI-S1.6A, and the reason the guard now enforces
--   `apps/web/supabase/migrations/` only. The kill switch predates the guard, so
--   nothing ever demanded it be applied.
--
--   MITIGATION, and the limits of it. No application code references the kill
--   switch today (verified: the only references are PR3's own tests), so nothing
--   currently believes it can pause a project — there is no live bug to fix.
--   PR3 needs the CONCEPT, because a scheduler that keeps evaluating a project
--   an operator has frozen is a scheduler with no off switch.
--
--   So this migration applies EXACTLY the three columns, with the definitions
--   from the legacy file so the semantics cannot drift if the rest is applied
--   later. It deliberately does NOT apply:
--     • the `claim_runs` pause filter  — changing the runs engine is outside PR3
--     • `set_project_execution_paused` — a setter is an operator surface, and
--                                        PR3 adds no operator surfaces
--     • `request_run_cancel`           — run-level cancel, unrelated here
--
--   The columns are therefore INERT for runs (default false, unread by
--   claim_runs) and load-bearing only for `workflow_claim_due`. Applying the
--   remainder of the kill switch stays an open, separate decision.
--
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.projects
  add column if not exists execution_paused boolean not null default false,
  add column if not exists paused_at        timestamptz,
  add column if not exists paused_reason    text;

comment on column public.projects.execution_paused is
  'Per-project execution kill switch. Enforced by workflow_claim_due (PR3). '
  'NOT yet enforced by claim_runs — the rest of 20260606_killswitch_cancel.sql '
  'remains unapplied; see that file and the PR3 migration header.';
