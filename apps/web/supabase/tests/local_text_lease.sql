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
declare ctx jsonb;req jsonb;sel jsonb;v jsonb;c jsonb;next_claim jsonb;job uuid='99999999-9999-4999-8999-999999999999';
begin
 ctx=jsonb_build_object('userId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','projectId','11111111-1111-4111-8111-111111111111','conversationId','33333333-3333-4333-8333-333333333333','dataClass','synthetic','placement','cloud_control_review_allowed','policyVersion','local_assist_v1','admissionId','77777777-7777-4777-8777-777777777777','deadlineAt',now()+interval '1 day','jobCostCapUsd',0.25,'dailyCostCapUsd',5);
 req=jsonb_build_object('projectId',ctx->>'projectId','conversationId',ctx->>'conversationId','idempotencyKey','88888888-8888-4888-8888-888888888888','task',jsonb_build_object('kind','classify','text','Behöver hjälp','labels',jsonb_build_array('support','annat')));
 sel=jsonb_build_object('profile','local_assist_v1','candidateId','qwen3.5:4b','healthAt',now(),'id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','jobId',job,'projectId',ctx->>'projectId','inputHash',repeat('d',64),'admissionId',ctx->>'admissionId','modelDigest','sha256:'||repeat('b',64),'evidenceHash',repeat('c',64),'deploymentId','55555555-5555-4555-8555-555555555555','policyVersion','local_assist_v1','validUntil',now()+interval '30 seconds');

 v=public.local_text_enqueue(ctx,req,repeat('d',64),job,sel);if v->>'kind'<>'applied' then raise exception 'enqueue %',v;end if;
 update public.local_text_jobs set payload_expires_at=clock_timestamp()+interval '20 minutes' where id=job;
 v=public.local_text_claim('55555555-5555-4555-8555-555555555555');c=v->'value';
 if (c->>'expiresAt')::timestamptz>clock_timestamp()+interval '21 minutes' then raise exception 'claim widened payload deadline';end if;
 update public.local_text_jobs set lease_until=clock_timestamp()-interval '1 second' where id=job;
 perform public.local_text_reap_device('55555555-5555-4555-8555-555555555555');
 if (select state from public.local_text_jobs where id=job)<>'queued' or (select state from public.local_text_attempts where id=(c->>'attemptId')::uuid)<>'expired' then raise exception 'unstarted claim not fenced/requeued';end if;
 v=public.local_text_transition(c,jsonb_build_object('type','started'));if v->>'reason'<>'FENCED' then raise exception 'expired claim started %',v;end if;
 v=public.local_text_claim('55555555-5555-4555-8555-555555555555');next_claim=v->'value';
 if (next_claim->>'fence')::bigint<=(c->>'fence')::bigint then raise exception 'fence did not advance';end if;
 v=public.local_text_transition(next_claim,jsonb_build_object('type','started'));if v#>>'{value,state}'<>'running' then raise exception 'new claim start %',v;end if;
 update public.local_text_jobs set lease_until=clock_timestamp()-interval '1 second' where id=job;
 perform public.local_text_reap_device('55555555-5555-4555-8555-555555555555');
 if (select state from public.local_text_jobs where id=job)<>'reconciling' then raise exception 'running claim requeued';end if;
 v=public.local_text_claim('55555555-5555-4555-8555-555555555555');if v->'value'<>'null'::jsonb then raise exception 'uncertain device accepted new work';end if;
 v=public.local_text_transition(next_claim,jsonb_build_object('type','reconciled','proofRef',gen_random_uuid()));if v->>'kind'<>'refused' then raise exception 'unverified reconciliation released device';end if;
end$$;
reset role;
select 'LOCAL_TEXT_LEASE_SQL_PASS' as result;
rollback;
