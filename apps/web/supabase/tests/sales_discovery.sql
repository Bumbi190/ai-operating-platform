-- Synthetic fixture projects only; rollback leaves no candidates or contacts.
begin;
set local timezone='UTC';
create temp table discovery_failures(label text,error text);
create function pg_temp.discovery_case(label text,body text) returns void language plpgsql as $$begin execute body;raise notice 'PASS %',label;exception when others then raise notice 'FAIL %: %',label,sqlerrm;insert into discovery_failures values(label,sqlerrm);end$$;
create function pg_temp.discovery_query() returns jsonb language sql as $$select '{"city":"stockholm","category":"car_dealer","radiusKm":5,"limit":20}'::jsonb$$;
create function pg_temp.discovery_reset_provider_window() returns void language plpgsql as $$begin
 if current_database() !~ '^sales_[0-9]+$' then raise exception 'NOT_A_DISPOSABLE_SALES_FIXTURE';end if;
 update public.sales_discovery_batches b set created_at=clock_timestamp()-interval '2 days',completed_at=case when b.completed_at is null then null else clock_timestamp()-interval '2 days' end from public.projects p where b.project_id=p.id and p.slug like 'fixture-discovery-%' and p.owner_id='20000000-0000-4000-8000-000000000001';
end$$;
create function pg_temp.discovery_setup(label text) returns jsonb language plpgsql as $$
declare f jsonb:=sales_regression_fixture(label);b jsonb;k uuid:=gen_random_uuid();r jsonb;one jsonb;two jsonb;begin
 perform pg_temp.discovery_reset_provider_window();
 b:=sales_discovery_begin(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',k,'query',pg_temp.discovery_query()));
 perform sales_test_assert(b->'fetchRequired'='true','fresh fixture admitted');
 one:=jsonb_build_object('sourceId','node/9999999999991','sourceUrl','https://www.openstreetmap.org/node/9999999999991','name','Synthetic discovery one '||(f->>'projectId'),'websiteUrl','https://discovery-one.example.com/','email','public@discovery-one.example.com','exclusions','[]'::jsonb);
 two:=jsonb_build_object('sourceId','node/9999999999992','sourceUrl','https://www.openstreetmap.org/node/9999999999992','name','Synthetic discovery two '||(f->>'projectId'),'websiteUrl','https://discovery-two.example.com/','email','public@discovery-two.example.com','exclusions','[]'::jsonb);
 perform sales_discovery_finish(f->'principal',jsonb_build_object('projectId',f->>'projectId','batchId',b->>'batchId','retrievedAt',to_char(clock_timestamp(),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'candidates',jsonb_build_array(one,two)));
 r:=sales_discovery_read(f->'principal',jsonb_build_object('projectId',f->>'projectId','batchId',b->>'batchId'));
 return f||jsonb_build_object('discoveryBatchId',b->>'batchId','discoveryRequestId',k,'discoveryCandidates',r->'candidates');
end$$;
create function pg_temp.discovery_promotion(f jsonb,idx integer default 0) returns jsonb language sql as $$
 select jsonb_build_object('projectId',f->>'projectId','candidateId',f->'discoveryCandidates'->idx->>'id','expectedVersion',1,'companyName',f->'discoveryCandidates'->idx->>'name','branchName','','email',f->'discoveryCandidates'->idx->>'email','websiteUrl',f->'discoveryCandidates'->idx->>'websiteUrl','reviewNote','Synthetic independent business and recipient verification','businessConfirmed',true,'emailConfirmed',true,'offerKind','general_service','pilotMonths',null,'baselineReasons','[]'::jsonb)
$$;

select pg_temp.discovery_case('partial candidates and no contact/model work',$case$do $$declare f jsonb:=pg_temp.discovery_setup('discovery-partial');r jsonb;begin
 r:=sales_discovery_read(f->'principal',jsonb_build_object('projectId',f->>'projectId','batchId',f->>'discoveryBatchId'));
 perform sales_test_assert(r->>'historyCoverage'='partial' and r->'customerSendingEnabled'='false','unknown history retained');
 perform sales_test_assert(jsonb_array_length(r->'candidates')=2 and r->'candidates'->0->'outreachReady'='false','finite review candidates');
 perform sales_test_assert((select count(*)=1 from sales_contacts where project_id=(f->>'projectId')::uuid),'discovery creates no sales contact');
 perform sales_test_assert((select count(*)=0 from sales_jobs where project_id=(f->>'projectId')::uuid),'discovery queues no work');
end$$;$case$);
select pg_temp.discovery_case('idempotent admission and per-project rate bound',$case$do $$declare f jsonb:=pg_temp.discovery_setup('discovery-admission');r jsonb;begin
 r:=sales_discovery_begin(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',f->>'discoveryRequestId','query',pg_temp.discovery_query()));
 perform sales_test_assert(r->'fetchRequired'='false' and r->>'batchId'=f->>'discoveryBatchId','retry never re-fetches');
 r:=sales_discovery_begin(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_query()));perform sales_test_assert(r->'rateLimited'='true','new burst bounded');
 begin perform sales_discovery_begin(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',f->>'discoveryRequestId','query',pg_temp.discovery_query()||'{"radiusKm":6}'));raise exception 'TEST FAILED: idempotency query changed';exception when unique_violation then null;end;
end$$;$case$);
select pg_temp.discovery_case('service promotion is explicit atomic replay and remains history-blocked',$case$do $$declare f jsonb:=pg_temp.discovery_setup('discovery-service');p jsonb:=pg_temp.discovery_promotion(f);a jsonb;b jsonb;d jsonb;t jsonb;begin
 a:=sales_discovery_promote(f->'principal',p);b:=sales_discovery_promote(f->'principal',p);
 perform sales_test_assert(a=b and a->>'state'='promoted','same promotion returns original contact');
 select data into d from sales_contacts where project_id=(f->>'projectId')::uuid and id=(a->>'contactId')::uuid;
 perform sales_test_assert(d->>'history'='unknown' and d->'confirmed'='true' and d->>'offerKind'='general_service' and d->'pilotMonths'='null','verified contact is not cleared history');
 perform sales_test_assert((select count(*)=2 from sales_contacts where project_id=(f->>'projectId')::uuid),'exactly one new contact');
 t:=sales_timing_evaluate((f->>'projectId')::uuid,(a->>'contactId')::uuid,clock_timestamp());perform sales_test_assert(t->'initialPreparationAllowed'='false','missing history/timing blocks drafts');
 perform sales_test_assert((select count(*)=0 from sales_jobs where project_id=(f->>'projectId')::uuid),'promotion queues no job');
 begin perform sales_discovery_promote(f->'principal',p||'{"reviewNote":"Changed replay"}');raise exception 'TEST FAILED: replay changed';exception when unique_violation then null;end;
end$$;$case$);
select pg_temp.discovery_case('pilot promotion retains explicitly selected legacy tier',$case$do $$declare f jsonb:=pg_temp.discovery_setup('discovery-pilot');r jsonb;d jsonb;begin
 r:=sales_discovery_promote(f->'principal',pg_temp.discovery_promotion(f)||'{"offerKind":"pilot","pilotMonths":6}');
 select data into d from sales_contacts where id=(r->>'contactId')::uuid;
 perform sales_test_assert(d->>'offerKind'='pilot' and d->'pilotMonths'='6' and d->>'history'='unknown','pilot preserved without false history');
end$$;$case$);
select pg_temp.discovery_case('SQL blocks confirmation and history injection',$case$do $$declare f jsonb:=pg_temp.discovery_setup('discovery-strict');p jsonb:=pg_temp.discovery_promotion(f);begin
 begin perform sales_discovery_promote(f->'principal',p||'{"emailConfirmed":false}');raise exception 'TEST FAILED: unverified email';exception when invalid_parameter_value then null;end;
 begin perform sales_discovery_promote(f->'principal',p||'{"businessConfirmed":false}');raise exception 'TEST FAILED: unverified business';exception when invalid_parameter_value then null;end;
 begin perform sales_discovery_promote(f->'principal',p||'{"history":"not_contacted"}');raise exception 'TEST FAILED: invented history';exception when invalid_parameter_value then null;end;
 begin perform sales_discovery_promote(f->'principal',p||'{"websiteUrl":"https://localhost/"}');raise exception 'TEST FAILED: local URL';exception when invalid_parameter_value then null;end;
 begin perform sales_discovery_promote(f->'principal',p||'{"websiteUrl":"https://router.home.arpa/"}');raise exception 'TEST FAILED: local alias URL';exception when invalid_parameter_value then null;end;
 begin perform sales_discovery_promote(f->'principal',p||'{"offerKind":"pilot","pilotMonths":null}');raise exception 'TEST FAILED: missing pilot tier';exception when invalid_parameter_value then null;end;
 begin perform sales_discovery_promote(f->'principal',p||'{"offerKind":"pilot","pilotMonths":"6"}');raise exception 'TEST FAILED: string pilot tier';exception when invalid_parameter_value then null;end;
end$$;$case$);
select pg_temp.discovery_case('new suppression is rechecked inside promotion transaction',$case$do $$declare f jsonb:=pg_temp.discovery_setup('discovery-suppression');p jsonb:=pg_temp.discovery_promotion(f);r jsonb;begin
 perform sales_save_contact(f->'principal',jsonb_build_object('projectId',f->>'projectId','id',gen_random_uuid(),'companyName','Synthetic later suppressed contact','branchName','','email',p->>'email','websiteUrl',null,'history','unknown','historySource','Synthetic suppression recorded after discovery','offerKind','general_service','pilotMonths',null,'confirmed',true,'excluded',false,'suppressed',true,'expectedVersion',0));
 r:=sales_discovery_promote(f->'principal',p);perform sales_test_assert(r->>'state'='blocked' and r->'reasons' ? 'suppressed','live suppression blocks');
 perform sales_test_assert((select status='suppressed' from sales_discovery_candidates where id=(p->>'candidateId')::uuid),'suppression persisted');
 perform sales_test_assert((select count(*)=2 from sales_contacts where project_id=(f->>'projectId')::uuid),'no duplicate created');
end$$;$case$);
select pg_temp.discovery_case('different candidates cannot promote the same verified mailbox',$case$do $$declare f jsonb:=pg_temp.discovery_setup('discovery-mailbox-dedupe');a jsonb;b jsonb;p1 jsonb:=pg_temp.discovery_promotion(f,0)||'{"email":"verified@shared-discovery.example.com"}';p2 jsonb:=pg_temp.discovery_promotion(f,1)||'{"email":"verified@shared-discovery.example.com"}';begin
 a:=sales_discovery_promote(f->'principal',p1);b:=sales_discovery_promote(f->'principal',p2);
 perform sales_test_assert(a->>'state'='promoted' and b->>'state'='blocked','only one candidate creates the mailbox');
 perform sales_test_assert((select count(*)=1 from sales_contacts where project_id=(f->>'projectId')::uuid and data->>'email'='verified@shared-discovery.example.com'),'mailbox dedup');
end$$;$case$);
select pg_temp.discovery_case('rejected source remains rejected on rediscovery',$case$do $$declare f jsonb:=pg_temp.discovery_setup('discovery-rejection');b jsonb;r jsonb;item jsonb;begin
 perform sales_discovery_review(f->'principal',jsonb_build_object('projectId',f->>'projectId','candidateId',f->'discoveryCandidates'->0->>'id','expectedVersion',1,'decision','rejected','note','Synthetic unsuitable business'));
 update sales_discovery_batches set created_at=clock_timestamp()-interval '31 seconds',completed_at=clock_timestamp()-interval '31 seconds' where project_id=(f->>'projectId')::uuid;
 b:=sales_discovery_begin(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_query()));
 select data||'{"exclusions":[]}'::jsonb into item from sales_discovery_candidates where id=(f->'discoveryCandidates'->0->>'id')::uuid;
 perform sales_discovery_finish(f->'principal',jsonb_build_object('projectId',f->>'projectId','batchId',b->>'batchId','retrievedAt',to_char(clock_timestamp(),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'candidates',jsonb_build_array(item)));
 r:=sales_discovery_read(f->'principal',jsonb_build_object('projectId',f->>'projectId','batchId',b->>'batchId'));
 perform sales_test_assert(r->'candidates'->0->>'id'=f->'discoveryCandidates'->0->>'id' and r->'candidates'->0->>'status'='rejected','persistent stable dedup and rejection');
end$$;$case$);
select pg_temp.discovery_case('plain duplicate candidate cannot veto its canonical promotion',$case$do $$declare f jsonb:=pg_temp.discovery_setup('discovery-canonical');b jsonb;item jsonb;r jsonb;begin
 update sales_discovery_batches set created_at=clock_timestamp()-interval '31 seconds',completed_at=clock_timestamp()-interval '31 seconds' where project_id=(f->>'projectId')::uuid;
 b:=sales_discovery_begin(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_query()));
 select data||'{"sourceId":"node/9999999999993","sourceUrl":"https://www.openstreetmap.org/node/9999999999993","exclusions":[]}'::jsonb into item from sales_discovery_candidates where id=(f->'discoveryCandidates'->0->>'id')::uuid;
 perform sales_discovery_finish(f->'principal',jsonb_build_object('projectId',f->>'projectId','batchId',b->>'batchId','retrievedAt',to_char(clock_timestamp(),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'candidates',jsonb_build_array(item)));
 perform sales_test_assert((select status='duplicate' and exclusions=array['duplicate_candidate'] from sales_discovery_candidates where project_id=(f->>'projectId')::uuid and source_key='node/9999999999993'),'plain duplicate fixture');
 r:=sales_discovery_promote(f->'principal',pg_temp.discovery_promotion(f));
 perform sales_test_assert(r->>'state'='promoted','canonical candidate remains reviewable and promotable');
end$$;$case$);
select pg_temp.discovery_case('manual identity edits cannot bypass another candidate prevention decision',$case$do $$declare f jsonb;p jsonb;r jsonb;decision text;begin
 foreach decision in array array['suppressed','excluded','rejected'] loop
  f:=pg_temp.discovery_setup('discovery-candidate-'||decision);
  perform sales_discovery_review(f->'principal',jsonb_build_object('projectId',f->>'projectId','candidateId',f->'discoveryCandidates'->0->>'id','expectedVersion',1,'decision',decision,'note','Synthetic persistent prevention decision'));
  p:=pg_temp.discovery_promotion(f,1)||jsonb_build_object('companyName',f->'discoveryCandidates'->0->>'name','email',f->'discoveryCandidates'->0->>'email','websiteUrl',f->'discoveryCandidates'->0->>'websiteUrl');
  r:=sales_discovery_promote(f->'principal',p);
  perform sales_test_assert(r->>'state'='blocked' and r->'reasons' ? 'duplicate_candidate','edited identity is still a known candidate');
  if decision='suppressed' then perform sales_test_assert(r->'reasons' ? 'suppressed','candidate suppression propagated');else perform sales_test_assert(r->'reasons' ? 'excluded','candidate rejection/exclusion propagated');end if;
  perform sales_test_assert((select count(*)=1 from sales_contacts where project_id=(f->>'projectId')::uuid),'no contact created through candidate edit');
 end loop;
end$$;$case$);
select pg_temp.discovery_case('project scope and denied browser privileges',$case$do $$declare f jsonb:=pg_temp.discovery_setup('discovery-scope-a');other jsonb:=pg_temp.discovery_setup('discovery-scope-b');begin
 begin perform sales_discovery_read(f->'principal',jsonb_build_object('projectId',other->>'projectId','batchId',null));raise exception 'TEST FAILED: foreign read';exception when no_data_found then null;end;
 begin perform sales_discovery_candidate(f->'principal',jsonb_build_object('projectId',f->>'projectId','candidateId',other->'discoveryCandidates'->0->>'id'));raise exception 'TEST FAILED: foreign candidate';exception when no_data_found then null;end;
 perform sales_test_assert(not has_function_privilege('authenticated','public.sales_discovery_promote(jsonb,jsonb)','execute') and not has_table_privilege('authenticated','public.sales_discovery_candidates','select'),'server-only candidate access');
end$$;$case$);
select pg_temp.discovery_case('fixed provenance and bounded SQL candidate payload',$case$do $$declare f jsonb:=sales_regression_fixture('discovery-source');b jsonb;bad jsonb;begin
 perform pg_temp.discovery_reset_provider_window();
 begin perform sales_discovery_begin(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_query()||'{"limit":26}'));raise exception 'TEST FAILED: unbounded query';exception when invalid_parameter_value then null;end;
 b:=sales_discovery_begin(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_query()));
 bad:=jsonb_build_object('sourceId','node/9999999999999','sourceUrl','https://attacker.example.com/','name','Synthetic source','email',null,'websiteUrl',null,'exclusions','[]'::jsonb);
 begin perform sales_discovery_finish(f->'principal',jsonb_build_object('projectId',f->>'projectId','batchId',b->>'batchId','retrievedAt',to_char(clock_timestamp(),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'candidates',jsonb_build_array(bad)));raise exception 'TEST FAILED: arbitrary source';exception when invalid_parameter_value then null;end;
 perform sales_discovery_fail(f->'principal',jsonb_build_object('projectId',f->>'projectId','batchId',b->>'batchId','errorCode','DISCOVERY_RATE_LIMITED'));
 perform sales_test_assert((select state='failed' and error_code='DISCOVERY_RATE_LIMITED' from sales_discovery_batches where id=(b->>'batchId')::uuid),'provider failure preserved');
end$$;$case$);
select pg_temp.discovery_case('storage failure closes pending batches without rewriting completed results',$case$do $$declare f jsonb:=sales_regression_fixture('discovery-store-failure');b jsonb;done jsonb;r jsonb;begin
 perform pg_temp.discovery_reset_provider_window();
 b:=sales_discovery_begin(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'query',pg_temp.discovery_query()));
 perform sales_discovery_fail(f->'principal',jsonb_build_object('projectId',f->>'projectId','batchId',b->>'batchId','errorCode','DISCOVERY_STORE_UNAVAILABLE'));
 r:=sales_discovery_read(f->'principal',jsonb_build_object('projectId',f->>'projectId','batchId',b->>'batchId'));
 perform sales_test_assert(r->'batch'->>'state'='failed' and r->'batch'->>'errorCode'='DISCOVERY_STORE_UNAVAILABLE','pending storage failure persisted');
 done:=pg_temp.discovery_setup('discovery-completion-preserved');
 perform sales_discovery_fail(done->'principal',jsonb_build_object('projectId',done->>'projectId','batchId',done->>'discoveryBatchId','errorCode','DISCOVERY_STORE_UNAVAILABLE'));
 r:=sales_discovery_read(done->'principal',jsonb_build_object('projectId',done->>'projectId','batchId',done->>'discoveryBatchId'));
 perform sales_test_assert(r->'batch'->>'state'='completed' and jsonb_array_length(r->'candidates')=2,'uncertain finish response never destroys committed completion');
end$$;$case$);
table discovery_failures;
do $$begin if exists(select from discovery_failures) then raise exception 'sales discovery regression failures';end if;end$$;
rollback;
