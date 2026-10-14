-- LOCAL TEST ONLY. Run after p2_local_fixture.sql; not a migration.
-- The minimal fixture creates projects(id) only, but post-apply preflight
-- deliberately checks the real project's slug as well.
ALTER TABLE public.projects ADD COLUMN slug text;
UPDATE public.projects SET slug='handlarborsen'
  WHERE id='8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (name text NOT NULL);
INSERT INTO supabase_migrations.schema_migrations VALUES
  ('handlarborsen_competitor_observations_v1');
