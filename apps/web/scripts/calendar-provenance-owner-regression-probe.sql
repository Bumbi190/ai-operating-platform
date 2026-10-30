-- TEST ONLY: full migrated owned replay, no hosted connection.
BEGIN;
SET LOCAL statement_timeout='15s';
INSERT INTO auth.users(id) VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO public.projects(id,owner_id,name,slug) VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Provenance regression A','provenance-regression-a'),
('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Provenance regression B','provenance-regression-b');
INSERT INTO public.assets(id,project_id,kind,mime_type,byte_size,checksum_sha256,width,height,storage_bucket,storage_path) VALUES
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','image','image/jpeg',1024,'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',600,600,'synthetic-only','provenance-regression/1.jpg'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','image','image/jpeg',1024,'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',600,600,'synthetic-only','provenance-regression/2.jpg'),
('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','image','image/jpeg',1024,'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',600,600,'synthetic-only','provenance-regression/3.jpg'),
('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','image','image/jpeg',1024,'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',600,600,'synthetic-only','provenance-regression/4.jpg');
INSERT INTO public.asset_provenance(asset_id,source,simulated) VALUES('10000000-0000-0000-0000-000000000001','uploaded',true),('10000000-0000-0000-0000-000000000002','uploaded',true);
SAVEPOINT proposal;
-- TEST ONLY. Evaluate a *possible* database-hardening strategy
-- in the disposable owned cross-tree PostgreSQL database.
-- All DDL is inside a single rolled-back transaction. Never migrate
-- this file or run it against hosted Supabase.

-- Whole-table erasure ignores row-level security. Normal signed-in
-- users need neither capability on the provenance table.
REVOKE TRUNCATE ON TABLE public.asset_provenance FROM anon,authenticated;

-- Make the old callbacks independent of an attacker-modified search_path.
ALTER FUNCTION public.asset_reject_mutation() SET search_path TO '';
ALTER FUNCTION public.asset_provenance_reject_orphan_delete() SET search_path TO '';
REVOKE ALL ON FUNCTION public.asset_reject_mutation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.asset_provenance_reject_orphan_delete()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asset_reject_mutation()
 TO service_role;
GRANT EXECUTE ON FUNCTION public.asset_provenance_reject_orphan_delete()
 TO service_role;

-- The existing legacy guard refuses all asset-provenance changes.
-- Attaching it to the statement-level erase operation complements RLS.
CREATE TRIGGER asset_provenance_no_truncate
 BEFORE TRUNCATE ON public.asset_provenance
 FOR EACH STATEMENT EXECUTE FUNCTION public.asset_reject_mutation();

DO $reject_full_erase$
BEGIN
 BEGIN
  TRUNCATE public.asset_provenance;
  RAISE EXCEPTION 'ASSET_PROVENANCE_TRUNCATE_UNEXPECTEDLY_SUCCEEDED';
 EXCEPTION WHEN SQLSTATE '23001' THEN
  IF SQLERRM NOT LIKE '%append-only%' THEN RAISE; END IF;
 END;
END $reject_full_erase$;

SELECT jsonb_build_object(
 'anonCanTruncate',has_table_privilege('anon','public.asset_provenance','TRUNCATE'),
 'authenticatedCanTruncate',has_table_privilege('authenticated','public.asset_provenance','TRUNCATE'),
 'anonLegacyFunction',has_function_privilege('anon','public.asset_reject_mutation()','EXECUTE'),
 'authenticatedLegacyFunction',has_function_privilege('authenticated','public.asset_reject_mutation()','EXECUTE'),
 'serviceLegacyFunction',has_function_privilege('service_role','public.asset_reject_mutation()','EXECUTE'),
 'statementGuardCount',(SELECT count(*) FROM pg_trigger
  WHERE tgrelid='public.asset_provenance'::regclass AND NOT tgisinternal
   AND (tgtype&32)=32),
 'lockedFunctionCount',(SELECT count(*) FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
   AND p.proname IN ('asset_reject_mutation','asset_provenance_reject_orphan_delete')
   AND p.proconfig=ARRAY['search_path=""']::text[])
);

DO $test$ BEGIN IF has_table_privilege('anon','public.asset_provenance','TRUNCATE') OR has_table_privilege('authenticated','public.asset_provenance','TRUNCATE') OR has_function_privilege('authenticated','public.asset_reject_mutation()','EXECUTE') OR has_function_privilege('authenticated','public.asset_provenance_reject_orphan_delete()','EXECUTE') THEN RAISE EXCEPTION 'privilege not revoked'; END IF; IF (SELECT count(*) FROM pg_proc WHERE proname IN ('asset_reject_mutation','asset_provenance_reject_orphan_delete') AND proconfig=ARRAY['search_path=""']::text[])<>2 THEN RAISE EXCEPTION 'search path not locked'; END IF; RAISE NOTICE 'CASE PASS: hardened ACL and callback settings'; END $test$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true); SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
DO $test$ BEGIN IF (SELECT count(*) FROM public.asset_provenance WHERE asset_id IN ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'))<>1 THEN RAISE EXCEPTION 'owner visibility wrong'; END IF; RAISE NOTICE 'CASE PASS: owner sees only own provenance'; END $test$;

DO $test$ BEGIN INSERT INTO public.asset_provenance(asset_id,source) VALUES('10000000-0000-0000-0000-000000000003','uploaded'); IF NOT EXISTS(SELECT 1 FROM public.asset_provenance WHERE asset_id='10000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'insert missing'; END IF; RAISE NOTICE 'CASE PASS: owner adds provenance after EXECUTE revoke'; END $test$;

DO $test$ BEGIN BEGIN UPDATE public.asset_provenance SET source='forged' WHERE asset_id='10000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'unexpected success'; EXCEPTION WHEN SQLSTATE '23001' THEN NULL; END; RAISE NOTICE 'CASE PASS: owner cannot rewrite provenance'; END $test$;

DO $test$ BEGIN BEGIN DELETE FROM public.asset_provenance WHERE asset_id='10000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'unexpected success'; EXCEPTION WHEN SQLSTATE '23001' THEN NULL; END; RAISE NOTICE 'CASE PASS: owner cannot remove provenance while asset survives'; END $test$;

DO $test$ BEGIN DELETE FROM public.asset_provenance WHERE asset_id='10000000-0000-0000-0000-000000000002'; IF FOUND THEN RAISE EXCEPTION 'foreign provenance removed'; END IF; DELETE FROM public.assets WHERE id='10000000-0000-0000-0000-000000000002'; IF FOUND THEN RAISE EXCEPTION 'foreign asset removed'; END IF; RAISE NOTICE 'CASE PASS: foreign asset and provenance cannot be deleted'; END $test$;

DO $test$ BEGIN BEGIN INSERT INTO public.asset_provenance(asset_id,source) VALUES('10000000-0000-0000-0000-000000000004','uploaded'); RAISE EXCEPTION 'unexpected success'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END; RAISE NOTICE 'CASE PASS: foreign project insert refused'; END $test$;

DO $test$ BEGIN BEGIN TRUNCATE public.asset_provenance; RAISE EXCEPTION 'unexpected success'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END; RAISE NOTICE 'CASE PASS: authenticated cannot truncate'; END $test$;

DO $test$ BEGIN DELETE FROM public.assets WHERE id='10000000-0000-0000-0000-000000000001'; IF NOT FOUND THEN RAISE EXCEPTION 'owner asset not removed'; END IF; RAISE NOTICE 'CASE PASS: owner asset delete cascades after EXECUTE revoke'; END $test$;

RESET ROLE;
DO $test$ BEGIN IF EXISTS(SELECT 1 FROM public.asset_provenance WHERE asset_id='10000000-0000-0000-0000-000000000001') OR NOT EXISTS(SELECT 1 FROM public.asset_provenance WHERE asset_id='10000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'cascade mismatch'; END IF; RAISE NOTICE 'CASE PASS: cascade physically removed only owned rows'; END $test$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true); SELECT set_config('request.jwt.claims','{}',true);
DO $test$ BEGIN IF EXISTS(SELECT 1 FROM public.asset_provenance) THEN RAISE EXCEPTION 'anonymous visibility'; END IF; RAISE NOTICE 'CASE PASS: anonymous sees no provenance'; END $test$;

DO $test$ BEGIN BEGIN TRUNCATE public.asset_provenance; RAISE EXCEPTION 'unexpected success'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END; RAISE NOTICE 'CASE PASS: anonymous cannot truncate'; END $test$;

RESET ROLE;
SET LOCAL ROLE service_role;
DO $test$ BEGIN BEGIN TRUNCATE public.asset_provenance; RAISE EXCEPTION 'unexpected success'; EXCEPTION WHEN SQLSTATE '23001' THEN NULL; END; RAISE NOTICE 'CASE PASS: service role truncate stopped by trigger'; END $test$;

DO $test$ BEGIN BEGIN UPDATE public.asset_provenance SET source='forged' WHERE asset_id='10000000-0000-0000-0000-000000000002'; RAISE EXCEPTION 'unexpected success'; EXCEPTION WHEN SQLSTATE '23001' THEN NULL; END; RAISE NOTICE 'CASE PASS: service role cannot rewrite provenance'; END $test$;

DO $test$ BEGIN DELETE FROM public.assets WHERE id='10000000-0000-0000-0000-000000000002'; IF EXISTS(SELECT 1 FROM public.asset_provenance WHERE asset_id='10000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'service cascade missing'; END IF; RAISE NOTICE 'CASE PASS: service role asset deletion cascades'; END $test$;

RESET ROLE;
ROLLBACK TO SAVEPOINT proposal;
DO $test$ BEGIN IF NOT has_table_privilege('authenticated','public.asset_provenance','TRUNCATE') OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='asset_provenance_no_truncate') OR (SELECT count(*) FROM public.asset_provenance WHERE asset_id IN ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'))<>2 OR NOT has_function_privilege('authenticated','public.asset_reject_mutation()','EXECUTE') THEN RAISE EXCEPTION 'rollback mismatch'; END IF; RAISE NOTICE 'CASE PASS: rollback restores baseline privileges trigger and data'; END $test$;

SELECT 'FULL PROVENANCE REGRESSION PASS 16';
ROLLBACK;
