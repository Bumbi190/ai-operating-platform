-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Workflow Instance Core — advisor hardening
--   ──────────────────────────────────────────
--   Applied immediately after `workflow_instance_core`, in response to two
--   findings the Supabase security advisor raised against it. A separate
--   migration rather than an edit to the first one: the first is already in the
--   ledger, and a migration file must keep describing what was actually applied.
--
--   1. `workflow_reject_mutation` had a role-mutable search_path. Every other
--      function in the feature already pins `search_path = ''`; this one was
--      missed. The pre-existing atlas_*_reject_mutation functions carry the same
--      warning, but matching an existing warning is not a reason to add one.
--
--   2. `workflow_instances_guard_projection` is SECURITY DEFINER and, without an
--      explicit revoke, was reachable as `/rest/v1/rpc/...` by anon and
--      authenticated. Calling a trigger function directly fails on its own
--      (there is no trigger context), so the practical impact was nil — but an
--      exposed definer-rights entry point that nothing needs should not exist.
--
--   Revoking EXECUTE does NOT stop either function firing as a trigger:
--   PostgreSQL checks that privilege when the trigger is CREATED, not when it
--   fires. Verified after apply by re-running the full invariant exercise.
--
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.workflow_reject_mutation()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception
    '% is append-only: % is not permitted', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

revoke all on function public.workflow_reject_mutation()
  from public, anon, authenticated;
revoke all on function public.workflow_instances_guard_projection()
  from public, anon, authenticated;
