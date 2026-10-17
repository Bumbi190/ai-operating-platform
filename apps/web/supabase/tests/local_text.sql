\set ON_ERROR_STOP on
begin;
do $$begin if to_regclass('public.local_text_jobs') is null then raise exception 'local_text_jobs missing';end if;end$$;
insert into auth.users(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into projects(id,owner_id) values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into conversations(id,user_id) values('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into local_text_devices(id,owner_id,key_id,public_jwk,build_hash,status,last_heartbeat_at,pairing_project_id,public_key_fingerprint,health_state,server_origin) values('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555','{}',repeat('a',64),'active',now(),'11111111-1111-4111-8111-111111111111',repeat('f',64),'ready','https://omnira.example');
insert into local_text_admissions(id,project_id,device_id,deployment_id,task_kind,model_digest,evidence_hash,policy_version,status,qualification_status,data_class,approved_input_hashes,expires_at) values('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','55555555-5555-4555-8555-555555555555','classify','sha256:'||repeat('b',64),repeat('c',64),'local_assist_v1','active','verified','synthetic',array[repeat('d',64)],now()+interval '1 day');
set role service_role;
do $$
declare ctx jsonb;req jsonb;sel jsonb;v jsonb;c jsonb;changed jsonb;job uuid='99999999-9999-4999-8999-999999999999';
begin
 ctx=jsonb_build_object('userId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','projectId','11111111-1111-4111-8111-111111111111','conversationId','33333333-3333-4333-8333-333333333333','dataClass','synthetic','placement','cloud_control_review_allowed','policyVersion','local_assist_v1','admissionId','77777777-7777-4777-8777-777777777777','deadlineAt',now()+interval '1 day','jobCostCapUsd',0.25,'dailyCostCapUsd',5);
 req=jsonb_build_object('projectId',ctx->>'projectId','conversationId',ctx->>'conversationId','idempotencyKey','88888888-8888-4888-8888-888888888888','task',jsonb_build_object('kind','classify','text','Behöver hjälp','labels',jsonb_build_array('support','annat')));
 sel=jsonb_build_object('id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','jobId',job,'projectId',ctx->>'projectId','inputHash',repeat('d',64),'admissionId',ctx->>'admissionId','modelDigest','sha256:'||repeat('b',64),'evidenceHash',repeat('c',64),'deploymentId','55555555-5555-4555-8555-555555555555','policyVersion','local_assist_v1','validUntil',now()+interval '30 seconds');
 v=public.local_text_enqueue(ctx,req,repeat('d',64),job,sel);
 if v->>'kind'<>'applied' then raise exception 'enqueue failed %',v;end if;
 begin
  update public.local_text_jobs set input_hash=repeat('a',64) where id=job;
  raise exception 'immutable input modified';
 exception when check_violation then null;end;
 begin
  update public.local_text_selections set decision='{}' where job_id=job;
  raise exception 'immutable selection modified';
 exception when check_violation then null;end;
 v=public.local_text_enqueue(ctx,req,repeat('d',64),gen_random_uuid(),sel);
 if v->>'kind'<>'duplicate' or v#>>'{value,id}'<>job::text then raise exception 'idempotent receipt mismatch %',v;end if;
 changed=jsonb_set(req,'{task,text}','"Changed source"');v=public.local_text_enqueue(ctx,changed,repeat('e',64),gen_random_uuid(),sel);
 if v->>'kind'<>'refused' or v->>'reason'<>'IDEMPOTENCY_CONFLICT' then raise exception 'changed input silently reused %',v;end if;
 v=public.local_text_enqueue(jsonb_set(ctx,'{userId}','"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"'),req,repeat('d',64),gen_random_uuid(),sel);
 if v->>'kind'<>'refused' then raise exception 'foreign owner enqueued';end if;
 v=public.local_text_claim('55555555-5555-4555-8555-555555555555');c=v->'value';
 if v->>'kind'<>'applied' or c->>'jobId'<>job::text then raise exception 'claim failed %',v;end if;
 v=public.local_text_claim('55555555-5555-4555-8555-555555555555');
 if v->'value'<>'null'::jsonb then raise exception 'second claim won';end if;
 v=public.local_text_transition(c,jsonb_build_object('type','started'));
 if v#>>'{value,state}'<>'running' then raise exception 'start failed %',v;end if;
 begin
  v=public.local_text_transition(c,jsonb_build_object('type','completed','result',jsonb_build_object('label','support'),'resultHash',repeat('f',64)));
  if v#>>'{value,state}'<>'reviewing' or v#>'{value,result}'<>'null'::jsonb then raise exception 'unreviewed result exposed %',v;end if;
  v=public.local_text_transition(c,jsonb_build_object('type','completed','result',jsonb_build_object('label','support'),'resultHash',repeat('f',64)));
  if v->>'kind'<>'duplicate' then raise exception 'duplicate completion mismatch %',v;end if;
  v=public.local_text_transition(jsonb_set(c,'{fence}','999'),jsonb_build_object('type','completed','result',jsonb_build_object('label','support'),'resultHash',repeat('f',64)));
  if v->>'reason'<>'FENCED' then raise exception 'late fence completed %',v;end if;
  update public.local_text_jobs set payload_expires_at=clock_timestamp()-interval '1 second' where id=job;
  update public.local_text_jobs set task=null,result=null where id=job;
  v=public.local_text_enqueue(ctx,req,repeat('d',64),gen_random_uuid(),sel);
  if v->>'kind'<>'duplicate' or v#>>'{value,reasonCode}'<>'PAYLOAD_EXPIRED' then raise exception 'purged retry recreated source %',v;end if;
  raise exception using errcode='P0999',message='rollback only the completed-result fixture branch';
 exception when sqlstate 'P0999' then null;end;
 v=public.local_text_transition(c,jsonb_build_object('type','dispatch_unknown'));
 if v#>>'{value,state}'<>'reconciling' then raise exception 'unknown dispatch not reconciliating %',v;end if;
 v=public.local_text_transition(c,jsonb_build_object('type','completed','result',jsonb_build_object('label','support'),'resultHash',repeat('f',64)));
 if v->>'kind'<>'refused' then raise exception 'unknown accepted completion without reconciliation';end if;
 v=public.local_text_claim('55555555-5555-4555-8555-555555555555');
 if v->'value'<>'null'::jsonb then raise exception 'unknown dispatch requeued';end if;
end$$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$begin
 if (select count(*) from public.local_text_jobs)<>0 then raise exception 'cross-project RLS leaked';end if;
 begin perform task from public.local_text_jobs;raise exception 'raw source exposed';exception when insufficient_privilege then null;end;
 begin delete from public.local_text_jobs;raise exception 'authenticated mutation allowed';exception when insufficient_privilege then null;end;
 begin perform public.local_text_claim('55555555-5555-4555-8555-555555555555');raise exception 'client claimed';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$begin if (select count(*) from public.local_text_jobs)<>1 then raise exception 'owner cannot read safe metadata';end if;end$$;
do $$begin
 begin update public.local_text_jobs set state='succeeded';raise exception 'owner client mutated';exception when insufficient_privilege then null;end;
 begin insert into public.local_text_jobs(id) values(gen_random_uuid());raise exception 'owner client inserted';exception when insufficient_privilege then null;end;
end$$;
reset role;
set role anon;
do $$begin begin perform id from public.local_text_jobs;raise exception 'anonymous read allowed';exception when insufficient_privilege then null;end;end$$;
reset role;
select 'LOCAL_TEXT_SQL_PASS' as result;
rollback;
