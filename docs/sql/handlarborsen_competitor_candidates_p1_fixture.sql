-- Run in an ephemeral, isolated test Postgres after proposed schema has been loaded.
-- DO NOT run on production. No real accounts or secrets.
DO $$
DECLARE row_count integer;
BEGIN
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity
          FROM pg_class WHERE oid='public.handlarborsen_competitor_candidates'::regclass)
    THEN RAISE EXCEPTION 'RLS/FORCE RLS missing'; END IF;
  IF EXISTS(SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='handlarborsen_competitor_candidates')
    THEN RAISE EXCEPTION 'unexpected client policy'; END IF;
  IF has_table_privilege('anon','public.handlarborsen_competitor_candidates','SELECT')
     OR has_table_privilege('anon','public.handlarborsen_competitor_candidates','INSERT')
     OR has_table_privilege('authenticated','public.handlarborsen_competitor_candidates','SELECT')
     OR has_table_privilege('authenticated','public.handlarborsen_competitor_candidates','INSERT')
    THEN RAISE EXCEPTION 'client grants unexpectedly present'; END IF;
  IF NOT has_table_privilege('service_role','public.handlarborsen_competitor_candidates','SELECT')
     OR NOT has_table_privilege('service_role','public.handlarborsen_competitor_candidates','INSERT')
     OR has_table_privilege('service_role','public.handlarborsen_competitor_candidates','UPDATE')
     OR has_table_privilege('service_role','public.handlarborsen_competitor_candidates','DELETE')
    THEN RAISE EXCEPTION 'service grants drifted'; END IF;
END $$;

INSERT INTO public.handlarborsen_competitor_candidates (
  project_id, host, name, official_url, observed_on, relevance, provenance, evidence_digest
)
VALUES (
  '8f673c09-1c8f-4d78-876e-4c14bf1c89b3','tradingsolutions.se','TradingSolutions D2D',
  'https://www.tradingsolutions.se/d2d/','2026-10-15','Officiell sida beskriver en digital bilauktion för bilhandlare med köp och försäljning.',
  'independently_checked_official_website',
  encode(sha256(convert_to(
    'TradingSolutions D2D' || E'\n' || 'https://www.tradingsolutions.se/d2d/' || E'\n' ||
    '2026-10-15' || E'\n' ||
    'Officiell sida beskriver en digital bilauktion för bilhandlare med köp och försäljning.', 'UTF8')), 'hex')
)
ON CONFLICT (project_id,host) DO NOTHING;

-- Re-run with conflict: no replacement, no extra signal.
INSERT INTO public.handlarborsen_competitor_candidates (
  project_id, host, name, official_url, observed_on, relevance, provenance, evidence_digest
)
SELECT project_id,host,name,official_url,observed_on,relevance,provenance,evidence_digest
FROM public.handlarborsen_competitor_candidates
ON CONFLICT (project_id,host) DO NOTHING;

DO $$
DECLARE row_count integer;
BEGIN
 SELECT count(*) INTO row_count FROM public.handlarborsen_competitor_candidates;
 IF row_count <> 1 THEN RAISE EXCEPTION 'idempotence failed'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.handlarborsen_competitor_candidates
  WHERE host='tradingsolutions.se' AND project_id='8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
    AND evidence_digest = encode(sha256(convert_to(name || E'\n' || official_url || E'\n' ||
      observed_on::text || E'\n' || relevance,'UTF8')),'hex')
 ) THEN RAISE EXCEPTION 'candidate hash or project drift'; END IF;
END $$;
