-- ISOLATED REVIEW CANDIDATE. Original workflow functions with revision-first lock.
-- Do not deploy. Only models two writers; many other writers still bypass this lock.

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
declare i public.workflow_instances; prev timestamptz; lock_project uuid; lock_owner uuid;
begin
  -- Acquiring source revision BEFORE locking the workflow row avoids lock inversion.
  select wi.project_id into lock_project from public.workflow_instances wi where wi.id=p_instance_id;
  if not found then raise exception 'UNKNOWN_WORKFLOW' using errcode='23503'; end if;
  select p.owner_id into lock_owner from public.projects p where p.id=lock_project;
  if lock_owner is null then raise exception 'UNKNOWN_PROJECT_OWNER' using errcode='23514'; end if;
  perform 1 from public.calendar_source_revision_probe r
  where r.owner_user_id=lock_owner and r.project_id=lock_project for update;
  if not found then raise exception 'MISSING_SOURCE_REVISION' using errcode='23514'; end if;
  select * into i from public.workflow_instances where id = p_instance_id for update;
  if found and i.project_id is distinct from lock_project then raise exception 'WORKFLOW_MOVED' using errcode='23514'; end if;
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
declare i public.workflow_instances; prev timestamptz; lock_project uuid; lock_owner uuid;
begin
  -- Acquiring source revision BEFORE locking the workflow row avoids lock inversion.
  select wi.project_id into lock_project from public.workflow_instances wi where wi.id=p_instance_id;
  if not found then raise exception 'UNKNOWN_WORKFLOW' using errcode='23503'; end if;
  select p.owner_id into lock_owner from public.projects p where p.id=lock_project;
  if lock_owner is null then raise exception 'UNKNOWN_PROJECT_OWNER' using errcode='23514'; end if;
  perform 1 from public.calendar_source_revision_probe r
  where r.owner_user_id=lock_owner and r.project_id=lock_project for update;
  if not found then raise exception 'MISSING_SOURCE_REVISION' using errcode='23514'; end if;
  select * into i from public.workflow_instances where id = p_instance_id for update;
  if found and i.project_id is distinct from lock_project then raise exception 'WORKFLOW_MOVED' using errcode='23514'; end if;
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
