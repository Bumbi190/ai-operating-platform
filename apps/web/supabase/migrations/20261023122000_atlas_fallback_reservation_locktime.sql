-- Lock-time budget boundary: when a concurrent reservation waits across
-- Stockholm midnight, use the instant AFTER acquiring the transaction lock.
-- No data migration or reduction of permissions.
CREATE OR REPLACE FUNCTION public.atlas_fallback_reserve(
  p_request_id uuid, p_project_id uuid, p_task_kind text, p_ceiling_sek numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz;
  v_day_start timestamptz;
  v_month_start timestamptz;
  v_amount numeric(12,4);
  v_day_used numeric(12,4);
  v_month_used numeric(12,4);
  v_slug text;
BEGIN
  IF p_request_id IS NULL OR p_project_id IS NULL OR p_task_kind IS NULL
    OR p_task_kind NOT IN ('news','briefing','dream','media')
    OR p_ceiling_sek IS NULL OR p_ceiling_sek <= 0 OR p_ceiling_sek > 10
    OR p_ceiling_sek::text IN ('NaN','Infinity','-Infinity') THEN
    RETURN pg_catalog.jsonb_build_object('allowed',false,'reason','invalid_request');
  END IF;
  v_amount := pg_catalog.ceil(p_ceiling_sek * 100)::numeric / 100;
  IF v_amount < 0.01 OR v_amount > 10 THEN
    RETURN pg_catalog.jsonb_build_object('allowed',false,'reason','invalid_amount');
  END IF;

  -- The caller must represent a real project. The Prompt-only tasks cannot
  -- spend on arbitrary tenants even if an internal code path is misrouted.
  SELECT p.slug INTO v_slug FROM public.projects AS p WHERE p.id=p_project_id;
  IF v_slug IS NULL OR (p_task_kind IN ('news','briefing','media') AND v_slug <> 'ai-media-automation') THEN
    RETURN pg_catalog.jsonb_build_object('allowed',false,'reason','wrong_project');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(172961, 10010);
  -- Establish the billable calendar instant AFTER acquiring the global lock.
  -- Otherwise a waiter straddling midnight could consume the previous day.
  v_now := clock_timestamp();
  -- Existing idempotency request never authorizes another dispatch.
  IF EXISTS(SELECT 1 FROM public.atlas_fallback_reservations WHERE request_id=p_request_id) THEN
    RETURN pg_catalog.jsonb_build_object('allowed',false,'reason','replay');
  END IF;

  v_day_start := pg_catalog.date_trunc('day', v_now AT TIME ZONE 'Europe/Stockholm')
                    AT TIME ZONE 'Europe/Stockholm';
  v_month_start := pg_catalog.date_trunc('month', v_now AT TIME ZONE 'Europe/Stockholm')
                      AT TIME ZONE 'Europe/Stockholm';
  SELECT COALESCE(SUM(ceiling_sek),0) INTO v_day_used
  FROM public.atlas_fallback_reservations WHERE reserved_at >= v_day_start;
  SELECT COALESCE(SUM(ceiling_sek),0) INTO v_month_used
  FROM public.atlas_fallback_reservations WHERE reserved_at >= v_month_start;
  IF v_day_used + v_amount > 10 OR v_month_used + v_amount > 100 THEN
    RETURN pg_catalog.jsonb_build_object('allowed',false,
      'reason',CASE WHEN v_day_used + v_amount > 10 THEN 'daily_limit' ELSE 'monthly_limit' END);
  END IF;

  INSERT INTO public.atlas_fallback_reservations(
    request_id, project_id, task_kind, ceiling_sek, reserved_at
  ) VALUES(p_request_id, p_project_id, p_task_kind, v_amount, v_now);

  RETURN pg_catalog.jsonb_build_object('allowed',true,'reason','reserved');
END;
$function$;
REVOKE ALL ON FUNCTION public.atlas_fallback_reserve(uuid,uuid,text,numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_fallback_reserve(uuid,uuid,text,numeric)
  TO service_role;
