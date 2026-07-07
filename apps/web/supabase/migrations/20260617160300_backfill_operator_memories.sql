-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Memory M4 — Commit 7: backfill operator/incident memories → decision events.
--
-- ⚠ GUARDED NO-OP pending schema confirmation.
--
-- The roadmap (plan §6 C7) lists a fourth backfill source: the legacy
-- public.memories table (operator/incident entries) → event_type='decision'
-- events. However, the DDL for public.memories is NOT in the repository migration
-- history (the table was created out-of-band; only an ad-hoc reference appears in
-- 20260609_dream_issues_ledger.sql). Its exact column set and the operator/incident
-- discriminator are therefore unverified.
--
-- Per H1.P5 discipline ("verify code/schema before write"), this migration does
-- NOT insert against an unconfirmed schema. It is a safe, idempotent no-op that
-- documents the remaining work. Author the INSERT ... SELECT below once the
-- public.memories schema + operator/incident filter are confirmed on a scoped
-- branch. The intended shape (for reference):
--
--   event_type   = 'decision'                  -- → decision class (materializable)
--   scope        = 'project'
--   entity_kind  = 'operator_decision' | 'incident'
--   entity_id    = <stable decision/incident key>
--   dedupe_key   = entity_id                    -- REQUIRED for decision class
--   source       = 'operator_memory'
--   source_id    = memories.id::text
--   confidence   = <from source>
--   consolidated_at = null                       -- decision → consolidation queue
--   on conflict (source, source_id, event_type) where source_id is not null do nothing;
--
-- NON-DESTRUCTIVE, idempotent (no-op). Rollback: none required.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.memories') is null then
    raise notice 'C7: public.memories absent — operator/incident → decision backfill skipped (no-op).';
    return;
  end if;

  raise notice 'C7: public.memories present but operator/incident → decision backfill is PENDING schema confirmation — no rows written (no-op). Author the INSERT once the schema + discriminator are verified on a branch.';
end $$;
