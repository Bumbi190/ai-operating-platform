begin;
create function pg_temp.reply_assert(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'TEST FAILED: %',msg;end if;end $$;
create function pg_temp.reply_refused(statement text,wanted text) returns void language plpgsql as $$ declare caught text;begin begin execute statement;exception when others then get stacked diagnostics caught=returned_sqlstate;end;perform pg_temp.reply_assert(caught=wanted,'expected '||wanted||', got '||coalesce(caught,'SUCCESS'));end $$;
-- A synthetic selected reply, two separate branches with one address. Never production data.
insert into sales_worker_registrations(id,project_id,owner_id,token_hash,managed_authorized_at,manager_token_hash) values('60000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',repeat('8',64),now(),repeat('9',64));
insert into sales_mailbox_connections(id,project_id,worker_id,owner_id,public_jwk,kid,key_generation,generation,email,status) values('80000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000091','20000000-0000-4000-8000-000000000001','{}',repeat('a',64),1,6,'info@example.se','authenticated');
insert into sales_inbox_configs(mailbox_id,project_id,worker_id,owner_id,version,mailbox_generation,folder,since_at,state,uid_validity) values('80000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000091','20000000-0000-4000-8000-000000000001',2,6,'INBOX','2026-10-07T22:00Z','enabled',10);
insert into sales_contacts(id,project_id,version,data) values('30000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000001',1,'{"id":"30000000-0000-4000-8000-000000000091","version":1,"companyName":"Test Dealer","branchName":"Hässleholm","email":"dealer@example.se","confirmed":true,"excluded":false,"suppressed":false,"history":"contacted","historySource":"synthetic sent record","pilotMonths":12}'),('30000000-0000-4000-8000-000000000092','10000000-0000-4000-8000-000000000001',1,'{"id":"30000000-0000-4000-8000-000000000092","version":1,"companyName":"Test Dealer","branchName":"Lund","email":"dealer@example.se","confirmed":true,"excluded":false,"suppressed":false,"history":"contacted","historySource":"synthetic sent record","pilotMonths":12}');
insert into sales_offer_revisions(id,project_id,data) values('40000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000001','{"id":"40000000-0000-4000-8000-000000000091","senderEmail":"info@example.se","freeMonths":12,"confirmed":true,"offerText":"12 månader gratis","productFacts":["Stängd B2B-plattform"]}');
insert into sales_inbox_messages(id,project_id,mailbox_id,owner_id,header,header_sha256,content_sha256,body_text,text_state,text_selected,contact_id,contact_version,internal_date) values('90000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000091','20000000-0000-4000-8000-000000000001','{"from":"dealer@example.se","to":"info@example.se","subject":"Fråga om pilot","messageId":"<test@example.se>","inReplyTo":null,"references":[]}',repeat('a',64),repeat('b',64),'Vad kostar det efter pilotperioden?','complete',true,'30000000-0000-4000-8000-000000000092',1,now());
insert into sales_inbox_occurrences values('10000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000091','INBOX',10,1,'90000000-0000-4000-8000-000000000091',false);
set local role service_role;
do $$
declare p jsonb:='{"userId":"20000000-0000-4000-8000-000000000001","allowedProjectIds":["10000000-0000-4000-8000-000000000001"]}';v jsonb:='{"projectId":"10000000-0000-4000-8000-000000000001","conversationId":"50000000-0000-4000-8000-000000000001","messageId":"90000000-0000-4000-8000-000000000091","messageVersion":1,"contactId":"30000000-0000-4000-8000-000000000092","contactVersion":1,"offerRevisionId":"40000000-0000-4000-8000-000000000091","idempotencyKey":"a0000000-0000-4000-8000-000000000091"}';j jsonb;r jsonb;s jsonb;d jsonb;ack jsonb;x jsonb;rev jsonb;n integer;old_count integer;a jsonb;
begin
 select count(*) into old_count from sales_jobs;
 perform pg_temp.reply_refused(format('select sales_reply_prepare(%L::jsonb,%L::jsonb)',jsonb_set(p,'{userId}','"20000000-0000-4000-8000-000000000002"'),v),'P0002');
 perform pg_temp.reply_refused(format('select sales_reply_prepare(%L::jsonb,%L::jsonb)',p,jsonb_set(v,'{contactId}','"30000000-0000-4000-8000-000000000091"')),'55000');
 update sales_inbox_messages set text_selected=false where id=(v->>'messageId')::uuid;
 perform pg_temp.reply_refused(format('select sales_reply_prepare(%L::jsonb,%L::jsonb)',p,v),'55000');
 update sales_inbox_messages set text_selected=true where id=(v->>'messageId')::uuid;
 update sales_worker_registrations set revoked_at=now() where id='60000000-0000-4000-8000-000000000091';
 perform pg_temp.reply_refused(format('select sales_reply_prepare(%L::jsonb,%L::jsonb)',p,v),'55000');
 update sales_worker_registrations set revoked_at=null where id='60000000-0000-4000-8000-000000000091';
 j:=sales_reply_prepare(p,v);perform pg_temp.reply_assert(j->>'status'='queued','reply_accepts_confirmed_contacted_branch');
 perform pg_temp.reply_assert(sales_reply_prepare(p,v)->>'id'=j->>'id','same_key_same_snapshot_one_job');
 perform pg_temp.reply_refused(format('select sales_reply_prepare(%L::jsonb,%L::jsonb)',p,jsonb_set(v,'{messageVersion}','2')),'23505');
 perform pg_temp.reply_assert((select count(*)=old_count from sales_jobs),'reply never creates first-contact job');
 s:=sales_reply_claim(repeat('8',64),'{}');r:=s->'ref';perform pg_temp.reply_assert(r->>'jobId'=j->>'id' and s->'snapshot'->'contact'->>'branchName'='Lund','shared_address_keeps_exact_branch');
 perform sales_reply_heartbeat(repeat('8',64),r);perform pg_temp.reply_assert((select last_seen_at>clock_timestamp()-interval '10 seconds' from sales_worker_registrations where id='60000000-0000-4000-8000-000000000091'),'reply heartbeat keeps managed host online during model');
 perform pg_temp.reply_assert(sales_reply_claim(repeat('8',64),'{}')->'ref'='null'::jsonb,'one active claim');
 for n in 1..10 loop a:=sales_reply_reserve_attempt(repeat('8',64),r||jsonb_build_object('attemptId',gen_random_uuid()));end loop;
 perform pg_temp.reply_refused(format('select sales_reply_reserve_attempt(%L,%L::jsonb)',repeat('8',64),r||jsonb_build_object('attemptId',gen_random_uuid())),'55000');
 perform pg_temp.reply_assert((select attempts=10 from sales_reply_jobs where id=(j->>'id')::uuid),'reply_attempt_limit_is_atomic_ten');
 d:=jsonb_build_object('subject','Svar om piloten','body','Tack för din fråga. Vi behöver bekräfta priset.','evidenceIds',jsonb_build_array(v->>'messageId'),'questions',jsonb_build_array('Bekräfta pris efter pilot.'));
 update sales_contacts set version=2 where id=(v->>'contactId')::uuid;
 perform pg_temp.reply_refused(format('select sales_reply_complete(%L,%L::jsonb)',repeat('8',64),r||jsonb_build_object('attemptId',a->>'attemptId','draft',d)),'40001');
 update sales_contacts set version=1 where id=(v->>'contactId')::uuid;
 update sales_inbox_configs set version=3 where mailbox_id='80000000-0000-4000-8000-000000000091';
 perform pg_temp.reply_refused(format('select sales_reply_complete(%L,%L::jsonb)',repeat('8',64),r||jsonb_build_object('attemptId',a->>'attemptId','draft',d)),'40001');
 update sales_inbox_configs set version=2 where mailbox_id='80000000-0000-4000-8000-000000000091';
 ack:=sales_reply_complete(repeat('8',64),r||jsonb_build_object('attemptId',a->>'attemptId','draft',d));perform pg_temp.reply_assert(ack->>'status'='needs_input','questions prevent editorial approval');
 perform pg_temp.reply_assert(sales_reply_complete(repeat('8',64),r||jsonb_build_object('attemptId',a->>'attemptId','draft',d))=ack,'lost accepted completion replays same receipt');
 perform pg_temp.reply_refused(format('select sales_reply_complete(%L,%L::jsonb)',repeat('8',64),r||jsonb_build_object('attemptId',a->>'attemptId','draft',jsonb_set(d,'{body}','"Other"'))),'23505');
 x:=sales_reply_read_drafts(p,jsonb_build_object('projectId',v->>'projectId'));select value into rev from jsonb_array_elements(x->'drafts') where value->>'jobId'=j->>'id';
 perform pg_temp.reply_refused(format('select sales_reply_review_draft(%L::jsonb,%L::jsonb)',p,jsonb_build_object('projectId',v->>'projectId','revisionId',rev->>'id','expectedHash',rev->>'sha256','decision','approved')),'55000');
 x:=sales_reply_edit_draft(p,jsonb_build_object('projectId',v->>'projectId','revisionId',rev->>'id','expectedHash',rev->>'sha256','subject','Svar om pilot','body','Vi återkommer med ett bekräftat pris.','questions','[]'::jsonb));
 perform pg_temp.reply_refused(format('select sales_reply_review_draft(%L::jsonb,%L::jsonb)',p,jsonb_build_object('projectId',v->>'projectId','revisionId',rev->>'id','expectedHash',rev->>'sha256','decision','approved')),'23505');
 perform pg_temp.reply_assert(x->>'id'<>rev->>'id' and x->>'sha256'<>rev->>'sha256','edit creates exact new immutable revision');
 perform pg_temp.reply_assert(sales_reply_review_draft(p,jsonb_build_object('projectId',v->>'projectId','revisionId',x->>'id','expectedHash',x->>'sha256','decision','approved'))->>'status'='approved','canonical review approves exact current revision');
 rev:=x;x:=sales_reply_edit_draft(p,jsonb_build_object('projectId',v->>'projectId','revisionId',rev->>'id','expectedHash',rev->>'sha256','subject','Reviderat svar','body','Vi återkommer med ett bekräftat pris.','questions','[]'::jsonb));
 perform pg_temp.reply_assert((select status='returned' from approvals where id=(rev->>'approvalId')::uuid),'editing invalidates old editorial approval');
 -- Conservative newer-mail signal: same mailbox + sender, never Message-ID alone.
 insert into sales_inbox_messages(project_id,mailbox_id,owner_id,header,text_state,text_selected) select project_id,mailbox_id,owner_id,header||'{"messageId":"<different@example.se>"}','not_selected',false from sales_inbox_messages where id=(v->>'messageId')::uuid;
 perform pg_temp.reply_assert(sales_reply_read_job(p,jsonb_build_object('projectId',v->>'projectId','jobId',j->>'id'))->>'newerIncoming'='true','newer_mail_marks_review_stale');
 perform pg_temp.reply_refused(format('select sales_reply_review_draft(%L::jsonb,%L::jsonb)',p,jsonb_build_object('projectId',v->>'projectId','revisionId',x->>'id','expectedHash',x->>'sha256','decision','approved')),'55000');
 perform pg_temp.reply_refused(format('select resolve_approval(%L::uuid,%L::uuid,%L::uuid,%L,null)',x->>'approvalId',x->>'runId',v->>'projectId','approved'),'55000');
 perform pg_temp.reply_assert(sales_reply_cancel_job(p,jsonb_build_object('projectId',v->>'projectId','jobId',j->>'id'))->>'status'='cancelled','explicit cancel never requeues model');
end $$;
reset role;
do $$ declare t text;f record;begin
 foreach t in array array['sales_reply_jobs','sales_reply_attempts','sales_reply_draft_revisions'] loop
 perform pg_temp.reply_assert((select relrowsecurity from pg_class where oid=('public.'||t)::regclass),'RLS enabled');
 perform pg_temp.reply_assert(not has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,DELETE'),'no client table access');end loop;
 for f in select oid,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname like 'sales_reply_%' loop perform pg_temp.reply_assert(not f.prosecdef and not has_function_privilege('anon',f.oid,'EXECUTE') and not has_function_privilege('authenticated',f.oid,'EXECUTE'),'service-only invoker RPC');end loop;
end $$;
rollback;
select 'PASS: reply source/branch/idempotency/attempt/revision/newer-mail/ACL contracts';
