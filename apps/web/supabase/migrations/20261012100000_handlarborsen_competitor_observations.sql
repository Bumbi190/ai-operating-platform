-- P2: immutable manual public-source title observations. Do not apply before review.
CREATE TABLE IF NOT EXISTS public.handlarborsen_competitor_observations (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  observed_on date NOT NULL,
  checked_at timestamptz NOT NULL,
  status text NOT NULL,
  title varchar(160),
  title_digest varchar(64),
  CONSTRAINT handlarborsen_competitor_observations_unique UNIQUE (project_id, source_id, observed_on),
  CONSTRAINT handlarborsen_competitor_observations_project CHECK
    (project_id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid),
  CONSTRAINT handlarborsen_competitor_observations_source CHECK
    (source_id IN ('battery-vdn-2025', 'guaranteed-bid-2022', 'trading-support-2022')),
  CONSTRAINT handlarborsen_competitor_observations_status CHECK
    (status IN ('metadata_checked', 'robots_denied', 'redirect_refused', 'http_error',
      'invalid_content_type', 'too_large', 'metadata_missing', 'fetch_failed')),
  CONSTRAINT handlarborsen_competitor_observations_utc_day CHECK
    (observed_on = (checked_at AT TIME ZONE 'UTC')::date),
  CONSTRAINT handlarborsen_competitor_observations_title CHECK (
    (status = 'metadata_checked' AND title IS NOT NULL AND length(title) > 0
      AND title = btrim(title) AND title !~ '[[:cntrl:]]'
      AND title_digest IS NOT NULL AND title_digest ~ '^[0-9a-f]{64}$'
      AND title_digest = encode(sha256(convert_to(title, 'UTF8')), 'hex'))
    OR (status <> 'metadata_checked' AND title IS NULL AND title_digest IS NULL)
  )
);

COMMENT ON TABLE public.handlarborsen_competitor_observations IS
  'Manual UTC daily title metadata only. First observation is immutable; no offers or raw HTML.';
CREATE INDEX IF NOT EXISTS handlarborsen_competitor_observations_date_idx
  ON public.handlarborsen_competitor_observations (project_id, observed_on DESC);

ALTER TABLE public.handlarborsen_competitor_observations ENABLE ROW LEVEL SECURITY;
-- No client policies. Strip Supabase default grants, including service-role UPDATE.
REVOKE ALL ON TABLE public.handlarborsen_competitor_observations FROM PUBLIC;
REVOKE ALL ON TABLE public.handlarborsen_competitor_observations FROM anon;
REVOKE ALL ON TABLE public.handlarborsen_competitor_observations FROM authenticated;
REVOKE ALL ON TABLE public.handlarborsen_competitor_observations FROM service_role;
GRANT SELECT, INSERT ON TABLE public.handlarborsen_competitor_observations TO service_role;
