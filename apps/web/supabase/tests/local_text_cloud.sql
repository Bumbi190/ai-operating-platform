\set ON_ERROR_STOP on
begin;
do $$begin if to_regclass('public.local_text_jobs') is null then raise exception 'local_text_jobs missing';end if;end$$;
insert into auth.users(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into projects(id,owner_id) values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into conversations(id,user_id) values('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into local_text_devices(id,owner_id,key_id,public_jwk,build_hash,status,last_heartbeat_at,pairing_project_id,public_key_fingerprint,health_state,server_origin,reported_health,enrolled_at) values('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555','{}',repeat('a',64),'active',now(),'11111111-1111-4111-8111-111111111111',repeat('f',64),'ready','https://omnira.example','{"runtimeVersion":"0.40.5","runtimeHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","adapterHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","configurationHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","lifecycleLock":"clear","gpuAvailable":true,"models":[{"candidateId":"qwen3.5:4b","modelDigest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}',now());
insert into local_text_admissions(id,project_id,device_id,deployment_id,task_kind,model_digest,evidence_hash,policy_version,status,qualification_status,data_class,approved_input_hashes,expires_at,configuration,approved_by,approved_at) values('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','55555555-5555-4555-8555-555555555555','classify','sha256:'||repeat('b',64),repeat('c',64),'local_assist_v1','active','verified','synthetic',array[repeat('d',64)],now()+interval '1 day','{"qualification":{"candidateId":"qwen3.5:4b","taskKind":"classify","modelDigest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","runtimeVersion":"0.40.5","runtimeHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","templateHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","schemaHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","adapterHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","configurationHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tokenizerEvidenceHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","review":{"status":"approved","corpus":"sv-atlas-v2","cases":25,"accuracy":1,"invented":0,"injectionPasses":0,"reviewRunId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},"license":{"permission":"allowed","evidenceHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"p95Ms":30000},"placement":"cloud_control_review_allowed","policyVersion":"local_assist_v1","jobCostCapUsd":0.25,"dailyCostCapUsd":5}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now());
set role service_role;
do $$
declare ctx jsonb;req jsonb;sel jsonb;v jsonb;c jsonb;rid uuid;sid uuid;claim uuid=gen_random_uuid();cost uuid=gen_random_uuid();review jsonb;next_run uuid;next_stage uuid;next_claim uuid;next_cost uuid;binding jsonb;job uuid='99999999-9999-4999-8999-999999999999';
begin
 ctx=jsonb_build_object('userId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','projectId','11111111-1111-4111-8111-111111111111','conversationId','33333333-3333-4333-8333-333333333333','dataClass','synthetic','placement','cloud_control_review_allowed','policyVersion','local_assist_v1','admissionId','77777777-7777-4777-8777-777777777777','deadlineAt',now()+interval '1 day','jobCostCapUsd',0.25,'dailyCostCapUsd',5);
 req=jsonb_build_object('projectId',ctx->>'projectId','conversationId',ctx->>'conversationId','idempotencyKey','88888888-8888-4888-8888-888888888888','task',jsonb_build_object('kind','classify','text','Behöver hjälp','labels',jsonb_build_array('support','annat')));
 sel=jsonb_build_object('profile','local_assist_v1','candidateId','qwen3.5:4b','healthAt',now(),'id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','jobId',job,'projectId',ctx->>'projectId','inputHash',repeat('d',64),'admissionId',ctx->>'admissionId','modelDigest','sha256:'||repeat('b',64),'evidenceHash',repeat('c',64),'deploymentId','55555555-5555-4555-8555-555555555555','policyVersion','local_assist_v1','validUntil',now()+interval '30 seconds');

 v=public.local_text_enqueue(ctx,req,repeat('d',64),job,sel);if v->>'kind'<>'applied' then raise exception 'enqueue %',v;end if;
 v=public.local_text_claim('55555555-5555-4555-8555-555555555555');c=v->'value';
 v=public.local_text_transition(c,jsonb_build_object('type','started'));v=public.local_text_transition(c,jsonb_build_object('type','completed','result',jsonb_build_object('label','support'),'resultHash',repeat('f',64)));
 select run_id,id into rid,sid from public.local_text_cloud_stages where job_id=job and stage='local_review';if rid is null then raise exception 'completed result did not atomically queue review';end if;
 if (select kind<>'local_text_cloud' or workflow_id is not null or max_attempts<>1 or input ? 'text' or input ? 'result' or context<>'{}' from public.runs where id=rid) then raise exception 'canonical run carries wrong scope/raw payload';end if;
 v=public.local_text_enqueue_cloud(job,(c->>'attemptId')::uuid,'local_review',repeat('d',64),repeat('f',64));if v->>'kind'<>'duplicate' or v#>>'{value,runId}'<>rid::text or (select count(*) from public.local_text_cloud_stages where job_id=job)<>1 then raise exception 'review stage duplicated %',v;end if;
 begin update public.runs set input='{}' where id=rid;raise exception 'run binding changed';exception when check_violation then null;end;
 update public.runs set status='running',claim_id=claim,lease_until=clock_timestamp()+interval '320 seconds',attempts=1 where id=rid;
 v=public.local_text_cloud_snapshot(rid,gen_random_uuid());if v->>'reason'<>'FENCED' then raise exception 'foreign run claim read source %',v;end if;
 v=public.local_text_cloud_snapshot(rid,claim);if v->>'kind'<>'applied' then raise exception 'owned snapshot %',v;end if;
 begin
  v=public.local_text_cloud_operation(rid,claim,'human',jsonb_build_object('reasonCode','BUDGET_UNVERIFIED'));if v->>'kind'<>'applied' then raise exception 'human stage %',v;end if;
  update public.runs set status='awaiting_approval' where id=rid;
  v=public.local_text_cloud_operation(rid,claim,'apply','{}');if v#>>'{value,state}'<>'needs_input' or v#>'{value,result}'<>'null'::jsonb then raise exception 'human path released unreviewed output %',v;end if;
  raise exception using errcode='P0999',message='fixture rollback';exception when sqlstate 'P0999' then null;
 end;
 v=public.local_text_cloud_operation(rid,claim,'dispatch',jsonb_build_object('deployment','gpt-5.4-mini-2026-03-17','qualificationHash',repeat('a',64)));if v->>'reason'<>'BUDGET_UNVERIFIED' then raise exception 'caps alone authorized spend %',v;end if;
 v=public.local_text_owner_cloud_budget('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','authorize',jsonb_build_object('profileHash',repeat('a',64),'expiresAt',now()+interval '1 hour','jobCostCapUsd',0.25,'dailyCostCapUsd',5));if v->>'kind'<>'applied' then raise exception 'cloud budget authorize %',v;end if;
 v=public.local_text_cloud_operation(rid,claim,'dispatch',jsonb_build_object('deployment','gpt-5.4-mini-2026-03-17','qualificationHash',repeat('a',64)));if v->>'kind'<>'applied' then raise exception 'dispatch CAS %',v;end if;
 v=public.local_text_cloud_operation(rid,claim,'dispatch',jsonb_build_object('deployment','gpt-5.4-mini-2026-03-17','qualificationHash',repeat('a',64)));if v->>'reason'<>'STAGE_FENCED' then raise exception 'second physical review admitted %',v;end if;
 begin
  v=public.local_text_owner_cloud_budget('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','revoke',jsonb_build_object('id',(select id from public.local_text_cloud_authorizations where admission_id='77777777-7777-4777-8777-777777777777'),'expectedVersion',1));
  if v->>'kind'<>'applied' or not(select cancel_requested and status='running' and claim_id=claim from public.runs where id=rid) then raise exception 'budget revoke did not use canonical cancel %',v;end if;
  raise exception using errcode='P0999',message='fixture rollback';exception when sqlstate 'P0999' then null;
 end;
 begin
  v=public.local_text_owner_device('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','revoke',1,'{}');
  if v->>'kind'<>'applied' or not(select cancel_requested and status='running' and claim_id=claim from public.runs where id=rid) then raise exception 'device revoke failed to cancel canonical cloud run %',v;end if;
  update public.runs set status='unknown',reconciliation_required=true where id=rid;
  v=public.local_text_cloud_operation(rid,claim,'unknown','{}');if v->>'kind'<>'applied' then raise exception 'cancelled unknown bookkeeping refused %',v;end if;
  raise exception using errcode='P0999',message='fixture rollback';exception when sqlstate 'P0999' then null;
 end;
 begin
  update public.runs set status='unknown',reconciliation_required=true where id=rid;
  v=public.local_text_cloud_operation(rid,claim,'unknown','{}');if v->>'kind'<>'applied' or (select state from public.local_text_jobs where id=job)<>'reconciling' then raise exception 'unknown dispatch fell through %',v;end if;
  v=public.local_text_enqueue_cloud(job,(c->>'attemptId')::uuid,'local_review',repeat('d',64),repeat('f',64));if v->>'kind'<>'duplicate' then raise exception 'unknown stage requeued';end if;
  raise exception using errcode='P0999',message='fixture rollback';exception when sqlstate 'P0999' then null;
 end;
 review=jsonb_build_object('jobId',job,'attemptId',c->>'attemptId','inputHash',repeat('d',64),'resultHash',repeat('f',64),'reviewRunId',rid,'reviewAttemptId',claim,'reviewerDeployment','gpt-5.4-mini-2026-03-17','status','approved','reasonCodes','[]'::jsonb,'usageRef',cost,'createdAt',clock_timestamp());
 v=public.local_text_cloud_operation(rid,claim,'response',jsonb_build_object('receipt',review));if v->>'kind'<>'refused' then raise exception 'unmetered review approved';end if;
 insert into public.cost_events(id,run_id,project_id,provider,model,operation,tokens_in,tokens_out,cost_usd) values(cost,rid,'11111111-1111-4111-8111-111111111111','openai','gpt-5.4-mini-2026-03-17','local_text.review',120,10,0.0002);
 -- Exercise the full rejection -> one cloud task -> independent cloud review,
 -- including duplicate continuation and final rejection without recursion.
 begin
  binding=review||jsonb_build_object('status','rejected','reasonCodes',jsonb_build_array('WRONG_CLASSIFICATION'));
  v=public.local_text_cloud_operation(rid,claim,'response',jsonb_build_object('receipt',binding));if v->>'kind'<>'applied' then raise exception 'local reject %',v;end if;
  update public.runs set status='done' where id=rid;
  v=public.local_text_cloud_operation(rid,claim,'apply','{}');if v#>>'{value,state}'<>'escalation_pending' then raise exception 'reject did not allow single escalation %',v;end if;
  v=public.local_text_advance(job);v=public.local_text_advance(job);
  select run_id,id into next_run,next_stage from public.local_text_cloud_stages where job_id=job and stage='cloud_task';if next_run is null or (select count(*) from public.local_text_cloud_stages where job_id=job)<>2 then raise exception 'cloud task not deduped %',v;end if;
  next_claim=gen_random_uuid();next_cost=gen_random_uuid();update public.runs set status='running',claim_id=next_claim,lease_until=now()+interval '320 seconds',attempts=1 where id=next_run;
  v=public.local_text_cloud_snapshot(next_run,next_claim);if v->>'kind'<>'applied' then raise exception 'cloud snapshot %',v;end if;
  v=public.local_text_cloud_operation(next_run,next_claim,'dispatch',jsonb_build_object('deployment','gpt-5.4-mini-2026-03-17','qualificationHash',repeat('a',64)));if v->>'kind'<>'applied' then raise exception 'cloud task dispatch %',v;end if;
  insert into public.cost_events(id,run_id,project_id,provider,model,operation,cost_usd) values(next_cost,next_run,'11111111-1111-4111-8111-111111111111','openai','gpt-5.4-mini-2026-03-17','local_text.task',0.001);
  binding=jsonb_build_object('jobId',job,'runId',next_run,'claimId',next_claim,'inputHash',repeat('d',64),'resultHash',repeat('e',64),'usageRef',next_cost,'status','completed');
  v=public.local_text_cloud_operation(next_run,next_claim,'response',jsonb_build_object('receipt',binding,'result',jsonb_build_object('label','annat')));if v->>'kind'<>'applied' then raise exception 'cloud task response %',v;end if;
  update public.runs set status='done' where id=next_run;v=public.local_text_cloud_operation(next_run,next_claim,'apply','{}');if v#>>'{value,state}'<>'reviewing' or v#>'{value,result}'<>'null'::jsonb then raise exception 'unreviewed cloud result leaked %',v;end if;
  binding=jsonb_build_object('jobId',job,'attemptId',next_stage,'inputHash',repeat('d',64),'resultHash',repeat('e',64),'reviewerDeployment','gpt-5.4-mini-2026-03-17','status','rejected','reasonCodes',jsonb_build_array('WRONG_CLASSIFICATION'),'createdAt',clock_timestamp());
  select run_id into next_run from public.local_text_cloud_stages where job_id=job and stage='cloud_review';if next_run is null then raise exception 'no independent cloud review';end if;
  next_claim=gen_random_uuid();next_cost=gen_random_uuid();update public.runs set status='running',claim_id=next_claim,lease_until=now()+interval '320 seconds',attempts=1 where id=next_run;
  v=public.local_text_cloud_operation(next_run,next_claim,'dispatch',jsonb_build_object('deployment','gpt-5.4-mini-2026-03-17','qualificationHash',repeat('a',64)));if v->>'kind'<>'applied' then raise exception 'cloud review dispatch %',v;end if;
  insert into public.cost_events(id,run_id,project_id,provider,model,operation,cost_usd) values(next_cost,next_run,'11111111-1111-4111-8111-111111111111','openai','gpt-5.4-mini-2026-03-17','local_text.review',0.001);
  binding=binding||jsonb_build_object('reviewRunId',next_run,'reviewAttemptId',next_claim,'usageRef',next_cost);
  v=public.local_text_cloud_operation(next_run,next_claim,'response',jsonb_build_object('receipt',binding));if v->>'kind'<>'applied' then raise exception 'cloud review response %',v;end if;
  update public.runs set status='done' where id=next_run;v=public.local_text_cloud_operation(next_run,next_claim,'apply','{}');if v#>>'{value,state}'<>'needs_input' then raise exception 'cloud reject recursed %',v;end if;
  v=public.local_text_advance(job);if (select count(*) from public.local_text_cloud_stages where job_id=job)<>3 or (select count(*) from public.local_text_attempts where job_id=job and started_at is not null)<>1 or exists(select 1 from public.local_text_cloud_reservations where job_id=job and released_at is null) then raise exception 'call bound/reservation violated';end if;
  raise exception using errcode='P0999',message='fixture rollback';exception when sqlstate 'P0999' then null;
 end;
 v=public.local_text_cloud_operation(rid,claim,'response',jsonb_build_object('receipt',jsonb_set(review,'{reviewRunId}',to_jsonb(gen_random_uuid()))));if v->>'kind'<>'refused' then raise exception 'wrong review run approved';end if;
 v=public.local_text_cloud_operation(rid,claim,'response',jsonb_build_object('receipt',review));if v->>'kind'<>'applied' then raise exception 'review response %',v;end if;
 v=public.local_text_cloud_operation(rid,claim,'apply','{}');if v->>'kind'<>'refused' or (select state from public.local_text_jobs where id=job)<>'reviewing' then raise exception 'unfinalized run released result';end if;
 update public.runs set cancel_requested=true where id=rid;v=public.local_text_cloud_operation(rid,claim,'apply','{}');if v->>'reason'<>'FENCED' then raise exception 'cancelled claim finalized review';end if;update public.runs set cancel_requested=false where id=rid;
 update public.runs set status='done' where id=rid;v=public.local_text_cloud_operation(rid,claim,'apply','{}');if v#>>'{value,state}'<>'succeeded' or v#>>'{value,result,label}'<>'support' then raise exception 'owned finalized review did not release result %',v;end if;
 v=public.local_text_cloud_operation(rid,claim,'apply','{}');if v->>'kind'<>'duplicate' or (select count(*) from public.local_text_reviews where job_id=job)<>1 then raise exception 'review applied twice';end if;
 begin
  update public.local_text_jobs set state='escalation_pending',result=jsonb_build_object('label','annat'),result_hash=repeat('a',64),review_status='pending' where id=job;
  v=public.local_text_transition(c,jsonb_build_object('type','completed','result',jsonb_build_object('label','support'),'resultHash',repeat('f',64)));if v->>'kind'<>'duplicate' then raise exception 'finished local completion lost its exact tombstone %',v;end if;
  raise exception using errcode='P0999',message='fixture rollback';exception when sqlstate 'P0999' then null;
 end;
end$$;
reset role;
set role authenticated;
do $$begin
 begin perform * from public.local_text_cloud_stages;raise exception 'raw cloud stage exposed';exception when insufficient_privilege then null;end;
 begin perform public.local_text_cloud_snapshot(gen_random_uuid(),gen_random_uuid());raise exception 'client read cloud source';exception when insufficient_privilege then null;end;
end$$;
reset role;
select 'LOCAL_TEXT_CLOUD_SQL_PASS' as result;
rollback;
