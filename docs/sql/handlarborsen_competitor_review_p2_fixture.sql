-- Isolated PostgreSQL 17.6 only; never run on Omnira production.
-- Prerequisites: canonical candidate schema, organization membership fixture,
-- projects stub and auth.users test principals from the test harness.
DO $$
DECLARE o text; s text; ident bigint; count_rows bigint;
BEGIN
  -- No external source I/O. All decisions refer to the one seeded official lead.
  SELECT outcome,current_status,decision_id INTO o,s,ident FROM public.handlarborsen_decide_candidate_review_v1(
    '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','tradingsolutions.se',
    '11111111-1111-4111-8111-111111111111','interesting','33333333-3333-4333-8333-333333333333',0);
  IF o <> 'saved' OR s <> 'interesting' OR ident IS NULL THEN
    RAISE EXCEPTION 'initial decision failed: % % %',o,s,ident;
  END IF;
  SELECT outcome INTO o FROM public.handlarborsen_decide_candidate_review_v1(
    '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','tradingsolutions.se',
    '11111111-1111-4111-8111-111111111111','interesting','33333333-3333-4333-8333-333333333333',0);
  IF o <> 'already_applied' THEN RAISE EXCEPTION 'replay not idempotent: %',o; END IF;
  SELECT outcome INTO o FROM public.handlarborsen_decide_candidate_review_v1(
    '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','tradingsolutions.se',
    '11111111-1111-4111-8111-111111111111','interesting','44444444-4444-4444-8444-444444444444',1);
  IF o <> 'unchanged' THEN RAISE EXCEPTION 'same state duplicated: %',o; END IF;
  SELECT outcome INTO o FROM public.handlarborsen_decide_candidate_review_v1(
    '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','tradingsolutions.se',
    '22222222-2222-4222-8222-222222222222','reviewed','55555555-5555-4555-8555-555555555555',1);
  IF o <> 'saved' THEN RAISE EXCEPTION 'collaborator review rejected: %',o; END IF;
  SELECT outcome INTO o FROM public.handlarborsen_decide_candidate_review_v1(
    '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','tradingsolutions.se',
    '22222222-2222-4222-8222-222222222222','reviewed','33333333-3333-4333-8333-333333333333',0);
  IF o <> 'conflict' THEN RAISE EXCEPTION 'reused request across actor not conflict: %',o; END IF;
  -- Owner's stale page thought revision 1 was current; collaborator saved revision 2.
  SELECT outcome INTO o FROM public.handlarborsen_decide_candidate_review_v1(
    '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','tradingsolutions.se',
    '11111111-1111-4111-8111-111111111111','ignored','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1);
  IF o <> 'conflict' THEN RAISE EXCEPTION 'stale revision changed decision: %',o; END IF;

  UPDATE public.omnira_organization_memberships
    SET revoked_at=clock_timestamp() WHERE user_id='22222222-2222-4222-8222-222222222222';
  SELECT outcome INTO o FROM public.handlarborsen_decide_candidate_review_v1(
    '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','tradingsolutions.se',
    '22222222-2222-4222-8222-222222222222','ignored','66666666-6666-4666-8666-666666666666',2);
  IF o <> 'forbidden' THEN RAISE EXCEPTION 'revoked collaborator was allowed: %',o; END IF;
  SELECT outcome INTO o FROM public.handlarborsen_decide_candidate_review_v1(
    '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','tradingsolutions.se',
    '11111111-1111-4111-8111-111111111111','ignored','77777777-7777-4777-8777-777777777777',2);
  IF o <> 'saved' THEN RAISE EXCEPTION 'ignore transition failed: %',o; END IF;
  SELECT outcome INTO o FROM public.handlarborsen_decide_candidate_review_v1(
    '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','tradingsolutions.se',
    '11111111-1111-4111-8111-111111111111','interesting','33333333-3333-4333-8333-333333333333',0);
  IF o <> 'already_applied' THEN RAISE EXCEPTION 'late replay created another event: %',o; END IF;
  SELECT count(*) INTO count_rows FROM public.handlarborsen_competitor_review_decisions;
  IF count_rows <> 3 THEN RAISE EXCEPTION 'audit event count incorrect: %',count_rows; END IF;
  IF (SELECT status FROM public.handlarborsen_competitor_review_decisions
      ORDER BY id DESC LIMIT 1) <> 'ignored' THEN
    RAISE EXCEPTION 'last transition is not ignored';
  END IF;
  SELECT outcome INTO o FROM public.handlarborsen_decide_candidate_review_v1(
    '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','new-host.se',
    '11111111-1111-4111-8111-111111111111','interesting','88888888-8888-4888-8888-888888888888',3);
  IF o <> 'not_found' THEN RAISE EXCEPTION 'missing candidate was allowed: %',o; END IF;
  SELECT outcome INTO o FROM public.handlarborsen_decide_candidate_review_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','tradingsolutions.se',
    '11111111-1111-4111-8111-111111111111','interesting','99999999-9999-4999-8999-999999999999',0);
  IF o <> 'invalid' THEN RAISE EXCEPTION 'foreign project was allowed: %',o; END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
    WHERE oid='public.handlarborsen_competitor_review_decisions'::regclass)
    THEN RAISE EXCEPTION 'RLS + FORCE RLS missing'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='handlarborsen_competitor_review_decisions'
    AND schemaname='public') THEN RAISE EXCEPTION 'Unexpected RLS policy'; END IF;
  IF has_table_privilege('authenticated','public.handlarborsen_competitor_review_decisions','SELECT')
    OR has_table_privilege('anon','public.handlarborsen_competitor_review_decisions','INSERT')
    OR has_table_privilege('service_role','public.handlarborsen_competitor_review_decisions','DELETE')
    OR has_table_privilege('service_role','public.handlarborsen_competitor_review_decisions','UPDATE')
    THEN RAISE EXCEPTION 'Role privilege drift'; END IF;
END;
$$;
