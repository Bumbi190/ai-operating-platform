-- Individually human-approved story execution. No unattended licence is issued
-- or widened. Proposal creation is service-only; approval derives auth.uid().
create table public.workflow_human_story_requests (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id),
 instance_id uuid not null references public.workflow_instances(id),
 requested_by uuid not null references auth.users(id),
 request_key uuid not null,
 authorization_id uuid not null unique,
 request_event_id uuid not null unique references public.atlas_authorizations(event_id),
 def_hash text not null check(def_hash ~ '^[a-f0-9]{64}$'),
 action_target_hash text not null check(action_target_hash ~ '^[a-f0-9]{64}$'),
 brief_hash text not null check(brief_hash ~ '^[a-f0-9]{64}$'),
 prompt_hash text not null check(prompt_hash ~ '^[a-f0-9]{64}$'),
 provider text not null check(provider='anthropic'),
 model text not null check(model='claude-sonnet-4-6'),
 max_tokens integer not null check(max_tokens=4096),
 maximum_sek numeric(12,4) not null check(maximum_sek>0 and maximum_sek<=1000),
 target_version_hash text not null check(target_version_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null, expires_at timestamptz not null,
 check(expires_at>created_at and expires_at<=created_at+interval '15 minutes'),
 unique(requested_by,request_key)
);
create table public.workflow_human_story_approvals (
 request_id uuid primary key references public.workflow_human_story_requests(id),
 run_id uuid not null unique references public.runs(id),
 grant_event_id uuid not null unique references public.atlas_authorizations(event_id),
 human_principal uuid not null references auth.users(id),
 profile text not null default 'owner_story_once_v1' check(profile='owner_story_once_v1'),
 approved_at timestamptz not null,
 survival_anchor timestamptz not null,
 survival_epoch_vector bigint[] not null check(array_length(survival_epoch_vector,1)=8),
 survival_proof text not null,
 authority_valid_until timestamptz not null
);
alter table public.runs add column human_story_request_id uuid references public.workflow_human_story_requests(id);
create unique index runs_human_story_once on public.runs(human_story_request_id) where human_story_request_id is not null;

alter table public.workflow_human_story_requests enable row level security;
alter table public.workflow_human_story_approvals enable row level security;
revoke all on public.workflow_human_story_requests, public.workflow_human_story_approvals from public,anon,authenticated,service_role;
grant select on public.workflow_human_story_requests, public.workflow_human_story_approvals to service_role;
-- Session reads go through the scoped server API; no client DML, including service-role DML.

create function public.human_story_immutable() returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'human story approval records are immutable' using errcode='23000'; end $$;
create trigger human_story_request_immutable before update or delete on public.workflow_human_story_requests for each row execute function public.human_story_immutable();
create trigger human_story_request_no_truncate before truncate on public.workflow_human_story_requests for each statement execute function public.human_story_immutable();
create trigger human_story_approval_immutable before update or delete on public.workflow_human_story_approvals for each row execute function public.human_story_immutable();
create trigger human_story_approval_no_truncate before truncate on public.workflow_human_story_approvals for each statement execute function public.human_story_immutable();
revoke all on function public.human_story_immutable() from public,anon,authenticated,service_role;

-- Canonical JSON used only with the closed ASCII-keyed scalar payloads below.
create function public.human_story_canonical(p_value jsonb) returns text language sql immutable set search_path='' as $$
 select case jsonb_typeof(p_value) when 'object' then
  '{'||(select string_agg(to_jsonb(e.key)::text||':'||public.human_story_canonical(e.value),',' order by e.key collate "C") from jsonb_each(p_value) e)||'}'
 else p_value::text end
$$;
create function public.human_story_hash(p_value jsonb) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(public.human_story_canonical(p_value),'UTF8')),'hex')
$$;
revoke all on function public.human_story_canonical(jsonb),public.human_story_hash(jsonb) from public,anon,authenticated,service_role;

create function public.prepare_human_story_request(
 p_instance_id uuid,p_requested_by uuid,p_request_key uuid,p_action_target_hash text,
 p_brief_hash text,p_prompt_hash text,p_maximum_sek numeric
) returns setof public.workflow_human_story_requests
language plpgsql security definer set search_path='' as $$
declare i public.workflow_instances; j public.workflow_human_story_requests; a uuid:=gen_random_uuid();
 rid uuid:=gen_random_uuid(); ev uuid; v_now timestamptz:=clock_timestamp(); v_target text; v_exec_hash text;
begin
 if p_instance_id is null or p_requested_by is null or p_request_key is null
  or p_action_target_hash is null or p_action_target_hash !~ '^[a-f0-9]{64}$'
  or p_brief_hash is null or p_brief_hash !~ '^[a-f0-9]{64}$'
  or p_prompt_hash is null or p_prompt_hash !~ '^[a-f0-9]{64}$'
  or p_maximum_sek is null or p_maximum_sek<=0 or p_maximum_sek>1000 or p_maximum_sek<>round(p_maximum_sek,4)
 then raise exception 'invalid story scope' using errcode='22023'; end if;
 select * into i from public.workflow_instances where id=p_instance_id for update;
 if not found or not exists(select 1 from public.projects where id=i.project_id and owner_id=p_requested_by)
 then raise exception 'story not found' using errcode='P0002'; end if;
 select * into j from public.workflow_human_story_requests where requested_by=p_requested_by and request_key=p_request_key;
 if found then
  if j.instance_id<>i.id then raise exception 'request key already used' using errcode='22023'; end if;
  return next j; return;
 end if;
 if i.def_key<>'familje-stunden.monthly-release' or i.def_version<>2 or i.current_state<>'content_generation' or i.status<>'active'
 then raise exception 'unsupported story placement' using errcode='22023'; end if;
 v_target:=public.human_story_hash(jsonb_build_object('kind','workflow.human_story_scope','action_target_hash',p_action_target_hash,
  'brief_hash',p_brief_hash,'prompt_hash',p_prompt_hash,'provider','anthropic','model','claude-sonnet-4-6','max_tokens',4096,
  'maximum_sek',to_char(p_maximum_sek,'FM999999990.0000')));
 v_exec_hash:=public.human_story_hash(jsonb_build_object('kind','workflow.action.execute','schema',1,'instance_id',i.id::text,
  'def_key',i.def_key,'def_version',i.def_version,'def_hash',i.def_hash,'state',i.current_state,
  'action_kind','generate_monthly_story','action_class','FINANCIAL','target_version_hash',v_target,'attempt_group',rid::text));
 insert into public.atlas_authorizations(authorization_id,event_type,occurred_at,project_id,principal_id,authority_basis,
  action_kind,authority_description,target_type,target_id,target_version_hash,conditions,evidence)
 values(a,'requested',v_now,i.project_id,p_requested_by,'founder_owner','workflow.action.execute','One human-approved monthly story',
  'workflow_execution',i.id::text||':content_generation:generate_monthly_story:'||rid::text,v_exec_hash,'[]','[]') returning event_id into ev;
 insert into public.workflow_human_story_requests(id,project_id,instance_id,requested_by,request_key,authorization_id,request_event_id,
  def_hash,action_target_hash,brief_hash,prompt_hash,provider,model,max_tokens,maximum_sek,target_version_hash,created_at,expires_at)
 values(rid,i.project_id,i.id,p_requested_by,p_request_key,a,ev,i.def_hash,p_action_target_hash,p_brief_hash,p_prompt_hash,
  'anthropic','claude-sonnet-4-6',4096,p_maximum_sek,v_target,v_now,v_now+interval '15 minutes') returning * into j;
 return next j;
end $$;
revoke all on function public.prepare_human_story_request(uuid,uuid,uuid,text,text,text,numeric) from public,anon,authenticated,service_role;
grant execute on function public.prepare_human_story_request(uuid,uuid,uuid,text,text,text,numeric) to service_role;

create function public.runs_human_story_binding_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.human_story_request_id is distinct from old.human_story_request_id then raise exception 'human story binding immutable' using errcode='23000'; end if;
  if new.human_story_request_id is not null and (new.max_attempts<>1 or new.policy_class<>'approval_required') then raise exception 'human story remains one approved attempt' using errcode='23000'; end if;
 elsif new.human_story_request_id is not null then
  if not exists(select 1 from public.workflow_human_story_requests j where j.id=new.human_story_request_id
    and new.workflow_instance_id=j.instance_id and new.project_id=j.project_id and new.workflow_def_hash=j.def_hash
    and new.workflow_from_state='content_generation' and new.action_kind='generate_monthly_story' and new.action_class='FINANCIAL'
    and new.target_version_hash=j.target_version_hash and new.authorization_id=j.authorization_id
    and new.attempt_group=j.id and new.max_attempts=1 and new.policy_class='approval_required'
    and new.idempotency_key=public.human_story_hash(jsonb_build_object('workflow_instance_id',j.instance_id::text,'def_hash',j.def_hash,
     'workflow_from_state','content_generation','action_kind','generate_monthly_story','target_version_hash',j.target_version_hash,'attempt_group',j.id::text)))
  then raise exception 'human story run does not match approved request' using errcode='23000'; end if;
 end if;
 return new;
end $$;
create trigger runs_human_story_binding_guard before insert or update on public.runs for each row execute function public.runs_human_story_binding_guard();
revoke all on function public.runs_human_story_binding_guard() from public,anon,authenticated,service_role;

-- A bound run still needs atomic provenance. The added alternative proves a
-- distinct human grant; it does not fabricate an autonomy decision.
create or replace function public.runs_require_bind_provenance() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.run_autonomy_decisions d where d.run_id=new.id and d.boundary='bind')
  and not exists(select 1 from public.workflow_human_story_approvals h
   join public.workflow_human_story_requests j on j.id=h.request_id
   join public.atlas_authorizations g on g.event_id=h.grant_event_id
   where h.run_id=new.id and j.id=new.human_story_request_id and j.authorization_id=new.authorization_id
    and g.authorization_id=j.authorization_id and g.event_type='granted' and g.principal_id=h.human_principal
    and g.project_id=j.project_id and g.action_kind='workflow.action.execute' and g.target_type='workflow_execution'
    and g.target_version_hash=(select r.target_version_hash from public.atlas_authorizations r where r.event_id=j.request_event_id))
 then raise exception 'bound run has no valid atomic provenance' using errcode='23000'; end if;
 return null;
end $$;
revoke all on function public.runs_require_bind_provenance() from public,anon,authenticated,service_role;

create function public.approve_and_start_human_story(p_request_id uuid,p_reviewed_hash text,p_current_action_hash text)
returns table(run_id uuid,request_id uuid,replayed boolean)
language plpgsql security definer set search_path='' as $$
declare j public.workflow_human_story_requests; i public.workflow_instances; req public.atlas_authorizations;
 uid uuid:=auth.uid(); role_name text; v_owner uuid; paused boolean; n bigint; v_run uuid; v_grant uuid;
 anchor_time timestamptz; epoch bigint[]; survival record; idem text; v_now timestamptz;
begin
 role_name:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role');
 if uid is null or role_name is distinct from 'authenticated' then raise exception 'authenticated human required' using errcode='42501'; end if;
 if p_request_id is null or p_reviewed_hash is null or p_current_action_hash is null then raise exception 'review required' using errcode='22023'; end if;
 select * into j from public.workflow_human_story_requests where id=p_request_id;
 if not found then raise exception 'story request not found' using errcode='P0002'; end if;
 -- Shared lock order with workflow/authorization/Survival writers.
 select a.anchor,a.epoch_vector into anchor_time,epoch from public.survival_observation_anchor() a;
 select * into i from public.workflow_instances where id=j.instance_id for update;
 perform 1 from public.workflow_human_story_requests where id=j.id for update;
 select owner_id,execution_paused into v_owner,paused from public.projects where id=j.project_id for share;
 if v_owner is distinct from uid or j.requested_by<>uid or i.project_id<>j.project_id then raise exception 'story request not found' using errcode='P0002'; end if;
 if p_reviewed_hash<>j.target_version_hash then raise exception 'review changed' using errcode='22023'; end if;
 select h.run_id into v_run from public.workflow_human_story_approvals h where h.request_id=j.id;
 if found then return query select v_run,j.id,true; return; end if;
 if i.def_key<>'familje-stunden.monthly-release' or i.def_version<>2 or i.def_hash<>j.def_hash
  or i.current_state<>'content_generation' or i.status<>'active' or paused is distinct from false
  or p_current_action_hash<>j.action_target_hash then raise exception 'story inputs changed or paused' using errcode='22023'; end if;
 if exists(select 1 from public.runs r where r.workflow_instance_id=i.id and r.action_kind='generate_monthly_story'
   and (r.status in ('pending','running') or r.reconciliation_required is true))
 then raise exception 'story already active or requires reconciliation' using errcode='55000'; end if;
 perform 1 from public.atlas_authorization_heads where authorization_id=j.authorization_id for update;
 select count(*) into n from public.atlas_authorizations where authorization_id=j.authorization_id;
 select * into req from public.atlas_authorizations where event_id=j.request_event_id;
 v_now:=clock_timestamp();
 if n<>1 or req.event_type<>'requested' or req.authorization_id<>j.authorization_id or req.principal_id<>uid
  or req.project_id<>j.project_id or req.action_kind<>'workflow.action.execute' or req.target_type<>'workflow_execution'
  or req.target_id<>i.id::text||':content_generation:generate_monthly_story:'||j.id::text
  or v_now>=j.expires_at then raise exception 'request expired or already decided' using errcode='55000'; end if;
 select * into survival from public.licensed_bind_v1_survival_proof(anchor_time);
 if survival.admissible is not true then raise exception 'Survival headroom not proven' using errcode='LB010'; end if;
 insert into public.atlas_authorizations(authorization_id,event_type,occurred_at,project_id,principal_id,authority_basis,
  action_kind,authority_description,target_type,target_id,target_version_hash,conditions,evidence,expires_at)
 values(j.authorization_id,'granted',v_now,j.project_id,uid,'founder_owner',req.action_kind,req.authority_description,
  req.target_type,req.target_id,req.target_version_hash,'[]','[]',j.expires_at) returning event_id into v_grant;
 idem:=public.human_story_hash(jsonb_build_object('workflow_instance_id',i.id::text,'def_hash',i.def_hash,'workflow_from_state',i.current_state,
  'action_kind','generate_monthly_story','target_version_hash',j.target_version_hash,'attempt_group',j.id::text));
 insert into public.runs(project_id,status,kind,input,context,max_attempts,policy_class,workflow_instance_id,workflow_def_hash,workflow_from_state,
  action_kind,action_class,target_version_hash,authorization_id,idempotency_key,attempt_group,authorized_at,human_story_request_id)
 values(j.project_id,'pending','workflow.action:generate_monthly_story','{}','{}',1,'approval_required',i.id,i.def_hash,i.current_state,
  'generate_monthly_story','FINANCIAL',j.target_version_hash,j.authorization_id,idem,j.id,v_now,j.id) returning id into v_run;
 insert into public.workflow_human_story_approvals(request_id,run_id,grant_event_id,human_principal,approved_at,
  survival_anchor,survival_epoch_vector,survival_proof,authority_valid_until)
 values(j.id,v_run,v_grant,uid,v_now,anchor_time,epoch,survival.reason,j.expires_at);
 -- Reuse the commit-time deadline primitive, not licence semantics. It also
 -- prevents later authorization writes in this same transaction.
 perform public.licensed_bind_register_authority_deadline(j.expires_at);
 perform public.survival_commit_fence(epoch,anchor_time);
 return query select v_run,j.id,false;
end $$;
revoke all on function public.approve_and_start_human_story(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.approve_and_start_human_story(uuid,text,text) to authenticated;
