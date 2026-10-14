-- Isolated rollback test on Supabase PG17.6 image; never production.
BEGIN;
CREATE TABLE public.projects (id uuid PRIMARY KEY, slug text);
INSERT INTO public.projects(id,slug)
  VALUES ('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','handlarborsen');
\i /tmp/handlarborsen_competitor_observations_v1.sql
ROLLBACK;
DO $audit$
BEGIN
  IF to_regclass('public.projects') IS NOT NULL OR
     to_regclass('public.handlarborsen_competitor_observations') IS NOT NULL OR
     to_regclass('public.hb_competitor_observations_recent') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback left database objects';
  END IF;
END $audit$;
SELECT 'PASS: PG17.6 transactional migration rollback' as verification;
