-- ─────────────────────────────────────────────────────────────────────────────
-- H1.P5 ROLLBACK BASELINE — verbatim pre-H1.P5 definitions of the two live RPCs
-- that H1.P5 will modify (claim_runs, reap_stuck_runs).
--
-- Captured from PRODUCTION (project iboepohjwrhtgshrqaol) via pg_get_functiondef
-- on 2026-06-14, BEFORE any H1.P5 change. Both are CREATE OR REPLACE, so executing
-- this file restores byte-identical prior behavior in one step.
--
-- HOW TO ROLL BACK (if H1.P5's RPC changes must be reverted):
--   Run these two statements against the target project (prod or branch) via
--   apply_migration(name='h1p5_rpc_rollback_to_baseline', query=<this file>) or
--   execute_sql. This re-instates the exact pre-H1.P5 claim_runs / reap_stuck_runs.
--   (Reverting the RPCs also neutralizes claim_id fencing: the baseline claim_runs
--   does NOT set claim_id and the baseline reaper does NOT clear it — runs simply
--   fall back to the lease>maxDuration heuristic that was in effect before H1.P5.)
--
-- VERIFICATION OF FIDELITY: these bodies are the raw output of pg_get_functiondef
-- against the live functions; no edits. Re-running pg_get_functiondef after applying
-- this file must return an identical string (the rollback acceptance check).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── claim_runs (baseline) ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_runs(p_limit integer, p_lease_seconds integer DEFAULT 280)
 RETURNS SETOF runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  update public.runs r set
    status      = 'running',
    claimed_at  = now(),
    started_at  = coalesce(r.started_at, now()),
    lease_until = now() + make_interval(secs => p_lease_seconds),
    attempts    = r.attempts + 1
  where r.id in (
    select id from public.runs
    where status = 'pending' and attempts < max_attempts
    order by created_at
    for update skip locked
    limit p_limit
  )
  returning r.*;
end $function$;

-- ── reap_stuck_runs (baseline) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION omnira_cron.reap_stuck_runs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  update public.runs set
    status      = case when attempts >= max_attempts then 'failed' else 'pending' end,
    error       = case when attempts >= max_attempts then coalesce(last_error,'Lease expired (stuck run)') else error end,
    finished_at = case when attempts >= max_attempts then now() else finished_at end,
    claimed_at  = null,
    lease_until = null
  where status = 'running' and lease_until is not null and lease_until < now();
  get diagnostics n = row_count;
  return n;
end $function$;
