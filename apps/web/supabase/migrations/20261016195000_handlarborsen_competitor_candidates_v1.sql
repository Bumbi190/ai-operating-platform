-- Operator-approved P1 Handlarborsen immutable candidate memory, canonical DDL.
-- Reviewed in isolated PostgreSQL 17.6; no automatic search or notification.
-- Fixed Handlarbörsen project. Independently checked official-site metadata only.
-- No scraped HTML, raw search results, API tokens, user-controlled URLs or scheduler.

CREATE TABLE public.handlarborsen_competitor_candidates (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  host varchar(160) NOT NULL,
  name varchar(90) NOT NULL,
  official_url varchar(512) NOT NULL,
  observed_on date NOT NULL,
  relevance varchar(320) NOT NULL,
  provenance text NOT NULL DEFAULT 'independently_checked_official_website',
  evidence_digest char(64) NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hb_competitor_candidates_pk PRIMARY KEY (project_id,host),
  CONSTRAINT hb_competitor_candidates_exact_project CHECK (
    project_id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid
  ),
  CONSTRAINT hb_competitor_candidates_canonical_host CHECK (
    host = lower(host) AND host !~ '[^a-z0-9.-]' AND host ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$'
    AND host NOT LIKE 'www.%'
  ),
  CONSTRAINT hb_competitor_candidates_safe_url CHECK (
    official_url ~ '^https://[a-zA-Z0-9.-]+(/[^?#]*)?$'
    AND (split_part(official_url,'/',3) = host
      OR split_part(official_url,'/',3) = 'www.' || host)
  ),
  CONSTRAINT hb_competitor_candidates_safe_name CHECK (
    length(name) BETWEEN 1 AND 90 AND name = btrim(name) AND name !~ '[[:cntrl:]<>]'
  ),
  CONSTRAINT hb_competitor_candidates_safe_relevance CHECK (
    length(relevance) BETWEEN 1 AND 320 AND relevance = btrim(relevance)
    AND relevance !~ '[[:cntrl:]<>]'
  ),
  CONSTRAINT hb_competitor_candidates_provenance CHECK (
    provenance = 'independently_checked_official_website'
  ),
  CONSTRAINT hb_competitor_candidates_evidence_hash CHECK (
    evidence_digest = encode(sha256(convert_to(
      name || E'\n' || official_url || E'\n' || observed_on::text || E'\n' || relevance,
      'UTF8')), 'hex')
  )
);

COMMENT ON TABLE public.handlarborsen_competitor_candidates IS
  'Owner-gated, project-limited, immutable candidate memory. A discovery is NOT proof of a new company or launch. P1 manual only.';
CREATE INDEX hb_competitor_candidates_first_seen
  ON public.handlarborsen_competitor_candidates(project_id, first_seen_at DESC);

ALTER TABLE public.handlarborsen_competitor_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handlarborsen_competitor_candidates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.handlarborsen_competitor_candidates FROM PUBLIC;
REVOKE ALL ON TABLE public.handlarborsen_competitor_candidates FROM anon;
REVOKE ALL ON TABLE public.handlarborsen_competitor_candidates FROM authenticated;
REVOKE ALL ON TABLE public.handlarborsen_competitor_candidates FROM service_role;
GRANT SELECT, INSERT ON TABLE public.handlarborsen_competitor_candidates TO service_role;
-- No RLS client policies, no UPDATE/DELETE/TRUNCATE privileges. Immutable first win.
