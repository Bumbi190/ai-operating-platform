-- Claim-bound metadata only. No execution, model dispatch or ready-state transition.
-- Existing migrations/heartbeat are immutable history.
create function public.atlas_code_work_execution_lease(
 p_work_id uuid,p_claim_id uuid,p_fence bigint,p_broker_id text,p_broker_host_id text,p_broker_token_hash text
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $fn$
declare
 r public.atlas_code_work_runs;b public.atlas_code_brokers;task public.manager_tasks;
 wp jsonb;path text;expiry timestamptz;cap timestamptz;now_at timestamptz;
 deadline timestamptz:=clock_timestamp()+interval '3 seconds';remaining bigint;
begin
 if p_work_id is null or p_claim_id is null or p_fence is null or p_fence<1
 or p_broker_token_hash is null or p_broker_token_hash!~'^[a-f0-9]{64}$'
 or coalesce(p_broker_id,'')='' or coalesce(p_broker_host_id,'')='' then
  raise exception 'lease unavailable' using errcode='invalid_parameter_value';
 end if;
 remaining:=floor(extract(epoch from(deadline-clock_timestamp()))*1000);
 if remaining<1 then raise exception 'lease unavailable' using errcode='query_canceled';end if;
 perform set_config('lock_timeout',remaining::text||'ms',true);
 lock table public.atlas_authorizations in share mode;
 remaining:=floor(extract(epoch from(deadline-clock_timestamp()))*1000);
 if remaining<1 then raise exception 'lease unavailable' using errcode='query_canceled';end if;
 perform set_config('lock_timeout',remaining::text||'ms',true);
 select * into strict r from public.atlas_code_work_runs where work_id=p_work_id for update;
 remaining:=floor(extract(epoch from(deadline-clock_timestamp()))*1000);
 if remaining<1 then raise exception 'lease unavailable' using errcode='query_canceled';end if;
 perform set_config('lock_timeout',remaining::text||'ms',true);
 select * into strict b from public.atlas_code_brokers where broker_id::text=p_broker_id for share;
 if b.status<>'active' or (b.expires_at is not null and b.expires_at<=clock_timestamp())
 or b.host_id::text<>p_broker_host_id or not(r.repository_id=any(b.allowed_repository_ids))
 or r.broker_id is distinct from p_broker_id or r.broker_host_id is distinct from p_broker_host_id
 or r.claim_id is distinct from p_claim_id or r.fence<>p_fence or r.broker_token_hash is distinct from p_broker_token_hash
 or r.state not in('claimed','preparing','working','testing') or r.cancel_requested
 or r.lease_until is null or r.lease_until<=clock_timestamp()
 or r.broker_token_expires_at is null or r.broker_token_expires_at<=clock_timestamp()
 or r.admission_hash is distinct from public.atlas_code_work_admission_hash(r.admission)
 or r.admission->>'workId'<>r.work_id::text or r.admission->>'projectId'<>r.project_id::text
 or r.repository_id is distinct from r.admission#>>'{repository,repositoryId}'
 then raise exception 'lease unavailable' using errcode='object_not_in_prerequisite_state';end if;
 expiry:=public.atlas_code_work_authorization_expiry(r);
 cap:=r.created_at+((r.admission#>>'{limits,maxTotalRuntimeSeconds}')::integer*interval '1 second');
 if expiry is null or cap<=clock_timestamp() then raise exception 'lease unavailable' using errcode='object_not_in_prerequisite_state';end if;
 remaining:=floor(extract(epoch from(deadline-clock_timestamp()))*1000);
 if remaining<1 then raise exception 'lease unavailable' using errcode='query_canceled';end if;
 perform set_config('lock_timeout',remaining::text||'ms',true);
 select * into strict task from public.manager_tasks
 where project_id=r.project_id and work_package_id=(r.admission#>>'{governance,workPackage,id}')::uuid
 and work_package_hash=r.admission#>>'{governance,workPackage,hash}'
 and mission_id=(r.admission#>>'{governance,mission,id}')::uuid
 and mission_version=(r.admission#>>'{governance,mission,version}')::integer
 and mission_bound_hash=r.admission#>>'{governance,mission,hash}'
 and delegation_envelope_id=(r.admission#>>'{governance,delegation,envelopeId}')::uuid
 and delegation_bound_hash=r.admission#>>'{governance,delegation,hash}' for share;
 wp:=task.work_package;
 if wp is null or jsonb_typeof(wp)<>'object' or octet_length(public.atlas_code_work_canonical_json(wp))>1048576
 or wp->>'schema' is distinct from 'atlas.workpackage' or wp->>'schemaVersion' is distinct from '1'
 or wp->>'projectId' is distinct from r.project_id::text
 or wp->>'workPackageId' is distinct from r.admission#>>'{governance,workPackage,id}'
 or wp->>'packageHash' is distinct from r.admission#>>'{governance,workPackage,hash}'
 or wp->>'missionId' is distinct from r.admission#>>'{governance,mission,id}'
 or wp->>'missionVersion' is distinct from r.admission#>>'{governance,mission,version}'
 or wp->>'missionBoundHash' is distinct from r.admission#>>'{governance,mission,hash}'
 or wp->>'envelopeId' is distinct from r.admission#>>'{governance,delegation,envelopeId}'
 or wp->>'delegationBoundHash' is distinct from r.admission#>>'{governance,delegation,hash}'
 or jsonb_typeof(wp->'dataScope') is distinct from 'array' or jsonb_array_length(wp->'dataScope')>256
 or jsonb_typeof(wp->'outOfScope') is distinct from 'array' or jsonb_array_length(wp->'outOfScope')>256
 or not exists(select 1 from jsonb_array_elements(wp->'authority')x where x->>'action'='code.worktree.prepare_and_patch')
 or not exists(select 1 from jsonb_array_elements(wp->'allowedActions')x where x->>'action'='code.worktree.prepare_and_patch')
 or exists(select 1 from jsonb_array_elements(wp->'forbiddenActions')x where x->>'action'='code.worktree.prepare_and_patch')
 or not exists(select 1 from jsonb_array_elements(wp->'tools')x where x->>'tool'='code.worktree.patch.v1')
 then raise exception 'lease unavailable' using errcode='object_not_in_prerequisite_state';end if;
 for path in select jsonb_array_elements_text(r.admission#>'{files,readScopes}')loop
  if not public.atlas_code_work_resource_covers(wp->'dataScope',wp->'outOfScope',r.repository_id,path,'read')
  then raise exception 'lease unavailable' using errcode='object_not_in_prerequisite_state';end if;
 end loop;
 for path in select jsonb_array_elements_text(r.admission#>'{files,writeScopes}')loop
  if not public.atlas_code_work_resource_covers(wp->'dataScope',wp->'outOfScope',r.repository_id,path,'write')
  then raise exception 'lease unavailable' using errcode='object_not_in_prerequisite_state';end if;
 end loop;
 r:=public.atlas_code_work_heartbeat(p_work_id,p_claim_id,p_fence,p_broker_id,p_broker_host_id,p_broker_token_hash);
 now_at:=clock_timestamp();expiry:=public.atlas_code_work_authorization_expiry(r);
 if now_at>=deadline or expiry is null or r.state not in('claimed','preparing','working','testing')
 or (b.expires_at is not null and b.expires_at<=now_at)
 or r.cancel_requested or r.lease_until<=now_at or expiry<=now_at or cap<=now_at
 then raise exception 'lease unavailable' using errcode='object_not_in_prerequisite_state';end if;
 return jsonb_build_object(
 'schema','atlas.code_work_execution_lease.v1',
 'binding',jsonb_build_object('workId',r.work_id::text,'repositoryId',r.repository_id,
 'pinnedBaseSha',r.admission#>>'{repository,pinnedBaseSha}','admissionHash',r.admission_hash,'claimId',r.claim_id::text,'fence',r.fence),
 'projectId',r.project_id::text,
 'authorityPins',jsonb_build_object('missionId',r.admission#>>'{governance,mission,id}',
 'missionVersion',(r.admission#>>'{governance,mission,version}')::bigint,'missionHash',r.admission#>>'{governance,mission,hash}',
 'delegationEnvelopeId',r.admission#>>'{governance,delegation,envelopeId}','delegationHash',r.admission#>>'{governance,delegation,hash}',
 'workPackageId',r.admission#>>'{governance,workPackage,id}','workPackageHash',r.admission#>>'{governance,workPackage,hash}'),
 'state',r.state,'stateVersion',r.state_version,
 'serverNowMs',floor(extract(epoch from now_at)*1000)::bigint,
 'leaseUntilMs',floor(extract(epoch from least(r.lease_until,coalesce(b.expires_at,r.lease_until)))*1000)::bigint,
 'authorizationExpiresAtMs',floor(extract(epoch from expiry)*1000)::bigint,
 'runtimeExpiresAtMs',floor(extract(epoch from cap)*1000)::bigint,'productionAuthority',false);
end $fn$;
revoke all on function public.atlas_code_work_execution_lease(uuid,uuid,bigint,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.atlas_code_work_execution_lease(uuid,uuid,bigint,text,text,text) to service_role;
