-- ═══════════════════════════════════════════════════════════════════════════
-- Governance G3C-2A — make EXECUTION ADMISSION stop-atomic
-- ═══════════════════════════════════════════════════════════════════════════
--
-- G3C-1 closed the paid provider dispatch. G3C-2B closed the registered
-- non-spend external writes. Both act at the moment a packet leaves the machine.
--
-- This closes the moment BEFORE that: the transition from "queued" to "running".
--
-- THE RACE, exactly:
--
--   T1  claim_runs' candidate query reads projects.execution_paused and sees clear
--   T2  an operator pauses that project, and the pause COMMITS
--   T3  the same statement's UPDATE sets the run to 'running'
--
-- Today T3 succeeds. The candidate predicate is an UNLOCKED read, so nothing
-- orders it against the pause; and there is no reference to
-- platform_config.automation_paused at all, so the global switch never reached
-- run admission in the first place. The same is true of workflow_claim_due, and
-- workflow_instantiate consults neither authority.
--
-- WHY A PREDICATE IS NOT ENOUGH. `and not exists (... execution_paused)` is a
-- read of a row nobody holds a lock on. Two transactions can both be correct
-- about what they saw and still commit in the forbidden order. The barrier has
-- to be a LOCK that conflicts with the G3A setters and is held until commit.
--
-- THE MODEL. G3A's setters take `FOR UPDATE` on exactly one row each --
-- platform_config id=1, or one projects row -- and touch neither runs nor
-- workflow_instances. That is what lets admission take its WORK-row lock first
-- and its AUTHORITY locks second, yielding exactly two orderings and no third:
--
--   • admission locks first  -> a concurrent pause BLOCKS until we commit, so the
--     claim linearizes BEFORE the stop, which is correct;
--   • the pause commits first -> admission BLOCKS on the SHARE lock, then reads
--     the COMMITTED paused value and admits nothing.
--
-- The forbidden third outcome -- pause commits, then a claim commits on pre-pause
-- state -- becomes unrepresentable.
--
-- LOCK ORDER, and why it is acyclic:
--
--   workflow_append_transition (G3B)  instance -> platform -> project
--   claim_runs                        run      -> platform -> project
--   workflow_claim_due                instance -> platform -> project
--   workflow_rearm                    instance -> project
--   workflow_instantiate              platform -> project -> NEW instance
--   stop_set_platform_automation      platform only
--   stop_set_project_execution        one project only
--
-- Every path reaches authority from work, never work from authority. The single
-- apparent exception is workflow_instantiate, and it is not one: the instance it
-- inserts does not exist before the authority locks are taken and is invisible to
-- every other transaction until commit, so no transaction can hold or want a lock
-- on it. That is why platform -> NEW instance introduces no edge into the graph.
-- It is emphatically NOT a licence to lock platform before an EXISTING instance:
-- that would reverse G3B's edge and close a cycle through any pause setter queued
-- between two SHARE holders.
--
-- WHAT THIS IS NOT. This does not stop work already running -- an executor
-- mid-flight keeps its claim, and cancellation of running work is G3C-3. It does
-- not block QUEUEING: creating a pending run is control-plane state, and a stop
-- must not prevent an operator from staging work for after the resume. It stops
-- new work from BECOMING executable.
--
-- Function bodies only. No tables, columns, types, RLS, triggers, ACLs, owners,
-- signatures, defaults or security attributes change.
--
-- NOTE ON PRODUCTION DRIFT. The deployed bodies of workflow_instantiate and
-- workflow_rearm are byte-identical to this repository's migrations once `--`
-- comments are stripped; production simply carries comment-free variants. Logic
-- never diverged. Replacing them here restores the commented source of truth.

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. claim_runs -- the sole path by which a pending run becomes executable
-- ───────────────────────────────────────────────────────────────────────────
--
-- Phases are explicit plpgsql rather than one clever statement on purpose. The
-- lock ORDER is the safety property, and a single SELECT's lock order is a
-- planner decision -- it can change with statistics, a version upgrade, or an
-- index. What the concurrency proofs must demonstrate is the order, so the order
-- is written down rather than hoped for.
create or replace function public.claim_runs(
  p_limit integer,
  p_lease_seconds integer default 320
)
returns setof public.runs
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ids      uuid[];
  v_projects uuid[];
  v_allowed  uuid[] := '{}';
  v_pid      uuid;
  v_gpaused  boolean;
  v_ppaused  boolean;
begin
  -- ── PHASE 1 · work rows first ──────────────────────────────────────────────
  -- FOR UPDATE SKIP LOCKED is unchanged: concurrent drains still divide the queue
  -- between them rather than serialising. The `execution_paused` predicate below
  -- is retained purely as a PERFORMANCE filter -- it keeps obviously-paused work
  -- out of the batch -- and is NOT authoritative. It is an unlocked read, so a
  -- pause committing after it must still be caught, and it is, in phase 3.
  select array_agg(c.id order by c.created_at),
         array_agg(distinct c.project_id)
    into v_ids, v_projects
  from (
    select r.id, r.created_at, r.project_id
    from public.runs r
    where r.status = 'pending'
      and r.attempts < r.max_attempts
      and not exists (
        select 1 from public.projects p
        where p.id = r.project_id and p.execution_paused = true
      )
    order by r.created_at
    for update skip locked
    limit p_limit
  ) c;

  if v_ids is null or cardinality(v_ids) = 0 then
    return;                              -- nothing claimable; not an error
  end if;

  -- ── PHASE 2 · global authority ─────────────────────────────────────────────
  -- FOR SHARE conflicts with the setter's FOR UPDATE and is held to commit.
  select pc.automation_paused into v_gpaused
    from public.platform_config pc where pc.id = 1 for share;

  if not found then
    -- Fail closed. Treating a missing config row as "not paused" is how a kill
    -- switch becomes a no-op.
    raise exception 'claim_runs: platform stop authority unavailable (platform_config row 1 missing)'
      using errcode = 'P0002';
  end if;

  if v_gpaused then
    -- A paused platform has nothing claimable. Deliberately zero rows rather
    -- than an exception: "idle" is the worker API's normal shape, and turning a
    -- routine pause into an error would light up drain alerting every tick.
    return;
  end if;

  -- ── PHASE 3 · project authority, deterministic order ───────────────────────
  -- One row at a time, ordered by id. A set-based lock would leave acquisition
  -- order to the planner; ordering by a total key means two claimers holding
  -- overlapping batches can never queue on each other in opposite directions.
  foreach v_pid in array (select array_agg(u order by u) from unnest(v_projects) u)
  loop
    select p.execution_paused into v_ppaused
      from public.projects p where p.id = v_pid for share;

    if not found then
      -- runs.project_id is NOT NULL and references projects, so this is
      -- unreachable by construction. If construction is wrong, refuse.
      raise exception 'claim_runs: project stop authority unavailable for %', v_pid
        using errcode = 'P0002';
    end if;

    if not v_ppaused then
      v_allowed := array_append(v_allowed, v_pid);
    end if;
  end loop;

  if cardinality(v_allowed) = 0 then
    return;                              -- every candidate project is paused
  end if;

  -- ── PHASE 4 · admit ────────────────────────────────────────────────────────
  -- Every fencing property of PR9a is preserved verbatim: a fresh claim_id per
  -- claim, the attempt increment, the lease, and started_at set once.
  return query
  update public.runs r set
    status      = 'running',
    claimed_at  = now(),
    started_at  = coalesce(r.started_at, now()),
    lease_until = now() + make_interval(secs => p_lease_seconds),
    attempts    = r.attempts + 1,
    claim_id    = gen_random_uuid()
  where r.id = any(v_ids)
    and r.project_id = any(v_allowed)     -- a paused project's run stays pending
  returning r.*;
end
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. workflow_claim_due -- the sole path by which a due instance is claimed
-- ───────────────────────────────────────────────────────────────────────────
--
-- Instance first, exactly as G3B. Reversing to platform -> instance would close
-- a cycle: append_transition holds an instance and wants platform SHARE, this
-- would hold platform and want that instance, and a pause setter queued for
-- platform FOR UPDATE between the two SHARE holders completes the ring.
create or replace function public.workflow_claim_due(
  p_limit integer default 20,
  p_visibility_seconds integer default 300
)
returns setof public.workflow_instances
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ids      uuid[];
  v_projects uuid[];
  v_allowed  uuid[] := '{}';
  v_pid      uuid;
  v_gpaused  boolean;
  v_ppaused  boolean;
begin
  -- ── PHASE 1 · instance rows first ──────────────────────────────────────────
  select array_agg(c.id order by c.wake_at),
         array_agg(distinct c.project_id)
    into v_ids, v_projects
  from (
    select d.id, d.wake_at, d.project_id
    from public.workflow_instances d
    where d.status = 'active'
      and d.wake_at is not null
      and d.wake_at <= now()
      and not exists (                   -- performance filter, NOT authoritative
        select 1 from public.projects p
        where p.id = d.project_id and p.execution_paused = true
      )
    order by d.wake_at
    for update skip locked
    limit p_limit
  ) c;

  if v_ids is null or cardinality(v_ids) = 0 then
    return;
  end if;

  -- ── PHASE 2 · global authority ─────────────────────────────────────────────
  select pc.automation_paused into v_gpaused
    from public.platform_config pc where pc.id = 1 for share;

  if not found then
    raise exception 'workflow_claim_due: platform stop authority unavailable (platform_config row 1 missing)'
      using errcode = 'P0002';
  end if;

  if v_gpaused then
    return;                              -- scheduler idle, not scheduler failure
  end if;

  -- ── PHASE 3 · project authority, deterministic order ───────────────────────
  foreach v_pid in array (select array_agg(u order by u) from unnest(v_projects) u)
  loop
    select p.execution_paused into v_ppaused
      from public.projects p where p.id = v_pid for share;

    if not found then
      raise exception 'workflow_claim_due: project stop authority unavailable for %', v_pid
        using errcode = 'P0002';
    end if;

    if not v_ppaused then
      v_allowed := array_append(v_allowed, v_pid);
    end if;
  end loop;

  if cardinality(v_allowed) = 0 then
    return;
  end if;

  -- ── PHASE 4 · claim ────────────────────────────────────────────────────────
  return query
  update public.workflow_instances w set
    wake_at      = now() + make_interval(secs => p_visibility_seconds),
    last_tick_at = now()
  where w.id = any(v_ids)
    and w.project_id = any(v_allowed)
  returning w.*;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. workflow_instantiate -- creating ACTIVE execution state is admission
-- ───────────────────────────────────────────────────────────────────────────
--
-- This creates an active instance AND its opening transition. The opening
-- transition is written directly rather than through workflow_append_transition
-- -- that function explicitly rejects a null from_state and says the opening
-- transition belongs here -- which means G3B's barrier structurally cannot see
-- it. Without the barrier below, a stopped platform could still gain new
-- executable workflow state and a committed execution-bearing transition.
--
-- The authority locks are taken AFTER the definition and initial-state
-- validation, so those public failure modes keep their existing SQLSTATEs, and
-- BEFORE the first execution-bearing INSERT, which is what the barrier has to
-- dominate.
create or replace function public.workflow_instantiate(
  p_def_id uuid,
  p_project_id uuid,
  p_instance_key text,
  p_initial_state text,
  p_actor text,
  p_reason text
)
returns public.workflow_instances
language plpgsql
security definer
set search_path to ''
as $$
declare
  d        public.workflow_defs;
  i        public.workflow_instances;
  gpaused  boolean;
  ppaused  boolean;
begin
  select * into d from public.workflow_defs where id = p_def_id;
  if not found then
    raise exception 'workflow_instantiate: unknown definition %', p_def_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Membership check only. Graph legality (which state may follow which) is the
  -- TypeScript machine's job and is deliberately not duplicated here.
  if not exists (
    select 1 from jsonb_array_elements(d.spec -> 'states') s
    where s ->> 'id' = p_initial_state
  ) then
    raise exception 'workflow_instantiate: state "%" is not declared by % v%',
      p_initial_state, d.def_key, d.version
      using errcode = 'check_violation';
  end if;

  -- ── G3C-2A · STOP BARRIER ──────────────────────────────────────────────────
  -- platform -> project -> NEW instance. Safe despite G3B's instance -> platform
  -- edge precisely because the instance below does not exist yet: no other
  -- transaction can hold or want a lock on a row that has never been visible.
  select pc.automation_paused into gpaused
    from public.platform_config pc where pc.id = 1 for share;
  if not found then
    raise exception 'workflow_instantiate: platform stop authority unavailable (platform_config row 1 missing)'
      using errcode = 'P0002';
  end if;

  select p.execution_paused into ppaused
    from public.projects p where p.id = p_project_id for share;
  if not found then
    -- An unknown project keeps its existing public SQLSTATE -- the INSERT below
    -- would have raised foreign_key_violation anyway -- while still failing
    -- closed rather than instantiating into an unverifiable scope.
    raise exception 'workflow_instantiate: project % does not exist', p_project_id
      using errcode = 'foreign_key_violation';
  end if;

  -- GLOBAL is reported first: it is the broader authority, and telling an
  -- operator "this project is stopped" while the whole platform is stopped sends
  -- them to fix the wrong thing. restrict_violation -- never
  -- insufficient_privilege -- so a stop refusal stays distinguishable from an
  -- authorization refusal by SQLSTATE alone. Human authorization never overrides
  -- a stop.
  if gpaused then
    raise exception 'workflow_instantiate: GLOBAL execution is stopped — no workflow may be instantiated'
      using errcode = 'restrict_violation';
  end if;
  if ppaused then
    raise exception 'workflow_instantiate: PROJECT execution is stopped for % — no workflow may be instantiated', p_project_id
      using errcode = 'restrict_violation';
  end if;

  insert into public.workflow_instances (
    def_id, def_key, def_version, def_hash, project_id, instance_key, current_state
  ) values (
    d.id, d.def_key, d.version, d.def_hash, p_project_id, p_instance_key, p_initial_state
  ) returning * into i;

  insert into public.workflow_transitions (instance_id, from_state, to_state, reason, actor)
  values (i.id, null, p_initial_state, p_reason, p_actor);

  return i;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. workflow_rearm -- CONTROL, and deliberately still control
-- ───────────────────────────────────────────────────────────────────────────
--
-- Re-arm moves wake_at. It creates no run, appends no transition and calls
-- nothing external; the actual admission happens later, in workflow_claim_due,
-- which is now authoritative. So NO global stop rule is added here: that would
-- change an established control-plane contract because this migration happened
-- to be touching scheduler SQL.
--
-- What does change is that the EXISTING project-pause rule stops being a stale
-- read. It was already policy; it just was not race-safe. Lock order is
-- instance -> project, a prefix of G3B's, so no new edge appears.
--
-- Authorization semantics are untouched. Re-arm still requires a live grant for
-- exactly this instance and state, and resume neither mints, renews nor
-- reinterprets one.
create or replace function public.workflow_rearm(
  p_instance_id uuid,
  p_authorization_id uuid
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  inst      public.workflow_instances;
  ppaused   boolean;
  granted_n int;
  closed_n  int;
  n         int;
begin
  -- FOR UPDATE, not a bare read: the instance is the first lock in the canonical
  -- order and taking it here is what lets the project SHARE below be atomic
  -- with respect to a concurrent pause.
  select * into inst from public.workflow_instances
    where id = p_instance_id for update;
  if not found or inst.status <> 'active' then
    return 0;
  end if;

  select p.execution_paused into ppaused
    from public.projects p where p.id = inst.project_id for share;
  if not found then
    raise exception 'workflow_rearm: project stop authority unavailable for %', inst.project_id
      using errcode = 'P0002';
  end if;
  if ppaused then
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
end
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Deliberately NOT changed: workflow_schedule_wake, workflow_clear_wake,
-- workflow_record_tick.
--
-- schedule_wake plans future work; clear_wake removes it; record_tick writes
-- down what an already-claimed evaluation did. None of them admits execution --
-- workflow_claim_due does, and it now refuses under a stop. Gating these would
-- mean pressing the kill switch also disables the bookkeeping that records why
-- everything stopped, and prevents an operator from unscheduling work during an
-- incident. A stop must prevent new execution, not prevent the system from
-- learning and recording what already happened.
-- ───────────────────────────────────────────────────────────────────────────

commit;
