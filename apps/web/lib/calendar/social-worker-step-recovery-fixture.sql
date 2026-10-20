-- TEST-ONLY social worker step/checkpoint projection. Uses minimal fake
-- provider/publication record, not live Supabase schema or provider API.
alter table public.social_publications
 add column revision_id uuid,
 add column sha256 text,
 add column decision_id uuid,
 add column binding_id uuid,
 add column channel text,
 add column account_id text,
 add column account_label text,
 add column request_input jsonb,
 add column idempotency_key text,
 add column requested_by uuid,
 add column authority_source text,
 add column job_id uuid,
 add column container_id text,
 add column provider_id text,
 add column permalink text,
 add column confirmation text;
-- Match actual 20261016115402_social_manual_publication_v1.sql state default.
alter table public.social_publications alter column state set default 'requested';

create or replace function public.social_publication_record(r public.social_publications)
returns jsonb language sql immutable security invoker set search_path='' as $fn$
 select jsonb_build_object('id',r.id,'state',r.state,'version',r.version,
  'jobId',r.job_id,'providerId',r.provider_id,'failureCode',r.failure_code);
$fn$;

create function public.social_schedule_receipt(p_input jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare j public.social_schedule_jobs;r public.social_publications;
begin
 perform public.social_schedule_fields(p_input,array['jobId']);
 select * into j from public.social_schedule_jobs where id=(p_input->>'jobId')::uuid;
 if j.id is null then raise exception 'SOCIAL_SCHEDULE_NOT_FOUND' using errcode='P0002';end if;
 select * into r from public.social_publications where id=j.publication_id and project_id=j.project_id and job_id=j.id;
 return jsonb_build_object('claim',jsonb_build_object('jobId',j.id,'claimId',j.claim_id,'version',j.version,'leaseExpiresAt',j.lease_expires_at,'snapshot',public.social_schedule_snapshot(j)),'publication',case when r.id is null then null else public.social_publication_record(r) end,'jobState',j.state);
end $fn$;
revoke all on function public.social_publication_record(public.social_publications),
 public.social_schedule_receipt(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.social_publication_record(public.social_publications),
 public.social_schedule_receipt(jsonb) to service_role;
