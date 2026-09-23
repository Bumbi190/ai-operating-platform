-- SDF-1C1: trusted broker identity and enrollment only.
--
-- This migration deliberately creates no claim, token, repository, worktree,
-- worker, command, model or deployment capability. Both tables are SERVER_ONLY;
-- the application reaches them through the purpose-specific functions granted
-- to service_role after authenticating the human or broker at the HTTP boundary.

begin;

create table public.atlas_code_broker_enrollments (
  enrollment_id uuid primary key,
  requested_by uuid not null,
  host_id uuid not null unique,
  challenge_hash text not null unique check (challenge_hash ~ '^[a-f0-9]{64}$'),
  pairing_code_hash text not null unique check (pairing_code_hash ~ '^[a-f0-9]{64}$'),
  allowed_repository_ids text[] not null,
  state text not null default 'issued'
    check (state in ('issued','proof_verified','approved','revoked','expired')),
  consumed_at timestamptz,
  broker_id uuid unique,
  proposed_host_label text,
  proposed_local_uid_hash text check (
    proposed_local_uid_hash is null or proposed_local_uid_hash ~ '^[a-f0-9]{64}$'
  ),
  proposed_os_version text,
  proposed_protocol_version integer,
  proposed_broker_version text,
  proposed_build_sha256 text check (
    proposed_build_sha256 is null or proposed_build_sha256 ~ '^[a-f0-9]{64}$'
  ),
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  constraint atlas_code_broker_enrollments_repository_check check (
    allowed_repository_ids = array['github.com/bumbi190/ai-operating-platform']::text[]
  ),
  constraint atlas_code_broker_enrollments_expiry_check check (expires_at > created_at),
  constraint atlas_code_broker_enrollments_state_shape_check check (
    (state = 'issued' and consumed_at is null and broker_id is null
      and proposed_host_label is null and proposed_local_uid_hash is null
      and proposed_os_version is null and proposed_protocol_version is null
      and proposed_broker_version is null and proposed_build_sha256 is null
      and approved_at is null and approved_by is null)
    or
    (state = 'proof_verified' and consumed_at is not null and broker_id is not null
      and proposed_host_label is not null and proposed_local_uid_hash is not null
      and proposed_os_version is not null and proposed_protocol_version is not null
      and proposed_broker_version is not null and proposed_build_sha256 is not null
      and approved_at is null and approved_by is null)
    or
    (state = 'approved' and consumed_at is not null and broker_id is not null
      and proposed_host_label is not null and proposed_local_uid_hash is not null
      and proposed_os_version is not null and proposed_protocol_version is not null
      and proposed_broker_version is not null and proposed_build_sha256 is not null
      and approved_at is not null and approved_by is not null)
    or
    (state in ('revoked','expired'))
  )
);

create table public.atlas_code_brokers (
  broker_id uuid primary key,
  enrollment_id uuid not null unique references public.atlas_code_broker_enrollments(enrollment_id) on delete restrict,
  owner_user_id uuid not null,
  host_id uuid not null unique,
  public_jwk jsonb not null check (
    jsonb_typeof(public_jwk) = 'object'
    and public_jwk ? 'kty' and public_jwk ? 'crv'
    and public_jwk ? 'x' and public_jwk ? 'y'
    and not public_jwk ? 'd'
    and public_jwk = jsonb_build_object(
      'kty','EC','crv','P-256','x',public_jwk->>'x','y',public_jwk->>'y'
    )
    and public_jwk->>'x' ~ '^[A-Za-z0-9_-]{43}$'
    and public_jwk->>'y' ~ '^[A-Za-z0-9_-]{43}$'
  ),
  key_thumbprint text not null unique check (key_thumbprint ~ '^[A-Za-z0-9_-]{43}$'),
  algorithm text not null check (algorithm = 'ES256'),
  protocol_version integer not null check (protocol_version = 1),
  broker_version text not null check (broker_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  build_sha256 text not null check (build_sha256 ~ '^[a-f0-9]{64}$'),
  host_label text not null check (length(host_label) between 1 and 120),
  local_uid_hash text not null check (local_uid_hash ~ '^[a-f0-9]{64}$'),
  os_version text not null check (length(os_version) between 1 and 120),
  status text not null default 'pending'
    check (status in ('pending','active','revoked','lost','retired')),
  allowed_repository_ids text[] not null,
  approved_at timestamptz,
  approved_by uuid,
  last_seen_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_reason text,
  request_counter bigint not null default 0 check (request_counter >= 0),
  last_request_jti uuid,
  last_request_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint atlas_code_brokers_repository_check check (
    allowed_repository_ids = array['github.com/bumbi190/ai-operating-platform']::text[]
  ),
  constraint atlas_code_brokers_status_shape_check check (
    (status = 'pending' and approved_at is null and approved_by is null
      and revoked_at is null and revoked_by is null and revoked_reason is null)
    or
    (status = 'active' and approved_at is not null and approved_by is not null
      and revoked_at is null and revoked_by is null and revoked_reason is null)
    or
    (status in ('revoked','lost','retired') and revoked_at is not null
      and revoked_by is not null and revoked_reason is not null)
  ),
  constraint atlas_code_brokers_request_shape_check check (
    (request_counter = 0 and last_request_jti is null and last_request_at is null and last_seen_at is null)
    or
    (request_counter > 0 and last_request_jti is not null and last_request_at is not null and last_seen_at is not null)
  )
);

alter table public.atlas_code_broker_enrollments
  add constraint atlas_code_broker_enrollments_broker_fk
  foreign key (broker_id) references public.atlas_code_brokers(broker_id) on delete restrict;

create unique index atlas_code_brokers_owner_live_idx
  on public.atlas_code_brokers(owner_user_id)
  where status in ('pending','active');

create unique index atlas_code_broker_enrollments_owner_open_idx
  on public.atlas_code_broker_enrollments(requested_by)
  where state = 'issued';

create index atlas_code_brokers_owner_created_idx
  on public.atlas_code_brokers(owner_user_id, created_at desc);

alter table public.atlas_code_brokers enable row level security;
alter table public.atlas_code_broker_enrollments enable row level security;

revoke all on public.atlas_code_brokers from public, anon, authenticated, service_role;
revoke all on public.atlas_code_broker_enrollments from public, anon, authenticated, service_role;
grant select on public.atlas_code_brokers to service_role;
grant select on public.atlas_code_broker_enrollments to service_role;

create function public.atlas_code_broker_begin_enrollment(
  p_enrollment_id uuid,
  p_requested_by uuid,
  p_host_id uuid,
  p_challenge_hash text,
  p_pairing_code_hash text,
  p_expires_at timestamptz,
  p_allowed_repository_ids text[]
)
returns public.atlas_code_broker_enrollments
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.atlas_code_broker_enrollments;
begin
  if p_requested_by is null or p_expires_at <= clock_timestamp()
     or p_expires_at > clock_timestamp() + interval '15 minutes'
     or p_challenge_hash !~ '^[a-f0-9]{64}$'
     or p_pairing_code_hash !~ '^[a-f0-9]{64}$'
     or p_allowed_repository_ids is distinct from array['github.com/bumbi190/ai-operating-platform']::text[] then
    raise exception 'invalid broker enrollment request' using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1 from public.atlas_code_brokers
     where owner_user_id = p_requested_by and status in ('pending','active')
  ) then
    raise exception 'owner already has a live broker identity' using errcode = 'unique_violation';
  end if;

  -- Expired, never-consumed challenges stop blocking a replacement request.
  perform set_config('omnira.code_broker_control','on',true);
  update public.atlas_code_broker_enrollments
     set state = 'expired'
   where requested_by = p_requested_by and state = 'issued' and expires_at <= clock_timestamp();

  insert into public.atlas_code_broker_enrollments(
    enrollment_id, requested_by, host_id, challenge_hash, pairing_code_hash,
    allowed_repository_ids, expires_at
  ) values (
    p_enrollment_id, p_requested_by, p_host_id, p_challenge_hash,
    p_pairing_code_hash, p_allowed_repository_ids, p_expires_at
  ) returning * into v_row;
  return v_row;
end
$fn$;

create function public.atlas_code_broker_complete_enrollment(
  p_enrollment_id uuid,
  p_challenge_hash text,
  p_pairing_code_hash text,
  p_public_jwk jsonb,
  p_key_thumbprint text,
  p_algorithm text,
  p_protocol_version integer,
  p_broker_version text,
  p_build_sha256 text,
  p_host_label text,
  p_local_uid_hash text,
  p_os_version text
)
returns public.atlas_code_brokers
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_enrollment public.atlas_code_broker_enrollments;
  v_broker public.atlas_code_brokers;
  v_broker_id uuid := gen_random_uuid();
begin
  select * into v_enrollment
    from public.atlas_code_broker_enrollments
   where enrollment_id = p_enrollment_id for update;
  if not found then raise exception 'broker enrollment not found' using errcode = 'no_data_found'; end if;
  if v_enrollment.state <> 'issued' or v_enrollment.consumed_at is not null
     or v_enrollment.expires_at <= clock_timestamp() then
    raise exception 'broker enrollment is not usable' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_enrollment.challenge_hash is distinct from p_challenge_hash
     or v_enrollment.pairing_code_hash is distinct from p_pairing_code_hash then
    raise exception 'broker enrollment proof mismatch' using errcode = 'insufficient_privilege';
  end if;
  if p_algorithm <> 'ES256' or p_protocol_version <> 1
     or p_key_thumbprint !~ '^[A-Za-z0-9_-]{43}$'
     or p_build_sha256 !~ '^[a-f0-9]{64}$'
     or p_local_uid_hash !~ '^[a-f0-9]{64}$'
     or coalesce(p_host_label,'') = '' or length(p_host_label) > 120
     or coalesce(p_os_version,'') = '' or length(p_os_version) > 120 then
    raise exception 'broker identity metadata invalid' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.atlas_code_brokers(
    broker_id, enrollment_id, owner_user_id, host_id, public_jwk,
    key_thumbprint, algorithm, protocol_version, broker_version, build_sha256,
    host_label, local_uid_hash, os_version, allowed_repository_ids
  ) values (
    v_broker_id, v_enrollment.enrollment_id, v_enrollment.requested_by,
    v_enrollment.host_id, p_public_jwk, p_key_thumbprint, p_algorithm,
    p_protocol_version, p_broker_version, p_build_sha256, p_host_label,
    p_local_uid_hash, p_os_version, v_enrollment.allowed_repository_ids
  ) returning * into v_broker;

  perform set_config('omnira.code_broker_control','on',true);
  update public.atlas_code_broker_enrollments set
    state = 'proof_verified', consumed_at = clock_timestamp(), broker_id = v_broker_id,
    proposed_host_label = p_host_label, proposed_local_uid_hash = p_local_uid_hash,
    proposed_os_version = p_os_version, proposed_protocol_version = p_protocol_version,
    proposed_broker_version = p_broker_version, proposed_build_sha256 = p_build_sha256
  where enrollment_id = p_enrollment_id;

  return v_broker;
end
$fn$;

create function public.atlas_code_broker_approve(
  p_broker_id uuid,
  p_owner_user_id uuid
)
returns public.atlas_code_brokers
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_broker public.atlas_code_brokers;
begin
  select * into v_broker from public.atlas_code_brokers
   where broker_id = p_broker_id and owner_user_id = p_owner_user_id for update;
  if not found then raise exception 'broker identity not found' using errcode = 'no_data_found'; end if;
  if v_broker.status = 'active' then return v_broker; end if;
  if v_broker.status <> 'pending' then
    raise exception 'broker identity cannot be approved' using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform set_config('omnira.code_broker_control','on',true);
  update public.atlas_code_brokers set
    status = 'active', approved_at = clock_timestamp(), approved_by = p_owner_user_id
  where broker_id = p_broker_id returning * into v_broker;
  update public.atlas_code_broker_enrollments set
    state = 'approved', approved_at = v_broker.approved_at, approved_by = p_owner_user_id
  where enrollment_id = v_broker.enrollment_id;
  return v_broker;
end
$fn$;

create function public.atlas_code_broker_revoke(
  p_broker_id uuid,
  p_owner_user_id uuid,
  p_status text,
  p_reason text
)
returns public.atlas_code_brokers
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_broker public.atlas_code_brokers;
begin
  if p_status not in ('revoked','lost') or coalesce(p_reason,'') = '' or length(p_reason) > 120 then
    raise exception 'invalid broker revocation' using errcode = 'invalid_parameter_value';
  end if;
  select * into v_broker from public.atlas_code_brokers
   where broker_id = p_broker_id and owner_user_id = p_owner_user_id for update;
  if not found then raise exception 'broker identity not found' using errcode = 'no_data_found'; end if;
  if v_broker.status in ('revoked','lost','retired') then
    if v_broker.status = p_status and v_broker.revoked_reason = p_reason then return v_broker; end if;
    raise exception 'broker identity is already terminal' using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform set_config('omnira.code_broker_control','on',true);
  update public.atlas_code_brokers set
    status = p_status, revoked_at = clock_timestamp(), revoked_by = p_owner_user_id,
    revoked_reason = p_reason
  where broker_id = p_broker_id returning * into v_broker;
  update public.atlas_code_broker_enrollments set state = 'revoked'
   where enrollment_id = v_broker.enrollment_id;
  return v_broker;
end
$fn$;

create function public.atlas_code_broker_accept_request(
  p_broker_id uuid,
  p_host_id uuid,
  p_protocol_version integer,
  p_broker_version text,
  p_build_sha256 text,
  p_request_counter bigint,
  p_jti uuid,
  p_request_timestamp timestamptz
)
returns public.atlas_code_brokers
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_broker public.atlas_code_brokers;
begin
  select * into v_broker from public.atlas_code_brokers
   where broker_id = p_broker_id for update;
  if not found or v_broker.status <> 'active'
     or v_broker.host_id is distinct from p_host_id
     or v_broker.protocol_version is distinct from p_protocol_version
     or v_broker.broker_version is distinct from p_broker_version
     or v_broker.build_sha256 is distinct from p_build_sha256
     or (v_broker.expires_at is not null and v_broker.expires_at <= clock_timestamp()) then
    raise exception 'broker identity is not active' using errcode = 'insufficient_privilege';
  end if;
  if p_request_counter <> v_broker.request_counter + 1
     or v_broker.last_request_jti is not distinct from p_jti
     or p_request_timestamp < clock_timestamp() - interval '2 minutes'
     or p_request_timestamp > clock_timestamp() + interval '2 minutes' then
    raise exception 'broker request replay or timestamp rejected' using errcode = 'serialization_failure';
  end if;

  perform set_config('omnira.code_broker_control','on',true);
  update public.atlas_code_brokers set
    request_counter = p_request_counter, last_request_jti = p_jti,
    last_request_at = p_request_timestamp, last_seen_at = clock_timestamp()
  where broker_id = p_broker_id returning * into v_broker;
  return v_broker;
end
$fn$;

create function public.atlas_code_broker_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if (new.broker_id, new.enrollment_id, new.owner_user_id, new.host_id,
      new.public_jwk, new.key_thumbprint, new.algorithm, new.protocol_version,
      new.broker_version, new.build_sha256, new.host_label,
      new.local_uid_hash, new.os_version, new.allowed_repository_ids, new.created_at)
     is distinct from
     (old.broker_id, old.enrollment_id, old.owner_user_id, old.host_id,
      old.public_jwk, old.key_thumbprint, old.algorithm, old.protocol_version,
      old.broker_version, old.build_sha256, old.host_label,
      old.local_uid_hash, old.os_version, old.allowed_repository_ids, old.created_at) then
    raise exception 'atlas_code_brokers identity is immutable' using errcode = 'restrict_violation';
  end if;
  if old.status in ('revoked','lost','retired') and new is distinct from old then
    raise exception 'atlas_code_brokers terminal row is immutable' using errcode = 'restrict_violation';
  end if;
  if current_setting('omnira.code_broker_control',true) is distinct from 'on' then
    raise exception 'atlas_code_brokers may only change through control functions' using errcode = 'insufficient_privilege';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$fn$;

create function public.atlas_code_broker_enrollment_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if (new.enrollment_id, new.requested_by, new.host_id, new.challenge_hash,
      new.pairing_code_hash, new.allowed_repository_ids, new.created_at, new.expires_at)
     is distinct from
     (old.enrollment_id, old.requested_by, old.host_id, old.challenge_hash,
      old.pairing_code_hash, old.allowed_repository_ids, old.created_at, old.expires_at) then
    raise exception 'atlas_code_broker_enrollments authority fields are immutable' using errcode = 'restrict_violation';
  end if;
  if old.state in ('revoked','expired') and new is distinct from old then
    raise exception 'atlas_code_broker_enrollments terminal row is immutable' using errcode = 'restrict_violation';
  end if;
  if new.state is distinct from old.state and not (
    (old.state = 'issued' and new.state in ('proof_verified','expired'))
    or (old.state = 'proof_verified' and new.state in ('approved','revoked'))
    or (old.state = 'approved' and new.state = 'revoked')
  ) then
    raise exception 'atlas_code_broker_enrollments lifecycle transition denied' using errcode = 'restrict_violation';
  end if;
  if current_setting('omnira.code_broker_control',true) is distinct from 'on' then
    raise exception 'atlas_code_broker_enrollments may only change through control functions' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$fn$;

create trigger atlas_code_brokers_guard_update
before update on public.atlas_code_brokers
for each row execute function public.atlas_code_broker_guard_update();

create trigger atlas_code_broker_enrollments_guard_update
before update on public.atlas_code_broker_enrollments
for each row execute function public.atlas_code_broker_enrollment_guard_update();

create function public.atlas_code_broker_reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  raise exception 'broker identity and enrollment history is append-preserved (attempted %)', tg_op
    using errcode = 'restrict_violation';
end
$fn$;

create trigger atlas_code_brokers_no_delete
before delete or truncate on public.atlas_code_brokers
for each statement execute function public.atlas_code_broker_reject_delete();

create trigger atlas_code_broker_enrollments_no_delete
before delete or truncate on public.atlas_code_broker_enrollments
for each statement execute function public.atlas_code_broker_reject_delete();

comment on table public.atlas_code_brokers is
  'SDF-1C1 public broker identity, owner/host binding and monotonic replay state. SERVER_ONLY.';
comment on table public.atlas_code_broker_enrollments is
  'SDF-1C1 one-time challenge hashes and human approval linkage. SERVER_ONLY.';

do $acl$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'atlas_code_broker_%'
  loop
    execute format('alter function %s owner to %I',r.signature,session_user);
    execute format('revoke all on function %s from public, anon, authenticated, service_role',r.signature);
  end loop;
end
$acl$;

grant execute on function public.atlas_code_broker_begin_enrollment(uuid,uuid,uuid,text,text,timestamptz,text[]) to service_role;
grant execute on function public.atlas_code_broker_complete_enrollment(uuid,text,text,jsonb,text,text,integer,text,text,text,text,text) to service_role;
grant execute on function public.atlas_code_broker_approve(uuid,uuid) to service_role;
grant execute on function public.atlas_code_broker_revoke(uuid,uuid,text,text) to service_role;
grant execute on function public.atlas_code_broker_accept_request(uuid,uuid,integer,text,text,bigint,uuid,timestamptz) to service_role;

commit;
