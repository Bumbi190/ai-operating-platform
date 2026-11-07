-- SYNTHETIC, DISPOSABLE Postgres fixture, never production.
-- Minimal schemas and functions standing in for Supabase Auth and Storage.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table public.projects (
 id uuid primary key,
 owner_id uuid not null references auth.users(id)
);
alter table public.projects enable row level security;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated,anon;
grant select on public.projects to authenticated;
create policy synthetic_project_owner_read on public.projects
 for select to authenticated
 using(owner_id = (select auth.uid()));

create schema storage;
create table storage.objects(
 id uuid primary key,
 bucket_id text not null,
 name text not null
);
create function storage.allow_any_operation(expected_operations text[])
returns boolean language sql stable as $$
 select current_setting('storage.operation',true)=any(expected_operations)
$$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant execute on function storage.allow_any_operation(text[]) to authenticated,anon;
grant select on storage.objects to authenticated,anon;
-- Explicitly no insert/update/delete grant: all writing must fail closed.
