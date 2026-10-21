-- Run ONLY in a fresh isolated PostgreSQL database.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.projects (id uuid PRIMARY KEY);
INSERT INTO public.projects(id) VALUES ('8f673c09-1c8f-4d78-876e-4c14bf1c89b3');
\i /tmp/handlarborsen_competitor_observations_v1.sql
ROLLBACK;
DO $audit$
BEGIN
  IF to_regclass('public.handlarborsen_competitor_observations') IS NOT NULL
    OR to_regclass('public.hb_competitor_observations_recent') IS NOT NULL
    OR to_regclass('public.projects') IS NOT NULL
  THEN RAISE EXCEPTION 'Rollback left database objects behind'; END IF;
END $audit$;
SELECT 'PASS: canonical migration transaction rollback left no objects' AS result;
