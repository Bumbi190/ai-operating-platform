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
declare v jsonb;aid uuid;spec jsonb;owner uuid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';project uuid='11111111-1111-4111-8111-111111111111';admission uuid='77777777-7777-4777-8777-777777777777';
begin
 spec=jsonb_build_object('profileHash',repeat('a',64),'expiresAt',now()+interval '1 hour','jobCostCapUsd',0.25,'dailyCostCapUsd',5);
 v=public.local_text_owner_cloud_budget('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',project,admission,'authorize',spec);if v->>'reason'<>'SCOPE_REFUSED' then raise exception 'foreign budget accepted %',v;end if;
 v=public.local_text_owner_cloud_budget(owner,project,admission,'authorize',spec);if v->>'kind'<>'applied' then raise exception 'explicit budget failed %',v;end if;aid=(v#>>'{value,id}')::uuid;
 if not exists(select 1 from public.local_text_cloud_authorizations where id=aid and owner_id=owner and profile_hash=repeat('a',64) and status='active') then raise exception 'no bound spend authorization';end if;
 v=public.local_text_owner_cloud_budget(owner,project,admission,'revoke',jsonb_build_object('id',aid,'expectedVersion',2));if v->>'reason'<>'STALE_VERSION' then raise exception 'stale revoke accepted';end if;
 v=public.local_text_owner_cloud_budget(owner,project,admission,'revoke',jsonb_build_object('id',aid,'expectedVersion',1));if v->>'kind'<>'applied' or v#>>'{value,status}'<>'revoked' then raise exception 'revoke failed %',v;end if;
end$$;
reset role;
set role authenticated;
do $$begin begin perform * from public.local_text_cloud_authorizations;raise exception 'budget exposed';exception when insufficient_privilege then null;end;end$$;
reset role;
select 'LOCAL_TEXT_BUDGET_SQL_PASS' as result;
rollback;
