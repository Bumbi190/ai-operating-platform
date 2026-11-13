-- Offline admission proof only. No provider requests are made.
-- Constants: provider timeout27s, route45s; terminal cooldown30s;
-- unresolved pending hold90s; at most25 admissions in rolling24h.
begin;
create temp table discovery_admission_failures(label text,error text);
create function pg_temp.discovery_admission_case(label text,body text) returns void language plpgsql as $$begin execute body;raise notice 'PASS %',label;exception when others then raise notice 'FAIL %: %',label,sqlerrm;insert into discovery_admission_failures values(label,sqlerrm);end$$;
create function pg_temp.discovery_admission_reset() returns void language plpgsql as $$begin
 if current_database() !~ '^sales_[0-9]+$' then raise exception 'NOT_A_DISPOSABLE_SALES_FIXTURE';end if;
 update public.sales_discovery_batches b set created_at=clock_timestamp()-interval '2 days',completed_at=case when b.completed_at is null then null else clock_timestamp()-interval '2 days' end from public.projects p where b.project_id=p.id and p.slug like 'fixture-discovery-%' and p.owner_id='20000000-0000-4000-8000-000000000001';
end$$;
create function pg_temp.discovery_admission_query() returns jsonb language sql as $$select '{"city":"stockholm","category":"car_dealer","radiusKm":5,"limit":20}'::jsonb$$;

select pg_temp.discovery_admission_case('cross-project cooldown follows terminal response and preserves exact replay',$case$do $$
declare a jsonb:=sales_regression_fixture('discovery-global-a');b jsonb:=sales_regression_fixture('discovery-global-b');key_a uuid:=gen_random_uuid();first jsonb;r jsonb;begin
 perform pg_temp.discovery_admission_reset();
 first:=sales_discovery_begin(a->'principal',jsonb_build_object('projectId',a->>'projectId','idempotencyKey',key_a,'query',pg_temp.discovery_admission_query()));
 perform sales_test_assert(first->'fetchRequired'='true','first project admitted');
 perform sales_discovery_fail(a->'principal',jsonb_build_object('projectId',a->>'projectId','batchId',first->>'batchId','errorCode','DISCOVERY_SOURCE_NOT_CONFIGURED'));
 r:=sales_discovery_begin(b->'principal',jsonb_build_object('projectId',b->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_admission_query()));
 perform sales_test_assert(r->'rateLimited'='true','second project shares cooldown');
 r:=sales_discovery_begin(a->'principal',jsonb_build_object('projectId',a->>'projectId','idempotencyKey',key_a,'query',pg_temp.discovery_admission_query()));
 perform sales_test_assert(r->'fetchRequired'='false' and r->>'batchId'=first->>'batchId','exact replay never fetches or consumes another slot');
 update sales_discovery_batches set created_at=clock_timestamp()-interval '91 seconds',completed_at=clock_timestamp()-interval '10 seconds' where project_id=(a->>'projectId')::uuid;
 r:=sales_discovery_begin(b->'principal',jsonb_build_object('projectId',b->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_admission_query()));
 perform sales_test_assert(r->'rateLimited'='true','cooldown uses terminal response, not stale start');
 update sales_discovery_batches set completed_at=clock_timestamp()-interval '31 seconds' where project_id=(a->>'projectId')::uuid;
 r:=sales_discovery_begin(b->'principal',jsonb_build_object('projectId',b->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_admission_query()));
 perform sales_test_assert(r->'fetchRequired'='true','different project admitted after shared cooldown');
end$$;$case$);

select pg_temp.discovery_admission_case('unresolved pending admission holds90s without inventing a terminal outcome',$case$do $$
declare a jsonb:=sales_regression_fixture('discovery-pending-a');b jsonb:=sales_regression_fixture('discovery-pending-b');first jsonb;r jsonb;begin
 perform pg_temp.discovery_admission_reset();
 first:=sales_discovery_begin(a->'principal',jsonb_build_object('projectId',a->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_admission_query()));
 update sales_discovery_batches set created_at=clock_timestamp()-interval '60 seconds' where id=(first->>'batchId')::uuid;
 r:=sales_discovery_begin(b->'principal',jsonb_build_object('projectId',b->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_admission_query()));
 perform sales_test_assert(r->'rateLimited'='true','still protected beyond the route45s window');
 update sales_discovery_batches set created_at=clock_timestamp()-interval '91 seconds' where id=(first->>'batchId')::uuid;
 r:=sales_discovery_begin(b->'principal',jsonb_build_object('projectId',b->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_admission_query()));
 perform sales_test_assert(r->'fetchRequired'='true','manual new admission allowed after conservative unresolved hold');
 perform sales_test_assert((select state='pending' from sales_discovery_batches where id=(first->>'batchId')::uuid),'old unknown outcome was not fabricated or retried');
end$$;$case$);

select pg_temp.discovery_admission_case('25th global attempt allowed26th refused and rolling window expires',$case$do $$
declare a jsonb:=sales_regression_fixture('discovery-quota-a');b jsonb:=sales_regression_fixture('discovery-quota-b');key_b uuid:=gen_random_uuid();last_allowed jsonb;r jsonb;begin
 perform pg_temp.discovery_admission_reset();
 -- Only synthetic admission metadata is seeded; failed attempts count too.
 insert into sales_discovery_batches(project_id,owner_id,request_key,query,state,error_code,created_at,completed_at)
 select (a->>'projectId')::uuid,(a->'principal'->>'userId')::uuid,gen_random_uuid(),pg_temp.discovery_admission_query(),'failed','DISCOVERY_RATE_LIMITED',clock_timestamp()-interval '2 minutes'-make_interval(secs=>i),clock_timestamp()-interval '2 minutes'-make_interval(secs=>i) from generate_series(1,24) i;
 last_allowed:=sales_discovery_begin(b->'principal',jsonb_build_object('projectId',b->>'projectId','idempotencyKey',key_b,'query',pg_temp.discovery_admission_query()));
 perform sales_test_assert(last_allowed->'fetchRequired'='true','25th global attempt admitted in another project');
 update sales_discovery_batches set created_at=clock_timestamp()-interval '2 minutes' where id=(last_allowed->>'batchId')::uuid;
 r:=sales_discovery_begin(a->'principal',jsonb_build_object('projectId',a->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_admission_query()));
 perform sales_test_assert(r->'rateLimited'='true','26th refused after cooldown and pending windows already elapsed');
 r:=sales_discovery_begin(b->'principal',jsonb_build_object('projectId',b->>'projectId','idempotencyKey',key_b,'query',pg_temp.discovery_admission_query()));
 perform sales_test_assert(r->'fetchRequired'='false' and r->>'batchId'=last_allowed->>'batchId','replay remains available at quota');
 update sales_discovery_batches set created_at=clock_timestamp()-interval '25 hours',completed_at=clock_timestamp()-interval '25 hours' where id=(select id from sales_discovery_batches where project_id=(a->>'projectId')::uuid order by created_at limit 1);
 r:=sales_discovery_begin(a->'principal',jsonb_build_object('projectId',a->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_admission_query()));
 perform sales_test_assert(r->'fetchRequired'='true','rolling24h quota releases an expired attempt');
 perform sales_test_assert((select count(*)=25 from sales_discovery_batches where project_id in((a->>'projectId')::uuid,(b->>'projectId')::uuid) and created_at>clock_timestamp()-interval '24 hours'),'rolling window stays at25');
end$$;$case$);

select pg_temp.discovery_admission_case('project authorization precedes global admission decisions',$case$do $$
declare a jsonb:=sales_regression_fixture('discovery-admit-scope-a');b jsonb:=sales_regression_fixture('discovery-admit-scope-b');begin
 perform pg_temp.discovery_admission_reset();
 begin perform sales_discovery_begin(a->'principal',jsonb_build_object('projectId',b->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_admission_query()));raise exception 'TEST FAILED: foreign project admission';exception when no_data_found then null;end;
 perform sales_test_assert((select count(*)=0 from sales_discovery_batches where project_id=(b->>'projectId')::uuid),'foreign attempt writes no batch');
end$$;$case$);
table discovery_admission_failures;
do $$begin if exists(select from discovery_admission_failures) then raise exception 'sales discovery admission regression failures';end if;end$$;
rollback;
