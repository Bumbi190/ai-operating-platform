-- ═══════════════════════════════════════════════════════════════════════════
-- Governance G3B — make workflow transitions stop-atomic (closes F-107)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- F-107 / G3-F-002, exactly:
--
--   T1  the application reads the stop state and sees "clear"
--   T2  an operator pauses, and that pause COMMITS
--   T3  the now-stale caller invokes workflow_append_transition(...)
--
-- Today T3 succeeds. The authoritative SQL that writes workflow_transitions and
-- advances workflow_instances.current_state consults NEITHER stop authority --
-- verified against production: the deployed body contains no reference to
-- automation_paused or execution_paused. Every stop check lived in TypeScript,
-- one round trip earlier, which is precisely the window.
--
-- G3B moves the check INTO the transaction that does the writing, under row
-- locks that conflict with the G3A setters. After this, a committed pause and a
-- committed transition are linearly ordered, and the ordering "pause commits,
-- then a transition commits on pre-pause state" becomes impossible.
--
-- WHAT THIS IS NOT. This does not make the platform stop-safe. It closes the
-- race at ONE mutation boundary: the workflow transition append. A paused
-- workflow can still be claimed by scheduler paths, still create runs, still
-- run provider work, and legacy media steps are untouched. Those are G3C/G3D.
-- Do not read this migration as "the global stop now stops all execution".
--
-- SIGNATURE UNCHANGED, so this is CREATE OR REPLACE with no DROP and no
-- CASCADE: same arguments, same return type, same owner, same SECURITY DEFINER,
-- same empty search_path, same service_role-only EXECUTE. Nothing but the
-- barrier is added -- the instance lock, the CAS, the state validation, the gate
-- derivation and the authorization chain are carried over verbatim from
-- 20260829_workflow_gate_authorization.sql.
--
-- NO BYPASS EXISTS. No p_context, no p_force, no GUC, no session variable, no
-- privileged actor and no authorization id can skip the barrier. A human
-- authorization does not override a stop, and a backward transition that needs
-- no gate does not either: pause freezes.

create or replace function public.workflow_append_transition(
  p_instance_id      uuid,
  p_from_state       text,
  p_to_state         text,
  p_reason           text,
  p_actor            text,
  p_evidence_ref     uuid default null,
  p_authorization_id uuid default null
) returns public.workflow_transitions
language plpgsql
security definer
set search_path to ''
as $$
declare
  i          public.workflow_instances;
  t          public.workflow_transitions;
  d_spec     jsonb;
  from_json  jsonb;
  terminal   boolean;
  gated      boolean;
  is_advance boolean;
  granted_n  int;
  closed_n   int;
  chain_n    int;
  gpaused    boolean;
  ppaused    boolean;
begin
  select * into i from public.workflow_instances where id = p_instance_id for update;
  if not found then
    raise exception 'workflow_append_transition: unknown instance %', p_instance_id
      using errcode = 'foreign_key_violation';
  end if;

  if i.status <> 'active' then
    raise exception 'workflow_append_transition: instance % is % and accepts no further transitions',
      p_instance_id, i.status
      using errcode = 'restrict_violation';
  end if;

  if p_from_state is null then
    raise exception 'workflow_append_transition: from_state is required (the opening transition belongs to workflow_instantiate)'
      using errcode = 'check_violation';
  end if;
  if i.current_state is distinct from p_from_state then
    raise exception 'workflow_append_transition: stale transition — instance % is in "%" not "%"',
      p_instance_id, i.current_state, p_from_state
      using errcode = 'serialization_failure';
  end if;

  -- ── G3B · STOP BARRIER (closes F-107) ──────────────────────────────────────
  --
  -- THE RACE THIS CLOSES. The application could read "not paused", an operator
  -- could then pause and COMMIT, and this function — which never consulted
  -- either stop authority — would still append the transition afterwards. The
  -- stale read was in TypeScript; the authoritative write was here; nothing
  -- connected them.
  --
  -- A workflow state transition is INTRINSICALLY execution-bearing, so both G3A
  -- enforcing scopes apply and there is deliberately no context parameter: a
  -- caller that could declare its own context could declare its way past the
  -- stop.
  --
  -- WHY FOR SHARE, AND WHY HERE. This function does not mutate the stop rows; it
  -- needs a lock that CONFLICTS with the G3A setters' FOR UPDATE and is held
  -- until this transaction ends. That yields exactly two orderings and no third:
  --
  --   • this transaction takes SHARE first → a concurrent pause BLOCKS until we
  --     commit → the transition linearized before the stop, which is correct;
  --   • the pause setter takes UPDATE first → we BLOCK, then read the COMMITTED
  --     paused value and refuse → no transition commits after the stop.
  --
  -- The forbidden third outcome — pause commits, then a transition commits on
  -- pre-pause state — is what F-107 was.
  --
  -- Placed AFTER the instance CAS so the existing fencing is untouched, and
  -- BEFORE any definition, gate or authorization work so a stopped scope costs
  -- nothing and can never append. Lock order is instance → platform → project;
  -- no canonical function locks a stop row before a workflow instance, so this
  -- introduces no cycle.
  select pc.automation_paused into gpaused
    from public.platform_config pc where pc.id = 1 for share;
  if not found then
    -- Fail closed. Treating a missing config row as "not paused" is how a kill
    -- switch becomes a no-op.
    raise exception 'workflow_append_transition: platform stop authority unavailable (platform_config row 1 missing)'
      using errcode = 'P0002';
  end if;

  select p.execution_paused into ppaused
    from public.projects p where p.id = i.project_id for share;
  if not found then
    raise exception 'workflow_append_transition: project stop authority unavailable for project %', i.project_id
      using errcode = 'P0002';
  end if;

  -- GLOBAL is reported first: it is the broader authority, and telling an
  -- operator "this project is stopped" while the whole platform is stopped sends
  -- them to fix the wrong thing. `restrict_violation` — never
  -- `insufficient_privilege` — so a stop refusal is distinguishable from an
  -- authorization refusal by SQLSTATE alone.
  if gpaused then
    raise exception 'workflow_append_transition: GLOBAL execution is stopped — no transition may be appended'
      using errcode = 'restrict_violation';
  end if;
  if ppaused then
    raise exception 'workflow_append_transition: PROJECT execution is stopped for % — no transition may be appended', i.project_id
      using errcode = 'restrict_violation';
  end if;

  select spec into d_spec from public.workflow_defs where id = i.def_id;
  if not exists (
    select 1 from jsonb_array_elements(d_spec -> 'states') s where s ->> 'id' = p_to_state
  ) then
    raise exception 'workflow_append_transition: state "%" is not declared by % v%',
      p_to_state, i.def_key, i.def_version
      using errcode = 'check_violation';
  end if;

  -- ── Gate check ─────────────────────────────────────────────────────────────
  -- Reading a declared flag out of the pinned spec, not re-deciding the graph.
  select s into from_json
  from jsonb_array_elements(d_spec -> 'states') s
  where s ->> 'id' = p_from_state;

  gated      := coalesce((from_json -> 'human_gate' ->> 'required')::boolean, false);
  -- Only crossing a gate FORWARD needs authority. Failing backwards is redoing
  -- your own work and needs none — same rule as the TypeScript machine.
  is_advance := (from_json ->> 'next_state') is not distinct from p_to_state;

  if gated and is_advance then
    if p_authorization_id is null then
      raise exception 'workflow_append_transition: leaving "%" crosses a required human gate — an authorization is required',
        p_from_state
        using errcode = 'insufficient_privilege';
    end if;

    select
      count(*),
      count(*) filter (
        where a.event_type = 'granted'
          and a.expires_at is not null
          and a.expires_at > now()
          and a.target_type = 'workflow_gate'
          and a.target_id = p_instance_id::text || ':' || p_from_state
          and a.project_id = i.project_id
      ),
      count(*) filter (
        where a.event_type in ('denied', 'revoked', 'superseded', 'expired')
      )
    into chain_n, granted_n, closed_n
    from public.atlas_authorizations a
    where a.authorization_id = p_authorization_id;

    if chain_n = 0 then
      raise exception 'workflow_append_transition: authorization % does not exist', p_authorization_id
        using errcode = 'insufficient_privilege';
    end if;
    if closed_n > 0 then
      raise exception 'workflow_append_transition: authorization % was denied, revoked, superseded or expired',
        p_authorization_id
        using errcode = 'insufficient_privilege';
    end if;
    if granted_n = 0 then
      raise exception 'workflow_append_transition: authorization % carries no live grant for instance % state "%"',
        p_authorization_id, p_instance_id, p_from_state
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  insert into public.workflow_transitions (
    instance_id, from_state, to_state, reason, actor, evidence_ref, authorization_id
  ) values (
    p_instance_id, p_from_state, p_to_state, p_reason, p_actor, p_evidence_ref, p_authorization_id
  ) returning * into t;

  select coalesce(
    (select (s -> 'next_state') = 'null'::jsonb or s -> 'next_state' is null
     from jsonb_array_elements(d_spec -> 'states') s where s ->> 'id' = p_to_state),
    false
  ) into terminal;

  update public.workflow_instances set
    current_state = p_to_state,
    status        = case when terminal then 'complete' else status end,
    closed_at     = case when terminal then now() else closed_at end
  where id = p_instance_id;

  return t;
end;
$$;

-- Privileges restated for the record. CREATE OR REPLACE preserves them, so these
-- are assertions of intent rather than changes: if the deployed ACL ever drifts,
-- re-running this migration restores it.
revoke all on function public.workflow_append_transition(uuid, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.workflow_append_transition(uuid, text, text, text, text, uuid, uuid)
  to service_role;
