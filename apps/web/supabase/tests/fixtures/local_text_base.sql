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
