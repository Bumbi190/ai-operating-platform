-- PROPOSED ONLY. Run only after explicit production-release approval and the three O migrations.
-- Current project-owner identity was read on2026-10-18. Recheck before granting.
begin;
do $check$ begin
 if not exists(select 1 from public.projects where id='8f673c09-1c8f-4d78-876e-4c14bf1c89b3' and owner_id='d63a09fb-448e-41b8-9fb2-9a608f5f1800' and slug='handlarborsen' and atlas_mode in('observer','active')) then
  raise exception using errcode='42501',message='project_owner_changed';
 end if;
end $check$;
insert into public.handlarborsen_test_data_operator_grants(user_id,project_id,operator_binding_id,allow_inventory,allowed_operations,expires_at)
values('d63a09fb-448e-41b8-9fb2-9a608f5f1800','8f673c09-1c8f-4d78-876e-4c14bf1c89b3','bf1f981c-2beb-48ef-9003-6ff8d410b4eb',true,'{}',clock_timestamp()+interval '30 days')
on conflict(user_id,project_id) do nothing;
do $check$ begin
 if not exists(select 1 from public.handlarborsen_test_data_operator_grants where user_id='d63a09fb-448e-41b8-9fb2-9a608f5f1800' and project_id='8f673c09-1c8f-4d78-876e-4c14bf1c89b3' and operator_binding_id='bf1f981c-2beb-48ef-9003-6ff8d410b4eb' and allow_inventory and allowed_operations='{}'::text[] and revoked_at is null and expires_at>clock_timestamp()) then
  raise exception using errcode='42501',message='read_operator_conflict';
 end if;
end $check$;
commit;
