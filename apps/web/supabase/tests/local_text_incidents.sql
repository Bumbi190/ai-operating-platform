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
declare v jsonb;incident uuid;idx integer;job uuid;attempt uuid;run uuid;cost uuid;verdict text;review jsonb;ctx jsonb;
begin
 update public.local_text_devices set last_heartbeat_at=clock_timestamp()-interval '89 seconds' where id='55555555-5555-4555-8555-555555555555';
 v=public.local_text_maintain(100);if exists(select 1 from public.local_text_incidents where kind='offline') then raise exception 'offline notified too soon';end if;
 update public.local_text_devices set last_heartbeat_at=clock_timestamp()-interval '91 seconds' where id='55555555-5555-4555-8555-555555555555';
 v=public.local_text_maintain(100);v=public.local_text_maintain(100);
 if (select count(*) from public.local_text_incidents where kind='offline')<>1 then raise exception 'offline storm duplicate';end if;
 select id into incident from public.local_text_incidents where kind='offline';
 update public.local_text_devices set last_heartbeat_at=clock_timestamp(),reported_health=jsonb_set(reported_health,'{lifecycleLock}','"uncertain"') where id='55555555-5555-4555-8555-555555555555';
 v=public.local_text_maintain(100);if (select state from public.local_text_incidents where id=incident)<>'open' then raise exception 'unverified recovery accepted';end if;
 update public.local_text_devices set reported_health=jsonb_set(reported_health,'{lifecycleLock}','"clear"') where id='55555555-5555-4555-8555-555555555555';
 v=public.local_text_maintain(100);v=public.local_text_maintain(100);if (select state from public.local_text_incidents where id=incident)<>'resolved' or (select count(*) from public.local_text_incidents where kind='offline')<>1 then raise exception 'verified recovery not deduped';end if;

 -- Unknown completed reviews occupy the rolling window but never count as
 -- quality rejections. Old failures outside the last20 cannot pause a model.
 for idx in 1..27 loop
  job=gen_random_uuid();attempt=gen_random_uuid();run=gen_random_uuid();cost=gen_random_uuid();verdict=case when idx<=3 or idx>=25 then 'rejected' else 'unknown' end;
  ctx=jsonb_build_object('dataClass','synthetic','placement','cloud_control_review_allowed');
  insert into public.local_text_jobs(id,project_id,owner_id,conversation_id,idempotency_key,input_hash,task_kind,task,context,admission_id,state,result,result_hash,review_status,expires_at,payload_expires_at)
  values(job,'11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333',gen_random_uuid(),repeat('d',64),'classify','{"kind":"classify","text":"Behöver hjälp","labels":["support","annat"]}',ctx,'77777777-7777-4777-8777-777777777777','needs_input','{"label":"support"}',repeat('f',64),verdict,now()+interval '1 day',now()+interval '23 hours');
  insert into public.local_text_attempts(id,job_id,device_id,claim_id,fence,input_hash,model_digest,admission_id,state,started_at,finished_at,result,result_hash)
  values(attempt,job,'55555555-5555-4555-8555-555555555555',gen_random_uuid(),1,repeat('d',64),'sha256:'||repeat('b',64),'77777777-7777-4777-8777-777777777777','completed',clock_timestamp(),clock_timestamp(),'{"label":"support"}',repeat('f',64));
  insert into public.runs(id,project_id,kind,status,max_attempts) values(run,'11111111-1111-4111-8111-111111111111','local_text_cloud','done',1);
  insert into public.cost_events(id,run_id,project_id,provider,model,operation,cost_usd) values(cost,run,'11111111-1111-4111-8111-111111111111','openai','gpt-5.4-mini-2026-03-17','local_text.review',0.0002);
  review=jsonb_build_object('status',verdict,'reviewerDeployment','gpt-5.4-mini-2026-03-17','usageRef',cost,'inputHash',repeat('d',64),'resultHash',repeat('f',64),'reasonCodes',jsonb_build_array(case when verdict='rejected' then 'WRONG_CLASSIFICATION' else 'REVIEW_UNAVAILABLE' end));
  insert into public.local_text_reviews(job_id,attempt_id,input_hash,result_hash,review_run_id,receipt,status,created_at) values(job,attempt,repeat('d',64),repeat('f',64),run,review,verdict,clock_timestamp());
  if idx in (24,25,26,27) then
   v=public.local_text_maintain(100);
   if idx<27 and (select status from public.local_text_admissions where id='77777777-7777-4777-8777-777777777777')<>'active' then raise exception 'unknown reviews counted as quality failures/outside20 retained at %',idx;end if;
  end if;
 end loop;
 v=public.local_text_maintain(100);
 if (select status from public.local_text_admissions where id='77777777-7777-4777-8777-777777777777')<>'paused' or (select count(*) from public.local_text_incidents where kind='quality')<>1 or (select count(*) from public.approvals where kind='local_text_incident')<>1 then raise exception 'three verified rejects did not pause once';end if;
 -- Acknowledgment records an owner decision without resuming the paused model.
 select approval_id into incident from public.local_text_incidents where kind='quality';
 v=public.local_text_ack_incident('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',incident,1);if v->>'reason'<>'SCOPE_REFUSED' then raise exception 'foreign acknowledgment won';end if;
 v=public.local_text_ack_incident('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',incident,1);if v->>'kind'<>'applied' or v#>>'{value,resumed}'<>'false' or (select status from public.local_text_admissions where id='77777777-7777-4777-8777-777777777777')<>'paused' then raise exception 'ack resumed model %',v;end if;
 v=public.local_text_ack_incident('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',incident,1);if v->>'kind'<>'duplicate' then raise exception 'ack duplicated';end if;
 -- Device expiry clamps operational incident lineage; canonical runs retain
 -- financial tombstones with local input/context erased.
 update public.local_text_devices set expires_at=clock_timestamp()-interval '1 second' where id='55555555-5555-4555-8555-555555555555';
 v=public.local_text_purge(1);v=public.local_text_purge(1);
 if exists(select 1 from public.local_text_incidents) or exists(select 1 from public.runs where kind='local_text_incident' and (input<>'{}'::jsonb or context<>'{}'::jsonb)) then raise exception 'incident metadata not purged';end if;
end$$;
reset role;
select 'LOCAL_TEXT_INCIDENTS_SQL_PASS' as result;
rollback;
