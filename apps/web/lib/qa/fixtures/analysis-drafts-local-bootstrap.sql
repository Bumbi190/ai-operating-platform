-- Disposable network-none fixture; NOT a historical schema replay.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $roles$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
CREATE TABLE public.projects(id uuid PRIMARY KEY,slug text NOT NULL,owner_id uuid REFERENCES auth.users(id),atlas_mode text NOT NULL);
CREATE TABLE public.collector_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES public.projects(id),collector_id text NOT NULL,status text NOT NULL,ran_at timestamptz NOT NULL,snapshot_date date,metadata jsonb DEFAULT '{}');
INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000010'),('00000000-0000-4000-8000-000000000011');
INSERT INTO public.projects VALUES('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','handlarborsen','00000000-0000-4000-8000-000000000010','observer'),('00000000-0000-4000-8000-000000000099','other','00000000-0000-4000-8000-000000000010','observer');
