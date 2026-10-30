-- Synthetic only; each transaction rolls back, never a production verification script.
BEGIN;
DO $$
DECLARE p uuid := '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'; w date := date_trunc('week',clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::date;
a jsonb; b jsonb; r uuid; token uuid := gen_random_uuid();
BEGIN
 a:=public.handlarborsen_watch_enqueue_v1(p,w);r:=(a#>>'{run,id}')::uuid;
 b:=public.handlarborsen_watch_enqueue_v1(p,w);
 ASSERT a->>'outcome'='queued' AND b->>'outcome'='existing' AND b#>>'{run,id}'=r::text,'enqueue replay';
 ASSERT (select count(*)=1 from public.handlarborsen_watch_run_events),'duplicate audit';
 a:=public.handlarborsen_watch_claim_v1(p,r,token,180); ASSERT a->>'outcome'='claimed','claim';
 b:=public.handlarborsen_watch_claim_v1(p,r,token,180); ASSERT b->>'outcome'='already_running','claim replay must not grant another claim';
 ASSERT public.handlarborsen_watch_finish_v1(p,r,gen_random_uuid(),1,'succeeded','verified',2,repeat('a',64))->>'outcome'='stale_claim','wrong worker';
 a:=public.handlarborsen_watch_finish_v1(p,r,token,1,'succeeded','verified',2,repeat('a',64)); ASSERT a->>'outcome'='finished','finish';
 b:=public.handlarborsen_watch_finish_v1(p,r,token,1,'succeeded','verified',2,repeat('a',64)); ASSERT b->>'outcome'='already_finished','lost completion acknowledgement';
 b:=public.handlarborsen_watch_finish_v1(p,r,token,1,'succeeded','verified',3,repeat('a',64)); ASSERT b->>'outcome'='conflict','changed completion';
 ASSERT (select count(*)=3 from public.handlarborsen_watch_run_events),'exactly one event per transition';
 ASSERT NOT (a->'run' ? 'claim_token'),'token not in receipt';
 BEGIN UPDATE public.handlarborsen_watch_run_events SET state='failed'; RAISE EXCEPTION 'audit update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.handlarborsen_watch_run_events; RAISE EXCEPTION 'audit delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN TRUNCATE public.handlarborsen_watch_run_events; RAISE EXCEPTION 'audit truncate allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.handlarborsen_watch_runs; RAISE EXCEPTION 'head delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.handlarborsen_watch_runs SET period_start=w-7; RAISE EXCEPTION 'identity rewrite allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

BEGIN;
DO $$
DECLARE p uuid := '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'; w date := date_trunc('week',clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::date;
a jsonb; r uuid; token uuid := gen_random_uuid();
BEGIN
 a:=public.handlarborsen_watch_enqueue_v1(p,w);r:=(a#>>'{run,id}')::uuid;
 a:=public.handlarborsen_watch_claim_v1(p,r,token,1); ASSERT a->>'outcome'='claimed','short bounded lease';
 -- The transaction began BEFORE expiry: transaction_timestamp/now would be unsafe.
 PERFORM pg_sleep(1.1);
 a:=public.handlarborsen_watch_finish_v1(p,r,token,1,'succeeded','verified',1,repeat('b',64));
 ASSERT a->>'outcome'='uncertain' AND a#>>'{run,status}'='uncertain','expired worker must not finish';
 ASSERT a#>'{run,http_request_count}'='null'::jsonb,'unknown count must not become zero';
 ASSERT (select count(*)=3 from public.handlarborsen_watch_run_events),'one expiry event';
 ASSERT public.handlarborsen_watch_claim_v1(p,r,gen_random_uuid(),180)->>'outcome'='blocked_review','no lease takeover';
END $$;
ROLLBACK;

BEGIN;
DO $$
DECLARE p uuid := '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'; w date := date_trunc('week',clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::date;
old_id uuid; a jsonb; r uuid; t timestamptz;
BEGIN
 -- A historical running fixture models the week rolling over while a worker is live.
 INSERT INTO public.handlarborsen_watch_runs(project_id,period_start) VALUES(p,w-7) RETURNING id INTO old_id;
 t:=clock_timestamp();
 UPDATE public.handlarborsen_watch_runs SET status='running',revision=1,claim_token=gen_random_uuid(),claimed_at=t,lease_until=t+interval '1 second' WHERE id=old_id;
 a:=public.handlarborsen_watch_enqueue_v1(p,w);r:=(a#>>'{run,id}')::uuid;
 ASSERT public.handlarborsen_watch_claim_v1(p,r,gen_random_uuid(),180)->>'outcome'='busy','cross-period exclusive slot';
 PERFORM pg_sleep(1.1);
 ASSERT public.handlarborsen_watch_claim_v1(p,r,gen_random_uuid(),180)->>'outcome'='blocked_review','uncertain history blocks later periods';
 ASSERT (select status='uncertain' from public.handlarborsen_watch_runs where id=old_id),'old lease recorded';
 ASSERT (select status='queued' from public.handlarborsen_watch_runs where id=r),'later run not claimed';
END $$;
ROLLBACK;

BEGIN;
DO $$
DECLARE p uuid := '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'; w date := date_trunc('week',clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::date;
a jsonb; r uuid; token uuid:=gen_random_uuid();
BEGIN
 BEGIN PERFORM public.handlarborsen_watch_enqueue_v1(gen_random_uuid(),w);RAISE EXCEPTION 'foreign project allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.handlarborsen_watch_enqueue_v1(p,w+1);RAISE EXCEPTION 'non Monday allowed';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 a:=public.handlarborsen_watch_enqueue_v1(p,w+7);r:=(a#>>'{run,id}')::uuid;
 ASSERT public.handlarborsen_watch_claim_v1(p,r,token,180)->>'outcome'='not_current_period','future period refused';
 a:=public.handlarborsen_watch_enqueue_v1(p,w);r:=(a#>>'{run,id}')::uuid;
 BEGIN PERFORM public.handlarborsen_watch_claim_v1(p,r,token,181);RAISE EXCEPTION 'unbounded lease';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 PERFORM public.handlarborsen_watch_claim_v1(p,r,token,180);
 BEGIN PERFORM public.handlarborsen_watch_finish_v1(p,r,token,0,'succeeded','verified',1,repeat('a',64));RAISE EXCEPTION 'wrong CAS';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.handlarborsen_watch_finish_v1(p,r,token,1,'succeeded','verified',11,repeat('a',64));RAISE EXCEPTION 'unbounded count';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.handlarborsen_watch_finish_v1(p,r,token,1,'succeeded','verified',1,null);RAISE EXCEPTION 'success without evidence';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.handlarborsen_watch_finish_v1(p,r,token,1,'failed','gate_refused',1,null);RAISE EXCEPTION 'gate refusal falsely consumed request';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 ASSERT public.handlarborsen_watch_finish_v1(p,r,token,1,'failed','gate_refused',0,null)->>'outcome'='finished','bounded failure';
END $$;
ROLLBACK;

DO $$
DECLARE n text; role_name text;
BEGIN
 FOREACH n IN ARRAY ARRAY['handlarborsen_watch_runs','handlarborsen_watch_run_events'] LOOP
  ASSERT (select relrowsecurity AND relforcerowsecurity from pg_class where oid=('public.'||n)::regclass),'RLS/FORCE';
  ASSERT NOT EXISTS(select 1 from pg_policies where schemaname='public' AND tablename=n),'no client policy';
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   ASSERT NOT has_table_privilege(role_name,'public.'||n,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'no client table privilege';
   ASSERT NOT has_any_column_privilege(role_name,'public.'||n,'SELECT,INSERT,UPDATE,REFERENCES'),'no client column privilege';
  END LOOP;
  ASSERT has_table_privilege('service_role','public.'||n,'SELECT'),'service reads';
  ASSERT NOT has_table_privilege('service_role','public.'||n,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'service no direct mutation';
 END LOOP;
 ASSERT (select count(*)=3 from pg_proc where pronamespace='public'::regnamespace AND proname LIKE 'handlarborsen_watch_%' AND prosecdef),'only three narrow definers';
 ASSERT NOT EXISTS(select 1 from pg_proc p where p.pronamespace='public'::regnamespace AND p.proname LIKE 'handlarborsen_watch_%' AND
 (NOT('search_path=""'=ANY(p.proconfig)) OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))),'all routines hardened';
END $$;
SELECT 'watch journal SQL fixture passed';
