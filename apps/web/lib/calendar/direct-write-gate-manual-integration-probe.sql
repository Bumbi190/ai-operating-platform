-- EXPERIMENTAL COMPOSITION: the final manual publication SQL functions from
-- 20261018071209_social_schedule_batches.sql use a signed source-first gate.
-- The AFTER table trigger handles version bumps; DO NOT retain the previous
-- explicit helper bumps, or the same write will increment twice.
-- This is NOT a migration and does not authorize production publishing.
-- ISOLATED SQL PROTOTYPE ONLY. No production migration, no provider POST.
-- Exact final (post-overlay) functions from 20261018071209_social_schedule_batches.sql.
-- Only source lock-before-project and source bump-after-real-change added.
-- The prior test-only social month helper must be loaded in the fixture.
create or replace function public.social_publication_prepare(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;c public.social_content_revisions;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if (select count(*) from jsonb_object_keys(p_input))<>8 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId','revisionId','sha256','decisionId','bindingId','idempotencyKey','confirmed'))
 or p_input->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'idempotencyKey') is distinct from 'string' or p_input->>'idempotencyKey' !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
 -- Lock the owner/project source revision BEFORE existing project/publication row locks.
 perform public.calendar_source_gate_begin_probe((p_input->>'projectId')::uuid);
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;
 perform public.social_launch_assert_owner(p_principal,p_input);
 if not exists(select 1 from public.social_content_posts where id=(p_input->>'postId')::uuid and project_id=(p_input->>'projectId')::uuid) then raise exception 'SOCIAL_PUBLICATION_NOT_FOUND' using errcode='P0002';end if;
 select * into r from public.social_publications where project_id=(p_input->>'projectId')::uuid and idempotency_key=p_input->>'idempotencyKey';
 if r.id is null then select * into r from public.social_publications where post_id=(p_input->>'postId')::uuid and project_id=(p_input->>'projectId')::uuid;end if;
 if r.id is not null then
  if r.authority_source='scheduled' then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED';end if;
  if r.request_input-'idempotencyKey' is distinct from p_input-'idempotencyKey' then raise exception 'SOCIAL_PUBLICATION_CONFLICT';end if;
  return public.social_publication_record(r);
 end if;
 c=public.social_publication_guard(p_principal,p_input);
 insert into public.social_publications(project_id,post_id,revision_id,sha256,decision_id,binding_id,channel,account_id,account_label,request_input,idempotency_key,requested_by)
 values(c.project_id,c.post_id,c.id,c.sha256,(p_input->>'decisionId')::uuid,c.binding_id,c.draft->>'channel',c.binding->>'accountId',c.binding->>'label',p_input,p_input->>'idempotencyKey',(p_principal->>'userId')::uuid) returning * into r;
 insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor) values(r.id,r.project_id,'requested',null,r.state,r.version,(p_principal->>'userId')::uuid);
 return public.social_publication_record(r);
end $fn$;

create or replace function public.social_publication_step(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;old_state text;action text;next_state text;c public.social_content_revisions;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId','publicationId','expectedVersion','action','capabilityHash','containerId','providerId','permalink','failureCode'))
 or coalesce(p_input->>'action','') not in ('claim_create','container_ready','claim_publish','complete','fail','uncertain','confirm_published')
 or jsonb_typeof(p_input->'expectedVersion') is distinct from 'number' then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
 -- Lock the owner/project source revision BEFORE existing project/publication row locks.
 perform public.calendar_source_gate_begin_probe((p_input->>'projectId')::uuid);
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;
 perform public.social_launch_assert_owner(p_principal,p_input);
 select * into r from public.social_publications where id=(p_input->>'publicationId')::uuid and project_id=(p_input->>'projectId')::uuid and post_id=(p_input->>'postId')::uuid for update;
 if not found then raise exception 'SOCIAL_PUBLICATION_NOT_FOUND' using errcode='P0002';end if;
 if r.authority_source='scheduled' then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED';end if;
 if r.version<>(p_input->>'expectedVersion')::integer then return jsonb_build_object('changed',false,'record',public.social_publication_record(r));end if;
 action=p_input->>'action';old_state=r.state;
 next_state=case
  when action='claim_create' and r.state='requested' then case when r.channel='instagram' then 'creating' else 'publishing' end
  when action='container_ready' and r.channel='instagram' and r.state='creating' then 'processing'
  when action='claim_publish' and r.channel='instagram' and r.state='processing' then 'publishing'
  when action='complete' and r.state='publishing' then 'published'
  when action='fail' and r.state in ('creating','processing','publishing') then 'failed'
  when action='uncertain' and r.state in ('creating','publishing') then 'uncertain'
  when action='confirm_published' and r.channel='instagram' and r.container_id is not null and r.state in ('processing','publishing','uncertain') then 'published'
  else null end;
 if next_state is null then return jsonb_build_object('changed',false,'record',public.social_publication_record(r));end if;
 if action in ('claim_create','claim_publish') then
  c=public.social_publication_guard(p_principal,r.request_input);
  if action='claim_create' and c.draft->>'format'='image' then
   if coalesce(p_input->>'capabilityHash','') !~ '^[a-f0-9]{64}$' then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
   r.capability_hash=p_input->>'capabilityHash';r.capability_expires_at=now()+interval '15 minutes';
  end if;
 end if;
 if action='container_ready' then
  if coalesce(p_input->>'containerId','') !~ '^[0-9]{1,80}$' then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;r.container_id=p_input->>'containerId';
 end if;
 if action='claim_publish' and r.container_id is null then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
 if action='complete' then
  if coalesce(p_input->>'providerId','') !~ '^[0-9]{1,80}(_[0-9]{1,80})?$'
  or p_input->>'permalink' is not null and not(case when r.channel='instagram' then p_input->>'permalink' ~ '^https://www[.]instagram[.]com/[^[:space:]]+$' else p_input->>'permalink' ~ '^https://www[.]facebook[.]com/[^[:space:]]+$' end)
  then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
  r.provider_id=p_input->>'providerId';r.permalink=p_input->>'permalink';r.confirmation='provider_id';r.failure_code=null;
 end if;
 if action='confirm_published' then r.confirmation='container_status';r.failure_code=null;end if;
 if action in ('fail','uncertain') then
  if coalesce(p_input->>'failureCode','') not in ('provider_denied','provider_unavailable','invalid_response','receipt_unavailable') then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;r.failure_code=p_input->>'failureCode';
 end if;
 if next_state in ('published','failed') then r.capability_hash=null;r.capability_expires_at=null;end if;
 update public.social_publications set state=next_state,version=version+1,updated_at=now(),container_id=r.container_id,provider_id=r.provider_id,permalink=r.permalink,failure_code=r.failure_code,confirmation=r.confirmation,capability_hash=r.capability_hash,capability_expires_at=r.capability_expires_at where id=r.id returning * into r;
 insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor) values(r.id,r.project_id,action,old_state,r.state,r.version,(p_principal->>'userId')::uuid);
 return jsonb_build_object('changed',true,'record',public.social_publication_record(r));
end $fn$;
revoke all on function public.social_publication_prepare(jsonb,jsonb),
 public.social_publication_step(jsonb,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.social_publication_prepare(jsonb,jsonb),
 public.social_publication_step(jsonb,jsonb) to service_role;
