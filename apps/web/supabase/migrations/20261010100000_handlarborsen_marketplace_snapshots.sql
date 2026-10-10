-- ─────────────────────────────────────────────────────────────────────────────
-- Handlarbörsen marketplace snapshots (Atlas collector P1B)
--
-- One row per (project, UTC day): the aggregate counts pulled read-only from
-- Handlarbörsen's /api/internal/atlas-metrics (schema_version 1). Aggregates only;
-- no individual data exists in this table.
--
-- NULL means "unavailable at the source" and is NEVER the same as 0. `unavailable`
-- records the reason per metric and `completeness` says whether the row is whole.
--
-- Isolation: the table is bound to the Handlarbörsen project (FK + fixed-id check),
-- RLS is on with no policy, and every client role is revoked. Only service_role
-- (the collector route) can read or write it. Purely additive: creates one new
-- table; touches no existing object. Not scheduled by any cron.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.handlarborsen_marketplace_snapshots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  snapshot_date  date        NOT NULL,
  observed_at    timestamptz NOT NULL,
  captured_at    timestamptz NOT NULL DEFAULT now(),
  schema_version smallint    NOT NULL,
  window_hours   smallint    NOT NULL,
  completeness   text        NOT NULL,
  unavailable    jsonb       NOT NULL DEFAULT '{}'::jsonb,

  companies_registered_total  bigint,
  companies_verified_total    bigint,
  vehicles_published_active   bigint,
  vehicles_reserved           bigint,
  vehicles_published_last_24h bigint,
  bids_total                  bigint,
  bids_last_24h               bigint,
  interests_last_24h          bigint,
  offers_last_24h             bigint,
  deals_completed_total       bigint,
  deals_completed_last_24h    bigint,

  CONSTRAINT handlarborsen_marketplace_snapshots_project_unique
    UNIQUE (project_id, snapshot_date),
  CONSTRAINT handlarborsen_marketplace_snapshots_project_fixed
    CHECK (project_id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid),
  CONSTRAINT handlarborsen_marketplace_snapshots_contract
    CHECK (schema_version = 1 AND window_hours = 24),
  CONSTRAINT handlarborsen_marketplace_snapshots_completeness
    CHECK (completeness IN ('complete', 'partial', 'unavailable')),
  CONSTRAINT handlarborsen_marketplace_snapshots_complete_has_all
    CHECK (
      completeness <> 'complete' OR (
        companies_registered_total  IS NOT NULL AND companies_verified_total IS NOT NULL
        AND vehicles_published_active IS NOT NULL AND vehicles_reserved IS NOT NULL
        AND vehicles_published_last_24h IS NOT NULL AND bids_total IS NOT NULL
        AND bids_last_24h IS NOT NULL AND interests_last_24h IS NOT NULL
        AND offers_last_24h IS NOT NULL AND deals_completed_total IS NOT NULL
        AND deals_completed_last_24h IS NOT NULL
      )
    ),
  CONSTRAINT handlarborsen_marketplace_snapshots_nonnegative
    CHECK (
      coalesce(companies_registered_total, 0)  >= 0 AND coalesce(companies_verified_total, 0)    >= 0
      AND coalesce(vehicles_published_active, 0) >= 0 AND coalesce(vehicles_reserved, 0)         >= 0
      AND coalesce(vehicles_published_last_24h, 0) >= 0 AND coalesce(bids_total, 0)              >= 0
      AND coalesce(bids_last_24h, 0)           >= 0 AND coalesce(interests_last_24h, 0)          >= 0
      AND coalesce(offers_last_24h, 0)         >= 0 AND coalesce(deals_completed_total, 0)       >= 0
      AND coalesce(deals_completed_last_24h, 0) >= 0
    )
);

COMMENT ON TABLE public.handlarborsen_marketplace_snapshots IS
  'Daily aggregate marketplace counts for Handlarborsen (Atlas collector handlarborsen.marketplace). '
  'NULL metric = unavailable at the source, never zero. Service-role only. Observer data: read-only collection.';

CREATE INDEX IF NOT EXISTS handlarborsen_marketplace_snapshots_date_idx
  ON public.handlarborsen_marketplace_snapshots (project_id, snapshot_date DESC);

-- ── Access: service role only ────────────────────────────────────────────────
ALTER TABLE public.handlarborsen_marketplace_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.handlarborsen_marketplace_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.handlarborsen_marketplace_snapshots FROM anon;
REVOKE ALL ON TABLE public.handlarborsen_marketplace_snapshots FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.handlarborsen_marketplace_snapshots TO service_role;
