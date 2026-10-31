-- PROPOSED / UNAPPLIED. Queue Familje-Stunden editorial draft preparation
-- in the EXISTING Omnira public.runs / claim_runs / runs-drain workflow.
-- This code does not install any cron, external action, model, notification
-- delivery, publication job, owner grant or feature flag.
--
-- Crucial production compatibility:
-- runs_action_binding_complete makes idempotency_key NULL on unbound runs.
-- runs_idempotency_key_sha256 permits only 64-char hex on bound action runs.
-- We therefore MUST NOT create a readable 'family_weekly_drafts:YYYYMMDD'
-- runs.idempotency_key. A separate permanent UNIQUE(project_id,week_start)
-- ledger is the authority that survives job status changes and reapers.

create table public.family_weekly_run_plans (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 owner_id uuid not null references auth.users(id) on delete restrict,
 week_start date not null,
 consent_event_id bigint not null references public.family_weekly_auto_consent_events(event_id) on delete restrict,
 conversation_id uuid not null references public.conversations(id) on delete restrict,
 run_id uuid not null unique references public.runs(id) on delete restrict,
 state text not null default 'queued_for_review_drafts' check(state='queued_for_review_drafts'),
 can_schedule boolean not null default false check(can_schedule=false),
 can_publish boolean not null default false check(can_publish=false),
 queued_at timestamptz not null default clock_timestamp(),
 constraint family_weekly_run_plans_one_per_week unique(project_id,week_start),
 constraint family_weekly_run_plans_project_only check(
   project_id='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid
 ),
 constraint family_weekly_run_plans_start check(week_start>='2027-01-04'::date),
 constraint family_weekly_run_plans_monday check(extract(isodow from week_start)=1)
);
alter table public.family_weekly_run_plans enable row level security;
revoke all on public.family_weekly_run_plans from public,anon,authenticated,service_role;
grant select,insert on public.family_weekly_run_plans to service_role;
create index family_weekly_run_plans_owner_idx
 on public.family_weekly_run_plans(owner_id,week_start desc);

-- Additional verification even if a service-role endpoint is compromised:
-- the plan cannot reference an unrelated workflow or a fake owner/claim.
create function public.family_weekly_run_plan_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then
  raise exception 'FAMILY_WEEKLY_RUN_PLAN_IMMUTABLE' using errcode='42501';
 end if;
 if not exists(
  select 1 from public.runs r
   join public.projects p on p.id=r.project_id
   join public.conversations c on c.id=new.conversation_id
   join public.family_weekly_auto_consent_events e
     on e.event_id=new.consent_event_id
  where r.id=new.run_id and r.project_id=new.project_id
    and p.id=new.project_id and p.owner_id=new.owner_id
    and p.execution_paused=false
    and not exists(select 1 from public.project_lifecycle l
      where l.project_id=p.id and l.state<>'active')
    and not exists(select 1 from public.platform_config cfg
      where cfg.automation_paused)
    and c.user_id=new.owner_id and c.project_id=new.project_id
    and e.project_id=new.project_id and e.owner_id=new.owner_id
    and e.action='enable' and e.valid_until>clock_timestamp()
    and r.kind='family_weekly_editorial_drafts'
    and r.status='pending' and r.max_attempts=1 and r.attempts=0
    and r.workflow_id is null and r.idempotency_key is null
    and r.workflow_instance_id is null
    and r.input->>'ownerId'=new.owner_id::text
    and r.input->>'conversationId'=new.conversation_id::text
    and r.input->>'weekStart'=new.week_start::text
    and r.input->>'eventId'=new.consent_event_id::text
    and r.input->>'source'='family_weekly_sunday_v1'
 ) then
  raise exception 'FAMILY_WEEKLY_RUN_PLAN_UNVERIFIED' using errcode='42501';
 end if;
 new.queued_at:=clock_timestamp();
 return new;
end $$;
create trigger family_weekly_run_plan_insert
 before insert on public.family_weekly_run_plans
 for each row execute function public.family_weekly_run_plan_guard();
create trigger family_weekly_run_plan_immutable
 before update or delete on public.family_weekly_run_plans
 for each row execute function public.family_weekly_run_plan_guard();
revoke all on function public.family_weekly_run_plan_guard()
 from public,anon,authenticated;

-- Bearer-authenticated future cron may ONLY call this service-role RPC
-- with NO arguments. The function derives real owner/conversation/consent
-- from the database, and serializes with the separate owner-revoke trigger
-- and the paid-admission/save RPCs under the same project advisory lock.
create function public.family_weekly_enqueue_once()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_project constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid;
 v_owner uuid;
 v_conversation uuid;
 v_event bigint;
 v_local timestamp;
 v_week date;
 v_run uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('family-weekly:'||v_project::text,0)
 );
 v_local:=clock_timestamp() at time zone 'Europe/Stockholm';
 if v_local::date<'2027-01-03'::date
  or extract(isodow from v_local)<>7
  or extract(hour from v_local)<>15 then
  return jsonb_build_object('status','not_due');
 end if;
 v_week:=v_local::date+1;
 select p.owner_id into v_owner from public.projects p
  where p.id=v_project and p.execution_paused=false
    and not exists(select 1 from public.project_lifecycle l
      where l.project_id=p.id and l.state<>'active')
    and not exists(select 1 from public.platform_config cfg
      where cfg.automation_paused);
 if v_owner is null then return jsonb_build_object('status','blocked');end if;
 if exists(select 1 from public.family_weekly_run_plans
   where project_id=v_project and week_start=v_week) or
    exists(select 1 from public.social_weekly_preparations
   where project_id=v_project and week_start=v_week) then
  return jsonb_build_object('status','already_queued');
 end if;
 select e.event_id into v_event
  from public.family_weekly_auto_consent_events e
  where e.project_id=v_project and e.owner_id=v_owner
  order by e.event_id desc limit 1;
 if v_event is null or not exists(
  select 1 from public.family_weekly_auto_consent_events e
  where e.event_id=v_event and e.action='enable' and e.valid_until>clock_timestamp()
 ) then return jsonb_build_object('status','blocked');end if;
 select c.id into v_conversation
  from public.conversations c
  where c.user_id=v_owner and c.project_id=v_project
  order by c.created_at desc nulls last,c.id desc limit 1;
 if v_conversation is null then return jsonb_build_object('status','blocked');end if;

 -- IMPORTANT: runs.idempotency_key MUST remain NULL for legacy/unbound
 -- runs. The family_weekly_run_plans UNIQUE constraint is our durable fence.
 insert into public.runs(
  project_id,workflow_id,kind,status,input,context,
  attempts,max_attempts,idempotency_key
 ) values(
  v_project,null,'family_weekly_editorial_drafts','pending',
  jsonb_build_object(
   'ownerId',v_owner,'conversationId',v_conversation,'weekStart',v_week,
   'eventId',v_event,'source','family_weekly_sunday_v1'),
  jsonb_build_object('source','family_weekly_sunday_v1','reviewOnly',true),
  0,1,null
 ) returning id into v_run;

 insert into public.family_weekly_run_plans(
  project_id,owner_id,week_start,consent_event_id,conversation_id,run_id
 ) values(v_project,v_owner,v_week,v_event,v_conversation,v_run);

 return jsonb_build_object(
  'status','queued','projectId',v_project,'weekStart',v_week,
  'runId',v_run,'publicationAuthority',false
 );
end $$;
revoke all on function public.family_weekly_enqueue_once()
 from public,anon,authenticated;
grant execute on function public.family_weekly_enqueue_once()
 to service_role;

-- NO pg_cron scheduling here. The future protected route must remain
-- disabled by default and be reviewed independently of the content/publish
-- scheduler. A queued review-only run is not a social publication approval.
