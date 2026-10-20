-- ISOLATED REVIEW CANDIDATE. Original workflow_record_tick function with revision-first lock.
-- Never deploy: claim_due and other wake_at writers still bypass the common lock.

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
declare i public.workflow_instances; changed boolean; lock_project uuid; lock_owner uuid;
begin
  -- Calendar source revision lock must precede the workflow instance row lock.
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
