-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Collectors v1 — Migration 3: Collector Runs Audit Table
--
-- Append-only audit log for every collector execution, regardless of outcome.
-- One row per (collector × project × run). Never update rows — insert only.
--
-- status values:
--   ok      = Atlas signal emitted successfully. store() (snapshot table write) is
--             non-fatal: a store() failure does NOT change status to 'error'. If
--             store() failed, metadata.__store_error captures the message and
--             signal_id is still populated. Query metadata->>'__store_error' IS NOT
--             NULL to find runs with a failed snapshot write alongside a good signal.
--   skipped = validate() returned null (e.g. Stripe not configured, no tokens, no data)
--   error   = unhandled exception in fetch/validate/normalize or recordSignal; see error_message
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.collector_runs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id   text        NOT NULL,
  project_id     uuid        REFERENCES public.projects(id) ON DELETE SET NULL,
  snapshot_date  date        NOT NULL,
  status         text        NOT NULL
    CONSTRAINT collector_runs_status_check
    CHECK (status IN ('ok', 'skipped', 'error')),
  signal_id      uuid,            -- FK NOT enforced — signals in same table, append-only
  signal_kind    text,
  duration_ms    int,
  error_message  text,            -- truncated to 1000 chars at write time
  metadata       jsonb       NOT NULL DEFAULT '{}',
  ran_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.collector_runs IS
  'Atlas Collector audit log — append-only. '
  'One row per collector execution regardless of outcome (ok / skipped / error). '
  'Never update rows, only insert.';

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Collector health dashboard: recent runs per collector
CREATE INDEX IF NOT EXISTS collector_runs_id_date_idx
  ON public.collector_runs (collector_id, ran_at DESC);

-- Project-level signal history
CREATE INDEX IF NOT EXISTS collector_runs_project_idx
  ON public.collector_runs (project_id, ran_at DESC);

-- Error triage: recent failures across all collectors
CREATE INDEX IF NOT EXISTS collector_runs_errors_idx
  ON public.collector_runs (ran_at DESC)
  WHERE status = 'error';

-- ── RLS: service-role only ────────────────────────────────────────────────────
-- Collector routes run with service-role credentials and bypass RLS.
-- Authenticated clients (browser) must never read or write this table directly.

ALTER TABLE public.collector_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS collector_runs_service_only ON public.collector_runs;
CREATE POLICY collector_runs_service_only ON public.collector_runs
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
