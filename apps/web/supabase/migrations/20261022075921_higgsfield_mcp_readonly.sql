-- Project-owned provider OAuth credentials. No social-token changes.
create table public.media_provider_connections (
 project_id uuid primary key references public.projects(id) on delete cascade,
 provider text not null default 'higgsfield' check (provider='higgsfield'),
 connection_version bigint not null default 0 check(connection_version>=0),
 issuer text not null default 'https://clerk.higgsfield.ai' check(issuer='https://clerk.higgsfield.ai'),
 encrypted_payload jsonb,
 subject text,
 identity_verified boolean not null default false,
 status text not null default 'disconnected' check(status in ('disconnected','connected','reconnect_required')),
 refresh_lease uuid,
 refresh_lease_until timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 check(encrypted_payload is null or (jsonb_typeof(encrypted_payload)='object' and encrypted_payload->>'v'='1')),
 check(status<>'connected' or encrypted_payload is not null),
 check(not identity_verified or subject is not null)
);
create table public.media_provider_oauth_states (
 state_hash text primary key check(state_hash ~ '^[a-f0-9]{64}$'),
 project_id uuid not null references public.media_provider_connections(project_id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 connection_version bigint not null check(connection_version>=0),
 encrypted_payload jsonb not null check(jsonb_typeof(encrypted_payload)='object' and encrypted_payload->>'v'='1'),
 expires_at timestamptz not null default (clock_timestamp()+interval '10 minutes'),
 consumed_at timestamptz
);
create index media_provider_oauth_states_project_idx on public.media_provider_oauth_states(project_id);
alter table public.media_provider_connections enable row level security;
alter table public.media_provider_oauth_states enable row level security;
revoke all on public.media_provider_connections,public.media_provider_oauth_states from public,anon,authenticated;
grant select,insert,update on public.media_provider_connections,public.media_provider_oauth_states to service_role;

create function public.higgsfield_connection_read(p_project uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select to_jsonb(c) from public.media_provider_connections c where c.project_id=p_project
$$;
create function public.higgsfield_oauth_create(p_project uuid,p_actor uuid,p_state text,p_version bigint,p_payload jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare current_version bigint;
begin
 insert into public.media_provider_connections(project_id) values(p_project) on conflict do nothing;
 select connection_version into current_version from public.media_provider_connections where project_id=p_project for update;
 if current_version is distinct from p_version then return false; end if;
 insert into public.media_provider_oauth_states(state_hash,project_id,actor_id,connection_version,encrypted_payload)
 values(p_state,p_project,p_actor,p_version,p_payload);
 return true;
end $$;
create function public.higgsfield_oauth_consume(p_state text,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.media_provider_oauth_states; c public.media_provider_connections;
begin
 -- Same lock order as disconnect: connection first, then attempt.
 select * into s from public.media_provider_oauth_states where state_hash=p_state and actor_id=p_actor;
 if not found then return null; end if;
 select * into c from public.media_provider_connections where project_id=s.project_id for update;
 update public.media_provider_oauth_states set consumed_at=clock_timestamp()
 where state_hash=p_state and actor_id=p_actor and consumed_at is null
 and expires_at>clock_timestamp() and connection_version=c.connection_version
 returning * into s;
 if not found then return null; end if;
 return to_jsonb(s);
end $$;
create function public.higgsfield_connection_save(p_project uuid,p_version bigint,p_payload jsonb,p_subject text,p_verified boolean,p_lease uuid default null) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.media_provider_connections set
 encrypted_payload=p_payload,subject=p_subject,identity_verified=p_verified,status='connected',
 connection_version=connection_version+1,refresh_lease=null,refresh_lease_until=null,updated_at=clock_timestamp()
 where project_id=p_project and connection_version=p_version
 and ((p_lease is null and refresh_lease is null) or
      (p_lease is not null and refresh_lease=p_lease and refresh_lease_until>clock_timestamp()));
 return found;
end $$;
create function public.higgsfield_refresh_acquire(p_project uuid,p_version bigint) returns uuid
language plpgsql security invoker set search_path='' as $$
declare lease uuid:=gen_random_uuid();
begin
 update public.media_provider_connections set refresh_lease=lease,refresh_lease_until=clock_timestamp()+interval '30 seconds'
 where project_id=p_project and connection_version=p_version and status='connected'
 and (refresh_lease is null or refresh_lease_until<=clock_timestamp());
 if not found then return null; end if;
 return lease;
end $$;
create function public.higgsfield_refresh_release(p_project uuid,p_lease uuid) returns void
language sql security invoker set search_path='' as $$
 update public.media_provider_connections set refresh_lease=null,refresh_lease_until=null
 where project_id=p_project and refresh_lease=p_lease
$$;
create function public.higgsfield_reconnect_required(p_project uuid,p_version bigint) returns void
language sql security invoker set search_path='' as $$
 update public.media_provider_connections set status='reconnect_required',encrypted_payload=null,
 identity_verified=false,connection_version=connection_version+1,refresh_lease=null,refresh_lease_until=null,updated_at=clock_timestamp()
 where project_id=p_project and connection_version=p_version
$$;
create function public.higgsfield_connection_disconnect(p_project uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 insert into public.media_provider_connections(project_id) values(p_project) on conflict do nothing;
 perform 1 from public.media_provider_connections where project_id=p_project for update;
 update public.media_provider_connections set encrypted_payload=null,subject=null,identity_verified=false,
 status='disconnected',connection_version=connection_version+1,refresh_lease=null,refresh_lease_until=null,updated_at=clock_timestamp()
 where project_id=p_project;
 update public.media_provider_oauth_states set consumed_at=coalesce(consumed_at,clock_timestamp()) where project_id=p_project;
end $$;

revoke all on function public.higgsfield_connection_read(uuid),
 public.higgsfield_oauth_create(uuid,uuid,text,bigint,jsonb),
 public.higgsfield_oauth_consume(text,uuid),
 public.higgsfield_connection_save(uuid,bigint,jsonb,text,boolean,uuid),
 public.higgsfield_refresh_acquire(uuid,bigint),
 public.higgsfield_refresh_release(uuid,uuid),
 public.higgsfield_reconnect_required(uuid,bigint),
 public.higgsfield_connection_disconnect(uuid) from public,anon,authenticated;
grant execute on function public.higgsfield_connection_read(uuid),
 public.higgsfield_oauth_create(uuid,uuid,text,bigint,jsonb),
 public.higgsfield_oauth_consume(text,uuid),
 public.higgsfield_connection_save(uuid,bigint,jsonb,text,boolean,uuid),
 public.higgsfield_refresh_acquire(uuid,bigint),
 public.higgsfield_refresh_release(uuid,uuid),
 public.higgsfield_reconnect_required(uuid,bigint),
 public.higgsfield_connection_disconnect(uuid) to service_role;
