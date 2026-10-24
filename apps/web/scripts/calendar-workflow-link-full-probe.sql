-- Owned local full-schema test only. Never run on hosted projects.
BEGIN;
SET LOCAL statement_timeout='15s';
INSERT INTO auth.users(id) VALUES('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
INSERT INTO public.projects(id,owner_id,name,slug) VALUES
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Link A','workflow-link-a'),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Link A other project','workflow-link-other'),
 ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','Link B','workflow-link-b');
DO $test$
DECLARE definition uuid;instance public.workflow_instances;
BEGIN
 INSERT INTO public.workflow_defs(def_key,version,def_hash,spec)
 VALUES('familje-stunden.monthly-release',1,repeat('a',64),'{"states":[{"id":"start"}],"initial_state":"start"}') RETURNING id INTO definition;
 instance=public.workflow_instantiate(definition,'10000000-0000-4000-8000-000000000001','synthetic-link-a','start','local-test','synthetic only');
 PERFORM set_config('test.workflow_a',instance.id::text,true);
 instance=public.workflow_instantiate(definition,'10000000-0000-4000-8000-000000000002','synthetic-link-other','start','local-test','synthetic only');
 PERFORM set_config('test.workflow_other',instance.id::text,true);
 instance=public.workflow_instantiate(definition,'10000000-0000-4000-8000-000000000003','synthetic-link-b','start','local-test','synthetic only');
 PERFORM set_config('test.workflow_b',instance.id::text,true);
 INSERT INTO public.workflow_defs(def_key,version,def_hash,spec)
 VALUES('omnira.probe-validation',1,repeat('b',64),'{"states":[{"id":"start"}],"initial_state":"start"}') RETURNING id INTO definition;
 instance=public.workflow_instantiate(definition,'10000000-0000-4000-8000-000000000001','synthetic-proof','start','local-test','synthetic only');
 PERFORM set_config('test.workflow_proof',instance.id::text,true);
END $test$;
CREATE TEMP TABLE workflow_before AS SELECT jsonb_agg(to_jsonb(w) ORDER BY id) AS snapshot FROM public.workflow_instances w;
CREATE TEMP TABLE transitions_before AS SELECT count(*) AS count FROM public.workflow_transitions;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='20000000-0000-4000-8000-000000000001';
DO $test$
DECLARE d jsonb;request jsonb;r jsonb;bad text;
BEGIN
 d=jsonb_build_object('kind','work_block','title','Synthetic linked work','description','','location','','projectId','10000000-0000-4000-8000-000000000001','taskId',null,'workStatus','planned','responsibility','atlas_planned','workflowInstanceId',current_setting('test.workflow_a'),'time',jsonb_build_object('kind','timed','startUtc','2026-10-24T12:00:00.000Z','endUtc',null,'timeZone','Europe/Stockholm'));
 request=jsonb_build_object('operation','create','eventId','40000000-0000-4000-8000-000000000001','idempotencyKey','40000000-0000-4000-8000-000000000002','draft',d);
 r=public.calendar_event_apply(request);
 IF r->>'ok' IS DISTINCT FROM 'true' OR r->'event'->>'workflowInstanceId' IS DISTINCT FROM current_setting('test.workflow_a') THEN RAISE EXCEPTION 'own project link failed: %',r;END IF;
 IF public.calendar_event_apply(request) IS DISTINCT FROM r THEN RAISE EXCEPTION 'linked receipt replay failed';END IF;
 FOREACH bad IN ARRAY ARRAY[current_setting('test.workflow_other'),current_setting('test.workflow_b'),current_setting('test.workflow_proof'),'50000000-0000-4000-8000-000000000099'] LOOP
  r=public.calendar_event_apply(request||jsonb_build_object('operation','update','expectedVersion',1,'idempotencyKey',gen_random_uuid(),'draft',d||jsonb_build_object('workflowInstanceId',bad)));
  IF r->>'code' IS DISTINCT FROM 'INVALID_INPUT' THEN RAISE EXCEPTION 'foreign, wrong project, proof or missing link accepted: %',r;END IF;
 END LOOP;
 BEGIN
  UPDATE public.user_calendar_events SET draft=d||jsonb_build_object('workflowInstanceId',current_setting('test.workflow_b')) WHERE id='40000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'direct link bypass accepted';
 EXCEPTION WHEN check_violation THEN NULL;END;
 r=public.calendar_event_apply(request||jsonb_build_object('operation','update','expectedVersion',1,'idempotencyKey',gen_random_uuid(),'draft',d-'workflowInstanceId'));
 IF r->>'ok' IS DISTINCT FROM 'true' OR r->'event' ? 'workflowInstanceId' THEN RAISE EXCEPTION 'unlink failed';END IF;
 IF has_function_privilege('anon','calendar_private.workflow_link_valid(uuid,uuid)','EXECUTE') OR has_function_privilege('service_role','calendar_private.workflow_link_valid(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'helper ACL expanded';END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
 IF (SELECT snapshot FROM workflow_before) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(w) ORDER BY id) FROM public.workflow_instances w) THEN RAISE EXCEPTION 'link changed a workflow';END IF;
 IF (SELECT count FROM transitions_before)<>(SELECT count(*) FROM public.workflow_transitions) THEN RAISE EXCEPTION 'link transitioned workflow';END IF;
END $test$;
SELECT 'FULL CALENDAR WORKFLOW LINK PASS 10';
ROLLBACK;
