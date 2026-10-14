-- PROPOSED P2 MIGRATION - UNAPPLIED. Review before promoting into
-- canonical migrations with exact migration-guard and security inventory.
-- Public source title metadata only. No raw HTML, free URLs, or user data.
CREATE TABLE public.handlarborsen_competitor_observations (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  observed_on date NOT NULL,
  checked_at timestamptz NOT NULL,
  status text NOT NULL,
  title varchar(160),
  title_digest char(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hb_competitor_observations_pk PRIMARY KEY (project_id, source_id, observed_on),
  CONSTRAINT hb_competitor_project_exact CHECK
    (project_id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid),
  CONSTRAINT hb_competitor_source_exact CHECK (
    source_id IN ('battery-vdn-2025', 'guaranteed-bid-2022', 'trading-support-2022',
                  'autoproff', 'bca', 'auto1')
  ),
  CONSTRAINT hb_competitor_status_exact CHECK (
    status IN ('metadata_checked', 'robots_denied', 'robots_unavailable', 'redirect_refused',
               'http_error', 'invalid_content_type', 'too_large', 'metadata_missing', 'fetch_failed')
  ),
  CONSTRAINT hb_competitor_checked_day CHECK (observed_on = (checked_at AT TIME ZONE 'UTC')::date),
  CONSTRAINT hb_competitor_title_contract CHECK (
    (status = 'metadata_checked'
      AND title IS NOT NULL AND length(title) BETWEEN 1 AND 160 AND title = btrim(title)
      AND title !~ '[[:cntrl:]<>]'
      AND title_digest IS NOT NULL AND title_digest = encode(sha256(convert_to(title, 'UTF8')), 'hex'))
    OR (status <> 'metadata_checked' AND title IS NULL AND title_digest IS NULL)
  )
);

COMMENT ON TABLE public.handlarborsen_competitor_observations IS
  'P2 fixed-project read-only public source titles; first UTC-day observation immutable; no raw HTML. Not autonomous.';
CREATE INDEX hb_competitor_observations_recent
  ON public.handlarborsen_competitor_observations (project_id, observed_on DESC);

ALTER TABLE public.handlarborsen_competitor_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handlarborsen_competitor_observations FORCE ROW LEVEL SECURITY;
-- Strip all Supabase default grants, then explicitly permit limited service access.
REVOKE ALL ON TABLE public.handlarborsen_competitor_observations FROM PUBLIC;
REVOKE ALL ON TABLE public.handlarborsen_competitor_observations FROM anon;
REVOKE ALL ON TABLE public.handlarborsen_competitor_observations FROM authenticated;
REVOKE ALL ON TABLE public.handlarborsen_competitor_observations FROM service_role;
GRANT SELECT, INSERT ON TABLE public.handlarborsen_competitor_observations TO service_role;
-- No client RLS policies and no UPDATE/DELETE/TRUNCATE/TRIGGER privileges.
