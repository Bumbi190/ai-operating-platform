begin;
set local search_path=public,extensions;
select no_plan();
select has_function('public','handlarborsen_resolve_test_data_operator',array['uuid','uuid','uuid','text']);
select has_function('public','handlarborsen_test_data_claim',array['uuid','uuid','uuid','uuid','uuid']);
select ok(not has_table_privilege('service_role','public.handlarborsen_test_data_reviews','select'),'review table is database internal');
select ok(not has_function_privilege('authenticated','public.handlarborsen_test_data_claim(uuid,uuid,uuid,uuid,uuid)','execute'),'no browser claim');
insert into public.projects(id,owner_id,slug,atlas_mode) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','foreign','active');
update public.projects set owner_id='20000000-0000-4000-8000-000000000001',slug='handlarborsen',atlas_mode='observer' where id='8f673c09-1c8f-4d78-876e-4c14bf1c89b3';
insert into public.conversations(id,user_id,project_id) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
select throws_ok($$select public.handlarborsen_resolve_test_data_operator('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001',null)$$,'42501','test_data_forbidden','owner alone has no grant');
insert into public.handlarborsen_test_data_operator_grants(user_id,project_id,operator_binding_id,allow_inventory,allowed_operations,expires_at)
values('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','40000000-0000-4000-8000-000000000001',true,'{}',clock_timestamp()+interval '1 hour');
select is(public.handlarborsen_resolve_test_data_operator('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001',null)->>'atlasMode','observer','explicit read grant permits observer');
select throws_ok($$select public.handlarborsen_resolve_test_data_operator('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','quarantine')$$,'42501','test_data_forbidden','observer read grant cannot mutate');
update public.handlarborsen_test_data_operator_grants set allowed_operations=array['quarantine','restore'];
select is(jsonb_array_length(public.handlarborsen_resolve_test_data_operator('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','quarantine')->'allowedOperations'),2,'explicit operations permit observer');
select throws_ok($$select public.handlarborsen_resolve_test_data_operator('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000002',null)$$,'42501','test_data_forbidden','other project conversation denied');
select is(public.handlarborsen_test_data_claim('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001'),null::jsonb,'model cannot create decision via claim');
update public.handlarborsen_test_data_operator_grants set revoked_at=clock_timestamp();
select throws_ok($$select public.handlarborsen_resolve_test_data_operator('20000000-0000-4000-8000-000000000001','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','30000000-0000-4000-8000-000000000001',null)$$,'42501','test_data_forbidden','revoked grant immediately denied');
select * from finish();
rollback;
