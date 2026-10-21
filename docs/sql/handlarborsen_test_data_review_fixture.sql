begin;
set local search_path=public,extensions;
select no_plan();
select has_function('public','handlarborsen_test_data_decide_review',array['uuid','uuid','uuid','uuid','uuid','text']);
update public.projects set owner_id='20000000-0000-4000-8000-000000000001',slug='handlarborsen',atlas_mode='observer' where id='8f673c09-1c8f-4d78-876e-4c14bf1c89b3';
insert into public.conversations(id,user_id,project_id) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',null);
insert into public.handlarborsen_test_data_operator_grants(user_id,project_id,operator_binding_id,allow_inventory,allowed_operations,expires_at)
values('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','40000000-0000-4000-8000-000000000001',true,array['quarantine','restore'],clock_timestamp()+interval '1 hour');
create temp table fixture(pkg jsonb,review jsonb,job jsonb);
insert into fixture(pkg) values(jsonb_build_object('packageId','50000000-0000-4000-8000-000000000001','projectId','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','conversationId','30000000-0000-4000-8000-000000000001','operatorBindingId','40000000-0000-4000-8000-000000000001','operation','quarantine','organisationIds',jsonb_build_array('60000000-0000-4000-8000-000000000001'),'classificationRevision',repeat('a',64),'graphSha256',repeat('b',64),'expiresAt',to_char(clock_timestamp()+interval '9 minutes','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'counts',jsonb_build_object('organizations',1),'blockers','[]'::jsonb,'status','prepared'));
update fixture set review=public.handlarborsen_test_data_save_review('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001',pkg,repeat('c',64));
select is((select review->>'decisionState' from fixture),'pending','saved package has no authority');
select is((select count(*)::int from public.handlarborsen_test_data_executions),0,'preparation has no execution');
select is(public.handlarborsen_test_data_read_review('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001'),null::jsonb,'other conversation cannot read card');
select is(public.handlarborsen_test_data_claim('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001'),null::jsonb,'pending card cannot claim');
update fixture set review=public.handlarborsen_test_data_decide_review('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',(review->>'reviewRef')::uuid,'approve');
select is((select review->>'decisionState' from fixture),'approved','exact human approval committed');
select is((select count(*)::int from public.handlarborsen_test_data_executions),1,'execution persisted before dispatch');
select lives_ok($$select public.handlarborsen_test_data_decide_review('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',(select (review->>'reviewRef')::uuid from fixture),'approve')$$,'two tabs approve idempotently');
select is((select count(*)::int from public.handlarborsen_test_data_executions),1,'two approvals still one durable execution');
select is((select count(*)::int from public.handlarborsen_test_data_executions where state='pending'),1,'read-only reconcile does not claim');
select is(public.handlarborsen_test_data_read_job('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')->>'dispatch','false','receipt path never dispatches');
update fixture set job=public.handlarborsen_test_data_claim('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001');
select is((select job->>'dispatch' from fixture),'true','first claim may dispatch once');
select is(public.handlarborsen_test_data_claim('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002')->>'dispatch','false','second claim only reads receipt');
select ok(public.handlarborsen_test_data_finish('50000000-0000-4000-8000-000000000001',(select (job->>'executionId')::uuid from fixture),'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',null),'timeout stores unknown');
select is(public.handlarborsen_test_data_claim('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003')->>'dispatch','false','unknown never re-dispatches');
select is(public.handlarborsen_test_data_decide_review('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',(select (review->>'reviewRef')::uuid from fixture),'reject'),null::jsonb,'decision is immutable');
select throws_ok($$update public.handlarborsen_test_data_reviews set package_view='{}'$$,'42501','test_data_immutable','review snapshot immutable');
select throws_ok($$delete from public.handlarborsen_test_data_reviews$$,'42501','test_data_immutable','audit cannot be deleted');
select ok(not has_function_privilege('authenticated','public.handlarborsen_test_data_decide_review(uuid,uuid,uuid,uuid,uuid,text)','execute'),'browser has no direct decision RPC');
select ok(not public.handlarborsen_test_data_finish('50000000-0000-4000-8000-000000000001',(select (job->>'executionId')::uuid from fixture),'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',jsonb_build_object('packageId','50000000-0000-4000-8000-000000000001','executionId',(select job->>'executionId' from fixture),'operation','quarantine','outcome','applied','beforeSha256',null,'afterSha256',null,'counts',jsonb_build_object('organizations',1),'committedAt','2026-10-17T12:00:00Z')),'null digest cannot become a durable success receipt');

select ok(public.handlarborsen_test_data_reject_execution('50000000-0000-4000-8000-000000000001',(select (job->>'executionId')::uuid from fixture),'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','needs_new_review'),'held claim persists definitive no-execution rejection');
select is(public.handlarborsen_test_data_read_review('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')->>'rejectionStatus','needs_new_review','rejection survives refresh without a fake receipt');
select is((select receipt from public.handlarborsen_test_data_executions limit 1),null::jsonb,'no upstream receipt invented');
select is(public.handlarborsen_test_data_claim('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000005')->>'dispatch','false','rejected execution is never replayed');
select ok(not public.handlarborsen_test_data_reject_execution('50000000-0000-4000-8000-000000000001',(select (job->>'executionId')::uuid from fixture),'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000099','denied'),'wrong claim cannot change rejection');
select ok(not has_function_privilege('authenticated','public.handlarborsen_test_data_reject_execution(uuid,uuid,uuid,uuid,uuid,text)','execute'),'browser cannot invent rejection evidence');
update fixture set pkg=jsonb_set(jsonb_set(pkg,'{packageId}','"50000000-0000-4000-8000-000000000002"'),'{expiresAt}',to_jsonb(to_char(clock_timestamp()+interval '0.1 second','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
update fixture set review=public.handlarborsen_test_data_save_review('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001',pkg,repeat('d',64));
select public.handlarborsen_test_data_decide_review('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',(select (review->>'reviewRef')::uuid from fixture),'approve');
select pg_sleep(0.15);
select is(public.handlarborsen_test_data_read_review('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002')->>'rejectionStatus','needs_new_review','expired undispatched approval requests a new review after reload');
select is(public.handlarborsen_test_data_claim('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000006'),null::jsonb,'expired pending job cannot dispatch');
select lives_ok($$delete from public.conversations where id='30000000-0000-4000-8000-000000000001'$$,'normal conversation deletion succeeds with durable cleanup audit');
select is((select count(*)::int from public.handlarborsen_test_data_reviews),2,'deleting conversation retains immutable review evidence');
select throws_ok($$select public.handlarborsen_test_data_read_review('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')$$,'42501','test_data_forbidden','deleted thread loses all review authority');


-- All decision/execution states retain audit identity without blocking live chat deletion.
insert into public.handlarborsen_test_data_reviews(package_id,user_id,project_id,conversation_id,operator_binding_id,operation,package_view,package_fingerprint,expires_at,state,decided_at)
select ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
'20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000002',
'40000000-0000-4000-8000-000000000001','quarantine',
jsonb_set(jsonb_set(pkg,'{packageId}',to_jsonb('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))),'{conversationId}','"30000000-0000-4000-8000-000000000002"'),
repeat('e',64),clock_timestamp()+interval '9 minutes',
case n when 10 then 'pending' when 11 then 'rejected' else 'approved' end,
case when n<>10 then clock_timestamp() end from fixture cross join generate_series(10,13)n;
insert into public.handlarborsen_test_data_executions(package_id,state,claim_token,claimed_at,receipt)
select package_id,case when right(package_id::text,2)='12' then 'unknown' else 'applied' end,gen_random_uuid(),clock_timestamp(),
case when right(package_id::text,2)='13' then jsonb_build_object('outcome','applied') end
from public.handlarborsen_test_data_reviews where conversation_id='30000000-0000-4000-8000-000000000002' and state='approved';
select lives_ok($$delete from public.conversations where id='30000000-0000-4000-8000-000000000002'$$,'pending rejected unknown and applied audit states permit normal conversation deletion');
select is((select count(*)::int from public.handlarborsen_test_data_reviews where conversation_id='30000000-0000-4000-8000-000000000002'),4,'all four lifecycle audit records survive');
select throws_ok($$select public.handlarborsen_test_data_decide_review('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000010',(select review_ref from public.handlarborsen_test_data_reviews where package_id='50000000-0000-4000-8000-000000000010'),'approve')$$,'42501','test_data_forbidden','deleted pending card cannot approve or transfer authority');

select * from finish();
rollback;
