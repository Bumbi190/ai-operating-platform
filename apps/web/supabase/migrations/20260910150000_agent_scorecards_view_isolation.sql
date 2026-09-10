-- Phase 9AA — agent_scorecards view isolation (fresh-deploy only).
--
-- WHAT WAS WRONG. 20260528_agent_decisions.sql creates
--
--   CREATE OR REPLACE VIEW agent_scorecards AS … FROM agents, runs, run_logs …
--
-- with no options. A view runs with its OWNER's privileges unless it is marked
-- security_invoker, so the RLS on agents, runs and run_logs — all owner-rooted,
-- all correct — is simply not consulted when the view is read. And Supabase's
-- default privileges hand every new object in `public`, views included, to anon
-- and authenticated. On a database rebuilt from repo SQL, anon holding only the
-- public key reads every tenant's agent roster through it (agent id, project id,
-- name, run and step counts, tokens, durations, success rate, state), and every
-- signed-in user reads the other tenants' rows. Proven on throwaway rebuilds,
-- both `psql -f` and one transaction per file: the base `agents` table gave anon
-- 0 rows and user A only their own; the view gave both of them every project.
--
-- PRODUCTION IS NOT AFFECTED. The creating migration is grandfathered by
-- scripts/check-migrations.mjs and was never applied there: no view by this
-- name exists in any schema, and `public` holds no views at all. This migration
-- therefore does nothing in production. It exists so a fresh or drifted
-- environment cannot come up with the bypass.
--
-- WHY SERVER-ONLY. Nothing reads the view. The Agent Fleet panel it was meant
-- to power is built by lib/os/scoring.ts#fetchAgentScorecards, which reads
-- agents, run_logs and runs directly through the service-role client. There is
-- no browser caller and no user-bound caller, so there is no client surface to
-- preserve — keeping one would invent a product surface that does not exist.
--
-- WHY BOTH HALVES. security_invoker makes the view honour the caller's RLS, so
-- even a grant restored later by mistake returns only what the caller could
-- already see. The revoke removes the grant as well, so the view reaches no
-- client at all. Either alone would close today's leak; together a later slip
-- in one of them is still not an exposure. Same pairing as Phase 9Y and 9AB.
-- security_invoker needs Postgres 15; production runs 17.
--
-- NOT A DROP. Dropping would destroy an object other environments may have;
-- locking it down is the smaller change and keeps it usable server-side.
--
-- VIEW OPTIONS AND PRIVILEGES ONLY. No table, policy, row or column is touched.
-- The guard checks relkind so a same-named table could never be altered by it.

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'agent_scorecards'
      and c.relkind = 'v'
  ) then
    alter view public.agent_scorecards set (security_invoker = true);
    revoke all on public.agent_scorecards from public, anon, authenticated;
    grant select on public.agent_scorecards to service_role;
  end if;
end
$$;
