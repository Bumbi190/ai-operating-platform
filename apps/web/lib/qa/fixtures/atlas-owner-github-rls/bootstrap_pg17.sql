\set ON_ERROR_STOP on
\echo [fixture] Setting up SYNTHETIC PostgreSQL 17 roles and projects only
-- Only run on an isolated, disposable PostgreSQL 17 fixture. Never production.
create role authenticated noinherit nologin nobypassrls;
create role anon noinherit nologin nobypassrls;
create role service_role noinherit nologin bypassrls;
create role workflow_agent noinherit nologin nobypassrls;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
create table public.projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null
);
alter table public.projects enable row level security;
create policy projects_owner on public.projects
 for select to authenticated using (owner_id = (select auth.uid()));
grant select on public.projects to authenticated, service_role;
-- Replay the LIVE Supabase project's observed postgres default-privilege
-- configuration: new public tables receive broad grants to all three API roles
-- unless the migration explicitly REVOKES them first.
alter default privileges in schema public
 grant all on tables to anon, authenticated, service_role;

insert into auth.users (id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('99999999-9999-4999-8999-999999999999');
insert into public.projects (id,owner_id,slug) values
 ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','family-project'),
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','cars-project'),
 ('55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999999','foreign-project');
\echo [fixture] Synthetic owner and foreign project rows initialized
