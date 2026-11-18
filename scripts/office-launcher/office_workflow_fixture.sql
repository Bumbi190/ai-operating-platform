-- All identifiers and workflow content in this fixture are synthetic.
CREATE FUNCTION public.assert_ok(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',label; END IF; END $$;
CREATE TABLE public.workflow_fixture(id uuid);
DO $$
DECLARE j jsonb; v uuid:=public.test_visit(3); legacy uuid; prior bigint; bad jsonb;
BEGIN
 SELECT id INTO legacy FROM public.fixture_ids;
 PERFORM public.assert_ok((SELECT read_scope='identity_v1' AND workflow_revision=0 FROM office_private.visits WHERE id=legacy),'old grant upgraded');
 PERFORM public.assert_ok(public.office_visit_workflow_presence(legacy,repeat('a',64)) IS NULL,'identity scope gained workflow');
 j:=public.office_visit_presence(legacy,repeat('a',64));
 PERFORM public.assert_ok(j IS NOT NULL AND NOT(j ? 'workflowFacts'),'legacy identity regression');
 -- Reusing an existing ID cannot upgrade its authority.
 PERFORM public.assert_ok(public.office_visit_workflow_create('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',legacy,repeat('a',64),'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling') IS NULL,'scope upgrade by replay');
 -- Existing activity producer also retains exactly its narrower scope.
 j:=public.office_visit_activity_create('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',public.test_visit(2),repeat('d',64),'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling');
 PERFORM public.assert_ok(j->>'readScope'='step_activity_v1','activity scope changed');
 PERFORM public.assert_ok(public.office_visit_workflow_presence((j->>'visitId')::uuid,repeat('d',64)) IS NULL,'activity scope gained workflow');
 j:=public.office_visit_presence((j->>'visitId')::uuid,repeat('d',64));
 PERFORM public.assert_ok(j ? 'activityFacts' AND NOT(j ? 'workflowFacts'),'activity regression after migration');
 j:=public.office_visit_workflow_create('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v,repeat('b',64),'22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','office-familje-pling');
 PERFORM public.assert_ok(j->>'readScope'='workflow_state_v1' AND j->>'nativeWorkflowProtocol'='1','new grant');
 INSERT INTO public.workflow_fixture VALUES(v);
 SELECT workflow_revision INTO prior FROM office_private.visits WHERE id=v;
 PERFORM public.assert_ok(public.office_visit_presence(v,repeat('b',64)) IS NULL,'old presence accepted new scope');
 PERFORM public.assert_ok(public.office_visit_workflow_presence(v,repeat('c',64)) IS NULL,'wrong secret accepted');
 PERFORM public.assert_ok((SELECT workflow_revision=prior FROM office_private.visits WHERE id=v),'rejected read renewed revision');
 j:=public.office_visit_workflow_presence(v,repeat('b',64));
 PERFORM public.assert_ok(j->'workflowFacts'='{"complete":true,"runs":[]}'::jsonb AND (j->>'workflowRevision')::bigint=1,'empty census or revision');
 -- A selected run is projected without input, prompt, logs, agent names.
 INSERT INTO public.runs VALUES('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','running','55555555-5555-4555-8555-555555555555',clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '15 seconds',NULL,false,false,'[{"order":0,"agent_id":"33333333-3333-4333-8333-333333333333","prompt":"SECRET_STEP"}]',clock_timestamp(),'SECRET_INPUT');
 j:=public.office_visit_workflow_presence(v,repeat('b',64));
 PERFORM public.assert_ok(j->'workflowFacts'->>'complete'='true' AND jsonb_array_length(j->'workflowFacts'->'runs')=1,'selected run omitted');
 PERFORM public.assert_ok(j::text NOT LIKE '%SECRET_%' AND j::text NOT LIKE '%"prompt"%' AND j::text NOT LIKE '%"input"%','content leaked');
 -- Valid unrelated-agent and other-project rows do not manufacture busy.
 UPDATE public.runs SET steps_snapshot='[{"order":0,"agent_id":"99999999-9999-4999-8999-999999999999"}]';
 INSERT INTO public.runs SELECT gen_random_uuid(),'99999999-9999-4999-8999-999999999999','running',NULL,NULL,NULL,NULL,false,false,NULL,clock_timestamp(),'SECRET_OTHER_PROJECT';
 j:=public.office_visit_workflow_presence(v,repeat('b',64));
 PERFORM public.assert_ok(j->'workflowFacts'='{"complete":true,"runs":[]}'::jsonb,'wrong selection affected census');
 DELETE FROM public.runs WHERE project_id<>'22222222-2222-4222-8222-222222222222';
 -- An invalid unrelated snapshot can conceal membership: it must block idle.
 FOREACH bad IN ARRAY ARRAY['null'::jsonb,'{}'::jsonb,'[]'::jsonb,'[{"order":0,"agent_id":"bad"}]'::jsonb,'[{"order":0,"agent_id":"33333333-3333-4333-8333-333333333333"},{"order":0,"agent_id":"99999999-9999-4999-8999-999999999999"}]'::jsonb,'[{"order":1.5,"agent_id":"99999999-9999-4999-8999-999999999999"}]'::jsonb] LOOP
  UPDATE public.runs SET steps_snapshot=bad;
  j:=public.office_visit_workflow_presence(v,repeat('b',64));
  PERFORM public.assert_ok(j->'workflowFacts'='{"complete":false,"runs":[]}'::jsonb,'malformed snapshot claimed coverage');
 END LOOP;
 UPDATE public.runs SET steps_snapshot=(SELECT jsonb_agg(jsonb_build_object('order',n,'agent_id','33333333-3333-4333-8333-333333333333')) FROM generate_series(0,100)n);
 j:=public.office_visit_workflow_presence(v,repeat('b',64));
 PERFORM public.assert_ok(j->'workflowFacts'->>'complete'='false','snapshot cap');
 UPDATE public.runs SET steps_snapshot='[{"order":0,"agent_id":"33333333-3333-4333-8333-333333333333"}]';
 -- Normal terminal rows disappear; contradictory terminal/unknown status stay visible for classifier.
 UPDATE public.runs SET status='done',finished_at=clock_timestamp()-interval '1 second';
 j:=public.office_visit_workflow_presence(v,repeat('b',64));
 PERFORM public.assert_ok(j->'workflowFacts'='{"complete":true,"runs":[]}'::jsonb,'terminal normal');
 UPDATE public.runs SET finished_at=NULL;
 j:=public.office_visit_workflow_presence(v,repeat('b',64));
 PERFORM public.assert_ok(jsonb_array_length(j->'workflowFacts'->'runs')=1,'terminal anomaly hidden');
 UPDATE public.runs SET status='unexpected',finished_at=clock_timestamp()-interval '1 second';
 j:=public.office_visit_workflow_presence(v,repeat('b',64));
 PERFORM public.assert_ok(jsonb_array_length(j->'workflowFacts'->'runs')=1,'unknown status hidden');
 DELETE FROM public.runs;
 INSERT INTO public.runs SELECT gen_random_uuid(),'22222222-2222-4222-8222-222222222222','pending',NULL,NULL,NULL,NULL,false,false,'[{"order":0,"agent_id":"99999999-9999-4999-8999-999999999999"}]',clock_timestamp(),'UNRELATED_FIXTURE' FROM generate_series(1,12);
 j:=public.office_visit_workflow_presence(v,repeat('b',64));
 PERFORM public.assert_ok(j->'workflowFacts'='{"complete":false,"runs":[]}'::jsonb,'candidate cap bypassed');
 DELETE FROM public.runs;
 -- Mutable identity is re-authorized on every read, before renewal.
 SELECT workflow_revision INTO prior FROM office_private.visits WHERE id=v;
 UPDATE public.projects SET owner_id='99999999-9999-4999-8999-999999999999';
 PERFORM public.assert_ok(public.office_visit_workflow_presence(v,repeat('b',64)) IS NULL,'owner change');
 UPDATE public.projects SET owner_id='11111111-1111-4111-8111-111111111111';
 UPDATE public.agents SET project_id='99999999-9999-4999-8999-999999999999';
 PERFORM public.assert_ok(public.office_visit_workflow_presence(v,repeat('b',64)) IS NULL,'agent moved');
 UPDATE public.agents SET project_id='22222222-2222-4222-8222-222222222222';
 DELETE FROM auth.sessions;
 PERFORM public.assert_ok(public.office_visit_workflow_presence(v,repeat('b',64)) IS NULL,'logout');
 INSERT INTO auth.sessions VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
 PERFORM public.assert_ok((SELECT workflow_revision=prior FROM office_private.visits WHERE id=v),'denied read renewed');
 -- Missing schema data must be incomplete rather than an empty successful census.
 ALTER TABLE public.runs RENAME COLUMN steps_snapshot TO hidden_snapshot;
 j:=public.office_visit_workflow_presence(v,repeat('b',64));
 PERFORM public.assert_ok(j->'workflowFacts'='{"complete":false,"runs":[]}'::jsonb,'missing column claimed idle');
 ALTER TABLE public.runs RENAME COLUMN hidden_snapshot TO steps_snapshot;
 PERFORM public.assert_ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='office_private' OR (n.nspname='public' AND p.proname LIKE 'office_visit_%')) AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))),'unprivileged RPC grant');
 PERFORM public.assert_ok(NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='office_private' AND (NOT p.prosecdef OR NOT ('search_path=""'=ANY(p.proconfig)))),'private function configuration');
 PERFORM public.assert_ok(NOT has_table_privilege('service_role','office_private.visits','SELECT') AND NOT has_table_privilege('authenticated','office_private.visits','SELECT'),'direct visit grant');
END $$;
