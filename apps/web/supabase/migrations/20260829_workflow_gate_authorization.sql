-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Workflow gate authorization — the database half of the gate (PR2)
--   ─────────────────────────────────────────────────────────────────
--   PR1 shipped `workflow_transitions.authorization_id` as an unwired seam: the
--   TypeScript machine refused a gated advance without one, but ANY uuid
--   satisfied it and the RPC never looked at the value. This closes that.
--
--   ── WHICH LAYER OWNS WHAT (locked, and deliberately non-overlapping) ─────────
--
--   TypeScript (lib/workflows/authorization.ts + lib/atlas/authorization/derive.ts)
--   owns the CANONICAL derivation: chain grammar and ordering, single-decision
--   and single-close invariants, conditional grants being non-effective, action
--   kind matching, and — the part SQL genuinely cannot do — whether the pinned
--   target_version_hash still equals the hash recomputed from the instance's
--   current definition, state and evidence. Recomputing that here would mean a
--   second canonicalizer inside plpgsql, which is precisely the "two answers
--   waiting to disagree" failure this codebase keeps warning about.
--
--   SQL owns a STRICT SUBSET that needs no derivation, so the two can never
--   contradict each other — SQL only ever refuses things TypeScript would also
--   refuse:
--     • the authorization chain EXISTS (a random uuid dies here)
--     • it is a workflow_gate authorization
--     • its target_id names THIS instance and THIS state
--     • it is scoped to the instance's own project
--     • it carries an unexpired `granted` act
--     • it carries no denial and no closing act
--
--   That is what makes this defence-in-depth rather than duplication. A caller
--   holding the service-role key and bypassing the store cannot advance a gated
--   state with a fabricated uuid, an authorization belonging to another instance
--   or state, a denied or revoked one, or an expired one.
--
--   NOT CHECKED HERE, ON PURPOSE: `granted_with_conditions` is treated as NOT
--   sufficient (only plain `granted` counts), matching derive.ts's §27.348
--   position that conditions are unverifiable in V1.
--
-- ═══════════════════════════════════════════════════════════════════════════════

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
revoke all on function public.workflow_append_transition(uuid, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.workflow_append_transition(uuid, text, text, text, text, uuid, uuid)
  to service_role;

-- The RPC now reads the authority ledger. It is security definer and
-- service_role-only, so this grants no new reach to anon or authenticated.
grant select on public.atlas_authorizations to service_role;
