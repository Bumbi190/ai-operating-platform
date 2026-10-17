-- Owner-authorized maintenance of the same draft-only worker. No mailbox/send rights.
alter table public.sales_worker_registrations
 add column managed_authorized_at timestamptz,
 add column manager_token_hash text unique check(manager_token_hash ~ '^[a-f0-9]{64}$'),
 add column host_generation integer not null default 1 check(host_generation>0),
 add column desired_state text not null default 'running' check(desired_state in('running','paused')),
 add column rotation_id uuid,
 add column rotation_hash text check(rotation_hash ~ '^[a-f0-9]{64}$'),
 add column rotation_expected_generation integer,
 add column rotation_receipt jsonb,
 add column reconnect_requested boolean not null default false,
 add column cli_state text not null default 'unknown' check(cli_state in('ready','blocked','unknown'));
create table public.sales_host_events (
 id bigint generated always as identity primary key,
 project_id uuid not null, worker_id uuid not null,
 action text not null check(action in('authorize','adopt','rotate','pause','resume','reconnect')),
 generation integer not null check(generation>0),created_at timestamptz not null default now(),
 foreign key(project_id,worker_id) references public.sales_worker_registrations(project_id,id)
);
alter table public.sales_host_events enable row level security;
revoke all on public.sales_host_events from public,anon,authenticated,service_role;
grant select,insert on public.sales_host_events to service_role;
revoke all on sequence public.sales_host_events_id_seq from public,anon,authenticated,service_role;
grant usage,select on sequence public.sales_host_events_id_seq to service_role;
create function public.sales_host_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'APPEND_ONLY' using errcode='42501';end $$;
create trigger sales_host_events_immutable before update or delete or truncate on public.sales_host_events for each statement execute function public.sales_host_immutable();

create function public.sales_host_status(w public.sales_worker_registrations) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('workerId',w.id,'managed',w.managed_authorized_at is not null and w.manager_token_hash is not null,
 'generation',w.host_generation,'desiredState',w.desired_state,
 'connectionState',case when w.revoked_at is not null then 'revoked' when w.last_seen_at>clock_timestamp()-interval '60 seconds' then 'online' else 'offline' end,
 'cliState',w.cli_state,'lastSeenAt',w.last_seen_at,'workerExpiresAt',w.expires_at,
 'reconnectRequested',w.reconnect_requested,
 'executionPaused',coalesce((select execution_paused from public.projects where id=w.project_id),true) or coalesce((select automation_paused from public.platform_config where id=1),true))
$$;
create function public.sales_host_authorize(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;
begin
 perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);
 select * into w from public.sales_worker_registrations where id=(p_input->>'workerId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid and revoked_at is null for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if w.managed_authorized_at is null then
  update public.sales_worker_registrations set managed_authorized_at=now() where id=w.id returning * into w;
  insert into public.sales_host_events(project_id,worker_id,action,generation) values(w.project_id,w.id,'authorize',w.host_generation);
 end if;return public.sales_host_status(w);
end $$;
create function public.sales_host_set_desired(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;a text:=p_input->>'action';
begin
 perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);
 if a is null or a not in('pause','resume','reconnect') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 select * into w from public.sales_worker_registrations where id=(p_input->>'workerId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid and managed_authorized_at is not null and revoked_at is null for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 update public.sales_worker_registrations set desired_state=case a when 'pause' then 'paused' when 'resume' then 'running' else desired_state end,reconnect_requested=case a when 'reconnect' then true else reconnect_requested end where id=w.id returning * into w;
 insert into public.sales_host_events(project_id,worker_id,action,generation) values(w.project_id,w.id,a,w.host_generation);
 return public.sales_host_status(w);
end $$;
create function public.sales_host_adopt(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;h text:=p_input->>'managerTokenHash';
begin
 w:=public.sales_worker(p_token_hash);
 if w.managed_authorized_at is null then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if h is null or h !~ '^[a-f0-9]{64}$' or h=w.token_hash then raise exception 'INVALID_BODY' using errcode='22023';end if;
 if w.manager_token_hash is not null and w.manager_token_hash<>h then raise exception 'FENCED' using errcode='40001';end if;
 if w.manager_token_hash is null then
  update public.sales_worker_registrations set manager_token_hash=h where id=w.id returning * into w;
  insert into public.sales_host_events(project_id,worker_id,action,generation) values(w.project_id,w.id,'adopt',w.host_generation);
 end if;
 return jsonb_build_object('workerId',w.id,'generation',w.host_generation,'expiresAt',w.expires_at);
end $$;
create function public.sales_host_registration(p_hash text) returns public.sales_worker_registrations language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;
begin
 select r.* into w from public.sales_worker_registrations r join public.projects p on p.id=r.project_id and p.owner_id=r.owner_id
 where r.manager_token_hash=p_hash and r.managed_authorized_at is not null and r.revoked_at is null for update of r;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;return w;
end $$;
create function public.sales_host_identity(p_token_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;
begin w:=public.sales_host_registration(p_token_hash);return jsonb_build_object('ownerId',w.owner_id,'projectId',w.project_id,'workerId',w.id,'generation',w.host_generation);end $$;
create function public.sales_host_rotate(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;rid uuid;h text;g integer;r jsonb;
begin
 w:=public.sales_host_registration(p_token_hash);
 rid:=(p_input->>'rotationId')::uuid;h:=p_input->>'newTokenHash';g:=(p_input->>'expectedGeneration')::integer;
 if rid is null or h is null or h !~ '^[a-f0-9]{64}$' or g is null or h=w.manager_token_hash then raise exception 'INVALID_BODY' using errcode='22023';end if;
 if rid=w.rotation_id then
  if h is distinct from w.rotation_hash or g is distinct from w.rotation_expected_generation then raise exception 'FENCED' using errcode='40001';end if;
  return w.rotation_receipt;
 end if;
 if g<>w.host_generation or h=w.token_hash then raise exception 'FENCED' using errcode='40001';end if;
 r:=jsonb_build_object('generation',g+1,'expiresAt',clock_timestamp()+interval '24 hours');
 update public.sales_worker_registrations set token_hash=h,expires_at=(r->>'expiresAt')::timestamptz,host_generation=g+1,rotation_id=rid,rotation_hash=h,rotation_expected_generation=g,rotation_receipt=r,reconnect_requested=false where id=w.id;
 insert into public.sales_host_events(project_id,worker_id,action,generation) values(w.project_id,w.id,'rotate',g+1);
 return r;
end $$;
create function public.sales_host_poll(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;
begin w:=public.sales_host_registration(p_token_hash);update public.sales_worker_registrations set last_seen_at=now() where id=w.id returning * into w;return public.sales_host_status(w);end $$;
create function public.sales_host_report_status(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;s text:=p_input->>'cliState';
begin
 w:=public.sales_host_registration(p_token_hash);
 if (p_input->>'generation')::integer is distinct from w.host_generation then raise exception 'FENCED' using errcode='40001';end if;
 if s is null or s not in('ready','blocked','unknown') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 update public.sales_worker_registrations set last_seen_at=now(),cli_state=s where id=w.id returning * into w;return public.sales_host_status(w);
end $$;
create function public.sales_host_read_status(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;
begin
 perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);
 select * into w from public.sales_worker_registrations where id=(p_input->>'workerId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;return public.sales_host_status(w);
end $$;
-- Stop managed dispatch without changing job generation or extending any lease.
create or replace function public.sales_claim_job(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_jobs;
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_stop(w.project_id);
 if w.desired_state<>'running' then raise exception 'STOPPED' using errcode='55000';end if;
 update public.sales_worker_registrations set last_seen_at=now() where id=w.id;
 perform public.sales_reconcile_expired(w.project_id);
 select * into j from public.sales_jobs where project_id=w.project_id and status='queued' order by created_at for update skip locked limit 1;
 if not found then return jsonb_build_object('ref',null);end if;
 perform public.sales_assert_contacts(j);
 update public.sales_jobs set status='running',worker_id=w.id,claim_id=gen_random_uuid(),lease_until=now()+interval '90 seconds' where id=j.id returning * into j;
 return jsonb_build_object('ref',jsonb_build_object('projectId',j.project_id,'jobId',j.id,'workerId',w.id,'claimId',j.claim_id,'generation',j.generation),'snapshot',j.snapshot);
end $$;
create or replace function public.sales_assert_claim(w public.sales_worker_registrations,v jsonb) returns public.sales_jobs language plpgsql security invoker set search_path='' as $$
declare j public.sales_jobs;
begin
 if w.desired_state<>'running' then raise exception 'STOPPED' using errcode='55000';end if;
 if w.id<>(v->>'workerId')::uuid or w.project_id<>(v->>'projectId')::uuid then raise exception 'FENCED' using errcode='40001';end if;
 select * into j from public.sales_jobs where id=(v->>'jobId')::uuid and project_id=w.project_id for update;
 if not found or j.worker_id<>w.id or j.claim_id is distinct from (v->>'claimId')::uuid or j.generation<>(v->>'generation')::integer or j.status<>'running' or j.lease_until<=clock_timestamp() then raise exception 'FENCED' using errcode='40001';end if;
 return j;
end $$;
do $$ declare f regprocedure;begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname like 'sales_host_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
