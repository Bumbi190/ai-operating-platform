-- P13 dormant creative worker enrollment staging.
-- No worker enabled, no keys generated, no deployment, no public route.
-- Operator identity must be resolved via trusted Supabase session BEFORE
-- the server calls the issuance primitive. NOT APPLIED to any project.
begin;

create table public.atlas_creative_enrollment_staging (
  enrollment_id uuid primary key,
  worker_id text not null
    check (worker_id ~ '^[A-Za-z][A-Za-z0-9_-]{2,63}$'),
  requested_by uuid not null,
  project_ids uuid[] not null check (
    cardinality(project_ids) between 1 and 16
    and array_position(project_ids,null) is null
  ),
  challenge_sha256 text not null unique
    check (challenge_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  state text not null default 'issued' check(
    state in ('issued','pending_review','rejected','expired')
  ),
  key_id text check(key_id is null or key_id ~ '^[A-Za-z][A-Za-z0-9_-]{2,63}$'),
  public_key_spki_pem text check(
    public_key_spki_pem is null or
    length(public_key_spki_pem) between 80 and 3000
  ),
  public_key_sha256 text check (
    public_key_sha256 is null or public_key_sha256 ~ '^[a-f0-9]{64}$'
  ),
  canonical_proof_sha256 text unique check (
    canonical_proof_sha256 is null or
    canonical_proof_sha256 ~ '^[a-f0-9]{64}$'
  ),
  proof_verified_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint creative_enrollment_window check (
    expires_at > created_at
    and expires_at <= created_at + interval '5 minutes'
  ),
  constraint creative_enrollment_projection check (
    (
      state='issued' and key_id is null
      and public_key_spki_pem is null and public_key_sha256 is null
      and canonical_proof_sha256 is null and proof_verified_at is null
    ) or (
      state='pending_review' and key_id is not null
      and public_key_spki_pem is not null and public_key_sha256 is not null
      and canonical_proof_sha256 is not null and proof_verified_at is not null
    ) or (
      state in ('rejected','expired')
    )
  )
);
create unique index creative_enrollment_one_issued_per_worker
  on public.atlas_creative_enrollment_staging(worker_id)
  where state='issued';

alter table public.atlas_creative_enrollment_staging enable row level security;
revoke all on public.atlas_creative_enrollment_staging
  from public, anon, authenticated, service_role;
grant select on public.atlas_creative_enrollment_staging to service_role;
-- Direct insert, update and delete are NOT granted to the API.

create function public.atlas_creative_enrollment_issue_p13(
  p_enrollment_id uuid,p_worker_id text,p_requested_by uuid,
  p_project_ids uuid[],p_challenge_sha256 text,p_expires_at timestamptz
)
returns boolean language plpgsql security definer set search_path='' as $fn$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
    or p_enrollment_id is null or p_requested_by is null
    or p_worker_id is null or p_worker_id !~ '^[A-Za-z][A-Za-z0-9_-]{2,63}$'
    or p_project_ids is null or cardinality(p_project_ids) not between 1 and 16
    or array_position(p_project_ids,null) is not null
    or p_challenge_sha256 is null or p_challenge_sha256 !~ '^[a-f0-9]{64}$'
    or p_expires_at is null
    or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp()+interval '5 minutes'
  then return false; end if;

  -- The API must prove p_requested_by is the authenticated platform operator
  -- and every project in p_project_ids is authorized. SQL does NOT infer
  -- operator approval from service_role alone.
  insert into public.atlas_creative_enrollment_staging (
    enrollment_id,worker_id,requested_by,project_ids,
    challenge_sha256,expires_at
  ) values (
    p_enrollment_id,p_worker_id,p_requested_by,p_project_ids,
    p_challenge_sha256,p_expires_at
  );
  return true;
exception when unique_violation then return false;
end;
$fn$;

create function public.atlas_creative_enrollment_stage_p13(
  p_enrollment_id uuid,p_worker_id text,p_requested_by uuid,
  p_project_ids uuid[],p_challenge_sha256 text,p_expires_at timestamptz,
  p_key_id text,p_public_key_spki_pem text,p_public_key_sha256 text,
  p_canonical_proof_sha256 text
)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare v public.atlas_creative_enrollment_staging%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
    or p_enrollment_id is null or p_worker_id is null or p_requested_by is null
    or p_project_ids is null or cardinality(p_project_ids) not between 1 and 16
    or array_position(p_project_ids,null) is not null
    or p_challenge_sha256 is null or p_challenge_sha256 !~ '^[a-f0-9]{64}$'
    or p_key_id is null or p_key_id !~ '^[A-Za-z][A-Za-z0-9_-]{2,63}$'
    or p_public_key_spki_pem is null
    or length(p_public_key_spki_pem) not between 80 and 3000
    or p_public_key_sha256 is null
    or p_public_key_sha256 !~ '^[a-f0-9]{64}$'
    or p_canonical_proof_sha256 is null
    or p_canonical_proof_sha256 !~ '^[a-f0-9]{64}$'
    or p_expires_at is null
  then return false; end if;

  select * into v from public.atlas_creative_enrollment_staging
    where enrollment_id=p_enrollment_id for update;
  if not found or v.state is distinct from 'issued'
    or v.worker_id is distinct from p_worker_id
    or v.requested_by is distinct from p_requested_by
    or v.challenge_sha256 is distinct from p_challenge_sha256
    or v.expires_at is distinct from p_expires_at
    or v.expires_at <= clock_timestamp()
    or v.created_at > clock_timestamp()
    or v.project_ids is distinct from p_project_ids
  then return false; end if;

  -- Only a PRE-VERIFIED proof from server code may arrive here.
  -- This function DOES NOT verify the P-256 signature or make it active.
  update public.atlas_creative_enrollment_staging
    set state='pending_review',key_id=p_key_id,
      public_key_spki_pem=p_public_key_spki_pem,
      public_key_sha256=p_public_key_sha256,
      canonical_proof_sha256=p_canonical_proof_sha256,
      proof_verified_at=clock_timestamp()
    where enrollment_id=p_enrollment_id;
  return true;
exception when unique_violation then return false;
end;
$fn$;

revoke all on function public.atlas_creative_enrollment_issue_p13(
  uuid,text,uuid,uuid[],text,timestamptz
) from public,anon,authenticated,service_role;
grant execute on function public.atlas_creative_enrollment_issue_p13(
  uuid,text,uuid,uuid[],text,timestamptz
) to service_role;
revoke all on function public.atlas_creative_enrollment_stage_p13(
  uuid,text,uuid,uuid[],text,timestamptz,text,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.atlas_creative_enrollment_stage_p13(
  uuid,text,uuid,uuid[],text,timestamptz,text,text,text,text
) to service_role;

-- No path to worker active state exists in P13.
commit;
