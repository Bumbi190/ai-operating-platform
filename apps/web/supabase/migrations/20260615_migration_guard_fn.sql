-- ─────────────────────────────────────────────────────────────────────────────
-- Migration guard — read-only ledger reader (H1 process hardening, NOT a feature).
--
-- Exposes the list of APPLIED migration names from the Supabase migration ledger
-- (supabase_migrations.schema_migrations) to the Vercel build via PostgREST RPC,
-- so the build-time guard (scripts/check-migrations.mjs) can fail the build when a
-- repo migration has not been applied — preventing another P3-style "code deployed
-- before its migration" incident.
--
-- SECURITY DEFINER because supabase_migrations is NOT exposed to PostgREST; the
-- function lives in `public` (which IS exposed) and is callable only by service_role
-- (the same mechanism the drain already uses for public.claim_runs). Read-only,
-- returns only migration names — no other data, no writes, no RLS impact.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.omnira_applied_migrations()
returns text[]
language sql
security definer
set search_path = ''
as $$
  select coalesce(array_agg(name), '{}')
  from supabase_migrations.schema_migrations
  where name is not null;
$$;

revoke all on function public.omnira_applied_migrations() from public, anon, authenticated;
grant execute on function public.omnira_applied_migrations() to service_role;

comment on function public.omnira_applied_migrations() is
  'H1 migration guard: read-only list of applied migration names from the Supabase ledger. SECURITY DEFINER so the Vercel build can read it via the service-role key over PostgREST (supabase_migrations is not exposed to the API). Returns only names; no other data.';
