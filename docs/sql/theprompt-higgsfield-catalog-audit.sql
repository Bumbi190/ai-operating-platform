-- Higgsfield read-only Postgres catalog inspection. No DML, DDL or token reads.
-- Expected PRE-apply: fully_passed=false and missing tables/functions.
-- Expected POST-apply: fully_passed=true after independent security review.
-- This does not replace application-level authorization tests or a full schema advisor run.
with
 expected_tables(name) as (
   values ('media_provider_connections'::text), ('media_provider_oauth_states'::text)
 ),
 audited_tables as (
   select e.name as table_name,
     c.oid is not null as exists_in_public,
     coalesce(c.relrowsecurity,false) as rls_enabled,
     (select count(*) from pg_policies pp where pp.schemaname='public' and pp.tablename=e.name) as policy_count,
     coalesce(has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false) as anon_any_table_grant,
     coalesce(has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false) as authenticated_any_table_grant,
     coalesce(has_table_privilege('service_role', c.oid, 'SELECT'),false) as service_select,
     coalesce(has_table_privilege('service_role', c.oid, 'INSERT'),false) as service_insert,
     coalesce(has_table_privilege('service_role', c.oid, 'UPDATE'),false) as service_update,
     coalesce(has_table_privilege('service_role', c.oid, 'DELETE,TRUNCATE'),false) as service_delete_or_truncate
   from expected_tables e
   left join pg_class c on c.oid=to_regclass(format('public.%I',e.name))
 ),
 expected_functions(name) as (
   values ('higgsfield_connection_read'::text),
     ('higgsfield_oauth_create'), ('higgsfield_oauth_peek'), ('higgsfield_oauth_consume'),
     ('higgsfield_connection_save'), ('higgsfield_refresh_acquire'),
     ('higgsfield_refresh_release'), ('higgsfield_reconnect_required'),
     ('higgsfield_connection_disconnect')
 ),
 audited_functions as (
   select e.name as function_name,
     count(p.oid) as overload_count,
     coalesce(bool_and(not p.prosecdef),false) as security_invoker_only,
     coalesce(bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')),false) as anon_can_execute,
     coalesce(bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')),false) as authenticated_can_execute,
     coalesce(bool_and(has_function_privilege('service_role',p.oid,'EXECUTE')),false) as service_can_execute
   from expected_functions e
   left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname=e.name
   group by e.name
 ),
 table_checks as (
   select *, (exists_in_public and rls_enabled and policy_count=0
     and not anon_any_table_grant and not authenticated_any_table_grant
     and service_select and service_insert and service_update
     and not service_delete_or_truncate) as passed
   from audited_tables
 ),
 function_checks as (
   select *, (overload_count=1 and security_invoker_only
     and not anon_can_execute and not authenticated_can_execute and service_can_execute) as passed
   from audited_functions
 )
select jsonb_build_object(
 'fully_passed',(select coalesce(bool_and(passed),false) from table_checks)
              and (select coalesce(bool_and(passed),false) from function_checks),
 'table_checks',(select jsonb_agg(to_jsonb(t) order by t.table_name) from table_checks t),
 'function_checks',(select jsonb_agg(to_jsonb(f) order by f.function_name) from function_checks f)
) as higgsfield_catalog_audit;
