begin;
set local search_path=public,extensions;
select no_plan();
create temp table metric_fixture as select jsonb_build_object(
 'companies_registered_total',10,'companies_verified_total',10,'vehicles_published_active',10,'vehicles_reserved',10,'vehicles_published_last_24h',10,
 'bids_total',10,'bids_last_24h',10,'interests_last_24h',10,'offers_last_24h',10,'deals_completed_total',10,'deals_completed_last_24h',10)m;
select is(public.handlarborsen_store_marketplace_snapshot((now() at time zone 'UTC')::date,now(),'{}',(select m from metric_fixture))->>'stored','true','legacy caller still stores its exact original definition');
select is(public.handlarborsen_store_marketplace_snapshot_v2((now() at time zone 'UTC')::date,now(),'{}',(select m from metric_fixture),2)->>'stored','true','v2 can be stored on the same day without replacing legacy data');
select is((select count(*)::integer from public.handlarborsen_marketplace_snapshots where snapshot_date=(now() at time zone 'UTC')::date),2,'same-day observations remain separate by definition');
select is((select companies_registered_total from public.handlarborsen_marketplace_snapshots where definition_id='handlarborsen-legacy-v1'),10::bigint,'legacy history counts are not rewritten');
select is((select data_scope from public.handlarborsen_marketplace_snapshots where definition_id='handlarborsen-production-v2'),'production_excluding_quarantined_test','v2 stores exact production scope');
select is((select excluded_test_organisations from public.handlarborsen_marketplace_snapshots where definition_id='handlarborsen-production-v2'),2::bigint,'v2 stores exclusion metadata');
select is(public.handlarborsen_store_marketplace_snapshot_v2((now() at time zone 'UTC')::date,now()-interval '1 second','{}',(select m from metric_fixture),1)->>'reason','older_observation','older same-definition report cannot overwrite newer');
select throws_ok($$select public.handlarborsen_store_marketplace_snapshot_v2((now() at time zone 'UTC')::date,now(),'{}',(select m from metric_fixture),-1)$$,'22023','handlarborsen_snapshot_invalid:excluded_count','negative exclusion count rejected');
select ok(not has_function_privilege('authenticated','public.handlarborsen_store_marketplace_snapshot_v2(date,timestamptz,jsonb,jsonb,bigint)','EXECUTE'),'ordinary user cannot store v2');
select ok(not has_table_privilege('service_role','public.handlarborsen_marketplace_snapshots','UPDATE'),'service still cannot bypass guarded store');
select * from finish();
rollback;
