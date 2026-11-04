-- Explicit editorial preparation does not attest unobserved history or authorize sending.
create or replace function public.sales_editorial_contact_review(pid uuid,cid uuid,at timestamptz)
returns jsonb language plpgsql stable set search_path='' as $function$
declare h public.sales_contact_history_revisions;t jsonb;channel text;begin
 t:=public.sales_timing_evaluate(pid,cid,at);
 select * into h from public.sales_contact_history_revisions where project_id=pid and recipient=t->>'recipient' order by version desc limit 1;
 if h.id is null or h.data->>'history' not in('unknown','owner_confirmed_none')
 or jsonb_array_length(h.data->'events')<>0
 or not exists(select from public.sales_contacts c where c.project_id=pid and c.id=cid and c.data->>'history'='not_contacted')
 or exists(select from public.sales_contacts c where c.project_id=pid and lower(btrim(c.data->>'email'))=t->>'recipient' and (c.data->>'history'='contacted' or c.data->>'suppressed'='true' or c.data->>'excluded'='true'))
 or exists(select from public.sales_send_jobs j where j.project_id=pid and lower(btrim(j.sealed_json::jsonb->>'toEmail'))=t->>'recipient' and (j.status in('queued','claimed','dispatching','smtp_accepted','delivery_unknown') or j.accepted_at is not null))
 or exists(select from jsonb_array_elements_text(t->'blockers') reason where reason not in('HISTORY_REVIEW_REQUIRED','SOURCE_GAP','NOT_INITIAL_CONTACT'))
 or exists(select from jsonb_array_elements(h.data->'sources') source where source->>'state'='failed')
 then raise exception 'EDITORIAL_REVIEW_REQUIRED' using errcode='55000';end if;
 foreach channel in array array['strato_sent','strato_inbox','resend'] loop
  if not exists(select from jsonb_array_elements(h.data->'sources') source where source->>'channel'=channel and source->>'state' in('complete','gap')) then raise exception 'EDITORIAL_REVIEW_REQUIRED' using errcode='55000';end if;
 end loop;
 return t||jsonb_build_object('preparationMode','editorial_only','sendingAllowed',false);
end $function$;

CREATE OR REPLACE FUNCTION public.sales_prepare_editorial_job(p_principal jsonb, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare pid uuid:=(p_input->>'projectId')::uuid;j public.sales_jobs;o jsonb;contacts jsonb;expected integer;timing jsonb;
begin
 perform public.sales_owner(p_principal,pid);
 perform public.sales_timing_fields(p_input,array['projectId','conversationId','contactIds','offerRevisionId','idempotencyKey','preparationMode']);
 if p_input->>'preparationMode' is distinct from 'editorial_only' or jsonb_typeof(p_input->'contactIds') is distinct from 'array' or jsonb_typeof(p_input->'idempotencyKey') is distinct from 'string' or length(p_input->>'idempotencyKey') not between 1 and 100 then raise exception 'INVALID_BODY' using errcode='22023';end if;
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
 select jsonb_build_object('contacts',jsonb_agg(public.sales_editorial_contact_review(pid,(c->>'id')::uuid,clock_timestamp()) order by c->>'id')) into timing from jsonb_array_elements(contacts) c;
 insert into public.sales_jobs(project_id,owner_id,request_key,request,snapshot) values(pid,(p_principal->>'userId')::uuid,p_input->>'idempotencyKey',p_input,jsonb_build_object('contacts',contacts,'offer',o,'timing',timing,'preparationMode','editorial_only','sendingAllowed',false)) returning * into j;
 return public.sales_job_json(j);
end $function$;

CREATE OR REPLACE FUNCTION public.sales_timing_assert_snapshot(j sales_jobs)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare old jsonb;current_timing jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended(j.project_id::text||':sales-contact-eligibility',0));
 lock table public.sales_inbox_messages,public.sales_send_jobs in share mode;
 if jsonb_typeof(j.snapshot->'timing'->'contacts') is distinct from 'array' or jsonb_array_length(j.snapshot->'timing'->'contacts')<>jsonb_array_length(j.snapshot->'contacts') then raise exception 'CONTACT_TIMING_CHANGED' using errcode='40001';end if;
 for old in select value from jsonb_array_elements(j.snapshot->'timing'->'contacts') loop
  if j.snapshot->>'preparationMode'='editorial_only' then
   if j.snapshot->'sendingAllowed' is distinct from 'false'::jsonb or j.request->>'preparationMode' is distinct from 'editorial_only' then raise exception 'CONTACT_TIMING_CHANGED' using errcode='40001';end if;
   begin current_timing:=public.sales_editorial_contact_review(j.project_id,(old->>'contactId')::uuid,clock_timestamp());
   exception when sqlstate '55000' then raise exception 'CONTACT_TIMING_CHANGED' using errcode='40001';end;
  else
   current_timing:=public.sales_timing_evaluate(j.project_id,(old->>'contactId')::uuid,clock_timestamp());
   if current_timing->>'initialPreparationAllowed' is distinct from 'true' then raise exception 'CONTACT_TIMING_CHANGED' using errcode='40001';end if;
  end if;
  if current_timing->'historyRevisionId' is distinct from old->'historyRevisionId' or current_timing->'ruleRevisionId' is distinct from old->'ruleRevisionId' or current_timing->'contactVersion' is distinct from old->'contactVersion' then raise exception 'CONTACT_TIMING_CHANGED' using errcode='40001';end if;
 end loop;
end$function$;

create or replace function public.sales_job_json(j public.sales_jobs) returns jsonb language sql set search_path='' as $function$
 select jsonb_build_object('id',j.id,'projectId',j.project_id,'status',j.status,'createdAt',j.created_at,'attempts',j.attempts,'detail',j.detail,'preparationMode',case when j.snapshot->>'preparationMode'='editorial_only' then 'editorial_only' else 'initial' end)
$function$;

revoke all on function public.sales_editorial_contact_review(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.sales_prepare_editorial_job(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_editorial_contact_review(uuid,uuid,timestamptz) to service_role;
grant execute on function public.sales_prepare_editorial_job(jsonb,jsonb) to service_role;
-- Existing invoker rights on replaced functions are preserved.

-- A read-only UI capability uses exactly the server admission predicate.
create or replace function public.sales_editorial_contact_allowed(pid uuid,cid uuid,at timestamptz)
returns boolean language plpgsql stable security invoker set search_path='' as $$
begin
 perform public.sales_stop(pid);
 perform public.sales_editorial_contact_review(pid,cid,at);
 return true;
exception when sqlstate '55000' then return false;
end$$;
revoke all on function public.sales_editorial_contact_allowed(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.sales_editorial_contact_allowed(uuid,uuid,timestamptz) to service_role;

-- Pin editorial request identity and reviewed snapshot; operational state stays writable.
create function public.sales_editorial_job_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.request->>'preparationMode'='editorial_only' or old.snapshot->>'preparationMode'='editorial_only'
 or new.request->>'preparationMode'='editorial_only' or new.snapshot->>'preparationMode'='editorial_only' then
  if row(new.id,new.project_id,new.owner_id,new.request_key,new.request,new.snapshot,new.created_at)
   is distinct from row(old.id,old.project_id,old.owner_id,old.request_key,old.request,old.snapshot,old.created_at)
  then raise exception 'EDITORIAL_JOB_IMMUTABLE' using errcode='23514';end if;
 end if;
 return new;
end$$;
revoke all on function public.sales_editorial_job_immutable() from public,anon,authenticated;
grant execute on function public.sales_editorial_job_immutable() to service_role;
create trigger sales_editorial_job_immutable before update on public.sales_jobs for each row execute function public.sales_editorial_job_immutable();

create or replace function public.sales_timing_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare pid uuid;at timestamptz:=clock_timestamp();rows jsonb;r public.sales_contact_timing_rules;ids jsonb:=p_input->'contactIds';n integer;slug text;begin
 pid:=public.sales_timing_uuid(p_input->'projectId');perform public.sales_owner(p_principal,pid);
 if jsonb_typeof(p_input) is distinct from 'object' or exists(select from jsonb_object_keys(p_input) k where k not in('projectId','contactIds')) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 if ids is not null then
  if jsonb_typeof(ids)<>'array' or jsonb_array_length(ids) not between 1 and 200 then raise exception 'INVALID_BODY' using errcode='22023';end if;
  perform public.sales_timing_uuid(value) from jsonb_array_elements(ids);
  if (select count(*)<>count(distinct value) from jsonb_array_elements(ids)) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 end if;
 select count(*) into n from public.sales_contacts where project_id=pid and (ids is null or ids @> jsonb_build_array(id));
 if n>200 then raise exception 'TIMING_SELECTION_TOO_LARGE' using errcode='22023';end if;
 if ids is not null and n<>jsonb_array_length(ids) then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 select jsonb_agg(public.sales_timing_evaluate(pid,id,at)||jsonb_build_object('editorialPreparationAllowed',public.sales_editorial_contact_allowed(pid,id,at)) order by data->>'companyName',id) into rows from public.sales_contacts where project_id=pid and (ids is null or ids @> jsonb_build_array(id));
 select * into r from public.sales_contact_timing_rules where project_id=pid order by version desc limit 1;
 select p.slug into slug from public.projects p where p.id=pid;
 return jsonb_build_object('projectId',pid,'evaluatedAt',at,'contacts',coalesce(rows,'[]'),'historyRevisions',coalesce((select jsonb_agg(public.sales_timing_history_json(h)) from public.sales_contact_history_revisions h where h.project_id=pid and h.id in(select (value->>'historyRevisionId')::uuid from jsonb_array_elements(rows))),'[]'),'rules',case when r.id is null then null else public.sales_timing_rules_json(r) end,'customerSendingEnabled',false,'workspaceUrl','/projects/'||slug||'/sales#contact-timing');
end$$;


CREATE OR REPLACE FUNCTION public.sales_read_workspace(p_principal jsonb, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare pid uuid:=(p_input->>'projectId')::uuid;slug text;
begin perform public.sales_owner(p_principal,pid);perform public.sales_reconcile_expired(pid);select p.slug into slug from public.projects p where id=pid;
 return jsonb_build_object('projectId',pid,'state','ok','sendingEnabled',false,'workspaceUrl','/projects/'||slug||'/sales',
 'timing',public.sales_timing_read(p_principal,jsonb_build_object('projectId',pid)),
 'emailTemplates',public.sales_email_copy_read(p_principal,jsonb_build_object('projectId',pid)),
 'workerState',case when exists(select from public.sales_worker_registrations where project_id=pid and revoked_at is null and expires_at>now() and last_seen_at>now()-interval '90 seconds') then 'connected' else 'not_connected' end,
 'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'contactId',e.contact_id,'source',e.data,'question',e.question,'provenance',e.provenance)) from public.sales_evidence e where e.project_id=pid),'[]'),
 'workers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'expiresAt',expires_at,'lastSeenAt',last_seen_at,'revoked',revoked_at is not null)) from public.sales_worker_registrations where project_id=pid),'[]'),
 'contacts',coalesce((select jsonb_agg(data order by created_at) from public.sales_contacts where project_id=pid),'[]'),
 'offers',coalesce((select jsonb_agg(data order by created_at desc) from public.sales_offer_revisions where project_id=pid),'[]'),
 'jobs',coalesce((select jsonb_agg(public.sales_job_json(j) order by created_at desc) from (select * from public.sales_jobs where project_id=pid order by created_at desc limit 20) j),'[]'),
 'drafts',coalesce((select jsonb_agg(d.data||jsonb_build_object('id',d.id,'projectId',pid,'jobId',d.job_id,'preparationMode',case when j.snapshot->>'preparationMode'='editorial_only' then 'editorial_only' else 'initial' end,'sha256',d.sha256,'approvalId',d.approval_id,'runId',d.run_id,'status',coalesce(a.status,'needs_input'),'current',d.is_current,'createdAt',d.created_at) order by d.created_at desc) from public.sales_draft_revisions d join public.sales_jobs j on j.project_id=d.project_id and j.id=d.job_id left join public.approvals a on a.id=d.approval_id where d.project_id=pid and d.is_current),'[]'));
end $function$;
