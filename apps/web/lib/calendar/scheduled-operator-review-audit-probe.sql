-- TEST ONLY: disposable PostgreSQL/PostgREST fixture, NEVER a deployment.
-- Operator observations are append-only human assertions, NOT Meta proofs.
-- Neither this function nor its role can finalize, retry or publish.
create role social_schedule_operator_review_fixture nologin nobypassrls;
grant usage on schema public to social_schedule_operator_review_fixture;

-- Seeded by fixture administrator only; do not infer operator identity from
-- caller-supplied input or editable user metadata.
create table public.social_schedule_operator_scope_fixture(
  operator_id uuid not null,
  project_id uuid not null,
  active boolean not null default false,
  primary key(operator_id,project_id)
);
alter table public.social_schedule_operator_scope_fixture enable row level security;
revoke all on public.social_schedule_operator_scope_fixture
 from public,anon,authenticated,service_role,
  social_schedule_rpc_only_fixture,social_schedule_broker_intent_fixture,
  social_schedule_broker_review_fixture,social_schedule_operator_review_fixture;

create table public.social_schedule_operator_review_events_fixture(
  event_id bigint generated always as identity primary key,
  request_id uuid not null unique,
  project_id uuid not null,
  job_id uuid not null,
  publication_id uuid not null,
  operator_id uuid not null,
  observation text not null check(observation in(
    'possible_match_observed','no_match_observed','review_deferred')),
  candidate_id text,
  evidence_class text not null default 'human_observation_only'
    check(evidence_class='human_observation_only'),
  provider_attested boolean not null default false check(not provider_attested),
  automatic_retry_allowed boolean not null default false check(not automatic_retry_allowed),
  recorded_at timestamptz not null default clock_timestamp(),
  check(
    observation='possible_match_observed' and candidate_id is not null
    or observation<>'possible_match_observed' and candidate_id is null
  )
);
alter table public.social_schedule_operator_review_events_fixture enable row level security;
revoke all on public.social_schedule_operator_review_events_fixture
 from public,anon,authenticated,service_role,
  social_schedule_rpc_only_fixture,social_schedule_broker_intent_fixture,
  social_schedule_broker_review_fixture,social_schedule_operator_review_fixture;

-- Even elevated accidental UPDATE/DELETE/TRUNCATE must fail in the replay.
-- A database superuser/owner can alter DDL; this is NOT WORM storage.
create function public.social_schedule_operator_review_immutable_fixture()
returns trigger language plpgsql set search_path='' as $immutable$
begin
 raise exception 'OPERATOR_REVIEW_APPEND_ONLY' using errcode='42501';
end $immutable$;
create trigger social_schedule_operator_review_no_update_fixture
 before update or delete on public.social_schedule_operator_review_events_fixture
 for each row execute function public.social_schedule_operator_review_immutable_fixture();
create trigger social_schedule_operator_review_no_truncate_fixture
 before truncate on public.social_schedule_operator_review_events_fixture
 for each statement execute function public.social_schedule_operator_review_immutable_fixture();
revoke all on function public.social_schedule_operator_review_immutable_fixture()
 from public,anon,authenticated,service_role,
  social_schedule_rpc_only_fixture,social_schedule_broker_intent_fixture,
  social_schedule_broker_review_fixture,social_schedule_operator_review_fixture;

create function public.social_schedule_operator_review_append_fixture(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $review$
declare
  claims jsonb;
  operator_user uuid;
  project uuid;
  job uuid;
  publication uuid;
  req uuid;
  observation text;
  candidate text;
  account text;
  event_id_result bigint;
  saved public.social_schedule_operator_review_events_fixture%rowtype;
begin
  claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  if claims->>'role' is distinct from 'social_schedule_operator_review_fixture'
     or claims->>'iss' is distinct from 'omnira-schedule-fixture'
     or claims->>'aud' is distinct from 'authenticated'
     or claims->>'sub' is null
     or claims->>'sub' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or jsonb_typeof(p_input) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_input))<>6
     or not (p_input ?& array[
       'projectId','jobId','publicationId','requestId','observation','candidateId'])
     or jsonb_typeof(p_input->'projectId') is distinct from 'string'
     or jsonb_typeof(p_input->'jobId') is distinct from 'string'
     or jsonb_typeof(p_input->'publicationId') is distinct from 'string'
     or jsonb_typeof(p_input->'requestId') is distinct from 'string'
     or jsonb_typeof(p_input->'observation') is distinct from 'string'
     or jsonb_typeof(p_input->'candidateId') not in ('string','null')
  then raise exception 'OPERATOR_REVIEW_SCOPE_DENIED' using errcode='42501'; end if;
  begin
    operator_user:=(claims->>'sub')::uuid;
    project:=(p_input->>'projectId')::uuid;
    job:=(p_input->>'jobId')::uuid;
    publication:=(p_input->>'publicationId')::uuid;
    req:=(p_input->>'requestId')::uuid;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'OPERATOR_REVIEW_SCOPE_DENIED' using errcode='42501';
  end;
  if operator_user is null or project is null or job is null
    or publication is null or req is null
  then raise exception 'OPERATOR_REVIEW_SCOPE_DENIED' using errcode='42501'; end if;
  observation:=p_input->>'observation';
  candidate:=p_input->>'candidateId';
  if observation not in ('possible_match_observed','no_match_observed','review_deferred')
    or observation='possible_match_observed' and candidate is null
    or observation<>'possible_match_observed' and candidate is not null
  then raise exception 'OPERATOR_REVIEW_SCOPE_DENIED' using errcode='42501'; end if;

  -- Independent membership is not configurable by the operator role.
  -- FOR SHARE prevents a concurrent administrator revocation from
  -- overtaking the append in this same transaction.
  perform 1 from public.social_schedule_operator_scope_fixture
    where operator_id=operator_user and project_id=project and active
    for share;
  if not found then
    raise exception 'OPERATOR_REVIEW_SCOPE_DENIED' using errcode='42501';
  end if;
  select intent.account_id into account
    from public.social_schedule_dispatch_intents_fixture intent
    join public.social_publications pub on pub.id=intent.publication_id
      and pub.project_id=intent.project_id and pub.post_id is not null
      and pub.authority_source='scheduled'
      and pub.channel='facebook'
      and pub.state in ('published','uncertain')
    where intent.job_id=job and intent.publication_id=publication
      and intent.project_id=project and intent.provider_outcome='unknown';
  if account is null then
    raise exception 'OPERATOR_REVIEW_SCOPE_DENIED' using errcode='42501';
  end if;
  if observation='possible_match_observed' and (
    account !~ '^[0-9]{1,80}$'
    or candidate !~ ('^'||account||'_[0-9]{1,80}$')
  ) then raise exception 'OPERATOR_REVIEW_SCOPE_DENIED' using errcode='42501'; end if;

  -- Append only, idempotent by request UUID; a reused UUID with a
  -- DIFFERENT body is denied instead of overwriting an earlier note.
  insert into public.social_schedule_operator_review_events_fixture(
    request_id,project_id,job_id,publication_id,operator_id,
    observation,candidate_id
  ) values(req,project,job,publication,operator_user,observation,candidate)
  on conflict(request_id) do nothing
  returning event_id into event_id_result;
  if event_id_result is null then
    select * into saved from public.social_schedule_operator_review_events_fixture
      where request_id=req;
    if not found or saved.project_id<>project or saved.job_id<>job
      or saved.publication_id<>publication or saved.operator_id<>operator_user
      or saved.observation<>observation
      or saved.candidate_id is distinct from candidate
    then raise exception 'OPERATOR_REVIEW_IDEMPOTENCY_CONFLICT' using errcode='42501'; end if;
    event_id_result:=saved.event_id;
  end if;
  return jsonb_build_object(
    'eventId',event_id_result,
    'observation',observation,
    'evidenceClass','human_observation_only',
    'providerOutcome','unknown',
    'providerAttested',false,
    'automaticRetryAllowed',false,
    'canFinalize',false,
    'canPublish',false
  );
end $review$;
revoke all on function public.social_schedule_operator_review_append_fixture(jsonb)
 from public,anon,authenticated,service_role,
  social_schedule_rpc_only_fixture,social_schedule_broker_intent_fixture,
  social_schedule_broker_review_fixture;
grant execute on function public.social_schedule_operator_review_append_fixture(jsonb)
 to social_schedule_operator_review_fixture;
