-- Human-approved dashboard read: atomic quota reservation and safe audit.
-- No PostHog credentials or provider data are stored.
begin;
create table public.atlas_posthog_read_events (
  event_id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  outcome text not null check (outcome in ('reserved','succeeded','failed')),
  project_id uuid not null references public.projects(id),
  principal_id uuid not null,
  authorization_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null default clock_timestamp()
);
create unique index atlas_posthog_read_one_reservation on public.atlas_posthog_read_events(attempt_id) where outcome='reserved';
create unique index atlas_posthog_read_one_outcome on public.atlas_posthog_read_events(attempt_id) where outcome<>'reserved';
create index atlas_posthog_read_quota on public.atlas_posthog_read_events(project_id,occurred_at) where outcome='reserved';
alter table public.atlas_posthog_read_events enable row level security;
revoke all on public.atlas_posthog_read_events from public,anon,authenticated,service_role;
grant select on public.atlas_posthog_read_events to service_role;

create function public.atlas_posthog_read_reject_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'posthog_read_audit_immutable' using errcode='23001'; end;
$$;
create trigger atlas_posthog_read_immutable before update or delete or truncate
on public.atlas_posthog_read_events for each statement
execute function public.atlas_posthog_read_reject_mutation();
revoke all on function public.atlas_posthog_read_reject_mutation() from public,anon,authenticated;

create function public.atlas_posthog_reserve_read(
  p_project_id uuid, p_principal_id uuid, p_authorization_id uuid,
  p_request_hash text, p_authorization_event_ids uuid[]
) returns uuid language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare
  v_ids uuid[];
  v_now timestamptz;
  v_attempt uuid;
begin
  if p_project_id is null or p_principal_id is null or p_authorization_id is null or
     p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' or
     coalesce(cardinality(p_authorization_event_ids),0) <> 2 then
    raise exception 'posthog_read_not_authorized';
  end if;
  -- Freeze the V1 chain during reservation; this is a short local transaction.
  lock table public.atlas_authorizations in share mode;
  perform 1 from public.projects where id=p_project_id and owner_id=p_principal_id for share;
  if not found then raise exception 'posthog_read_not_authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended('posthog_read:'||p_project_id::text,0));
  v_now := clock_timestamp();
  select array_agg(event_id order by event_id) into v_ids from public.atlas_authorizations
    where authorization_id=p_authorization_id;
  if v_ids is null or v_ids is distinct from
    (select array_agg(x order by x) from unnest(p_authorization_event_ids) x) or
    (select count(*) from public.atlas_authorizations where authorization_id=p_authorization_id and event_type='requested') <> 1 or
    (select count(*) from public.atlas_authorizations where authorization_id=p_authorization_id and event_type='granted'
       and expires_at > v_now + interval '5 seconds') <> 1 or
    exists (select 1 from public.atlas_authorizations where authorization_id=p_authorization_id and (
      project_id is distinct from p_project_id or principal_id is distinct from p_principal_id or
      authority_basis is distinct from 'founder_owner' or
      action_kind is distinct from 'analytics.posthog.dashboards.read' or
      target_type is distinct from 'posthog_dashboard_read' or
      target_id is distinct from p_project_id::text or target_version_hash is distinct from p_request_hash or
      conditions is distinct from '[]'::jsonb or occurred_at > v_now or event_type not in ('requested','granted')
    )) or
    (select occurred_at from public.atlas_authorizations where authorization_id=p_authorization_id and event_type='requested') >
    (select occurred_at from public.atlas_authorizations where authorization_id=p_authorization_id and event_type='granted') then
    raise exception 'posthog_read_not_authorized';
  end if;
  if (select count(*) from public.atlas_posthog_read_events
      where project_id=p_project_id and outcome='reserved' and occurred_at>v_now-interval '60 seconds') >= 3 or
     (select count(*) from public.atlas_posthog_read_events where project_id=p_project_id and outcome='reserved'
      and occurred_at >= (date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC')) >= 20 then
    raise exception 'posthog_read_quota_exceeded';
  end if;
  v_attempt := gen_random_uuid();
  insert into public.atlas_posthog_read_events(attempt_id,outcome,project_id,principal_id,authorization_id,request_hash)
    values(v_attempt,'reserved',p_project_id,p_principal_id,p_authorization_id,p_request_hash);
  return v_attempt;
end;
$$;
revoke all on function public.atlas_posthog_reserve_read(uuid,uuid,uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.atlas_posthog_reserve_read(uuid,uuid,uuid,text,uuid[]) to service_role;

create function public.atlas_posthog_finish_read(p_attempt_id uuid,p_principal_id uuid,p_outcome text)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare v_event public.atlas_posthog_read_events%rowtype; v_prior text;
begin
  if p_attempt_id is null or p_principal_id is null or p_outcome is null or p_outcome not in ('succeeded','failed') then
    raise exception 'posthog_read_invalid_outcome';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('posthog_finish:'||p_attempt_id::text,0));
  select * into v_event from public.atlas_posthog_read_events where attempt_id=p_attempt_id and outcome='reserved';
  if not found or v_event.principal_id is distinct from p_principal_id then raise exception 'posthog_read_unknown_attempt'; end if;
  select outcome into v_prior from public.atlas_posthog_read_events where attempt_id=p_attempt_id and outcome<>'reserved';
  if found then
    if v_prior is distinct from p_outcome then raise exception 'posthog_read_outcome_conflict'; end if;
    return true;
  end if;
  insert into public.atlas_posthog_read_events(attempt_id,outcome,project_id,principal_id,authorization_id,request_hash)
    values(p_attempt_id,p_outcome,v_event.project_id,v_event.principal_id,v_event.authorization_id,v_event.request_hash);
  return true;
end;
$$;
revoke all on function public.atlas_posthog_finish_read(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.atlas_posthog_finish_read(uuid,uuid,text) to service_role;
comment on table public.atlas_posthog_read_events is 'Append-only audit and shared quotas for exact human-approved PostHog metadata reads. No provider data.';
commit;
