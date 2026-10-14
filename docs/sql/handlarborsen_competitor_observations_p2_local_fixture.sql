-- Isolated PostgreSQL test fixture; NEVER run against hosted Supabase.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.projects (id uuid PRIMARY KEY);
INSERT INTO public.projects VALUES ('8f673c09-1c8f-4d78-876e-4c14bf1c89b3');
\i /tmp/handlarborsen_competitor_observations_p2_proposed.sql

DO $test$
DECLARE
  actual int;
BEGIN
  SELECT count(*) INTO actual FROM pg_policies
    WHERE schemaname='public' AND tablename='handlarborsen_competitor_observations';
  IF actual <> 0 THEN RAISE EXCEPTION 'RLS policies leaked: %', actual; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid='public.handlarborsen_competitor_observations'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) THEN RAISE EXCEPTION 'RLS and FORCE RLS required'; END IF;
  IF has_table_privilege('anon', 'public.handlarborsen_competitor_observations', 'SELECT')
    OR has_table_privilege('authenticated', 'public.handlarborsen_competitor_observations', 'INSERT')
    OR has_table_privilege('service_role', 'public.handlarborsen_competitor_observations', 'UPDATE')
    OR has_table_privilege('service_role', 'public.handlarborsen_competitor_observations', 'DELETE')
    OR has_table_privilege('service_role', 'public.handlarborsen_competitor_observations', 'TRUNCATE')
  THEN RAISE EXCEPTION 'privileges not least authority'; END IF;
  IF NOT has_table_privilege('service_role', 'public.handlarborsen_competitor_observations', 'SELECT,INSERT')
  THEN RAISE EXCEPTION 'service role read/insert missing'; END IF;
END $test$;

SET ROLE service_role;
INSERT INTO public.handlarborsen_competitor_observations
(project_id,source_id,observed_on,checked_at,status,title,title_digest)
VALUES
('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','auto1','2026-10-14','2026-10-14T10:00:00Z',
'metadata_checked','AUTO1 public title',encode(sha256(convert_to('AUTO1 public title','UTF8')),'hex'))
ON CONFLICT DO NOTHING;
-- Idempotent retry cannot rewrite an existing snapshot.
INSERT INTO public.handlarborsen_competitor_observations
(project_id,source_id,observed_on,checked_at,status,title,title_digest)
VALUES
('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','auto1','2026-10-14','2026-10-14T11:00:00Z',
'metadata_checked','DIFFERENT',encode(sha256(convert_to('DIFFERENT','UTF8')),'hex'))
ON CONFLICT DO NOTHING;

DO $test$
BEGIN
  IF (SELECT count(*) FROM public.handlarborsen_competitor_observations) <> 1
    OR (SELECT title FROM public.handlarborsen_competitor_observations LIMIT 1) <> 'AUTO1 public title'
  THEN RAISE EXCEPTION 'not first-write immutable'; END IF;

  BEGIN
    INSERT INTO public.handlarborsen_competitor_observations(project_id,source_id,observed_on,checked_at,status)
    VALUES ('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','evil-source','2026-10-14','2026-10-14T10:00:00Z','robots_unavailable');
    RAISE EXCEPTION 'unlisted source accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.handlarborsen_competitor_observations(project_id,source_id,observed_on,checked_at,status)
    VALUES ('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','bca','2026-10-13','2026-10-14T10:00:00Z','robots_unavailable');
    RAISE EXCEPTION 'wrong UTC day accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.handlarborsen_competitor_observations(project_id,source_id,observed_on,checked_at,status,title,title_digest)
    VALUES ('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','bca','2026-10-14','2026-10-14T10:00:00Z','metadata_checked','Verified page',repeat('0',64));
    RAISE EXCEPTION 'tampered digest accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.handlarborsen_competitor_observations(project_id,source_id,observed_on,checked_at,status,title,title_digest)
    VALUES ('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','autoproff','2026-10-14','2026-10-14T10:00:00Z','robots_unavailable','fake',repeat('0',64));
    RAISE EXCEPTION 'unverified status with title accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $test$;
RESET ROLE;
SELECT 'PASS: isolated competitor schema, RLS, least privilege, immutability and constraints' AS result;
