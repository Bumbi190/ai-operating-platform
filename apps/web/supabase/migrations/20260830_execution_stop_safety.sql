-- ─────────────────────────────────────────────────────────────────────────────
--  PR9a — EXECUTION STOP-SAFETY.
--
--  Omnira's runs engine is live (1244 runs executed). Before it is ever asked to
--  perform a real workflow action it must be possible to STOP it. Today it is not:
--
--    • public.claim_runs ignores projects.execution_paused, so pausing a project
--      stops the workflow scheduler (workflow_claim_due honours it) but NOT the
--      runs engine. An operator who pauses believes they have stopped the system.
--    • request_run_cancel and set_project_execution_paused do not exist at all.
--    • runs.cancel_reason / cancelled_by do not exist, so a cancellation cannot
--      say who asked or why.
--
--  ── WHY THIS IS A NEW FORWARD MIGRATION, NOT A REPLAY ───────────────────────
--  supabase/migrations/20260606_killswitch_cancel.sql (repo root — a directory
--  check-migrations.mjs does NOT scan, which is why nothing ever demanded it)
--  contains the kill switch. It must NEVER be applied now. Its body does
--  `create or replace function public.claim_runs` WITHOUT claim_id stamping,
--  because it predates 20260614091000_h1p5_runs_claim_id.sql. Applying it today
--  would add the kill switch and SILENTLY DESTROY FENCING in the same statement —
--  claim_id would stop being stamped, every fenced write would match zero rows or
--  fall through unconditionally, and zombie executors could clobber live runs.
--
--  The two migrations conflict on one function body. This migration is the merge:
--  the pause filter from the kill switch, the claim_id stamping from fencing, and
--  nothing dropped from either.
--
--  ── INERT BY DEFAULT ────────────────────────────────────────────────────────
--  execution_paused defaults false and no project is paused (verified: 0 of 4), so
--  claim behaviour is byte-identical until someone actually pauses. Applied with 0
--  runs in flight.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Cancellation provenance. cancel_requested already exists (PR-era column);
--    these two say who and why, which an audit of a stopped action needs.
alter table public.runs add column if not exists cancel_reason text;
alter table public.runs add column if not exists cancelled_by  text;

-- 2) claim_runs — THE MERGE. Every existing semantic is preserved verbatim:
--    status='pending' eligibility (which already excludes cancelled/rejected/done/
--    failed/awaiting_approval), attempts < max_attempts, order by created_at,
--    FOR UPDATE SKIP LOCKED, limit, the status/claimed_at/started_at/lease_until/
--    attempts writes, and the fresh claim_id per claim.
--
--    The ONLY addition is the NOT EXISTS pause predicate — the same shape
--    workflow_claim_due already uses, so both claim paths now read the switch
--    identically. runs.project_id is NOT NULL and FK-bound, so every run resolves
--    to exactly one project and there is no unowned-run case to reason about;
--    NOT EXISTS is used rather than a join purely so the predicate cannot
--    duplicate rows.
--    The DEFAULT 280 is preserved verbatim. Postgres refuses to drop a parameter
--    default in create-or-replace, so omitting it would have failed the migration
--    outright ("cannot remove parameter defaults from existing function") — caught
--    in the pre-apply rollback test. Note 280 < the drain's maxDuration of 300s,
--    which is why the drain passes 320 explicitly and never relies on this default;
--    changing it is a lease-semantics decision that does not belong in a
--    stop-safety PR. Recorded as a residual finding instead.
create or replace function public.claim_runs(p_limit int, p_lease_seconds int default 280)
returns setof public.runs
language plpgsql security definer set search_path to '' as $$
begin
  return query
  update public.runs r set
    status      = 'running',
    claimed_at  = now(),
    started_at  = coalesce(r.started_at, now()),
    lease_until = now() + make_interval(secs => p_lease_seconds),
    attempts    = r.attempts + 1,
    claim_id    = gen_random_uuid()          -- FENCING: preserved, per-claim token
  where r.id in (
    select ru.id from public.runs ru
    where ru.status = 'pending'
      and ru.attempts < ru.max_attempts
      and not exists (                        -- KILL SWITCH: the only new predicate
        select 1 from public.projects p
        where p.id = ru.project_id and p.execution_paused = true
      )
    order by ru.created_at
    for update skip locked
    limit p_limit
  )
  returning r.*;
end $$;

revoke all on function public.claim_runs(int, int) from public, anon, authenticated;
grant execute on function public.claim_runs(int, int) to service_role;

-- 3) Run-level cancel, tenancy-guarded. project_id must match, so guessing a run
--    id from another project updates zero rows and is indistinguishable from
--    "not found" — no cross-tenant existence oracle.
--
--    Cancel is REQUESTED here, never applied: a running run is owned by an
--    executor, and only that executor may write its terminal row (fenced on
--    claim_id). This function records durable intent; the drain/executor honour it
--    at a safe boundary. 'pending' runs are also accepted so intent survives even
--    if the run is claimed a moment later.
create or replace function public.request_run_cancel(
  p_run_id uuid, p_project_id uuid, p_actor text default null, p_reason text default null
) returns int language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  update public.runs set
    cancel_requested = true,
    cancel_reason    = coalesce(p_reason, cancel_reason),
    cancelled_by     = coalesce(p_actor,  cancelled_by)
  where id = p_run_id
    and project_id = p_project_id
    and status in ('pending', 'running');
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.request_run_cancel(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_run_cancel(uuid, uuid, text, text) to service_role;

-- 4) The project kill switch setter. Pausing FREEZES: pending runs stay pending and
--    resume on unpause. It deliberately does NOT cancel them — freezing and
--    cancelling are different operator intents and conflating them would make pause
--    destructive. Cancelling in-flight work is request_run_cancel's job.
--
--    Idempotent: pausing an already-paused project rewrites the same state.
--    paused_at is refreshed only on a false→true edge so the original pause time
--    survives a repeated pause.
create or replace function public.set_project_execution_paused(
  p_project_id uuid, p_paused boolean, p_reason text default null
) returns int language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  update public.projects set
    execution_paused = p_paused,
    paused_at        = case when p_paused
                            then coalesce(paused_at, now())   -- keep the first pause instant
                            else null end,
    paused_reason    = case when p_paused then p_reason else null end
  where id = p_project_id;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.set_project_execution_paused(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.set_project_execution_paused(uuid, boolean, text) to service_role;

-- 5) workflow_rearm — approval makes a workflow ELIGIBLE SOONER. Nothing more.
--
--    Granting a gate authorization currently leaves wake_at wherever the scheduler
--    last pushed it, so an approved workflow can sit idle for a full visibility
--    timeout. This pulls the next evaluation forward.
--
--    WHAT IT DELIBERATELY DOES NOT DO: no transition, no run, no execution, no
--    state change. It moves one timestamp. The tick still re-derives the state,
--    re-checks the gate, re-checks evidence and re-validates the authorization —
--    approval buys an earlier LOOK, never an action. This is also why it is NOT a
--    trigger on atlas_authorizations: a trigger would couple the authority ledger
--    to the scheduler and become exactly the hidden execution path we are avoiding.
--
--    Refuses (returns 0) unless ALL hold:
--      • the instance is active
--      • its project is not paused  ← a paused project is never re-armed
--      • the authorization chain is live-granted for THIS instance's CURRENT state
--    The grant predicate mirrors workflow_append_transition's exactly, as a
--    boolean rather than an exception.
create or replace function public.workflow_rearm(
  p_instance_id uuid, p_authorization_id uuid
) returns int language plpgsql security definer set search_path to '' as $$
declare
  inst      public.workflow_instances;
  granted_n int;
  closed_n  int;
  n         int;
begin
  select * into inst from public.workflow_instances where id = p_instance_id;
  if not found or inst.status <> 'active' then
    return 0;
  end if;

  if exists (
    select 1 from public.projects p
    where p.id = inst.project_id and p.execution_paused = true
  ) then
    return 0;                                  -- paused: never re-arm into execution
  end if;

  select
    count(*) filter (
      where a.event_type = 'granted'
        and a.expires_at is not null
        and a.expires_at > now()
        and a.target_type = 'workflow_gate'
        and a.target_id = p_instance_id::text || ':' || inst.current_state
        and a.project_id = inst.project_id
    ),
    count(*) filter (
      where a.event_type in ('denied', 'revoked', 'superseded', 'expired')
    )
  into granted_n, closed_n
  from public.atlas_authorizations a
  where a.authorization_id = p_authorization_id;

  if granted_n = 0 or closed_n > 0 then
    return 0;                                  -- not a live grant for THIS state
  end if;

  -- Idempotent by construction: least() never pushes a wake later, so repeating
  -- this is a no-op rather than a second wake.
  update public.workflow_instances w set
    wake_at = least(coalesce(w.wake_at, 'infinity'::timestamptz), now())
  where w.id = p_instance_id;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.workflow_rearm(uuid, uuid) from public, anon, authenticated;
grant execute on function public.workflow_rearm(uuid, uuid) to service_role;
