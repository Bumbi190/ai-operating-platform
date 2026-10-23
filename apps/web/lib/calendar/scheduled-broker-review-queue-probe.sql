-- TEST ONLY. Read-only review projection for the isolated durable
-- Facebook dispatch-intent replay. Not a migration or a release gate.
--
-- Database job state (even "published") is NOT authenticated provider
-- evidence. The original provider outcome remains UNKNOWN and automatic
-- retries stay forbidden until a separately reviewed reconciliation.
create role social_schedule_broker_review_fixture nologin nobypassrls;
grant usage on schema public to social_schedule_broker_review_fixture;
revoke all on public.social_schedule_dispatch_intents_fixture
  from social_schedule_broker_review_fixture;

create function public.social_schedule_dispatch_review_fixture(p_project_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $review$
declare
  claims jsonb;
  items jsonb;
begin
  -- PostgREST verifies the RS256 signature and selects this NOLOGIN
  -- role. The owner function still performs project authorization.
  claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  if claims->>'role' is distinct from 'social_schedule_broker_review_fixture'
     or p_project_id is null
  then
    raise exception 'BROKER_REVIEW_SCOPE_DENIED' using errcode='42501';
  end if;
  perform public.social_schedule_rpc_check_project_fixture(p_project_id);
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'jobId', entries.job_id,
      'publicationId', entries.publication_id,
      'reservedAt', entries.reserved_at,
      'databaseJobState', entries.database_job_state,
      'postId', entries.post_id,
      'publicationState', entries.publication_state,
      'providerOutcome', 'unknown',
      'reviewStatus', 'needs_authenticated_meta_evidence',
      'automaticRetryAllowed', false
    ) order by entries.reserved_at,entries.job_id
  ),'[]'::jsonb) into items
  from (
    select intent.job_id,intent.publication_id,intent.reserved_at,
      coalesce(job.state::text,'missing') as database_job_state,
      publication.post_id,coalesce(publication.state::text,'missing') as publication_state
    from public.social_schedule_dispatch_intents_fixture intent
    left join public.social_schedule_jobs job
      on job.id=intent.job_id and job.project_id=intent.project_id
    left join public.social_publications publication
      on publication.id=intent.publication_id and publication.project_id=intent.project_id
    where intent.project_id=p_project_id
      and intent.provider_outcome='unknown'
    order by intent.reserved_at,intent.job_id
    limit 25
  ) entries;
  return jsonb_build_object(
    'projectId',p_project_id,
    'automaticRetryAllowed',false,
    -- This is review advice, NEVER an executable approval or publish action.
    'reviewAction','operator_review_provider_evidence',
    'pageLimit',25,
    'items',items
  );
end $review$;

-- SECURITY DEFINER functions have default PUBLIC execute unless revoked.
-- No broad service_role, scheduler or broker reservation access.
revoke all on function public.social_schedule_dispatch_review_fixture(uuid)
  from public,anon,authenticated,service_role,
       social_schedule_rpc_only_fixture,social_schedule_broker_intent_fixture;
grant execute on function public.social_schedule_dispatch_review_fixture(uuid)
  to social_schedule_broker_review_fixture;
