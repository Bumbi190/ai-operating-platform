-- TEST ONLY. Compatibility candidate for hosted Supabase's existing
-- role='authenticated' user JWT, with an independent, live session check.
-- Installed only in the disposable cross-tree Docker replay; NEVER deploy.
--
-- This deliberately exposes narrow SECURITY DEFINER RPCs to the shared
-- authenticated role. Every invocation MUST reauthorize a verified native
-- session, active operator membership, exact project/job/publication and
-- immutable dispatch intent. Unlike the custom-role OIDC candidate, this
-- approach needs no separate issuer but has a larger exposed API surface.
--
-- Synthetic auth.sessions bootstrap (minimal columns, NOT a GoTrue mirror).
create table if not exists auth.sessions(
 id uuid primary key, user_id uuid not null,
 not_after timestamptz
);
alter table auth.sessions enable row level security;
revoke all on auth.sessions from public, anon, authenticated;

create function public.social_schedule_native_operator_guard_fixture(p_project uuid)
returns uuid language plpgsql security definer set search_path='' as $guard$
declare
 claims jsonb;
 actor uuid;
 session uuid;
begin
 claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 if claims->>'role' is distinct from 'authenticated'
    or claims->>'iss' is distinct from 'omnira-schedule-fixture'
    or claims->>'aud' is distinct from 'authenticated'
    or claims->>'is_anonymous' is distinct from 'false'
    or claims->>'sub' is null
    or claims->>'session_id' is null
    or claims->>'sub' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or claims->>'session_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_project is null
 then raise exception 'NATIVE_OPERATOR_SESSION_DENIED' using errcode='42501'; end if;
 actor:=(claims->>'sub')::uuid;
 session:=(claims->>'session_id')::uuid;
 -- Project membership cannot be selected from user-editable JWT claims.
 -- If a session is revoked/deleted or has expired, even a still-valid
 -- JWT cannot call the protected observation RPCs. Row locks serialize
 -- concurrent revocation and audit append in the same transaction.
 perform 1 from auth.sessions
 where id=session and user_id=actor
   and (not_after is null or not_after>clock_timestamp())
 for share;
 if not found then
  raise exception 'NATIVE_OPERATOR_SESSION_DENIED' using errcode='42501';
 end if;
 perform 1 from public.social_schedule_operator_scope_fixture
 where operator_id=actor and project_id=p_project and active
 for share;
 if not found then
  raise exception 'NATIVE_OPERATOR_SESSION_DENIED' using errcode='42501';
 end if;
 return actor;
end $guard$;
-- A nested, privileged helper must NEVER be directly callable by users.
revoke all on function public.social_schedule_native_operator_guard_fixture(uuid)
 from public,anon,authenticated,service_role,
 social_schedule_rpc_only_fixture,
 social_schedule_broker_intent_fixture,
 social_schedule_broker_review_fixture,
 social_schedule_operator_review_fixture;

create function public.social_schedule_native_operator_history_fixture(
 p_project_id uuid,p_job_id uuid,p_publication_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $history$
declare
 operator_user uuid;
 entries jsonb;
begin
 operator_user:=public.social_schedule_native_operator_guard_fixture(p_project_id);
 if p_job_id is null or p_publication_id is null
   or not exists(
    select 1 from public.social_schedule_dispatch_intents_fixture
    where project_id=p_project_id and job_id=p_job_id
      and publication_id=p_publication_id and provider_outcome='unknown')
 then raise exception 'NATIVE_OPERATOR_SCOPE_DENIED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'eventId',recent.event_id,'operatorId',recent.operator_id,
   'recordedAt',recent.recorded_at,'observation',recent.observation,
   'candidateId',recent.candidate_id,
   'evidenceClass','human_observation_only',
   'providerAttested',false
 ) order by recent.event_id desc),'[]'::jsonb) into entries
 from (
  select event_id,operator_id,recorded_at,observation,candidate_id
  from public.social_schedule_operator_review_events_fixture
  where project_id=p_project_id and job_id=p_job_id
    and publication_id=p_publication_id
  order by event_id desc limit 25
 ) recent;
 return jsonb_build_object(
   'projectId',p_project_id,'jobId',p_job_id,
   'publicationId',p_publication_id,
   'providerOutcome','unknown','automaticRetryAllowed',false,
   'canFinalize',false,'canPublish',false,
   'limitReached',jsonb_array_length(entries)=25,'items',entries
 );
end $history$;
revoke all on function public.social_schedule_native_operator_history_fixture(uuid,uuid,uuid)
 from public,anon,service_role,social_schedule_rpc_only_fixture,
 social_schedule_broker_intent_fixture,
 social_schedule_broker_review_fixture,
 social_schedule_operator_review_fixture;
grant execute on function public.social_schedule_native_operator_history_fixture(uuid,uuid,uuid)
 to authenticated;

create function public.social_schedule_native_operator_append_fixture(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $append$
declare
 actor uuid;
 project uuid;
 job uuid;
 publication uuid;
 req uuid;
 obs text;
 candidate text;
 account text;
 event_result bigint;
 saved public.social_schedule_operator_review_events_fixture%rowtype;
begin
 if jsonb_typeof(p_input) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_input))<>6
    or not (p_input ?& array['projectId','jobId','publicationId',
       'requestId','observation','candidateId'])
    or jsonb_typeof(p_input->'projectId') is distinct from 'string'
    or jsonb_typeof(p_input->'jobId') is distinct from 'string'
    or jsonb_typeof(p_input->'publicationId') is distinct from 'string'
    or jsonb_typeof(p_input->'requestId') is distinct from 'string'
    or jsonb_typeof(p_input->'observation') is distinct from 'string'
    or jsonb_typeof(p_input->'candidateId') not in ('string','null')
 then raise exception 'NATIVE_OPERATOR_SCOPE_DENIED' using errcode='42501'; end if;
 begin
  project:=(p_input->>'projectId')::uuid;
  job:=(p_input->>'jobId')::uuid;
  publication:=(p_input->>'publicationId')::uuid;
  req:=(p_input->>'requestId')::uuid;
 exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'NATIVE_OPERATOR_SCOPE_DENIED' using errcode='42501';
 end;
 if project is null or job is null or publication is null or req is null
 then raise exception 'NATIVE_OPERATOR_SCOPE_DENIED' using errcode='42501'; end if;
 actor:=public.social_schedule_native_operator_guard_fixture(project);
 obs:=p_input->>'observation';
 candidate:=p_input->>'candidateId';
 if obs not in ('possible_match_observed','no_match_observed','review_deferred')
  or obs='possible_match_observed' and candidate is null
  or obs<>'possible_match_observed' and candidate is not null
 then raise exception 'NATIVE_OPERATOR_SCOPE_DENIED' using errcode='42501'; end if;
 select intent.account_id into account
 from public.social_schedule_dispatch_intents_fixture intent
 join public.social_publications pub
   on pub.id=intent.publication_id and pub.project_id=intent.project_id
   and pub.authority_source='scheduled' and pub.channel='facebook'
   and pub.state in ('published','uncertain') and pub.post_id is not null
 where intent.project_id=project and intent.job_id=job
   and intent.publication_id=publication
   and intent.provider_outcome='unknown';
 if account is null
 then raise exception 'NATIVE_OPERATOR_SCOPE_DENIED' using errcode='42501'; end if;
 if obs='possible_match_observed'
   and (account !~ '^[0-9]{1,80}$'
     or candidate !~ ('^'||account||'_[0-9]{1,80}$'))
 then raise exception 'NATIVE_OPERATOR_SCOPE_DENIED' using errcode='42501'; end if;

 insert into public.social_schedule_operator_review_events_fixture(
  request_id,project_id,job_id,publication_id,
  operator_id,observation,candidate_id
 ) values(req,project,job,publication,actor,obs,candidate)
 on conflict(request_id) do nothing returning event_id into event_result;
 if event_result is null then
  select * into saved from public.social_schedule_operator_review_events_fixture
  where request_id=req;
  if not found or saved.project_id<>project or saved.job_id<>job
     or saved.publication_id<>publication or saved.operator_id<>actor
     or saved.observation<>obs or saved.candidate_id is distinct from candidate
  then raise exception 'NATIVE_OPERATOR_IDEMPOTENCY_CONFLICT' using errcode='42501'; end if;
  event_result:=saved.event_id;
 end if;
 return jsonb_build_object(
  'eventId',event_result,'observation',obs,
  'evidenceClass','human_observation_only',
  'providerOutcome','unknown','providerAttested',false,
  'automaticRetryAllowed',false,'canFinalize',false,'canPublish',false
 );
end $append$;
revoke all on function public.social_schedule_native_operator_append_fixture(jsonb)
 from public,anon,service_role,social_schedule_rpc_only_fixture,
 social_schedule_broker_intent_fixture,social_schedule_broker_review_fixture,
 social_schedule_operator_review_fixture;
grant execute on function public.social_schedule_native_operator_append_fixture(jsonb)
 to authenticated;
