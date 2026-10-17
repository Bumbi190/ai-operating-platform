begin;
-- Historical values remain immutable. Legacy defaults label existing rows without rewriting counts.
alter table public.handlarborsen_marketplace_snapshots
 add column definition_id text not null default 'handlarborsen-legacy-v1',
 add column data_scope text not null default 'legacy_all_organisations',
 add column excluded_test_organisations bigint;
alter table public.handlarborsen_marketplace_snapshots drop constraint handlarborsen_marketplace_snapshots_contract;
alter table public.handlarborsen_marketplace_snapshots add constraint handlarborsen_marketplace_snapshots_contract check(
 window_hours=24 and ((schema_version=1 and definition_id='handlarborsen-legacy-v1' and data_scope='legacy_all_organisations' and excluded_test_organisations is null)
 or (schema_version=2 and definition_id='handlarborsen-production-v2' and data_scope='production_excluding_quarantined_test'
 and (excluded_test_organisations is null or excluded_test_organisations between 0 and 9007199254740991))));
-- Each definition has its own same-day quality/observation guard; old and new callers coexist.
alter table public.handlarborsen_marketplace_snapshots drop constraint handlarborsen_marketplace_snapshots_project_unique;
alter table public.handlarborsen_marketplace_snapshots add constraint handlarborsen_marketplace_snapshots_project_unique unique(project_id,snapshot_date,definition_id);

CREATE OR REPLACE FUNCTION public.handlarborsen_store_marketplace_snapshot(
  p_snapshot_date date,
  p_observed_at   timestamptz,
  p_unavailable   jsonb,
  p_metrics       jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  c_project constant uuid   := '8f673c09-1c8f-4d78-876e-4c14bf1c89b3';
  c_keys    constant text[] := ARRAY[
    'companies_registered_total', 'companies_verified_total', 'vehicles_published_active',
    'vehicles_reserved', 'vehicles_published_last_24h', 'bids_total', 'bids_last_24h',
    'interests_last_24h', 'offers_last_24h', 'deals_completed_total', 'deals_completed_last_24h'
  ];
  v_key          text;
  v_val          jsonb;
  v_null_keys    text[] := ARRAY[]::text[];
  v_unavail_keys text[];
  v_reason       jsonb;
  v_available    integer;
  v_completeness text;
  v_inserted     boolean;
  v_old          record;
  v_old_avail    integer;
  v_outcome      text;
  v_reject       text;
BEGIN
  -- ── Input validation (fixed codes; never echoes input) ──────────────────────────
  IF p_snapshot_date IS NULL OR p_observed_at IS NULL THEN
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:missing_argument' USING ERRCODE = '22023';
  END IF;
  IF p_snapshot_date <> (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:not_today' USING ERRCODE = '22023';
  END IF;
  IF (p_observed_at AT TIME ZONE 'UTC')::date <> p_snapshot_date
     OR p_observed_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:observed_at' USING ERRCODE = '22023';
  END IF;

  IF p_metrics IS NULL OR jsonb_typeof(p_metrics) <> 'object'
     OR p_unavailable IS NULL OR jsonb_typeof(p_unavailable) <> 'object' THEN
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:shape' USING ERRCODE = '22023';
  END IF;
  IF (SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) FROM jsonb_object_keys(p_metrics) AS k)
     <> (SELECT array_agg(k ORDER BY k) FROM unnest(c_keys) AS k) THEN
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:metric_keys' USING ERRCODE = '22023';
  END IF;

  FOREACH v_key IN ARRAY c_keys LOOP
    v_val := p_metrics -> v_key;
    IF jsonb_typeof(v_val) = 'null' THEN
      v_null_keys := v_null_keys || v_key;
    ELSIF jsonb_typeof(v_val) = 'number' THEN
      -- Non-negative integer only: no sign, fraction or exponent, and below 2^53.
      IF v_val::text !~ '^[0-9]{1,15}$' THEN
        RAISE EXCEPTION 'handlarborsen_snapshot_invalid:metric_value' USING ERRCODE = '22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'handlarborsen_snapshot_invalid:metric_type' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- `unavailable` names exactly the null metrics, each with a known reason.
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_unavail_keys
    FROM jsonb_object_keys(p_unavailable) AS k;
  IF v_unavail_keys <> (SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) FROM unnest(v_null_keys) AS k) THEN
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:unavailable_keys' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY v_unavail_keys LOOP
    v_reason := p_unavailable -> v_key;
    IF jsonb_typeof(v_reason) <> 'string' OR (v_reason #>> '{}') NOT IN ('query_failed', 'invalid_count') THEN
      RAISE EXCEPTION 'handlarborsen_snapshot_invalid:unavailable_reason' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_available    := array_length(c_keys, 1) - coalesce(array_length(v_null_keys, 1), 0);
  v_completeness := CASE
    WHEN v_available = array_length(c_keys, 1) THEN 'complete'
    WHEN v_available = 0 THEN 'unavailable'
    ELSE 'partial'
  END;

  -- ── Insert-or-decide, serialized on the row ─────────────────────────────────────
  -- A concurrent insert for the same day blocks on the unique index and then sees DO
  -- NOTHING; every later step takes the row lock first, so two runs can never both decide
  -- against the same stale state.
  INSERT INTO public.handlarborsen_marketplace_snapshots (
    project_id, snapshot_date, observed_at, captured_at, schema_version, window_hours,
    completeness, unavailable,
    companies_registered_total, companies_verified_total, vehicles_published_active,
    vehicles_reserved, vehicles_published_last_24h, bids_total, bids_last_24h,
    interests_last_24h, offers_last_24h, deals_completed_total, deals_completed_last_24h
  ) VALUES (
    c_project, p_snapshot_date, p_observed_at, now(), 1, 24,
    v_completeness, p_unavailable,
    (p_metrics ->> 'companies_registered_total')::bigint, (p_metrics ->> 'companies_verified_total')::bigint,
    (p_metrics ->> 'vehicles_published_active')::bigint, (p_metrics ->> 'vehicles_reserved')::bigint,
    (p_metrics ->> 'vehicles_published_last_24h')::bigint, (p_metrics ->> 'bids_total')::bigint,
    (p_metrics ->> 'bids_last_24h')::bigint, (p_metrics ->> 'interests_last_24h')::bigint,
    (p_metrics ->> 'offers_last_24h')::bigint, (p_metrics ->> 'deals_completed_total')::bigint,
    (p_metrics ->> 'deals_completed_last_24h')::bigint
  )
  ON CONFLICT (project_id, snapshot_date,definition_id) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted THEN
    RETURN jsonb_build_object(
      'outcome', 'inserted', 'stored', true, 'snapshot_date', p_snapshot_date,
      'completeness', v_completeness, 'available_count', v_available
    );
  END IF;

  SELECT completeness, observed_at,
         num_nonnulls(companies_registered_total, companies_verified_total, vehicles_published_active,
                      vehicles_reserved, vehicles_published_last_24h, bids_total, bids_last_24h,
                      interests_last_24h, offers_last_24h, deals_completed_total,
                      deals_completed_last_24h) AS available
    INTO v_old
    FROM public.handlarborsen_marketplace_snapshots
   WHERE project_id = c_project AND snapshot_date = p_snapshot_date AND definition_id='handlarborsen-legacy-v1'
     FOR UPDATE;

  IF NOT FOUND THEN
    -- Unreachable: the row existed a moment ago and no role may delete it.
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:row_vanished' USING ERRCODE = '55000';
  END IF;
  v_old_avail := v_old.available;

  IF v_available > v_old_avail THEN
    v_outcome := 'upgraded';
  ELSIF v_available = v_old_avail AND p_observed_at > v_old.observed_at THEN
    v_outcome := 'refreshed';
  ELSIF v_available = v_old_avail AND p_observed_at = v_old.observed_at THEN
    v_outcome := 'unchanged';
  ELSE
    v_outcome := 'rejected';
    v_reject  := CASE WHEN v_available < v_old_avail THEN 'lower_quality' ELSE 'older_observation' END;
  END IF;

  IF v_outcome IN ('upgraded', 'refreshed') THEN
    UPDATE public.handlarborsen_marketplace_snapshots SET
      observed_at = p_observed_at, captured_at = now(), completeness = v_completeness,
      unavailable = p_unavailable,
      companies_registered_total  = (p_metrics ->> 'companies_registered_total')::bigint,
      companies_verified_total    = (p_metrics ->> 'companies_verified_total')::bigint,
      vehicles_published_active   = (p_metrics ->> 'vehicles_published_active')::bigint,
      vehicles_reserved           = (p_metrics ->> 'vehicles_reserved')::bigint,
      vehicles_published_last_24h = (p_metrics ->> 'vehicles_published_last_24h')::bigint,
      bids_total                  = (p_metrics ->> 'bids_total')::bigint,
      bids_last_24h               = (p_metrics ->> 'bids_last_24h')::bigint,
      interests_last_24h          = (p_metrics ->> 'interests_last_24h')::bigint,
      offers_last_24h             = (p_metrics ->> 'offers_last_24h')::bigint,
      deals_completed_total       = (p_metrics ->> 'deals_completed_total')::bigint,
      deals_completed_last_24h    = (p_metrics ->> 'deals_completed_last_24h')::bigint
     WHERE project_id = c_project AND snapshot_date = p_snapshot_date AND definition_id='handlarborsen-legacy-v1';
  END IF;

  RETURN jsonb_build_object(
    'outcome', v_outcome,
    'stored', v_outcome IN ('upgraded', 'refreshed'),
    'reason', v_reject,
    'snapshot_date', p_snapshot_date,
    'completeness', v_completeness,
    'available_count', v_available,
    'existing_completeness', v_old.completeness,
    'existing_available_count', v_old_avail,
    'existing_observed_at', v_old.observed_at
  );
END;
$fn$;

COMMENT ON FUNCTION public.handlarborsen_store_marketplace_snapshot(date, timestamptz, jsonb, jsonb) IS
  'The only write path to handlarborsen_marketplace_snapshots. Atomic insert-or-decide under a row lock: '
  'a complete report is never replaced by a less complete one, an older observation never replaces a newer '
  'one of equal quality, only today (UTC) is writable. Returns {outcome, stored, ...}. Service role only.';

REVOKE ALL ON FUNCTION public.handlarborsen_store_marketplace_snapshot(date, timestamptz, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handlarborsen_store_marketplace_snapshot(date, timestamptz, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.handlarborsen_store_marketplace_snapshot(date, timestamptz, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handlarborsen_store_marketplace_snapshot(date, timestamptz, jsonb, jsonb) TO service_role;

-- The function is now the only writer. Without INSERT/UPDATE a direct upsert (the P1B code
-- path, or any future caller) cannot bypass the rule. SELECT stays for the report reader.
REVOKE INSERT, UPDATE ON TABLE public.handlarborsen_marketplace_snapshots FROM service_role;

CREATE OR REPLACE FUNCTION public.handlarborsen_store_marketplace_snapshot_v2(
  p_snapshot_date date,
  p_observed_at   timestamptz,
  p_unavailable   jsonb,
  p_metrics       jsonb,
  p_excluded_test_organisations bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  c_project constant uuid   := '8f673c09-1c8f-4d78-876e-4c14bf1c89b3';
  c_keys    constant text[] := ARRAY[
    'companies_registered_total', 'companies_verified_total', 'vehicles_published_active',
    'vehicles_reserved', 'vehicles_published_last_24h', 'bids_total', 'bids_last_24h',
    'interests_last_24h', 'offers_last_24h', 'deals_completed_total', 'deals_completed_last_24h'
  ];
  v_key          text;
  v_val          jsonb;
  v_null_keys    text[] := ARRAY[]::text[];
  v_unavail_keys text[];
  v_reason       jsonb;
  v_available    integer;
  v_completeness text;
  v_inserted     boolean;
  v_old          record;
  v_old_avail    integer;
  v_outcome      text;
  v_reject       text;
BEGIN
  IF p_excluded_test_organisations<0 OR p_excluded_test_organisations>9007199254740991 THEN RAISE EXCEPTION 'handlarborsen_snapshot_invalid:excluded_count' USING ERRCODE='22023'; END IF;
  -- ── Input validation (fixed codes; never echoes input) ──────────────────────────
  IF p_snapshot_date IS NULL OR p_observed_at IS NULL THEN
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:missing_argument' USING ERRCODE = '22023';
  END IF;
  IF p_snapshot_date <> (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:not_today' USING ERRCODE = '22023';
  END IF;
  IF (p_observed_at AT TIME ZONE 'UTC')::date <> p_snapshot_date
     OR p_observed_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:observed_at' USING ERRCODE = '22023';
  END IF;

  IF p_metrics IS NULL OR jsonb_typeof(p_metrics) <> 'object'
     OR p_unavailable IS NULL OR jsonb_typeof(p_unavailable) <> 'object' THEN
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:shape' USING ERRCODE = '22023';
  END IF;
  IF (SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) FROM jsonb_object_keys(p_metrics) AS k)
     <> (SELECT array_agg(k ORDER BY k) FROM unnest(c_keys) AS k) THEN
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:metric_keys' USING ERRCODE = '22023';
  END IF;

  FOREACH v_key IN ARRAY c_keys LOOP
    v_val := p_metrics -> v_key;
    IF jsonb_typeof(v_val) = 'null' THEN
      v_null_keys := v_null_keys || v_key;
    ELSIF jsonb_typeof(v_val) = 'number' THEN
      -- Non-negative integer only: no sign, fraction or exponent, and below 2^53.
      IF v_val::text !~ '^[0-9]{1,15}$' THEN
        RAISE EXCEPTION 'handlarborsen_snapshot_invalid:metric_value' USING ERRCODE = '22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'handlarborsen_snapshot_invalid:metric_type' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- `unavailable` names exactly the null metrics, each with a known reason.
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_unavail_keys
    FROM jsonb_object_keys(p_unavailable) AS k;
  IF v_unavail_keys <> (SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) FROM unnest(v_null_keys) AS k) THEN
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:unavailable_keys' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY v_unavail_keys LOOP
    v_reason := p_unavailable -> v_key;
    IF jsonb_typeof(v_reason) <> 'string' OR (v_reason #>> '{}') NOT IN ('query_failed', 'invalid_count') THEN
      RAISE EXCEPTION 'handlarborsen_snapshot_invalid:unavailable_reason' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_available    := array_length(c_keys, 1) - coalesce(array_length(v_null_keys, 1), 0);
  v_completeness := CASE
    WHEN v_available = array_length(c_keys, 1) THEN 'complete'
    WHEN v_available = 0 THEN 'unavailable'
    ELSE 'partial'
  END;

  -- ── Insert-or-decide, serialized on the row ─────────────────────────────────────
  -- A concurrent insert for the same day blocks on the unique index and then sees DO
  -- NOTHING; every later step takes the row lock first, so two runs can never both decide
  -- against the same stale state.
  INSERT INTO public.handlarborsen_marketplace_snapshots (
    project_id, snapshot_date, observed_at, captured_at, schema_version, window_hours,
    definition_id,data_scope,excluded_test_organisations,completeness, unavailable,
    companies_registered_total, companies_verified_total, vehicles_published_active,
    vehicles_reserved, vehicles_published_last_24h, bids_total, bids_last_24h,
    interests_last_24h, offers_last_24h, deals_completed_total, deals_completed_last_24h
  ) VALUES (
    c_project, p_snapshot_date, p_observed_at, now(), 2, 24,
    'handlarborsen-production-v2','production_excluding_quarantined_test',p_excluded_test_organisations,
    v_completeness, p_unavailable,
    (p_metrics ->> 'companies_registered_total')::bigint, (p_metrics ->> 'companies_verified_total')::bigint,
    (p_metrics ->> 'vehicles_published_active')::bigint, (p_metrics ->> 'vehicles_reserved')::bigint,
    (p_metrics ->> 'vehicles_published_last_24h')::bigint, (p_metrics ->> 'bids_total')::bigint,
    (p_metrics ->> 'bids_last_24h')::bigint, (p_metrics ->> 'interests_last_24h')::bigint,
    (p_metrics ->> 'offers_last_24h')::bigint, (p_metrics ->> 'deals_completed_total')::bigint,
    (p_metrics ->> 'deals_completed_last_24h')::bigint
  )
  ON CONFLICT (project_id, snapshot_date,definition_id) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted THEN
    RETURN jsonb_build_object(
      'outcome', 'inserted', 'stored', true, 'snapshot_date', p_snapshot_date,
      'completeness', v_completeness, 'available_count', v_available
    );
  END IF;

  SELECT completeness, observed_at,
         num_nonnulls(companies_registered_total, companies_verified_total, vehicles_published_active,
                      vehicles_reserved, vehicles_published_last_24h, bids_total, bids_last_24h,
                      interests_last_24h, offers_last_24h, deals_completed_total,
                      deals_completed_last_24h) AS available
    INTO v_old
    FROM public.handlarborsen_marketplace_snapshots
   WHERE project_id = c_project AND snapshot_date = p_snapshot_date AND definition_id='handlarborsen-production-v2'
     FOR UPDATE;

  IF NOT FOUND THEN
    -- Unreachable: the row existed a moment ago and no role may delete it.
    RAISE EXCEPTION 'handlarborsen_snapshot_invalid:row_vanished' USING ERRCODE = '55000';
  END IF;
  v_old_avail := v_old.available;

  IF v_available > v_old_avail THEN
    v_outcome := 'upgraded';
  ELSIF v_available = v_old_avail AND p_observed_at > v_old.observed_at THEN
    v_outcome := 'refreshed';
  ELSIF v_available = v_old_avail AND p_observed_at = v_old.observed_at THEN
    v_outcome := 'unchanged';
  ELSE
    v_outcome := 'rejected';
    v_reject  := CASE WHEN v_available < v_old_avail THEN 'lower_quality' ELSE 'older_observation' END;
  END IF;

  IF v_outcome IN ('upgraded', 'refreshed') THEN
    UPDATE public.handlarborsen_marketplace_snapshots SET
      observed_at = p_observed_at, captured_at = now(), completeness = v_completeness,
      excluded_test_organisations=p_excluded_test_organisations,
      unavailable = p_unavailable,
      companies_registered_total  = (p_metrics ->> 'companies_registered_total')::bigint,
      companies_verified_total    = (p_metrics ->> 'companies_verified_total')::bigint,
      vehicles_published_active   = (p_metrics ->> 'vehicles_published_active')::bigint,
      vehicles_reserved           = (p_metrics ->> 'vehicles_reserved')::bigint,
      vehicles_published_last_24h = (p_metrics ->> 'vehicles_published_last_24h')::bigint,
      bids_total                  = (p_metrics ->> 'bids_total')::bigint,
      bids_last_24h               = (p_metrics ->> 'bids_last_24h')::bigint,
      interests_last_24h          = (p_metrics ->> 'interests_last_24h')::bigint,
      offers_last_24h             = (p_metrics ->> 'offers_last_24h')::bigint,
      deals_completed_total       = (p_metrics ->> 'deals_completed_total')::bigint,
      deals_completed_last_24h    = (p_metrics ->> 'deals_completed_last_24h')::bigint
     WHERE project_id = c_project AND snapshot_date = p_snapshot_date AND definition_id='handlarborsen-production-v2';
  END IF;

  RETURN jsonb_build_object(
    'outcome', v_outcome,
    'stored', v_outcome IN ('upgraded', 'refreshed'),
    'reason', v_reject,
    'snapshot_date', p_snapshot_date,
    'completeness', v_completeness,
    'available_count', v_available,
    'existing_completeness', v_old.completeness,
    'existing_available_count', v_old_avail,
    'existing_observed_at', v_old.observed_at
  );
END;
$fn$;

COMMENT ON FUNCTION public.handlarborsen_store_marketplace_snapshot_v2(date, timestamptz, jsonb, jsonb,bigint) IS
  'The only write path to handlarborsen_marketplace_snapshots. Atomic insert-or-decide under a row lock: '
  'a complete report is never replaced by a less complete one, an older observation never replaces a newer '
  'one of equal quality, only today (UTC) is writable. Returns {outcome, stored, ...}. Service role only.';

REVOKE ALL ON FUNCTION public.handlarborsen_store_marketplace_snapshot_v2(date, timestamptz, jsonb, jsonb,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handlarborsen_store_marketplace_snapshot_v2(date, timestamptz, jsonb, jsonb,bigint) FROM anon;
REVOKE ALL ON FUNCTION public.handlarborsen_store_marketplace_snapshot_v2(date, timestamptz, jsonb, jsonb,bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handlarborsen_store_marketplace_snapshot_v2(date, timestamptz, jsonb, jsonb,bigint) TO service_role;

-- The function is now the only writer. Without INSERT/UPDATE a direct upsert (the P1B code
-- path, or any future caller) cannot bypass the rule. SELECT stays for the report reader.
REVOKE INSERT, UPDATE ON TABLE public.handlarborsen_marketplace_snapshots FROM service_role;

commit;
