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
declare a public.local_text_admissions;d public.local_text_devices;v jsonb;c jsonb;spec jsonb;old_count integer;
begin
 select * into a from public.local_text_admissions limit 1;select * into d from public.local_text_devices where id=a.device_id;
 if not public.local_text_eligible(a.project_id,d.owner_id,a.id,a.task_kind,repeat('d',64)) then raise exception 'verified fixture not eligible';end if;
 update public.local_text_devices set reported_health=jsonb_set(reported_health,'{runtimeHash}',to_jsonb(repeat('e',64))) where id=d.id;
 if public.local_text_eligible(a.project_id,d.owner_id,a.id,a.task_kind,repeat('d',64)) then raise exception 'runtime drift eligible';end if;
 update public.local_text_devices set reported_health=d.reported_health,last_heartbeat_at=clock_timestamp()-interval '45 seconds' where id=d.id;
 if public.local_text_eligible(a.project_id,d.owner_id,a.id,a.task_kind,repeat('d',64)) then raise exception 'stale health eligible';end if;
 update public.local_text_devices set last_heartbeat_at=clock_timestamp() where id=d.id;
 spec=a.configuration||jsonb_build_object('evidenceHash',a.evidence_hash,'approvedInputHashes',to_jsonb(a.approved_input_hashes),'dataClass',a.data_class,'expiresAt',clock_timestamp()+interval '1 day');
 old_count=(select count(*) from public.local_text_admissions);
 v=public.local_text_owner_admission(d.owner_id,a.project_id,d.id,'admit',jsonb_set(spec,'{qualification,license,permission}','"unknown"'));
 if v->>'kind'<>'refused' or (select count(*) from public.local_text_admissions)<>old_count then raise exception 'unknown license admitted %',v;end if;
 v=public.local_text_owner_admission('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',a.project_id,d.id,'admit',spec);
 if v->>'reason'<>'SCOPE_REFUSED' then raise exception 'foreign owner admitted %',v;end if;
 v=public.local_text_owner_admission(d.owner_id,a.project_id,d.id,'admit',spec);
 if v->>'kind'<>'applied' then raise exception 'exact owner admission failed %',v;end if;
 v=public.local_text_owner_admission(d.owner_id,a.project_id,d.id,'revoke',jsonb_build_object('id',v#>>'{value,id}','expectedVersion',2));
 if v->>'reason'<>'STALE_VERSION' then raise exception 'stale revocation accepted %',v;end if;
 begin
  update public.local_text_admissions set evidence_hash=repeat('a',64) where id=a.id;
  raise exception 'admission evidence changed';exception when check_violation then null;
 end;
end$$;
do $$
declare ctx jsonb;req jsonb;sel jsonb;v jsonb;c jsonb;old_selection uuid;job uuid='99999999-9999-4999-8999-999999999999';saved_health jsonb;
begin
 ctx=jsonb_build_object('userId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','projectId','11111111-1111-4111-8111-111111111111','conversationId','33333333-3333-4333-8333-333333333333','dataClass','synthetic','placement','cloud_control_review_allowed','policyVersion','local_assist_v1','admissionId','77777777-7777-4777-8777-777777777777','deadlineAt',now()+interval '1 day','jobCostCapUsd',0.25,'dailyCostCapUsd',5);
 req=jsonb_build_object('projectId',ctx->>'projectId','conversationId',ctx->>'conversationId','idempotencyKey','88888888-8888-4888-8888-888888888888','task',jsonb_build_object('kind','classify','text','Behöver hjälp','labels',jsonb_build_array('support','annat')));
 sel=jsonb_build_object('profile','local_assist_v1','candidateId','qwen3.5:4b','healthAt',now(),'id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','jobId',job,'projectId',ctx->>'projectId','inputHash',repeat('d',64),'admissionId',ctx->>'admissionId','modelDigest','sha256:'||repeat('b',64),'evidenceHash',repeat('c',64),'deploymentId','55555555-5555-4555-8555-555555555555','policyVersion','local_assist_v1','validUntil',now()+interval '30 seconds');

 v=public.local_text_enqueue(ctx,req,repeat('d',64),job,jsonb_set(sel,'{candidateId}','"qwen3.5:9b"'));
 if v->>'reason'<>'SELECTION_REFUSED' then raise exception 'wrong candidate enqueued %',v;end if;
 v=public.local_text_enqueue(ctx,req,repeat('d',64),job,sel);if v->>'kind'<>'applied' then raise exception 'enqueue %',v;end if;
 old_selection=gen_random_uuid();sel=sel||jsonb_build_object('id',old_selection,'validUntil',clock_timestamp()-interval '1 second');
 insert into public.local_text_selections(id,job_id,decision) values(old_selection,job,sel);
 update public.local_text_jobs set selection_id=old_selection where id=job;
 v=public.local_text_claim('55555555-5555-4555-8555-555555555555');c=v->'value';
 if v->>'kind'<>'applied' or c->>'selectionId'=old_selection::text then raise exception 'stale decision not appended %',v;end if;
 if (select count(*) from public.local_text_selections where job_id=job)<>3 or (select decision from public.local_text_selections where id=old_selection) is distinct from sel then raise exception 'selection history lost';end if;
 v=public.local_text_revalidate(c);if v->>'kind'<>'applied' then raise exception 'fresh selection refused %',v;end if;
 select reported_health into saved_health from public.local_text_devices where id=(c->>'deviceId')::uuid;
 update public.local_text_devices set reported_health=jsonb_set(reported_health,'{adapterHash}',to_jsonb(repeat('f',64))) where id=(c->>'deviceId')::uuid;
 v=public.local_text_transition(c,jsonb_build_object('type','started'));
 if v->>'kind'<>'refused' or (select started_at from public.local_text_attempts where id=(c->>'attemptId')::uuid) is not null then raise exception 'drift authorized start %',v;end if;
 update public.local_text_devices set reported_health=saved_health where id=(c->>'deviceId')::uuid;
 v=public.local_text_revalidate(jsonb_set(c,'{modelDigest}',to_jsonb('sha256:'||repeat('f',64))));
 if v->>'kind'<>'refused' then raise exception 'old model claim accepted %',v;end if;
 v=public.local_text_transition(c,jsonb_build_object('type','started'));if v#>>'{value,state}'<>'running' then raise exception 'valid start failed %',v;end if;
 v=public.local_text_owner_admission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','revoke',jsonb_build_object('id','77777777-7777-4777-8777-777777777777','expectedVersion',1));
 if v->>'kind'<>'applied' then raise exception 'owner revocation failed %',v;end if;
 v=public.local_text_revalidate(c);if v->>'kind'<>'refused' then raise exception 'revoked admission still valid';end if;
end$$;
reset role;
set role authenticated;
do $$begin begin perform public.local_text_owner_admission(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'admit','{}');raise exception 'client admitted';exception when insufficient_privilege then null;end;end$$;
reset role;
select 'LOCAL_TEXT_POLICY_SQL_PASS' as result;
rollback;
