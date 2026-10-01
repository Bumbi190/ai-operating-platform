-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3B1B — atomic bind-time autonomy admission + provenance
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS IS
--   The bind-specific transaction Phase 3B1A reserved: ONE function that
--   creates a bound workflow-action run AND its `boundary = 'bind'` autonomy
--   provenance row in the SAME transaction. Either both commit or neither does.
--
--   A refused bind never reaches this function — the canonical TypeScript
--   admission (`lib/atlas/autonomy-runtime/bind.ts`) refuses first, so a refusal
--   creates neither a run nor a trace. That is also why this function accepts
--   only an ADMITTED representation; a refusal has nothing to persist.
--
-- WHY ONLY THE LICENCE-EXEMPT REPRESENTATION (Phase 3B1B scope)
--   A licensed admission rests on three mutable authority inputs — the licence
--   ledger, the governing Decision Ledger decision, and the platform Survival
--   ceiling — all read before this transaction. A two-session review against
--   the real licence writer proved that, with row locks on licence events, a
--   brand-new competing lineage (which locks no existing row) AND a Decision
--   Ledger reversal can both commit inside an open bind. The licence ledger could
--   be serialized per instance; the Decision Ledger and Survival cannot be
--   without a broad lock or a SQL copy of canonical policy. So a licensed bind is
--   refused HERE as well as in TypeScript, structurally, until a reviewed proof
--   exists for every input. The exempt representation depends on no mutable
--   authority input at all — only on the reviewed, compiled policy table — so it
--   has nothing that can narrow between admission and commit.
--
-- WHAT THIS IS NOT
--   A second autonomy policy. It does not decide which kinds are exempt; it
--   refuses representations that cannot be true (a non-READ_ONLY "exempt"
--   observation) and proves subject identity before writing.
--
-- WHY THE 3B1A WRITER IS UNTOUCHED
--   `record_run_autonomy_decision` keeps refusing `bind`. Bind provenance has
--   exactly one writer — this function — and it cannot append to a run that
--   already exists, because the run it records is the run it just inserted.
--
-- IDEMPOTENCY
--   Unchanged. The run insert is still subject to `runs_action_identity_uniq`;
--   a duplicate raises 23505 and the WHOLE transaction — trace included — rolls
--   back. A retry therefore never produces a second run and never leaves a bind
--   row behind. Bind is exactly-once per run by definition, so it gets a partial
--   unique index below; readiness/pre_dispatch keep the 3B1A ledger semantics
--   (repeated observations, no uniqueness).
--
-- NOT APPLIED TO PRODUCTION BY THIS BRANCH.

-- ── 1. Bind is exactly-once per run ─────────────────────────────────────────

create unique index if not exists run_autonomy_decisions_one_bind_per_run
  on public.run_autonomy_decisions (run_id)
  where boundary = 'bind';

-- ── 2. The atomic bind writer ───────────────────────────────────────────────

create or replace function public.bind_workflow_action_run(
  -- the run binding, already derived by the canonical TypeScript bind gates
  p_project_id           uuid,
  p_workflow_instance_id uuid,
  p_workflow_def_hash    text,
  p_workflow_from_state  text,
  p_action_kind          text,
  p_action_class         text,
  p_policy_class         text,
  p_max_attempts         integer,
  p_target_version_hash  text,
  p_authorization_id     uuid,
  p_idempotency_key      text,
  p_attempt_group        uuid,
  -- the bind provenance, from the canonical autonomy admission
  p_policy_mode          text,
  p_policy_reason        text,
  p_reason               text,
  p_required_level       text
)
returns table (bound_run_id uuid, bind_event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inst     public.workflow_instances;
  v_run_id   uuid;
  v_event_id uuid;
begin
  -- ── Only the admitted, input-free representation ────────────────────────
  -- Licensed binds are refused structurally in Phase 3B1B (see header): their
  -- authority inputs cannot yet be serialized with this commit.
  if not (p_policy_mode is not distinct from 'license_exempt_observation'
          and p_reason is not distinct from 'exempt_observation') then
    raise exception 'bind records only an admitted licence-exempt observation in Phase 3B1B; '
      'policy mode "%" with reason "%" is not one',
      coalesce(p_policy_mode, '<null>'), coalesce(p_reason, '<null>') using errcode = '22023';
  end if;

  if p_action_kind is null or p_workflow_instance_id is null or p_project_id is null then
    raise exception 'bind requires a project, a workflow instance and an action kind'
      using errcode = '22023';
  end if;

  -- Necessary, never sufficient: the exempt set is the reviewed TypeScript
  -- list, and every member of it is READ_ONLY. A non-READ_ONLY action claiming
  -- the exemption is a representation that cannot be true.
  if p_action_class is distinct from 'READ_ONLY' then
    raise exception 'action kind "%" is %, and only a READ_ONLY observation can be licence-exempt',
      p_action_kind, coalesce(p_action_class, '<null>') using errcode = '22023';
  end if;

  -- ── The subject is read, never trusted ──────────────────────────────────
  -- Re-proved here AND by the runs binding trigger; proving it here gives a
  -- precise refusal before anything is written.
  select * into v_inst from public.workflow_instances where id = p_workflow_instance_id;
  if not found then
    raise exception 'workflow instance % does not exist', p_workflow_instance_id
      using errcode = 'P0002';
  end if;
  if v_inst.project_id is distinct from p_project_id then
    raise exception 'workflow instance % belongs to project %, not %',
      p_workflow_instance_id, v_inst.project_id, p_project_id using errcode = '22023';
  end if;
  if v_inst.def_hash is distinct from p_workflow_def_hash then
    raise exception 'workflow instance % is pinned to a different definition hash',
      p_workflow_instance_id using errcode = '22023';
  end if;

  -- ── The run. A duplicate action identity raises 23505 HERE and rolls
  --    everything back.
  insert into public.runs (
    project_id, status, kind, input, context, max_attempts, policy_class,
    workflow_instance_id, workflow_def_hash, workflow_from_state,
    action_kind, action_class, target_version_hash, authorization_id,
    idempotency_key, attempt_group, authorized_at
  ) values (
    v_inst.project_id, 'pending', 'workflow.action:' || p_action_kind, '{}', '{}',
    p_max_attempts, p_policy_class,
    p_workflow_instance_id, p_workflow_def_hash, p_workflow_from_state,
    p_action_kind, p_action_class, p_target_version_hash, p_authorization_id,
    p_idempotency_key, p_attempt_group, now()
  )
  returning id into v_run_id;

  -- ── Its bind provenance, in the same transaction. Bare by construction: no
  --    licence, no Survival, no effective level — none was consulted. The
  --    3B1A CHECK matrices remain the structural backstop.
  insert into public.run_autonomy_decisions (
    run_id, boundary, claim_id, policy_mode, policy_reason, reason, required_level
  ) values (
    v_run_id, 'bind', null, p_policy_mode, p_policy_reason, p_reason, p_required_level
  )
  returning event_id into v_event_id;

  bound_run_id := v_run_id;
  bind_event_id := v_event_id;
  return next;
end;
$$;

comment on function public.bind_workflow_action_run is
  'Phase 3B1B: creates a bound workflow-action run AND its bind autonomy provenance in ONE '
  'transaction — both or neither. Accepts only an admitted licence-exempt observation; licensed '
  'binds are refused until their licence, Decision Ledger and Survival inputs can be structurally '
  'serialized with this commit. Does NOT recompute autonomy policy. Evidence plus an additional '
  'veto, never sufficient authority.';

-- ── 3. Privileges: server-only ──────────────────────────────────────────────

revoke all on function public.bind_workflow_action_run(
  uuid, uuid, text, text, text, text, text, integer, text, uuid, text, uuid,
  text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.bind_workflow_action_run(
  uuid, uuid, text, text, text, text, text, integer, text, uuid, text, uuid,
  text, text, text, text
) to service_role;
