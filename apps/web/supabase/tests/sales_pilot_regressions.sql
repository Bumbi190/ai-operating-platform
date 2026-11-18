-- Independent disposable projects keep each review regression meaningful.
create function sales_regression_fixture(label text) returns jsonb language plpgsql as $$
declare pid uuid:=gen_random_uuid();cid uuid:=gen_random_uuid();oid uuid:=gen_random_uuid();conv uuid:=gen_random_uuid();w uuid:=gen_random_uuid();token text:=encode(extensions.gen_random_bytes(32),'hex');p jsonb;i jsonb;begin
 p:=jsonb_build_object('userId','20000000-0000-4000-8000-000000000001','allowedProjectIds',jsonb_build_array(pid));
 insert into projects values(pid,'20000000-0000-4000-8000-000000000001','fixture-'||label,false);insert into conversations values(conv,'20000000-0000-4000-8000-000000000001',pid);
 perform sales_save_contact(p,jsonb_build_object('projectId',pid,'id',cid,'companyName','Fixture','branchName','Nord','email',label||'@example.se','websiteUrl',null,'history','not_contacted','pilotMonths',12,'historySource','Synthetic verified fixture','confirmed',true,'excluded',false,'suppressed',false,'expectedVersion',0));
 perform sales_save_offer(p,jsonb_build_object('projectId',pid,'id',oid,'senderEmail','info@handlarborsen.se','freeMonths',12,'offerText','12 månader gratis','productFacts',jsonb_build_array('B2B-marknadsplats'),'confirmed',true));
 perform sales_enroll_worker(p,jsonb_build_object('projectId',pid,'workerId',w,'tokenHash',token));
 i:=jsonb_build_object('projectId',pid,'conversationId',conv,'contactIds',jsonb_build_array(cid),'offerRevisionId',oid,'idempotencyKey','first');
 return jsonb_build_object('principal',p,'input',i,'token',token,'workerId',w,'contactId',cid,'projectId',pid,'draft',jsonb_build_object('contactId',cid,'contactVersion',1,'offerRevisionId',oid,'senderEmail','info@handlarborsen.se','toEmail',label||'@example.se','subject','En fråga','body','Vill ni prova 12 månader gratis?','evidenceIds','[]'::jsonb,'questions','[]'::jsonb));end $$;
create temp table sales_review_failures(label text,error text);
create function pg_temp.sales_case(label text,body text) returns void language plpgsql as $$begin execute body;raise notice 'PASS %',label;exception when others then insert into sales_review_failures values(label,sqlerrm);end $$;
select pg_temp.sales_case('duplicate key-independent initial jobs',$case$do $$declare f jsonb:=sales_regression_fixture('duplicate');begin
 perform sales_prepare_job(f->'principal',f->'input');
 begin perform sales_prepare_job(f->'principal',f->'input'||'{"idempotencyKey":"another"}');raise exception 'TEST FAILED: duplicate initial job accepted';exception when object_not_in_prerequisite_state then null;end;
end $$;$case$);
select pg_temp.sales_case('mailbox-wide history and suppression',$case$do $$declare f jsonb;otherid uuid;flag text;begin
 foreach flag in array array['contacted','suppressed'] loop
 f:=sales_regression_fixture('mailbox-'||flag);otherid:=gen_random_uuid();
 insert into sales_contacts select otherid,project_id,1,data||jsonb_build_object('id',otherid,'branchName','Syd','history',case when flag='contacted' then 'contacted' else 'not_contacted' end,'suppressed',flag='suppressed'),now() from sales_contacts where id=(f->>'contactId')::uuid;
 begin perform sales_prepare_job(f->'principal',f->'input');raise exception 'TEST FAILED: mailbox history/block ignored';exception when object_not_in_prerequisite_state then null;end;
 end loop;
end $$;$case$);
select pg_temp.sales_case('recorded research questions cannot disappear',$case$do $$declare f jsonb:=sales_regression_fixture('research');r jsonb;begin
 perform sales_prepare_job(f->'principal',f->'input');r:=sales_claim_job(f->>'token','{}')->'ref';
 perform sales_commit_research(f->>'token',r||jsonb_build_object('contactId',f->>'contactId','evidence',null,'question','Webbplatsen kunde inte verifieras.'));
 perform sales_reserve_attempt(f->>'token',r||jsonb_build_object('contactId',f->>'contactId','attemptId',gen_random_uuid()));
 begin perform sales_commit_drafts(f->>'token',r||jsonb_build_object('drafts',jsonb_build_array(f->'draft')));raise exception 'TEST FAILED: research question dropped';exception when object_not_in_prerequisite_state then null;end;
 perform sales_test_assert(not exists(select from sales_draft_revisions where project_id=(f->>'projectId')::uuid),'no approvable draft on dropped evidence question');
end $$;$case$);
select pg_temp.sales_case('expired revoked sole worker reconciles through reads while paused',$case$do $$declare f jsonb:=sales_regression_fixture('expiry');r jsonb;j jsonb;begin
 j:=sales_prepare_job(f->'principal',f->'input');r:=sales_claim_job(f->>'token','{}')->'ref';
 perform sales_commit_research(f->>'token',r||jsonb_build_object('contactId',f->>'contactId','evidence',null,'question',null));perform sales_reserve_attempt(f->>'token',r||jsonb_build_object('contactId',f->>'contactId','attemptId',gen_random_uuid()));
 update sales_jobs set lease_until=now()-interval '1 second' where id=(j->>'id')::uuid;perform sales_revoke_worker(f->'principal',jsonb_build_object('projectId',f->>'projectId','workerId',f->>'workerId'));update projects set execution_paused=true where id=(f->>'projectId')::uuid;
 perform sales_test_assert(sales_read_job(f->'principal',jsonb_build_object('projectId',f->>'projectId','jobId',j->>'id'))->>'status'='reconciling','job read reconciles without worker claim');
 perform sales_test_assert(sales_read_workspace(f->'principal',jsonb_build_object('projectId',f->>'projectId'))->'jobs'->0->>'status'='reconciling','workspace reflects reconciliation');
 perform sales_test_assert((select attempts=1 from sales_jobs where id=(j->>'id')::uuid),'reserved attempt preserved');
 begin perform sales_commit_drafts(f->>'token',r||jsonb_build_object('drafts',jsonb_build_array(f->'draft')));raise exception 'TEST FAILED: revoked late completion';exception when no_data_found then null;end;
end $$;$case$);
select pg_temp.sales_case('contact edits fence claim and dispatch reservation',$case$do $$declare f jsonb;r jsonb;stage text;d jsonb;begin
 foreach stage in array array['claim','reserve'] loop
 f:=sales_regression_fixture('change-'||stage);perform sales_prepare_job(f->'principal',f->'input');
 if stage='reserve' then r:=sales_claim_job(f->>'token','{}')->'ref';perform sales_commit_research(f->>'token',r||jsonb_build_object('contactId',f->>'contactId','evidence',null,'question',null));end if;
 select data into d from sales_contacts where id=(f->>'contactId')::uuid;
 perform sales_save_contact(f->'principal',(d-'version')||jsonb_build_object('expectedVersion',1,'suppressed',true));
 begin if stage='claim' then perform sales_claim_job(f->>'token','{}');else perform sales_reserve_attempt(f->>'token',r||jsonb_build_object('contactId',f->>'contactId','attemptId',gen_random_uuid()));end if;raise exception 'TEST FAILED: stale contact received permit';exception when serialization_failure then null;end;
 perform sales_test_assert((select count(*)=0 from sales_model_attempts where project_id=(f->>'projectId')::uuid),'no paid attempt reserved for stale contact');
 end loop;
end $$;$case$);
select pg_temp.sales_case('confirmed homepage requires evidence or an explicit question',$case$do $$declare f jsonb:=sales_regression_fixture('missing-source');r jsonb;d jsonb;begin
 select data into d from sales_contacts where id=(f->>'contactId')::uuid;
 perform sales_save_contact(f->'principal',(d-'version')||jsonb_build_object('expectedVersion',1,'websiteUrl','https://dealer.example/'));
 perform sales_prepare_job(f->'principal',f->'input');r:=sales_claim_job(f->>'token','{}')->'ref';
 begin perform sales_commit_research(f->>'token',r||jsonb_build_object('contactId',f->>'contactId','evidence',null,'question',null));raise exception 'TEST FAILED: missing homepage evidence silently accepted';exception when invalid_parameter_value then null;end;
end $$;$case$);
do $$declare failures text;begin select string_agg(label||': '||error,E'\n') into failures from sales_review_failures;if failures is not null then raise exception E'Review regressions FAILED:\n%',failures;end if;end $$;
select 'PASS six independent review regression cases';
