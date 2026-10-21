-- Project channel intentions only. No account/credential/publisher authority is granted.
create table public.social_launch_plans (
 project_id uuid primary key references public.projects(id) on delete restrict,
 created_by uuid not null references auth.users(id) on delete restrict,
 current_revision_id uuid,
 created_at timestamptz not null default now()
);
create table public.social_launch_plan_revisions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.social_launch_plans(project_id) on delete restrict,
 sequence integer not null check(sequence>0),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 choices jsonb not null check(jsonb_typeof(choices)='array' and jsonb_array_length(choices)<=6),
 conversation_id uuid references public.conversations(id) on delete restrict,
 expected_revision_id uuid references public.social_launch_plan_revisions(id) on delete restrict,
 idempotency_key text not null check(idempotency_key ~ '^[A-Za-z0-9_-]{1,100}$'),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(project_id,sequence),unique(project_id,idempotency_key),unique(project_id,id),unique(project_id,id,sha256)
);
alter table public.social_launch_plans add constraint social_launch_current_revision
 foreign key(project_id,current_revision_id) references public.social_launch_plan_revisions(project_id,id) on delete restrict;
create table public.social_launch_plan_decisions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.social_launch_plans(project_id) on delete restrict,
 revision_id uuid not null,
 sha256 text not null,
 decision text not null check(decision in ('approve','reject')),
 idempotency_key text not null check(idempotency_key ~ '^[A-Za-z0-9_-]{1,100}$'),
 decided_by uuid not null references auth.users(id) on delete restrict,
 decided_at timestamptz not null default now(),
 foreign key(project_id,revision_id,sha256) references public.social_launch_plan_revisions(project_id,id,sha256) on delete restrict,
 unique(project_id,revision_id),unique(project_id,idempotency_key)
);
alter table public.social_launch_plans enable row level security;
alter table public.social_launch_plan_revisions enable row level security;
alter table public.social_launch_plan_decisions enable row level security;
revoke all on public.social_launch_plans,public.social_launch_plan_revisions,public.social_launch_plan_decisions from public,anon,authenticated,service_role;
grant select,insert,update on public.social_launch_plans to service_role;
grant select,insert on public.social_launch_plan_revisions,public.social_launch_plan_decisions to service_role;

create function public.social_launch_immutable() returns trigger language plpgsql security invoker set search_path='' as $fn$
begin raise exception 'SOCIAL_LAUNCH_IMMUTABLE' using errcode='42501'; end
$fn$;
create trigger social_launch_revisions_immutable before update or delete on public.social_launch_plan_revisions for each row execute function public.social_launch_immutable();
create trigger social_launch_decisions_immutable before update or delete on public.social_launch_plan_decisions for each row execute function public.social_launch_immutable();
create trigger social_launch_revisions_no_truncate before truncate on public.social_launch_plan_revisions for each statement execute function public.social_launch_immutable();
create trigger social_launch_decisions_no_truncate before truncate on public.social_launch_plan_decisions for each statement execute function public.social_launch_immutable();

create function public.social_launch_assert_owner(p_principal jsonb,p_input jsonb) returns void language plpgsql security invoker set search_path='' as $fn$
begin
 if jsonb_typeof(p_principal) is distinct from 'object' or jsonb_typeof(p_principal->'allowedProjectIds') is distinct from 'array'
  or not coalesce((p_principal->'allowedProjectIds') ? (p_input->>'projectId'),false)
  or not exists(select 1 from public.projects p where p.id=(p_input->>'projectId')::uuid and p.owner_id=(p_principal->>'userId')::uuid)
 then raise exception 'SOCIAL_LAUNCH_NOT_FOUND' using errcode='P0002'; end if;
 if p_input->>'conversationId' is not null and not exists(select 1 from public.conversations c where c.id=(p_input->>'conversationId')::uuid and c.user_id=(p_principal->>'userId')::uuid and c.project_id=(p_input->>'projectId')::uuid)
 then raise exception 'SOCIAL_LAUNCH_NOT_FOUND' using errcode='P0002'; end if;
end
$fn$;
create function public.social_launch_validate_choices(p_choices jsonb) returns void language plpgsql security invoker set search_path='' as $fn$
declare item jsonb; seen text[]='{}'; channel text; format text;
begin
 if jsonb_typeof(p_choices) is distinct from 'array' or jsonb_array_length(p_choices)>6 then raise exception 'SOCIAL_LAUNCH_INVALID'; end if;
 for item in select value from jsonb_array_elements(p_choices) loop
  if jsonb_typeof(item) is distinct from 'object' then raise exception 'SOCIAL_LAUNCH_INVALID'; end if;
  channel=item->>'channel';format=item->>'format';
  if (select count(*) from jsonb_object_keys(item))<>4
   or exists(select 1 from jsonb_object_keys(item) k where k not in ('channel','purpose','format','cadence'))
   or channel is null or channel not in ('youtube','facebook','instagram','linkedin','x','pinterest') or channel=any(seen)
   or jsonb_typeof(item->'purpose') is distinct from 'string' or char_length(btrim(item->>'purpose')) not between 1 and 500 or item->>'purpose' ~ '[[:cntrl:]]'
   or format is null or format not in ('text','image','video','link')
   or channel='youtube' and format<>'video' or channel in ('instagram','pinterest') and format not in ('image','video')
   or item->>'cadence' is null or item->>'cadence' not in ('manual','weekly','twice_weekly','daily')
  then raise exception 'SOCIAL_LAUNCH_INVALID'; end if;
  seen=array_append(seen,channel);
 end loop;
end
$fn$;
create function public.social_launch_plan_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project public.projects; revision public.social_launch_plan_revisions; decision public.social_launch_plan_decisions;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 select * into project from public.projects where id=(p_input->>'projectId')::uuid;
 select r.* into revision from public.social_launch_plan_revisions r join public.social_launch_plans p on p.project_id=r.project_id and p.current_revision_id=r.id where p.project_id=project.id;
 if revision.id is not null then select * into decision from public.social_launch_plan_decisions where project_id=project.id and revision_id=revision.id; end if;
 return jsonb_build_object('project',jsonb_build_object('id',project.id,'name',project.name,'slug',project.slug),
  'workspaceUrl','/projects/'||project.slug||'/social',
  'currentRevision',case when revision.id is null then null else jsonb_build_object('id',revision.id,'sequence',revision.sequence,'sha256',revision.sha256,'choices',revision.choices,'createdAt',revision.created_at) end,
  'decision',case when decision.id is null then null else jsonb_build_object('id',decision.id,'revisionId',decision.revision_id,'sha256',decision.sha256,'decision',decision.decision,'decidedAt',decision.decided_at) end);
end
$fn$;

create function public.social_launch_plan_save(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid; actor uuid=(p_principal->>'userId')::uuid; current_id uuid; previous public.social_launch_plan_revisions; new_id uuid; next_sequence integer;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if jsonb_typeof(p_input) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','conversationId','expectedRevisionId','idempotencyKey','choices'))
  or not(p_input ? 'expectedRevisionId') or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$'
 then raise exception 'SOCIAL_LAUNCH_INVALID'; end if;
 perform public.social_launch_validate_choices(p_input->'choices');
 -- The project row serializes first creation too; no unprotected empty-root race.
 perform 1 from public.projects where id=project for update;
 perform public.social_launch_assert_owner(p_principal,p_input);
 insert into public.social_launch_plans(project_id,created_by) values(project,actor) on conflict(project_id) do nothing;
 select current_revision_id into current_id from public.social_launch_plans where project_id=project for update;
 select * into previous from public.social_launch_plan_revisions where project_id=project and idempotency_key=p_input->>'idempotencyKey';
 if previous.id is not null then
  if previous.choices is distinct from p_input->'choices' or previous.expected_revision_id is distinct from (p_input->>'expectedRevisionId')::uuid
   or previous.conversation_id is distinct from (p_input->>'conversationId')::uuid or previous.created_by<>actor
  then raise exception 'SOCIAL_LAUNCH_CONFLICT'; end if;
  return public.social_launch_plan_read(p_principal,p_input);
 end if;
 if current_id is distinct from (p_input->>'expectedRevisionId')::uuid then raise exception 'SOCIAL_LAUNCH_CONFLICT'; end if;
 select coalesce(max(sequence),0)+1 into next_sequence from public.social_launch_plan_revisions where project_id=project;
 insert into public.social_launch_plan_revisions(project_id,sequence,sha256,choices,conversation_id,expected_revision_id,idempotency_key,created_by)
 values(project,next_sequence,encode(sha256(convert_to((p_input->'choices')::text,'UTF8')),'hex'),p_input->'choices',(p_input->>'conversationId')::uuid,current_id,p_input->>'idempotencyKey',actor)
 returning id into new_id;
 update public.social_launch_plans set current_revision_id=new_id where project_id=project;
 return public.social_launch_plan_read(p_principal,p_input);
end
$fn$;

create function public.social_launch_plan_decide(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid; actor uuid=(p_principal->>'userId')::uuid; current_id uuid; revision public.social_launch_plan_revisions; previous public.social_launch_plan_decisions;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','revisionId','sha256','decision','idempotencyKey'))
  or coalesce(p_input->>'decision','') not in ('approve','reject') or coalesce(p_input->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$'
 then raise exception 'SOCIAL_LAUNCH_INVALID'; end if;
 perform 1 from public.projects where id=project for update;
 perform public.social_launch_assert_owner(p_principal,p_input);
 select current_revision_id into current_id from public.social_launch_plans where project_id=project for update;
 select * into previous from public.social_launch_plan_decisions where project_id=project and idempotency_key=p_input->>'idempotencyKey';
 if previous.id is not null then
  if previous.revision_id is distinct from (p_input->>'revisionId')::uuid or previous.sha256 is distinct from p_input->>'sha256' or previous.decision is distinct from p_input->>'decision' or previous.decided_by<>actor
  then raise exception 'SOCIAL_LAUNCH_CONFLICT'; end if;
  return public.social_launch_plan_read(p_principal,p_input);
 end if;
 if current_id is null or current_id is distinct from (p_input->>'revisionId')::uuid then raise exception 'SOCIAL_LAUNCH_CONFLICT'; end if;
 select * into revision from public.social_launch_plan_revisions where id=current_id and project_id=project;
 if revision.sha256 is distinct from p_input->>'sha256' then raise exception 'SOCIAL_LAUNCH_CONFLICT'; end if;
 select * into previous from public.social_launch_plan_decisions where project_id=project and revision_id=current_id;
 if previous.id is not null then
  if previous.decision is distinct from p_input->>'decision' or previous.decided_by<>actor then raise exception 'SOCIAL_LAUNCH_CONFLICT'; end if;
 else
  insert into public.social_launch_plan_decisions(project_id,revision_id,sha256,decision,idempotency_key,decided_by)
   values(project,current_id,revision.sha256,p_input->>'decision',p_input->>'idempotencyKey',actor);
 end if;
 return public.social_launch_plan_read(p_principal,p_input);
end
$fn$;
revoke all on function public.social_launch_immutable(),public.social_launch_assert_owner(jsonb,jsonb),public.social_launch_validate_choices(jsonb),public.social_launch_plan_read(jsonb,jsonb),public.social_launch_plan_save(jsonb,jsonb),public.social_launch_plan_decide(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.social_launch_immutable(),public.social_launch_assert_owner(jsonb,jsonb),public.social_launch_validate_choices(jsonb),public.social_launch_plan_read(jsonb,jsonb),public.social_launch_plan_save(jsonb,jsonb),public.social_launch_plan_decide(jsonb,jsonb) to service_role;
comment on table public.social_launch_plans is 'Owned channel intentions. Separate from verified account connections and publication authority.';
comment on table public.social_launch_plan_revisions is 'Immutable, content-hashed channel proposals. No credentials or executable content.';
comment on table public.social_launch_plan_decisions is 'Immutable operator decisions bound to exact channel-plan revision and SHA256. Grants no publishing or spend authority.';
