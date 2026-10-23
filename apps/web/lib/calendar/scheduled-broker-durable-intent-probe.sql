-- TEST ONLY. Installed in a disposable isolated PostgreSQL replay.
-- No deployable migration, production role, grant or Meta write.
--
-- Reserve a provider dispatch attempt in a separate COMMITTED database
-- transaction BEFORE network I/O. A lost HTTP response, new worker process,
-- or renewed job claim cannot erase this one-way intent. Never retry
-- automatically: an external reconciliation process must investigate.
create role social_schedule_broker_intent_fixture nologin nobypassrls;
grant usage on schema public to social_schedule_broker_intent_fixture;

create table public.social_schedule_dispatch_intents_fixture (
  job_id uuid primary key,
  publication_id uuid not null unique,
  project_id uuid not null,
  claim_id uuid not null,
  approval_id uuid not null,
  manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
  binding_id uuid not null,
  account_id text not null,
  asset_id uuid not null,
  asset_sha256 text not null check(asset_sha256 ~ '^[a-f0-9]{64}$'),
  provider_outcome text not null default 'unknown'
    check(provider_outcome='unknown'),
  reserved_at timestamptz not null default clock_timestamp()
);
alter table public.social_schedule_dispatch_intents_fixture enable row level security;
revoke all on public.social_schedule_dispatch_intents_fixture
  from public,anon,authenticated,service_role,
       social_schedule_rpc_only_fixture,social_schedule_broker_intent_fixture;

create function public.social_schedule_dispatch_try_begin_fixture(
  p_claim jsonb,p_publication_id uuid
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare
  claims jsonb;
  project uuid;
  snapshot jsonb;
  inserted boolean;
  job uuid;
  claim uuid;
  claim_version integer;
begin
  -- JWT role/sub are supplied by PostgREST ONLY AFTER cryptographic
  -- verification. Direct SQL can inject test claims and is not identity proof.
  claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  if claims->>'role' is distinct from 'social_schedule_broker_intent_fixture'
     or jsonb_typeof(p_claim) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_claim))<>3
     or not (p_claim ?& array['jobId','claimId','version'])
  then raise exception 'BROKER_INTENT_SCOPE_DENIED' using errcode='42501'; end if;
  begin
    job:=(p_claim->>'jobId')::uuid;
    claim:=(p_claim->>'claimId')::uuid;
    claim_version:=(p_claim->>'version')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'BROKER_INTENT_SCOPE_DENIED' using errcode='42501';
  end;
  if job is null or claim is null or claim_version is null or claim_version<1
     or p_publication_id is null
  then raise exception 'BROKER_INTENT_SCOPE_DENIED' using errcode='42501'; end if;

  select project_id into project from public.social_schedule_jobs where id=job;
  if project is null then
    raise exception 'BROKER_INTENT_SCOPE_DENIED' using errcode='42501';
  end if;
  perform public.social_schedule_rpc_check_project_fixture(project);
  -- Includes the signed job claim, lease, approved source, stop and
  -- source-version checks from the canonical scoped schedule path.
  snapshot:=public.social_schedule_authorize_write(
    p_claim,jsonb_build_array(project::text));
  if snapshot->>'projectId' is distinct from project::text
     or snapshot->'publication'->>'id' is distinct from p_publication_id::text
     or snapshot->'publication'->>'jobId' is distinct from job::text
     or snapshot->'publication'->>'authoritySource' is distinct from 'scheduled'
     or snapshot->'publication'->>'state' is distinct from 'publishing'
     or snapshot->'item'->>'channel' is distinct from 'facebook'
     or snapshot->'revision'->'draft'->>'format' is distinct from 'image'
     or snapshot->'publication'->>'accountId'
        is distinct from snapshot->'item'->>'accountId'
     or snapshot->'publication'->>'bindingId'
        is distinct from snapshot->'item'->>'bindingId'
  then raise exception 'BROKER_INTENT_SCOPE_DENIED' using errcode='42501'; end if;

  insert into public.social_schedule_dispatch_intents_fixture(
    job_id,publication_id,project_id,claim_id,approval_id,
    manifest_sha256,binding_id,account_id,asset_id,asset_sha256
  ) values(
    job,p_publication_id,project,claim,
    (snapshot->>'approvalId')::uuid,
    snapshot->>'manifestSha256',
    (snapshot->'item'->>'bindingId')::uuid,
    snapshot->'item'->>'accountId',
    (snapshot->'item'->'asset'->>'id')::uuid,
    snapshot->'item'->'asset'->>'sha256'
  ) on conflict do nothing
  returning true into inserted;
  return coalesce(inserted,false);
end $fn$;

-- No default EXECUTE, including the broad service and scheduled worker.
revoke all on function public.social_schedule_dispatch_try_begin_fixture(jsonb,uuid)
  from public,anon,authenticated,service_role,social_schedule_rpc_only_fixture;
grant execute on function public.social_schedule_dispatch_try_begin_fixture(jsonb,uuid)
  to social_schedule_broker_intent_fixture;
