begin;
-- This table is part of the real app; the isolated sales fixture omits general project memory.
create table if not exists public.memories(id uuid primary key default gen_random_uuid(),project_id uuid not null,key text not null,value text not null,source text,updated_at timestamptz default now());
grant select on public.memories to service_role;
insert into public.memories(project_id,key,value)
values('10000000-0000-4000-8000-000000000001','handlarborsen.sales.email_copy_proposals',
'{"templates":[{"id":"pilot-six-months-initial-v1","kind":"initial","offerRevisionId":"40000000-0000-4000-8000-000000000901","pilotMonths":6,"senderName":"Andre","senderEmail":"info@example.se","subject":"Första inbjudan","body":"Hej! Ett mottagarfritt textförslag.","usage":"Ingen mottagare vald. Ingen sändning."}]}');
insert into public.sales_offer_revisions(id,project_id,data) values('40000000-0000-4000-8000-000000000910','10000000-0000-4000-8000-000000000001','{"confirmed":true,"freeMonths":null,"senderEmail":"info@example.se","offerText":"Text","productFacts":["Fakta"]}'::jsonb);
insert into public.sales_offer_revisions(id,project_id,data) values('40000000-0000-4000-8000-000000000911','10000000-0000-4000-8000-000000000001','{"confirmed":true,"freeMonths":99,"senderEmail":"info@example.se","offerText":"Text","productFacts":["Fakta"]}'::jsonb);
insert into public.sales_offer_revisions(id,project_id,data) values('40000000-0000-4000-8000-000000000912','10000000-0000-4000-8000-000000000001','{"confirmed":true,"freeMonths":6,"senderEmail":"","offerText":"Text","productFacts":["Fakta"]}'::jsonb);
insert into public.sales_offer_revisions(id,project_id,data) values('40000000-0000-4000-8000-000000000913','10000000-0000-4000-8000-000000000001','{"confirmed":true,"freeMonths":6,"senderEmail":"info@example.se","offerText":null,"productFacts":["Fakta"]}'::jsonb);
insert into public.sales_offer_revisions(id,project_id,data) values('40000000-0000-4000-8000-000000000914','10000000-0000-4000-8000-000000000001','{"confirmed":true,"freeMonths":6,"senderEmail":"info@example.se","offerText":"Text","productFacts":[null]}'::jsonb);
update public.memories set value=jsonb_set(value::jsonb,'{templates}',value::jsonb->'templates'||'[{"id":"bad-null-months","kind":"initial","offerRevisionId":"40000000-0000-4000-8000-000000000910","pilotMonths":null,"senderName":"Andre","senderEmail":"info@example.se","subject":"Bad metadata","body":"Hej!","usage":"Ingen sändning."},{"id":"bad-month-range","kind":"initial","offerRevisionId":"40000000-0000-4000-8000-000000000911","pilotMonths":99,"senderName":"Andre","senderEmail":"info@example.se","subject":"Bad metadata","body":"Hej!","usage":"Ingen sändning."},{"id":"bad-empty-sender","kind":"initial","offerRevisionId":"40000000-0000-4000-8000-000000000912","pilotMonths":6,"senderName":"Andre","senderEmail":"","subject":"Bad metadata","body":"Hej!","usage":"Ingen sändning."},{"id":"bad-null-offer","kind":"initial","offerRevisionId":"40000000-0000-4000-8000-000000000913","pilotMonths":6,"senderName":"Andre","senderEmail":"info@example.se","subject":"Bad metadata","body":"Hej!","usage":"Ingen sändning."},{"id":"bad-null-fact","kind":"initial","offerRevisionId":"40000000-0000-4000-8000-000000000914","pilotMonths":6,"senderName":"Andre","senderEmail":"info@example.se","subject":"Bad metadata","body":"Hej!","usage":"Ingen sändning."}]'::jsonb)::text where project_id='10000000-0000-4000-8000-000000000001' and key='handlarborsen.sales.email_copy_proposals';
set local role service_role;
do $test$
declare
 p jsonb:='{"userId":"20000000-0000-4000-8000-000000000001","allowedProjectIds":["10000000-0000-4000-8000-000000000001"]}';
 v jsonb:='{"projectId":"10000000-0000-4000-8000-000000000001","templateKey":"pilot-six-months-initial-v1","expectedPreviousId":null,"idempotencyKey":"70000000-0000-4000-8000-000000000901","subject":"Första inbjudan","body":"Hej! Ett mottagarfritt textförslag."}';
 a jsonb;b jsonb;before_contacts text;before_jobs bigint;bad jsonb;
begin
 perform sales_save_offer(p,'{"projectId":"10000000-0000-4000-8000-000000000001","id":"40000000-0000-4000-8000-000000000901","senderEmail":"info@example.se","offerText":"Sex månader kostnadsfritt.","freeMonths":6,"productFacts":["Verifierat fixtureunderlag."],"confirmed":true}');
 select md5(jsonb_agg(to_jsonb(c) order by id)::text) into before_contacts from sales_contacts c;
 select count(*) into before_jobs from sales_jobs;
 for bad in select value from jsonb_array_elements('[{"projectId":"10000000-0000-4000-8000-000000000001","templateKey":"bad-null-months","expectedPreviousId":null,"idempotencyKey":"70000000-0000-4000-8000-000000000910","subject":"Bad metadata","body":"Hej!"},{"projectId":"10000000-0000-4000-8000-000000000001","templateKey":"bad-month-range","expectedPreviousId":null,"idempotencyKey":"70000000-0000-4000-8000-000000000911","subject":"Bad metadata","body":"Hej!"},{"projectId":"10000000-0000-4000-8000-000000000001","templateKey":"bad-empty-sender","expectedPreviousId":null,"idempotencyKey":"70000000-0000-4000-8000-000000000912","subject":"Bad metadata","body":"Hej!"},{"projectId":"10000000-0000-4000-8000-000000000001","templateKey":"bad-null-offer","expectedPreviousId":null,"idempotencyKey":"70000000-0000-4000-8000-000000000913","subject":"Bad metadata","body":"Hej!"},{"projectId":"10000000-0000-4000-8000-000000000001","templateKey":"bad-null-fact","expectedPreviousId":null,"idempotencyKey":"70000000-0000-4000-8000-000000000914","subject":"Bad metadata","body":"Hej!"}]'::jsonb) loop
  begin perform sales_email_copy_save(p,bad);raise exception 'INCOMPLETE_OFFER_METADATA_ALLOWED';exception when invalid_parameter_value then null;end;
 end loop;
 a:=sales_email_copy_save(p,v);
 if a->>'version'<>'1' or a->'recipient'<>'null'::jsonb or a->'scheduledAt'<>'null'::jsonb or a->>'status'<>'draft' or a->'ownerTextReviewed'<>'false'::jsonb then raise exception 'COPY_DRAFT_BOUNDARY';end if;
 if sales_email_copy_save(p,v)->>'id'<>a->>'id' then raise exception 'RETRY_CREATED_VERSION';end if;
 begin perform sales_email_copy_save(p,v||'{"body":"Changed same key"}');raise exception 'RETRY_MISMATCH_ALLOWED';exception when unique_violation then null;end;
 v:=v||jsonb_build_object('expectedPreviousId',a->'id','idempotencyKey','70000000-0000-4000-8000-000000000902','subject','Ändrat ämne','body','Ny text med <script>untrusted</script>.');
 b:=sales_email_copy_save(p,v);
 if b->>'version'<>'2' or b->>'previousId'<>a->>'id' or b->>'senderEmail'<>a->>'senderEmail' or b->>'offerRevisionId'<>a->>'offerRevisionId' or b->>'status'<>'draft' then raise exception 'EDIT_METADATA_CHANGED';end if;
 if (select data->>'body' from sales_email_copy_revisions where id=(a->>'id')::uuid)<>'Hej! Ett mottagarfritt textförslag.' then raise exception 'OLD_COPY_OVERWRITTEN';end if;
 if jsonb_array_length(sales_email_copy_read(p,jsonb_build_object('projectId',v->'projectId')))<>2 then raise exception 'HISTORY_NOT_READABLE';end if;
 if jsonb_array_length(sales_read_workspace(p,jsonb_build_object('projectId',v->'projectId'))->'emailTemplates')<>2 then raise exception 'ATLAS_WORKSPACE_MISSING_COPY';end if;
 begin perform sales_email_copy_save(p,v||'{"idempotencyKey":"70000000-0000-4000-8000-000000000903","body":"Stale"}');raise exception 'STALE_EDIT_ALLOWED';exception when unique_violation then null;end;
 v:=v||jsonb_build_object('expectedPreviousId',b->'id','idempotencyKey','70000000-0000-4000-8000-000000000904');
 foreach bad in array array['{"recipient":"someone@example.se"}'::jsonb,'{"senderEmail":"attacker@example.se"}'::jsonb,'{"approved":true}'::jsonb,'{"scheduledAt":"2026-12-01"}'::jsonb,'{"subject":""}'::jsonb,'{"body":""}'::jsonb,jsonb_build_object('subject',E'Header\r\nBcc: hidden@example.se'),jsonb_build_object('body',repeat('a',2001))] loop
  begin perform sales_email_copy_save(p,v||bad);raise exception 'INVALID_COPY_INPUT_ALLOWED';exception when invalid_parameter_value then null;end;
 end loop;
 begin perform sales_email_copy_read(p||'{"userId":"20000000-0000-4000-8000-000000000002"}',jsonb_build_object('projectId',v->'projectId'));raise exception 'OTHER_OWNER_READ_ALLOWED';exception when no_data_found then null;end;
 if has_table_privilege('service_role','sales_email_copy_revisions','UPDATE') or has_table_privilege('service_role','sales_email_copy_revisions','DELETE') or has_table_privilege('anon','sales_email_copy_revisions','SELECT') or has_function_privilege('authenticated','sales_email_copy_save(jsonb,jsonb)','EXECUTE') then raise exception 'COPY_PERMISSIONS';end if;
 if before_contacts is distinct from (select md5(jsonb_agg(to_jsonb(c) order by id)::text) from sales_contacts c) or before_jobs<>(select count(*) from sales_jobs) then raise exception 'COPY_CHANGED_CONTACT_OR_JOB';end if;
 raise notice 'PASS email copy create/edit/retry/CAS/history/owner/transport boundaries and untouched contacts/jobs';
end $test$;
select 'PASS email copy create/edit/retry/CAS/history/owner/transport boundaries and untouched contacts/jobs';
rollback;
