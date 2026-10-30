-- ISOLATED TEST DATABASE ONLY. All identities are fixtures, not production actors.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.handlarborsen_candidate_inbox) <> 0
    THEN RAISE EXCEPTION 'Existing candidate was incorrectly backfilled'; END IF;
END $$;

-- New independently-validated fixture candidate should create ONE durable notice
-- for each active owner/collaborator. No client IDs or external API involved.
INSERT INTO public.handlarborsen_competitor_candidates(
  project_id,host,name,official_url,observed_on,relevance,provenance,evidence_digest
) VALUES (
  '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','auctionexample.org',
  'Fixture Auction Example','https://auctionexample.org/dealers/',
  '2026-10-17','A fixture demonstration of dealer-only B2B listings.',
  'independently_checked_official_website',
  encode(sha256(convert_to('Fixture Auction Example' || E'\n'
    || 'https://auctionexample.org/dealers/' || E'\n' || '2026-10-17' || E'\n'
    || 'A fixture demonstration of dealer-only B2B listings.','UTF8')),'hex')
) ON CONFLICT (project_id,host) DO NOTHING;

DO $$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.handlarborsen_candidate_inbox;
 IF n<>2 THEN RAISE EXCEPTION 'one candidate must deliver exactly two recipient-specific notices, got %',n; END IF;
 IF (SELECT count(*) FROM public.handlarborsen_candidate_inbox WHERE read_at IS NULL)<>2
 THEN RAISE EXCEPTION 'both initial notices should be unread'; END IF;
 IF EXISTS (SELECT 1 FROM public.handlarborsen_candidate_inbox WHERE candidate_host='tradingsolutions.se')
 THEN RAISE EXCEPTION 'old TradingSolutions row must NOT silently backfill'; END IF;
END $$;

-- Replaying the same discovered candidate insert is a no-op: no new notifications.
INSERT INTO public.handlarborsen_competitor_candidates(
  project_id,host,name,official_url,observed_on,relevance,provenance,evidence_digest
)
SELECT project_id,host,name,official_url,observed_on,relevance,provenance,evidence_digest
FROM public.handlarborsen_competitor_candidates WHERE host='auctionexample.org'
ON CONFLICT (project_id,host) DO NOTHING;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.handlarborsen_candidate_inbox)<>2
 THEN RAISE EXCEPTION 'duplicate new candidate emitted a second delivery'; END IF;
END $$;

DO $$
DECLARE res text; checked_at timestamptz;
BEGIN
 SELECT outcome,current_read_at INTO res,checked_at
 FROM public.handlarborsen_set_candidate_inbox_read_v1(
  '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','auctionexample.org',
  '22222222-2222-4222-8222-222222222222',true);
 IF res<>'updated' OR checked_at IS NULL
 THEN RAISE EXCEPTION 'collaborator acknowledge failed: %',res; END IF;
 SELECT outcome INTO res FROM public.handlarborsen_set_candidate_inbox_read_v1(
  '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','auctionexample.org',
  '22222222-2222-4222-8222-222222222222',true);
 IF res<>'unchanged' THEN RAISE EXCEPTION 'duplicate read acknowledgement not idempotent: %',res; END IF;
 IF (SELECT read_at FROM public.handlarborsen_candidate_inbox
   WHERE candidate_host='auctionexample.org'
   AND recipient_id='11111111-1111-4111-8111-111111111111') IS NOT NULL
 THEN RAISE EXCEPTION 'collaborator read modified owner receipt'; END IF;
 SELECT outcome INTO res FROM public.handlarborsen_set_candidate_inbox_read_v1(
  '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','auctionexample.org',
  '22222222-2222-4222-8222-222222222222',false);
 IF res<>'updated' THEN RAISE EXCEPTION 'mark unread failed: %',res; END IF;
 IF (SELECT read_at FROM public.handlarborsen_candidate_inbox
    WHERE candidate_host='auctionexample.org'
    AND recipient_id='22222222-2222-4222-8222-222222222222') IS NOT NULL
 THEN RAISE EXCEPTION 'mark unread did not clear personal read receipt'; END IF;
END $$;

-- Revoked collaborator must not read/ack, and receives no later events.
UPDATE public.omnira_organization_memberships SET revoked_at=clock_timestamp()
 WHERE user_id='22222222-2222-4222-8222-222222222222';
DO $$
DECLARE outcome text;
BEGIN
 SELECT r.outcome INTO outcome FROM public.handlarborsen_set_candidate_inbox_read_v1(
  '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','auctionexample.org',
  '22222222-2222-4222-8222-222222222222',true) r;
 IF outcome<>'forbidden' THEN RAISE EXCEPTION 'revoked collaborator could acknowledge: %',outcome; END IF;
END $$;

INSERT INTO public.handlarborsen_competitor_candidates(
  project_id,host,name,official_url,observed_on,relevance,provenance,evidence_digest
) VALUES (
  '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','demoauctions.org',
  'Second Demo Auction','https://demoauctions.org/for-dealers/',
  '2026-10-17','A second fixture for testing revoked recipient filtering.',
  'independently_checked_official_website',
  encode(sha256(convert_to('Second Demo Auction' || E'\n'
    || 'https://demoauctions.org/for-dealers/' || E'\n' || '2026-10-17' || E'\n'
    || 'A second fixture for testing revoked recipient filtering.','UTF8')),'hex')
) ON CONFLICT (project_id,host) DO NOTHING;

DO $$
BEGIN
 IF (SELECT count(*) FROM public.handlarborsen_candidate_inbox)<>3
 THEN RAISE EXCEPTION 'revoked user was unexpectedly notified'; END IF;
 IF (SELECT count(*) FROM public.handlarborsen_candidate_inbox WHERE candidate_host='demoauctions.org')<>1
 THEN RAISE EXCEPTION 'new candidate should notify remaining active owner only'; END IF;
 IF (SELECT count(*) FROM public.handlarborsen_candidate_inbox WHERE
     recipient_id='22222222-2222-4222-8222-222222222222')<>1
 THEN RAISE EXCEPTION 'revoked user acquired another notification'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class WHERE oid='public.handlarborsen_candidate_inbox'::regclass)
 THEN RAISE EXCEPTION 'RLS/FORCE RLS absent'; END IF;
 IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
   AND tablename='handlarborsen_candidate_inbox')
 THEN RAISE EXCEPTION 'unexpected client policy'; END IF;
 IF has_table_privilege('anon','public.handlarborsen_candidate_inbox','SELECT')
   OR has_table_privilege('authenticated','public.handlarborsen_candidate_inbox','SELECT')
   OR has_table_privilege('authenticated','public.handlarborsen_candidate_inbox','INSERT')
   OR has_table_privilege('service_role','public.handlarborsen_candidate_inbox','DELETE')
 THEN RAISE EXCEPTION 'table privileges broader than intended'; END IF;
 IF has_function_privilege('authenticated','public.handlarborsen_set_candidate_inbox_read_v1(uuid,text,uuid,boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'direct authenticated RPC incorrectly permitted'; END IF;
END $$;
