-- Disposable synthetic schema ONLY; not a production migration.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key);
create table public.projects(id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,execution_paused boolean not null default false);
create table public.conversations(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,project_id uuid references public.projects(id) on delete cascade);
create table public.conversation_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.conversations(id) on delete cascade,role text not null,content text,tool_data jsonb,created_at timestamptz default now());
create table public.project_lifecycle(project_id uuid primary key references public.projects(id) on delete cascade,owner_id uuid not null,state text not null);
create table public.assets(id uuid primary key,project_id uuid not null references public.projects(id),visibility text,kind text,mime_type text,status text,byte_size bigint,checksum_sha256 text,storage_bucket text,storage_path text);
create table public.asset_provenance(asset_id uuid primary key references public.assets(id),source text,provider_metadata jsonb);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
-- Simulate Supabase's previously observed permissive defaults.
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
