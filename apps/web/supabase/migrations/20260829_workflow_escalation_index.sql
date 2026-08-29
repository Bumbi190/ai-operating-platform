-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Workflow escalation lookup index (PR6)
--   ──────────────────────────────────────
--   The escalation layer stores its conditions in `atlas_signals` rather than in
--   a second incident table. The lifecycle is DERIVED from appended events that
--   share a `signal_key` in the payload — raised / regressed / resolved — which
--   is the same shape the authorization, decision and mission ledgers use, and
--   which avoids inventing a mutable status column on a table whose whole
--   contract is append-only-by-convention.
--
--   That design makes one read hot: "what is the newest lifecycle event for this
--   condition?", asked once per condition on every tick. Without an index it is
--   a sequential scan over every signal ever produced, and the signal table
--   grows with ordinary telemetry (snapshots, scores) rather than with
--   escalations. This is the index for exactly that read, and nothing else.
--
--   PARTIAL on purpose: it covers only `workflow.escalation.*` kinds, so the
--   snapshot and score rows that make up almost all of the table are not
--   indexed and pay nothing for it.
--
--   ── WHAT THIS MIGRATION DOES NOT DO ─────────────────────────────────────────
--   It adds no column, no constraint and no trigger to `atlas_signals`. In
--   particular it does NOT add append-only enforcement: that table is currently
--   append-only by convention only (documented in lib/atlas/signals.ts, with no
--   reject trigger), and every existing producer would be affected by changing
--   that. The escalation layer never updates or deletes a signal, so it upholds
--   the convention without imposing it on unrelated producers. Enforcing it
--   properly is a separate, deliberate decision.
--
-- ═══════════════════════════════════════════════════════════════════════════════

create index if not exists atlas_signals_workflow_condition_idx
  on public.atlas_signals ((payload ->> 'signal_key'), produced_at desc)
  where kind like 'workflow.escalation.%';

comment on index public.atlas_signals_workflow_condition_idx is
  'PR6: newest-lifecycle-event lookup for one workflow condition. Partial to '
  'workflow.escalation.* so ordinary telemetry rows are unaffected.';
