\set ON_ERROR_STOP on
-- Disposable PG16/17 only. Canonical public.social_publications plus
-- canonical schedule batches/decisions/jobs/events and monthly rules,
-- composite FKs, RLS and immutable evidence triggers are loaded directly
-- from checked-in migrations. No dispatch, provider or cron is present.
set role service_role;
do $$
declare
 v_project constant uuid := '77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid;
 v_owner constant uuid := '77777777-7777-4777-8777-777777777777'::uuid;
 v_batch constant uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid;
 v_approval constant uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid;
 v_principal jsonb:=jsonb_build_object('userId',v_owner,
  'allowedProjectIds',jsonb_build_array(v_project));
 r public.social_content_revisions%rowtype;
 item jsonb;
begin
 if (select count(*) from public.social_content_revisions)<>5
 or (select count(*) from public.social_content_decisions)<>0
 or (select count(*) from public.social_weekly_preparations)<>1
 or (select count(*) from public.social_schedule_batches)<>0
 or (select count(*) from public.social_schedule_decisions)<>0
 or (select count(*) from public.social_schedule_jobs)<>0
 or (select count(*) from public.social_publications)<>0
 or (select count(*) from public.social_publication_events)<>0
 or (select count(*) from public.social_monthly_release_evidence)<>0 then
   raise exception 'NATIVE_SCHEDULE_REVIEW_ONLY_BASELINE_VIOLATED';
 end if;
 if has_table_privilege('authenticated','public.social_schedule_jobs','SELECT')
 or has_table_privilege('authenticated','public.social_publications','SELECT')
 or has_table_privilege('authenticated','public.social_schedule_decisions','INSERT')
 or not has_table_privilege('service_role','public.social_schedule_jobs','SELECT')
 or not has_table_privilege('service_role','public.social_publications','SELECT')
 or (select (rule->>'enabled')::boolean from public.social_monthly_release_rules
      where project_id=v_project) is distinct from false then
  raise exception 'NATIVE_SCHEDULE_ACL_OR_MONTHLY_RULE_MISMATCH';
 end if;
 select cr.* into strict r
 from public.social_content_revisions cr
 where cr.project_id=v_project and cr.draft->>'channel'='facebook'
   and cr.draft->>'scheduledAt' is not null
 order by cr.created_at,cr.id limit 1;
 item:=jsonb_build_object(
  'postId',r.post_id,'revisionId',r.id,'sha256',r.sha256,
  'decisionId',gen_random_uuid(),'planRevisionId',r.plan_revision_id,
  'bindingId',r.binding_id,'accountId',r.binding->>'accountId',
  'channel',r.draft->>'channel',
  'asset',jsonb_build_object('id',r.media->0->>'id',
     'sha256',r.media->0->>'sha256'),
  'localMinute','2027-01-05T17:00','scheduledAt',r.draft->>'scheduledAt',
  'expiresAt','2027-01-05T16:10:00.000Z',
  'occasionId',gen_random_uuid(),'kind','ordinary',
  'releaseCondition',null
 );
 -- Real schedule item guard rejects a draft without the owner's
 -- approval of its exact content revision.
 begin
  perform public.social_schedule_item_guard(v_project,item);
  raise exception 'NATIVE_SCHEDULE_UNREVIEWED_DRAFT_ACCEPTED';
 exception when others then
  if sqlerrm<>'SOCIAL_SCHEDULE_REVIEW_REQUIRED' then raise;end if;
 end;
 -- Real manual publication guard independently rejects the same draft.
 begin
  perform public.social_publication_guard(v_principal,
   jsonb_build_object(
     'projectId',v_project,'conversationId',
     '55555555-5555-4555-8555-555555555555',
     'postId',r.post_id,'revisionId',r.id,'sha256',r.sha256,
     'decisionId',gen_random_uuid(),'bindingId',r.binding_id));
  raise exception 'NATIVE_PUBLICATION_UNREVIEWED_DRAFT_ACCEPTED';
 exception when others then
  if sqlerrm<>'SOCIAL_PUBLICATION_REVIEW_REQUIRED' then raise;end if;
 end;
 -- Published without provider receipt cannot be inserted, even by the
 -- privileged test role. Check verification precedes composite FK lookup.
 begin
  insert into public.social_publications(
   project_id,post_id,revision_id,sha256,decision_id,binding_id,
   channel,account_id,state,request_input,idempotency_key,requested_by
  ) values(
   v_project,r.post_id,r.id,r.sha256,gen_random_uuid(),r.binding_id,
   'facebook','fixture-fb','published','{}'::jsonb,
   'invalid_published_without_receipt',v_owner);
  raise exception 'NATIVE_PUBLICATION_MISSING_RECEIPT_ACCEPTED';
 exception when check_violation then null;end;
 -- Scheduled authority without a real schedule job is also impossible.
 begin
  insert into public.social_publications(
   project_id,post_id,revision_id,sha256,decision_id,binding_id,
   channel,account_id,state,request_input,idempotency_key,requested_by,
   authority_source,job_id
  ) values(
   v_project,r.post_id,r.id,r.sha256,gen_random_uuid(),r.binding_id,
   'facebook','fixture-fb','requested','{}'::jsonb,
   'invalid_scheduled_missing_job',v_owner,'scheduled',null);
  raise exception 'NATIVE_PUBLICATION_UNBOUND_SCHEDULE_AUTHORITY_ACCEPTED';
 exception when check_violation then null;end;
 -- Positive dummy batch/decision remain in a rollback-only subtransaction.
 -- No actual schedule authority survives, and no provider job executes.
 begin
  insert into public.social_schedule_batches(
   id,batch_id,project_id,sequence,manifest,sha256,created_by,
   idempotency_key,input_data
  ) values(
   v_batch,gen_random_uuid(),v_project,1,
   '{}'::jsonb,repeat('a',64),v_owner,
   'disposable_schedule_batch','{}'::jsonb
  );
  insert into public.social_schedule_decisions(
   id,project_id,batch_revision_id,action,actor,
   idempotency_key,input_data
  ) values(
   v_approval,v_project,v_batch,'approve',v_owner,
   'disposable_schedule_decision','{}'::jsonb
  );
  -- A fake job whose expiry is not exactly 10 minutes after its start
  -- must fail the actual CHECK even with correct FK references.
  begin
   insert into public.social_schedule_jobs(
     project_id,batch_revision_id,approval_id,post_id,revision_id,
     revision_sha256,channel,occasion_id,scheduled_at,expires_at,item
   ) values(
     v_project,v_batch,v_approval,r.post_id,r.id,r.sha256,'facebook',
     gen_random_uuid(),'2027-01-05T16:00:00Z'::timestamptz,
     '2027-01-05T16:12:00Z'::timestamptz,
     jsonb_build_object('kind','ordinary')
   );
   raise exception 'NATIVE_SCHEDULE_INVALID_EXPIRY_ACCEPTED';
  exception when check_violation then null;end;
  -- Service role has SELECT/INSERT only; it must NOT receive direct
  -- UPDATE/DELETE permissions on immutable schedule approval batches.
  if has_table_privilege('service_role','public.social_schedule_batches','UPDATE')
  or has_table_privilege('service_role','public.social_schedule_decisions','UPDATE') then
   raise exception 'NATIVE_SCHEDULE_SERVICE_ROLE_CAN_MUTATE_IMMUTABLE_RECORDS';
  end if;
  raise exception 'NATIVE_SCHEDULE_TEMP_AUTHORITY_ROLLBACK';
 exception when others then
  if sqlerrm<>'NATIVE_SCHEDULE_TEMP_AUTHORITY_ROLLBACK' then raise;end if;
 end;
 if (select count(*) from public.social_schedule_batches)<>0
 or (select count(*) from public.social_schedule_decisions)<>0
 or (select count(*) from public.social_schedule_jobs)<>0
 or (select count(*) from public.social_publications)<>0
 or (select count(*) from public.social_content_decisions)<>0 then
  raise exception 'NATIVE_SCHEDULE_TEST_CREATED_REAL_APPROVAL_OR_PUBLICATION';
 end if;
end $$;
reset role;

-- A superuser has the necessary UPDATE privilege, so an attempted batch
-- mutation must be rejected by the canonical immutable trigger itself,
-- not merely by the service-role ACL. The inserted batch is rolled back.
do $$
declare
 v_project constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid;
 v_owner constant uuid:='77777777-7777-4777-8777-777777777777'::uuid;
 v_batch constant uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid;
begin
 begin
  insert into public.social_schedule_batches(
   id,batch_id,project_id,sequence,manifest,sha256,created_by,
   idempotency_key,input_data
  ) values(
   v_batch,gen_random_uuid(),v_project,1,'{}'::jsonb,
   repeat('a',64),v_owner,'disposable_immutable_trigger','{}'::jsonb
  );
  begin
   update public.social_schedule_batches set manifest='{"changed":true}'::jsonb
   where id=v_batch;
   raise exception 'NATIVE_SCHEDULE_IMMUTABLE_TRIGGER_BYPASSED';
  exception when insufficient_privilege then
   if sqlerrm<>'SOCIAL_LAUNCH_IMMUTABLE' then raise;end if;
  end;
  raise exception 'NATIVE_SCHEDULE_TRIGGER_TEST_ROLLBACK';
 exception when others then
  if sqlerrm<>'NATIVE_SCHEDULE_TRIGGER_TEST_ROLLBACK' then raise;end if;
 end;
 if (select count(*) from public.social_schedule_batches)<>0 then
  raise exception 'NATIVE_SCHEDULE_TRIGGER_TEST_LEFT_BATCH';
 end if;
end $$;
select 'FAMILY_WEEKLY_CANONICAL_SCHEDULE_PUBLICATION_GUARDS_PASS' as result;
