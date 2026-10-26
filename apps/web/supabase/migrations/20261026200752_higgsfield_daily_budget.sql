-- The Prompt + Familje-Stunden: shared conservative allowance for future
-- Higgsfield media GENERATION only. This migration does not enable generation.
-- Five SEK/day, valued at a deliberately cautious minimum of 1 SEK/credit;
-- the actual subscription invoice, FX and top-ups remain provider-controlled.
-- Every uncertain dispatch retains its whole reservation (no refunds/retries).
-- Reset at midnight Europe/Stockholm, not midnight UTC.
CREATE TABLE public.higgsfield_daily_reservations (
 request_id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES public.projects(id),
 quoted_credits numeric(12,4) NOT NULL CHECK (quoted_credits > 0 AND quoted_credits <= 5),
 reserved_sek numeric(12,2) NOT NULL CHECK (reserved_sek > 0 AND reserved_sek <= 5),
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX higgsfield_daily_reservations_time_idx
 ON public.higgsfield_daily_reservations(reserved_at);
ALTER TABLE public.higgsfield_daily_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.higgsfield_daily_reservations FORCE ROW LEVEL SECURITY;
-- This is DB_INTERNAL, not SERVER_ONLY: service_role may not forge journal
-- entries or bypass the serialized reservation RPC with direct table writes.
REVOKE ALL ON TABLE public.higgsfield_daily_reservations
 FROM PUBLIC, anon, authenticated, service_role;

-- A SECURITY DEFINER is necessary because the journal is DB_INTERNAL.
-- Lock *before* summing; all projects share this SINGLE daily ceiling.
CREATE FUNCTION public.higgsfield_daily_budget_reserve(
 p_request_id uuid, p_project_id uuid, p_quoted_credits numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_now timestamptz;
 v_start timestamptz;
 v_end timestamptz;
 v_amount numeric(12,2);
 v_spent numeric(12,2);
 v_slug text;
BEGIN
 IF p_request_id IS NULL OR p_project_id IS NULL
   OR p_quoted_credits IS NULL OR p_quoted_credits <= 0
   OR p_quoted_credits > 5
   OR p_quoted_credits::text IN ('NaN','Infinity','-Infinity') THEN
  RETURN pg_catalog.jsonb_build_object('allowed',false,'reason','invalid_request');
 END IF;
 -- The server's quote cannot buy more than the approved allowance. Round UP
 -- to øre, never down; 1 SEK per credit is an allowance value, not an invoice.
 v_amount := pg_catalog.ceil(p_quoted_credits * 100)::numeric / 100;
 IF v_amount < 0.01 OR v_amount > 5 THEN
  RETURN pg_catalog.jsonb_build_object('allowed',false,'reason','single_request_exceeds_day');
 END IF;
 SELECT slug INTO v_slug FROM public.projects WHERE id=p_project_id;
 IF v_slug IS NULL OR v_slug NOT IN ('ai-media-automation','familje-stunden') THEN
  RETURN pg_catalog.jsonb_build_object('allowed',false,'reason','wrong_project');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(172961, 50005);
 -- Use the instant AFTER acquiring the lock, including when a waiter crossed
 -- Stockholm midnight. A clock captured before waiting can charge yesterday.
 v_now := clock_timestamp();
 IF EXISTS(SELECT 1 FROM public.higgsfield_daily_reservations WHERE request_id=p_request_id) THEN
  RETURN pg_catalog.jsonb_build_object('allowed',false,'reason','replay');
 END IF;
 v_start := pg_catalog.date_trunc('day',v_now AT TIME ZONE 'Europe/Stockholm')
   AT TIME ZONE 'Europe/Stockholm';
 v_end := (pg_catalog.date_trunc('day',v_now AT TIME ZONE 'Europe/Stockholm')
   + interval '1 day') AT TIME ZONE 'Europe/Stockholm';
 SELECT COALESCE(pg_catalog.sum(reserved_sek),0) INTO v_spent
 FROM public.higgsfield_daily_reservations
 WHERE reserved_at >= v_start AND reserved_at < v_end;
 IF v_spent + v_amount > 5 THEN
  RETURN pg_catalog.jsonb_build_object('allowed',false,'reason','daily_limit',
    'reserved_sek',v_spent,'remaining_sek',GREATEST(0,5-v_spent));
 END IF;
 INSERT INTO public.higgsfield_daily_reservations(
  request_id,project_id,quoted_credits,reserved_sek,reserved_at
 ) VALUES(p_request_id,p_project_id,p_quoted_credits,v_amount,v_now);
 RETURN pg_catalog.jsonb_build_object('allowed',true,'reason','reserved',
  'reserved_sek',v_amount,'remaining_sek',5-v_spent-v_amount);
END
$function$;

-- Status cannot grant spending rights or reveal another project's details.
CREATE FUNCTION public.higgsfield_daily_budget_status() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $function$
 WITH bounds AS (
  SELECT (pg_catalog.date_trunc('day',pg_catalog.now() AT TIME ZONE 'Europe/Stockholm')
   AT TIME ZONE 'Europe/Stockholm') AS start_at,
   ((pg_catalog.date_trunc('day',pg_catalog.now() AT TIME ZONE 'Europe/Stockholm')
   + interval '1 day') AT TIME ZONE 'Europe/Stockholm') AS end_at,
   pg_catalog.to_char(pg_catalog.now() AT TIME ZONE 'Europe/Stockholm','YYYY-MM-DD') AS swedish_day
 ), used AS (
  SELECT COALESCE(pg_catalog.sum(r.reserved_sek),0) AS reserved_sek,
    COALESCE(pg_catalog.sum(r.quoted_credits),0) AS reserved_credits
  FROM bounds b LEFT JOIN public.higgsfield_daily_reservations r
   ON r.reserved_at>=b.start_at AND r.reserved_at<b.end_at
 )
 SELECT pg_catalog.jsonb_build_object(
  'day',(SELECT swedish_day FROM bounds),'budget_sek',5,
  'reserved_sek',(SELECT reserved_sek FROM used),
  'reserved_credits',(SELECT reserved_credits FROM used),
  'remaining_sek',5-(SELECT reserved_sek FROM used),
  'paid_generation_enabled',false
 )
$function$;

-- Functions are in an API-exposed schema; PUBLIC gets EXECUTE by default.
REVOKE ALL ON FUNCTION public.higgsfield_daily_budget_reserve(uuid,uuid,numeric)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.higgsfield_daily_budget_status()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.higgsfield_daily_budget_reserve(uuid,uuid,numeric)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.higgsfield_daily_budget_status()
 TO service_role;
