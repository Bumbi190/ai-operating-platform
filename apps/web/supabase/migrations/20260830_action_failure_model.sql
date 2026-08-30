-- ─────────────────────────────────────────────────────────────────────────────
--  PR9d — WORKFLOW ACTION FAILURE + AMBIGUITY MODEL.
--
--  ── THE BUG THIS EXISTS TO PREVENT ─────────────────────────────────────────
--  Today every thrown error in the drain takes ONE path:
--      willRetry = attempts < max_attempts  →  status = 'pending' or 'failed'
--  There is no distinction between "the call never left the machine" and "the
--  call timed out after the remote had already applied it". For a bound MATERIAL
--  action (max_attempts = 1) a timeout therefore lands on `failed` — and `failed`
--  is a POSITIVE CLAIM that the side effect did not happen. A timeout cannot
--  support that claim. The reaper is worse: it requeues an expired `running` run,
--  which after dispatch means performing the side effect a second time.
--
--  So UNKNOWN and PARTIAL become first-class statuses. They are not error strings
--  and they are not hidden in last_error: they are terminal, unclaimable, and
--  they keep their idempotency identity so nothing can quietly try again.
--
--  ── WHY THIS NEEDS NO NEW IDEMPOTENCY RULE ─────────────────────────────────
--  PR9c's partial unique index already reads
--      where idempotency_key is not null and status not in ('cancelled','rejected')
--  so a run parked in 'unknown' or 'partial' KEEPS its identity by construction,
--  and only a run proven not to have applied (cancelled/rejected) releases it.
--  That was the right shape before this PR existed; it is left untouched.
--
--  ── PHASE IS WHAT MAKES AMBIGUITY DECIDABLE ────────────────────────────────
--  Before DISPATCH_STARTED a failure proves nothing happened. After it, silence
--  proves nothing at all. The phase column is therefore the load-bearing fact the
--  reaper, the cancel path and the retry policy all read.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Two new terminal statuses. Deliberately NOT 'failed': a run that may have
--    applied its side effect must never be reported as one that did not.
--    They are absent from claim_runs' `status = 'pending'` filter, so an
--    ambiguous run can never be picked up again by anything.
alter table public.runs drop constraint if exists runs_status_check;
alter table public.runs add constraint runs_status_check check (
  status = any (array['pending','running','done','failed','awaiting_approval',
                      'cancelled','rejected','unknown','partial'])
);

-- 2) Execution phase and outcome, as columns rather than prose.
alter table public.runs add column if not exists action_phase            text;
alter table public.runs add column if not exists action_outcome          text;
alter table public.runs add column if not exists dispatch_started_at     timestamptz;
alter table public.runs add column if not exists remote_confirmed_at     timestamptz;
alter table public.runs add column if not exists outcome_recorded_at     timestamptz;
alter table public.runs add column if not exists reconciliation_required boolean not null default false;
alter table public.runs add column if not exists reconciliation_reason   text;
alter table public.runs add column if not exists remote_operation_id     text;
-- Structured and safe by contract: ids, counts and states only. Never a raw
-- provider response, which is how credentials and customer data leak into audit.
alter table public.runs add column if not exists side_effect_summary     jsonb;

alter table public.runs drop constraint if exists runs_action_phase_vocabulary;
alter table public.runs add constraint runs_action_phase_vocabulary check (
  action_phase is null or action_phase in
    ('PREPARED','PRE_COMMIT_VERIFIED','DISPATCH_STARTED','REMOTE_CONFIRMED','EVIDENCE_RECORDED','COMPLETE')
);

alter table public.runs drop constraint if exists runs_action_outcome_vocabulary;
alter table public.runs add constraint runs_action_outcome_vocabulary check (
  action_outcome is null or action_outcome in
    ('FAILED','SUCCEEDED','UNKNOWN','PARTIAL','SUCCEEDED_EVIDENCE_PENDING','CANCELLED','REJECTED')
);

-- 3) Ambiguity ALWAYS demands a human. Not a convention a caller can forget.
alter table public.runs drop constraint if exists runs_ambiguous_requires_reconciliation;
alter table public.runs add constraint runs_ambiguous_requires_reconciliation check (
  action_outcome is null
  or action_outcome not in ('UNKNOWN','PARTIAL')
  or reconciliation_required = true
);

-- 4) A dispatched action must record WHEN it was dispatched — that timestamp is
--    the evidence that the ambiguity window was entered.
alter table public.runs drop constraint if exists runs_dispatch_timestamp_present;
alter table public.runs add constraint runs_dispatch_timestamp_present check (
  action_phase is null
  or action_phase in ('PREPARED','PRE_COMMIT_VERIFIED')
  or dispatch_started_at is not null
);

create index if not exists runs_reconciliation_required_idx
  on public.runs (workflow_instance_id, created_at)
  where reconciliation_required = true;

-- 5) Phase ordering, so "did we dispatch yet" is one comparison everywhere.
create or replace function public.action_phase_rank(p text)
returns int language sql immutable set search_path to '' as $$
  select case p
    when 'PREPARED' then 1 when 'PRE_COMMIT_VERIFIED' then 2
    when 'DISPATCH_STARTED' then 3 when 'REMOTE_CONFIRMED' then 4
    when 'EVIDENCE_RECORDED' then 5 when 'COMPLETE' then 6
    else 0 end;
$$;

-- 6) Reconciliation ledger. Append-only: asking the authoritative system what
--    really happened is a fact, and facts are not edited.
create table if not exists public.workflow_action_reconciliations (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references public.runs(id) on delete cascade,
  workflow_instance_id uuid not null references public.workflow_instances(id),
  action_kind         text not null,
  target_version_hash text not null,
  idempotency_key     text not null,
  remote_operation_id text,
  result              text not null check (result in
    ('CONFIRMED_SUCCEEDED','CONFIRMED_NOT_APPLIED','CONFIRMED_PARTIAL','STILL_UNKNOWN')),
  authoritative_system text not null,
  detail              jsonb not null default '{}'::jsonb,
  observed_at         timestamptz not null,
  created_at          timestamptz not null default now()
);

comment on table public.workflow_action_reconciliations is
  'PR9d: read-only answers to "did action X actually happen". Append-only; a reconciliation is the ONLY thing that may resolve UNKNOWN.';

create index if not exists workflow_action_reconciliations_run_idx
  on public.workflow_action_reconciliations (run_id, created_at desc);

alter table public.workflow_action_reconciliations enable row level security;

-- Append-only, enforced. Same discipline as workflow_transitions.
create or replace function public.reject_reconciliation_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'workflow_action_reconciliations is append-only (attempted %)', tg_op
    using errcode = 'restrict_violation';
end $$;

drop trigger if exists workflow_action_reconciliations_immutable on public.workflow_action_reconciliations;
create trigger workflow_action_reconciliations_immutable
  before update or delete on public.workflow_action_reconciliations
  for each row execute function public.reject_reconciliation_mutation();

-- A reconciliation must be ABOUT the run it claims to be about. Otherwise a row
-- naming the wrong action could be used to clear an unrelated incident.
create or replace function public.reconciliation_binding_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
declare r public.runs;
begin
  select * into r from public.runs where id = new.run_id;
  if not found then
    raise exception 'reconciliation: run % does not exist', new.run_id using errcode = 'foreign_key_violation';
  end if;
  if r.workflow_instance_id is null then
    raise exception 'reconciliation: run % is not a bound workflow action', new.run_id
      using errcode = 'restrict_violation';
  end if;
  if new.workflow_instance_id is distinct from r.workflow_instance_id
     or new.action_kind         is distinct from r.action_kind
     or new.target_version_hash is distinct from r.target_version_hash
     or new.idempotency_key     is distinct from r.idempotency_key then
    raise exception 'reconciliation: identity does not match run % (instance/action/target/idempotency)', new.run_id
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

drop trigger if exists workflow_action_reconciliations_binding on public.workflow_action_reconciliations;
create trigger workflow_action_reconciliations_binding
  before insert on public.workflow_action_reconciliations
  for each row execute function public.reconciliation_binding_guard();

-- 7) The outcome state machine, in the database.
--
--    Phase may never move backwards, and a terminal outcome is ABSORBING except
--    through the two resolutions reconciliation is allowed to make. In
--    particular UNKNOWN may not become SUCCEEDED on someone's say-so — a
--    CONFIRMED reconciliation row for THIS run must already exist.
create or replace function public.runs_action_outcome_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
declare confirmed int;
begin
  if new.workflow_instance_id is null and old.workflow_instance_id is null then
    return new;                                   -- legacy run, untouched
  end if;

  if public.action_phase_rank(new.action_phase) < public.action_phase_rank(old.action_phase) then
    raise exception 'runs: action phase cannot move backwards (% → %)',
      old.action_phase, new.action_phase using errcode = 'restrict_violation';
  end if;

  if old.action_outcome is not null and new.action_outcome is distinct from old.action_outcome then
    -- Only reconciliation resolves ambiguity, and only in these directions.
    if old.action_outcome = 'UNKNOWN'
       and new.action_outcome in ('SUCCEEDED','FAILED','PARTIAL') then
      select count(*) into confirmed
        from public.workflow_action_reconciliations x
       where x.run_id = new.id and x.result <> 'STILL_UNKNOWN';
      if confirmed = 0 then
        raise exception
          'runs: UNKNOWN may only be resolved by a recorded reconciliation (run %)', new.id
          using errcode = 'restrict_violation';
      end if;
    elsif old.action_outcome = 'SUCCEEDED_EVIDENCE_PENDING' and new.action_outcome = 'SUCCEEDED' then
      null;                                       -- evidence caught up; no side effect repeated
    elsif old.action_outcome = 'PARTIAL' and new.action_outcome = 'FAILED' then
      -- A reconciliation may narrow PARTIAL, but never widen it to SUCCEEDED.
      select count(*) into confirmed
        from public.workflow_action_reconciliations x
       where x.run_id = new.id and x.result <> 'STILL_UNKNOWN';
      if confirmed = 0 then
        raise exception 'runs: PARTIAL may only be narrowed by a recorded reconciliation (run %)', new.id
          using errcode = 'restrict_violation';
      end if;
    else
      raise exception 'runs: illegal action outcome transition % → % (run %)',
        old.action_outcome, new.action_outcome, new.id using errcode = 'restrict_violation';
    end if;
  end if;

  -- Cancellation cannot un-send a message. After dispatch the honest answer is
  -- UNKNOWN until the remote is asked, never CANCELLED.
  if new.action_outcome = 'CANCELLED'
     and public.action_phase_rank(coalesce(new.action_phase, old.action_phase)) >= 3 then
    raise exception
      'runs: CANCELLED is not a legal outcome after DISPATCH_STARTED — the side effect may have happened (run %)',
      new.id using errcode = 'restrict_violation';
  end if;

  return new;
end $$;

drop trigger if exists runs_action_outcome_guard_trg on public.runs;
create trigger runs_action_outcome_guard_trg
  before update on public.runs
  for each row execute function public.runs_action_outcome_guard();

-- 8) THE REAPER. The single most dangerous line in the system before this PR:
--    it requeued any expired `running` run, which after dispatch means doing the
--    side effect twice.
--
--    Legacy runs keep byte-identical behaviour. A bound action that expired
--    BEFORE dispatch is still safe to requeue — nothing left the machine. A bound
--    action that expired AFTER dispatch is parked as UNKNOWN with reconciliation
--    required, and is never handed back to a worker.
create or replace function omnira_cron.reap_stuck_runs()
returns int language plpgsql security definer set search_path to '' as $$
declare n int; m int;
begin
  -- (a) bound actions past DISPATCH_STARTED — freeze, never requeue.
  update public.runs set
    status                  = 'unknown',
    action_outcome          = 'UNKNOWN',
    reconciliation_required = true,
    reconciliation_reason   = 'lease expired after dispatch; the side effect may or may not have been applied',
    outcome_recorded_at     = now(),
    finished_at             = now(),
    claimed_at              = null,
    lease_until             = null,
    claim_id                = null
  where status = 'running'
    and lease_until is not null and lease_until < now()
    and workflow_instance_id is not null
    and public.action_phase_rank(action_phase) >= 3;
  get diagnostics m = row_count;

  -- (b) everything else — legacy semantics, unchanged.
  update public.runs set
    status      = case when attempts >= max_attempts then 'failed' else 'pending' end,
    error       = case when attempts >= max_attempts then coalesce(last_error,'Lease expired (stuck run)') else error end,
    finished_at = case when attempts >= max_attempts then now() else finished_at end,
    claimed_at  = null, lease_until = null, claim_id = null
  where status = 'running'
    and lease_until is not null and lease_until < now()
    and (workflow_instance_id is null or public.action_phase_rank(action_phase) < 3);
  get diagnostics n = row_count;

  return n + m;
end $$;
