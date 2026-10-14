-- TEST ONLY: local official Supabase PG 17.6 container, never production.
-- Supabase image already creates anon/authenticated/service_role.
CREATE TABLE public.projects (id uuid PRIMARY KEY, slug text NOT NULL);
INSERT INTO public.projects (id, slug)
  VALUES ('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','handlarborsen');
\i /tmp/handlarborsen_competitor_observations_v1.sql
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (name text NOT NULL);
INSERT INTO supabase_migrations.schema_migrations (name)
  VALUES ('handlarborsen_competitor_observations_v1');
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid='public.handlarborsen_competitor_observations'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) THEN RAISE EXCEPTION 'RLS + FORCE missing'; END IF;
  IF EXISTS (SELECT FROM pg_policy WHERE polrelid='public.handlarborsen_competitor_observations'::regclass)
  THEN RAISE EXCEPTION 'unexpected RLS policy'; END IF;
  IF has_table_privilege('anon', 'public.handlarborsen_competitor_observations', 'SELECT')
    OR has_table_privilege('authenticated', 'public.handlarborsen_competitor_observations', 'SELECT')
    OR has_table_privilege('authenticated', 'public.handlarborsen_competitor_observations', 'INSERT')
    OR has_table_privilege('service_role', 'public.handlarborsen_competitor_observations', 'UPDATE')
    OR has_table_privilege('service_role', 'public.handlarborsen_competitor_observations', 'DELETE')
    OR has_table_privilege('service_role', 'public.handlarborsen_competitor_observations', 'TRUNCATE')
  THEN RAISE EXCEPTION 'privilege leak'; END IF;
  IF NOT has_table_privilege('service_role', 'public.handlarborsen_competitor_observations', 'SELECT, INSERT')
  THEN RAISE EXCEPTION 'read/insert missing'; END IF;
END $check$;
SELECT 'PASS: PG17.6 migration, RLS, privileges' AS verification;
