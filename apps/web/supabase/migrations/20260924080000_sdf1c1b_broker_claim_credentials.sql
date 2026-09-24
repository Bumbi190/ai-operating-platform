-- SDF-1C1B: claim-scoped broker credential foundation (control plane only).
--
-- Activates the dormant broker_token_* seam that SDF-1B1 reserved on
-- atlas_code_work_runs. One opaque credential exists per claim; ONLY its
-- SHA-256 hash is ever persisted, and it lives exactly as long as the claim
-- lease. The raw token is generated and hashed by the trusted server-side
-- caller and never crosses into SQL.
--
-- This migration adds NO table, NO route, NO broker-facing capability and NO
-- execution path. The credential is possession evidence for a claim that the
-- existing SQL boundary has already authorised; it grants nothing by itself.
--
-- SDF-1B1 (20260918095827) is canonical history and is not edited. Cancel,
-- timeout and terminal transitions already clear broker_token_hash and
-- broker_token_expires_at (and the claim), so they are left untouched.
--
-- No begin/commit: the migration runner owns the transaction, so the whole
-- change applies or fails atomically.

-- 1. Replace the dormant-only shape with the credential shape.
--    No claim  -> no token material.
--    Claim     -> a lowercase SHA-256 hash and an expiry equal to the lease.
alter table public.atlas_code_work_runs
  drop constraint atlas_code_work_runs_token_dormant_check;

alter table public.atlas_code_work_runs
  add constraint atlas_code_work_runs_claim_credential_check check (
    (claim_id is null and broker_token_hash is null and broker_token_expires_at is null)
    or (
      claim_id is not null
      -- Explicit not-null tests: a CHECK that evaluates to NULL PASSES, so a missing
      -- hash must be rejected by a definite false, not by a NULL regex match.
      and broker_token_hash is not null
      and broker_token_hash ~ '^[a-f0-9]{64}$'
      and broker_token_expires_at is not null
      and broker_token_expires_at = lease_until
    )
  );

-- 2. The credential-less claim can no longer create a claim. It is removed
--    outright rather than stubbed, so no overload can bypass the credential.
drop function public.atlas_code_work_claim(uuid, text, text);

create function public.atlas_code_work_claim(
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
  v_runtime_cap timestamptz;
  v_lease timestamptz;
  v_claim uuid := gen_random_uuid();
  v_fence bigint;
begin
  if coalesce(p_broker_id,'')='' or coalesce(p_broker_host_id,'')='' then
    raise exception 'broker identity placeholders required' using errcode='invalid_parameter_value';
  end if;
  if p_broker_token_hash is null or p_broker_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'broker claim credential hash invalid' using errcode='invalid_parameter_value';
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
    lease_until=v_lease,last_heartbeat_at=clock_timestamp(),authorization_expires_at=v_expiry,
    broker_token_hash=p_broker_token_hash,broker_token_expires_at=v_lease
   where work_id=p_work_id returning * into v_run;
  -- The receipt records THAT a credential exists, never the credential or its hash.
  perform public.atlas_code_work_append_control_locked(v_run,'claim_issued',
    jsonb_build_object('claimId',v_claim::text,'fence',v_fence,'leaseUntil',v_lease,
      'credentialIssued',true),'claim');
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id;
  return v_run;
end
$fn$;

revoke all on function public.atlas_code_work_claim(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.atlas_code_work_claim(uuid, text, text, text) to service_role;

-- 3. Heartbeat: the token lives exactly as long as the lease. The token itself
--    is NOT rotated; only its expiry follows the renewed lease. Every other
--    check (claim, fence, cancellation, lease, authorization, runtime cap) is
--    unchanged. Same signature, so create-or-replace keeps owner and ACL.
create or replace function public.atlas_code_work_heartbeat(
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
    authorization_expires_at=v_expiry,broker_token_expires_at=v_lease
   where work_id=p_work_id returning * into v_run;
  perform public.atlas_code_work_append_control_locked(v_run,'lease_renewed',
    jsonb_build_object('claimId',p_claim_id::text,'fence',p_fence,'leaseUntil',v_lease,
      'heartbeatTargetSeconds',30),'heartbeat');
  select * into v_run from public.atlas_code_work_runs where work_id=p_work_id;
  return v_run;
end
$fn$;
