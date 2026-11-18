-- Disposable fixture only. No customer data or provider calls.
begin;
create function pg_temp.editorial_fixture(label text, variant text default '') returns jsonb language plpgsql as $$
declare f jsonb:=sales_regression_fixture('editorial-'||label);d jsonb;sources jsonb;at timestamptz:=clock_timestamp()-interval '1 second';begin
 perform sales_timing_save_rules(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'expectedPreviousId',null,'minWaitSeconds',1209600,'maxReminders',1,'maxSourceAgeSeconds',900,'confirmed',true));
 if variant='missing_history' then return f;end if;
 if variant='stale' then at:=at-interval '901 seconds';end if;
 select jsonb_agg(jsonb_build_object('sourceKey',ch,'channel',ch,'identityRef','synthetic','scopeRef','all currently available records; older/external coverage unknown','since',to_char(at-interval '60 days','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'through',to_char(at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'observedAt',to_char(clock_timestamp(),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'state','gap','reference','explicit bounded audit')) into sources from unnest(array['strato_sent','strato_inbox','resend']) ch;
 if variant='failed' then sources:=jsonb_set(sources,'{0,state}','"failed"');end if;
 if variant='missing_channel' then sources:=sources-2;end if;
 d:=jsonb_build_object('schemaVersion',1,'contactVersions',jsonb_build_array(jsonb_build_object('id',f->>'contactId','version',1)),'history','unknown','olderHistoryAttestation',null,'sources',sources,'events','[]'::jsonb,'correctionOf',null,'reviewNote','Bounded sources checked; no historical absence attested; text review only.');
 if variant='observed' then d:=jsonb_set(d,'{events}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'sourceRefs',jsonb_build_array('strato_sent'),'providerRefs',jsonb_build_array(jsonb_build_object('sourceKey','strato_sent','id','old-mail')),'occurredAt',to_char(at-interval '1 day','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'direction','outbound','outcome','accepted','kind','initial','invitationId',gen_random_uuid(),'inReplyToEventId',null,'reviewedDuplicateOf',null)));end if;
 perform sales_timing_save_history(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'expectedPreviousId',null,'contactId',f->>'contactId','expectedContactVersion',1,'data',d,'confirmed',true));
 return f;
end$$;

do $$declare f jsonb:=pg_temp.editorial_fixture('positive');j jsonb;x jsonb;begin
 x:=sales_timing_evaluate((f->>'projectId')::uuid,(f->>'contactId')::uuid,clock_timestamp());
 perform sales_test_assert(x->>'initialPreparationAllowed'='false','normal permission remains false');
 perform sales_test_assert(sales_timing_read(f->'principal',jsonb_build_object('projectId',f->>'projectId'))->'contacts'->0->>'editorialPreparationAllowed'='true','UI capability matches successful server predicate');
 begin perform sales_prepare_job(f->'principal',f->'input');raise exception 'TEST FAILED: ordinary preparation accepted partial history';exception when object_not_in_prerequisite_state then null;end;
 j:=sales_prepare_editorial_job(f->'principal',(f->'input')||'{"preparationMode":"editorial_only"}');
 perform sales_test_assert(j->>'preparationMode'='editorial_only','receipt exposes permanent editorial mode');
 perform sales_test_assert(sales_prepare_editorial_job(f->'principal',(f->'input')||'{"preparationMode":"editorial_only"}')=j,'exact replay returns same job');
 perform sales_test_assert((select count(*)=1 from sales_jobs where project_id=(f->>'projectId')::uuid),'one exact job');
 perform sales_test_assert((select snapshot->>'preparationMode'='editorial_only' and snapshot->'sendingAllowed'='false' from sales_jobs where id=(j->>'id')::uuid),'server owns non-sendable marker');
 perform sales_test_assert((select count(*)=0 from sales_send_jobs where project_id=(f->>'projectId')::uuid),'preparation never sends');
end$$;

do $$declare f jsonb;variant text;begin
 foreach variant in array array['missing_history','stale','failed','missing_channel','observed','suppressed','excluded','contacted','paused'] loop
  f:=pg_temp.editorial_fixture(variant,variant);
  if variant in('suppressed','excluded') then update sales_contacts set data=jsonb_set(data,array[variant],'true') where id=(f->>'contactId')::uuid;end if;
  if variant='contacted' then update sales_contacts set data=jsonb_set(data,'{history}','"contacted"') where id=(f->>'contactId')::uuid;end if;
  if variant='paused' then update projects set execution_paused=true where id=(f->>'projectId')::uuid;end if;
  perform sales_test_assert(not sales_editorial_contact_allowed((f->>'projectId')::uuid,(f->>'contactId')::uuid,clock_timestamp()),'negative UI capability: '||variant);
  begin perform sales_prepare_editorial_job(f->'principal',(f->'input')||'{"preparationMode":"editorial_only"}');raise exception 'TEST FAILED: editorial accepted %',variant;exception when object_not_in_prerequisite_state then null;end;
  perform sales_test_assert((select count(*)=0 from sales_jobs where project_id=(f->>'projectId')::uuid),'negative case does not queue');
 end loop;
end$$;

do $$declare f jsonb:=pg_temp.editorial_fixture('owner');begin
 begin perform sales_prepare_editorial_job(jsonb_set(f->'principal','{userId}','"20000000-0000-4000-8000-000000000002"'),(f->'input')||'{"preparationMode":"editorial_only"}');raise exception 'TEST FAILED: foreign owner';exception when no_data_found then null;end;
 begin perform sales_prepare_editorial_job(f->'principal',f->'input');raise exception 'TEST FAILED: implicit editorial mode';exception when invalid_parameter_value then null;end;
 perform sales_test_assert(not has_function_privilege('anon','public.sales_prepare_editorial_job(jsonb,jsonb)','EXECUTE'),'no anonymous editorial admission');
 perform sales_test_assert(not has_function_privilege('authenticated','public.sales_editorial_contact_review(uuid,uuid,timestamptz)','EXECUTE'),'no browser helper execution');
end$$;

do $$declare f jsonb:=pg_temp.editorial_fixture('changed-history');j jsonb;h sales_contact_history_revisions;begin
 j:=sales_prepare_editorial_job(f->'principal',(f->'input')||'{"preparationMode":"editorial_only"}');
 select * into h from sales_contact_history_revisions where project_id=(f->>'projectId')::uuid order by version desc limit 1;
 perform sales_timing_save_history(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'expectedPreviousId',h.id,'contactId',f->>'contactId','expectedContactVersion',1,'data',h.data,'confirmed',true));
 begin perform sales_claim_job(f->>'token','{}');raise exception 'TEST FAILED: changed review claimed';exception when serialization_failure then null;end;
 perform sales_test_assert((select count(*)=0 from sales_model_attempts where project_id=(f->>'projectId')::uuid),'no attempt with changed history');
end$$;

do $$declare f jsonb:=pg_temp.editorial_fixture('lifecycle');j jsonb;ref jsonb;d sales_draft_revisions;begin
 j:=sales_prepare_editorial_job(f->'principal',(f->'input')||'{"preparationMode":"editorial_only"}');
 ref:=sales_claim_job(f->>'token','{}')->'ref';
 perform sales_commit_research(f->>'token',ref||jsonb_build_object('contactId',f->>'contactId','evidence',null,'question',null));
 perform sales_reserve_attempt(f->>'token',ref||jsonb_build_object('contactId',f->>'contactId','attemptId',gen_random_uuid()));
 perform sales_commit_drafts(f->>'token',ref||jsonb_build_object('drafts',jsonb_build_array(f->'draft')));
 select * into d from sales_draft_revisions where job_id=(j->>'id')::uuid and is_current;
 perform sales_test_assert(d.id is not null,'worker lifecycle saves real bound revision');
 begin perform sales_send_authority((f->>'projectId')::uuid,(f->'principal'->>'userId')::uuid,d.id,d.sha256,1);raise exception 'TEST FAILED: initial draft acquired send authority';exception when no_data_found then null;end;
 perform sales_test_assert((select count(*)=0 from sales_send_jobs where project_id=(f->>'projectId')::uuid),'review lifecycle has no send job');
end$$;

-- Review regression: a persisted transport result predates a new empty/gap audit.
do $$declare f jsonb:=pg_temp.editorial_fixture('persisted-accepted');pid uuid:=(f->>'projectId')::uuid;uid uuid:=(f->'principal'->>'userId')::uuid;wid uuid;mb uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();rj uuid:=gen_random_uuid();rd uuid:=gen_random_uuid();pol uuid:=gen_random_uuid();h sales_contact_history_revisions;begin
 select id into wid from sales_worker_registrations where project_id=pid;
 insert into sales_mailbox_connections(id,project_id,worker_id,owner_id,public_jwk,kid,key_generation,generation,email,status) values(mb,pid,wid,uid,'{}',repeat('a',64),1,1,'sender@example.se','authenticated');
 insert into sales_inbox_configs(mailbox_id,project_id,worker_id,owner_id,version,mailbox_generation,folder,since_at,state,uid_validity) values(mb,pid,wid,uid,1,1,'INBOX',clock_timestamp()-interval '60 days','enabled',1);
 insert into sales_inbox_messages(id,project_id,mailbox_id,owner_id,header,text_state,text_selected) values(mid,pid,mb,uid,'{}','not_selected',false);
 insert into sales_reply_jobs(id,project_id,owner_id,message_id,request_key,request,snapshot) values(rj,pid,uid,mid,gen_random_uuid(),'{}','{}');
 insert into sales_reply_draft_revisions(id,project_id,job_id,data,sha256) values(rd,pid,rj,'{}',repeat('b',64));
 insert into sales_send_policies(id,project_id,owner_id,mailbox_id,worker_id,recipient,sender_email,sender_name,version,expires_at) select pol,pid,uid,mb,wid,data->>'email','sender@example.se','Synthetic',1,clock_timestamp()+interval '1 hour' from sales_contacts where id=(f->>'contactId')::uuid;
 insert into sales_send_jobs(project_id,owner_id,revision_id,revision_hash,request_key,request,policy_id,policy_version,sealed_json,snapshot_sha256,status,accepted_at) select pid,uid,rd,repeat('b',64),gen_random_uuid(),'{}',pol,1,jsonb_build_object('toEmail',data->>'email')::text,repeat('c',64),'smtp_accepted',clock_timestamp()-interval '1 day' from sales_contacts where id=(f->>'contactId')::uuid;
 select * into h from sales_contact_history_revisions where project_id=pid order by version desc limit 1;
 perform sales_timing_save_history(f->'principal',jsonb_build_object('projectId',pid,'idempotencyKey',gen_random_uuid(),'expectedPreviousId',h.id,'contactId',f->>'contactId','expectedContactVersion',1,'data',h.data,'confirmed',true));
 begin perform sales_prepare_editorial_job(f->'principal',(f->'input')||'{"preparationMode":"editorial_only"}');raise exception 'TEST FAILED: persisted accepted send masked by empty audit';exception when object_not_in_prerequisite_state then null;end;
end$$;

-- Review regression: draft mode comes from its bound job, outside the summary window.
do $$declare f jsonb:=pg_temp.editorial_fixture('old-draft');j jsonb;ref jsonb;w jsonb;begin
 j:=sales_prepare_editorial_job(f->'principal',(f->'input')||'{"preparationMode":"editorial_only"}');
 ref:=sales_claim_job(f->>'token','{}')->'ref';
 perform sales_commit_research(f->>'token',ref||jsonb_build_object('contactId',f->>'contactId','evidence',null,'question',null));
 perform sales_reserve_attempt(f->>'token',ref||jsonb_build_object('contactId',f->>'contactId','attemptId',gen_random_uuid()));
 perform sales_commit_drafts(f->>'token',ref||jsonb_build_object('drafts',jsonb_build_array(f->'draft')));
 insert into sales_jobs(project_id,owner_id,request_key,request,snapshot,created_at) select (f->>'projectId')::uuid,(f->'principal'->>'userId')::uuid,'newer-'||i,'{}','{}',clock_timestamp()+i*interval '1 second' from generate_series(1,20) i;
 w:=sales_read_workspace(f->'principal',jsonb_build_object('projectId',f->>'projectId'));
 perform sales_test_assert(not exists(select from jsonb_array_elements(w->'jobs') x where x->>'id'=j->>'id'),'parent job outside summary');
 perform sales_test_assert(w->'drafts'->0->>'preparationMode'='editorial_only','old draft carries bound editorial marker');
 begin update sales_jobs set snapshot=snapshot-'preparationMode' where id=(j->>'id')::uuid;raise exception 'TEST FAILED: editorial snapshot mutable';exception when check_violation then null;end;
end$$;

select 'PASS editorial-only SQL contracts: partial audit, negative inputs, owner, replay, history fence, worker lifecycle and no send authority';
rollback;
