-- Disposable, network-isolated test database only. These are prerequisite contracts,
-- not a replacement production schema or a full migration-replay claim.
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;end$$;
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;end$$;
do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls;end if;end$$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key);
create table public.projects(id uuid primary key,owner_id uuid not null references auth.users,execution_paused boolean not null default false,paused_at timestamptz,paused_reason text);
create table public.conversations(id uuid primary key,user_id uuid not null references auth.users);
create table public.platform_config(id integer primary key,automation_paused boolean not null,paused_at timestamptz,paused_reason text);
insert into public.platform_config values(1,false,null,null);
-- Same function body as the canonical 20260831_unified_stop_authority migration.
create function public.stop_state(p_project_id uuid default null)
returns table(global_paused boolean,global_paused_at timestamptz,global_paused_reason text,project_requested boolean,project_found boolean,project_paused boolean,project_paused_at timestamptz,project_paused_reason text)
language sql stable security definer set search_path to '' as $$
 select pc.automation_paused,pc.paused_at,pc.paused_reason,(p_project_id is not null),(p.id is not null),p.execution_paused,p.paused_at,p.paused_reason
 from public.platform_config pc left join public.projects p on p_project_id is not null and p.id=p_project_id where pc.id=1;
$$;
revoke all on function public.stop_state(uuid) from public,anon,authenticated;
grant execute on function public.stop_state(uuid) to service_role;
grant usage on schema auth,public to anon,authenticated,service_role;
grant execute on function auth.uid() to authenticated,service_role;
grant select on projects,conversations to service_role;

grant select on public.projects to authenticated;
-- Canonical runs/cost-events prerequisite columns used by this slice. Still a
-- disposable parent-contract fixture, not full repository migration replay.
create table public.runs(id uuid primary key default gen_random_uuid(),project_id uuid not null references projects,workflow_id uuid,workflow_instance_id uuid,kind text,status text not null default 'pending',input jsonb not null default '{}',context jsonb not null default '{}',claim_id uuid,attempts integer not null default 0,max_attempts integer not null default 3,cancel_requested boolean not null default false,claimed_at timestamptz,lease_until timestamptz,started_at timestamptz,finished_at timestamptz,dispatch_started_at timestamptz,reconciliation_required boolean not null default false,reconciliation_reason text,error text,created_at timestamptz not null default now());
create table public.cost_events(id uuid primary key default gen_random_uuid(),run_id uuid references runs,project_id uuid references projects,provider text,model text,operation text,tokens_in integer,tokens_out integer,cost_usd numeric,metadata jsonb default '{}',created_at timestamptz default now());
alter table public.runs enable row level security;alter table public.cost_events enable row level security;
grant all on public.runs,public.cost_events to service_role;
