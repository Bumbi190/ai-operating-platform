-- SDF-1B1 — Code-work persistence and invariant plane.
--
-- CONTROL PLANE ONLY. This migration creates no scheduler, cron, pg_net call,
-- provider bridge, command runner, worktree hook or execution trigger.
-- Authorization remains canonical in atlas_authorizations; receipts record
-- operational observations without becoming a second authority ledger.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.atlas_code_work_runs (
  work_id uuid primary key,
  project_id uuid not null references public.projects(id) on delete restrict,
  requested_by uuid not null,
  proposal_key_hash text not null unique
    constraint atlas_code_work_runs_proposal_key_hash_check check (proposal_key_hash ~ '^[a-f0-9]{64}$'),
  proposal_fingerprint_hash text not null
    constraint atlas_code_work_runs_proposal_fingerprint_hash_check check (proposal_fingerprint_hash ~ '^[a-f0-9]{64}$'),

  admission jsonb not null
    constraint atlas_code_work_runs_admission_object_check check (jsonb_typeof(admission) = 'object'),
  admission_hash text not null
    constraint atlas_code_work_runs_admission_hash_check check (admission_hash ~ '^[a-f0-9]{64}$'),
  authorization_id uuid not null,
  authorization_expires_at timestamptz,

  mission_id uuid not null,
  mission_version integer not null check (mission_version > 0),
  mission_hash text not null check (mission_hash ~ '^[a-f0-9]{64}$'),
  delegation_envelope_id uuid not null,
  delegation_hash text not null check (delegation_hash ~ '^[a-f0-9]{64}$'),
  work_package_id uuid not null,
  work_package_hash text not null check (work_package_hash ~ '^[a-f0-9]{64}$'),

  repository_id text not null,
  repository_owner text not null,
  repository_name text not null,
  pinned_base_sha text not null check (pinned_base_sha ~ '^[a-f0-9]{40}$'),
  capability_id text not null,
  capability_version integer not null check (capability_version > 0),
  worker_adapter_id text not null,
  worker_adapter_version integer not null check (worker_adapter_version > 0),
  worker_provider text not null,
  worker_model_id text not null,
  worker_output_protocol text not null,
  command_registry_version text not null,
  command_registry_hash text not null check (command_registry_hash ~ '^[a-f0-9]{64}$'),

  state text not null default 'proposed'
    constraint atlas_code_work_runs_state_check check (state in (
      'proposed', 'authorized', 'claimed', 'preparing', 'working', 'testing',
      'ready_for_human_review', 'tests_failed', 'scope_violation', 'stale_base',
      'worker_failed', 'cancelled', 'timeout', 'policy_denied'
    )),
  state_version bigint not null default 0 check (state_version >= 0),
  authorized_at timestamptz,
  claim_id uuid,
  fence bigint not null default 0 check (fence >= 0),
  broker_id text,
  broker_host_id text,
  lease_until timestamptz,
  last_heartbeat_at timestamptz,
  broker_token_hash text,
  broker_token_expires_at timestamptz,
  cancel_requested boolean not null default false,
  cancel_requested_by uuid,
  cancel_requested_at timestamptz,
  cancel_reason_code text,
  last_receipt_sequence bigint not null default 0 check (last_receipt_sequence >= 0),
  receipt_chain_head text check (receipt_chain_head is null or receipt_chain_head ~ '^[a-f0-9]{64}$'),
  terminal_at timestamptz,
  terminal_reason_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint atlas_code_work_runs_work_admission_unique unique (work_id, admission_hash),
  constraint atlas_code_work_runs_projection_check check (
    admission->>'schema' = 'atlas.code_work_admission'
    and (admission->>'version')::integer = 1
    and admission->>'workId' = work_id::text
    and admission->>'projectId' = project_id::text
    and admission#>>'{governance,authorizationTarget,targetType}' = 'atlas.code_work_admission'
    and admission#>>'{governance,authorizationTarget,targetId}' = work_id::text
    and admission#>>'{governance,authorizationTarget,actionKind}' = 'code.worktree.prepare_and_patch'
    and admission#>>'{governance,mission,id}' = mission_id::text
    and (admission#>>'{governance,mission,version}')::integer = mission_version
    and admission#>>'{governance,mission,hash}' = mission_hash
    and admission#>>'{governance,delegation,envelopeId}' = delegation_envelope_id::text
    and admission#>>'{governance,delegation,hash}' = delegation_hash
    and admission#>>'{governance,workPackage,id}' = work_package_id::text
    and admission#>>'{governance,workPackage,hash}' = work_package_hash
    and admission#>>'{repository,repositoryId}' = repository_id
    and admission#>>'{repository,owner}' = repository_owner
    and admission#>>'{repository,name}' = repository_name
    and admission#>>'{repository,pinnedBaseSha}' = pinned_base_sha
    and admission#>>'{worker,capabilityId}' = capability_id
    and (admission#>>'{worker,capabilityVersion}')::integer = capability_version
    and admission#>>'{worker,adapterId}' = worker_adapter_id
    and (admission#>>'{worker,adapterVersion}')::integer = worker_adapter_version
    and admission#>>'{worker,provider}' = worker_provider
    and admission#>>'{worker,modelId}' = worker_model_id
    and admission#>>'{worker,outputProtocol}' = worker_output_protocol
    and admission#>>'{commands,registryVersion}' = command_registry_version
    and admission#>>'{commands,registryHash}' = command_registry_hash
  ),
  constraint atlas_code_work_runs_control_shape_check check (
    (claim_id is null and lease_until is null and broker_id is null and broker_host_id is null)
    or (claim_id is not null and lease_until is not null and broker_id is not null and broker_host_id is not null)
  ),
  constraint atlas_code_work_runs_token_dormant_check check (
    broker_token_hash is null and broker_token_expires_at is null
  ),
  constraint atlas_code_work_runs_cancellation_shape_check check (
    (not cancel_requested and cancel_requested_by is null and cancel_requested_at is null and cancel_reason_code is null)
    or (cancel_requested and cancel_requested_by is not null and cancel_requested_at is not null and cancel_reason_code is not null)
  ),
  constraint atlas_code_work_runs_receipt_head_shape_check check (
    (last_receipt_sequence = 0 and receipt_chain_head is null)
    or (last_receipt_sequence > 0 and receipt_chain_head is not null)
  ),
  constraint atlas_code_work_runs_terminal_shape_check check (
    (state in ('ready_for_human_review','tests_failed','scope_violation','stale_base','worker_failed','cancelled','timeout','policy_denied') and terminal_at is not null)
    or (state not in ('ready_for_human_review','tests_failed','scope_violation','stale_base','worker_failed','cancelled','timeout','policy_denied') and terminal_at is null and terminal_reason_code is null)
  )
);

create table public.atlas_code_work_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  work_id uuid not null,
  admission_hash text not null check (admission_hash ~ '^[a-f0-9]{64}$'),
  sequence bigint not null check (sequence > 0),
  event_type text not null check (event_type in (
    'proposal_created', 'authorization_requested', 'authorization_effective',
    'authorization_refused', 'claim_issued', 'lease_renewed', 'cancellation',
    'transition', 'evidence'
  )),
  receipt_class text not null check (receipt_class in (
    'control', 'repository_proof', 'base_proof', 'worktree_identity', 'authority_pins',
    'worker_identity', 'patch_operation', 'file_scope', 'command', 'test_result',
    'policy_denial', 'cancellation_fencing', 'final_git_status', 'final_diff', 'terminal'
  )),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  previous_receipt_hash text check (previous_receipt_hash is null or previous_receipt_hash ~ '^[a-f0-9]{64}$'),
  receipt_hash text not null check (receipt_hash ~ '^[a-f0-9]{64}$'),
  producer_type text not null check (producer_type in ('control_plane','broker','worker','operator')),
  producer_id text not null,
  claim_id uuid,
  fence bigint check (fence is null or fence >= 0),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint atlas_code_work_receipts_run_fk foreign key (work_id, admission_hash)
    references public.atlas_code_work_runs(work_id, admission_hash) on delete restrict,
  constraint atlas_code_work_receipts_work_sequence_unique unique (work_id, sequence),
  constraint atlas_code_work_receipts_work_hash_unique unique (work_id, receipt_hash),
  constraint atlas_code_work_receipts_control_class_check check (
    (event_type = 'evidence' and receipt_class <> 'control')
    or (event_type <> 'evidence' and receipt_class = 'control')
  )
);

create index atlas_code_work_runs_project_created_idx
  on public.atlas_code_work_runs(project_id, created_at desc);
create index atlas_code_work_runs_authorization_idx
  on public.atlas_code_work_runs(authorization_id);
create index atlas_code_work_runs_claim_idx
  on public.atlas_code_work_runs(claim_id) where claim_id is not null;
create index atlas_code_work_receipts_chain_idx
  on public.atlas_code_work_receipts(work_id, sequence);
create index atlas_code_work_receipts_evidence_idx
  on public.atlas_code_work_receipts(work_id, receipt_class, sequence);

alter table public.atlas_code_work_runs enable row level security;
alter table public.atlas_code_work_receipts enable row level security;
revoke all on public.atlas_code_work_runs from public, anon, authenticated, service_role;
revoke all on public.atlas_code_work_receipts from public, anon, authenticated, service_role;
grant select on public.atlas_code_work_runs to service_role;
grant select on public.atlas_code_work_receipts to service_role;

-- Canonical JSON compatible with canonicalTargetVersionHash in Authorization V1.
create function public.atlas_code_work_canonical_json(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = ''
as $fn$
  select case jsonb_typeof(p_value)
    when 'object' then '{' || coalesce((
      select string_agg(to_json(k)::text || ':' || public.atlas_code_work_canonical_json(v), ',' order by k collate "C")
      from jsonb_each(p_value) as e(k, v)
    ), '') || '}'
    when 'array' then '[' || coalesce((
      select string_agg(public.atlas_code_work_canonical_json(v), ',' order by ord)
      from jsonb_array_elements(p_value) with ordinality as e(v, ord)
    ), '') || ']'
    else p_value::text
  end
$fn$;

create function public.atlas_code_work_sorted_text_array(p_value jsonb)
returns jsonb
language sql
immutable
strict
set search_path = ''
as $fn$
  select coalesce(jsonb_agg(to_jsonb(v) order by v collate "C"), '[]'::jsonb)
  from (select distinct jsonb_array_elements_text(p_value) as v) s
$fn$;

create function public.atlas_code_work_normalized_admission(p_admission jsonb)
returns jsonb
language sql
immutable
strict
set search_path = ''
as $fn$
  select jsonb_build_object(
    'schema', p_admission->'schema', 'version', p_admission->'version',
    'workId', p_admission->'workId', 'projectId', p_admission->'projectId',
    'governance', p_admission->'governance',
    'repository', p_admission->'repository', 'worktree', p_admission->'worktree',
    'worker', p_admission->'worker',
    'files', jsonb_build_object(
      'readScopes', public.atlas_code_work_sorted_text_array(p_admission#>'{files,readScopes}'),
      'writeScopes', public.atlas_code_work_sorted_text_array(p_admission#>'{files,writeScopes}'),
      'deniedScopes', public.atlas_code_work_sorted_text_array(p_admission#>'{files,deniedScopes}'),
      'permissions', p_admission#>'{files,permissions}'
    ),
    'commands', jsonb_build_object(
      'approvedCommandIds', public.atlas_code_work_sorted_text_array(p_admission#>'{commands,approvedCommandIds}'),
      'registryVersion', p_admission#>'{commands,registryVersion}',
      'registryHash', p_admission#>'{commands,registryHash}'
    ),
    'limits', p_admission->'limits', 'isolation', p_admission->'isolation',
    'evidence', jsonb_build_object(
      'requiredReceiptClasses', public.atlas_code_work_sorted_text_array(p_admission#>'{evidence,requiredReceiptClasses}')
    ),
    'stopConditions', public.atlas_code_work_sorted_text_array(p_admission->'stopConditions')
  )
$fn$;

create function public.atlas_code_work_admission_hash(p_admission jsonb)
returns text
language sql
immutable
strict
set search_path = ''
as $fn$
  select encode(extensions.digest(convert_to(
    public.atlas_code_work_canonical_json(public.atlas_code_work_normalized_admission(p_admission)),
    'UTF8'
  ), 'sha256'), 'hex')
$fn$;

create function public.atlas_code_work_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select case p_from
    when 'proposed' then p_to in ('authorized','cancelled','policy_denied')
    when 'authorized' then p_to in ('claimed','stale_base','cancelled','timeout','policy_denied')
    when 'claimed' then p_to in ('preparing','stale_base','cancelled','timeout','policy_denied')
    when 'preparing' then p_to in ('working','stale_base','worker_failed','cancelled','timeout','policy_denied')
    when 'working' then p_to in ('testing','scope_violation','stale_base','worker_failed','cancelled','timeout','policy_denied')
    when 'testing' then p_to in ('working','ready_for_human_review','tests_failed','scope_violation','stale_base','worker_failed','cancelled','timeout','policy_denied')
    else false
  end
$fn$;

create function public.atlas_code_work_resource_covers(
  p_data_scope jsonb,
  p_out_of_scope jsonb,
  p_repository_id text,
  p_path text,
  p_access text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_prefix text := 'repo:' || p_repository_id || ':';
  v_item jsonb;
  v_resource text;
  v_parent text;
  v_covered boolean := false;
begin
  if p_path is null or p_path = '' or p_path like '/%' or p_path like '%..%' or p_access not in ('read','write') then
    return false;
  end if;
  for v_resource in select jsonb_array_elements_text(coalesce(p_out_of_scope, '[]'::jsonb)) loop
    if left(v_resource, length(v_prefix)) = v_prefix then
      v_parent := substr(v_resource, length(v_prefix) + 1);
      if v_parent = '' or p_path = v_parent
        or left(p_path, length(v_parent) + 1) = v_parent || '/'
        or left(v_parent, length(p_path) + 1) = p_path || '/' then
        return false;
      end if;
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_data_scope, '[]'::jsonb)) loop
    v_resource := v_item->>'resource';
    if left(v_resource, length(v_prefix)) = v_prefix
      and (p_access = 'read' or v_item->>'access' = 'write') then
      v_parent := substr(v_resource, length(v_prefix) + 1);
      if v_parent = '' or p_path = v_parent or left(p_path, length(v_parent) + 1) = v_parent || '/' then
        v_covered := true;
      end if;
    end if;
  end loop;
  return v_covered;
end
$fn$;

-- Internal forward declarations keep function-body validation enabled while
-- allowing the public RPCs and their locked helpers to call each other.
create function public.atlas_code_work_append_receipt_locked(
  uuid,text,bigint,text,text,text,jsonb,text,text,uuid,bigint,timestamptz
) returns public.atlas_code_work_receipts language plpgsql security definer set search_path=''
as $fn$ begin raise exception 'uninitialized'; end $fn$;
create function public.atlas_code_work_append_control_locked(
  public.atlas_code_work_runs,text,jsonb,text
) returns public.atlas_code_work_receipts language plpgsql security definer set search_path=''
as $fn$ begin raise exception 'uninitialized'; end $fn$;
create function public.atlas_code_work_terminal_evidence_complete(
  public.atlas_code_work_runs,text
) returns boolean language plpgsql security definer set search_path=''
as $fn$ begin raise exception 'uninitialized'; end $fn$;
create function public.atlas_code_work_append_system_evidence_locked(
  public.atlas_code_work_runs,text,jsonb,text
) returns public.atlas_code_work_receipts language plpgsql security definer set search_path=''
as $fn$ begin raise exception 'uninitialized'; end $fn$;
create function public.atlas_code_work_timeout_locked(
  public.atlas_code_work_runs,text
) returns public.atlas_code_work_runs language plpgsql security definer set search_path=''
as $fn$ begin raise exception 'uninitialized'; end $fn$;
create function public.atlas_code_work_cancel_locked(
  public.atlas_code_work_runs,uuid,text
) returns public.atlas_code_work_runs language plpgsql security definer set search_path=''
as $fn$ begin raise exception 'uninitialized'; end $fn$;
create function public.atlas_code_work_authorization_expiry(
  public.atlas_code_work_runs
) returns timestamptz language plpgsql security definer set search_path=''
as $fn$ begin raise exception 'uninitialized'; end $fn$;

create function public.atlas_code_work_sync_authorization(p_work_id uuid)
returns public.atlas_code_work_runs
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_run public.atlas_code_work_runs;
  v_expiry timestamptz;
  v_decided boolean;
  v_reason text;
begin
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id for update;
  if not found then raise exception 'code-work run not found' using errcode='no_data_found'; end if;
  if v_run.state in ('ready_for_human_review','tests_failed','scope_violation','stale_base','worker_failed','cancelled','timeout','policy_denied') then return v_run; end if;
  v_expiry := public.atlas_code_work_authorization_expiry(v_run);
  if v_expiry is not null then
    if v_run.state = 'proposed' then
      perform public.atlas_code_work_append_control_locked(v_run, 'authorization_effective',
        jsonb_build_object('authorizationId',v_run.authorization_id::text,'expiresAt',v_expiry), 'authorization');
      select * into v_run from public.atlas_code_work_runs where work_id=p_work_id for update;
      perform public.atlas_code_work_append_control_locked(v_run, 'transition',
        jsonb_build_object('from','proposed','to','authorized'), 'lifecycle');
      perform set_config('omnira.code_work_control','on',true);
      update public.atlas_code_work_runs set state='authorized', state_version=state_version+1,
        authorized_at=clock_timestamp(), authorization_expires_at=v_expiry
       where work_id=p_work_id returning * into v_run;
    else
      perform set_config('omnira.code_work_control','on',true);
      update public.atlas_code_work_runs set authorization_expires_at=v_expiry
       where work_id=p_work_id returning * into v_run;
    end if;
    return v_run;
  end if;

  select exists(select 1 from public.atlas_authorizations a
    where a.authorization_id=v_run.authorization_id
      and a.event_type in ('granted','granted_with_conditions','denied','revoked','superseded','expired'))
    into v_decided;
  if not v_decided then return v_run; end if;

  if v_run.state <> 'proposed' then
    return public.atlas_code_work_cancel_locked(v_run, v_run.requested_by, 'authorization_ineffective');
  end if;
  select case
    when exists(select 1 from public.atlas_authorizations a where a.authorization_id=v_run.authorization_id and a.event_type='granted_with_conditions') then 'authorization_conditions_ineffective'
    when exists(select 1 from public.atlas_authorizations a where a.authorization_id=v_run.authorization_id and a.event_type='denied') then 'authorization_denied'
    when exists(select 1 from public.atlas_authorizations a where a.authorization_id=v_run.authorization_id and a.event_type in ('revoked','superseded','expired')) then 'authorization_closed'
    else 'authorization_expired_or_malformed' end into v_reason;
  perform public.atlas_code_work_append_control_locked(v_run, 'authorization_refused',
    jsonb_build_object('authorizationId',v_run.authorization_id::text,'reason',v_reason), 'authorization');
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id for update;
  perform public.atlas_code_work_append_system_evidence_locked(v_run, 'policy_denial',
    jsonb_build_object('receiptClass','policy_denial','code',v_reason,'path',null), 'authorization');
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id for update;
  perform public.atlas_code_work_append_system_evidence_locked(v_run, 'terminal',
    jsonb_build_object('receiptClass','terminal','state','policy_denied','iterationCount',0), 'authorization');
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id for update;
  if not public.atlas_code_work_terminal_evidence_complete(v_run,'policy_denied') then
    raise exception 'policy denial evidence incomplete' using errcode='check_violation';
  end if;
  perform public.atlas_code_work_append_control_locked(v_run,'transition',
    jsonb_build_object('from','proposed','to','policy_denied','reason',v_reason),'lifecycle');
  perform set_config('omnira.code_work_control','on',true);
  update public.atlas_code_work_runs set state='policy_denied',state_version=state_version+1,
    terminal_at=clock_timestamp(),terminal_reason_code=v_reason,fence=fence+1
   where work_id=p_work_id returning * into v_run;
  return v_run;
end
$fn$;

create function public.atlas_code_work_claim(
  p_work_id uuid,
  p_broker_id text,
  p_broker_host_id text
)
returns public.atlas_code_work_runs
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_run public.atlas_code_work_runs;
  v_expiry timestamptz;
  v_runtime_cap timestamptz;
  v_lease timestamptz;
  v_claim uuid := gen_random_uuid();
  v_fence bigint;
begin
  if coalesce(p_broker_id,'')='' or coalesce(p_broker_host_id,'')='' then
    raise exception 'broker identity placeholders required' using errcode='invalid_parameter_value';
  end if;
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id for update;
  if not found then raise exception 'code-work run not found' using errcode='no_data_found'; end if;
  if v_run.state <> 'authorized' or v_run.cancel_requested or v_run.claim_id is not null then
    raise exception 'code-work run is not claimable' using errcode='object_not_in_prerequisite_state';
  end if;
  v_expiry := public.atlas_code_work_authorization_expiry(v_run);
  if v_expiry is null then return public.atlas_code_work_cancel_locked(v_run,v_run.requested_by,'authorization_ineffective'); end if;
  v_runtime_cap := v_run.created_at + ((v_run.admission#>>'{limits,maxTotalRuntimeSeconds}')::integer * interval '1 second');
  if v_runtime_cap <= clock_timestamp() then return public.atlas_code_work_timeout_locked(v_run,'runtime_cap_elapsed'); end if;
  v_lease := least(clock_timestamp()+interval '90 seconds',v_expiry,v_runtime_cap);
  v_fence := v_run.fence+1;
  perform public.atlas_code_work_append_control_locked(v_run,'transition',
    jsonb_build_object('from','authorized','to','claimed'),'lifecycle');
  perform set_config('omnira.code_work_control','on',true);
  update public.atlas_code_work_runs set state='claimed',state_version=state_version+1,
    claim_id=v_claim,fence=v_fence,broker_id=p_broker_id,broker_host_id=p_broker_host_id,
    lease_until=v_lease,last_heartbeat_at=clock_timestamp(),authorization_expires_at=v_expiry
   where work_id=p_work_id returning * into v_run;
  perform public.atlas_code_work_append_control_locked(v_run,'claim_issued',
    jsonb_build_object('claimId',v_claim::text,'fence',v_fence,'leaseUntil',v_lease,
      'credentialIssued',false),'claim');
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id;
  return v_run;
end
$fn$;

create function public.atlas_code_work_heartbeat(
  p_work_id uuid,
  p_claim_id uuid,
  p_fence bigint
)
returns public.atlas_code_work_runs
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_run public.atlas_code_work_runs;
  v_expiry timestamptz;
  v_cap timestamptz;
  v_lease timestamptz;
begin
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id for update;
  if not found then raise exception 'code-work run not found' using errcode='no_data_found'; end if;
  if v_run.claim_id is distinct from p_claim_id or v_run.fence <> p_fence then
    raise exception 'stale code-work fence' using errcode='serialization_failure';
  end if;
  if v_run.cancel_requested or v_run.state in ('ready_for_human_review','tests_failed','scope_violation','stale_base','worker_failed','cancelled','timeout','policy_denied') then
    raise exception 'code-work run is not heartbeat eligible' using errcode='object_not_in_prerequisite_state';
  end if;
  if v_run.lease_until <= clock_timestamp() then return public.atlas_code_work_timeout_locked(v_run,'lease_expired'); end if;
  v_expiry := public.atlas_code_work_authorization_expiry(v_run);
  if v_expiry is null then return public.atlas_code_work_cancel_locked(v_run,v_run.requested_by,'authorization_ineffective'); end if;
  v_cap := v_run.created_at + ((v_run.admission#>>'{limits,maxTotalRuntimeSeconds}')::integer * interval '1 second');
  if v_cap <= clock_timestamp() then return public.atlas_code_work_timeout_locked(v_run,'runtime_cap_elapsed'); end if;
  v_lease := least(clock_timestamp()+interval '90 seconds',v_expiry,v_cap);
  perform set_config('omnira.code_work_control','on',true);
  update public.atlas_code_work_runs set lease_until=v_lease,last_heartbeat_at=clock_timestamp(),
    authorization_expires_at=v_expiry where work_id=p_work_id returning * into v_run;
  perform public.atlas_code_work_append_control_locked(v_run,'lease_renewed',
    jsonb_build_object('claimId',p_claim_id::text,'fence',p_fence,'leaseUntil',v_lease,
      'heartbeatTargetSeconds',30),'heartbeat');
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id;
  return v_run;
end
$fn$;

create function public.atlas_code_work_append_evidence(
  p_work_id uuid,
  p_admission_hash text,
  p_claim_id uuid,
  p_fence bigint,
  p_expected_sequence bigint,
  p_expected_previous_hash text,
  p_receipt_class text,
  p_payload jsonb,
  p_observed_at timestamptz,
  p_producer_type text,
  p_producer_id text
)
returns public.atlas_code_work_runs
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_run public.atlas_code_work_runs; v_expiry timestamptz;
begin
  select * into v_run from public.atlas_code_work_runs
   where work_id=p_work_id and admission_hash=p_admission_hash for update;
  if not found then raise exception 'code-work run/admission not found' using errcode='no_data_found'; end if;
  if v_run.claim_id is distinct from p_claim_id or v_run.fence<>p_fence then
    raise exception 'stale code-work fence' using errcode='serialization_failure';
  end if;
  if v_run.lease_until is null or v_run.lease_until<=clock_timestamp() then
    return public.atlas_code_work_timeout_locked(v_run,'lease_expired');
  end if;
  v_expiry:=public.atlas_code_work_authorization_expiry(v_run);
  if v_expiry is null then return public.atlas_code_work_cancel_locked(v_run,v_run.requested_by,'authorization_ineffective'); end if;
  if p_payload->>'receiptClass' is distinct from p_receipt_class then
    raise exception 'receipt class/payload mismatch' using errcode='check_violation';
  end if;
  if p_producer_type not in ('broker','worker') then
    raise exception 'execution evidence producer is not admitted' using errcode='insufficient_privilege';
  end if;
  perform public.atlas_code_work_append_receipt_locked(
    v_run.work_id,v_run.admission_hash,p_expected_sequence,p_expected_previous_hash,
    'evidence',p_receipt_class,p_payload,p_producer_type,p_producer_id,p_claim_id,p_fence,p_observed_at);
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id;
  return v_run;
end
$fn$;

create function public.atlas_code_work_transition(
  p_work_id uuid,
  p_expected_state text,
  p_expected_version bigint,
  p_to_state text,
  p_claim_id uuid,
  p_fence bigint,
  p_reason_code text default null
)
returns public.atlas_code_work_runs
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_run public.atlas_code_work_runs; v_expiry timestamptz; v_terminal boolean;
begin
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id for update;
  if not found then raise exception 'code-work run not found' using errcode='no_data_found'; end if;
  if v_run.state<>p_expected_state or v_run.state_version<>p_expected_version then
    raise exception 'code-work state/version conflict' using errcode='serialization_failure';
  end if;
  if v_run.cancel_requested then return public.atlas_code_work_cancel_locked(v_run,v_run.cancel_requested_by,'cancellation_precedence'); end if;
  if p_to_state in ('authorized','claimed','cancelled','timeout')
     or not public.atlas_code_work_transition_allowed(v_run.state,p_to_state) then
    raise exception 'illegal code-work transition % -> %',v_run.state,p_to_state using errcode='object_not_in_prerequisite_state';
  end if;
  if v_run.claim_id is distinct from p_claim_id or v_run.fence<>p_fence then
    raise exception 'stale code-work fence' using errcode='serialization_failure';
  end if;
  if v_run.lease_until is null or v_run.lease_until<=clock_timestamp() then
    return public.atlas_code_work_timeout_locked(v_run,'lease_expired');
  end if;
  v_expiry:=public.atlas_code_work_authorization_expiry(v_run);
  if v_expiry is null then return public.atlas_code_work_cancel_locked(v_run,v_run.requested_by,'authorization_ineffective'); end if;
  v_terminal:=p_to_state in ('ready_for_human_review','tests_failed','scope_violation','stale_base','worker_failed','policy_denied');
  if v_terminal and not public.atlas_code_work_terminal_evidence_complete(v_run,p_to_state) then
    raise exception 'terminal evidence incomplete for %',p_to_state using errcode='check_violation';
  end if;
  perform public.atlas_code_work_append_control_locked(v_run,'transition',
    jsonb_build_object('from',v_run.state,'to',p_to_state,'reason',p_reason_code),'lifecycle');
  perform set_config('omnira.code_work_control','on',true);
  if v_terminal then
    update public.atlas_code_work_runs set state=p_to_state,state_version=state_version+1,
      terminal_at=clock_timestamp(),terminal_reason_code=p_reason_code,
      claim_id=null,broker_id=null,broker_host_id=null,lease_until=null,last_heartbeat_at=null,
      broker_token_hash=null,broker_token_expires_at=null,fence=fence+1
     where work_id=p_work_id returning * into v_run;
  else
    update public.atlas_code_work_runs set state=p_to_state,state_version=state_version+1
     where work_id=p_work_id returning * into v_run;
  end if;
  return v_run;
end
$fn$;

create function public.atlas_code_work_cancel(
  p_work_id uuid,
  p_project_id uuid,
  p_requested_by uuid,
  p_reason_code text
)
returns public.atlas_code_work_runs
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_run public.atlas_code_work_runs;
begin
  if coalesce(p_reason_code,'')='' then raise exception 'cancellation reason required' using errcode='invalid_parameter_value'; end if;
  select * into v_run from public.atlas_code_work_runs
   where work_id=p_work_id and project_id=p_project_id for update;
  if not found then raise exception 'code-work run not found' using errcode='no_data_found'; end if;
  return public.atlas_code_work_cancel_locked(v_run,p_requested_by,p_reason_code);
end
$fn$;

-- Forward declarations let the small internal helpers below compose while the
-- full, row-locking implementations remain together with the mutation guards.
create or replace function public.atlas_code_work_append_receipt_locked(
  p_work_id uuid, p_admission_hash text, p_expected_sequence bigint,
  p_expected_previous_hash text, p_event_type text, p_receipt_class text,
  p_payload jsonb, p_producer_type text, p_producer_id text,
  p_claim_id uuid, p_fence bigint, p_observed_at timestamptz
)
returns public.atlas_code_work_receipts
language plpgsql security definer set search_path = ''
as $fn$ begin raise exception 'uninitialized code-work receipt helper'; end $fn$;

create or replace function public.atlas_code_work_append_control_locked(
  p_run public.atlas_code_work_runs, p_event_type text, p_payload jsonb, p_producer_id text
)
returns public.atlas_code_work_receipts
language plpgsql security definer set search_path = ''
as $fn$ begin raise exception 'uninitialized code-work control helper'; end $fn$;

create or replace function public.atlas_code_work_terminal_evidence_complete(
  p_run public.atlas_code_work_runs,
  p_terminal_state text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_class text;
  v_command text;
  v_changed boolean;
begin
  for v_class in select jsonb_array_elements_text(p_run.admission#>'{evidence,requiredReceiptClasses}') loop
    if not exists (select 1 from public.atlas_code_work_receipts r
      where r.work_id = p_run.work_id and r.admission_hash = p_run.admission_hash
        and r.receipt_class = v_class) then return false; end if;
  end loop;

  if not exists (select 1 from public.atlas_code_work_receipts r
    where r.work_id = p_run.work_id and r.receipt_class = 'terminal'
      and r.payload->>'state' = p_terminal_state) then return false; end if;

  if p_terminal_state = 'policy_denied' then
    return exists (select 1 from public.atlas_code_work_receipts r
      where r.work_id = p_run.work_id and r.receipt_class = 'policy_denial');
  elsif p_terminal_state = 'cancelled' then
    return exists (select 1 from public.atlas_code_work_receipts r
      where r.work_id = p_run.work_id and r.receipt_class = 'cancellation_fencing'
        and (r.payload->>'cancelRequested')::boolean
        and r.payload->>'outcome' in ('cancelled','fenced'));
  elsif p_terminal_state = 'stale_base' then
    return exists (select 1 from public.atlas_code_work_receipts r
      where r.work_id = p_run.work_id and r.receipt_class = 'base_proof'
        and (r.payload->>'stale')::boolean);
  elsif p_terminal_state = 'scope_violation' then
    return exists (select 1 from public.atlas_code_work_receipts r
      where r.work_id = p_run.work_id and (
        (r.receipt_class = 'file_scope' and not (r.payload->>'withinScope')::boolean)
        or r.receipt_class = 'policy_denial'
      ));
  elsif p_terminal_state = 'worker_failed' then
    return exists (select 1 from public.atlas_code_work_receipts r
      where r.work_id = p_run.work_id and r.receipt_class = 'worker_identity');
  elsif p_terminal_state = 'tests_failed' then
    for v_command in select jsonb_array_elements_text(p_run.admission#>'{commands,approvedCommandIds}') loop
      if not exists (select 1 from public.atlas_code_work_receipts r
        where r.work_id = p_run.work_id and r.receipt_class = 'command'
          and r.payload->>'commandId' = v_command) then return false; end if;
      if not exists (select 1 from public.atlas_code_work_receipts r
        where r.work_id = p_run.work_id and r.receipt_class = 'test_result'
          and r.payload->>'commandId' = v_command) then return false; end if;
    end loop;
    return exists (select 1 from public.atlas_code_work_receipts r
      where r.work_id = p_run.work_id and r.receipt_class = 'test_result'
        and r.payload->>'outcome' = 'failed');
  elsif p_terminal_state = 'timeout' then
    return true;
  elsif p_terminal_state = 'ready_for_human_review' then
    if not exists (select 1 from public.atlas_code_work_receipts r where r.work_id = p_run.work_id
      and r.receipt_class = 'repository_proof' and (r.payload->>'verified')::boolean
      and r.payload->>'repositoryId' = p_run.repository_id) then return false; end if;
    if not exists (select 1 from public.atlas_code_work_receipts r where r.work_id = p_run.work_id
      and r.receipt_class = 'base_proof' and not (r.payload->>'stale')::boolean
      and r.payload->>'pinnedBaseSha' = p_run.pinned_base_sha
      and r.payload->>'observedRefSha' = p_run.pinned_base_sha) then return false; end if;
    if not exists (select 1 from public.atlas_code_work_receipts r where r.work_id = p_run.work_id
      and r.receipt_class = 'authority_pins' and r.payload->>'admissionHash' = p_run.admission_hash
      and r.payload->>'missionHash' = p_run.mission_hash
      and r.payload->>'delegationHash' = p_run.delegation_hash
      and r.payload->>'workPackageHash' = p_run.work_package_hash) then return false; end if;
    if not exists (select 1 from public.atlas_code_work_receipts r where r.work_id = p_run.work_id
      and r.receipt_class = 'worker_identity' and r.payload->>'adapterId' = p_run.worker_adapter_id
      and (r.payload->>'adapterVersion')::integer = p_run.worker_adapter_version
      and r.payload->>'provider' = p_run.worker_provider and r.payload->>'modelId' = p_run.worker_model_id
      and r.payload->>'outputProtocol' = p_run.worker_output_protocol) then return false; end if;
    if not exists (select 1 from public.atlas_code_work_receipts r where r.work_id = p_run.work_id
      and r.receipt_class = 'worktree_identity') then return false; end if;
    if not exists (select 1 from public.atlas_code_work_receipts r where r.work_id = p_run.work_id
      and r.receipt_class = 'file_scope' and (r.payload->>'withinScope')::boolean
      and r.payload->'deniedPaths' = '[]'::jsonb) then return false; end if;
    if not exists (select 1 from public.atlas_code_work_receipts r where r.work_id = p_run.work_id
      and r.receipt_class = 'final_git_status') then return false; end if;
    if not exists (select 1 from public.atlas_code_work_receipts r where r.work_id = p_run.work_id
      and r.receipt_class = 'final_diff') then return false; end if;
    select exists (select 1 from public.atlas_code_work_receipts r where r.work_id = p_run.work_id
      and r.receipt_class = 'final_diff'
      and ((r.payload->>'diffBytes')::bigint > 0 or jsonb_array_length(r.payload->'changedPaths') > 0))
      into v_changed;
    if v_changed and not exists (select 1 from public.atlas_code_work_receipts r
      where r.work_id = p_run.work_id and r.receipt_class = 'patch_operation') then return false; end if;
    for v_command in select jsonb_array_elements_text(p_run.admission#>'{commands,approvedCommandIds}') loop
      if not exists (select 1 from public.atlas_code_work_receipts r where r.work_id = p_run.work_id
        and r.receipt_class = 'command' and r.payload->>'commandId' = v_command
        and (r.payload->>'exitCode')::integer = 0 and not (r.payload->>'timedOut')::boolean) then return false; end if;
      if not exists (select 1 from public.atlas_code_work_receipts r where r.work_id = p_run.work_id
        and r.receipt_class = 'test_result' and r.payload->>'commandId' = v_command
        and r.payload->>'outcome' = 'passed') then return false; end if;
    end loop;
    return true;
  end if;
  return false;
end
$fn$;

create or replace function public.atlas_code_work_append_system_evidence_locked(
  p_run public.atlas_code_work_runs,
  p_receipt_class text,
  p_payload jsonb,
  p_producer_id text
)
returns public.atlas_code_work_receipts
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  return public.atlas_code_work_append_receipt_locked(
    p_run.work_id, p_run.admission_hash, p_run.last_receipt_sequence + 1,
    p_run.receipt_chain_head, 'evidence', p_receipt_class, p_payload,
    'control_plane', p_producer_id, p_run.claim_id, p_run.fence, clock_timestamp()
  );
end
$fn$;

create or replace function public.atlas_code_work_timeout_locked(
  p_run public.atlas_code_work_runs,
  p_reason text
)
returns public.atlas_code_work_runs
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_run public.atlas_code_work_runs;
begin
  v_run := p_run;
  if v_run.claim_id is not null then
    perform public.atlas_code_work_append_system_evidence_locked(v_run, 'cancellation_fencing',
      jsonb_build_object('receiptClass','cancellation_fencing','cancelRequested',false,
        'claimValid',false,'outcome','fenced'), 'lease-timeout');
    select * into v_run from public.atlas_code_work_runs where work_id = v_run.work_id for update;
  end if;
  perform public.atlas_code_work_append_system_evidence_locked(v_run, 'terminal',
    jsonb_build_object('receiptClass','terminal','state','timeout','iterationCount',0), 'lease-timeout');
  select * into v_run from public.atlas_code_work_runs where work_id = v_run.work_id for update;
  if not public.atlas_code_work_terminal_evidence_complete(v_run, 'timeout') then
    raise exception 'timeout evidence incomplete' using errcode = 'check_violation';
  end if;
  perform public.atlas_code_work_append_control_locked(v_run, 'transition',
    jsonb_build_object('from',v_run.state,'to','timeout','reason',p_reason), 'lifecycle');
  perform set_config('omnira.code_work_control','on',true);
  update public.atlas_code_work_runs set state='timeout', state_version=state_version+1,
    terminal_at=clock_timestamp(), terminal_reason_code=p_reason,
    claim_id=null, broker_id=null, broker_host_id=null, lease_until=null,
    last_heartbeat_at=null, broker_token_hash=null, broker_token_expires_at=null,
    fence=fence+1
  where work_id=v_run.work_id returning * into v_run;
  return v_run;
end
$fn$;

create or replace function public.atlas_code_work_cancel_locked(
  p_run public.atlas_code_work_runs,
  p_requested_by uuid,
  p_reason text
)
returns public.atlas_code_work_runs
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_run public.atlas_code_work_runs;
begin
  v_run := p_run;
  if v_run.state = 'cancelled' then return v_run; end if;
  if v_run.state in ('ready_for_human_review','tests_failed','scope_violation','stale_base','worker_failed','timeout','policy_denied') then
    return v_run;
  end if;
  perform public.atlas_code_work_append_system_evidence_locked(v_run, 'cancellation_fencing',
    jsonb_build_object('receiptClass','cancellation_fencing','cancelRequested',true,
      'claimValid',false,'outcome','cancelled'), 'cancellation');
  select * into v_run from public.atlas_code_work_runs where work_id=v_run.work_id for update;
  perform public.atlas_code_work_append_system_evidence_locked(v_run, 'terminal',
    jsonb_build_object('receiptClass','terminal','state','cancelled','iterationCount',0), 'cancellation');
  select * into v_run from public.atlas_code_work_runs where work_id=v_run.work_id for update;
  if not public.atlas_code_work_terminal_evidence_complete(v_run, 'cancelled') then
    raise exception 'cancellation evidence incomplete' using errcode = 'check_violation';
  end if;
  perform public.atlas_code_work_append_control_locked(v_run, 'cancellation',
    jsonb_build_object('reason',p_reason,'requestedBy',p_requested_by::text), 'cancellation');
  select * into v_run from public.atlas_code_work_runs where work_id=v_run.work_id for update;
  perform public.atlas_code_work_append_control_locked(v_run, 'transition',
    jsonb_build_object('from',v_run.state,'to','cancelled','reason',p_reason), 'lifecycle');
  perform set_config('omnira.code_work_control','on',true);
  update public.atlas_code_work_runs set
    state='cancelled', state_version=state_version+1,
    cancel_requested=true, cancel_requested_by=p_requested_by,
    cancel_requested_at=clock_timestamp(), cancel_reason_code=p_reason,
    terminal_at=clock_timestamp(), terminal_reason_code=p_reason,
    claim_id=null, broker_id=null, broker_host_id=null, lease_until=null,
    last_heartbeat_at=null, broker_token_hash=null, broker_token_expires_at=null,
    fence=fence+1
  where work_id=v_run.work_id returning * into v_run;
  return v_run;
end
$fn$;

create function public.atlas_code_work_guard_run_update()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if old.state in ('ready_for_human_review','tests_failed','scope_violation','stale_base','worker_failed','cancelled','timeout','policy_denied') then
    raise exception 'atlas_code_work_runs terminal row is immutable'
      using errcode = 'restrict_violation';
  end if;
  if (new.work_id, new.project_id, new.requested_by, new.proposal_key_hash,
      new.proposal_fingerprint_hash, new.admission, new.admission_hash,
      new.authorization_id, new.mission_id, new.mission_version, new.mission_hash,
      new.delegation_envelope_id, new.delegation_hash, new.work_package_id,
      new.work_package_hash, new.repository_id, new.repository_owner,
      new.repository_name, new.pinned_base_sha, new.capability_id,
      new.capability_version, new.worker_adapter_id, new.worker_adapter_version,
      new.worker_provider, new.worker_model_id, new.worker_output_protocol,
      new.command_registry_version, new.command_registry_hash, new.created_at)
     is distinct from
     (old.work_id, old.project_id, old.requested_by, old.proposal_key_hash,
      old.proposal_fingerprint_hash, old.admission, old.admission_hash,
      old.authorization_id, old.mission_id, old.mission_version, old.mission_hash,
      old.delegation_envelope_id, old.delegation_hash, old.work_package_id,
      old.work_package_hash, old.repository_id, old.repository_owner,
      old.repository_name, old.pinned_base_sha, old.capability_id,
      old.capability_version, old.worker_adapter_id, old.worker_adapter_version,
      old.worker_provider, old.worker_model_id, old.worker_output_protocol,
      old.command_registry_version, old.command_registry_hash, old.created_at) then
    raise exception 'atlas_code_work_runs authority fields are immutable'
      using errcode = 'restrict_violation';
  end if;
  if old.cancel_requested and not new.cancel_requested then
    raise exception 'atlas_code_work_runs cancellation is monotonic'
      using errcode = 'restrict_violation';
  end if;
  if current_setting('omnira.code_work_control', true) is distinct from 'on' then
    raise exception 'atlas_code_work_runs may only change through control-plane functions'
      using errcode = 'insufficient_privilege';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$fn$;

create trigger atlas_code_work_runs_guard_update
before update on public.atlas_code_work_runs
for each row execute function public.atlas_code_work_guard_run_update();

create function public.atlas_code_work_reject_receipt_mutation()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  raise exception 'atlas_code_work_receipts is append-only (attempted %)', tg_op
    using errcode = 'restrict_violation';
end
$fn$;

create trigger atlas_code_work_receipts_no_update
before update on public.atlas_code_work_receipts
for each row execute function public.atlas_code_work_reject_receipt_mutation();
create trigger atlas_code_work_receipts_no_delete
before delete on public.atlas_code_work_receipts
for each row execute function public.atlas_code_work_reject_receipt_mutation();
create trigger atlas_code_work_receipts_no_truncate
before truncate on public.atlas_code_work_receipts
for each statement execute function public.atlas_code_work_reject_receipt_mutation();

create or replace function public.atlas_code_work_append_receipt_locked(
  p_work_id uuid,
  p_admission_hash text,
  p_expected_sequence bigint,
  p_expected_previous_hash text,
  p_event_type text,
  p_receipt_class text,
  p_payload jsonb,
  p_producer_type text,
  p_producer_id text,
  p_claim_id uuid,
  p_fence bigint,
  p_observed_at timestamptz
)
returns public.atlas_code_work_receipts
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_run public.atlas_code_work_runs;
  v_payload_hash text;
  v_receipt_hash text;
  v_receipt public.atlas_code_work_receipts;
  v_hash_input jsonb;
begin
  select * into v_run from public.atlas_code_work_runs
   where work_id = p_work_id and admission_hash = p_admission_hash
   for update;
  if not found then raise exception 'code-work run/admission not found' using errcode = 'no_data_found'; end if;
  if v_run.state in ('ready_for_human_review','tests_failed','scope_violation','stale_base','worker_failed','cancelled','timeout','policy_denied') then
    raise exception 'terminal run accepts no further receipts' using errcode = 'restrict_violation';
  end if;
  if p_expected_sequence <> v_run.last_receipt_sequence + 1 then
    raise exception 'receipt sequence mismatch' using errcode = 'serialization_failure';
  end if;
  if p_expected_previous_hash is distinct from v_run.receipt_chain_head then
    raise exception 'receipt previous hash mismatch' using errcode = 'serialization_failure';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'receipt payload must be an object' using errcode = 'invalid_parameter_value';
  end if;
  v_payload_hash := encode(extensions.digest(convert_to(public.atlas_code_work_canonical_json(p_payload), 'UTF8'), 'sha256'), 'hex');
  v_hash_input := jsonb_build_object(
    'version', 'atlas.code_work.receipt_chain.v1',
    'workId', p_work_id::text,
    'admissionHash', p_admission_hash,
    'sequence', p_expected_sequence,
    'eventType', p_event_type,
    'receiptClass', p_receipt_class,
    'payloadHash', v_payload_hash,
    'previousReceiptHash', p_expected_previous_hash,
    'producerType', p_producer_type,
    'producerId', p_producer_id,
    'claimId', case when p_claim_id is null then null else to_jsonb(p_claim_id::text) end,
    'fence', p_fence,
    'observedAt', to_char(p_observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
  v_receipt_hash := encode(extensions.digest(convert_to(public.atlas_code_work_canonical_json(v_hash_input), 'UTF8'), 'sha256'), 'hex');

  insert into public.atlas_code_work_receipts (
    work_id, admission_hash, sequence, event_type, receipt_class, payload,
    payload_hash, previous_receipt_hash, receipt_hash, producer_type, producer_id,
    claim_id, fence, observed_at
  ) values (
    p_work_id, p_admission_hash, p_expected_sequence, p_event_type, p_receipt_class, p_payload,
    v_payload_hash, p_expected_previous_hash, v_receipt_hash, p_producer_type, p_producer_id,
    p_claim_id, p_fence, p_observed_at
  ) returning * into v_receipt;

  perform set_config('omnira.code_work_control', 'on', true);
  update public.atlas_code_work_runs set
    last_receipt_sequence = p_expected_sequence,
    receipt_chain_head = v_receipt_hash
  where work_id = p_work_id;
  return v_receipt;
end
$fn$;

create or replace function public.atlas_code_work_append_control_locked(
  p_run public.atlas_code_work_runs,
  p_event_type text,
  p_payload jsonb,
  p_producer_id text
)
returns public.atlas_code_work_receipts
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  return public.atlas_code_work_append_receipt_locked(
    p_run.work_id, p_run.admission_hash, p_run.last_receipt_sequence + 1,
    p_run.receipt_chain_head, p_event_type, 'control', p_payload,
    'control_plane', p_producer_id, p_run.claim_id, p_run.fence, clock_timestamp()
  );
end
$fn$;

create or replace function public.atlas_code_work_authorization_expiry(p_run public.atlas_code_work_runs)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_total integer;
  v_requests integer;
  v_grants integer;
  v_closes integer;
  v_consistent boolean;
  v_expiry timestamptz;
  v_request_at timestamptz;
  v_grant_at timestamptz;
begin
  select count(*),
         count(*) filter (where event_type = 'requested'),
         count(*) filter (where event_type = 'granted' and conditions = '[]'::jsonb),
         count(*) filter (where event_type in ('revoked','superseded','expired')),
         coalesce(bool_and(
           project_id = p_run.project_id
           and target_type = 'atlas.code_work_admission'
           and target_id = p_run.work_id::text
           and target_version_hash = p_run.admission_hash
           and action_kind = 'code.worktree.prepare_and_patch'
         ), false),
         max(expires_at) filter (where event_type = 'granted'),
         max(occurred_at) filter (where event_type = 'requested'),
         max(occurred_at) filter (where event_type = 'granted')
    into v_total, v_requests, v_grants, v_closes, v_consistent,
         v_expiry, v_request_at, v_grant_at
    from public.atlas_authorizations
   where authorization_id = p_run.authorization_id;

  if v_total <> 2 or v_requests <> 1 or v_grants <> 1 or v_closes <> 0
     or not v_consistent or v_expiry is null or v_expiry <= clock_timestamp()
     or v_grant_at < v_request_at then
    return null;
  end if;
  return v_expiry;
end
$fn$;

create function public.atlas_code_work_propose(
  p_work_id uuid,
  p_project_id uuid,
  p_requested_by uuid,
  p_proposal_key_hash text,
  p_proposal_fingerprint_hash text,
  p_admission jsonb,
  p_admission_hash text,
  p_authorization_id uuid,
  p_authorization_event_id uuid
)
returns public.atlas_code_work_runs
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_existing public.atlas_code_work_runs;
  v_run public.atlas_code_work_runs;
  v_wp jsonb;
  v_path text;
begin
  select * into v_existing from public.atlas_code_work_runs
   where proposal_key_hash = p_proposal_key_hash for update;
  if found then
    if v_existing.proposal_fingerprint_hash <> p_proposal_fingerprint_hash then
      raise exception 'proposal_fingerprint_conflict' using errcode = 'unique_violation';
    end if;
    return v_existing;
  end if;

  if p_admission <> public.atlas_code_work_normalized_admission(p_admission) then
    raise exception 'admission is not canonical' using errcode = 'check_violation';
  end if;
  if public.atlas_code_work_admission_hash(p_admission) <> p_admission_hash then
    raise exception 'admission hash mismatch (database %, supplied %)',
      public.atlas_code_work_admission_hash(p_admission), p_admission_hash
      using errcode = 'check_violation';
  end if;
  if p_admission->>'workId' <> p_work_id::text or p_admission->>'projectId' <> p_project_id::text then
    raise exception 'proposal identity does not match admission' using errcode = 'check_violation';
  end if;
  if p_admission#>>'{repository,repositoryId}' <> 'github.com/bumbi190/ai-operating-platform'
     or p_admission#>>'{repository,owner}' <> 'Bumbi190'
     or p_admission#>>'{repository,name}' <> 'ai-operating-platform'
     or p_admission#>>'{worker,capabilityId}' <> 'code.worktree.patch.v1' then
    raise exception 'untrusted repository or capability' using errcode = 'check_violation';
  end if;
  if not (p_admission#>'{evidence,requiredReceiptClasses}' @> '["authority_pins"]'::jsonb) then
    raise exception 'authority_pins baseline evidence missing' using errcode = 'check_violation';
  end if;

  select work_package into v_wp from public.manager_tasks
   where work_package_id = (p_admission#>>'{governance,workPackage,id}')::uuid
     and project_id = p_project_id
     and work_package_hash = p_admission#>>'{governance,workPackage,hash}'
     and mission_id = (p_admission#>>'{governance,mission,id}')::uuid
     and mission_version = (p_admission#>>'{governance,mission,version}')::integer
     and mission_bound_hash = p_admission#>>'{governance,mission,hash}'
     and delegation_envelope_id = (p_admission#>>'{governance,delegation,envelopeId}')::uuid
     and delegation_bound_hash = p_admission#>>'{governance,delegation,hash}'
   for share;
  if not found then raise exception 'Work Package pin unavailable' using errcode = 'foreign_key_violation'; end if;
  if not exists (select 1 from jsonb_array_elements(v_wp->'authority') x where x->>'action' = 'code.worktree.prepare_and_patch')
     or not exists (select 1 from jsonb_array_elements(v_wp->'allowedActions') x where x->>'action' = 'code.worktree.prepare_and_patch')
     or exists (select 1 from jsonb_array_elements(v_wp->'forbiddenActions') x where x->>'action' = 'code.worktree.prepare_and_patch')
     or not exists (select 1 from jsonb_array_elements(v_wp->'tools') x where x->>'tool' = 'code.worktree.patch.v1') then
    raise exception 'Work Package lacks code-work action/capability' using errcode = 'insufficient_privilege';
  end if;
  for v_path in select jsonb_array_elements_text(p_admission#>'{files,readScopes}') loop
    if not public.atlas_code_work_resource_covers(v_wp->'dataScope', v_wp->'outOfScope', p_admission#>>'{repository,repositoryId}', v_path, 'read') then
      raise exception 'Work Package read scope exceeded: %', v_path using errcode = 'insufficient_privilege';
    end if;
  end loop;
  for v_path in select jsonb_array_elements_text(p_admission#>'{files,writeScopes}') loop
    if not public.atlas_code_work_resource_covers(v_wp->'dataScope', v_wp->'outOfScope', p_admission#>>'{repository,repositoryId}', v_path, 'write') then
      raise exception 'Work Package write scope exceeded: %', v_path using errcode = 'insufficient_privilege';
    end if;
  end loop;

  insert into public.atlas_code_work_runs (
    work_id, project_id, requested_by, proposal_key_hash, proposal_fingerprint_hash,
    admission, admission_hash, authorization_id,
    mission_id, mission_version, mission_hash, delegation_envelope_id, delegation_hash,
    work_package_id, work_package_hash, repository_id, repository_owner, repository_name,
    pinned_base_sha, capability_id, capability_version, worker_adapter_id,
    worker_adapter_version, worker_provider, worker_model_id, worker_output_protocol,
    command_registry_version, command_registry_hash
  ) values (
    p_work_id, p_project_id, p_requested_by, p_proposal_key_hash, p_proposal_fingerprint_hash,
    p_admission, p_admission_hash, p_authorization_id,
    (p_admission#>>'{governance,mission,id}')::uuid,
    (p_admission#>>'{governance,mission,version}')::integer,
    p_admission#>>'{governance,mission,hash}',
    (p_admission#>>'{governance,delegation,envelopeId}')::uuid,
    p_admission#>>'{governance,delegation,hash}',
    (p_admission#>>'{governance,workPackage,id}')::uuid,
    p_admission#>>'{governance,workPackage,hash}',
    p_admission#>>'{repository,repositoryId}', p_admission#>>'{repository,owner}',
    p_admission#>>'{repository,name}', p_admission#>>'{repository,pinnedBaseSha}',
    p_admission#>>'{worker,capabilityId}', (p_admission#>>'{worker,capabilityVersion}')::integer,
    p_admission#>>'{worker,adapterId}', (p_admission#>>'{worker,adapterVersion}')::integer,
    p_admission#>>'{worker,provider}', p_admission#>>'{worker,modelId}',
    p_admission#>>'{worker,outputProtocol}', p_admission#>>'{commands,registryVersion}',
    p_admission#>>'{commands,registryHash}'
  ) returning * into v_run;

  insert into public.atlas_authorizations (
    event_id, authorization_id, event_type, occurred_at, project_id, principal_id,
    authority_basis, action_kind, authority_description, target_type, target_id,
    target_version_hash, conditions, evidence
  ) values (
    p_authorization_event_id, p_authorization_id, 'requested', clock_timestamp(),
    p_project_id, p_requested_by, 'founder_owner', 'code.worktree.prepare_and_patch',
    'Prepare one bounded isolated patch.', 'atlas.code_work_admission', p_work_id::text,
    p_admission_hash, '[]'::jsonb, '[]'::jsonb
  );

  perform public.atlas_code_work_append_control_locked(v_run, 'proposal_created',
    jsonb_build_object('proposalFingerprintHash', p_proposal_fingerprint_hash), 'proposal');
  select * into v_run from public.atlas_code_work_runs where work_id = p_work_id for update;
  perform public.atlas_code_work_append_control_locked(v_run, 'authorization_requested',
    jsonb_build_object('authorizationId', p_authorization_id::text,
      'targetVersionHash', p_admission_hash), 'authorization');
  select * into v_run from public.atlas_code_work_runs where work_id = p_work_id for update;
  perform public.atlas_code_work_append_receipt_locked(
    v_run.work_id, v_run.admission_hash, v_run.last_receipt_sequence + 1,
    v_run.receipt_chain_head, 'evidence', 'authority_pins',
    jsonb_build_object(
      'receiptClass', 'authority_pins', 'missionHash', v_run.mission_hash,
      'admissionHash', v_run.admission_hash, 'delegationHash', v_run.delegation_hash,
      'workPackageHash', v_run.work_package_hash
    ), 'control_plane', 'proposal', null, v_run.fence, clock_timestamp()
  );
  select * into v_run from public.atlas_code_work_runs where work_id = p_work_id;
  return v_run;
end
$fn$;

comment on table public.atlas_code_work_runs is
  'SDF-1B1 immutable CodeWorkAdmission authority plus dormant lifecycle/claim/fence control state. SERVER_ONLY.';
comment on table public.atlas_code_work_receipts is
  'SDF-1B1 append-only deterministic code-work receipt chain. SERVER_ONLY.';

-- SECURITY DEFINER functions are owned by the deployment owner, use an empty
-- search_path and start with no callable role. Only the seven purpose-specific
-- server primitives are granted to service_role; internal helpers stay private.
do $acl$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname like 'atlas_code_work_%'
  loop
    execute format('alter function %s owner to %I',r.signature,session_user);
    execute format('revoke all on function %s from public, anon, authenticated, service_role',r.signature);
  end loop;
end
$acl$;

grant execute on function public.atlas_code_work_propose(uuid,uuid,uuid,text,text,jsonb,text,uuid,uuid) to service_role;
grant execute on function public.atlas_code_work_sync_authorization(uuid) to service_role;
grant execute on function public.atlas_code_work_claim(uuid,text,text) to service_role;
grant execute on function public.atlas_code_work_heartbeat(uuid,uuid,bigint) to service_role;
grant execute on function public.atlas_code_work_append_evidence(uuid,text,uuid,bigint,bigint,text,text,jsonb,timestamptz,text,text) to service_role;
grant execute on function public.atlas_code_work_transition(uuid,text,bigint,text,uuid,bigint,text) to service_role;
grant execute on function public.atlas_code_work_cancel(uuid,uuid,uuid,text) to service_role;

commit;
