-- Recipient-free copy revisions only. No transport, recipient, contact or scheduler authority.
create table public.sales_email_copy_revisions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 template_key text not null check (template_key ~ '^[a-z][a-z0-9-]{0,79}$'),
 version integer not null check (version>0),
 previous_id uuid references public.sales_email_copy_revisions(id),
 request_key uuid not null,
 request jsonb not null,
 data jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(project_id,template_key,version),
 unique(project_id,request_key),
 check ((version=1 and previous_id is null) or (version>1 and previous_id is not null)),
 check (data @> '{"status":"draft","recipient":null,"scheduledAt":null,"ownerTextReviewed":false}'::jsonb)
);
alter table public.sales_email_copy_revisions enable row level security;
revoke all on public.sales_email_copy_revisions from public,anon,authenticated,service_role;
grant select,insert on public.sales_email_copy_revisions to service_role;

create or replace function public.sales_email_copy_json(r public.sales_email_copy_revisions)
returns jsonb language sql stable security invoker set search_path='' as $fn$
 select r.data||jsonb_build_object('id',r.id,'projectId',r.project_id,'templateKey',r.template_key,'version',r.version,'previousId',r.previous_id,'createdAt',r.created_at,'createdBy',r.owner_id);
$fn$;

create or replace function public.sales_email_copy_read(p_principal jsonb,p_input jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare pid uuid;
begin
 pid:=public.sales_timing_uuid(p_input->'projectId');
 perform public.sales_owner(p_principal,pid);
 perform public.sales_timing_fields(p_input,array['projectId']);
 return coalesce((select jsonb_agg(public.sales_email_copy_json(r) order by r.template_key,r.version desc) from public.sales_email_copy_revisions r where project_id=pid),'[]'::jsonb);
end $fn$;

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
   where m.project_id=pid and m.key='handlarborsen.sales.email_copy_proposals' and x->>'id'=k;
  if seed is null then raise exception 'NOT_FOUND' using errcode='P0002';end if;
  if seed->>'subject' is distinct from subject or seed->>'body' is distinct from body or jsonb_typeof(seed->'kind') is distinct from 'string' or seed->>'kind' not in ('initial','reminder') or
   jsonb_typeof(seed->'senderName') is distinct from 'string' or jsonb_typeof(seed->'usage') is distinct from 'string' or
   length(btrim(seed->>'senderName')) not between 1 and 100 or seed->>'senderName' ~ '[[:cntrl:]]' or
   length(btrim(seed->>'usage')) not between 1 and 1000 then raise exception 'INVALID_BODY' using errcode='22023';end if;
  select o.data into offer from public.sales_offer_revisions o where o.project_id=pid and o.id=public.sales_timing_uuid(seed->'offerRevisionId');
  if offer is null or offer->'confirmed' is distinct from 'true'::jsonb or offer->'freeMonths' is distinct from seed->'pilotMonths' or offer->>'senderEmail' is distinct from seed->>'senderEmail' then raise exception 'INVALID_BODY' using errcode='22023';end if;
  if jsonb_typeof(offer->'freeMonths') is distinct from 'number' or jsonb_typeof(offer->'senderEmail') is distinct from 'string' or
   jsonb_typeof(offer->'offerText') is distinct from 'string' or jsonb_typeof(offer->'productFacts') is distinct from 'array'
   then raise exception 'INVALID_BODY' using errcode='22023';end if;
  if offer->'freeMonths' not in ('2'::jsonb,'6'::jsonb,'12'::jsonb) or
   length(offer->>'senderEmail') not between 3 and 254 or offer->>'senderEmail' !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' or offer->>'senderEmail' ~ '[[:cntrl:]]' or
   length(btrim(offer->>'offerText',E' \t\r\n')) not between 1 and 2000 or jsonb_array_length(offer->'productFacts') not between 1 and 10
   then raise exception 'INVALID_BODY' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(offer->'productFacts') fact where jsonb_typeof(fact) is distinct from 'string' or length(btrim(fact#>>'{}',E' \t\r\n')) not between 1 and 1000)
   then raise exception 'INVALID_BODY' using errcode='22023';end if;
  d:=jsonb_build_object('kind',seed->'kind','offerRevisionId',seed->'offerRevisionId','pilotMonths',seed->'pilotMonths',
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

revoke all on function public.sales_email_copy_json(public.sales_email_copy_revisions),public.sales_email_copy_read(jsonb,jsonb),public.sales_email_copy_save(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_email_copy_json(public.sales_email_copy_revisions),public.sales_email_copy_read(jsonb,jsonb),public.sales_email_copy_save(jsonb,jsonb) to service_role;

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
 'drafts',coalesce((select jsonb_agg(d.data||jsonb_build_object('id',d.id,'projectId',pid,'jobId',d.job_id,'sha256',d.sha256,'approvalId',d.approval_id,'runId',d.run_id,'status',coalesce(a.status,'needs_input'),'current',d.is_current,'createdAt',d.created_at) order by d.created_at desc) from public.sales_draft_revisions d left join public.approvals a on a.id=d.approval_id where d.project_id=pid and d.is_current),'[]'));
end $function$

