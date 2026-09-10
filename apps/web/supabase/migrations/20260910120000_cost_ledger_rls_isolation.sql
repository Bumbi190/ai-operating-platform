-- Phase 9AB — cost-ledger RLS policy isolation.
--
-- WHAT WAS WRONG. Five policies, all written the same way:
--
--   USING ( project_id IS NULL OR project_id IN (SELECT id FROM projects
--                                                WHERE owner_id = auth.uid()) )
--
-- with no TO clause, which means role PUBLIC — anon included. The second branch
-- is bounded by the caller. The first is not: `project_id IS NULL` is true for a
-- platform-level row no matter who asks. RLS was on and the policy mentioned
-- auth.uid(), which is exactly why five closure audits walked past it — the
-- check everyone ran was "RLS enabled, and the policy references the caller",
-- and this passes both.
--
-- Live in production on public.cost_events: anon, holding only the public key,
-- read 87 platform-level cost rows (provider, model, agent, tokens, cost_usd,
-- cost_sek, run_id, script_id, metadata). The policies are FOR ALL with no WITH
-- CHECK, so Postgres reuses USING for writes: proven on a throwaway database
-- with the identical policy and grants, anon could also INSERT, UPDATE and
-- DELETE null-project rows. public.infra_costs has the same policy and 0 rows.
-- agent_decisions, memory_refs and ai_cost_snapshots are not in production but
-- would recreate the same exposure on any rebuild; memory_refs inlines the
-- branch inside the subquery it reads agent_decisions through.
--
-- WHY SERVER-ONLY, NOT A CORRECTED OWNER POLICY. Product behaviour decides the
-- policy, not the presence of a project_id column. Every real caller of these
-- tables reaches them through the service-role client:
--   cost_events  — written by lib/cost/track.ts; read by the CostIntelligence
--                  server component and by lib/atlas/{activity,context,operations}
--                  via the chat route, the Atlas pages and the context shadow,
--                  all of which pass createAdminClient()
--   infra_costs, agent_decisions, memory_refs, ai_cost_snapshots
--                — no application reader or writer at all
-- No browser code and no user-bound RLS client touches any of them. So there is
-- no owner-scoped access to preserve, and writing a tidier owner policy would
-- invent a product surface that does not exist. Dropping the policy leaves RLS
-- on with nothing to satisfy: default-deny for every non-bypass role.
--
-- WHY THE REVOKE IS NOT REDUNDANT. RLS with no policy already denies anon and
-- authenticated. The revoke removes the privilege as well, so a permissive
-- policy added later by mistake still reaches nothing. Until the Phase 9AA
-- migration security gate exists, CI would not catch such a policy — the revoke
-- is the control that holds in the meantime. Same pairing as Phase 9Y.
--
-- NOT `TO authenticated`. Retargeting the same policy to authenticated would
-- keep the caller-independent branch and hand every signed-in user the
-- platform-level rows. The branch itself is what goes.
--
-- POLICY AND PRIVILEGE ONLY. No row is read, written, moved or deleted. RLS is
-- not disabled; triggers, constraints and project_id values are untouched. The
-- service role keeps its access, and it bypasses RLS, so every existing writer
-- and reader works exactly as before.
--
-- The three fresh-deploy-only tables do not exist in production, and
-- `DROP POLICY … ON t` fails when t is absent even with IF EXISTS, so they are
-- guarded on existence. The block runs at migration time and only ever narrows
-- access.

drop policy if exists "cost_events_owner" on public.cost_events;
revoke all on public.cost_events from anon, authenticated;
grant  all on public.cost_events to service_role;

drop policy if exists "infra_costs_owner" on public.infra_costs;
revoke all on public.infra_costs from anon, authenticated;
grant  all on public.infra_costs to service_role;

do $$
begin
  if to_regclass('public.agent_decisions') is not null then
    drop policy if exists "decisions readable by project owner" on public.agent_decisions;
    revoke all on public.agent_decisions from anon, authenticated;
    grant  all on public.agent_decisions to service_role;
  end if;

  if to_regclass('public.memory_refs') is not null then
    drop policy if exists "memory_refs readable through decision" on public.memory_refs;
    revoke all on public.memory_refs from anon, authenticated;
    grant  all on public.memory_refs to service_role;
  end if;

  if to_regclass('public.ai_cost_snapshots') is not null then
    drop policy if exists "cost_snap_owner" on public.ai_cost_snapshots;
    revoke all on public.ai_cost_snapshots from anon, authenticated;
    grant  all on public.ai_cost_snapshots to service_role;
  end if;
end
$$;
