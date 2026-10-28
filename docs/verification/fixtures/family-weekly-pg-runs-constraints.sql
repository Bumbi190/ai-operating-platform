\set ON_ERROR_STOP on
-- Disposable PostgreSQL ONLY. Faithful CHECK-constraint *definitions* read
-- from Omnira's live public.runs via pg_get_constraintdef on 2026-10-28.
-- This is NOT a full runs schema replay: parent FKs and triggers are still
-- represented by the narrower synthetic test tables.
alter table public.runs
 add column workflow_def_hash text,
 add column workflow_from_state text,
 add column action_kind text,
 add column action_class text,
 add column target_version_hash text,
 add column authorization_id uuid,
 add column attempt_group uuid,
 add column authorized_at timestamptz;

alter table public.runs drop constraint runs_action_binding_complete;
alter table public.runs add constraint runs_action_binding_complete check (
 (
  workflow_instance_id is null and workflow_def_hash is null
  and workflow_from_state is null and action_kind is null
  and action_class is null and target_version_hash is null
  and authorization_id is null and idempotency_key is null
  and attempt_group is null and authorized_at is null
 ) or (
  workflow_instance_id is not null and workflow_def_hash is not null
  and workflow_from_state is not null and action_kind is not null
  and action_class is not null and target_version_hash is not null
  and idempotency_key is not null and attempt_group is not null
  and authorized_at is not null
  and (action_class='READ_ONLY' or authorization_id is not null)
 )
);
alter table public.runs
 add constraint runs_action_class_vocabulary check (
  action_class is null or action_class = any(array[
   'READ_ONLY','REVERSIBLE_WRITE','MATERIAL_WRITE','FINANCIAL',
   'EXTERNAL_COMMUNICATION','DESTRUCTIVE'
  ])
 ),
 add constraint runs_material_actions_single_attempt check (
  action_class is null or action_class = any(array[
   'READ_ONLY','REVERSIBLE_WRITE'
  ]) or max_attempts=1
 ),
 add constraint runs_unauthorized_action_is_read_only check (
  workflow_instance_id is null or authorization_id is not null
  or action_class='READ_ONLY'
 ),
 add constraint runs_status_check check (
  status=any(array[
   'pending','running','done','failed','awaiting_approval',
   'cancelled','rejected','unknown','partial'
  ])
 );

-- Explicitly reject a fake unbound run carrying hidden action provenance.
do $$
begin
 begin
  update public.runs set action_kind='publish_social_post'
  where id='66666666-6666-4666-8666-666666666666';
  raise exception 'UNBOUND_ACTION_PROVENANCE_ACCEPTED';
 exception when check_violation then null; end;

 begin
  update public.runs set idempotency_key=repeat('a',64)
  where id='66666666-6666-4666-8666-666666666666';
  raise exception 'UNBOUND_IDEMPOTENCY_KEY_ACCEPTED';
 exception when check_violation then null; end;

 begin
  update public.runs set status='unauthorized'
  where id='66666666-6666-4666-8666-666666666666';
  raise exception 'NONCANONICAL_RUN_STATUS_ACCEPTED';
 exception when check_violation then null; end;

 begin
  insert into public.runs(
   project_id,kind,status,workflow_instance_id,workflow_def_hash,
   workflow_from_state,action_kind,action_class,target_version_hash,
   authorization_id,idempotency_key,attempt_group,authorized_at,max_attempts
  ) values(
   '77cda551-57c9-4dc0-b019-1bb6438777f7','synthetic_material_probe',
   'pending',gen_random_uuid(),repeat('b',64),'ready',
   'probe','FINANCIAL',repeat('c',64),gen_random_uuid(),
   repeat('d',64),gen_random_uuid(),clock_timestamp(),2
  );
  raise exception 'MATERIAL_ACTION_MULTIPLE_ATTEMPTS_ACCEPTED';
 exception when check_violation then null; end;

 if (select count(*) from public.runs)<>1 or
    (select count(*) from public.runs
     where id='66666666-6666-4666-8666-666666666666'
       and action_kind is null and idempotency_key is null
       and status='pending')<>1 then
  raise exception 'CANONICAL_RUN_CHECK_NEGATIVE_TEST_MUTATED_FIXTURE';
 end if;
end $$;
select 'FAMILY_WEEKLY_CANONICAL_RUNS_CHECK_PREDICATES_PASS' as result;
