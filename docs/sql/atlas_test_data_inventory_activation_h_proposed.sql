-- PROPOSED ONLY. Run only after explicit production-release approval and the six H migrations.
-- Inventory only: no quarantine/restore grant, no real-company data changes.
begin;
insert into private.atlas_test_data_bindings(operator_binding_id,omnira_user_id,project_id,allow_inventory,allowed_operations,expires_at)
values('bf1f981c-2beb-48ef-9003-6ff8d410b4eb','d63a09fb-448e-41b8-9fb2-9a608f5f1800','8f673c09-1c8f-4d78-876e-4c14bf1c89b3',true,'{}',clock_timestamp()+interval '30 days')
on conflict(operator_binding_id) do nothing;
do $check$ begin
 if not exists(select 1 from private.atlas_test_data_bindings where operator_binding_id='bf1f981c-2beb-48ef-9003-6ff8d410b4eb' and omnira_user_id='d63a09fb-448e-41b8-9fb2-9a608f5f1800' and project_id='8f673c09-1c8f-4d78-876e-4c14bf1c89b3' and allow_inventory and allowed_operations='{}'::text[] and revoked_at is null and expires_at>clock_timestamp()) then
  raise exception using errcode='42501',message='read_binding_conflict';
 end if;
end $check$;
commit;
