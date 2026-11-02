-- Additive B2B offer contract. Legacy absent discriminator remains pilot 2/6/12.
-- Explicit service records use offerKind=general_service and JSON null months.
-- No project activation, mailbox access, sending, scheduling or product pricing.
create function public.sales_offer_terms_valid(d jsonb,month_field text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_typeof(d)='object' and month_field in ('pilotMonths','freeMonths') and (
 ((not (d ? 'offerKind') or d->'offerKind'='"pilot"'::jsonb) and jsonb_typeof(d->month_field)='number' and d->month_field in ('2'::jsonb,'6'::jsonb,'12'::jsonb))
 or (d->'offerKind'='"general_service"'::jsonb and d ? month_field and d->month_field='null'::jsonb)),false)
$$;
create function public.sales_offer_matches(c jsonb,o jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select public.sales_offer_terms_valid(c,'pilotMonths') and public.sales_offer_terms_valid(o,'freeMonths')
 and coalesce(c->>'offerKind','pilot')=coalesce(o->>'offerKind','pilot') and c->'pilotMonths'=o->'freeMonths'
$$;
create function public.sales_confirmed_offer(o jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
begin
 if not public.sales_offer_terms_valid(o,'freeMonths') or o->'confirmed' is distinct from 'true'::jsonb
 or jsonb_typeof(o->'senderEmail') is distinct from 'string' or length(o->>'senderEmail') not between 3 and 254
 or o->>'senderEmail' !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' or o->>'senderEmail' ~ '[[:cntrl:]]'
 or jsonb_typeof(o->'offerText') is distinct from 'string' or length(btrim(o->>'offerText',E' \t\r\n')) not between 1 and 2000
 or jsonb_typeof(o->'productFacts') is distinct from 'array' then return false;end if;
 if jsonb_array_length(o->'productFacts') not between 1 and 10 then return false;end if;
 return not exists(select from jsonb_array_elements(o->'productFacts') fact where jsonb_typeof(fact) is distinct from 'string' or length(btrim(fact#>>'{}',E' \t\r\n')) not between 1 and 1000);
end $$;
revoke all on function public.sales_offer_terms_valid(jsonb,text),public.sales_offer_matches(jsonb,jsonb),public.sales_confirmed_offer(jsonb) from public,anon,authenticated;
grant execute on function public.sales_offer_terms_valid(jsonb,text),public.sales_offer_matches(jsonb,jsonb),public.sales_confirmed_offer(jsonb) to service_role;
-- Preserve old JSON while enforcing new/updated records. Old malformed rows fail closed at admission.
alter table public.sales_contacts add constraint sales_contact_offer_terms check (public.sales_offer_terms_valid(data,'pilotMonths')) not valid;
alter table public.sales_offer_revisions add constraint sales_offer_revision_terms check (public.sales_offer_terms_valid(data,'freeMonths')) not valid;


create or replace function public.sales_save_contact(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;cid uuid:=(p_input->>'id')::uuid;c public.sales_contacts;d jsonb;
begin
 perform public.sales_owner(p_principal,pid);
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-contact-eligibility',0));
 select * into c from public.sales_contacts where project_id=pid and id=cid for update;
 if coalesce(c.version,0)<>(p_input->>'expectedVersion')::integer then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 d:=(p_input-'expectedVersion')||jsonb_build_object('id',cid,'projectId',pid,'version',coalesce(c.version,0)+1);
 if length(d->>'companyName') not between 1 and 200 or d->>'history' not in('not_contacted','contacted','unknown') or (d->>'email') ~ E'[\r\n]' or length(d->>'historySource') not between 1 and 2000 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 if not public.sales_offer_terms_valid(d,'pilotMonths') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 insert into public.sales_contacts(id,project_id,version,data) values(cid,pid,coalesce(c.version,0)+1,d) on conflict(id) do update set version=excluded.version,data=excluded.data where sales_contacts.project_id=pid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 return d;
end $$;

create or replace function public.sales_save_offer(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;d jsonb;
begin
 perform public.sales_owner(p_principal,pid);
 if not public.sales_confirmed_offer(p_input) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 d:=p_input||jsonb_build_object('createdAt',now());
 insert into public.sales_offer_revisions(id,project_id,data) values((p_input->>'id')::uuid,pid,d);return d;
end $$;

create or replace function public.sales_prepare_job(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;j public.sales_jobs;o jsonb;contacts jsonb;expected integer;timing jsonb;
begin
 perform public.sales_owner(p_principal,pid);
 if not exists(select 1 from public.conversations where id=(p_input->>'conversationId')::uuid and user_id=(p_principal->>'userId')::uuid and project_id=pid) then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':'||(p_input->>'idempotencyKey'),0));
 select * into j from public.sales_jobs where project_id=pid and request_key=p_input->>'idempotencyKey';
 if found then if j.request<>p_input then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return public.sales_job_json(j);end if;
 perform public.sales_stop(pid);
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-contact-eligibility',0));
 expected:=jsonb_array_length(p_input->'contactIds');if expected not between 1 and 5 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 select jsonb_agg(c.data order by c.id) into contacts from public.sales_contacts c where c.project_id=pid and (p_input->'contactIds') @> jsonb_build_array(c.id::text) and c.data->>'history'='not_contacted' and (c.data->>'confirmed')::boolean is true and (c.data->>'excluded')::boolean is false and (c.data->>'suppressed')::boolean is false;
 if coalesce(jsonb_array_length(contacts),0)<>expected then raise exception 'CONTACT_REVIEW_REQUIRED' using errcode='55000';end if;
 if exists(select from public.sales_contacts c where c.project_id=pid and (c.data->>'history'='contacted' or (c.data->>'suppressed')::boolean is true) and exists(select from jsonb_array_elements(contacts) selected where lower(selected->>'email')=lower(c.data->>'email'))) then raise exception 'MAILBOX_REVIEW_REQUIRED' using errcode='55000';end if;
 if exists(select from public.sales_jobs previous cross join lateral jsonb_array_elements(previous.snapshot->'contacts') old_contact where previous.project_id=pid and previous.status not in('cancelled','failed') and exists(select from jsonb_array_elements(contacts) selected where lower(selected->>'email')=lower(old_contact->>'email'))) then raise exception 'INITIAL_JOB_ALREADY_EXISTS' using errcode='55000';end if;
 select data into o from public.sales_offer_revisions where project_id=pid and id=(p_input->>'offerRevisionId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if not public.sales_confirmed_offer(o) then raise exception 'OFFER_REVIEW_REQUIRED' using errcode='55000';end if;
 if exists(select from jsonb_array_elements(contacts) c where not public.sales_offer_matches(c,o)) then raise exception 'PILOT_TIER_MISMATCH' using errcode='55000';end if;
 lock table public.sales_inbox_messages,public.sales_send_jobs in share mode;
 timing:=public.sales_timing_read(p_principal,jsonb_build_object('projectId',pid,'contactIds',p_input->'contactIds'));
 if exists(select from jsonb_array_elements(timing->'contacts') x where x->>'initialPreparationAllowed' is distinct from 'true') then raise exception 'CONTACT_TIMING_REVIEW_REQUIRED' using errcode='55000';end if;
 insert into public.sales_jobs(project_id,owner_id,request_key,request,snapshot) values(pid,(p_principal->>'userId')::uuid,p_input->>'idempotencyKey',p_input,jsonb_build_object('contacts',contacts,'offer',o,'timing',timing)) returning * into j;
 return public.sales_job_json(j);
end $$;

create or replace function public.sales_assert_contacts(j public.sales_jobs) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not public.sales_confirmed_offer(j.snapshot->'offer') or not exists(select from public.sales_offer_revisions o where o.project_id=j.project_id and o.id=(j.snapshot->'offer'->>'id')::uuid and o.data=j.snapshot->'offer') or exists(select from jsonb_array_elements(j.snapshot->'contacts') c where not public.sales_offer_matches(c,j.snapshot->'offer')) then raise exception 'OFFER_CHANGED' using errcode='40001';end if;
 perform public.sales_timing_assert_snapshot(j);
 perform pg_advisory_xact_lock(hashtextextended(j.project_id::text||':sales-contact-eligibility',0));
 if exists(select from jsonb_array_elements(j.snapshot->'contacts') old_contact where not exists(select from public.sales_contacts c where c.project_id=j.project_id and c.id=(old_contact->>'id')::uuid and c.version=(old_contact->>'version')::integer and c.data=old_contact and c.data->>'history'='not_contacted' and (c.data->>'confirmed')::boolean is true and (c.data->>'excluded')::boolean is false and (c.data->>'suppressed')::boolean is false)) then raise exception 'CONTACT_CHANGED' using errcode='40001';end if;
 if exists(select from public.sales_contacts c where c.project_id=j.project_id and (c.data->>'history'='contacted' or (c.data->>'suppressed')::boolean is true) and exists(select from jsonb_array_elements(j.snapshot->'contacts') old_contact where lower(old_contact->>'email')=lower(c.data->>'email'))) then raise exception 'MAILBOX_CHANGED' using errcode='40001';end if;
end $$;

create or replace function public.sales_reply_snapshot(pid uuid,uid uuid,v jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.sales_inbox_messages;b public.sales_inbox_messages;c public.sales_contacts;o public.sales_offer_revisions;i public.sales_inbox_configs;mb public.sales_mailbox_connections;
begin
 select * into m from public.sales_inbox_messages where project_id=pid and owner_id=uid and id=(v->>'messageId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 select * into mb from public.sales_mailbox_connections where project_id=pid and id=m.mailbox_id and owner_id=uid;
 perform 1 from public.sales_worker_registrations w where w.project_id=pid and w.owner_id=uid and w.id=mb.worker_id and w.revoked_at is null and w.managed_authorized_at is not null and w.desired_state='running' for share;
 if not found then raise exception 'REPLY_INPUT_REQUIRED' using errcode='55000';end if;
 select * into mb from public.sales_mailbox_connections where project_id=pid and id=m.mailbox_id and owner_id=uid for share;
 select * into i from public.sales_inbox_configs where project_id=pid and mailbox_id=m.mailbox_id and owner_id=uid for share;
 select * into m from public.sales_inbox_messages where project_id=pid and owner_id=uid and id=(v->>'messageId')::uuid for share;
 select * into c from public.sales_contacts where project_id=pid and id=(v->>'contactId')::uuid for share;
 select * into o from public.sales_offer_revisions where project_id=pid and id=(v->>'offerRevisionId')::uuid for share;
 select * into b from public.sales_inbox_messages where project_id=pid and mailbox_id=m.mailbox_id and owner_id=uid and id=coalesce(m.canonical_id,m.id) for share;

 if i.mailbox_id is null or mb.id is null or b.id is null or m.version is distinct from (v->>'messageVersion')::integer
 or i.state<>'enabled' or i.mailbox_generation<>mb.generation or mb.status<>'authenticated' or not m.text_selected or b.text_state<>'complete' or b.body_text is null or b.content_sha256 is null
 or not exists(select from public.sales_inbox_occurrences where mailbox_id=m.mailbox_id and uid_validity=i.uid_validity and message_id=b.id)
 then raise exception 'REPLY_INPUT_REQUIRED' using errcode='55000';end if;
 if v->>'replyMode'='general' then
  if m.header->>'from' is null or m.header->>'from' !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+[.][^[:space:]<>@,;]+$'
  or exists(select from public.sales_contacts x where x.project_id=pid and lower(x.data->>'email')=lower(m.header->>'from') and (x.data->>'suppressed'='true' or x.data->>'excluded'='true'))
  then raise exception 'REPLY_INPUT_REQUIRED' using errcode='55000';end if;
  return jsonb_build_object('replyMode','general','mailboxId',m.mailbox_id,'mailboxGeneration',mb.generation,'inboxConfigVersion',i.version,'messageId',m.id,'messageVersion',m.version,'canonicalMessageId',b.id,'canonicalVersion',b.version,'contentSha256',b.content_sha256,'header',m.header,'text',b.body_text,'contact','{}'::jsonb,'offer','{}'::jsonb,
   'correspondent',jsonb_build_object('email',m.header->>'from'),
   'sender',jsonb_build_object('email',mb.email,'displayName',case when pid='8f673c09-1c8f-4d78-876e-4c14bf1c89b3' and uid='d63a09fb-448e-41b8-9fb2-9a608f5f1800' and lower(mb.email)='info@handlarborsen.se' then 'Andre' end,'signatureName',case when pid='8f673c09-1c8f-4d78-876e-4c14bf1c89b3' and uid='d63a09fb-448e-41b8-9fb2-9a608f5f1800' and lower(mb.email)='info@handlarborsen.se' then 'Andre' end));
 end if;
 if c.id is null or o.id is null or c.version is distinct from (v->>'contactVersion')::integer or m.contact_id is distinct from c.id or m.contact_version is distinct from c.version
 or c.data->>'confirmed' is distinct from 'true' or c.data->>'excluded' is distinct from 'false' or c.data->>'suppressed' is distinct from 'false' or c.data->>'history' not in('contacted','not_contacted')
 or c.data->>'history' is null or lower(c.data->>'email') is distinct from lower(m.header->>'from') or lower(o.data->>'senderEmail') is distinct from lower(mb.email) or o.data->>'confirmed' is distinct from 'true' or not public.sales_offer_matches(c.data,o.data) or not public.sales_confirmed_offer(o.data)
 or exists(select from public.sales_contacts x where x.project_id=pid and lower(x.data->>'email')=lower(c.data->>'email') and x.data->>'suppressed'='true') then raise exception 'REPLY_INPUT_REQUIRED' using errcode='55000';end if;
 return jsonb_build_object('mailboxId',m.mailbox_id,'mailboxGeneration',mb.generation,'inboxConfigVersion',i.version,'messageId',m.id,'messageVersion',m.version,'canonicalMessageId',b.id,'canonicalVersion',b.version,'contentSha256',b.content_sha256,'header',m.header,'text',b.body_text,'contact',c.data||jsonb_build_object('id',c.id,'version',c.version),'offer',o.data||jsonb_build_object('id',o.id));

end $$;

create or replace function public.sales_email_copy_save(p_principal jsonb,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare pid uuid;k text;r public.sales_email_copy_revisions;old public.sales_email_copy_revisions;seed jsonb;offer jsonb;d jsonb;subject text;body text;
begin
 pid:=public.sales_timing_uuid(p_input->'projectId');
 perform public.sales_owner(p_principal,pid);
 perform public.sales_timing_fields(p_input,array['projectId','templateKey','expectedPreviousId','idempotencyKey','subject','body']);
 perform public.sales_timing_uuid(p_input->'idempotencyKey');
 if p_input->'expectedPreviousId'<>'null' then perform public.sales_timing_uuid(p_input->'expectedPreviousId');end if;
 k:=p_input->>'templateKey';subject:=p_input->>'subject';body:=p_input->>'body';
 if jsonb_typeof(p_input->'templateKey') is distinct from 'string' or k !~ '^[a-z][a-z0-9-]{0,79}$' or
 jsonb_typeof(p_input->'subject') is distinct from 'string' or length(btrim(subject))=0 or length(subject)>90 or subject ~ '[[:cntrl:]]' or
 jsonb_typeof(p_input->'body') is distinct from 'string' or length(btrim(body,E' \t\r\n'))=0 or length(body)>2000 or translate(body,chr(9)||chr(10)||chr(13),'') ~ '[[:cntrl:]]'
 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-email-copy',0));
 select * into r from public.sales_email_copy_revisions where project_id=pid and request_key=(p_input->>'idempotencyKey')::uuid;
 if found then
  if r.request is distinct from p_input then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
  return public.sales_email_copy_json(r);
 end if;
 select * into old from public.sales_email_copy_revisions where project_id=pid and template_key=k order by version desc limit 1;
 if old.id is distinct from (p_input->>'expectedPreviousId')::uuid then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 if old.id is null then
  select x into seed from public.memories m cross join lateral jsonb_array_elements(m.value::jsonb->'templates') x
   where m.project_id=pid and m.key=case when exists(select from public.memories preferred where preferred.project_id=pid and preferred.key='sales.email_copy_proposals') then 'sales.email_copy_proposals' else 'handlarborsen.sales.email_copy_proposals' end and x->>'id'=k;
  if seed is null then raise exception 'NOT_FOUND' using errcode='P0002';end if;
  if seed->>'subject' is distinct from subject or seed->>'body' is distinct from body or jsonb_typeof(seed->'kind') is distinct from 'string' or seed->>'kind' not in ('initial','reminder') or
   jsonb_typeof(seed->'senderName') is distinct from 'string' or jsonb_typeof(seed->'usage') is distinct from 'string' or
   length(btrim(seed->>'senderName')) not between 1 and 100 or seed->>'senderName' ~ '[[:cntrl:]]' or
   length(btrim(seed->>'usage')) not between 1 and 1000 then raise exception 'INVALID_BODY' using errcode='22023';end if;
  select o.data into offer from public.sales_offer_revisions o where o.project_id=pid and o.id=public.sales_timing_uuid(seed->'offerRevisionId');
  if offer is null or offer->'confirmed' is distinct from 'true'::jsonb or not public.sales_offer_matches(seed,offer) or offer->>'senderEmail' is distinct from seed->>'senderEmail' then raise exception 'INVALID_BODY' using errcode='22023';end if;
  if jsonb_typeof(offer->'senderEmail') is distinct from 'string' or
   jsonb_typeof(offer->'offerText') is distinct from 'string' or jsonb_typeof(offer->'productFacts') is distinct from 'array'
   then raise exception 'INVALID_BODY' using errcode='22023';end if;
  if not public.sales_confirmed_offer(offer) or
   length(offer->>'senderEmail') not between 3 and 254 or offer->>'senderEmail' !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' or offer->>'senderEmail' ~ '[[:cntrl:]]' or
   length(btrim(offer->>'offerText',E' \t\r\n')) not between 1 and 2000 or jsonb_array_length(offer->'productFacts') not between 1 and 10
   then raise exception 'INVALID_BODY' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(offer->'productFacts') fact where jsonb_typeof(fact) is distinct from 'string' or length(btrim(fact#>>'{}',E' \t\r\n')) not between 1 and 1000)
   then raise exception 'INVALID_BODY' using errcode='22023';end if;
  d:=(case when seed ? 'offerKind' then jsonb_build_object('offerKind',seed->'offerKind') else '{}'::jsonb end)||jsonb_build_object('kind',seed->'kind','offerRevisionId',seed->'offerRevisionId','pilotMonths',seed->'pilotMonths',
   'offerText',offer->'offerText','productFacts',offer->'productFacts','senderName',seed->'senderName','senderEmail',offer->'senderEmail','usage',seed->'usage');
 else
  if old.data->>'subject'=subject and old.data->>'body'=body then raise exception 'INVALID_BODY' using errcode='22023';end if;
  d:=old.data;
 end if;
 d:=d||jsonb_build_object('subject',subject,'body',body,'status','draft','recipient',null,'scheduledAt',null,'ownerTextReviewed',false);
 insert into public.sales_email_copy_revisions(project_id,owner_id,template_key,version,previous_id,request_key,request,data)
 values(pid,(p_principal->>'userId')::uuid,k,coalesce(old.version,0)+1,old.id,(p_input->>'idempotencyKey')::uuid,p_input,d) returning * into r;
 return public.sales_email_copy_json(r);
end $fn$;
