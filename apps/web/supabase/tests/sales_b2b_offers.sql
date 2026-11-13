begin;
create table if not exists public.memories(id uuid primary key default gen_random_uuid(),project_id uuid not null,key text not null,value text not null,source text,updated_at timestamptz default now());
grant select on public.memories to service_role;
create function pg_temp.b2b_assert(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'TEST FAILED B2B: %',msg;end if;end $$;
create function pg_temp.b2b_refused(statement text,wanted text) returns void language plpgsql as $$ declare caught text;begin begin execute statement;exception when others then get stacked diagnostics caught=returned_sqlstate;end;perform pg_temp.b2b_assert(caught=wanted,'expected '||wanted||', got '||coalesce(caught,'SUCCESS'));end $$;
do $$
declare f jsonb;other jsonb;p jsonb;c jsonb;o jsonb;input jsonb;j jsonb;ref jsonb;draft jsonb;variant jsonb;months integer;oid uuid;mid uuid:=gen_random_uuid();mbid uuid:=gen_random_uuid();uid uuid:='20000000-0000-4000-8000-000000000001';rj jsonb;claim jsonb;permit jsonb;revision jsonb;before_sends integer;template jsonb;copy_input jsonb;copy_revision jsonb;
begin
 foreach months in array array[2,6,12] loop
  f:=sales_regression_fixture('legacy-'||months);p:=f->'principal';select data into c from sales_contacts where id=(f->>'contactId')::uuid;
  perform sales_save_contact(p,(c-'version')||jsonb_build_object('pilotMonths',months,'expectedVersion',1));
  oid:=gen_random_uuid();o:=jsonb_build_object('projectId',f->>'projectId','id',oid,'senderEmail','legacy@example.invalid','freeMonths',months,'offerText',months||' månader gratis','productFacts',jsonb_build_array('Synthetic confirmed pilot fact'),'confirmed',true);
  perform sales_save_offer(p,o);input:=f->'input'||jsonb_build_object('offerRevisionId',oid);
  perform sales_fixture_review_timing((f->>'projectId')::uuid);
  perform pg_temp.b2b_assert(sales_prepare_job(p,input)->>'status'='queued','legacy pilot 2/6/12 remains accepted');
 end loop;
 f:=sales_regression_fixture('service-contract');other:=sales_regression_fixture('other-project');p:=f->'principal';
 select data into c from sales_contacts where id=(f->>'contactId')::uuid;
 perform sales_save_contact(p,(c-'version')||jsonb_build_object('offerKind','general_service','pilotMonths',null,'expectedVersion',1));
 oid:=gen_random_uuid();o:=jsonb_build_object('projectId',f->>'projectId','id',oid,'senderEmail','studio@example.invalid','offerKind','general_service','freeMonths',null,'offerText','Ett separat förslag efter bekräftat projektunderlag.','productFacts',jsonb_build_array('Synthetic owner-confirmed service fact; pricing remains undecided.'),'confirmed',true);
 foreach variant in array array['{"offerKind":"general_service","freeMonths":12}'::jsonb,'{"offerKind":"pilot","freeMonths":null}'::jsonb,'{"offerKind":"future","freeMonths":12}'::jsonb,'{"productFacts":[]}'::jsonb,'{"senderEmail":""}'::jsonb,'{"confirmed":false}'::jsonb] loop
  perform pg_temp.b2b_refused(format('select sales_save_offer(%L::jsonb,%L::jsonb)',p,o||variant||jsonb_build_object('id',gen_random_uuid())),'22023');
 end loop;
 perform pg_temp.b2b_refused(format('select sales_save_offer(%L::jsonb,%L::jsonb)',p,(o-'offerKind')||jsonb_build_object('id',gen_random_uuid())),'22023');
 perform sales_save_offer(p,o);
 -- Recipient-free service copy retains its explicit contract through immutable saved versions.
 template:=jsonb_build_object('id','service-initial-v1','kind','initial','offerRevisionId',oid,'offerKind','general_service','pilotMonths',null,'senderName','Synthetic Studio','senderEmail','studio@example.invalid','subject','Projektunderlag','body','Beskriv gärna ert projekt inför ett separat förslag.','usage','Mottagarfritt textutkast. Ingen sändning.');
 insert into public.memories(project_id,key,value) values((f->>'projectId')::uuid,'sales.email_copy_proposals',jsonb_build_object('templates',jsonb_build_array(template,((template-'offerKind')||'{"id":"service-missing-kind"}'::jsonb)))::text);
 copy_input:=jsonb_build_object('projectId',f->>'projectId','templateKey','service-initial-v1','expectedPreviousId',null,'idempotencyKey',gen_random_uuid(),'subject',template->>'subject','body',template->>'body');
 perform pg_temp.b2b_refused(format('select sales_email_copy_save(%L::jsonb,%L::jsonb)',p,copy_input||jsonb_build_object('templateKey','service-missing-kind','idempotencyKey',gen_random_uuid())),'22023');
 copy_revision:=sales_email_copy_save(p,copy_input);
 perform pg_temp.b2b_assert(copy_revision->>'offerKind'='general_service' and copy_revision->'pilotMonths'='null'::jsonb and copy_revision->'recipient'='null'::jsonb and copy_revision->>'status'='draft','service template has no pilot or recipient authority');
 copy_revision:=sales_email_copy_save(p,copy_input||jsonb_build_object('expectedPreviousId',copy_revision->>'id','idempotencyKey',gen_random_uuid(),'body','Ett nytt textutkast om ert projektunderlag.'));
 perform pg_temp.b2b_assert(copy_revision->>'version'='2' and copy_revision->>'offerKind'='general_service' and copy_revision->'pilotMonths'='null'::jsonb,'service template edits retain immutable offer metadata');
 input:=f->'input'||jsonb_build_object('offerRevisionId',oid);
 perform sales_fixture_review_timing((f->>'projectId')::uuid);
 perform pg_temp.b2b_refused(format('select sales_prepare_job(%L::jsonb,%L::jsonb)',p,f->'input'),'55000');
 j:=sales_prepare_job(p,input);claim:=sales_claim_job(f->>'token','{}');ref:=claim->'ref';
 perform pg_temp.b2b_assert(claim->'snapshot'->'offer'->>'offerKind'='general_service' and claim->'snapshot'->'offer'->'freeMonths'='null'::jsonb,'service snapshot has explicit kind and no free months');
 perform pg_temp.b2b_assert(claim->'snapshot'->'contacts'->0->'pilotMonths'='null'::jsonb,'service contact has no pilot months');
 perform sales_commit_research(f->>'token',ref||jsonb_build_object('contactId',f->>'contactId','evidence',null,'question',null));
 perform sales_reserve_attempt(f->>'token',ref||jsonb_build_object('contactId',f->>'contactId','attemptId',gen_random_uuid()));
 draft:=f->'draft'||jsonb_build_object('contactVersion',2,'offerRevisionId',oid,'senderEmail','studio@example.invalid','subject','Projektförslag','body','Vill ni beskriva ert behov som underlag för ett separat förslag?');
 perform pg_temp.b2b_assert(sales_commit_drafts(f->>'token',ref||jsonb_build_object('drafts',jsonb_build_array(draft)))->>'status'='awaiting_review','initial service draft uses ordinary service terms');
 perform pg_temp.b2b_refused(format('select sales_read_job(%L::jsonb,%L::jsonb)',other->'principal',jsonb_build_object('projectId',other->>'projectId','jobId',j->>'id')),'P0002');
 perform pg_temp.b2b_refused(format('select sales_reserve_attempt(%L,%L::jsonb)',other->>'token',ref||jsonb_build_object('contactId',f->>'contactId','attemptId',gen_random_uuid())),'40001');
 -- Persisted selected commercial reply: actual claim, complete and editorial-review RPCs.
 perform sales_host_authorize(p,jsonb_build_object('projectId',f->>'projectId','workerId',f->>'workerId'));
 insert into sales_mailbox_connections(id,project_id,worker_id,owner_id,public_jwk,kid,key_generation,generation,email,status) values(mbid,(f->>'projectId')::uuid,(f->>'workerId')::uuid,uid,'{}',repeat('a',64),1,6,'studio@example.invalid','authenticated');
 insert into sales_inbox_configs(mailbox_id,project_id,worker_id,owner_id,version,mailbox_generation,folder,since_at,state,uid_validity) values(mbid,(f->>'projectId')::uuid,(f->>'workerId')::uuid,uid,2,6,'INBOX','2026-10-07T22:00Z','enabled',10);
 insert into sales_inbox_messages(id,project_id,mailbox_id,owner_id,header,header_sha256,content_sha256,body_text,text_state,text_selected,contact_id,contact_version,internal_date) values(mid,(f->>'projectId')::uuid,mbid,uid,jsonb_build_object('from','service-contract@example.se','to','studio@example.invalid','subject','Fråga om projekt','messageId','<service@example.invalid>','inReplyTo',null,'references','[]'::jsonb),repeat('a',64),repeat('b',64),'Vilket underlag behöver ni för ett förslag?','complete',true,(f->>'contactId')::uuid,2,now());
 insert into sales_inbox_occurrences values((f->>'projectId')::uuid,mbid,'INBOX',10,1,mid,false);
 input:=jsonb_build_object('projectId',f->>'projectId','conversationId',f->'input'->>'conversationId','messageId',mid,'messageVersion',1,'contactId',f->>'contactId','contactVersion',2,'offerRevisionId',oid,'idempotencyKey',gen_random_uuid());
 rj:=sales_reply_prepare(p,input);claim:=sales_reply_claim(f->>'token','{}');ref:=claim->'ref';
 perform pg_temp.b2b_assert(claim->'snapshot'->'offer'->>'offerKind'='general_service' and claim->'snapshot'->'offer'->'freeMonths'='null'::jsonb,'commercial reply retains service terms');
 permit:=sales_reply_reserve_attempt(f->>'token',ref||jsonb_build_object('attemptId',gen_random_uuid()));
 draft:=jsonb_build_object('subject','Underlag för projektförslag','body','Beskriv gärna era behov. Ett pris behöver bekräftas separat.','evidenceIds',jsonb_build_array(mid),'questions','[]'::jsonb);
 perform sales_reply_complete(f->>'token',ref||jsonb_build_object('attemptId',permit->>'attemptId','draft',draft));
 select value into revision from jsonb_array_elements(sales_reply_read_drafts(p,jsonb_build_object('projectId',f->>'projectId'))->'drafts') value where value->>'jobId'=rj->>'id';
 perform pg_temp.b2b_refused(format('select sales_reply_review_draft(%L::jsonb,%L::jsonb)',other->'principal',jsonb_build_object('projectId',other->>'projectId','revisionId',revision->>'id','expectedHash',revision->>'sha256','decision','approved')),'P0002');
 select count(*) into before_sends from sales_send_jobs;
 perform pg_temp.b2b_assert(sales_reply_review_draft(p,jsonb_build_object('projectId',f->>'projectId','revisionId',revision->>'id','expectedHash',revision->>'sha256','decision','approved'))->>'status'='approved','exact service revision can be editorially approved');
 perform pg_temp.b2b_assert((select count(*)=before_sends from sales_send_jobs),'service editorial approval creates no send');
 update sales_contacts set data=data||'{"excluded":true}'::jsonb where id=(f->>'contactId')::uuid;
 perform pg_temp.b2b_assert(sales_reply_read_job(p,jsonb_build_object('projectId',f->>'projectId','jobId',rj->>'id'))->>'sourceCurrent'='false','changed service exclusion invalidates exact snapshot');
end $$;
rollback;
select 'PASS: persisted legacy pilots; explicit service initial/commercial reply and templates; contract/project/token/review refusals; approval sends nothing' as result;
