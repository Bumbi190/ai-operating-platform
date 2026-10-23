-- TEST ONLY. Read-only, project- and signed-operator-scoped history of human
-- observations from the isolated audit fixture. This function is NOT a
-- deployable migration and cannot verify Meta, finalize or retry a post.
create function public.social_schedule_operator_review_history_fixture(
 p_project_id uuid,p_job_id uuid,p_publication_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $history$
declare
 claims jsonb;
 operator_user uuid;
 entries jsonb;
begin
 claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 if claims->>'role' is distinct from 'social_schedule_operator_review_fixture'
    or claims->>'iss' is distinct from 'omnira-schedule-fixture'
    or claims->>'aud' is distinct from 'authenticated'
    or claims->>'sub' is null
    or claims->>'sub' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_project_id is null or p_job_id is null or p_publication_id is null
 then raise exception 'OPERATOR_REVIEW_SCOPE_DENIED' using errcode='42501'; end if;
 operator_user:=(claims->>'sub')::uuid;
 if not exists(select 1 from public.social_schedule_operator_scope_fixture
   where operator_id=operator_user and project_id=p_project_id and active)
   or not exists(
     select 1 from public.social_schedule_dispatch_intents_fixture
     where project_id=p_project_id and job_id=p_job_id
       and publication_id=p_publication_id and provider_outcome='unknown')
 then raise exception 'OPERATOR_REVIEW_SCOPE_DENIED' using errcode='42501'; end if;

 select coalesce(jsonb_agg(jsonb_build_object(
   'eventId',recent.event_id,
   'operatorId',recent.operator_id,
   'recordedAt',recent.recorded_at,
   'observation',recent.observation,
   'candidateId',recent.candidate_id,
   'evidenceClass','human_observation_only',
   'providerAttested',false
 ) order by recent.event_id desc),'[]'::jsonb) into entries
 from (
  select event_id,operator_id,recorded_at,observation,candidate_id
  from public.social_schedule_operator_review_events_fixture
  where project_id=p_project_id and job_id=p_job_id and publication_id=p_publication_id
  order by event_id desc limit 25
 ) recent;
 return jsonb_build_object(
   'projectId',p_project_id,'jobId',p_job_id,'publicationId',p_publication_id,
   'providerOutcome','unknown','automaticRetryAllowed',false,
   'canFinalize',false,'canPublish',false,
   'limitReached',jsonb_array_length(entries)=25,
   'items',entries
 );
end $history$;
revoke all on function public.social_schedule_operator_review_history_fixture(uuid,uuid,uuid)
 from public,anon,authenticated,service_role,
 social_schedule_rpc_only_fixture,social_schedule_broker_intent_fixture,
 social_schedule_broker_review_fixture;
grant execute on function public.social_schedule_operator_review_history_fixture(uuid,uuid,uuid)
 to social_schedule_operator_review_fixture;
