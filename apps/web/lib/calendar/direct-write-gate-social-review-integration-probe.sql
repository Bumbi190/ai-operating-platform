-- TEST-ONLY SIGNED REVIEW/CANCEL INTEGRATION. DO NOT MIGRATE.
-- The signed revision gate is acquired before project/job row locks.
-- AFTER table triggers bump protected DML once PER changed publication/job row.
-- Propose and revoke also bump once for metadata decision/batch writes outside
-- the two protected tables. Approval relies on at least one job INSERT.
-- This is source-consistency protection, NOT user/publishing authorization.
create or replace function public.social_schedule_cancel_jobs(p_approval uuid,p_actor uuid,p_reason text) returns void language plpgsql security invoker set search_path='' as $fn$
declare j public.social_schedule_jobs;r public.social_publications;next_state text;old_state text;
 guard_project uuid;
begin
 -- Helper may also be called directly by service_role. Resolve the approval
 -- project WITHOUT row locks before acquiring its signed source gate.
 select d.project_id into guard_project from public.social_schedule_decisions d
 where d.id=p_approval and d.action='approve';
 if guard_project is null then return;end if;
 perform public.calendar_source_gate_begin_probe(guard_project);
 for j in select * from public.social_schedule_jobs where approval_id=p_approval and state not in ('published','failed','uncertain','cancelled') for update loop
  select * into r from public.social_publications where id=j.publication_id for update;
  next_state=case when r.state='published' then 'published' when r.state in ('creating','publishing','uncertain') then 'uncertain' else 'cancelled' end;
  if r.state in ('creating','publishing') then
   old_state=r.state;
   update public.social_publications set state='uncertain',version=version+1,updated_at=public.social_schedule_now(),failure_code='receipt_unavailable',capability_hash=null,capability_expires_at=null where id=r.id returning * into r;
   insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,details) values(r.id,r.project_id,'uncertain',old_state,'uncertain',r.version,p_actor,jsonb_build_object('reason',p_reason,'jobId',j.id));
  end if;
  update public.social_schedule_jobs set state=next_state,version=version+1,reason=p_reason,claim_id=null,lease_expires_at=null,updated_at=public.social_schedule_now() where id=j.id;
  insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,actor,details) values(j.project_id,j.id,j.batch_revision_id,'revoked','owner',p_actor,jsonb_build_object('reason',p_reason,'state',next_state));
 end loop;
end $fn$;

create or replace function public.social_schedule_propose(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid;previous public.social_schedule_batches;b public.social_schedule_batches;a public.social_schedule_decisions;batch uuid;seq integer;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform public.social_schedule_fields(p_input,array['projectId','manifest','expectedRevisionId','idempotencyKey']);
 if coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 perform public.calendar_source_gate_begin_probe(project);
 perform 1 from public.projects where id=project for update;perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_content_active(project);
 select * into b from public.social_schedule_batches where project_id=project and idempotency_key=p_input->>'idempotencyKey';
 if b.id is not null then if b.input_data is distinct from p_input then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;return public.social_schedule_batch_view(b);end if;
 perform public.social_schedule_validate_manifest(project,p_input->'manifest');
 if p_input->>'expectedRevisionId' is null then batch=gen_random_uuid();seq=1;
 else
  select * into previous from public.social_schedule_batches where id=(p_input->>'expectedRevisionId')::uuid and project_id=project;
  if previous.id is null or exists(select 1 from public.social_schedule_batches where batch_id=previous.batch_id and sequence>previous.sequence) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
  batch=previous.batch_id;seq=previous.sequence+1;
  select * into a from public.social_schedule_decisions d where d.batch_revision_id=previous.id and d.action='approve' and not exists(select 1 from public.social_schedule_decisions revoke where revoke.approval_id=d.id);
  if a.id is not null then
   insert into public.social_schedule_decisions(project_id,batch_revision_id,action,actor,approval_id,reason,idempotency_key,input_data)
   values(project,previous.id,'revoke',(p_principal->>'userId')::uuid,a.id,'revision_changed','revision-'||a.id,jsonb_build_object('newProposalKey',p_input->>'idempotencyKey'));
   perform public.social_schedule_cancel_jobs(a.id,(p_principal->>'userId')::uuid,'revision_changed');
  end if;
 end if;
 insert into public.social_schedule_batches(batch_id,project_id,sequence,manifest,sha256,created_by,idempotency_key,input_data)
 values(batch,project,seq,p_input->'manifest',encode(sha256(convert_to(public.social_schedule_canonical(p_input->'manifest'),'UTF8')),'hex'),(p_principal->>'userId')::uuid,p_input->>'idempotencyKey',p_input) returning * into b;
 insert into public.social_schedule_events(project_id,batch_revision_id,event,actor_kind,actor) values(project,b.id,'proposed','owner',(p_principal->>'userId')::uuid);
 perform public.calendar_social_source_bump_probe(p_principal,p_input);
 return public.social_schedule_batch_view(b);
end $fn$;

create or replace function public.social_schedule_approve(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid;b public.social_schedule_batches;a public.social_schedule_decisions;v jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform public.social_schedule_fields(p_input,array['projectId','batchId','revisionId','sha256','confirmed','idempotencyKey']);
 if p_input->'confirmed' is distinct from 'true'::jsonb or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 perform public.calendar_source_gate_begin_probe(project);
 perform 1 from public.projects where id=project for update;perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_content_active(project);
 select * into b from public.social_schedule_batches where id=(p_input->>'revisionId')::uuid and batch_id=(p_input->>'batchId')::uuid and project_id=project and sha256=p_input->>'sha256';
 if b.id is null or exists(select 1 from public.social_schedule_batches where batch_id=b.batch_id and sequence>b.sequence) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 select * into a from public.social_schedule_decisions where project_id=project and idempotency_key=p_input->>'idempotencyKey';
 if a.id is not null then if a.input_data is distinct from p_input then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;return public.social_schedule_batch_view(b);end if;
 if exists(select 1 from public.social_schedule_decisions where batch_revision_id=b.id) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 perform public.social_schedule_validate_manifest(project,b.manifest);
 -- An occasion has one immutable identity across all approved batches.
 if exists(select 1 from (
  select j.occasion_id::text occasion_id,j.channel,j.scheduled_at,j.item->>'kind' kind,(j.item->'releaseCondition')::text condition from public.social_schedule_jobs j where j.project_id=project and j.state<>'cancelled'
  union all select mi.value->>'occasionId',mi.value->>'channel',(mi.value->>'scheduledAt')::timestamptz,mi.value->>'kind',(mi.value->'releaseCondition')::text from jsonb_array_elements(b.manifest->'items') mi(value)
 ) combined group by occasion_id having count(*)>2 or count(*)>count(distinct channel) or count(distinct scheduled_at)>1 or count(distinct kind)>1 or count(distinct condition)>1) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 if exists(select 1 from (
  select j.occasion_id::text occasion_id,j.scheduled_at from public.social_schedule_jobs j where j.project_id=project and j.state<>'cancelled'
  union all select mi.value->>'occasionId',(mi.value->>'scheduledAt')::timestamptz from jsonb_array_elements(b.manifest->'items') mi(value)
 ) occasions group by date_trunc('week',scheduled_at at time zone 'Europe/Stockholm') having count(distinct occasion_id)>3) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 if exists(select 1 from jsonb_array_elements(b.manifest->'items') mi(value) join public.social_publications p on p.project_id=project and p.post_id=(mi.value->>'postId')::uuid) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 insert into public.social_schedule_decisions(project_id,batch_revision_id,action,actor,idempotency_key,input_data)
 values(project,b.id,'approve',(p_principal->>'userId')::uuid,p_input->>'idempotencyKey',p_input) returning * into a;
 for v in select value from jsonb_array_elements(b.manifest->'items') loop
  insert into public.social_schedule_jobs(project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item,release_month)
  values(project,b.id,a.id,(v->>'postId')::uuid,(v->>'revisionId')::uuid,v->>'sha256',v->>'channel',(v->>'occasionId')::uuid,(v->>'scheduledAt')::timestamptz,(v->>'expiresAt')::timestamptz,v,v->'releaseCondition'->>'releaseMonth');
 end loop;
 insert into public.social_schedule_events(project_id,batch_revision_id,event,actor_kind,actor,details) values(project,b.id,'approved','owner',a.actor,jsonb_build_object('approvalId',a.id,'manifestSha256',b.sha256));
 return public.social_schedule_batch_view(b);
end $fn$;

create or replace function public.social_schedule_revoke(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid;b public.social_schedule_batches;a public.social_schedule_decisions;view jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_schedule_fields(p_input,array['projectId','batchId','expectedVersion']);
 perform public.calendar_source_gate_begin_probe(project);
 perform 1 from public.projects where id=project for update;perform public.social_launch_assert_owner(p_principal,p_input);
 select * into b from public.social_schedule_batches where project_id=project and batch_id=(p_input->>'batchId')::uuid order by sequence desc limit 1;
 if b.id is null then raise exception 'SOCIAL_SCHEDULE_NOT_FOUND' using errcode='P0002';end if;
 view=public.social_schedule_batch_view(b);
 if (view->>'version')::integer<>(p_input->>'expectedVersion')::integer then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 if view->>'status'='revoked' then return view;end if;
 select * into a from public.social_schedule_decisions where batch_revision_id=b.id and action='approve';
 if a.id is null then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 insert into public.social_schedule_decisions(project_id,batch_revision_id,action,actor,approval_id,reason,idempotency_key,input_data)
 values(project,b.id,'revoke',(p_principal->>'userId')::uuid,a.id,'owner_revoked','revoke-'||a.id,p_input);
 perform public.social_schedule_cancel_jobs(a.id,(p_principal->>'userId')::uuid,'owner_revoked');
 perform public.calendar_social_source_bump_probe(p_principal,p_input);
 return public.social_schedule_batch_view(b);
end $fn$;
revoke all on function public.social_schedule_cancel_jobs(uuid,uuid,text),
 public.social_schedule_propose(jsonb,jsonb), public.social_schedule_approve(jsonb,jsonb),
 public.social_schedule_revoke(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.social_schedule_cancel_jobs(uuid,uuid,text),
 public.social_schedule_propose(jsonb,jsonb), public.social_schedule_approve(jsonb,jsonb),
 public.social_schedule_revoke(jsonb,jsonb) to service_role;
