-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2B-3C — make advisory spend-gate overrides observable.
--
-- THE QUESTION THIS TABLE EXISTS TO ANSWER
--   "Which provider calls proceeded ONLY because H1_SPEND_GATE was off?"
--
-- Today `budget_reserve` returns an honest verdict and `verdict()` in
-- budget-gate.ts computes `allowed = wouldAllow || !enforced`. With enforcement
-- off, every refusal is overridden to allowed and the fact is DISCARDED. So the
-- platform cannot say how often enforcement would have blocked something —
-- which is exactly the evidence needed to decide whether to enable it.
--
-- WHY A NEW TABLE RATHER THAN AN EXISTING ONE
--   spend_reservations  its `status` is a closed lifecycle vocabulary that
--                       budget_headroom sums over, so a new value would change
--                       existing semantics. Decisively: the cases that matter
--                       most (no_budget_configured, unavailable) produce NO
--                       reservation row at all, so the fact has nowhere to live.
--   cost_events         written only after a successful call. An override that
--                       precedes a call which then fails would vanish, and the
--                       ledger would start carrying governance verdicts.
--   stop_events         records pause/resume of execution scopes. Different fact.
--
-- ADDITIVE ONLY. No existing table, column, function, policy or grant is
-- altered. Nothing here changes what any call is permitted to do — this records
-- a decision that has already been made, and reading it changes nothing either.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.spend_advisory_overrides (
  id                uuid primary key default gen_random_uuid(),

  -- Which budget WOULD have refused. Always known: the recording point sits
  -- after project resolution, and an unresolved project throws before any
  -- verdict exists.
  project_id        uuid not null references public.projects(id),

  -- The exact refusal vocabulary from SpendRefusal — 'budget_exceeded',
  -- 'no_budget_configured', 'no_global_budget_configured', 'invalid_estimate',
  -- 'unavailable', and the five replay_* states. Stored verbatim and NOT
  -- constrained to an enum: this table must never be the reason a new refusal
  -- reason cannot be recorded, and an unrecognised reason is still evidence.
  reason            text not null,

  provider          text,
  operation         text,
  estimated_sek     numeric(12,4) not null,

  -- Present when the verdict carried one. On the replay path the id belongs to
  -- a reservation this call did not create, which is itself worth knowing.
  reservation_id    uuid,
  idempotency_key   text,

  -- Which ceiling decided, and how much room it thought there was. Null when the
  -- gate could not be consulted at all ('unavailable').
  binding_scope     text,
  budget_sek        numeric(12,4),
  headroom_sek      numeric(12,4),

  created_at        timestamptz not null default now()
);

comment on table public.spend_advisory_overrides is
  'Phase 2B-3C: one row per provider call that proceeded ONLY because H1_SPEND_GATE was off. A row means wouldAllow=false AND enforcement=false AND dispatch was permitted anyway. It is never written for an allowed reservation, a provider failure, or a hard refusal under enforcement.';
comment on column public.spend_advisory_overrides.reason is
  'Verbatim SpendRefusal reason. Deliberately unconstrained so a new refusal reason is still recordable.';
comment on column public.spend_advisory_overrides.reservation_id is
  'The reservation named by the verdict, when there was one. On a replay refusal this belongs to a DIFFERENT call.';

-- The re-audit query: overrides in a window, grouped by reason.
create index if not exists spend_advisory_overrides_window_idx
  on public.spend_advisory_overrides (created_at desc, reason);

-- Per-project reads for the same question.
create index if not exists spend_advisory_overrides_project_idx
  on public.spend_advisory_overrides (project_id, created_at desc);

-- ── Append-only ─────────────────────────────────────────────────────────────
-- An override is an observation about a decision that already happened. Editing
-- or deleting one would let the very measurement this table exists to provide be
-- quietly adjusted, so both are refused at the database rather than by
-- convention.
create or replace function public.spend_advisory_overrides_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'spend_advisory_overrides is append-only: row % may not be updated', old.id;
end;
$$;

drop trigger if exists spend_advisory_overrides_append_only_trg on public.spend_advisory_overrides;
create trigger spend_advisory_overrides_append_only_trg
  before update on public.spend_advisory_overrides
  for each row execute function public.spend_advisory_overrides_append_only();

create or replace function public.spend_advisory_overrides_no_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'spend_advisory_overrides is append-only: row % may not be deleted', old.id;
end;
$$;

drop trigger if exists spend_advisory_overrides_no_delete_trg on public.spend_advisory_overrides;
create trigger spend_advisory_overrides_no_delete_trg
  before delete on public.spend_advisory_overrides
  for each row execute function public.spend_advisory_overrides_no_delete();

-- Same posture as spend_reservations: RLS on, no policies, so anon/authenticated
-- are denied by default and only the service role reaches it.
alter table public.spend_advisory_overrides enable row level security;
