-- ─────────────────────────────────────────────────────────────────────────────
-- H1.P5 Commit 2 — claim_id fencing token.
--
-- Adds runs.claim_id (additive, nullable) and rotates it inside the two live RPCs:
--   • claim_runs()      stamps a fresh gen_random_uuid() per claim
--   • reap_stuck_runs() clears it (claim_id = null) when it reclaims a stuck run
--
-- This turns the lease(320s) > maxDuration(300s) TIME heuristic (Codex review #2)
-- into a HARD guarantee: a reclaimed (zombie) invocation's run-writes — conditioned
-- on the claim_id it was handed — match ZERO rows once the token has rotated, so the
-- zombie aborts instead of clobbering the new owner or spending more LLM budget.
--
-- Code-side fencing is gated behind H1_FENCING (default OFF). This migration is INERT
-- until that flag is on: the token is stamped/cleared but never read by drain code.
--
-- Additive & back-compat: pre-Commit-2 drain code ignores claim_id and keeps working
-- (token set but unused). Both functions are CREATE OR REPLACE, so rollback is a
-- single step — re-apply supabase/rollback/h1p5_rpc_baseline_pre_h1p5.sql (the
-- byte-identical pre-H1.P5 definitions), which also neutralizes fencing (baseline
-- claim_runs does not set claim_id; baseline reaper does not clear it).
--
-- Verified on staging branch h1p5-staging (project_ref meeefoltazwtwqlvirnd):
-- claim matrix C1–C5, reaper R1–R4, fencing F1–F3 all green (SQL-level, Tier 1).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.runs add column if not exists claim_id uuid;

-- claim_runs: stamp a fresh claim-token per claim. drain receives it for free via r.*.
create or replace function public.claim_runs(p_limit integer, p_lease_seconds integer default 280)
returns setof public.runs
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return query
  update public.runs r set
    status='running', claimed_at=now(), started_at=coalesce(r.started_at, now()),
    lease_until=now()+make_interval(secs=>p_lease_seconds), attempts=r.attempts+1,
    claim_id=gen_random_uuid()
  where r.id in (select id from public.runs where status='pending' and attempts<max_attempts
                 order by created_at for update skip locked limit p_limit)
  returning r.*;
end $function$;

-- reaper: rotate the token off on reclaim → any still-in-flight zombie is now fenced.
create or replace function omnira_cron.reap_stuck_runs()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare n int;
begin
  update public.runs set
    status=case when attempts>=max_attempts then 'failed' else 'pending' end,
    error=case when attempts>=max_attempts then coalesce(last_error,'Lease expired (stuck run)') else error end,
    finished_at=case when attempts>=max_attempts then now() else finished_at end,
    claimed_at=null, lease_until=null, claim_id=null
  where status='running' and lease_until is not null and lease_until<now();
  get diagnostics n=row_count; return n;
end $function$;
