-- Atlas Creative P10: dedicated, dormant media-worker identities.
-- NO enrollment API, worker activation, networking, creative execution or
-- publishing. NOT APPLIED TO ANY SUPABASE ENVIRONMENT.
-- Never reuse atlas_code_work broker identity or authorization.
begin;

create table public.atlas_creative_worker_identities (
  worker_id text primary key
    check (worker_id ~ '^[A-Za-z][A-Za-z0-9_-]{2,63}$'),
  key_id text not null unique
    check (key_id ~ '^[A-Za-z][A-Za-z0-9_-]{2,63}$'),
  public_key_spki_pem text not null
    check (length(public_key_spki_pem) between 80 and 3000),
  state text not null default 'revoked'
    check (state in ('active','revoked')),
  creative_claim_enabled boolean not null default false,
  project_ids uuid[] not null
    check (cardinality(project_ids) between 1 and 32
      and array_position(project_ids, null) is null),
  last_counter bigint not null default 0
    check (last_counter >= 0),
  created_at timestamptz not null default clock_timestamp(),
  changed_at timestamptz not null default clock_timestamp(),
  last_accepted_at timestamptz
);
create table public.atlas_creative_worker_nonces (
  worker_id text not null references public.atlas_creative_worker_identities(worker_id)
    on delete restrict,
  key_id text not null,
  nonce_sha256 text not null
    check (nonce_sha256 ~ '^[a-f0-9]{64}$'),
  counter bigint not null check(counter > 0),
  accepted_at timestamptz not null default clock_timestamp(),
  primary key (worker_id,nonce_sha256),
  unique(worker_id,counter)
);
create index atlas_creative_worker_nonces_accepted
  on public.atlas_creative_worker_nonces(worker_id,accepted_at);

alter table public.atlas_creative_worker_identities enable row level security;
alter table public.atlas_creative_worker_nonces enable row level security;
revoke all on public.atlas_creative_worker_identities
  from public,anon,authenticated,service_role;
revoke all on public.atlas_creative_worker_nonces
  from public,anon,authenticated,service_role;
-- Server may LOOK UP public keys, status and project grants.
-- Enrollment/revocation require separately reviewed privileged operator path.
grant select on public.atlas_creative_worker_identities to service_role;
-- No direct INSERT/UPDATE/DELETE grants, including service_role.

create function public.atlas_creative_consume_worker_proof_p10(
  p_worker_id text,
  p_key_id text,
  p_counter bigint,
  p_nonce_sha256 text,
  p_project_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_identity public.atlas_creative_worker_identities%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
  then return false; end if;
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z][A-Za-z0-9_-]{2,63}$'
    or p_key_id is null or p_key_id !~ '^[A-Za-z][A-Za-z0-9_-]{2,63}$'
    or p_counter is null or p_counter <= 0
    or p_nonce_sha256 is null or p_nonce_sha256 !~ '^[a-f0-9]{64}$'
    or p_project_ids is null
    or cardinality(p_project_ids) not between 1 and 32
    or array_position(p_project_ids,null) is not null
  then return false; end if;

  select * into v_identity
    from public.atlas_creative_worker_identities
    where worker_id=p_worker_id for update;

  if not found or v_identity.state is distinct from 'active'
    or v_identity.creative_claim_enabled is distinct from true
    or v_identity.key_id is distinct from p_key_id
    or v_identity.last_counter >= p_counter
    or cardinality(v_identity.project_ids) <> cardinality(p_project_ids)
    or not (v_identity.project_ids @> p_project_ids
      and p_project_ids @> v_identity.project_ids)
  then return false; end if;

  -- Transactional replay latch: if unique constraint is violated, the caller
  -- fails closed and the update below is rolled back.
  insert into public.atlas_creative_worker_nonces
    (worker_id,key_id,nonce_sha256,counter)
  values (p_worker_id,p_key_id,p_nonce_sha256,p_counter);

  update public.atlas_creative_worker_identities
    set last_counter=p_counter,last_accepted_at=clock_timestamp()
    where worker_id=p_worker_id;
  return true;
exception when unique_violation then
  return false;
end;
$fn$;

revoke all on function public.atlas_creative_consume_worker_proof_p10(
  text,text,bigint,text,uuid[]
) from public,anon,authenticated,service_role;
grant execute on function public.atlas_creative_consume_worker_proof_p10(
  text,text,bigint,text,uuid[]
) to service_role;

-- No worker rows enrolled by migration; no trigger, cron, connection or media.
commit;
