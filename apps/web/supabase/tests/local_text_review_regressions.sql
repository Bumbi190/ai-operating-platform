\set ON_ERROR_STOP on
begin;
do $$begin if to_regclass('public.local_text_jobs') is null then raise exception 'local_text_jobs missing';end if;end$$;
insert into auth.users(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into projects(id,owner_id) values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into conversations(id,user_id) values('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into local_text_devices(id,owner_id,key_id,public_jwk,build_hash,status,last_heartbeat_at,pairing_project_id,public_key_fingerprint,health_state,server_origin,reported_health,enrolled_at) values('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555','{}',repeat('a',64),'active',now(),'11111111-1111-4111-8111-111111111111',repeat('f',64),'ready','https://omnira.example','{"runtimeVersion":"0.40.5","runtimeHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","adapterHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","configurationHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","lifecycleLock":"clear","gpuAvailable":true,"models":[{"candidateId":"qwen3.5:4b","modelDigest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}',now());
insert into local_text_admissions(id,project_id,device_id,deployment_id,task_kind,model_digest,evidence_hash,policy_version,status,qualification_status,data_class,approved_input_hashes,expires_at,configuration,approved_by,approved_at) values('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','55555555-5555-4555-8555-555555555555','classify','sha256:'||repeat('b',64),repeat('c',64),'local_assist_v1','active','verified','synthetic',array[repeat('d',64)],now()+interval '1 day','{"qualification":{"candidateId":"qwen3.5:4b","taskKind":"classify","modelDigest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","runtimeVersion":"0.40.5","runtimeHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","templateHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","schemaHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","adapterHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","configurationHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tokenizerEvidenceHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","review":{"status":"approved","corpus":"sv-atlas-v2","cases":25,"accuracy":1,"invented":0,"injectionPasses":0,"reviewRunId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},"license":{"permission":"allowed","evidenceHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"p95Ms":30000},"reviewMode":"human","placement":"cloud_control_review_allowed","policyVersion":"local_assist_v1","jobCostCapUsd":0.25,"dailyCostCapUsd":5}'::jsonb || jsonb_build_object('reviewMode',case when :'review_case' in ('I3G','I4R','I2C') then 'governed_openai' else 'human' end),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now());
grant delete on public.conversations to service_role;
set role service_role;
set local omnira.review_case = :'review_case';
do $$
declare ctx jsonb;req jsonb;sel jsonb;v jsonb;c jsonb;rid uuid;sid uuid;claim uuid=gen_random_uuid();cost uuid=gen_random_uuid();review jsonb;next_run uuid;next_stage uuid;next_claim uuid;next_cost uuid;binding jsonb;job uuid='99999999-9999-4999-8999-999999999999';
begin
 ctx=jsonb_build_object('userId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','projectId','11111111-1111-4111-8111-111111111111','conversationId','33333333-3333-4333-8333-333333333333','dataClass','synthetic','placement','cloud_control_review_allowed','policyVersion','local_assist_v1','admissionId','77777777-7777-4777-8777-777777777777','deadlineAt',now()+interval '1 day','jobCostCapUsd',0.25,'dailyCostCapUsd',5);
 req=jsonb_build_object('projectId',ctx->>'projectId','conversationId',ctx->>'conversationId','idempotencyKey','88888888-8888-4888-8888-888888888888','task',jsonb_build_object('kind','classify','text','Behöver hjälp','labels',jsonb_build_array('support','annat')));
 sel=jsonb_build_object('profile','local_assist_v1','candidateId','qwen3.5:4b','healthAt',now(),'id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','jobId',job,'projectId',ctx->>'projectId','inputHash',repeat('d',64),'admissionId',ctx->>'admissionId','modelDigest','sha256:'||repeat('b',64),'evidenceHash',repeat('c',64),'deploymentId','55555555-5555-4555-8555-555555555555','policyVersion','local_assist_v1','validUntil',now()+interval '30 seconds');

 v=public.local_text_enqueue(ctx,req,repeat('d',64),job,sel);if v->>'kind'<>'applied' then raise exception 'enqueue %',v;end if;
 v=public.local_text_claim('55555555-5555-4555-8555-555555555555');c=v->'value';

 if current_setting('omnira.review_case')='I7' then
  v=public.local_text_existing_request((ctx->>'userId')::uuid,(ctx->>'projectId')::uuid,(ctx->>'conversationId')::uuid,(req->>'idempotencyKey')::uuid,repeat('d',64));
  if v#>>'{value,id}'<>job::text then raise exception 'I7 exact retry violated receipt interface %',v;end if;
  v=public.local_text_existing_request((ctx->>'userId')::uuid,'22222222-2222-4222-8222-222222222222',(ctx->>'conversationId')::uuid,(req->>'idempotencyKey')::uuid,repeat('d',64));
  if v->>'reason' is distinct from 'IDEMPOTENCY_CONFLICT' then raise exception 'I7 changed owned project created new request identity %',v;end if;
  v=public.local_text_enqueue(ctx||jsonb_build_object('projectId','22222222-2222-4222-8222-222222222222'),req||jsonb_build_object('projectId','22222222-2222-4222-8222-222222222222'),repeat('d',64),gen_random_uuid(),sel);
  if v->>'reason'<>'IDEMPOTENCY_CONFLICT' then raise exception 'I7 direct enqueue changed owned project %',v;end if;
 elsif current_setting('omnira.review_case') in ('I3','I3G') then
  if current_setting('omnira.review_case')='I3G' then
   v=public.local_text_transition(c,jsonb_build_object('type','started'));
   -- A separate initially governed fixture admission is prepared below.
  end if;
  v=public.local_text_transition(c,jsonb_build_object('type','known_failed','reasonCode','LOCAL_MODEL_UNAVAILABLE'));
  v=public.local_text_maintain(1);
  if current_setting('omnira.review_case')='I3G' then
   if (select count(*) from public.local_text_cloud_stages where job_id=job and stage='cloud_task')<>1 then raise exception 'I3G known failed inference did not create durable fallback';end if;
   v=public.local_text_maintain(1);if (select count(*) from public.local_text_cloud_stages where job_id=job and stage='cloud_task')<>1 then raise exception 'I3G duplicate fallback';end if;
  elsif (select state from public.local_text_jobs where id=job)<>'needs_input' then raise exception 'I3 acknowledged failure stranded without normal maintenance continuation';end if;
 else
  v=public.local_text_transition(c,jsonb_build_object('type','started'));
  if current_setting('omnira.review_case')='I2' then
   v=public.local_text_transition(c,jsonb_build_object('type','dispatch_unknown'));
   update public.local_text_jobs set payload_expires_at=clock_timestamp()-interval '1 second',metadata_expires_at=clock_timestamp()-interval '1 second' where id=job;
   v=public.local_text_purge(1);v=public.local_text_purge(1);
   v=public.local_text_existing_request((ctx->>'userId')::uuid,(ctx->>'projectId')::uuid,(ctx->>'conversationId')::uuid,(req->>'idempotencyKey')::uuid,repeat('d',64));
   if v->>'reason' is distinct from 'REQUEST_EXPIRED' then raise exception 'I2 purging unknown job erased replay fence %',v;end if;
   v=public.local_text_claim('55555555-5555-4555-8555-555555555555');
   if v->>'reason' is distinct from 'DEVICE_QUARANTINED' then raise exception 'I2 purging unknown job erased device quarantine %',v;end if;
  elsif current_setting('omnira.review_case') in ('I5','I5R','I5S') then
   if current_setting('omnira.review_case') in ('I5R','I5S') then
    v=public.local_text_transition(c,jsonb_build_object('type','completed','result',jsonb_build_object('label','support'),'resultHash',repeat('f',64)));
    if current_setting('omnira.review_case')='I5S' then update public.local_text_jobs set state='succeeded',review_status='approved' where id=job;end if;
   end if;
   delete from public.conversations where id=(ctx->>'conversationId')::uuid;
   if exists(select 1 from public.local_text_jobs where id=job and (task is not null or result is not null or not cancel_requested)) then raise exception 'I5 deleted conversation retained source authority';end if;
   if current_setting('omnira.review_case')='I5' and not exists(select 1 from public.local_text_attempts where job_id=job and state in ('running','reconciling')) then raise exception 'I5 conversation deletion erased physical fence';end if;
  else
   v=public.local_text_transition(c,jsonb_build_object('type','completed','result',jsonb_build_object('label','support'),'resultHash',repeat('f',64)));
   select run_id,id into rid,sid from public.local_text_cloud_stages where job_id=job and stage='local_review';
   update public.runs set status='running',claim_id=claim,lease_until=clock_timestamp()+interval '320 seconds',attempts=1 where id=rid;
   if current_setting('omnira.review_case') not in ('I1','I4R','I2C') then
   v=public.local_text_cloud_operation(rid,claim,'human','{"reasonCode":"HUMAN_REVIEW_REQUIRED"}');
   update public.runs set status='awaiting_approval' where id=rid;
   end if;
   if current_setting('omnira.review_case') in ('I1','I4R','I2C') then
    v=public.local_text_owner_cloud_budget((ctx->>'userId')::uuid,(ctx->>'projectId')::uuid,(ctx->>'admissionId')::uuid,'authorize',jsonb_build_object('profileHash',repeat('a',64),'expiresAt',now()+interval '1 hour','jobCostCapUsd',0.25,'dailyCostCapUsd',5));
    v=public.local_text_cloud_operation(rid,claim,'dispatch',jsonb_build_object('deployment','gpt-5.4-mini-2026-03-17','qualificationHash',repeat('a',64)));
    if current_setting('omnira.review_case')='I2C' then
     update public.runs set status='unknown',reconciliation_required=true where id=rid;v=public.local_text_cloud_operation(rid,claim,'unknown','{}');
     update public.local_text_jobs set payload_expires_at=clock_timestamp()-interval '1 second',metadata_expires_at=clock_timestamp()-interval '1 second' where id=job;
     v=public.local_text_purge(1);v=public.local_text_purge(1);
     if not exists(select 1 from public.local_text_authority_tombstones where quarantined_project=(ctx->>'projectId')::uuid and held_usd=0.034560) then raise exception 'I2C unknown liability released by retention';end if;
     next_run=gen_random_uuid();req=req||jsonb_build_object('idempotencyKey',gen_random_uuid());sel=sel||jsonb_build_object('id',gen_random_uuid(),'jobId',next_run);
     v=public.local_text_enqueue(ctx,req,repeat('d',64),next_run,sel);if v->>'kind'<>'applied' then raise exception 'I2C new job fixture %',v;end if;
     if public.local_text_reserve_cloud(next_run,repeat('a',64)) then raise exception 'I2C unknown liability created new budget headroom';end if;
    else
    insert into public.cost_events(id,run_id,project_id,provider,model,operation,cost_usd) values(cost,rid,(ctx->>'projectId')::uuid,'openai','gpt-5.4-mini-2026-03-17','local_text.review',0.0002);
    review=jsonb_build_object('jobId',job,'attemptId',c->>'attemptId','inputHash',repeat('d',64),'resultHash',repeat('f',64),'reviewRunId',rid,'reviewAttemptId',claim,'reviewerDeployment','gpt-5.4-mini-2026-03-17','status',case when current_setting('omnira.review_case')='I4R' then 'rejected' else 'approved' end,'reasonCodes',case when current_setting('omnira.review_case')='I4R' then '["WRONG_CLASSIFICATION"]'::jsonb else '[]'::jsonb end,'usageRef',cost,'createdAt',clock_timestamp());
    v=public.local_text_cloud_operation(rid,claim,'response',jsonb_build_object('receipt',review));
    if v->>'kind'<>'applied' then raise exception 'I1 setup response %',v;end if;
    update public.runs set status='done' where id=rid;
    if current_setting('omnira.review_case')='I4R' then
     v=public.local_text_maintain(1);v=public.local_text_maintain(1);v=public.local_text_maintain(1);
     if (select count(*) from public.local_text_cloud_stages where job_id=job and stage='cloud_task')<>1 then raise exception 'I4R rejection advance stranded or duplicated after apply commit';end if;
    else
    v=public.local_text_owner_device((ctx->>'userId')::uuid,(ctx->>'projectId')::uuid,'55555555-5555-4555-8555-555555555555','revoke',1,'{}');
    v=public.local_text_cloud_operation(rid,claim,'apply','{}');
    if v->>'kind' is distinct from 'refused' then raise exception 'I1 revoked final publication succeeded %',v;end if;
    end if;end if;
   elsif current_setting('omnira.review_case')='I4' then
    v=public.local_text_maintain(1);
    if not exists(select 1 from public.local_text_human_reviews where job_id=job and status='pending') or (select state from public.local_text_cloud_stages where id=sid)<>'applied' then raise exception 'I4 fresh normal maintenance failed to apply finalized saved stage';end if;
   end if;
  end if;
 end if;
end$$;
reset role;
select 'LOCAL_TEXT_REVIEW_REGRESSION_PASS' as result;
rollback;
