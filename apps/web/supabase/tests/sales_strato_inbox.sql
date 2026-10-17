begin;
create function pg_temp.inbox_assert(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'TEST FAILED: %',msg;end if;end $$;
create function pg_temp.inbox_refused(statement text,wanted text) returns void language plpgsql as $$ declare caught text;begin begin execute statement;exception when others then get stacked diagnostics caught=returned_sqlstate;end;perform pg_temp.inbox_assert(caught=wanted,'expected refusal '||wanted||', got '||coalesce(caught,'SUCCESS'));end $$;
insert into sales_worker_registrations(id,project_id,owner_id,token_hash,managed_authorized_at,manager_token_hash) values('60000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',repeat('c',64),now(),repeat('d',64));
insert into sales_mailbox_connections(id,project_id,worker_id,owner_id,public_jwk,kid,key_generation,generation,email,status,smtp_authenticated_at,imap_authenticated_at) values('80000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000081','20000000-0000-4000-8000-000000000001','{}',repeat('a',64),1,6,'info@example.se','authenticated',now(),now());
set local role service_role;
do $$
declare p jsonb:='{"userId":"20000000-0000-4000-8000-000000000001","allowedProjectIds":["10000000-0000-4000-8000-000000000001"]}';v jsonb:='{"projectId":"10000000-0000-4000-8000-000000000001","mailboxId":"80000000-0000-4000-8000-000000000081","expectedVersion":0,"folder":"INBOX","since":"2026-10-07T22:00:00Z","selectedContactIds":[]}';c jsonb;s jsonb;b jsonb;receipt jsonb;msg uuid;count_before integer;h jsonb:='{"from":"dealer@example.se","to":"info@example.se","subject":"Reply","messageId":"<same@example.se>","inReplyTo":null,"references":[]}';r jsonb;tx text:='Tack';sha text;
begin
 c:=sales_inbox_configure_inbox(p,v);perform pg_temp.inbox_assert(c->>'state'='disabled' and c->>'version'='1','new config disabled');
 perform pg_temp.inbox_refused(format('select sales_inbox_configure_inbox(%L::jsonb,%L::jsonb)',p,jsonb_set(v,'{folder}','"Sent"')),'22023');
 perform pg_temp.inbox_refused(format('select sales_inbox_configure_inbox(%L::jsonb,%L::jsonb)',jsonb_set(p,'{userId}','"20000000-0000-4000-8000-000000000002"'),v),'P0002');
 perform pg_temp.inbox_assert(sales_inbox_claim_sync(repeat('d',64),'{}')->'sync'='null'::jsonb,'disabled never reads');
 perform pg_temp.inbox_assert(sales_mailbox_read_status(p,jsonb_build_object('projectId',v->>'projectId','mailboxId',v->>'mailboxId'))->>'inboxEnabled'='false','B1 proof alone is not inbox permission');
 c:=sales_inbox_set_inbox_state(p,jsonb_build_object('projectId',v->>'projectId','mailboxId',v->>'mailboxId','expectedVersion',1,'state','enabled'));
 perform pg_temp.inbox_assert(sales_mailbox_read_status(p,jsonb_build_object('projectId',v->>'projectId','mailboxId',v->>'mailboxId'))->>'inboxEnabled'='true','B2 explicit permission projects as enabled');
 s:=sales_inbox_claim_sync(repeat('d',64),'{}')->'sync';perform pg_temp.inbox_assert(s->'ref' is not null,'enabled claim');
 perform pg_temp.inbox_assert(sales_inbox_claim_sync(repeat('d',64),'{}')->'sync'='null'::jsonb,'parallel claim refused');
 r:=jsonb_build_object('uid',12,'internalDate','2026-10-08T10:00:00Z','size',100,'headerSha256',repeat('a',64),'header',h,'text',null,'textState','not_selected','contentSha256',null);
 b:=jsonb_build_object('ref',s->'ref','mode','scan','expectedCursor',s->'cursor','uidValidity','10','throughUid',12,'rangeEnd',20,'records',jsonb_build_array(r));
 perform pg_temp.inbox_assert((select scanned_through_uid=0 from sales_inbox_configs where mailbox_id=(v->>'mailboxId')::uuid),'before commit cursor unchanged');
 perform pg_temp.inbox_refused(format('select sales_inbox_commit_batch(%L,%L::jsonb)',repeat('d',64),jsonb_set(b,'{ref,hostGeneration}','9')),'40001');
 receipt:=sales_inbox_commit_batch(repeat('d',64),b);perform pg_temp.inbox_assert(receipt->>'accepted'='true' and receipt->'cursor'->>'scannedThroughUid'='12','atomic saved data and cursor');
 perform pg_temp.inbox_assert(sales_inbox_commit_batch(repeat('d',64),b)=receipt,'same batch same receipt');
 perform pg_temp.inbox_refused(format('select sales_inbox_commit_batch(%L,%L::jsonb)',repeat('d',64),jsonb_set(b,'{throughUid}','13')),'23505');
 perform pg_temp.inbox_assert((select count(*)=1 from sales_inbox_occurrences where mailbox_id=(v->>'mailboxId')::uuid),'one occurrence');
 select id into msg from sales_inbox_messages where mailbox_id=(v->>'mailboxId')::uuid;
 perform pg_temp.inbox_assert(sales_inbox_read_message(p,jsonb_build_object('projectId',v->>'projectId','messageId',msg))->>'contactState'='unlinked','empty contact registry never links');
 -- Selected old UID is fillable without scanning over it again.
 perform sales_inbox_select_message_text(p,jsonb_build_object('projectId',v->>'projectId','messageId',msg,'expectedVersion',1));
 s:=sales_inbox_claim_sync(repeat('d',64),'{}')->'sync';perform pg_temp.inbox_assert(jsonb_array_length(s->'selectedMessages')=1,'explicit old UID selection queued');
 sha:=encode(extensions.digest(convert_to(E'OmniraInbox/v1\n','UTF8')||decode(repeat('a',64),'hex')||pg_catalog.int8send(octet_length(convert_to(tx,'UTF8'))::bigint)||convert_to(tx,'UTF8'),'sha256'),'hex');
 r:=r||jsonb_build_object('text',tx,'textState','complete','contentSha256',sha);
 b:=jsonb_build_object('ref',s->'ref','mode','selected_text','expectedCursor',s->'cursor','uidValidity','10','throughUid',12,'rangeEnd',12,'records',jsonb_build_array(r));
 perform sales_inbox_commit_batch(repeat('d',64),b);perform pg_temp.inbox_assert((select count(*)=1 from sales_inbox_messages where mailbox_id=(v->>'mailboxId')::uuid),'selected text same message');
 perform pg_temp.inbox_assert(sales_inbox_read_message(p,jsonb_build_object('projectId',v->>'projectId','messageId',msg))->>'text'=tx,'selected content persisted');
 -- Extend the synthetic fixture with an owner-selected known address before epoch reread.
 insert into public.sales_contacts(id,project_id,version,data) values('30000000-0000-4000-8000-000000000081',(v->>'projectId')::uuid,1,'{"confirmed":true,"email":"dealer@example.se"}');
 insert into public.sales_contacts(id,project_id,version,data) values('30000000-0000-4000-8000-000000000082',(v->>'projectId')::uuid,1,'{"confirmed":true,"email":"dealer@example.se","branchName":"Lund"}');
 perform pg_temp.inbox_assert(sales_inbox_read_message(p,jsonb_build_object('projectId',v->>'projectId','messageId',msg))->>'contactState'='ambiguous','shared branch address remains ambiguous');
 perform sales_inbox_link_message(p,jsonb_build_object('projectId',v->>'projectId','messageId',msg,'expectedVersion',3,'contactId','30000000-0000-4000-8000-000000000082'));
 perform pg_temp.inbox_assert(sales_inbox_read_message(p,jsonb_build_object('projectId',v->>'projectId','messageId',msg))->>'contactId'='30000000-0000-4000-8000-000000000082','explicit branch link retained');
 perform pg_temp.inbox_refused(format('select sales_inbox_link_message(%L::jsonb,%L::jsonb)',p,jsonb_build_object('projectId',v->>'projectId','messageId',msg,'expectedVersion',2,'contactId','30000000-0000-4000-8000-000000000081')),'23505');
 update public.sales_inbox_configs set selected_contact_ids=array['30000000-0000-4000-8000-000000000081'::uuid] where mailbox_id=(v->>'mailboxId')::uuid;
 -- New UIDVALIDITY preserves canonical complete message, not a campaign replay.
 s:=sales_inbox_claim_sync(repeat('d',64),'{}')->'sync';
 b:=jsonb_build_object('ref',s->'ref','mode','scan','expectedCursor',s->'cursor','uidValidity','11','throughUid',12,'rangeEnd',20,'records',jsonb_build_array(r));
 perform sales_inbox_commit_batch(repeat('d',64),b);perform pg_temp.inbox_assert((select count(*)=1 from sales_inbox_messages where mailbox_id=(v->>'mailboxId')::uuid),'complete content dedup across epoch');
 perform pg_temp.inbox_assert((select count(*)=2 from sales_inbox_occurrences where mailbox_id=(v->>'mailboxId')::uuid),'both epoch occurrences retained');
 -- Same Message-ID, different content remains distinct and unlinked.
 s:=sales_inbox_claim_sync(repeat('d',64),'{}')->'sync';r:=jsonb_set(r,'{uid}','13');r:=jsonb_set(r,'{headerSha256}',to_jsonb(repeat('b',64)));r:=r||'{"text":null,"textState":"not_selected","contentSha256":null}'::jsonb;
 b:=jsonb_build_object('ref',s->'ref','mode','scan','expectedCursor',s->'cursor','uidValidity','11','throughUid',13,'rangeEnd',20,'records',jsonb_build_array(r));perform sales_inbox_commit_batch(repeat('d',64),b);
 perform pg_temp.inbox_assert((select count(*)=2 from sales_inbox_messages where mailbox_id=(v->>'mailboxId')::uuid),'Message-ID not unique');
 -- A metadata-only copy may later resolve to already known complete content.
 s:=sales_inbox_claim_sync(repeat('d',64),'{}')->'sync';r:=jsonb_set(r,'{uid}','14');r:=jsonb_set(r,'{headerSha256}',to_jsonb(repeat('a',64)));
 b:=jsonb_build_object('ref',s->'ref','mode','scan','expectedCursor',s->'cursor','uidValidity','11','throughUid',14,'rangeEnd',20,'records',jsonb_build_array(r));perform sales_inbox_commit_batch(repeat('d',64),b);
 select message_id into msg from sales_inbox_occurrences where mailbox_id=(v->>'mailboxId')::uuid and uid_validity=11 and uid=14;
 perform sales_inbox_select_message_text(p,jsonb_build_object('projectId',v->>'projectId','messageId',msg,'expectedVersion',1));
 s:=sales_inbox_claim_sync(repeat('d',64),'{}')->'sync';r:=r||jsonb_build_object('text',tx,'textState','complete','contentSha256',sha);
 b:=jsonb_build_object('ref',s->'ref','mode','selected_text','expectedCursor',s->'cursor','uidValidity','11','throughUid',14,'rangeEnd',14,'records',jsonb_build_array(r));perform sales_inbox_commit_batch(repeat('d',64),b);
 perform pg_temp.inbox_assert((select count(distinct message_id)=1 from sales_inbox_occurrences where mailbox_id=(v->>'mailboxId')::uuid and uid in(12,14)),'late text fill reuses canonical content');
 perform pg_temp.inbox_assert(sales_inbox_read_message(p,jsonb_build_object('projectId',v->>'projectId','messageId',msg))->>'text'=tx,'old stable alias still resolves body');
 -- Expired failure reports cannot pause a newer session.
 s:=sales_inbox_claim_sync(repeat('d',64),'{}')->'sync';
 update public.sales_inbox_batches set lease_until=clock_timestamp()-interval '1 second' where id=(s->'ref'->>'batchId')::uuid;
 perform pg_temp.inbox_refused(format('select sales_inbox_report_sync_failure(%L,%L::jsonb)',repeat('d',64),jsonb_build_object('ref',s->'ref','reasonCode','AUTH_FAILED')),'40001');
 perform pg_temp.inbox_assert((select state='enabled' from sales_inbox_configs where mailbox_id=(v->>'mailboxId')::uuid),'late failure preserved live config');
 -- Mailbox replacement fences an already claimed batch.
 s:=sales_inbox_claim_sync(repeat('d',64),'{}')->'sync';update sales_mailbox_connections set generation=7 where id=(v->>'mailboxId')::uuid;
 perform pg_temp.inbox_assert(sales_mailbox_read_status(p,jsonb_build_object('projectId',v->>'projectId','mailboxId',v->>'mailboxId'))->>'inboxEnabled'='false','old B2 generation cannot grant replaced mailbox');
 b:=jsonb_build_object('ref',s->'ref','mode','scan','expectedCursor',s->'cursor','uidValidity','11','throughUid',15,'rangeEnd',20,'records','[]'::jsonb);
 perform pg_temp.inbox_refused(format('select sales_inbox_commit_batch(%L,%L::jsonb)',repeat('d',64),b),'40001');
 perform pg_temp.inbox_assert((select scanned_through_uid=14 from sales_inbox_configs where mailbox_id=(v->>'mailboxId')::uuid),'fenced cursor preserved');
 update sales_mailbox_connections set generation=6 where id=(v->>'mailboxId')::uuid;
 update sales_worker_registrations set revoked_at=clock_timestamp() where id='60000000-0000-4000-8000-000000000081';
 perform pg_temp.inbox_assert(sales_mailbox_read_status(p,jsonb_build_object('projectId',v->>'projectId','mailboxId',v->>'mailboxId'))->>'inboxEnabled'='false','revoked host has no effective inbox permission');
 perform pg_temp.inbox_assert(not has_function_privilege('authenticated','public.sales_inbox_commit_batch(text,jsonb)','execute'),'clients cannot commit');
end $$;
reset role;
rollback;
select 'PASS: inbox owner scope, durable checkpoint, replay, selected text, epoch dedup and replacement fencing';
