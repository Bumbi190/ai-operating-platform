-- Run with psql -v candidate=client_N concurrently in isolated PostgreSQL.
-- A single multirow INSERT / ON CONFLICT DO NOTHING is atomic per session.
SET ROLE service_role;
INSERT INTO public.handlarborsen_competitor_observations
  (project_id,source_id,observed_on,checked_at,status,title,title_digest)
SELECT
  '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid,
  source,
  '2026-10-15'::date,
  '2026-10-15T10:00:00Z'::timestamptz,
  'metadata_checked',
  'Concurrent ' || :'candidate',
  encode(sha256(convert_to('Concurrent ' || :'candidate', 'UTF8')), 'hex')
FROM unnest(ARRAY[
  'battery-vdn-2025', 'guaranteed-bid-2022','trading-support-2022',
  'autoproff','bca','auto1'
]) AS source
ON CONFLICT ON CONSTRAINT hb_competitor_observations_pk DO NOTHING;
RESET ROLE;
