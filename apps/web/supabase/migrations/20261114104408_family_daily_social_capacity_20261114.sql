-- Approved daily Family campaign 2026-11-14..2026-12-31. Existing ACLs/search_path/owner/STOP/revision/receipt guards are preserved.
CREATE OR REPLACE FUNCTION public.social_schedule_approve(p_principal jsonb, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare project uuid=(p_input->>'projectId')::uuid;b public.social_schedule_batches;a public.social_schedule_decisions;v jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform public.social_schedule_fields(p_input,array['projectId','batchId','revisionId','sha256','confirmed','idempotencyKey']);
 if p_input->'confirmed' is distinct from 'true'::jsonb or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
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
 ) occasions group by date_trunc('week',scheduled_at at time zone 'Europe/Stockholm') having count(distinct occasion_id)>case when project='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid and bool_and((scheduled_at at time zone 'Europe/Stockholm')::date between date '2026-11-14' and date '2026-12-31') then 7 else 3 end) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 -- Daily authority is one paired FB/IG occasion per Stockholm day, only during the mandate.
 if project='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid and exists(
 select 1 from (
 select j.occasion_id::text occasion_id,j.scheduled_at from public.social_schedule_jobs j where j.project_id=project and j.state<>'cancelled'
 union all select mi.value->>'occasionId',(mi.value->>'scheduledAt')::timestamptz from jsonb_array_elements(b.manifest->'items') mi(value)
 ) daily where (scheduled_at at time zone 'Europe/Stockholm')::date between date '2026-11-14' and date '2026-12-31'
 group by (scheduled_at at time zone 'Europe/Stockholm')::date having count(distinct occasion_id)>1
 ) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 if exists(select 1 from jsonb_array_elements(b.manifest->'items') mi(value) join public.social_publications p on p.project_id=project and p.post_id=(mi.value->>'postId')::uuid) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 insert into public.social_schedule_decisions(project_id,batch_revision_id,action,actor,idempotency_key,input_data)
 values(project,b.id,'approve',(p_principal->>'userId')::uuid,p_input->>'idempotencyKey',p_input) returning * into a;
 for v in select value from jsonb_array_elements(b.manifest->'items') loop
  insert into public.social_schedule_jobs(project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item,release_month)
  values(project,b.id,a.id,(v->>'postId')::uuid,(v->>'revisionId')::uuid,v->>'sha256',v->>'channel',(v->>'occasionId')::uuid,(v->>'scheduledAt')::timestamptz,(v->>'expiresAt')::timestamptz,v,v->'releaseCondition'->>'releaseMonth');
 end loop;
 insert into public.social_schedule_events(project_id,batch_revision_id,event,actor_kind,actor,details) values(project,b.id,'approved','owner',a.actor,jsonb_build_object('approvalId',a.id,'manifestSha256',b.sha256));
 return public.social_schedule_batch_view(b);
end $function$
;
CREATE OR REPLACE FUNCTION public.social_content_save(p_principal jsonb, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare project uuid=(p_input->>'projectId')::uuid; actor uuid=(p_principal->>'userId')::uuid; post uuid=(p_input->>'postId')::uuid;
 root public.social_content_posts; previous public.social_content_revisions; draft jsonb=p_input->'draft'; plan public.social_launch_plan_revisions; media jsonb; binding public.social_account_bindings; binding_json jsonb; rid uuid; seq integer;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','conversationId','postId','expectedRevisionId','planRevisionId','idempotencyKey','draft'))
 or not(p_input?'expectedRevisionId') or p_input->>'postId' is null or p_input->>'planRevisionId' is null or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'SOCIAL_CONTENT_INVALID_BODY';end if;
 perform 1 from public.projects where id=project for update;perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_content_active(project);
 select * into previous from public.social_content_revisions where project_id=project and idempotency_key=p_input->>'idempotencyKey';
 if previous.id is not null then
 if previous.input_data is distinct from p_input or previous.created_by<>actor then raise exception 'SOCIAL_CONTENT_REVISION_CONFLICT';end if;
 return public.social_content_read(p_principal,jsonb_build_object('projectId',project));end if;
 perform public.social_content_validate(draft);
 select r.* into plan from public.social_launch_plans p join public.social_launch_plan_revisions r on r.id=p.current_revision_id and r.project_id=p.project_id
 join public.social_launch_plan_decisions d on d.project_id=r.project_id and d.revision_id=r.id and d.sha256=r.sha256 and d.decision='approve' where p.project_id=project and r.id=(p_input->>'planRevisionId')::uuid;
 if plan.id is null or not exists(select 1 from jsonb_array_elements(plan.choices) c where c->>'channel'=draft->>'channel') then raise exception 'SOCIAL_CONTENT_REVIEW_REQUIRED';end if;
 if exists(select 1 from jsonb_array_elements_text(draft->'mediaIds') m where not exists(select 1 from public.assets a where a.id=m::uuid and a.project_id=project and a.status='active' and a.kind=draft->>'format' and a.mime_type in ('image/png','image/jpeg','image/webp','image/gif','image/avif','video/mp4','video/webm'))) then raise exception 'SOCIAL_CONTENT_INVALID_BODY';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'sha256',a.checksum_sha256,'mimeType',a.mime_type,'width',a.width,'height',a.height) order by m.ord),'[]') into media
 from jsonb_array_elements_text(draft->'mediaIds') with ordinality m(id,ord) join public.assets a on a.id=m.id::uuid;
 select * into binding from public.social_account_bindings where project_id=project and platform=draft->>'channel' and superseded_at is null;
 if binding.blocked_at is not null then raise exception 'SOCIAL_CONTENT_REVIEW_REQUIRED';end if;
 binding_json=case when binding.binding_id is null then null else jsonb_build_object('id',binding.binding_id,'accountId',binding.external_account_id,'label',binding.account_label) end;
 select * into root from public.social_content_posts where id=post for update;
 if root.id is not null and root.project_id<>project then raise exception 'SOCIAL_CONTENT_NOT_FOUND' using errcode='P0002';end if;
 if root.current_revision_id is distinct from (p_input->>'expectedRevisionId')::uuid then raise exception 'SOCIAL_CONTENT_REVISION_CONFLICT';end if;
 if root.id is null then
 if (select count(*) from public.social_content_posts where project_id=project)>=(case when project='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid then 200 else 100 end) then raise exception 'SOCIAL_CONTENT_LIMIT_REACHED';end if;
 insert into public.social_content_posts(id,project_id,created_by) values(post,project,actor);end if;
 select coalesce(max(sequence),0)+1 into seq from public.social_content_revisions where post_id=post;
 insert into public.social_content_revisions(post_id,project_id,sequence,plan_revision_id,sha256,draft,media,binding_id,binding,conversation_id,input_data,idempotency_key,created_by)
 values(post,project,seq,plan.id,encode(sha256(convert_to(jsonb_build_object('draft',draft,'media',media,'bindingId',binding.binding_id,'planRevisionId',plan.id)::text,'UTF8')),'hex'),draft,media,binding.binding_id,binding_json,(p_input->>'conversationId')::uuid,p_input,p_input->>'idempotencyKey',actor) returning id into rid;
 update public.social_content_posts set current_revision_id=rid where id=post and project_id=project;
 return public.social_content_read(p_principal,jsonb_build_object('projectId',project));
end $function$
;
