-- SDF-1C2: authenticated broker control channel (database side).
--
-- Adds ONLY what the discover -> claim -> claim-recovery -> heartbeat channel
-- needs. No table, no work-context storage, no sandbox/worker/model/execution
-- object. SDF-1B1 and SDF-1C1B are canonical history and are not edited.
--
--  1. A control receipt event, `claim_credential_reissued`, so that a credential
--     reissue is auditable WITHOUT secret material. No existing event says this
--     truthfully (`claim_issued` would falsely imply a new claim).
--  2. atlas_code_work_heartbeat now REQUIRES the claim proof. The credential-less
--     3-argument signature is dropped; the proof (claim id, fence, broker id, broker
--     host id and the credential HASH) is verified inside the same row lock that
--     renews the lease, so there is no read-then-heartbeat window. The raw token
--     never crosses into SQL; only its domain-separated SHA-256 does.
--  3. atlas_code_work_discover_claimable: a purpose-specific, bounded, closed-shape read
--     for broker discovery (work id, repository id, pinned base sha and nothing else).
--  4. atlas_code_work_recover_claim_credential: same-broker recovery of a claim
--     whose response carrying the raw token was lost. It replaces the credential
--     HASH only. It never creates a claim, never changes claim id, fence, work,
--     repository, authority or admission, never renews the lease, and is closed
--     for good once a lease renewal (first heartbeat) has been receipted.
--
-- No begin/commit: the migration runner owns the transaction.

-- 1. Receipt vocabulary.
alter table public.atlas_code_work_receipts
  drop constraint atlas_code_work_receipts_event_type_check;

alter table public.atlas_code_work_receipts
  add constraint atlas_code_work_receipts_event_type_check check (event_type in (
    'proposal_created', 'authorization_requested', 'authorization_effective',
    'authorization_refused', 'claim_issued', 'claim_credential_reissued',
    'lease_renewed', 'cancellation', 'transition', 'evidence'
  ));

-- 2. Credential-bearing heartbeat. The old signature is removed, not stubbed.
drop function public.atlas_code_work_heartbeat(uuid, uuid, bigint);

create function public.atlas_code_work_heartbeat(
  p_work_id uuid,
  p_claim_id uuid,
  p_fence bigint,
  p_broker_id text,
  p_broker_host_id text,
  p_broker_token_hash text
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
  if p_broker_token_hash is null or p_broker_token_hash !~ '^[a-f0-9]{64}$'
     or coalesce(p_broker_id,'')='' or coalesce(p_broker_host_id,'')='' then
    raise exception 'broker claim proof invalid' using errcode='invalid_parameter_value';
  end if;
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id for update;
  if not found then raise exception 'code-work run not found' using errcode='no_data_found'; end if;
  -- One uniform refusal for every proof mismatch (claim, fence, broker, host, credential),
  -- evaluated under the row lock, so nothing distinguishes which part was wrong.
  if v_run.claim_id is distinct from p_claim_id or v_run.fence <> p_fence
     or v_run.broker_id is distinct from p_broker_id
     or v_run.broker_host_id is distinct from p_broker_host_id
     or v_run.broker_token_hash is distinct from p_broker_token_hash then
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
    authorization_expires_at=v_expiry,broker_token_expires_at=v_lease
   where work_id=p_work_id returning * into v_run;
  perform public.atlas_code_work_append_control_locked(v_run,'lease_renewed',
    jsonb_build_object('claimId',p_claim_id::text,'fence',p_fence,'leaseUntil',v_lease,
      'heartbeatTargetSeconds',30),'heartbeat');
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id;
  return v_run;
end
$fn$;

revoke all on function public.atlas_code_work_heartbeat(uuid, uuid, bigint, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.atlas_code_work_heartbeat(uuid, uuid, bigint, text, text, text) to service_role;

-- 3. Same-broker credential recovery for the claim handshake only.
create function public.atlas_code_work_recover_claim_credential(
  p_work_id uuid,
  p_broker_id text,
  p_broker_host_id text,
  p_broker_token_hash text
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
begin
  if p_broker_token_hash is null or p_broker_token_hash !~ '^[a-f0-9]{64}$'
     or coalesce(p_broker_id,'')='' or coalesce(p_broker_host_id,'')='' then
    raise exception 'broker claim credential hash invalid' using errcode='invalid_parameter_value';
  end if;
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id for update;
  -- Unknown work, someone else's claim, an unclaimed run, a run past the handshake
  -- state and a cancelled run all refuse identically.
  if not found
     or v_run.state <> 'claimed' or v_run.claim_id is null or v_run.cancel_requested
     or v_run.broker_id is distinct from p_broker_id
     or v_run.broker_host_id is distinct from p_broker_host_id
     or v_run.broker_token_hash is null
     or v_run.broker_token_hash = p_broker_token_hash then
    raise exception 'claim credential is not recoverable' using errcode='object_not_in_prerequisite_state';
  end if;
  -- The handshake ends with the first receipted lease renewal: from then on possession
  -- of the claim credential is required and identity alone can never re-mint it.
  if exists (
    select 1 from public.atlas_code_work_receipts r
     where r.work_id = p_work_id and r.event_type = 'lease_renewed'
  ) then
    raise exception 'claim credential is not recoverable' using errcode='object_not_in_prerequisite_state';
  end if;
  if v_run.lease_until <= clock_timestamp() then return public.atlas_code_work_timeout_locked(v_run,'lease_expired'); end if;
  v_expiry := public.atlas_code_work_authorization_expiry(v_run);
  if v_expiry is null then return public.atlas_code_work_cancel_locked(v_run,v_run.requested_by,'authorization_ineffective'); end if;
  v_cap := v_run.created_at + ((v_run.admission#>>'{limits,maxTotalRuntimeSeconds}')::integer * interval '1 second');
  if v_cap <= clock_timestamp() then return public.atlas_code_work_timeout_locked(v_run,'runtime_cap_elapsed'); end if;
  -- Replace the credential HASH only. Lease, token expiry (= lease), fence, claim id and
  -- every authority field are untouched: recovery grants no additional runtime.
  perform set_config('omnira.code_work_control','on',true);
  update public.atlas_code_work_runs set broker_token_hash=p_broker_token_hash
   where work_id=p_work_id returning * into v_run;
  -- Non-secret audit: THAT a credential was reissued, never the credential or its hash.
  perform public.atlas_code_work_append_control_locked(v_run,'claim_credential_reissued',
    jsonb_build_object('claimId',v_run.claim_id::text,'fence',v_run.fence,'leaseUntil',v_run.lease_until,
      'credentialReissued',true),'claim_recovery');
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id;
  return v_run;
end
$fn$;

revoke all on function public.atlas_code_work_recover_claim_credential(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.atlas_code_work_recover_claim_credential(uuid, text, text, text) to service_role;

-- 4. Broker discovery: advisory, closed-shape, bounded. Appearing here is NOT proof the run
--    is still claimable; the claim function re-checks everything under the row lock.
create function public.atlas_code_work_discover_claimable(
  p_repository_ids text[],
  p_limit integer default 20
)
returns table (work_id uuid, repository_id text, pinned_base_sha text)
language sql
stable
security definer
set search_path = ''
as $fn$
  select r.work_id, r.repository_id, r.pinned_base_sha
    from public.atlas_code_work_runs r
   where r.state = 'authorized'
     and r.claim_id is null
     and not r.cancel_requested
     and r.repository_id = any(coalesce(p_repository_ids, array[]::text[]))
     and (r.authorization_expires_at is null or r.authorization_expires_at > clock_timestamp())
   order by r.authorized_at asc nulls last, r.work_id asc
   limit least(greatest(coalesce(p_limit, 20), 1), 20)
$fn$;

revoke all on function public.atlas_code_work_discover_claimable(text[], integer)
  from public, anon, authenticated, service_role;
grant execute on function public.atlas_code_work_discover_claimable(text[], integer) to service_role;
