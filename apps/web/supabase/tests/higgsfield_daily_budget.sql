-- Run after the migration in an ISOLATED database only; rollback everything.
BEGIN;
INSERT INTO auth.users(id) VALUES
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');
INSERT INTO public.projects(id,name,slug,owner_id) VALUES
 ('20000000-0000-4000-8000-000000000001','The Prompt','ai-media-automation','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','Familje-Stunden','familje-stunden','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000003','Other Tenant','other','10000000-0000-4000-8000-000000000002');

DO $security$
DECLARE r text; name text;
BEGIN
 IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c
   WHERE c.oid='public.higgsfield_daily_reservations'::regclass) THEN
  RAISE EXCEPTION 'Budget journal must enable and FORCE RLS';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='higgsfield_daily_reservations') THEN
  RAISE EXCEPTION 'Budget journal cannot have client policies';
 END IF;
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(r,'public.higgsfield_daily_reservations',
   'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
   RAISE EXCEPTION 'API role % has direct budget journal privilege',r;
  END IF;
 END LOOP;
 FOREACH name IN ARRAY ARRAY['higgsfield_daily_budget_reserve','higgsfield_daily_budget_status'] LOOP
  IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND p.proname=name AND NOT p.prosecdef) THEN
   RAISE EXCEPTION 'DB_INTERNAL writer/readback % is not SECURITY DEFINER',name;
  END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
     AND p.proname=name AND has_function_privilege(r,p.oid,'EXECUTE')) THEN
    RAISE EXCEPTION 'Client role % can call protected RPC %',r,name;
   END IF;
  END LOOP;
 END LOOP;
END $security$;

DO $spending$
DECLARE
 a uuid:='20000000-0000-4000-8000-000000000001';
 b uuid:='20000000-0000-4000-8000-000000000002';
 stranger uuid:='20000000-0000-4000-8000-000000000003';
 id1 uuid:='30000000-0000-4000-8000-000000000001';
 id2 uuid:='30000000-0000-4000-8000-000000000002';
 id3 uuid:='30000000-0000-4000-8000-000000000003';
 result jsonb;
BEGIN
 SET LOCAL ROLE service_role;
 result:=public.higgsfield_daily_budget_status();
 IF result->>'budget_sek' <> '5' OR (result->>'reserved_sek')::numeric<>0 THEN
  RAISE EXCEPTION 'Initial budget status is not five and zero: %',result;
 END IF;
 result:=public.higgsfield_daily_budget_reserve(id1,a,4);
 IF result->>'reason'<>'reserved' OR (result->>'remaining_sek')::numeric<>1 THEN
  RAISE EXCEPTION 'Initial 4-credit reservation refused %',result;
 END IF;
 result:=public.higgsfield_daily_budget_reserve(id1,a,4);
 IF result->>'reason'<>'replay' THEN RAISE EXCEPTION 'Replay accepted %',result; END IF;
 result:=public.higgsfield_daily_budget_reserve(id2,b,2);
 IF result->>'reason'<>'daily_limit' THEN RAISE EXCEPTION 'Cross-project overspend allowed %',result; END IF;
 result:=public.higgsfield_daily_budget_reserve(id2,b,1);
 IF result->>'reason'<>'reserved' OR (result->>'remaining_sek')::numeric<>0 THEN
  RAISE EXCEPTION 'One credit of shared headroom was not admitted %',result;
 END IF;
 result:=public.higgsfield_daily_budget_reserve(id3,b,0.1);
 IF result->>'reason'<>'daily_limit' THEN RAISE EXCEPTION 'Exceeded 5 SEK %',result; END IF;
 result:=public.higgsfield_daily_budget_reserve(id3,stranger,0.1);
 IF result->>'reason'<>'wrong_project' THEN RAISE EXCEPTION 'Unknown project allowed %',result; END IF;
 result:=public.higgsfield_daily_budget_reserve(id3,a,'NaN'::numeric);
 IF result->>'reason'<>'invalid_request' THEN RAISE EXCEPTION 'Invalid quote allowed %',result; END IF;
 result:=public.higgsfield_daily_budget_status();
 IF (result->>'reserved_sek')::numeric<>5
   OR (result->>'reserved_credits')::numeric<>5
   OR (result->>'remaining_sek')::numeric<>0 THEN
  RAISE EXCEPTION 'Shared daily accounting incorrect: %',result;
 END IF;
 RESET ROLE;
END $spending$;

-- The Swedish local day is 23/25 hours on DST transitions, not 24.
DO $clock$
DECLARE
 spring_start timestamptz;
 spring_end timestamptz;
 autumn_start timestamptz;
 autumn_end timestamptz;
BEGIN
 spring_start:='2026-03-29 00:00:00'::timestamp AT TIME ZONE 'Europe/Stockholm';
 spring_end:='2026-03-30 00:00:00'::timestamp AT TIME ZONE 'Europe/Stockholm';
 autumn_start:='2026-10-25 00:00:00'::timestamp AT TIME ZONE 'Europe/Stockholm';
 autumn_end:='2026-10-26 00:00:00'::timestamp AT TIME ZONE 'Europe/Stockholm';
 IF spring_end-spring_start <> interval '23 hours' OR autumn_end-autumn_start <> interval '25 hours' THEN
  RAISE EXCEPTION 'Swedish DST day periods not intact';
 END IF;
END $clock$;
ROLLBACK;
SELECT 'Higgsfield global daily SEK 5 journal, replay, ACL and DST: PASS' AS result;
