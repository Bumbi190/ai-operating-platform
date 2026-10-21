-- ISOLATED POSTGRESQL RESEARCH CANDIDATE. NEVER EXECUTE IN PRODUCTION.
-- The signed source-version BEFORE and AFTER trigger helpers are inherited
-- from direct-write-gate-probe.sql and must be loaded first.
-- All legitimate proof INSERTs must mint the transaction-local source token
-- BEFORE locking project/publication rows. A late trigger must never wait for
-- a source row, or calendar versus social publication can deadlock.
create trigger calendar_gate_reconciliation_proofs_before_probe
 before insert or update or delete on public.social_publication_reconciliation_proofs
 for each row execute function public.calendar_source_gate_assert_probe();

create trigger calendar_gate_reconciliation_proofs_after_probe
 after insert or update or delete on public.social_publication_reconciliation_proofs
 for each row execute function public.calendar_source_gate_bump_probe();
