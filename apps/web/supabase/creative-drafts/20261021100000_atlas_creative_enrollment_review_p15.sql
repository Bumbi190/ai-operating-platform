-- P15: operator review decision evidence only. NOT a worker activation.
-- Depends on unapplied P10/P13. Do NOT deploy without security review.
begin;

create table public.atlas_creative_enrollment_review_decisions (
  enrollment_id uuid primary key
    references public.atlas_creative_enrollment_staging(enrollment_id)
    on delete restrict,
  reviewer_user_id uuid not null,
  decision text not null
    check (decision in ('approve_registration_only','reject_registration')),
  key_sha256 text not null check (key_sha256 ~ '^[a-f0-9]{64}$'),
  proof_sha256 text not null check (proof_sha256 ~ '^[a-f0-9]{64}$'),
  project_ids uuid[] not null check (
    cardinality(project_ids) between 1 and 16
    and array_position(project_ids,null) is null
  ),
  review_nonce_sha256 text not null unique
    check (review_nonce_sha256 ~ '^[a-f0-9]{64}$'),
  reason_code text not null
    check (reason_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  reviewed_at timestamptz not null default clock_timestamp()
);
alter table public.atlas_creative_enrollment_review_decisions enable row level security;
revoke all on public.atlas_creative_enrollment_review_decisions
 from public, anon, authenticated, service_role;
grant select on public.atlas_creative_enrollment_review_decisions to service_role;

create function public.atlas_creative_enrollment_record_review_p15(
  p_enrollment_id uuid,
  p_reviewer_user_id uuid,
  p_decision text,
  p_key_sha256 text,
  p_proof_sha256 text,
  p_project_ids uuid[],
  p_review_nonce_sha256 text,
  p_reason_code text
)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare v public.atlas_creative_enrollment_staging%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
    or p_enrollment_id is null or p_reviewer_user_id is null
    or p_decision is null or p_decision not in
      ('approve_registration_only','reject_registration')
    or p_key_sha256 is null or p_key_sha256 !~ '^[a-f0-9]{64}$'
    or p_proof_sha256 is null or p_proof_sha256 !~ '^[a-f0-9]{64}$'
    or p_project_ids is null
    or cardinality(p_project_ids) not between 1 and 16
    or array_position(p_project_ids,null) is not null
    or p_review_nonce_sha256 is null
    or p_review_nonce_sha256 !~ '^[a-f0-9]{64}$'
    or p_reason_code is null
    or p_reason_code !~ '^[a-z][a-z0-9_]{2,63}$'
  then return false; end if;

  -- The trusted server MUST verify p_reviewer_user_id from the live session,
  -- its platform-operator status and exact project permissions. A service
  -- role alone is NOT operator approval. SQL can only recheck pinned evidence.
  select * into v from public.atlas_creative_enrollment_staging
    where enrollment_id=p_enrollment_id for update;

  if not found or v.state is distinct from 'pending_review'
    or v.public_key_sha256 is distinct from p_key_sha256
    or v.canonical_proof_sha256 is distinct from p_proof_sha256
    or v.proof_verified_at is null
    or v.project_ids is distinct from p_project_ids
  then return false; end if;

  insert into public.atlas_creative_enrollment_review_decisions(
    enrollment_id,reviewer_user_id,decision,key_sha256,proof_sha256,
    project_ids,review_nonce_sha256,reason_code
  ) values (
    p_enrollment_id,p_reviewer_user_id,p_decision,
    p_key_sha256,p_proof_sha256,p_project_ids,
    p_review_nonce_sha256,p_reason_code
  );
  return true;
exception when unique_violation then return false;
end;
$fn$;

revoke all on function public.atlas_creative_enrollment_record_review_p15(
  uuid,uuid,text,text,text,uuid[],text,text
) from public,anon,authenticated,service_role;
grant execute on function public.atlas_creative_enrollment_record_review_p15(
  uuid,uuid,text,text,text,uuid[],text,text
) to service_role;

-- This migration has NO UPDATE on identities, no worker account enablement,
-- no job claim, no media process execution, and no publishing primitive.
commit;
