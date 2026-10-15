-- Atlas studio control plane. Folder requests are not execution capabilities.
begin;
create table public.website_build_studio_intents(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id), project_id uuid not null references public.projects(id),
 conversation_id uuid not null references public.conversations(id),
 intent_key text not null check(intent_key~'^[A-Za-z0-9_-]{1,100}$'), input jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), unique(owner_id,intent_key)
);
create table public.website_build_workspace_requests(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id), project_id uuid not null references public.projects(id),
 intent_key text not null check(intent_key~'^[A-Za-z0-9_-]{1,100}$'),
 generation bigint not null check(generation>0),
 mode text not null check(mode in ('new','existing_git','existing_folder')),
 root jsonb not null, target_id uuid, state text not null default 'pending_runner' check(state='pending_runner'),
 input jsonb not null, created_at timestamptz not null default now(),
 unique(owner_id,intent_key),unique(project_id,generation)
);
create table public.project_lifecycle(
 project_id uuid primary key references public.projects(id), owner_id uuid not null references auth.users(id),
 state text not null default 'active' check(state in ('active','archived','trashed')),
 version bigint not null default 0 check(version>=0),
 intents jsonb not null default '{}', updated_at timestamptz not null default now()
);
create index website_studio_intents_project on public.website_build_studio_intents(project_id);
create index website_workspace_requests_project on public.website_build_workspace_requests(project_id,generation desc);
create index project_lifecycle_owner_state on public.project_lifecycle(owner_id,state);
alter table public.website_build_studio_intents enable row level security;
alter table public.website_build_workspace_requests enable row level security;
alter table public.project_lifecycle enable row level security;
create policy website_studio_intents_owner_read on public.website_build_studio_intents for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy website_workspace_requests_owner_read on public.website_build_workspace_requests for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy project_lifecycle_owner_read on public.project_lifecycle for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
revoke all on public.website_build_studio_intents,public.website_build_workspace_requests,public.project_lifecycle from public,anon,authenticated,service_role;
grant select on public.website_build_studio_intents,public.website_build_workspace_requests,public.project_lifecycle to authenticated,service_role;

-- Studio budget audit (private, append-only; never a fabricated cost event).
create table public.website_build_studio_budget_events(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 project_id uuid not null references public.projects(id), intent_key text not null check(intent_key~'^[A-Za-z0-9_-]{1,100}$'),
 input jsonb not null, previous_monthly_sek numeric, monthly_sek numeric not null check(monthly_sek between 0 and 1000000),
 created_at timestamptz not null default now(),unique(owner_id,intent_key)
);
create index website_studio_budget_project on public.website_build_studio_budget_events(project_id);
alter table public.website_build_studio_budget_events enable row level security;
create policy website_studio_budget_owner_read on public.website_build_studio_budget_events for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
revoke all on public.website_build_studio_budget_events from public,anon,authenticated,service_role;
grant select on public.website_build_studio_budget_events to authenticated,service_role;

-- Only the authenticated server may invoke these RPCs. Narrow definer writes
-- keep table DML unavailable even to service_role; the principal comes from Auth.
create function public.website_build_studio_require_owner(p_principal jsonb,p_project_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(p_principal->>'userId')::uuid;
begin
 if uid is null then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 if p_project_id is not null and (not coalesce(p_principal->'allowedProjectIds' ? p_project_id::text,false) or not exists(select 1 from public.projects where id=p_project_id and owner_id=uid)) then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 return uid;
end $$;
create function public.website_build_studio_require_active(p_project_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project_id for update;
 if not found then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 if exists(select 1 from public.project_lifecycle where project_id=p_project_id and state<>'active') then raise exception 'PROJECT_INACTIVE' using errcode='55000'; end if;
end $$;
create function public.website_build_studio_ensure(p_principal jsonb,p_input jsonb,p_preset jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; pid uuid; aid uuid; cid uuid; slug text; title text;
 key text:=p_input->>'idempotencyKey'; normalized jsonb:=p_input-'idempotencyKey'; old public.website_build_studio_intents;
 result jsonb; base jsonb; location jsonb; folder text;
begin
 uid:=public.website_build_studio_require_owner(p_principal);
 if p_input->>'kind'='new' and not exists(select 1 from public.projects where owner_id=uid and coalesce(p_principal->'allowedProjectIds' ? id::text,false)) then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 if key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' or jsonb_typeof(p_input)<>'object' then raise exception 'INVALID_STUDIO_INPUT' using errcode='22023'; end if;
 if p_input->>'kind'='existing' then
  pid:=(p_input->>'projectId')::uuid;
  perform public.website_build_studio_require_owner(p_principal,pid);
 elsif p_input->>'kind' is distinct from 'new' then raise exception 'INVALID_STUDIO_INPUT' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('atlas-studio:'||uid::text||':'||key,0));
 select * into old from public.website_build_studio_intents where owner_id=uid and intent_key=key;
 if found then
  if old.input is distinct from normalized then raise exception 'STUDIO_KEY_CONFLICT' using errcode='23505'; end if;
  perform public.website_build_studio_require_active(old.project_id);
  if not exists(select 1 from public.projects where id=old.project_id and owner_id=uid) then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
  return old.result;
 end if;
 if p_input->>'kind'='new' then
  title:=btrim(p_input->>'name');
  if title is null or length(title) not between 1 and 120 or p_preset->>'version' is distinct from 'atlas-web-builder-v1' or p_preset->>'model' is distinct from 'claude-sonnet-4-6' or (p_preset->>'maxTokens')::integer is distinct from 6000 then raise exception 'INVALID_STUDIO_INPUT' using errcode='22023'; end if;
  pid:=gen_random_uuid(); aid:=gen_random_uuid(); slug:='webb-'||replace(pid::text,'-','');
  insert into public.projects(id,owner_id,name,slug) values(pid,uid,title,slug);
  insert into public.agents(id,project_id,name,model,system_prompt,config,skill_ids) values(aid,pid,'Webbbyggare (Atlas)',p_preset->>'model',p_preset->>'systemPrompt',jsonb_build_object('max_tokens',6000,'atlas_builder_preset',p_preset-'systemPrompt'),array['design-taste-frontend','impeccable']);
  select default_root into base from public.website_build_operator_settings where owner_id=uid;
  if base is not null then
   folder:=slug;
   location:=base||jsonb_build_object('projectId',pid,'folderName',folder,'root',(base->>'root')||case when base->>'os'='windows' then chr(92) else '/' end||folder,'status','pending_runner');
  end if;
  insert into public.website_build_project_settings(project_id,builder_agent_id,location) values(pid,aid,location);
 else
  perform public.website_build_studio_require_active(pid);
  perform public.website_build_studio_require_owner(p_principal,pid);
  select name,projects.slug into title,slug from public.projects where id=pid and owner_id=uid;
 end if;
 cid:=gen_random_uuid();
 insert into public.conversations(id,user_id,project_id,title) values(cid,uid,pid,'Bygg med Atlas · '||title);
 result:=jsonb_build_object('projectId',pid,'projectSlug',slug,'conversationId',cid);
 insert into public.website_build_studio_intents(owner_id,project_id,conversation_id,intent_key,input,result) values(uid,pid,cid,key,normalized,result);
 return result;
end $$;
create function public.website_build_workspace_request(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; pid uuid:=(p_input->>'projectId')::uuid; key text:=p_input->>'idempotencyKey'; normalized jsonb:=p_input-'idempotencyKey'; row public.website_build_workspace_requests; nextgen bigint;
begin
 uid:=public.website_build_studio_require_owner(p_principal,pid);
 if key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' or p_input->>'mode' is null or p_input->>'mode' not in ('new','existing_git','existing_folder') or jsonb_typeof(p_input->'root') is distinct from 'object' or p_input->'root'->>'os' not in ('windows','macos','linux') or length(p_input->'root'->>'root') not between 1 and 1200 or p_input->'root'->>'targetId' is distinct from p_input->>'targetId' then raise exception 'INVALID_STUDIO_INPUT' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('atlas-workspace:'||uid::text||':'||key,0));
 perform public.website_build_studio_require_active(pid);
 perform public.website_build_studio_require_owner(p_principal,pid);
 select * into row from public.website_build_workspace_requests where owner_id=uid and intent_key=key;
 if found then
  if row.input is distinct from normalized then raise exception 'WORKSPACE_KEY_CONFLICT' using errcode='23505'; end if;
 else
  select coalesce(max(generation),0)+1 into nextgen from public.website_build_workspace_requests where project_id=pid;
  insert into public.website_build_workspace_requests(owner_id,project_id,intent_key,generation,mode,root,target_id,input) values(uid,pid,key,nextgen,p_input->>'mode',p_input->'root',(p_input->>'targetId')::uuid,normalized) returning * into row;
 end if;
 return jsonb_build_object('requestId',row.id,'projectId',row.project_id,'idempotencyKey',row.intent_key,'generation',row.generation,'mode',row.mode,'root',row.root,'targetId',row.target_id,'state','pending_runner','requestedAt',row.created_at);
end $$;
revoke all on function public.website_build_workspace_request(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.website_build_workspace_request(jsonb,jsonb) to service_role;
revoke all on function public.website_build_studio_require_owner(jsonb,uuid),public.website_build_studio_require_active(uuid),public.website_build_studio_ensure(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.website_build_studio_ensure(jsonb,jsonb,jsonb) to service_role;
create function public.website_build_studio_budget_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'STUDIO_BUDGET_EVENT_IMMUTABLE' using errcode='55000'; end $$;
create trigger website_studio_budget_no_rewrite before update or delete on public.website_build_studio_budget_events for each row execute function public.website_build_studio_budget_immutable();
create trigger website_studio_budget_no_truncate before truncate on public.website_build_studio_budget_events for each statement execute function public.website_build_studio_budget_immutable();
create function public.website_build_studio_budget_set(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; pid uuid:=(p_input->>'projectId')::uuid; amount numeric:=(p_input->>'monthlySek')::numeric; expected numeric:=(p_input->>'expectedMonthlySek')::numeric; previous numeric; key text:=p_input->>'idempotencyKey'; normalized jsonb:=p_input-'idempotencyKey'; old public.website_build_studio_budget_events;
begin
 uid:=public.website_build_studio_require_owner(p_principal,pid);
 if key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' or amount is null or amount not between 0 and 1000000 or amount<>round(amount,2) then raise exception 'INVALID_BUDGET' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('atlas-budget:'||uid::text||':'||key,0));
 perform public.website_build_studio_require_active(pid);
 perform public.website_build_studio_require_owner(p_principal,pid);
 select * into old from public.website_build_studio_budget_events where owner_id=uid and intent_key=key;
 if found then
  if old.input is distinct from normalized then raise exception 'BUDGET_KEY_CONFLICT' using errcode='23505'; end if;
  return jsonb_build_object('projectId',old.project_id,'monthlySek',old.monthly_sek);
 end if;
 select monthly_sek into previous from public.project_budgets where project_id=pid for update;
 if previous is distinct from expected then raise exception 'BUDGET_STALE' using errcode='40001'; end if;
 insert into public.project_budgets(project_id,monthly_sek) values(pid,amount) on conflict(project_id) do update set monthly_sek=excluded.monthly_sek,updated_at=now();
 insert into public.website_build_studio_budget_events(owner_id,project_id,intent_key,input,previous_monthly_sek,monthly_sek) values(uid,pid,key,normalized,previous,amount);
 return jsonb_build_object('projectId',pid,'monthlySek',amount);
end $$;
revoke all on function public.website_build_studio_budget_set(jsonb,jsonb),public.website_build_studio_budget_immutable() from public,anon,authenticated;
grant execute on function public.website_build_studio_budget_set(jsonb,jsonb) to service_role;


-- Lifecycle operations hold the project lock. Never wait for a run while holding
-- it: claim_runs takes those locks in the inverse order. Epochs fence any run
-- skipped during cancellation, even if the project is later restored/resumed.
create function public.project_lifecycle_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid; uid uuid; life public.project_lifecycle; paused boolean;
begin
 uid:=public.website_build_studio_require_owner(p_principal,pid);
 select execution_paused into strict paused from public.projects where id=pid and owner_id=uid;
 select * into life from public.project_lifecycle where project_id=pid;
 return jsonb_build_object('projectId',pid,'state',coalesce(life.state,'active'),'version',coalesce(life.version,0),'executionPaused',paused,'stopping',coalesce(life.state,'active')<>'active' and exists(select 1 from public.runs where project_id=pid and (status='running' or (status='unknown' and reconciliation_required))));
end $$;
create function public.project_lifecycle_change(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid; uid uuid; life public.project_lifecycle; key text:=p_input->>'idempotencyKey'; action text:=p_input->>'action'; expected bigint:=(p_input->>'expectedVersion')::bigint; nextstate text; normalized jsonb:=p_input-'idempotencyKey'; result jsonb; old jsonb; runrow record;
begin
 uid:=public.website_build_studio_require_owner(p_principal,pid);
 if key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' or action is null or action not in ('archive','trash','restore') or expected is null or expected<0 or jsonb_typeof(p_input) is distinct from 'object' or p_input-array['projectId','action','expectedVersion','idempotencyKey']<>'{}'::jsonb then raise exception 'INVALID_LIFECYCLE_INPUT' using errcode='22023'; end if;
 perform 1 from public.projects where id=pid and owner_id=uid for update;
 if not found then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 insert into public.project_lifecycle(project_id,owner_id) values(pid,uid) on conflict(project_id) do nothing;
 select * into strict life from public.project_lifecycle where project_id=pid for update;
 old:=life.intents->key;
 if old is not null then
  if old->'input' is distinct from normalized then raise exception 'LIFECYCLE_KEY_CONFLICT' using errcode='23505'; end if;
  return old->'result';
 end if;
 if life.version<>expected then raise exception 'LIFECYCLE_STALE' using errcode='40001'; end if;
 if (action='archive' and life.state<>'active') or (action='trash' and life.state='trashed') or (action='restore' and life.state='active') then raise exception 'LIFECYCLE_STATE_CONFLICT' using errcode='40001'; end if;
 nextstate:=case action when 'archive' then 'archived' when 'trash' then 'trashed' else 'active' end;
 update public.project_lifecycle set state=nextstate,version=version+1,updated_at=now() where project_id=pid;
 if action<>'restore' then
  perform public.stop_set_project_execution(pid,true,uid::text,'Atlas project lifecycle: '||nextstate);
  for runrow in select id from public.runs where project_id=pid and status in ('pending','running','awaiting_approval') order by id for update skip locked loop
   perform public.request_run_cancel(runrow.id,pid,uid::text,'Atlas project lifecycle: '||nextstate);
  end loop;
 end if;
 result:=public.project_lifecycle_read(p_principal,jsonb_build_object('projectId',pid));
 update public.project_lifecycle set intents=intents||jsonb_build_object(key,jsonb_build_object('input',normalized,'result',result)) where project_id=pid;
 return result;
end $$;
create function public.project_lifecycle_resume_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not new.execution_paused and exists(select 1 from public.project_lifecycle where project_id=new.id and state<>'active') then raise exception 'PROJECT_INACTIVE' using errcode='55000'; end if;
 return new;
end $$;
create trigger project_lifecycle_resume_guard before update of execution_paused on public.projects for each row execute function public.project_lifecycle_resume_guard();
revoke all on function public.project_lifecycle_read(jsonb,jsonb),public.project_lifecycle_change(jsonb,jsonb),public.project_lifecycle_resume_guard() from public,anon,authenticated;
grant execute on function public.project_lifecycle_read(jsonb,jsonb),public.project_lifecycle_change(jsonb,jsonb),public.website_build_studio_require_active(uuid) to service_role;


create or replace function public.website_build_builder_set(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid; aid uuid:=(p_input->>'agentId')::uuid; oldlocation jsonb; newlocation jsonb:=nullif(p_input->'location','null'::jsonb);
begin
 perform public.website_build_check_access(p_principal,pid,true);
 perform public.website_build_studio_require_active(pid);
 if aid is not null and not exists(select 1 from public.agents a where a.id=aid and a.project_id=pid and (a.model like 'claude%' or (a.model like 'gpt%' and a.model not like 'gpt-image%'))) then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 insert into public.website_build_project_settings(project_id) values(pid) on conflict do nothing;
 select location into oldlocation from public.website_build_project_settings where project_id=pid for update;
 if newlocation is not null and (newlocation->>'projectId' is distinct from pid::text or newlocation->>'status' is distinct from 'pending_runner') then raise exception 'INVALID_PROJECT_ROOT' using errcode='22023'; end if;
 if oldlocation is not null and newlocation is distinct from oldlocation and newlocation is not null and (exists(select 1 from public.website_build_plans where project_id=pid) or exists(select 1 from public.website_build_sessions where project_id=pid)) then raise exception 'PROJECT_LOCATION_LOCKED' using errcode='55000'; end if;
 update public.website_build_project_settings set builder_agent_id=aid,location=coalesce(newlocation,oldlocation),updated_at=now() where project_id=pid;
 return public.website_build_builder_get(p_principal,jsonb_build_object('projectId',pid));
end $$;

create or replace function public.website_build_plan_save(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid; uid uuid:=(p_principal->>'userId')::uuid; cid uuid:=(p_input->>'conversationId')::uuid;
 p public.website_build_plans; r public.website_build_plan_revisions; rid uuid; canonical text:=p_input->>'canonicalContent'; key text:=p_input->>'idempotencyKey';
begin
 perform public.website_build_check_access(p_principal,pid,true);
 perform public.website_build_studio_require_active(pid);
 perform 1 from public.conversations where id=cid and user_id=uid and (project_id is null or project_id=pid) for update;
 if not found then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 if canonical is null or octet_length(canonical)>32768 or canonical::jsonb is distinct from p_input->'content' or encode(sha256(convert_to(canonical,'UTF8')),'hex') is distinct from p_input->>'sha256' then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 if length(p_input->>'brief') not between 1 and 8000 or key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 if p_input->>'planId' is null then
  insert into public.website_build_plans(project_id,created_by,conversation_id) values(pid,uid,cid) on conflict(project_id,created_by,conversation_id) do nothing;
  select * into strict p from public.website_build_plans where project_id=pid and created_by=uid and conversation_id=cid for update;
 else select * into strict p from public.website_build_plans where id=(p_input->>'planId')::uuid and project_id=pid and created_by=uid and conversation_id=cid for update; end if;
 select * into r from public.website_build_plan_revisions where plan_id=p.id and intent_key=key;
 if found then
  if r.sha256 is distinct from p_input->>'sha256' then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
  return public.website_build_plan_view(p_principal,jsonb_build_object('projectId',pid,'planId',p.id));
 end if;
 if p.current_revision_id is distinct from (p_input->>'expectedRevisionId')::uuid then raise exception 'PLAN_STALE' using errcode='55000'; end if;
 insert into public.website_build_plan_revisions(plan_id,project_id,number,content,canonical_content,sha256,brief,intent_key)
 values(p.id,pid,coalesce((select max(number) from public.website_build_plan_revisions where plan_id=p.id),0)+1,p_input->'content',canonical,p_input->>'sha256',p_input->>'brief',key) returning id into rid;
 update public.website_build_plans set current_revision_id=rid,updated_at=now() where id=p.id;
 update public.conversations set project_id=pid where id=cid and project_id is null;
 return public.website_build_plan_view(p_principal,jsonb_build_object('projectId',pid,'planId',p.id));
end $$;

create or replace function public.website_build_plan_approve(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.website_build_plans; r public.website_build_plan_revisions; d public.website_build_plan_decisions; aid uuid; key text:=p_input->>'idempotencyKey'; view jsonb;
begin
 perform public.website_build_check_access(p_principal,(p_input->>'projectId')::uuid,true);
 perform public.website_build_studio_require_active((p_input->>'projectId')::uuid);
 select * into strict p from public.website_build_plans where id=(p_input->>'planId')::uuid and project_id=(p_input->>'projectId')::uuid and created_by=(p_principal->>'userId')::uuid for update;
 select * into strict r from public.website_build_plan_revisions where id=(p_input->>'revisionId')::uuid and plan_id=p.id and project_id=p.project_id;
 if p.current_revision_id is distinct from r.id or r.sha256 is distinct from p_input->>'sha256' then raise exception 'PLAN_STALE' using errcode='55000'; end if;
 if key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode='22023'; end if;
 select * into d from public.website_build_plan_decisions where project_id=p.project_id and approved_by=p.created_by and intent_key=key;
 if found and (d.plan_id is distinct from p.id or d.revision_id is distinct from r.id) then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
 select builder_agent_id into aid from public.website_build_project_settings where project_id=p.project_id for update;
 if aid is null then raise exception 'BUILD_AGENT_REQUIRED' using errcode='55000'; end if;
 if not exists(select 1 from public.agents a where a.id=aid and a.project_id=p.project_id and (a.model like 'claude%' or (a.model like 'gpt%' and a.model not like 'gpt-image%'))) then raise exception 'BUILD_AGENT_REQUIRED' using errcode='55000'; end if;
 insert into public.website_build_plan_decisions(plan_id,project_id,revision_id,approved_by,sha256,builder_agent_id,intent_key)
 values(p.id,p.project_id,r.id,p.created_by,r.sha256,aid,key) on conflict(plan_id,revision_id) do nothing;
 view:=public.website_build_plan_view(p_principal,jsonb_build_object('projectId',p.project_id,'planId',p.id));
 return view->'approvedDecision';
end $$;

create or replace function public.website_build_create(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.website_build_plans; r public.website_build_plan_revisions; d public.website_build_plan_decisions; s public.website_build_sessions; sid uuid; pid uuid:=(p_input->>'projectId')::uuid; uid uuid:=(p_principal->>'userId')::uuid; aid uuid;
begin
 perform public.website_build_check_access(p_principal,pid,true);
 perform public.website_build_studio_require_active(pid);
 if p_input->>'decisionId' is null or p_input->>'planId' is null or p_input->>'revisionId' is null or p_input->>'sha256' is null then raise exception 'PLAN_REVIEW_REQUIRED' using errcode='55000'; end if;
 select * into strict p from public.website_build_plans where id=(p_input->>'planId')::uuid and project_id=pid and created_by=uid for update;
 select * into strict d from public.website_build_plan_decisions where id=(p_input->>'decisionId')::uuid and plan_id=p.id and project_id=pid and approved_by=uid for update;
 select * into strict r from public.website_build_plan_revisions where id=d.revision_id and plan_id=p.id and project_id=pid;
 if d.revision_id is distinct from (p_input->>'revisionId')::uuid or d.sha256 is distinct from p_input->>'sha256' or d.sha256 is distinct from r.sha256 then raise exception 'PLAN_STALE' using errcode='55000'; end if;
 if d.session_id is not null then return public.website_build_view(p_principal,jsonb_build_object('projectId',pid,'sessionId',d.session_id)); end if;
 if p.current_revision_id is distinct from r.id then raise exception 'PLAN_STALE' using errcode='55000'; end if;
 select builder_agent_id into aid from public.website_build_project_settings where project_id=pid for update;
 if aid is distinct from d.builder_agent_id or aid is null then raise exception 'PLAN_STALE' using errcode='55000'; end if;
 if not exists(select 1 from public.agents a where a.id=aid and a.project_id=pid and (a.model like 'claude%' or (a.model like 'gpt%' and a.model not like 'gpt-image%'))) or not exists(select 1 from public.conversations where id=p.conversation_id and user_id=uid and project_id=pid) then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 insert into public.website_build_sessions(project_id,created_by,agent_id,conversation_id,brief,idempotency_key,plan_revision_id,plan_decision_id)
 values(pid,uid,aid,p.conversation_id,r.brief,d.start_intent_id::text,r.id,d.id) returning id into sid;
 perform public.website_build_enqueue(sid);
 update public.website_build_plan_decisions set session_id=sid where id=d.id;
 update public.website_build_plans set active_session_id=sid,updated_at=now() where id=p.id;
 return public.website_build_view(p_principal,jsonb_build_object('projectId',pid,'sessionId',sid));
end $$;

create or replace function public.website_build_append_feedback(p_principal jsonb,p_ref jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; f public.website_build_feedback; uid uuid:=(p_principal->>'userId')::uuid; v uuid:=(p_input->>'viewedRevisionId')::uuid;
begin
 perform public.website_build_check_access(p_principal,(p_ref->>'projectId')::uuid,true);
 perform public.website_build_studio_require_active((p_ref->>'projectId')::uuid);
 select * into strict s from public.website_build_sessions where id=(p_ref->>'sessionId')::uuid and project_id=(p_ref->>'projectId')::uuid for update;
 if v is not null and not exists(select 1 from public.website_preview_revisions where id=v and session_id=s.id and project_id=s.project_id) then raise exception 'REVISION_NOT_FOUND' using errcode='P0002'; end if;
 select * into f from public.website_build_feedback where session_id=s.id and author_id=uid and idempotency_key=p_input->>'idempotencyKey';
 if found then
  if f.text is distinct from p_input->>'text' or f.input_source is distinct from p_input->>'inputSource' or f.viewed_revision_id is distinct from v then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
 else
  if s.status in ('cancelled','cancelling') then raise exception 'BUILD_CANCELLED' using errcode='55000'; end if;
  insert into public.website_build_feedback(session_id,project_id,author_id,sequence,idempotency_key,text,input_source,viewed_revision_id) values(s.id,s.project_id,uid,s.feedback_seq+1,p_input->>'idempotencyKey',p_input->>'text',p_input->>'inputSource',v) returning * into f;
  update public.website_build_sessions set feedback_seq=feedback_seq+1,state_version=state_version+1,updated_at=now() where id=s.id;
  if s.current_run_id is null and s.status not in ('paused','pausing') then perform public.website_build_enqueue(s.id); end if;
 end if;
 return jsonb_build_object('id',f.id,'sequence',f.sequence,'authorId',f.author_id,'text',f.text,'inputSource',f.input_source,'viewedRevisionId',f.viewed_revision_id,'status',f.status,'interpretation',f.interpretation,'appliedRevisionId',f.applied_revision_id,'createdAt',f.created_at);
end $$;

create or replace function public.website_build_control(p_principal jsonb,p_ref jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; rid uuid; runstatus text; action text:=p_input->>'action'; key text:=p_input->>'idempotencyKey';
begin
 perform public.website_build_check_access(p_principal,(p_ref->>'projectId')::uuid,true);
 perform public.website_build_studio_require_active((p_ref->>'projectId')::uuid);
 select current_run_id into rid from public.website_build_sessions where id=(p_ref->>'sessionId')::uuid and project_id=(p_ref->>'projectId')::uuid;
 if rid is not null then
  begin
   select status into runstatus from public.runs where id=rid for update nowait;
  exception when lock_not_available then
   raise exception 'SESSION_CHANGED_RETRY' using errcode='40001';
  end;
 end if;
 select * into strict s from public.website_build_sessions where id=(p_ref->>'sessionId')::uuid and project_id=(p_ref->>'projectId')::uuid for update;
 if s.current_run_id is distinct from rid then raise exception 'SESSION_CHANGED_RETRY' using errcode='40001'; end if;
 if key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' or action not in ('pause','resume','cancel') then raise exception 'INVALID_CONTROL' using errcode='22023'; end if;
 if s.control_keys ? key then
  if s.control_keys->>key<>action then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
  return public.website_build_view(p_principal,p_ref);
 end if;
 if s.status in ('cancelled','cancelling') and action<>'cancel' then raise exception 'BUILD_CANCELLED' using errcode='55000'; end if;
 if runstatus='unknown' then
  if action<>'cancel' then raise exception 'RECONCILIATION_REQUIRED' using errcode='55000'; end if;
  update public.website_build_sessions set current_run_id=null,control_requested=null,status='cancelled',stage='Byggsessionen är avbruten; det externa anropets resultat är fortfarande okänt' where id=s.id;
 elsif action='resume' then
  if s.status not in ('paused','failed','awaiting_decision') or s.current_run_id is not null then raise exception 'NOT_PAUSED' using errcode='55000'; end if;
  update public.website_build_sessions set status='ready',control_requested=null where id=s.id;
  perform public.website_build_enqueue(s.id);
 elsif action='pause' then
  update public.website_build_sessions set control_requested=case when current_run_id is null then null else 'pause' end,status=case when current_run_id is null then 'paused' else 'pausing' end,stage=case when current_run_id is null then 'Bygget är pausat' else 'Pausar vid nästa stegräns' end where id=s.id;
 else
  update public.website_build_sessions set control_requested=case when current_run_id is null then null else 'cancel' end,status=case when current_run_id is null then 'cancelled' else 'cancelling' end,stage=case when current_run_id is null then 'Bygget är avbrutet' else 'Inväntar kvittens på avbrott' end where id=s.id;
  if rid is not null then perform public.request_run_cancel(rid,s.project_id,p_principal->>'userId','website build cancelled'); end if;
 end if;
 update public.website_build_sessions set control_keys=control_keys||jsonb_build_object(key,action),state_version=state_version+1,updated_at=now() where id=s.id;
 return public.website_build_view(p_principal,p_ref);
end $$;

create or replace function public.website_build_enqueue(p_session_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; rid uuid:=gen_random_uuid(); nextgen bigint;
begin
 perform public.website_build_studio_require_active((select project_id from public.website_build_sessions where id=p_session_id));
 select * into strict s from public.website_build_sessions where id=p_session_id for update;
 if s.current_run_id is not null then return s.current_run_id; end if;
 if s.control_requested is not null or s.status in ('paused','cancelled','cancelling') then raise exception 'CONTROL_PENDING' using errcode='55000'; end if;
 if exists(select 1 from public.website_build_studio_intents where project_id=s.project_id) and not exists(select 1 from public.project_budgets where project_id=s.project_id and monthly_sek is not null) then raise exception 'PROJECT_BUDGET_REQUIRED' using errcode='55000'; end if;
 nextgen:=s.generation+1;
 insert into public.runs(id,project_id,workflow_id,kind,status,input,context,policy_class) values(rid,s.project_id,null,'website.static.build.v1','pending',jsonb_build_object('projectId',s.project_id,'sessionId',s.id,'generation',nextgen,'feedbackSequence',s.feedback_seq),jsonb_build_object('atlasLifecycleVersion',coalesce((select version from public.project_lifecycle where project_id=s.project_id),0),'websiteBuildIdempotencyKey','website:'||s.id||':'||nextgen),'non_destructive');
 update public.website_build_sessions set current_run_id=rid,generation=nextgen,status='queued',stage='Väntar på byggjobbet',state_version=state_version+1,updated_at=now() where id=s.id;
 return rid;
end $$;

create or replace function public.website_build_lock_writer(p_writer jsonb,p_allow_pause boolean default false) returns public.website_build_sessions language plpgsql security invoker set search_path='' as $$
declare r public.runs; s public.website_build_sessions;
begin
 perform 1 from public.projects where id=(p_writer->>'projectId')::uuid for update;
 if not found or exists(select 1 from public.project_lifecycle where project_id=(p_writer->>'projectId')::uuid and state<>'active') then raise exception 'WEBSITE_WRITER_FENCED' using errcode='40001'; end if;
 begin
  select * into r from public.runs where id=(p_writer->>'runId')::uuid for update nowait;
 exception when lock_not_available then
  raise exception 'WEBSITE_WRITER_BUSY' using errcode='40001';
 end;
 if not found or r.project_id is distinct from (p_writer->>'projectId')::uuid or r.claim_id is distinct from (p_writer->>'claimId')::uuid or r.status<>'running' or r.lease_until is null or r.lease_until<=clock_timestamp() or r.kind is distinct from 'website.static.build.v1' then raise exception 'WEBSITE_WRITER_FENCED' using errcode='40001'; end if;
 if coalesce((r.context->>'atlasLifecycleVersion')::bigint,0) is distinct from coalesce((select version from public.project_lifecycle where project_id=r.project_id),0) then raise exception 'WEBSITE_WRITER_FENCED' using errcode='40001'; end if;
 if r.cancel_requested then raise exception 'WEBSITE_RUN_CANCELLED' using errcode='57014'; end if;
 select * into s from public.website_build_sessions where id=(p_writer->>'sessionId')::uuid and project_id=r.project_id for update;
 if not found or s.current_run_id is distinct from r.id or s.generation is distinct from (p_writer->>'generation')::bigint or (r.input->>'generation')::bigint is distinct from s.generation then raise exception 'WEBSITE_WRITER_FENCED' using errcode='40001'; end if;
 if s.control_requested='cancel' then raise exception 'WEBSITE_RUN_CANCELLED' using errcode='57014'; end if;
 if not p_allow_pause and s.control_requested='pause' then raise exception 'WEBSITE_BUILD_PAUSING' using errcode='55000'; end if;
 return s;
end $$;

-- Canonical durable-cancellation claim body, with the static lifecycle epoch
-- checked in candidate selection and again under the project authority lock.
create or replace function public.claim_runs(
  p_limit integer,
  p_lease_seconds integer default 320
)
returns setof public.runs
language plpgsql
security definer
set search_path = ''
as $fn$
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
  --
  -- G3C-3B adds `cancel_requested = false`. This is DEFENSE IN DEPTH, not the
  -- primary mechanism: request_run_cancel already terminalizes a pending run
  -- under the row lock, release_stopped_run terminalizes rather than requeues a
  -- cancelled run, and the reaper never returns one to 'pending'. Together those
  -- make an ownerless `pending + cancel_requested = true` row unreachable — which
  -- is what makes this predicate safe to add. Adding it without them would create
  -- exactly the stranded state it is meant to prevent.
  select array_agg(c.id order by c.created_at),
         array_agg(distinct c.project_id)
    into v_ids, v_projects
  from (
    select r.id, r.created_at, r.project_id
    from public.runs r
    where (r.kind is distinct from 'website.static.build.v1' or coalesce((r.context->>'atlasLifecycleVersion')::bigint,0)=coalesce((select version from public.project_lifecycle where project_id=r.project_id),0))
      and r.status = 'pending'
      and r.cancel_requested = false
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
  where (r.kind is distinct from 'website.static.build.v1' or coalesce((r.context->>'atlasLifecycleVersion')::bigint,0)=coalesce((select version from public.project_lifecycle where project_id=r.project_id),0))
    and r.id = any(v_ids)
    and r.project_id = any(v_allowed)     -- a paused project's run stays pending
  returning r.*;
end
$fn$;
commit;
