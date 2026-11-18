-- All rows are synthetic. Assertions run in a throwaway database only.
CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
SELECT pg_temp.assert(NOT has_schema_privilege('anon','office_private','USAGE'),'anon schema');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','office_private.visits','SELECT'),'authenticated table');
SELECT pg_temp.assert((SELECT relrowsecurity FROM pg_class WHERE oid='office_private.visits'::regclass),'RLS');
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.office_visit_presence(uuid,text)','EXECUTE'),'anon RPC');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','office_private.presence(uuid,text)','EXECUTE'),'authenticated private function');
SELECT pg_temp.assert(has_function_privilege('service_role','public.office_visit_presence(uuid,text)','EXECUTE'),'service RPC');
SELECT pg_temp.assert((SELECT NOT prosecdef FROM pg_proc WHERE oid='public.office_visit_presence(uuid,text)'::regprocedure),'public invoker');
SELECT pg_temp.assert((SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid='office_private.presence(uuid,text)'::regprocedure),'private locked definer');
CREATE TEMP TABLE ids AS SELECT
 ('00000000-0000-7000-8000-000000000001')::uuid AS visit;
UPDATE ids SET visit=(lpad(to_hex(floor(extract(epoch FROM clock_timestamp())*1000)::bigint),12,'0') || '70008000000000000001')::uuid;
CREATE TEMP TABLE result AS SELECT public.office_visit_create(
 '11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',visit,repeat('a',64),
 '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling') AS data FROM ids;
SELECT pg_temp.assert((SELECT data IS NOT NULL FROM result),'create own identity');
SELECT pg_temp.assert((SELECT public.office_visit_presence(visit,repeat('b',64)) IS NULL FROM ids),'digest cannot impersonate secret');
SELECT pg_temp.assert((SELECT public.office_visit_presence(visit,repeat('a',64))->>'agentName'='Synthetic agent' FROM ids),'selected identity');
SELECT pg_temp.assert((SELECT public.office_visit_presence(visit,repeat('a',64))::text NOT LIKE '%SECRET PROMPT%' FROM ids),'minimal data');
SELECT pg_temp.assert((SELECT public.office_visit_create('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',visit,repeat('a',64),'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling') IS NULL FROM ids),'replay create');
UPDATE public.agents SET project_id='44444444-4444-4444-8444-444444444444';
SELECT pg_temp.assert((SELECT public.office_visit_presence(visit,repeat('a',64)) IS NULL FROM ids),'agent moved');
UPDATE public.agents SET project_id='22222222-2222-4222-8222-222222222222';
UPDATE public.projects SET owner_id='55555555-5555-4555-8555-555555555555';
SELECT pg_temp.assert((SELECT public.office_visit_presence(visit,repeat('a',64)) IS NULL FROM ids),'owner transfer');
UPDATE public.projects SET owner_id='11111111-1111-4111-8111-111111111111';
DELETE FROM auth.sessions;
SELECT pg_temp.assert((SELECT public.office_visit_presence(visit,repeat('a',64)) IS NULL FROM ids),'server logout');
INSERT INTO auth.sessions VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
UPDATE office_private.visits SET lease_until=clock_timestamp()-interval '1 second';
SELECT pg_temp.assert((SELECT public.office_visit_presence(visit,repeat('a',64)) IS NULL FROM ids),'expired lease no revival');
UPDATE office_private.visits SET lease_until=clock_timestamp()+interval '20 seconds',expires_at=clock_timestamp()-interval '1 second';
SELECT pg_temp.assert((SELECT public.office_visit_presence(visit,repeat('a',64)) IS NULL FROM ids),'hard expiry');
SELECT pg_temp.assert((SELECT public.office_visit_revoke(visit,repeat('b',64),NULL,NULL)=false FROM ids),'wrong revoke');
SELECT pg_temp.assert((SELECT public.office_visit_revoke(visit,repeat('a',64),NULL,NULL) FROM ids),'scoped revoke');
SET ROLE anon;
DO $$BEGIN
 BEGIN PERFORM public.office_visit_presence('00000000-0000-7000-8000-000000000001',repeat('a',64));
 RAISE EXCEPTION 'anon unexpectedly executed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
SET ROLE service_role;
SELECT public.office_visit_presence('00000000-0000-7000-8000-000000000001',repeat('a',64));
RESET ROLE;
CREATE FUNCTION pg_temp.fresh_id(n int) RETURNS uuid LANGUAGE sql AS $$
 SELECT (lpad(to_hex(floor(extract(epoch FROM clock_timestamp())*1000)::bigint),12,'0')||'70008000'||lpad(to_hex(n),12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.create_visit(v uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.office_visit_create('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v,repeat('a',64),'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling');
$$;
DELETE FROM office_private.create_attempts;
SELECT pg_temp.assert(public.office_visit_create('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',pg_temp.fresh_id(10),repeat('a',64),'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling') IS NULL,'session user mismatch');
CREATE TEMP TABLE replacement AS SELECT pg_temp.fresh_id(20) AS first,pg_temp.fresh_id(21) AS second;
SELECT pg_temp.assert((SELECT pg_temp.create_visit(first) IS NOT NULL FROM replacement),'replacement first');
SELECT pg_temp.assert((SELECT pg_temp.create_visit(second) IS NOT NULL FROM replacement),'replacement second');
SELECT pg_temp.assert((SELECT public.office_visit_presence(first,repeat('a',64)) IS NULL FROM replacement),'old replaced grant denied');
SELECT pg_temp.assert((SELECT public.office_visit_presence(second,repeat('a',64)) IS NOT NULL FROM replacement),'replacement current grant');
SELECT pg_temp.assert(pg_temp.create_visit(pg_temp.fresh_id(22)) IS NOT NULL,'third attempt');
SELECT pg_temp.assert(pg_temp.create_visit(pg_temp.fresh_id(23)) IS NOT NULL,'fourth attempt');
SELECT pg_temp.assert(pg_temp.create_visit(pg_temp.fresh_id(24)) IS NOT NULL,'fifth attempt');
SELECT pg_temp.assert(pg_temp.create_visit(pg_temp.fresh_id(25)) IS NULL,'sixth attempt denied');
SELECT pg_temp.assert((SELECT count(*)=5 FROM office_private.create_attempts),'attempt rows bounded');
DELETE FROM office_private.create_attempts;
DELETE FROM office_private.visits;
INSERT INTO office_private.visits SELECT ('00000000-0000-7000-8000-'||lpad(to_hex(n),12,'0'))::uuid,
 '11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),
 '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling',
 clock_timestamp(),clock_timestamp()+interval '4 hours',clock_timestamp(),clock_timestamp() FROM generate_series(1,100) n;
SELECT pg_temp.assert(pg_temp.create_visit(pg_temp.fresh_id(101)) IS NULL,'100 metadata cap');
SELECT pg_temp.assert((SELECT count(*)=100 FROM office_private.visits),'cap no additional row');
UPDATE office_private.visits SET created_at=created_at-interval '1 hour';
SELECT pg_temp.assert(pg_temp.create_visit(pg_temp.fresh_id(102)) IS NOT NULL,'lazy bounded cleanup');
SELECT pg_temp.assert((SELECT count(*)=1 FROM office_private.visits),'cleanup removed stale metadata');
SELECT pg_temp.assert(pg_temp.create_visit('00000000-0000-7000-8000-000000000001') IS NULL,'old claim cannot be reused after tombstone cleanup');
DELETE FROM office_private.create_attempts;
SELECT 'office_visit_sql_verified' AS result;
