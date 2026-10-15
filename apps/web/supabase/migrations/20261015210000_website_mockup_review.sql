-- Immutable design proposals and an operator decision before new website builds.
begin;
alter table public.website_build_plan_revisions add column design_review_required boolean not null default false;
alter table public.website_build_plan_revisions alter column design_review_required set default true;
create table public.website_build_mockups(
 id uuid primary key default gen_random_uuid(), project_id uuid not null, plan_id uuid not null, revision_id uuid not null,
 source_sha256 text not null check(source_sha256~'^[a-f0-9]{64}$'),
 key text not null check(key in ('editorial','visual','structured')), title text not null check(length(title) between 1 and 180), summary text not null check(length(summary) between 1 and 600),
 canonical_draft text not null check(octet_length(canonical_draft)<=48000), draft jsonb not null, sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 foreign key(revision_id,plan_id,project_id) references public.website_build_plan_revisions(id,plan_id,project_id) on delete cascade,
 unique(revision_id,key),unique(id,revision_id,plan_id,project_id),
 check(draft=canonical_draft::jsonb),check(sha256=encode(sha256(convert_to(canonical_draft,'UTF8')),'hex')),
 check(draft->>'format'='static-website.v1' and jsonb_typeof(draft->'pages')='array' and jsonb_array_length(draft->'pages')=1)
);
create table public.website_build_mockup_decisions(
 id uuid primary key default gen_random_uuid(), project_id uuid not null, plan_id uuid not null, revision_id uuid not null, mockup_id uuid not null,
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'), approved_by uuid not null references auth.users(id),
 intent_key text not null check(intent_key~'^[A-Za-z0-9_-]{1,100}$'), created_at timestamptz not null default now(),
 foreign key(mockup_id,revision_id,plan_id,project_id) references public.website_build_mockups(id,revision_id,plan_id,project_id) on delete cascade,
 unique(project_id,approved_by,intent_key),unique(id,revision_id,plan_id,project_id)
);
alter table public.website_build_plans add column current_mockup_decision_id uuid references public.website_build_mockup_decisions(id);
alter table public.website_build_plan_decisions add column mockup_decision_id uuid references public.website_build_mockup_decisions(id);
alter table public.website_build_sessions add column design_reference jsonb;
alter table public.website_build_mockups enable row level security;
alter table public.website_build_mockup_decisions enable row level security;
revoke all on public.website_build_mockups,public.website_build_mockup_decisions from public,anon,authenticated;
grant all on public.website_build_mockups,public.website_build_mockup_decisions to service_role;
create index website_mockup_project on public.website_build_mockups(project_id);
create index website_mockup_decision_revision on public.website_build_mockup_decisions(revision_id);
create function public.website_build_mockup_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'MOCKUP_IMMUTABLE' using errcode='55000'; end $$;
create trigger website_mockup_no_update before update on public.website_build_mockups for each row execute function public.website_build_mockup_immutable();
create trigger website_mockup_decision_no_update before update on public.website_build_mockup_decisions for each row execute function public.website_build_mockup_immutable();

create function public.website_build_mockup_view(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.website_build_plans; r public.website_build_plan_revisions; d public.website_build_mockup_decisions; options jsonb;
begin
 perform public.website_build_check_access(p_principal,(p_input->>'projectId')::uuid,true);
 select * into strict p from public.website_build_plans where id=(p_input->>'planId')::uuid and project_id=(p_input->>'projectId')::uuid and created_by=(p_principal->>'userId')::uuid;
 select * into strict r from public.website_build_plan_revisions where id=coalesce((p_input->>'revisionId')::uuid,p.current_revision_id) and plan_id=p.id and project_id=p.project_id;
 if p_input->>'sha256' is not null and r.sha256 is distinct from p_input->>'sha256' then raise exception 'PLAN_STALE' using errcode='55000'; end if;
 select * into d from public.website_build_mockup_decisions where id=p.current_mockup_decision_id and revision_id=r.id and plan_id=p.id and project_id=p.project_id and approved_by=p.created_by;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'key',m.key,'title',m.title,'summary',m.summary,'sha256',m.sha256) order by case m.key when 'editorial' then 1 when 'visual' then 2 else 3 end),'[]') into options from public.website_build_mockups m where m.revision_id=r.id and m.plan_id=p.id and m.project_id=p.project_id and m.source_sha256=r.sha256;
 return jsonb_build_object('required',r.design_review_required,'options',options,'approved',case when d.id is null then null else jsonb_build_object('id',d.id,'mockupId',d.mockup_id,'sha256',d.sha256,'approvedBy',d.approved_by) end);
end $$;

create function public.website_build_mockup_prepare(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.website_build_plans; r public.website_build_plan_revisions; item jsonb; keys text[]:='{}'; count_existing integer;
begin
 perform public.website_build_check_access(p_principal,(p_input->>'projectId')::uuid,true);
 perform public.website_build_studio_require_active((p_input->>'projectId')::uuid);
 select * into strict p from public.website_build_plans where id=(p_input->>'planId')::uuid and project_id=(p_input->>'projectId')::uuid and created_by=(p_principal->>'userId')::uuid for update;
 select * into strict r from public.website_build_plan_revisions where id=(p_input->>'revisionId')::uuid and plan_id=p.id and project_id=p.project_id;
 if p.current_revision_id is distinct from r.id or r.sha256 is distinct from p_input->>'sha256' then raise exception 'PLAN_STALE' using errcode='55000'; end if;
 if not r.design_review_required then return public.website_build_mockup_view(p_principal,p_input); end if;
 if jsonb_typeof(p_input->'options') is distinct from 'array' or jsonb_array_length(p_input->'options')<>3 then raise exception 'INVALID_MOCKUP' using errcode='22023'; end if;
 select count(*) into count_existing from public.website_build_mockups where revision_id=r.id;
 for item in select value from jsonb_array_elements(p_input->'options') loop
  if item->>'key' is null or item->>'key' not in ('editorial','visual','structured') or item->>'key'=any(keys) or item->>'canonicalDraft' is null or item->>'sha256' is distinct from encode(sha256(convert_to(item->>'canonicalDraft','UTF8')),'hex') then raise exception 'INVALID_MOCKUP' using errcode='22023'; end if;
  keys:=array_append(keys,item->>'key');
  if count_existing>0 then
   if not exists(select 1 from public.website_build_mockups m where m.revision_id=r.id and m.key=item->>'key' and m.sha256=item->>'sha256' and m.canonical_draft=item->>'canonicalDraft') then raise exception 'MOCKUP_STALE' using errcode='55000'; end if;
  else
   insert into public.website_build_mockups(project_id,plan_id,revision_id,source_sha256,key,title,summary,canonical_draft,draft,sha256) values(p.project_id,p.id,r.id,r.sha256,item->>'key',item->>'title',item->>'summary',item->>'canonicalDraft',(item->>'canonicalDraft')::jsonb,item->>'sha256');
  end if;
 end loop;
 return public.website_build_mockup_view(p_principal,p_input);
end $$;

create function public.website_build_mockup_approve(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.website_build_plans; r public.website_build_plan_revisions; m public.website_build_mockups; d public.website_build_mockup_decisions; key text:=p_input->>'idempotencyKey'; did uuid;
begin
 perform public.website_build_check_access(p_principal,(p_input->>'projectId')::uuid,true);
 perform public.website_build_studio_require_active((p_input->>'projectId')::uuid);
 select * into strict p from public.website_build_plans where id=(p_input->>'planId')::uuid and project_id=(p_input->>'projectId')::uuid and created_by=(p_principal->>'userId')::uuid for update;
 select * into strict r from public.website_build_plan_revisions where id=(p_input->>'revisionId')::uuid and plan_id=p.id and project_id=p.project_id;
 if p.current_revision_id is distinct from r.id or r.sha256 is distinct from p_input->>'sha256' then raise exception 'PLAN_STALE' using errcode='55000'; end if;
 select * into strict m from public.website_build_mockups where id=(p_input->>'mockupId')::uuid and revision_id=r.id and plan_id=p.id and project_id=p.project_id and source_sha256=r.sha256;
 if m.sha256 is distinct from p_input->>'mockupSha256' then raise exception 'MOCKUP_STALE' using errcode='55000'; end if;
 if key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode='22023'; end if;
 select * into d from public.website_build_mockup_decisions where project_id=p.project_id and approved_by=p.created_by and intent_key=key;
 if found then
  if d.revision_id is distinct from r.id or d.mockup_id is distinct from m.id or d.sha256 is distinct from m.sha256 then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
  return public.website_build_mockup_view(p_principal,p_input);
 end if;
 if exists(select 1 from public.website_build_plan_decisions where revision_id=r.id) then
  if not exists(select 1 from public.website_build_mockup_decisions where id=p.current_mockup_decision_id and mockup_id=m.id and revision_id=r.id) then raise exception 'MOCKUP_LOCKED' using errcode='55000'; end if;
  return public.website_build_mockup_view(p_principal,p_input);
 end if;
 insert into public.website_build_mockup_decisions(project_id,plan_id,revision_id,mockup_id,sha256,approved_by,intent_key) values(p.project_id,p.id,r.id,m.id,m.sha256,p.created_by,key) returning id into did;
 update public.website_build_plans set current_mockup_decision_id=did,updated_at=now() where id=p.id;
 return public.website_build_mockup_view(p_principal,p_input);
end $$;

create function public.website_build_mockup_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.website_build_plans; m public.website_build_mockups;
begin
 perform public.website_build_check_access(p_principal,(p_input->>'projectId')::uuid,true);
 select * into strict p from public.website_build_plans where id=(p_input->>'planId')::uuid and project_id=(p_input->>'projectId')::uuid and created_by=(p_principal->>'userId')::uuid;
 select * into strict m from public.website_build_mockups where id=(p_input->>'mockupId')::uuid and revision_id=(p_input->>'revisionId')::uuid and plan_id=p.id and project_id=p.project_id and source_sha256=p_input->>'sha256';
 if m.sha256 is distinct from p_input->>'mockupSha256' then raise exception 'MOCKUP_STALE' using errcode='55000'; end if;
 return jsonb_build_object('mockupId',m.id,'canonicalDraft',m.canonical_draft,'sha256',m.sha256);
end $$;

create or replace function public.website_build_mockup_pin_plan() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.website_build_plan_revisions; d public.website_build_mockup_decisions; p public.website_build_plans;
begin
 select * into strict r from public.website_build_plan_revisions where id=new.revision_id and plan_id=new.plan_id and project_id=new.project_id;
 if not r.design_review_required then new.mockup_decision_id:=null;return new; end if;
 select * into strict p from public.website_build_plans where id=new.plan_id and project_id=new.project_id for update;
 select * into d from public.website_build_mockup_decisions where id=p.current_mockup_decision_id and revision_id=r.id and plan_id=p.id and project_id=p.project_id and approved_by=new.approved_by;
 if d.id is null or r.sha256 is distinct from new.sha256 or not exists(select 1 from public.website_build_mockups m where m.id=d.mockup_id and m.sha256=d.sha256 and m.source_sha256=r.sha256 and m.revision_id=r.id) then raise exception 'MOCKUP_REVIEW_REQUIRED' using errcode='55000'; end if;
 if new.mockup_decision_id is distinct from d.id then raise exception 'MOCKUP_STALE' using errcode='55000';end if;
 new.mockup_decision_id:=d.id;return new;
end $$;
create trigger website_plan_pin_mockup before insert on public.website_build_plan_decisions for each row execute function public.website_build_mockup_pin_plan();

create or replace function public.website_build_plan_approve(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 insert into public.website_build_plan_decisions(plan_id,project_id,revision_id,approved_by,sha256,builder_agent_id,intent_key,mockup_decision_id)
 values(p.id,p.project_id,r.id,p.created_by,r.sha256,aid,key,(p_input->>'mockupDecisionId')::uuid) on conflict(plan_id,revision_id) do nothing;
 view:=public.website_build_plan_view(p_principal,jsonb_build_object('projectId',p.project_id,'planId',p.id));
 return view->'approvedDecision';
end $$;

create or replace function public.website_build_mockup_pin_session() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.website_build_plan_revisions; pd public.website_build_plan_decisions; d public.website_build_mockup_decisions; m public.website_build_mockups;
begin
 if new.plan_revision_id is null then new.design_reference:=null;return new;end if;
 select * into strict r from public.website_build_plan_revisions where id=new.plan_revision_id and project_id=new.project_id;
 if not r.design_review_required then new.design_reference:=null;return new;end if;
 select * into strict pd from public.website_build_plan_decisions where id=new.plan_decision_id and revision_id=r.id and project_id=new.project_id and approved_by=new.created_by;
 select * into d from public.website_build_mockup_decisions where id=pd.mockup_decision_id and revision_id=r.id and plan_id=r.plan_id and project_id=new.project_id and approved_by=new.created_by;
 if d.id is null then raise exception 'MOCKUP_REVIEW_REQUIRED' using errcode='55000';end if;
 select * into strict m from public.website_build_mockups where id=d.mockup_id and revision_id=r.id and project_id=new.project_id and sha256=d.sha256 and source_sha256=r.sha256;
 new.design_reference:=jsonb_build_object('mockupId',m.id,'title',m.title,'canonicalDraft',m.canonical_draft,'sha256',m.sha256,'planRevisionId',r.id,'planSha256',r.sha256,'approvedPages',r.content->'pages');
 return new;
end $$;
create trigger website_session_pin_mockup before insert on public.website_build_sessions for each row execute function public.website_build_mockup_pin_session();
create function public.website_build_mockup_keep_reference() returns trigger language plpgsql security invoker set search_path='' as $$
begin if new.design_reference is distinct from old.design_reference then raise exception 'DESIGN_REFERENCE_IMMUTABLE' using errcode='55000';end if;return new;end $$;
create trigger website_session_keep_mockup before update on public.website_build_sessions for each row execute function public.website_build_mockup_keep_reference();

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
 -- Old deployments must fail before snapshot acquisition, never regenerate.
 if (r.input ? 'recovery' or r.input ? 'recoveryNoPaid') and p_writer->'recoveryVersion' is distinct from '1'::jsonb then raise exception 'RECOVERY_WORKER_REQUIRED' using errcode='22023'; end if;
 if s.design_reference is not null and p_writer->'designVersion' is distinct from '1'::jsonb then raise exception 'DESIGN_WORKER_REQUIRED' using errcode='22023'; end if;
 if not p_allow_pause and s.control_requested='pause' then raise exception 'WEBSITE_BUILD_PAUSING' using errcode='55000'; end if;
 return s;
end $$;

create or replace function public.website_build_snapshot(p_writer jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; cutoff bigint; pending jsonb; previous jsonb; interp jsonb;
begin
 s:=public.website_build_lock_writer(p_writer,true);
 select (input->>'feedbackSequence')::bigint,context->'websiteInterpretation' into cutoff,interp from public.runs where id=s.current_run_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'sequence',f.sequence,'authorId',f.author_id,'text',f.text,'inputSource',f.input_source,'viewedRevisionId',f.viewed_revision_id,'status',f.status,'interpretation',f.interpretation,'appliedRevisionId',f.applied_revision_id,'createdAt',f.created_at) order by f.sequence),'[]') into pending from public.website_build_feedback f where f.session_id=s.id and f.sequence<=cutoff and f.status in ('received','acknowledged') and (f.sequence>s.processed_feedback_seq or (f.status='acknowledged' and f.disposition in ('apply','decision')));
 select artifact into previous from public.website_preview_revisions where id=s.active_preview_revision_id;
 return jsonb_build_object('writer',p_writer,'brief',s.brief,'agentId',s.agent_id,'feedback',pending,'previousArtifact',previous,'candidate',case when s.candidate_feedback_seq=cutoff then s.candidate else null end,'interpretation',coalesce(interp,case when s.interpretation_feedback_seq=cutoff then s.interpretation else null end),'controlRequested',s.control_requested,'designReference',s.design_reference);
end $$;

create or replace function public.website_build_plan_view(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 'designReview',public.website_build_mockup_view(p_principal,jsonb_build_object('projectId',p.project_id,'planId',p.id,'revisionId',r.id,'sha256',r.sha256)),
 'activeSessionId',p.active_session_id,'budget',jsonb_build_object('state',budgetstate,'monthlySek',budget),
 'setting',public.website_build_builder_get(p_principal,jsonb_build_object('projectId',p.project_id)));
end $$;

do $acl$ declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'website_build_mockup_%' loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $acl$;
notify pgrst,'reload schema';
commit;
