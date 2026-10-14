-- Conversation-bound website plans. Adds operator decisions and scoped location settings.
begin;
create table public.website_build_operator_settings(
 owner_id uuid primary key references auth.users(id) on delete cascade,
 default_root jsonb check(default_root is null or (jsonb_typeof(default_root)='object' and default_root->>'os' in ('windows','macos','linux') and length(default_root->>'root') between 1 and 1024)),
 updated_at timestamptz not null default now()
);
create table public.website_build_project_settings(
 project_id uuid primary key references public.projects(id) on delete cascade,
 builder_agent_id uuid references public.agents(id),
 domain_registrar text not null default 'strato' check(domain_registrar='strato'),
 location jsonb check(location is null or (jsonb_typeof(location)='object' and location->>'status'='pending_runner' and length(location->>'root') between 1 and 1200)),
 updated_at timestamptz not null default now()
);
create table public.website_build_plans(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 conversation_id uuid not null references public.conversations(id),
 current_revision_id uuid, active_session_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,project_id),unique(project_id,created_by,conversation_id)
);
create table public.website_build_plan_revisions(
 id uuid primary key default gen_random_uuid(), plan_id uuid not null, project_id uuid not null,
 number bigint not null check(number>0), content jsonb not null,
 canonical_content text not null check(octet_length(canonical_content)<=32768),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 brief text not null check(length(brief) between 1 and 8000),
 intent_key text not null check(intent_key~'^[A-Za-z0-9_-]{1,100}$'),
 created_at timestamptz not null default now(),
 foreign key(plan_id,project_id) references public.website_build_plans(id,project_id) on delete cascade,
 unique(id,plan_id,project_id),unique(id,project_id),unique(plan_id,number),unique(plan_id,intent_key),
 check(content=canonical_content::jsonb),
 check(sha256=encode(sha256(convert_to(canonical_content,'UTF8')),'hex')),
 check(jsonb_typeof(content->'pages')='array' and jsonb_array_length(content->'pages') between 1 and 8),
 check(content->'domain'->>'registrar'='strato')
);
create table public.website_build_plan_decisions(
 id uuid primary key default gen_random_uuid(), plan_id uuid not null, project_id uuid not null, revision_id uuid not null,
 approved_by uuid not null references auth.users(id),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'), scope text not null default 'static_preview' check(scope='static_preview'),
 builder_agent_id uuid not null references public.agents(id),
 intent_key text not null check(intent_key~'^[A-Za-z0-9_-]{1,100}$'),
 start_intent_id uuid not null default gen_random_uuid(), session_id uuid,
 approved_at timestamptz not null default now(),
 foreign key(revision_id,plan_id,project_id) references public.website_build_plan_revisions(id,plan_id,project_id),
 foreign key(session_id,project_id) references public.website_build_sessions(id,project_id),
 unique(id,project_id),unique(plan_id,revision_id),unique(project_id,approved_by,intent_key),unique(start_intent_id)
);
alter table public.website_build_plans add foreign key(current_revision_id,id,project_id) references public.website_build_plan_revisions(id,plan_id,project_id);
alter table public.website_build_plans add foreign key(active_session_id,project_id) references public.website_build_sessions(id,project_id);
alter table public.website_build_sessions add column plan_revision_id uuid,add column plan_decision_id uuid;
alter table public.website_build_sessions add foreign key(plan_revision_id,project_id) references public.website_build_plan_revisions(id,project_id);
alter table public.website_build_sessions add foreign key(plan_decision_id,project_id) references public.website_build_plan_decisions(id,project_id);
create index website_build_plan_conversation on public.website_build_plans(conversation_id);
create index website_build_plan_revision_project on public.website_build_plan_revisions(project_id);
create index website_build_plan_decision_project on public.website_build_plan_decisions(project_id);

alter table public.website_build_operator_settings enable row level security;
alter table public.website_build_project_settings enable row level security;
alter table public.website_build_plans enable row level security;
alter table public.website_build_plan_revisions enable row level security;
alter table public.website_build_plan_decisions enable row level security;
create policy website_operator_settings_read on public.website_build_operator_settings for select to authenticated using(owner_id=(select auth.uid()));
create policy website_project_settings_read on public.website_build_project_settings for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy website_plans_read on public.website_build_plans for select to authenticated using(created_by=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy website_plan_revisions_read on public.website_build_plan_revisions for select to authenticated using(exists(select 1 from public.website_build_plans p where p.id=plan_id and p.project_id=website_build_plan_revisions.project_id and p.created_by=(select auth.uid())));
create policy website_plan_decisions_read on public.website_build_plan_decisions for select to authenticated using(approved_by=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
revoke all on public.website_build_operator_settings,public.website_build_project_settings,public.website_build_plans,public.website_build_plan_revisions,public.website_build_plan_decisions from anon,authenticated;
grant select on public.website_build_operator_settings,public.website_build_project_settings,public.website_build_plans,public.website_build_plan_revisions,public.website_build_plan_decisions to authenticated;
grant all on public.website_build_operator_settings,public.website_build_project_settings,public.website_build_plans,public.website_build_plan_revisions,public.website_build_plan_decisions to service_role;

create function public.website_build_plan_revision_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'PLAN_REVISION_IMMUTABLE' using errcode='55000'; end $$;
create trigger website_plan_revision_no_update before update on public.website_build_plan_revisions for each row execute function public.website_build_plan_revision_immutable();
create function public.website_build_plan_decision_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (to_jsonb(new)-'session_id') is distinct from (to_jsonb(old)-'session_id') or old.session_id is not null then raise exception 'PLAN_DECISION_IMMUTABLE' using errcode='55000'; end if;
 return new;
end $$;
create trigger website_plan_decision_no_rewrite before update on public.website_build_plan_decisions for each row execute function public.website_build_plan_decision_immutable();

create function public.website_build_root_get(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare value jsonb;
begin
 if p_principal->>'userId' is null then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 select default_root into value from public.website_build_operator_settings where owner_id=(p_principal->>'userId')::uuid;
 return coalesce(value,'null'::jsonb);
end $$;
create function public.website_build_root_set(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform public.website_build_root_get(p_principal,'{}');
 insert into public.website_build_operator_settings(owner_id,default_root) values((p_principal->>'userId')::uuid,nullif(p_input->'root','null'::jsonb))
 on conflict(owner_id) do update set default_root=excluded.default_root,updated_at=now();
 return public.website_build_root_get(p_principal,'{}');
end $$;
create function public.website_build_builder_get(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid; s public.website_build_project_settings;
begin
 perform public.website_build_check_access(p_principal,pid,true);
 select * into s from public.website_build_project_settings where project_id=pid;
 return jsonb_build_object('projectId',pid,'builderAgentId',s.builder_agent_id,'domainRegistrar','strato','location',s.location);
end $$;
create function public.website_build_builder_set(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid; aid uuid:=(p_input->>'agentId')::uuid; oldlocation jsonb; newlocation jsonb:=nullif(p_input->'location','null'::jsonb);
begin
 perform public.website_build_check_access(p_principal,pid,true);
 if aid is not null and not exists(select 1 from public.agents a where a.id=aid and a.project_id=pid and (a.model like 'claude%' or (a.model like 'gpt%' and a.model not like 'gpt-image%'))) then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 insert into public.website_build_project_settings(project_id) values(pid) on conflict do nothing;
 select location into oldlocation from public.website_build_project_settings where project_id=pid for update;
 if newlocation is not null and (newlocation->>'projectId' is distinct from pid::text or newlocation->>'status' is distinct from 'pending_runner') then raise exception 'INVALID_PROJECT_ROOT' using errcode='22023'; end if;
 if oldlocation is not null and newlocation is distinct from oldlocation and newlocation is not null and (exists(select 1 from public.website_build_plans where project_id=pid) or exists(select 1 from public.website_build_sessions where project_id=pid)) then raise exception 'PROJECT_LOCATION_LOCKED' using errcode='55000'; end if;
 update public.website_build_project_settings set builder_agent_id=aid,location=coalesce(newlocation,oldlocation),updated_at=now() where project_id=pid;
 return public.website_build_builder_get(p_principal,jsonb_build_object('projectId',pid));
end $$;
create function public.website_build_plan_view(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.website_build_plans; r public.website_build_plan_revisions; d public.website_build_plan_decisions; budget numeric; budgetstate text:='missing';
begin
 perform public.website_build_check_access(p_principal,(p_input->>'projectId')::uuid,true);
 select * into strict p from public.website_build_plans where id=(p_input->>'planId')::uuid and project_id=(p_input->>'projectId')::uuid and created_by=(p_principal->>'userId')::uuid;
 select * into strict r from public.website_build_plan_revisions where id=p.current_revision_id and plan_id=p.id and project_id=p.project_id;
 select * into d from public.website_build_plan_decisions where revision_id=r.id and plan_id=p.id and project_id=p.project_id and approved_by=p.created_by;
 begin select monthly_sek into budget from public.project_budgets where project_id=p.project_id; if budget is not null then budgetstate:='configured'; end if;
 exception when undefined_table or insufficient_privilege then budgetstate:='unknown';budget:=null; end;
 return jsonb_build_object(
 'ref',jsonb_build_object('projectId',p.project_id,'planId',p.id),'conversationId',p.conversation_id,
 'currentRevision',jsonb_build_object('projectId',p.project_id,'planId',p.id,'revisionId',r.id,'sha256',r.sha256,'number',r.number,'content',r.content,'brief',r.brief,'createdAt',r.created_at),
 'approvedDecision',case when d.id is null then null else jsonb_build_object('id',d.id,'revisionRef',jsonb_build_object('projectId',p.project_id,'planId',p.id,'revisionId',r.id,'sha256',r.sha256),'approvedBy',d.approved_by,'scope',d.scope,'builderAgentId',d.builder_agent_id,'startIntentId',d.start_intent_id,'sessionId',d.session_id) end,
 'activeSessionId',p.active_session_id,'budget',jsonb_build_object('state',budgetstate,'monthlySek',budget),
 'setting',public.website_build_builder_get(p_principal,jsonb_build_object('projectId',p.project_id)));
end $$;
create function public.website_build_plan_save(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid; uid uuid:=(p_principal->>'userId')::uuid; cid uuid:=(p_input->>'conversationId')::uuid;
 p public.website_build_plans; r public.website_build_plan_revisions; rid uuid; canonical text:=p_input->>'canonicalContent'; key text:=p_input->>'idempotencyKey';
begin
 perform public.website_build_check_access(p_principal,pid,true);
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
create function public.website_build_plan_approve(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.website_build_plans; r public.website_build_plan_revisions; d public.website_build_plan_decisions; aid uuid; key text:=p_input->>'idempotencyKey'; view jsonb;
begin
 perform public.website_build_check_access(p_principal,(p_input->>'projectId')::uuid,true);
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
create function public.website_build_plan_start(p_principal jsonb,p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select public.website_build_create(p_principal,p_input);
$$;
do $revoke$
declare f record;
begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'website_build_plan_%' or p.proname like 'website_build_builder_%' or p.proname like 'website_build_root_%')
 loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end $revoke$;
commit;
