-- P18: augment P15 human review with atomic project ownership under a
-- PostgreSQL row lock; revoke direct service-role access to the older P15 RPC.
-- NO HTTP route, no approval UI action, no worker activation. NOT APPLIED.
begin;

create function public.atlas_creative_enrollment_record_review_p18(
  p_enrollment_id uuid,
  p_reviewer_user_id uuid,
  p_decision text,
  p_key_sha256 text,
  p_proof_sha256 text,
  p_project_ids uuid[],
  p_review_nonce_sha256 text,
  p_reason_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_owners uuid[];
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
    or p_reviewer_user_id is null
    or p_project_ids is null
    or cardinality(p_project_ids) not between 1 and 16
    or array_position(p_project_ids,null) is not null
    or p_project_ids <> array(select distinct x from unnest(p_project_ids) as x order by x)
  then return false; end if;

  -- This is NOT an operator-identity check. The trusted server MUST derive
  -- reviewer_user_id from a live authenticated platform-operator session.
  -- Lock all required project rows with FOR SHARE so a concurrent ownership
  -- change cannot race past this decision during the current transaction.
  select array_agg(locked.id order by locked.id) into v_owners
  from (
    select p.id from public.projects p
    where p.id=any(p_project_ids)
      and p.owner_id=p_reviewer_user_id
    for share
  ) locked;

  if v_owners is distinct from p_project_ids then return false; end if;

  -- P15 continues to verify pending status, pinned key and proof SHA-256,
  -- exact project list and one immutable decision under the enrollment lock.
  return public.atlas_creative_enrollment_record_review_p15(
    p_enrollment_id,p_reviewer_user_id,p_decision,
    p_key_sha256,p_proof_sha256,p_project_ids,
    p_review_nonce_sha256,p_reason_code
  );
end;
$fn$;

-- Remove the older, weaker callable boundary. P18 becomes the only
-- public-schema RPC that service_role may execute for review decisions.
revoke execute on function public.atlas_creative_enrollment_record_review_p15(
  uuid,uuid,text,text,text,uuid[],text,text
) from service_role;
revoke all on function public.atlas_creative_enrollment_record_review_p18(
  uuid,uuid,text,text,text,uuid[],text,text
) from public,anon,authenticated,service_role;
grant execute on function public.atlas_creative_enrollment_record_review_p18(
  uuid,uuid,text,text,text,uuid[],text,text
) to service_role;

-- No identity UPDATE, account activation, command execution, publication.
commit;
