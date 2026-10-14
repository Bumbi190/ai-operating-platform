-- Private static-website build control plane. No public hosting or new authority.
begin;
create table public.website_build_sessions (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 created_by uuid not null references auth.users(id), agent_id uuid not null references public.agents(id),
 conversation_id uuid not null references public.conversations(id), brief text not null check(length(brief) between 1 and 8000),
 idempotency_key text not null check(idempotency_key ~ '^[A-Za-z0-9_-]{1,100}$'),
 status text not null default 'queued' check(status in ('queued','interpreting','building','validating','ready','awaiting_decision','pausing','paused','cancelling','cancelled','failed')),
 stage text not null default 'Väntar på byggjobbet', state_version bigint not null default 1,
 generation bigint not null default 0, feedback_seq bigint not null default 0, processed_feedback_seq bigint not null default 0,
 current_run_id uuid references public.runs(id), active_preview_revision_id uuid,
 control_requested text check(control_requested in ('pause','cancel')), control_keys jsonb not null default '{}',
 candidate jsonb, candidate_feedback_seq bigint, interpretation jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,project_id), unique(project_id,created_by,idempotency_key)
);
create table public.website_build_feedback (
 id uuid primary key default gen_random_uuid(),session_id uuid not null,project_id uuid not null,author_id uuid not null references auth.users(id),
 sequence bigint not null,idempotency_key text not null check(idempotency_key ~ '^[A-Za-z0-9_-]{1,100}$'),
 text text not null check(length(text) between 1 and 4000),input_source text not null check(input_source in ('text','voice')),
 viewed_revision_id uuid,status text not null default 'received' check(status in ('received','acknowledged','applied','rejected','superseded')),
 interpretation text,disposition text check(disposition in ('apply','answer','reject','decision')),change_key text,
 superseded_by uuid,applied_revision_id uuid,created_at timestamptz not null default now(),
 foreign key(session_id,project_id) references public.website_build_sessions(id,project_id) on delete cascade,
 unique(session_id,sequence),unique(session_id,author_id,idempotency_key)
);
create table public.website_preview_revisions (
 id uuid primary key default gen_random_uuid(),session_id uuid not null,project_id uuid not null,generation bigint not null,
 number bigint not null,feedback_sequence bigint not null,sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 artifact jsonb not null check(octet_length(artifact::text) <= 1048576),created_at timestamptz not null default now(),
 foreign key(session_id,project_id) references public.website_build_sessions(id,project_id) on delete cascade,
 unique(id,session_id,project_id),unique(session_id,generation),unique(session_id,number)
);
alter table public.website_build_sessions add foreign key(active_preview_revision_id,id,project_id) references public.website_preview_revisions(id,session_id,project_id);
alter table public.website_build_feedback add foreign key(viewed_revision_id,session_id,project_id) references public.website_preview_revisions(id,session_id,project_id);
alter table public.website_build_feedback add foreign key(applied_revision_id,session_id,project_id) references public.website_preview_revisions(id,session_id,project_id);
create index website_build_sessions_project on public.website_build_sessions(project_id);
create index website_build_feedback_pending on public.website_build_feedback(session_id,sequence);
create index website_build_current_run on public.website_build_sessions(current_run_id) where current_run_id is not null;
alter table public.website_build_sessions enable row level security;
alter table public.website_build_feedback enable row level security;
alter table public.website_preview_revisions enable row level security;
create policy website_sessions_project_read on public.website_build_sessions for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id));
create policy website_feedback_project_read on public.website_build_feedback for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id));
create policy website_revisions_project_read on public.website_preview_revisions for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id));
revoke all on public.website_build_sessions,public.website_build_feedback,public.website_preview_revisions from anon,authenticated;
grant select on public.website_build_sessions,public.website_build_feedback,public.website_preview_revisions to authenticated;
grant all on public.website_build_sessions,public.website_build_feedback,public.website_preview_revisions to service_role;

create function public.website_build_check_access(p_principal jsonb,p_project_id uuid,p_write boolean default false) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not coalesce((p_principal->'allowedProjectIds') ? p_project_id::text,false) or not exists(select 1 from public.projects p where p.id=p_project_id and (not p_write or p.owner_id=(p_principal->>'userId')::uuid)) then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
end $$;
create function public.website_build_view(p_principal jsonb,p_ref jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; feedback jsonb; revisions jsonb;
begin
 perform public.website_build_check_access(p_principal,(p_ref->>'projectId')::uuid);
 select * into strict s from public.website_build_sessions where id=(p_ref->>'sessionId')::uuid and project_id=(p_ref->>'projectId')::uuid;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'sequence',f.sequence,'authorId',f.author_id,'text',f.text,'inputSource',f.input_source,'viewedRevisionId',f.viewed_revision_id,'status',f.status,'interpretation',f.interpretation,'appliedRevisionId',f.applied_revision_id,'createdAt',f.created_at) order by f.sequence),'[]') into feedback from public.website_build_feedback f where f.session_id=s.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'number',r.number,'generation',r.generation,'feedbackSequence',r.feedback_sequence,'sha256',r.sha256,'createdAt',r.created_at,'pages',(select jsonb_agg(jsonb_build_object('key',p->>'key','title',p->>'title')) from jsonb_array_elements(r.artifact->'pages') p)) order by r.number),'[]') into revisions from public.website_preview_revisions r where r.session_id=s.id;
 return jsonb_build_object('projectId',s.project_id,'sessionId',s.id,'stateVersion',s.state_version,'conversationId',s.conversation_id,'status',s.status,'stage',s.stage,'agentId',s.agent_id,'activePreviewRevisionId',s.active_preview_revision_id,'controlRequested',s.control_requested,'updatedAt',s.updated_at,'revisions',revisions,'feedback',feedback);
end $$;
create function public.website_build_enqueue(p_session_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; rid uuid:=gen_random_uuid(); nextgen bigint;
begin
 select * into strict s from public.website_build_sessions where id=p_session_id for update;
 if s.current_run_id is not null then return s.current_run_id; end if;
 if s.control_requested is not null or s.status in ('paused','cancelled','cancelling') then raise exception 'CONTROL_PENDING' using errcode='55000'; end if;
 nextgen:=s.generation+1;
 insert into public.runs(id,project_id,workflow_id,kind,status,input,context,idempotency_key,policy_class) values(rid,s.project_id,null,'website.static.build.v1','pending',jsonb_build_object('projectId',s.project_id,'sessionId',s.id,'generation',nextgen,'feedbackSequence',s.feedback_seq),'{}','website:'||s.id||':'||nextgen,'non_destructive');
 update public.website_build_sessions set current_run_id=rid,generation=nextgen,status='queued',stage='Väntar på byggjobbet',state_version=state_version+1,updated_at=now() where id=s.id;
 return rid;
end $$;
create function public.website_build_create(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare sid uuid; s public.website_build_sessions; pid uuid:=(p_input->>'projectId')::uuid; uid uuid:=(p_principal->>'userId')::uuid;
begin
 perform public.website_build_check_access(p_principal,pid,true);
 if not exists(select 1 from public.agents where id=(p_input->>'agentId')::uuid and project_id=pid) or not exists(select 1 from public.conversations where id=(p_input->>'conversationId')::uuid and user_id=uid) then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 insert into public.website_build_sessions(project_id,created_by,agent_id,conversation_id,brief,idempotency_key) values(pid,uid,(p_input->>'agentId')::uuid,(p_input->>'conversationId')::uuid,p_input->>'brief',p_input->>'idempotencyKey') on conflict(project_id,created_by,idempotency_key) do nothing returning id into sid;
 select * into strict s from public.website_build_sessions where project_id=pid and created_by=uid and idempotency_key=p_input->>'idempotencyKey' for update;
 if s.brief is distinct from p_input->>'brief' or s.agent_id is distinct from (p_input->>'agentId')::uuid or s.conversation_id is distinct from (p_input->>'conversationId')::uuid then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
 if sid is not null then perform public.website_build_enqueue(s.id); end if;
 return public.website_build_view(p_principal,jsonb_build_object('projectId',pid,'sessionId',s.id));
end $$;
create function public.website_build_append_feedback(p_principal jsonb,p_ref jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; f public.website_build_feedback; uid uuid:=(p_principal->>'userId')::uuid; v uuid:=(p_input->>'viewedRevisionId')::uuid;
begin
 perform public.website_build_check_access(p_principal,(p_ref->>'projectId')::uuid,true);
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
create function public.website_build_lock_writer(p_writer jsonb,p_allow_pause boolean default false) returns public.website_build_sessions language plpgsql security invoker set search_path='' as $$
declare r public.runs; s public.website_build_sessions;
begin
 select * into r from public.runs where id=(p_writer->>'runId')::uuid for update;
 if not found or r.project_id is distinct from (p_writer->>'projectId')::uuid or r.claim_id is distinct from (p_writer->>'claimId')::uuid or r.status<>'running' or r.lease_until is null or r.lease_until<=clock_timestamp() or r.kind is distinct from 'website.static.build.v1' then raise exception 'WEBSITE_WRITER_FENCED' using errcode='40001'; end if;
 if r.cancel_requested then raise exception 'WEBSITE_RUN_CANCELLED' using errcode='57014'; end if;
 select * into s from public.website_build_sessions where id=(p_writer->>'sessionId')::uuid and project_id=r.project_id for update;
 if not found or s.current_run_id is distinct from r.id or s.generation is distinct from (p_writer->>'generation')::bigint or (r.input->>'generation')::bigint is distinct from s.generation then raise exception 'WEBSITE_WRITER_FENCED' using errcode='40001'; end if;
 if s.control_requested='cancel' then raise exception 'WEBSITE_RUN_CANCELLED' using errcode='57014'; end if;
 if not p_allow_pause and s.control_requested='pause' then raise exception 'WEBSITE_BUILD_PAUSING' using errcode='55000'; end if;
 return s;
end $$;
create function public.website_build_snapshot(p_writer jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; cutoff bigint; pending jsonb; previous jsonb; interp jsonb;
begin
 s:=public.website_build_lock_writer(p_writer,true);
 select (input->>'feedbackSequence')::bigint,context->'websiteInterpretation' into cutoff,interp from public.runs where id=s.current_run_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'sequence',f.sequence,'authorId',f.author_id,'text',f.text,'inputSource',f.input_source,'viewedRevisionId',f.viewed_revision_id,'status',f.status,'interpretation',f.interpretation,'appliedRevisionId',f.applied_revision_id,'createdAt',f.created_at) order by f.sequence),'[]') into pending from public.website_build_feedback f where f.session_id=s.id and f.sequence<=cutoff and (f.sequence>s.processed_feedback_seq or (f.status='acknowledged' and f.disposition='decision'));
 select artifact into previous from public.website_preview_revisions where id=s.active_preview_revision_id;
 return jsonb_build_object('writer',p_writer,'brief',s.brief,'agentId',s.agent_id,'feedback',pending,'previousArtifact',previous,'candidate',case when s.candidate_feedback_seq=cutoff then s.candidate else null end,'interpretation',coalesce(interp,case when s.candidate_feedback_seq=cutoff then s.interpretation else null end),'controlRequested',s.control_requested);
end $$;
create function public.website_build_record_interpretation(p_writer jsonb,p_interpretation jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; cutoff bigint; item jsonb; oldid text; f public.website_build_feedback;
begin
 s:=public.website_build_lock_writer(p_writer);
 select (input->>'feedbackSequence')::bigint into cutoff from public.runs where id=s.current_run_id;
 if jsonb_typeof(p_interpretation->'items')<>'array' then raise exception 'INVALID_INTERPRETATION' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_interpretation->'items') loop
  select * into strict f from public.website_build_feedback where id=(item->>'feedbackId')::uuid and session_id=s.id and sequence<=cutoff;
  if item->>'disposition' not in ('apply','answer','reject','decision') or length(item->>'summary')>2000 then raise exception 'INVALID_INTERPRETATION' using errcode='22023'; end if;
  update public.website_build_feedback set interpretation=item->>'summary',disposition=item->>'disposition',change_key=item->>'changeKey',status=case when item->>'disposition'='reject' then 'rejected' else 'acknowledged' end where id=f.id and status in ('received','acknowledged');
  for oldid in select value from jsonb_array_elements_text(item->'supersedesFeedbackIds') loop
   update public.website_build_feedback set status='superseded',superseded_by=f.id where id=oldid::uuid and session_id=s.id and sequence<f.sequence and change_key is not null and change_key=item->>'changeKey' and status in ('received','acknowledged');
   if not found then raise exception 'INVALID_SUPERSESSION' using errcode='22023'; end if;
  end loop;
 end loop;
 update public.runs set context=context||jsonb_build_object('websiteInterpretation',p_interpretation) where id=s.current_run_id;
 update public.website_build_sessions set interpretation=p_interpretation,status='building',stage='Tillämpar feedback',state_version=state_version+1,updated_at=now() where id=s.id;
 return jsonb_build_object('ok',true);
end $$;
create function public.website_build_validate_artifact(p_artifact jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if octet_length(p_artifact::text)>1048576 or p_artifact->>'format' is distinct from 'static-website.v1' or coalesce(p_artifact->>'sha256','') !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_artifact->'pages') is distinct from 'array' or jsonb_array_length(p_artifact->'pages') not between 1 and 8 then raise exception 'INVALID_ARTIFACT' using errcode='22023'; end if;
end $$;
create function public.website_build_save_candidate(p_writer jsonb,p_artifact jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; cutoff bigint;
begin
 s:=public.website_build_lock_writer(p_writer,true); perform public.website_build_validate_artifact(p_artifact);
 select (input->>'feedbackSequence')::bigint into cutoff from public.runs where id=s.current_run_id;
 update public.website_build_sessions set candidate=p_artifact,candidate_feedback_seq=cutoff,status=case when control_requested='pause' then 'pausing' else 'validating' end,stage='Kontrollerar sidpaketet',state_version=state_version+1,updated_at=now() where id=s.id;
 return jsonb_build_object('ok',true);
end $$;
create function public.website_build_park(p_writer jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; cutoff bigint; nextstatus text;
begin
 s:=public.website_build_lock_writer(p_writer,true);
 select (input->>'feedbackSequence')::bigint into cutoff from public.runs where id=s.current_run_id;
 nextstatus:=case when s.control_requested='pause' then 'paused' when exists(select 1 from public.website_build_feedback where session_id=s.id and sequence<=cutoff and status='acknowledged' and disposition='decision') then 'awaiting_decision' else 'ready' end;
 update public.runs set context=context||'{"websiteBuildCompleted":true}' where id=s.current_run_id;
 update public.website_build_sessions set current_run_id=null,status=nextstatus,stage=case when nextstatus='paused' then 'Bygget är pausat' when nextstatus='awaiting_decision' then 'Väntar på ditt beslut' else 'Atlas har svarat' end,control_requested=null,processed_feedback_seq=case when nextstatus='paused' then processed_feedback_seq else greatest(processed_feedback_seq,cutoff) end,state_version=state_version+1,updated_at=now() where id=s.id;
 if nextstatus<>'paused' and s.feedback_seq>cutoff then perform public.website_build_enqueue(s.id); end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.website_build_commit_revision(p_writer jsonb,p_artifact jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; cutoff bigint; r public.website_preview_revisions; nextnum bigint;
begin
 s:=public.website_build_lock_writer(p_writer); perform public.website_build_validate_artifact(p_artifact);
 select (input->>'feedbackSequence')::bigint into cutoff from public.runs where id=s.current_run_id;
 select coalesce(max(number),0)+1 into nextnum from public.website_preview_revisions where session_id=s.id;
 insert into public.website_preview_revisions(session_id,project_id,generation,number,feedback_sequence,sha256,artifact) values(s.id,s.project_id,s.generation,nextnum,cutoff,p_artifact->>'sha256',p_artifact) returning * into r;
 update public.website_build_feedback set status='applied',applied_revision_id=r.id where session_id=s.id and sequence<=cutoff and status='acknowledged' and disposition='apply';
 update public.runs set context=context||jsonb_build_object('websiteBuildCompleted',true,'websiteRevisionId',r.id) where id=s.current_run_id;
 update public.website_build_sessions set active_preview_revision_id=r.id,current_run_id=null,candidate=null,candidate_feedback_seq=null,interpretation=null,status='ready',stage='Previewversionen är klar',processed_feedback_seq=greatest(processed_feedback_seq,cutoff),state_version=state_version+1,updated_at=now() where id=s.id;
 if s.feedback_seq>cutoff then perform public.website_build_enqueue(s.id); end if;
 return jsonb_build_object('id',r.id,'number',r.number,'generation',r.generation,'feedbackSequence',r.feedback_sequence,'sha256',r.sha256,'createdAt',r.created_at,'pages',(select jsonb_agg(jsonb_build_object('key',p->>'key','title',p->>'title')) from jsonb_array_elements(r.artifact->'pages') p));
end $$;
create function public.website_build_control(p_principal jsonb,p_ref jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_build_sessions; rid uuid; action text:=p_input->>'action'; key text:=p_input->>'idempotencyKey';
begin
 perform public.website_build_check_access(p_principal,(p_ref->>'projectId')::uuid,true);
 select current_run_id into rid from public.website_build_sessions where id=(p_ref->>'sessionId')::uuid and project_id=(p_ref->>'projectId')::uuid;
 if rid is not null then perform 1 from public.runs where id=rid for update; end if;
 select * into strict s from public.website_build_sessions where id=(p_ref->>'sessionId')::uuid and project_id=(p_ref->>'projectId')::uuid for update;
 if s.current_run_id is distinct from rid then raise exception 'SESSION_CHANGED_RETRY' using errcode='40001'; end if;
 if key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' or action not in ('pause','resume','cancel') then raise exception 'INVALID_CONTROL' using errcode='22023'; end if;
 if s.control_keys ? key then
  if s.control_keys->>key<>action then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
  return public.website_build_view(p_principal,p_ref);
 end if;
 if s.status in ('cancelled','cancelling') and action<>'cancel' then raise exception 'BUILD_CANCELLED' using errcode='55000'; end if;
 if action='resume' then
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
create function public.website_build_read_artifact(p_principal jsonb,p_ref jsonb,p_revision_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare artifact jsonb;
begin
 perform public.website_build_check_access(p_principal,(p_ref->>'projectId')::uuid);
 select r.artifact into strict artifact from public.website_preview_revisions r where r.id=p_revision_id and r.session_id=(p_ref->>'sessionId')::uuid and r.project_id=(p_ref->>'projectId')::uuid;
 return artifact;
end $$;
create function public.website_build_revision_immutable() returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'IMMUTABLE_PREVIEW_REVISION' using errcode='55000'; end $$;
create trigger website_preview_revision_immutable before update on public.website_preview_revisions for each row execute function public.website_build_revision_immutable();
create function public.website_build_reconcile_run() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.kind='website.static.build.v1' and new.status is distinct from old.status then
  update public.website_build_sessions set control_requested=case when new.status in ('failed','cancelled','done') then null else control_requested end,current_run_id=case when new.status in ('failed','cancelled','done') then null else current_run_id end,status=case when new.status='cancelled' then 'cancelled' when new.status in ('failed','done') then 'failed' when new.status='pending' and control_requested='pause' then 'pausing' when new.status='pending' then 'queued' else status end,stage=case when new.status='cancelled' then 'Bygget är avbrutet' when new.status='failed' then 'Byggjobbet misslyckades; senaste preview finns kvar' when new.status='done' then 'Ingen verifierad version levererades' when new.status='pending' and control_requested='pause' then 'Pausar vid nästa stegräns' when new.status='pending' then 'Väntar på nästa försök' else stage end,state_version=state_version+1,updated_at=now() where current_run_id=new.id;
 end if;
 return new;
end $$;
create trigger website_build_run_reconcile after update of status on public.runs for each row execute function public.website_build_reconcile_run();
-- Every new RPC and internal helper is service-only; no public definer functions.
do $$ declare f record; begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'website_build_%' loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); execute format('grant execute on function %s to service_role',f.signature); end loop; end $$;
commit;
