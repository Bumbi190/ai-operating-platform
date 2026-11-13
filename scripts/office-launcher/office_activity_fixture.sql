DO $$
DECLARE j jsonb; v uuid; legacy uuid; other uuid; failures text[]:='{}';
BEGIN
 SELECT id INTO legacy FROM public.fixture_ids;
 j:=public.office_visit_presence(legacy,repeat('a',64));
 IF j IS NULL OR j ? 'activityFacts' OR j ? 'readScope' THEN RAISE EXCEPTION 'pre-upgrade grant changed'; END IF;
 IF (SELECT read_scope FROM office_private.visits WHERE id=legacy)<>'identity_v1' THEN RAISE EXCEPTION 'default scope'; END IF;
 IF public.office_visit_activity_create('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',legacy,repeat('a',64),'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling') IS NOT NULL THEN RAISE EXCEPTION 'old grant upgraded'; END IF;
 v:=public.test_visit(2);
 j:=public.office_visit_activity_create('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v,repeat('b',64),'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling');
 IF j->>'readScope'<>'step_activity_v1' OR j->>'nativeActivityProtocol'<>'1' THEN RAISE EXCEPTION 'explicit activity scope missing'; END IF;
 INSERT INTO public.runs VALUES('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','running','55555555-5555-4555-8555-555555555555',clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '15 seconds',NULL,false,false,'[{"order":0,"agent_id":"33333333-3333-4333-8333-333333333333","prompt":"SECRET_STEP_PROMPT"}]',clock_timestamp(),'SECRET_INPUT');
 INSERT INTO public.run_logs VALUES('66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444',0,'user',clock_timestamp()-interval '1 second','SECRET_LOG_CONTENT');
 j:=public.office_visit_presence(v,repeat('b',64));
 IF j->'activityFacts'->>'complete'<>'true' OR jsonb_array_length(j->'activityFacts'->'runs')<>1 OR jsonb_array_length(j->'activityFacts'->'logs')<>1 THEN RAISE EXCEPTION 'bounded facts absent'; END IF;
 IF j::text LIKE '%SECRET_%' OR j::text LIKE '%"content"%' OR j::text LIKE '%"prompt"%' OR j::text LIKE '%"input"%' THEN RAISE EXCEPTION 'private content leaked'; END IF;
 -- Unrelated agent/run in the same project must not be returned.
 INSERT INTO public.runs VALUES('77777777-7777-4777-8777-777777777777','22222222-2222-4222-8222-222222222222','running','55555555-5555-4555-8555-555555555555',clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '15 seconds',NULL,false,false,'[{"order":0,"agent_id":"99999999-9999-4999-8999-999999999999"}]',clock_timestamp(),'SECRET_OTHER_AGENT');
 j:=public.office_visit_presence(v,repeat('b',64));
 IF j::text LIKE '%77777777-7777-4777-8777-777777777777%' THEN RAISE EXCEPTION 'other agent leaked'; END IF;
 -- Reply metadata is included so the existing classifier can clear a request.
 INSERT INTO public.run_logs VALUES('88888888-8888-4888-8888-888888888888','44444444-4444-4444-8444-444444444444',0,'assistant',clock_timestamp(),'SECRET_REPLY');
 j:=public.office_visit_presence(v,repeat('b',64));
 IF jsonb_array_length(j->'activityFacts'->'logs')<>2 OR j::text LIKE '%SECRET_REPLY%' THEN RAISE EXCEPTION 'reply metadata'; END IF;
 -- Even selected JSON keys must be typed and bounded before leaving SQL.
 UPDATE public.runs SET steps_snapshot='[{"order":0,"agent_id":"33333333-3333-4333-8333-333333333333"},{"order":{"prompt":"SECRET_NESTED"},"agent_id":"SECRET_LONG_STRING"}]' WHERE id='44444444-4444-4444-8444-444444444444';
 j:=public.office_visit_presence(v,repeat('b',64));
 IF j::text LIKE '%SECRET_%' OR j->'activityFacts'->>'complete'<>'false' THEN failures:=array_append(failures,'untyped snapshot escaped SQL'); END IF;
 UPDATE public.runs SET steps_snapshot='[{"order":0,"agent_id":"33333333-3333-4333-8333-333333333333"}]' WHERE id='44444444-4444-4444-8444-444444444444';
 UPDATE public.runs SET steps_snapshot='[{"order":{"prompt":"SECRET_OTHER"},"agent_id":"99999999-9999-4999-8999-999999999999"}]' WHERE id='77777777-7777-4777-8777-777777777777';
 j:=public.office_visit_presence(v,repeat('b',64));
 IF j->'activityFacts'->>'complete'<>'true' OR j::text LIKE '%SECRET_OTHER%' THEN RAISE EXCEPTION 'unrelated malformed step affects selected agent'; END IF;
 -- Cap project candidates before inspecting membership/snapshot JSON.
 INSERT INTO public.runs SELECT gen_random_uuid(),'22222222-2222-4222-8222-222222222222','running','55555555-5555-4555-8555-555555555555',clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '15 seconds',NULL,false,false,'[{"order":0,"agent_id":"99999999-9999-4999-8999-999999999999"}]',clock_timestamp(),'UNRELATED_FIXTURE' FROM generate_series(1,1000);
 j:=public.office_visit_presence(v,repeat('b',64));
 IF j->'activityFacts'->>'complete'<>'false' THEN failures:=array_append(failures,'project candidate bound bypassed by unrelated runs'); END IF;
 DELETE FROM public.runs WHERE input='UNRELATED_FIXTURE';
 -- Wrong credential, active session removal and project changes deny the full read.
 IF public.office_visit_presence(v,repeat('c',64)) IS NOT NULL THEN RAISE EXCEPTION 'digest accepted'; END IF;
 UPDATE public.projects SET owner_id='99999999-9999-4999-8999-999999999999';
 IF public.office_visit_presence(v,repeat('b',64)) IS NOT NULL THEN RAISE EXCEPTION 'owner change'; END IF;
 UPDATE public.projects SET owner_id='11111111-1111-4111-8111-111111111111';
 UPDATE public.agents SET project_id='99999999-9999-4999-8999-999999999999';
 IF public.office_visit_presence(v,repeat('b',64)) IS NOT NULL THEN RAISE EXCEPTION 'agent moved'; END IF;
 UPDATE public.agents SET project_id='22222222-2222-4222-8222-222222222222';
 DELETE FROM auth.sessions;
 IF public.office_visit_presence(v,repeat('b',64)) IS NOT NULL THEN RAISE EXCEPTION 'logout'; END IF;
 INSERT INTO auth.sessions VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
 -- Oversized selected snapshots must not cross even the internal RPC boundary.
 UPDATE public.runs SET steps_snapshot=(SELECT jsonb_agg(jsonb_build_object('order',0,'agent_id','33333333-3333-4333-8333-333333333333')) FROM generate_series(1,101)) WHERE id='44444444-4444-4444-8444-444444444444';
 j:=public.office_visit_presence(v,repeat('b',64));
 IF j->'activityFacts'->>'complete'<>'false' OR jsonb_array_length(j->'activityFacts'->'runs')<>0 THEN RAISE EXCEPTION 'oversized snapshot not closed'; END IF;
 UPDATE public.runs SET steps_snapshot='[{"order":0,"agent_id":"33333333-3333-4333-8333-333333333333"}]' WHERE id='44444444-4444-4444-8444-444444444444';
 -- Read-cap hit is unavailable, not an incomplete positive read.
 INSERT INTO public.run_logs SELECT gen_random_uuid(),'44444444-4444-4444-8444-444444444444',0,'user',clock_timestamp(),'SECRET_EXTRA' FROM generate_series(1,118);
 j:=public.office_visit_presence(v,repeat('b',64));
 IF j->'activityFacts'->>'complete'<>'false' OR jsonb_array_length(j->'activityFacts'->'logs')<>0 THEN RAISE EXCEPTION 'log cap not closed'; END IF;
 DELETE FROM public.run_logs;
 INSERT INTO public.runs SELECT gen_random_uuid(),'22222222-2222-4222-8222-222222222222','running','55555555-5555-4555-8555-555555555555',clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '15 seconds',NULL,false,false,'[{"order":0,"agent_id":"33333333-3333-4333-8333-333333333333"}]',clock_timestamp(),'SECRET_EXTRA' FROM generate_series(1,11);
 j:=public.office_visit_presence(v,repeat('b',64));
 IF j->'activityFacts'->>'complete'<>'false' OR jsonb_array_length(j->'activityFacts'->'runs')<>0 THEN RAISE EXCEPTION 'run cap not closed'; END IF;
 -- Terminal/revoked metadata never renews authority.
 PERFORM public.office_visit_revoke(v,repeat('b',64),NULL,NULL);
 IF public.office_visit_presence(v,repeat('b',64)) IS NOT NULL THEN RAISE EXCEPTION 'revoke ignored'; END IF;
 -- Another legacy create after upgrade stays identity-only.
 other:=public.test_visit(3);
 j:=public.office_visit_create('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other,repeat('d',64),'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling');
 j:=public.office_visit_presence(other,repeat('d',64));
 IF j IS NULL OR j ? 'activityFacts' THEN RAISE EXCEPTION 'legacy create silently expanded'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='office_private' OR (n.nspname='public' AND p.proname LIKE 'office_visit_%')) AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'function exposed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='office_private' AND (NOT p.prosecdef OR NOT ('search_path=""'=ANY(p.proconfig)))) THEN RAISE EXCEPTION 'private function configuration'; END IF;
 IF has_table_privilege('anon','office_private.visits','SELECT') OR has_table_privilege('authenticated','office_private.visits','SELECT') OR has_table_privilege('service_role','office_private.visits','SELECT') THEN RAISE EXCEPTION 'direct grant exposed'; END IF;
 IF cardinality(failures)>0 THEN RAISE EXCEPTION '%',array_to_string(failures,'; '); END IF;
END $$;
