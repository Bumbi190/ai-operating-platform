-- Isolated PostgreSQL 17 fixture ONLY.
-- Must be run in a NEW dedicated disposable database, never Omnira production.
-- It intentionally creates minimal versions of existing public tables.
\set ON_ERROR_STOP on

CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users(id) VALUES ('66666666-6666-4666-8666-666666666666');
CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id)
);
CREATE TABLE public.media_scripts (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id),
  version integer,
  hook text,
  script text,
  captions jsonb,
  cta text
);
CREATE TABLE public.runs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id),
  claim_id uuid,
  status text NOT NULL,
  lease_until timestamptz,
  cancel_requested boolean NOT NULL DEFAULT false
);

-- These roles already exist in the dedicated local test cluster. Do NOT
-- create or change global roles. service_role has BYPASSRLS there.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, UPDATE ON public.media_scripts TO service_role;
-- SELECT FOR SHARE needs UPDATE privileges as well; Omnira production
-- service_role has both SELECT and UPDATE on runs (read-only verified).
GRANT SELECT, UPDATE ON public.runs TO service_role;
GRANT SELECT ON public.projects TO service_role;
ALTER TABLE public.media_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

INSERT INTO public.projects(id,owner_id)
VALUES ('11111111-1111-4111-8111-111111111111',
        '66666666-6666-4666-8666-666666666666');
INSERT INTO public.media_scripts (
  id,project_id,version,hook,script,captions,cta
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  1,
  'Research team announced a safe new API.',
  'The technical documentation was published today.',
  '["Research API","Official documentation"]'::jsonb,
  'Read the official guide.'
);
INSERT INTO public.runs (
  id,project_id,claim_id,status,lease_until,cancel_requested
) VALUES (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444',
  'running', now()+ interval '1 hour', false
);
