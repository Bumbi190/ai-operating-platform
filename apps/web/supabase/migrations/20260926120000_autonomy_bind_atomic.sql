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
--   creates neither a run nor a trace.
--
-- LICENCE-EXEMPT BY CONSTRUCTION, NOT BY CLAIM
--   The persisted bind provenance must itself be TRUE, whoever calls this. So
--   the function trusts nothing a caller could use to classify an action:
--
--     • there is NO action-class, policy-class, attempt-budget, authorization,
--       policy-mode, policy-reason or required-level parameter. The only
--       representation Phase 3B1B accepts — a licence-exempt READ_ONLY
--       observation — fixes every one of those values, so they are written as
--       constants here rather than accepted as claims;
--     • the action kind must be one of an EXACT, closed snapshot of
--       (action_kind, def_key, state) placements: the reviewed
--       `LICENCE_EXEMPT_OBSERVATION_KINDS` crossed with their canonical
--       `ACTION_REGISTRY` placements. The definition and state are the
--       INSTANCE's own (read here), never the caller's. An unknown kind, a
--       non-exempt kind (however its class is described) and an exempt kind in
--       a definition/state it is not placed in are all refused.
--
--   This is NOT a second autonomy-policy engine. It decides nothing: it is a
--   fail-closed literal copy of two reviewed TypeScript facts, and a permanent
--   guard (autonomy-bind-guards.test.ts) proves the snapshot is set-equal to
--   them. A new READ_ONLY action therefore does NOT become bindable here by
--   being READ_ONLY — it needs an explicit reviewed widening of the canonical
--   policy AND of this snapshot, and the guard fails until both agree.
--
-- WHY LICENSED BINDS ARE NOT REPRESENTABLE (Phase 3B1B scope)
--   A licensed admission rests on mutable authority inputs — the licence
--   ledger, the governing Decision Ledger decision, the platform Survival
--   ceiling — read before this transaction. A two-session review against the
--   real licence writer proved a competing licence lineage AND a Decision Ledger
--   reversal can both commit inside an open bind, and the Decision Ledger and
--   Survival cannot be serialized here without a broad lock or a SQL copy of
--   canonical policy. Licensed binds therefore have no representation in this
--   function at all until a reviewed proof exists for every input. The exempt
--   representation depends on no mutable authority input.
--
-- WHY THE 3B1A WRITER IS UNTOUCHED
--   `record_run_autonomy_decision` keeps refusing `bind`. Bind provenance has
--   exactly one writer — this function — and it cannot append to a run that
--   already exists, because the run it records is the run it just inserted.
--
-- IDEMPOTENCY
--   Unchanged. The run insert is still subject to `runs_action_identity_uniq`;
--   a duplicate raises 23505 and the WHOLE transaction — trace included — rolls
--   back. Bind is exactly-once per run by definition, so it gets a partial
--   unique index; readiness/pre_dispatch keep the 3B1A ledger semantics.
--
-- NOT APPLIED TO PRODUCTION BY THIS BRANCH.

-- ── 1. Bind is exactly-once per run ─────────────────────────────────────────

create unique index if not exists run_autonomy_decisions_one_bind_per_run
  on public.run_autonomy_decisions (run_id)
  where boundary = 'bind';

-- ── 2. The atomic bind writer ───────────────────────────────────────────────

create or replace function public.bind_workflow_action_run(
  p_project_id           uuid,
  p_workflow_instance_id uuid,
  p_workflow_def_hash    text,
  p_workflow_from_state  text,
  p_action_kind          text,
  p_target_version_hash  text,
  p_idempotency_key      text,
  p_attempt_group        uuid
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
  if p_action_kind is null or p_workflow_instance_id is null or p_project_id is null
     or p_workflow_from_state is null then
    raise exception 'bind requires a project, a workflow instance, a state and an action kind'
      using errcode = '22023';
  end if;

  -- ── The subject is read, never trusted ──────────────────────────────────
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
  if v_inst.current_state is distinct from p_workflow_from_state then
    raise exception 'workflow instance % is in state "%", not "%"',
      p_workflow_instance_id, v_inst.current_state, p_workflow_from_state using errcode = '22023';
  end if;

  -- ── Licence-exempt BY CONSTRUCTION ──────────────────────────────────────
  -- EXACT snapshot: LICENCE_EXEMPT_OBSERVATION_KINDS × their ACTION_REGISTRY
  -- placements. Closed and literal — no pattern, no class predicate, no
  -- default. The definition and state come from the INSTANCE row above.
  -- Set-equality with the TypeScript sources is a permanent guard.
  if (p_action_kind, v_inst.def_key, v_inst.current_state) not in (
    -- bind-exempt-placements:begin
    ('compose_monthly_brief',            'familje-stunden.monthly-release', 'planning'),
    ('compute_release_instant',          'familje-stunden.monthly-release', 'planning'),
    ('observe_github_merge_sha_match',   'familje-stunden.monthly-release', 'frontend_deploy'),
    ('observe_github_pr_checks_green',   'familje-stunden.monthly-release', 'frontend_deploy'),
    ('observe_github_pr_merged',         'familje-stunden.monthly-release', 'frontend_deploy'),
    ('observe_release_gate',             'familje-stunden.monthly-release', 'backend_release_gate'),
    ('observe_release_gate',             'omnira.release-gate-proof',       'proof'),
    ('observe_vercel_deploy_sha_match',  'familje-stunden.monthly-release', 'frontend_deploy'),
    ('observe_vercel_production_alias',  'familje-stunden.monthly-release', 'frontend_deploy'),
    ('observe_vercel_production_ready',  'familje-stunden.monthly-release', 'frontend_deploy'),
    ('probe_anonymous_protected_access', 'familje-stunden.monthly-release', 'approval_release'),
    ('probe_anonymous_protected_access', 'omnira.probe-validation',         'probe'),
    ('validate_monthly_story',           'familje-stunden.monthly-release', 'content_generation')
    -- bind-exempt-placements:end
  ) then
    raise exception 'action kind "%" is not a reviewed licence-exempt observation placed at %/% — '
      'nothing is bound', p_action_kind, v_inst.def_key, v_inst.current_state using errcode = '22023';
  end if;

  -- ── The run. Class, policy class, attempt budget and authorization are the
  --    fixed READ_ONLY values (ACTION_CLASS_POLICY.READ_ONLY — pinned by guard),
  --    never a caller's claim. A duplicate action identity raises 23505 HERE
  --    and rolls everything back.
  insert into public.runs (
    project_id, status, kind, input, context, max_attempts, policy_class,
    workflow_instance_id, workflow_def_hash, workflow_from_state,
    action_kind, action_class, target_version_hash, authorization_id,
    idempotency_key, attempt_group, authorized_at
  ) values (
    v_inst.project_id, 'pending', 'workflow.action:' || p_action_kind, '{}', '{}',
    5, 'non_destructive',
    v_inst.id, v_inst.def_hash, v_inst.current_state,
    p_action_kind, 'READ_ONLY', p_target_version_hash, null,
    p_idempotency_key, p_attempt_group, now()
  )
  returning id into v_run_id;

  -- ── Its bind provenance, in the same transaction: the exemption itself, and
  --    nothing else. Fixed values; the 3B1A CHECK matrices remain the backstop.
  insert into public.run_autonomy_decisions (
    run_id, boundary, claim_id, policy_mode, policy_reason, reason, required_level
  ) values (
    v_run_id, 'bind', null, 'license_exempt_observation', 'canonical_read_only_observation',
    'exempt_observation', 'L0'
  )
  returning event_id into v_event_id;

  bound_run_id := v_run_id;
  bind_event_id := v_event_id;
  return next;
end;
$$;

comment on function public.bind_workflow_action_run is
  'Phase 3B1B: creates a bound workflow-action run AND its bind autonomy provenance in ONE '
  'transaction — both or neither. Licence-exempt BY CONSTRUCTION: binds only an exact, closed '
  'snapshot of reviewed exempt (action_kind, def_key, state) placements, read against the '
  'instance itself, and writes fixed READ_ONLY run values and fixed exempt provenance. No '
  'caller-supplied class or provenance. Licensed binds are not representable. Evidence plus an '
  'additional veto, never sufficient authority.';

-- ── 3. Privileges: server-only ──────────────────────────────────────────────

revoke all on function public.bind_workflow_action_run(
  uuid, uuid, text, text, text, text, text, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.bind_workflow_action_run(
  uuid, uuid, text, text, text, text, text, uuid
) to service_role;
