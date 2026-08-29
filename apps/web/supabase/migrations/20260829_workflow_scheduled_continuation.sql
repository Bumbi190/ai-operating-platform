-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Workflow scheduled continuation (PR3)
--   ────────────────────────────────────
--   `wake_at` has existed since PR1 as an inert column. This makes it work:
--   an instance can sleep until a future instant, wake, be evaluated, and report
--   what it found — WITHOUT crossing a human gate and without executing anything.
--
--   ── WHY NOT RUNS' LEASE SEMANTICS ───────────────────────────────────────────
--   A run is claimed under a lease and a reaper requeues it when the lease
--   expires. That is right for something that lives minutes inside one
--   invocation, and wrong here for the reason PR1 already recorded: a workflow
--   instance is mostly AT REST, so a lease would either never expire (defeating
--   the reaper) or expire constantly (defeating the state). There is deliberately
--   no lease column, no claim_id and no reaper for instances.
--
--   Instead the claim MOVES THE WAKE FORWARD — a visibility timeout:
--
--     claim:  wake_at := now() + visibility window, row returned
--     success: the tick sets the next wake explicitly, or clears it
--     crash:   nobody clears anything; wake_at is a few minutes out, so the
--              instance simply becomes due again and is retried
--
--   That gives at-least-once delivery with no lost wake, no zombie claim to
--   reap, and no second lifecycle to keep in sync. Idempotency lives in the
--   tick, which is evaluation-only in PR3.
--
--   ── WHAT THE SCHEDULER MAY NEVER DO ─────────────────────────────────────────
--   Nothing here advances a state, and nothing here touches atlas_authorizations
--   except to READ it. A scheduler that could author a grant would make the
--   human gate decorative; `workflow_append_transition`'s gate check (PR2) still
--   stands in front of every gated advance, and it requires a founder-authored
--   act that the scheduler cannot produce.
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Observability columns ──────────────────────────────────────────────────
--
-- Both are NON-AUTHORITATIVE operational state, like current_state. The audit
-- record of every wake and every evaluation is appended to workflow_evidence,
-- which cannot be rewritten; these two exist so an operator can see the last
-- tick without reading the evidence log.

alter table public.workflow_instances
  add column if not exists last_tick_at      timestamptz,
  add column if not exists last_tick_outcome text;

comment on column public.workflow_instances.wake_at is
  'When this instance next becomes eligible for evaluation. NULL = not scheduled. '
  'Future = sleeping. <= now() = due. A claim pushes it forward as a visibility '
  'timeout; a crashed tick therefore retries rather than losing the wake.';

-- Partial index for the tick''s only read. Narrow on purpose: the scheduler must
-- never scan instances that are terminal, abandoned or unscheduled.
drop index if exists public.workflow_instances_wake_idx;
create index if not exists workflow_instances_due_idx
  on public.workflow_instances (wake_at)
  where status = 'active' and wake_at is not null;

-- ── 2. Explicit scheduling, audited ───────────────────────────────────────────
--
-- Scheduling is never implicit. Each call appends an evidence row, so "who armed
-- this wake, when, and why" survives in append-only history — an overwritten
-- wake leaves the previous one visible rather than vanishing.

create or replace function public.workflow_schedule_wake(
  p_instance_id uuid,
  p_wake_at     timestamptz,
  p_actor       text,
  p_reason      text
) returns public.workflow_instances
language plpgsql
security definer
set search_path to ''
as $$
declare i public.workflow_instances; prev timestamptz;
begin
  select * into i from public.workflow_instances where id = p_instance_id for update;
  if not found then
    raise exception 'workflow_schedule_wake: unknown instance %', p_instance_id
      using errcode = 'foreign_key_violation';
  end if;
  -- A finished workflow has nothing to wake up for.
  if i.status <> 'active' then
    raise exception 'workflow_schedule_wake: instance % is % and cannot be scheduled',
      p_instance_id, i.status
      using errcode = 'restrict_violation';
  end if;
  if p_wake_at is null then
    raise exception 'workflow_schedule_wake: wake_at is required (use workflow_clear_wake to unschedule)'
      using errcode = 'check_violation';
  end if;

  prev := i.wake_at;

  update public.workflow_instances set wake_at = p_wake_at where id = p_instance_id
  returning * into i;

  -- Audited in the append-only log, including what it replaced.
  insert into public.workflow_evidence (instance_id, state, check_key, result, source, detail)
  values (p_instance_id, i.current_state, 'scheduler.wake_scheduled', 'pass', 'automated',
          jsonb_build_object('wake_at', p_wake_at, 'previous_wake_at', prev,
                             'actor', p_actor, 'reason', p_reason));
  return i;
end;
$$;
revoke all on function public.workflow_schedule_wake(uuid, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.workflow_schedule_wake(uuid, timestamptz, text, text) to service_role;

create or replace function public.workflow_clear_wake(
  p_instance_id uuid, p_actor text, p_reason text
) returns public.workflow_instances
language plpgsql
security definer
set search_path to ''
as $$
declare i public.workflow_instances; prev timestamptz;
begin
  select * into i from public.workflow_instances where id = p_instance_id for update;
  if not found then
    raise exception 'workflow_clear_wake: unknown instance %', p_instance_id
      using errcode = 'foreign_key_violation';
  end if;
  prev := i.wake_at;
  update public.workflow_instances set wake_at = null where id = p_instance_id returning * into i;

  -- Only audit a real change, so repeated clears do not spam the evidence log.
  if prev is not null then
    insert into public.workflow_evidence (instance_id, state, check_key, result, source, detail)
    values (p_instance_id, i.current_state, 'scheduler.wake_cleared', 'pass', 'automated',
            jsonb_build_object('previous_wake_at', prev, 'actor', p_actor, 'reason', p_reason));
  end if;
  return i;
end;
$$;
revoke all on function public.workflow_clear_wake(uuid, text, text) from public, anon, authenticated;
grant execute on function public.workflow_clear_wake(uuid, text, text) to service_role;

-- ── 3. The claim ──────────────────────────────────────────────────────────────
--
-- SKIP LOCKED so two concurrent ticks partition the work instead of contending,
-- and the visibility push means the loser of any race simply sees nothing due.
--
-- The project kill switch is enforced INSIDE the claim, at the lowest level, for
-- the same reason claim_runs does it: no application path can forget it. A
-- paused project's instances are never returned, so they are never evaluated.

create or replace function public.workflow_claim_due(
  p_limit              int  default 20,
  p_visibility_seconds int  default 300
) returns setof public.workflow_instances
language plpgsql
security definer
set search_path to ''
as $$
begin
  return query
  update public.workflow_instances w set
    wake_at      = now() + make_interval(secs => p_visibility_seconds),
    last_tick_at = now()
  where w.id in (
    select d.id from public.workflow_instances d
    where d.status = 'active'
      and d.wake_at is not null
      and d.wake_at <= now()
      and not exists (
        select 1 from public.projects p
        where p.id = d.project_id and p.execution_paused = true
      )
    order by d.wake_at
    for update skip locked
    limit p_limit
  )
  returning w.*;
end;
$$;
revoke all on function public.workflow_claim_due(int, int) from public, anon, authenticated;
grant execute on function public.workflow_claim_due(int, int) to service_role;

-- ── 4. Recording an evaluation ────────────────────────────────────────────────
--
-- Writes the observability columns and appends evidence ONLY when the outcome
-- changed. A tick every minute against an unchanged instance must not grow the
-- audit log without bound; a CHANGE in what the scheduler sees always must.

create or replace function public.workflow_record_tick(
  p_instance_id  uuid,
  p_outcome      text,
  p_detail       jsonb default '{}'::jsonb,
  p_next_wake_at timestamptz default null
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare i public.workflow_instances; changed boolean;
begin
  select * into i from public.workflow_instances where id = p_instance_id for update;
  if not found then
    raise exception 'workflow_record_tick: unknown instance %', p_instance_id
      using errcode = 'foreign_key_violation';
  end if;

  changed := i.last_tick_outcome is distinct from p_outcome;

  update public.workflow_instances set
    last_tick_outcome = p_outcome,
    last_tick_at      = now(),
    wake_at           = p_next_wake_at
  where id = p_instance_id;

  if changed then
    insert into public.workflow_evidence (instance_id, state, check_key, result, source, detail)
    values (p_instance_id, i.current_state, 'scheduler.evaluation',
            case when p_outcome in ('failed', 'blocked') then 'fail' else 'pass' end,
            'automated',
            p_detail || jsonb_build_object('outcome', p_outcome,
                                           'previous_outcome', i.last_tick_outcome));
  end if;
end;
$$;
revoke all on function public.workflow_record_tick(uuid, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.workflow_record_tick(uuid, text, jsonb, timestamptz) to service_role;

-- ── 5. Cron + guardian ────────────────────────────────────────────────────────
--
-- Registered in ensure_core_schedules() alongside the drain and reaper, so a
-- manual `cron.unschedule` self-heals within five minutes — the exact incident
-- 20260614_cron_guardian.sql was written for. cron.schedule upserts by name, so
-- re-applying this migration cannot create a duplicate job.

create or replace function omnira_cron.ensure_core_schedules()
returns text language plpgsql security definer set search_path to '' as $fn$
declare restored text := '';
begin
  if not exists (select 1 from cron.job where jobname = 'omnira_runs_drain') then
    perform cron.schedule('omnira_runs_drain', '* * * * *', 'select omnira_cron.call_vercel(''/api/runs/drain'')');
    restored := restored || 'omnira_runs_drain ';
  end if;
  if not exists (select 1 from cron.job where jobname = 'omnira_runs_reaper') then
    perform cron.schedule('omnira_runs_reaper', '* * * * *', 'select omnira_cron.reap_stuck_runs()');
    restored := restored || 'omnira_runs_reaper ';
  end if;
  -- PR3: the workflow tick joins the self-healing set.
  if not exists (select 1 from cron.job where jobname = 'omnira_workflow_tick') then
    perform cron.schedule('omnira_workflow_tick', '* * * * *', 'select omnira_cron.call_vercel(''/api/workflows/tick'')');
    restored := restored || 'omnira_workflow_tick ';
  end if;
  return case when restored = '' then 'ok' else 'restored: ' || restored end;
end $fn$;

select omnira_cron.ensure_core_schedules();
