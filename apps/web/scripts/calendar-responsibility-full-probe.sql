-- Test-only probe for an owned local replay database. All rows roll back.
BEGIN;
SET LOCAL statement_timeout='15s';
INSERT INTO auth.users(id) VALUES('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='20000000-0000-4000-8000-000000000001';
DO $test$
DECLARE d jsonb; request jsonb; receipt jsonb; result jsonb;
BEGIN
 d='{"kind":"work_block","title":"Synthetic calendar work","description":"","location":"","projectId":null,"taskId":null,"workStatus":"planned","responsibility":"atlas_planned","time":{"kind":"timed","startUtc":"2026-10-24T12:00:00.000Z","endUtc":null,"timeZone":"Europe/Stockholm"}}';
 request=jsonb_build_object('operation','create','eventId','40000000-0000-4000-8000-000000000001','idempotencyKey','40000000-0000-4000-8000-000000000002','draft',d);
 receipt=public.calendar_event_apply(request);
 IF receipt->>'ok' IS DISTINCT FROM 'true' OR receipt->'event'->>'responsibility' IS DISTINCT FROM 'atlas_planned' OR receipt->'event'->>'workStatus' IS DISTINCT FROM 'planned' THEN RAISE EXCEPTION 'planned responsibility not persisted: %',receipt; END IF;
 IF public.calendar_event_apply(request) IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'receipt replay changed'; END IF;
 result=public.calendar_event_list('{"fromDate":"2026-10-19","toDateExclusive":"2026-10-26","timeZone":"Europe/Stockholm"}');
 IF result->'events'->0->>'responsibility' IS DISTINCT FROM 'atlas_planned' THEN RAISE EXCEPTION 'list lost responsibility'; END IF;
 request=request||jsonb_build_object('operation','update','expectedVersion',1,'idempotencyKey','40000000-0000-4000-8000-000000000003','draft',d||'{"responsibility":"self"}'::jsonb);
 result=public.calendar_event_apply(request);
 IF result->'event'->>'responsibility' IS DISTINCT FROM 'self' THEN RAISE EXCEPTION 'update failed: %',result; END IF;
 result=public.calendar_event_apply(request||'{"idempotencyKey":"40000000-0000-4000-8000-000000000004"}'::jsonb);
 IF result->>'code' IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'stale version accepted'; END IF;
 result=public.calendar_event_apply(request||jsonb_build_object('expectedVersion',2,'idempotencyKey','40000000-0000-4000-8000-000000000005','draft',d||'{"execute":true}'::jsonb));
 IF result->>'code' IS DISTINCT FROM 'INVALID_INPUT' THEN RAISE EXCEPTION 'execution metadata accepted'; END IF;
END $test$;
SET LOCAL "request.jwt.claim.sub"='20000000-0000-4000-8000-000000000002';
DO $test$
DECLARE result jsonb;
BEGIN
 result=public.calendar_event_list('{"fromDate":"2026-10-19","toDateExclusive":"2026-10-26","timeZone":"Europe/Stockholm"}');
 IF result->'events' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'another owner can list event'; END IF;
 result=public.calendar_event_apply('{"operation":"cancel","eventId":"40000000-0000-4000-8000-000000000001","expectedVersion":2,"idempotencyKey":"40000000-0000-4000-8000-000000000006"}');
 IF result->>'code' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'another owner can cancel event'; END IF;
END $test$;
SELECT 'FULL CALENDAR RESPONSIBILITY PASS 8';
ROLLBACK;
