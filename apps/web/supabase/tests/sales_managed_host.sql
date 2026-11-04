-- Real PostgreSQL lifecycle regressions. All synthetic state is rolled back.
begin;
create function pg_temp.host_expect_error(statement text, expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if sqlstate=expected then return; end if; raise;
 end;
 raise exception 'TEST FAILED: expected % for %',expected,statement;
end $$;
do $$
declare
 p jsonb:='{"userId":"20000000-0000-4000-8000-000000000001","allowedProjectIds":["10000000-0000-4000-8000-000000000001"]}';
 v jsonb:='{"projectId":"10000000-0000-4000-8000-000000000001","workerId":"60000000-0000-4000-8000-000000000099"}';
 a jsonb;b jsonb;identity jsonb;
begin
 perform public.sales_enroll_worker(p,v||jsonb_build_object('tokenHash',repeat('c',64)));
 -- RED target: new authorization RPC must exist before any subsequent assertion.
 perform pg_temp.host_expect_error(format('select public.sales_host_authorize(%L,%L)',p||'{"userId":"20000000-0000-4000-8000-000000000002"}',v),'P0002');
 perform pg_temp.host_expect_error(format('select public.sales_host_adopt(%L,%L)',repeat('c',64),jsonb_build_object('managerTokenHash',repeat('d',64))),'P0002');
 perform public.sales_host_authorize(p,v);
 a:=public.sales_host_adopt(repeat('c',64),jsonb_build_object('managerTokenHash',repeat('d',64)));
 b:=public.sales_host_adopt(repeat('c',64),jsonb_build_object('managerTokenHash',repeat('d',64)));
 if a<>b then raise exception 'TEST FAILED: adopt not idempotent';end if;
 perform pg_temp.host_expect_error(format('select public.sales_host_adopt(%L,%L)',repeat('c',64),jsonb_build_object('managerTokenHash',repeat('e',64))),'40001');
 identity:=public.sales_host_identity(repeat('d',64));
 if identity->>'workerId'<>v->>'workerId' or identity->>'generation'<>'1' then raise exception 'TEST FAILED: wrong host identity';end if;
 a:=public.sales_host_rotate(repeat('d',64),jsonb_build_object('rotationId','70000000-0000-4000-8000-000000000001','newTokenHash',repeat('e',64),'expectedGeneration',1));
 b:=public.sales_host_rotate(repeat('d',64),jsonb_build_object('rotationId','70000000-0000-4000-8000-000000000001','newTokenHash',repeat('e',64),'expectedGeneration',1));
 if a<>b or a->>'generation'<>'2' then raise exception 'TEST FAILED: rotation receipt changed';end if;
 perform pg_temp.host_expect_error(format('select public.sales_worker_identity(%L)',repeat('c',64)),'P0002');
 perform public.sales_worker_identity(repeat('e',64));
 perform pg_temp.host_expect_error(format('select public.sales_host_rotate(%L,%L)',repeat('d',64),jsonb_build_object('rotationId','70000000-0000-4000-8000-000000000001','newTokenHash',repeat('f',64),'expectedGeneration',1)),'40001');
 perform pg_temp.host_expect_error(format('select public.sales_host_rotate(%L,%L)',repeat('d',64),jsonb_build_object('rotationId','70000000-0000-4000-8000-000000000002','newTokenHash',repeat('f',64),'expectedGeneration',1)),'40001');
 perform public.sales_host_set_desired(p,v||'{"action":"pause"}');
 if public.sales_host_poll(repeat('d',64),'{}')->>'desiredState'<>'paused' then raise exception 'TEST FAILED: pause';end if;
 perform pg_temp.host_expect_error(format('select public.sales_claim_job(%L,%L)',repeat('e',64),'{}'),'55000');
 perform public.sales_host_set_desired(p,v||'{"action":"resume"}');
 perform public.sales_host_report_status(repeat('d',64),'{"generation":2,"cliState":"ready"}');
 if public.sales_host_read_status(p,v)->>'cliState'<>'ready' then raise exception 'TEST FAILED: health';end if;
 if public.sales_host_poll(repeat('d',64),'{}')::text like '%token%' then raise exception 'TEST FAILED: secret metadata leak';end if;
 -- Owner transfer must invalidate both management and ordinary credentials.
 update public.projects set owner_id='20000000-0000-4000-8000-000000000002' where id=(v->>'projectId')::uuid;
 perform pg_temp.host_expect_error(format('select public.sales_host_identity(%L)',repeat('d',64)),'P0002');
 perform pg_temp.host_expect_error(format('select public.sales_host_poll(%L,%L)',repeat('d',64),'{}'),'P0002');
 perform pg_temp.host_expect_error(format('select public.sales_host_report_status(%L,%L)',repeat('d',64),'{"generation":2,"cliState":"ready"}'),'P0002');
 perform pg_temp.host_expect_error(format('select public.sales_host_rotate(%L,%L)',repeat('d',64),'{"rotationId":"70000000-0000-4000-8000-000000000002","expectedGeneration":2}'),'P0002');
 perform pg_temp.host_expect_error(format('select public.sales_worker_identity(%L)',repeat('e',64)),'P0002');
 update public.projects set owner_id=(p->>'userId')::uuid where id=(v->>'projectId')::uuid;
 perform public.sales_revoke_worker(p,v);
 if (select count(*) from public.sales_host_events where worker_id=(v->>'workerId')::uuid and action='revoke')<>1 then raise exception 'TEST FAILED: revocation audit missing';end if;
 perform pg_temp.host_expect_error('update public.sales_host_events set action=action','42501');
 perform pg_temp.host_expect_error('delete from public.sales_host_events','42501');
 perform pg_temp.host_expect_error('truncate public.sales_host_events','42501');
 perform pg_temp.host_expect_error(format('select public.sales_host_identity(%L)',repeat('d',64)),'P0002');
 perform pg_temp.host_expect_error(format('select public.sales_host_poll(%L,%L)',repeat('d',64),'{}'),'P0002');
 perform pg_temp.host_expect_error(format('select public.sales_host_authorize(%L,%L)',p,v),'P0002');
 if has_table_privilege('authenticated','public.sales_host_events','SELECT') or has_table_privilege('anon','public.sales_host_events','INSERT') or has_table_privilege('service_role','public.sales_host_events','UPDATE,DELETE,TRUNCATE') then raise exception 'TEST FAILED: event ACL';end if;
 if exists(select from pg_proc where pronamespace='public'::regnamespace and proname like 'sales_host_%' and (prosecdef or not ('search_path=""'=any(proconfig)) or has_function_privilege('authenticated',oid,'execute') or not has_function_privilege('service_role',oid,'execute'))) then raise exception 'TEST FAILED: RPC security';end if;
end $$;
select 'PASS: managed host grant/adopt/rotation/replay/owner-transfer/revoke/ACL';
rollback;
