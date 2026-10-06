-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3B1B2 · M4-B — single-statement LICENSED bind + conservative-proof provenance
-- ═══════════════════════════════════════════════════════════════════════════
--
-- OWNER RULING (Option B+). This is the first function that can bind a LICENSED
-- workflow action. It admits ONLY the M4 V1 supported set (proof_governed_effect,
-- minimum L3) and ONLY when the three M4-A conservative sufficient-condition
-- predicates all prove admission:
--
--     DB_ALLOWS  =>  CANONICAL_TYPESCRIPT_ALLOWS        (the converse is NOT claimed)
--
-- The TypeScript folds remain the canonical COMPLETE interpretation, and the
-- TypeScript bind preflight still runs them first (licence resolver, Decision
-- fold, Survival derivation, admission core). This function is the additional,
-- serialized, database-side proof — never a substitute for the preflight, and
-- never a substitute for any other gate (authorization, pause, spend, rollout).
--
-- ONE STATEMENT, FENCE LAST
--   bind_licensed_workflow_action_run_v1 is one SECURITY DEFINER call. In order:
--
--     0. Survival anchor + epoch vector  — read HERE from the database
--        (survival_observation_anchor()); the caller supplies neither.
--     1. workflow_instances row FOR UPDATE          (M1 lock order, step 1)
--          → every licence writer serializes on this row (M1-B), so the licence
--            ledger for this instance cannot change until COMMIT.
--     2. subject derived from the instance: project, def_key, def_hash, state;
--        the caller's def_hash / state are convenience fields CHECKED, never used.
--     3. the V1 supported set gives the required level and the ONE placement;
--        kind + def_key + state must match it exactly.
--     4. the licence's pinned Decision head FOR SHARE (M1 lock order, step 2)
--          → no Decision writer can append to that lineage until COMMIT.
--     5. licensed_bind_v1_licence_proof()  (includes the Decision proof), at the anchor
--     6. licensed_bind_v1_survival_proof(), at the anchor
--     7. licensed_bind_register_authority_deadline(<from the proven rows>)
--     8. INSERT run; INSERT bind provenance (atomic: both or neither)
--     9. survival_commit_fence(vector, anchor)   ← LAST authority action
--        then only RETURN of local variables.
--
--   No SET CONSTRAINTS. No authority read or lock after the fence. Three deferred
--   commit-time rechecks (M3 Survival clock, M4 authority deadline, bind
--   provenance) run at COMMIT.
--
-- REFUSAL
--   Any unproven fact raises (LB010 + the predicate's subset reason). The
--   statement is atomic, so a refusal leaves no run and no provenance.
--
-- PROVENANCE — proof facts, not fabricated states
--   A V1 bind row records WHAT WAS PROVEN: the exact licence event, the exact
--   current Decision head, the three predicate success reasons, the proof
--   profile, the Survival anchor + epoch vector, both commit deadlines, and that
--   the effective authority is at least the required level. It does NOT record
--   a Survival state, a Survival ceiling, a resolved licence reason or an exact
--   effective level, because the database derived none of them. The 3B1A
--   matrices that demand those fields are narrowed to the rows they describe
--   (admission_basis IS NULL), and a new closed matrix governs V1 rows.
--
-- NOTHING here issues a licence, creates a Decision, schedules or starts work.
-- Production holds zero licences, so every call refuses with `no_license`.
--
-- NOT APPLIED BY THIS BRANCH.

-- ═══ 1. Provenance: the V1 conservative-proof shape ═══════════════════════════

alter table public.run_autonomy_decisions
  add column admission_basis          text,
  add column decision_id              uuid,
  add column decision_record_id       uuid,
  add column decision_version         integer,
  add column decision_head_generation integer,
  add column decision_proof           text,
  add column licence_proof            text,
  add column survival_proof           text,
  add column survival_anchor          timestamptz,
  add column survival_epoch_vector    bigint[],
  add column survival_valid_until     timestamptz,
  add column authority_valid_until    timestamptz,
  add column proven_min_level         text;

comment on column public.run_autonomy_decisions.admission_basis is
  'NULL: the 3B1A shape (exempt, or a TypeScript-resolved licensed observation). '
  '''db_conservative_proof_v1'': a Phase 3B1B2 M4 licensed bind admitted by the database''s '
  'conservative sufficient-condition predicates. Such a row records the proof facts only; it '
  'never claims a Survival state, ceiling, resolved licence reason or exact effective level.';

alter table public.run_autonomy_decisions
  add constraint run_autonomy_decisions_decision_record_fk
    foreign key (decision_record_id) references public.atlas_decision_ledger (record_id);

alter table public.run_autonomy_decisions
  add constraint run_autonomy_decisions_admission_basis_vocabulary
    check (admission_basis is null or admission_basis in ('db_conservative_proof_v1'));

-- Every proof column is EITHER all absent (a 3B1A row) OR all present with the
-- exact V1 shape. NULL-total: each branch is a real TRUE/FALSE for every input.
alter table public.run_autonomy_decisions
  add constraint run_autonomy_decisions_db_proof_v1_matrix
    check (
      (admission_basis is null
        and decision_id is null and decision_record_id is null and decision_version is null
        and decision_head_generation is null and decision_proof is null and licence_proof is null
        and survival_proof is null and survival_anchor is null and survival_epoch_vector is null
        and survival_valid_until is null and authority_valid_until is null and proven_min_level is null)
      or
      (admission_basis is not distinct from 'db_conservative_proof_v1'
        and boundary        is not distinct from 'bind'
        and claim_id        is null
        and policy_mode     is not distinct from 'licensed'
        and policy_reason   is null
        and reason          is not distinct from 'allowed'
        and required_level  is not distinct from 'L3'
        and proven_min_level is not distinct from 'L3'
        and license_id is not null and license_generation is not null
        -- NOT claimed: the resolver's verdict, an exact effective level, a
        -- Survival state/ceiling/observation instant, or what bounded it.
        and license_reason is null and license_resolved_at is null
        and effective_level is null and bounded_by is null
        and survival_state is null and survival_ceiling is null
        and survival_reason is null and survival_as_of is null
        -- Claimed: the exact proof facts.
        and decision_id is not null and decision_record_id is not null
        and decision_version is not null and decision_head_generation is not distinct from 1
        and decision_proof  is not distinct from 'v1_two_act_approval_in_force'
        and licence_proof   is not distinct from 'v1_single_issued_licence_in_force'
        and survival_proof is not null
        and survival_proof in ('v1_headroom_margin_funding_undeclared',
                               'v1_headroom_margin_funding_known_runway_margin')
        and survival_anchor is not null
        and survival_epoch_vector is not null
        and pg_catalog.array_length(survival_epoch_vector, 1) is not distinct from 8
        and survival_valid_until is not null and survival_valid_until > survival_anchor
        and authority_valid_until is not null and authority_valid_until > survival_anchor)
    );

-- The three 3B1A matrices that require a TypeScript-resolved observation now
-- describe exactly the rows they were written for (admission_basis IS NULL).
-- Their expressions are otherwise UNCHANGED, character for character.
alter table public.run_autonomy_decisions drop constraint run_autonomy_decisions_licensed_common;
alter table public.run_autonomy_decisions add constraint run_autonomy_decisions_licensed_common
    check (admission_basis is not null
        or policy_mode <> 'licensed'
        or (policy_reason is null
            and required_level is not null
            and license_resolved_at is not null
            and license_reason is not null));

alter table public.run_autonomy_decisions drop constraint run_autonomy_decisions_licensed_effective_requires_identity;
alter table public.run_autonomy_decisions add constraint run_autonomy_decisions_licensed_effective_requires_identity
    check (admission_basis is not null
        or reason not in ('allowed', 'action_not_in_licence_scope',
                          'effective_level_below_required')
        or (policy_mode        is not distinct from 'licensed'
            and license_reason is not distinct from 'active'
            and license_id        is not null
            and license_generation is not null));

alter table public.run_autonomy_decisions drop constraint run_autonomy_decisions_survival_observed_or_failed_closed;
alter table public.run_autonomy_decisions add constraint run_autonomy_decisions_survival_observed_or_failed_closed
    check (admission_basis is not null
        or reason not in ('allowed', 'effective_level_below_required')
        or (
          (survival_state   is not null
           and survival_ceiling is not null
           and survival_as_of   is not null
           and survival_reason  is null
           and bounded_by       is not null
           and bounded_by in ('licence', 'survival_ceiling')
           and effective_level  is not null)
          or
          (survival_state   is null
           and survival_ceiling is null
           and survival_as_of   is null
           and survival_reason  is not null
           and survival_reason in ('population_unavailable', 'snapshot_unavailable')
           and bounded_by      is not distinct from 'survival_unavailable'
           and effective_level is not distinct from 'L0')
        ));

-- ═══ 2. No authority write after a bind, in the same transaction ═══════════════
-- PostgREST runs the bind as one statement in its own transaction, so nothing can
-- follow it. A direct session could still try: bind, then append a Decision act or
-- a licence act, then COMMIT both — a run bound under authority that the same
-- transaction withdrew. The M4 intent row (one per licensed-bind transaction)
-- makes that structurally impossible for every writer, not just the canonical
-- ones. (Survival authority writes after the fence are already refused by M3.)
create or replace function public.licensed_bind_no_authority_write_after_bind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.licensed_bind_authority_intents i
              where i.xact = pg_catalog.pg_current_xact_id()) then
    raise exception 'licensed bind: % may not be written in the transaction that bound a licensed action',
      tg_table_name using errcode = 'LB004';
  end if;
  return new;
end $$;

comment on function public.licensed_bind_no_authority_write_after_bind() is
  'Phase 3B1B2 M4-B: refuses a Decision Ledger or licence-ledger insert in a transaction that already '
  'performed a licensed bind. Trigger machinery only; executable by no role.';

create trigger atlas_decision_ledger_no_write_after_licensed_bind
  before insert on public.atlas_decision_ledger
  for each row execute function public.licensed_bind_no_authority_write_after_bind();
create trigger atlas_autonomy_license_events_no_write_after_licensed_bind
  before insert on public.atlas_autonomy_license_events
  for each row execute function public.licensed_bind_no_authority_write_after_bind();

revoke all on function public.licensed_bind_no_authority_write_after_bind()
  from public, anon, authenticated, service_role;

-- ═══ 3. The licensed bind ═════════════════════════════════════════════════════

create or replace function public.bind_licensed_workflow_action_run_v1(
  p_workflow_instance_id uuid,
  p_action_kind          text,
  p_workflow_def_hash    text,
  p_workflow_from_state  text,
  p_target_version_hash  text,
  p_idempotency_key      text,
  p_attempt_group        uuid,
  p_authorization_id     uuid
)
returns table (bound_run_id uuid, bind_event_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_anchor   timestamptz;
  v_vector   bigint[];
  v_inst     public.workflow_instances;
  v_v1       record;
  v_pin      record;
  v_head     public.atlas_decision_lineage_heads;
  v_lic      record;
  v_srv      record;
  v_srv_inv  timestamptz;
  v_run_id   uuid;
  v_event_id uuid;
begin
  if p_workflow_instance_id is null or p_action_kind is null or p_workflow_def_hash is null
     or p_workflow_from_state is null or p_target_version_hash is null or p_idempotency_key is null
     or p_attempt_group is null or p_authorization_id is null then
    raise exception 'licensed bind requires an instance, an action kind, its pinned definition and state, '
      'a target, an idempotency identity and an authorization' using errcode = '22023';
  end if;

  -- 0. The Survival observation is anchored by the DATABASE, here. The caller
  --    cannot supply, replay or substitute a vector or an anchor.
  select a.anchor, a.epoch_vector into v_anchor, v_vector from public.survival_observation_anchor() a;

  -- 1. M1 lock order, step 1: the workflow instance. Every licence act locks
  --    this row first, so the licence ledger for this instance is now frozen.
  select * into v_inst from public.workflow_instances where id = p_workflow_instance_id for update;
  if not found then
    raise exception 'workflow instance % does not exist', p_workflow_instance_id using errcode = 'P0002';
  end if;

  -- 2. The subject is the instance's own. Caller fields are checked, never used.
  if v_inst.def_hash is distinct from p_workflow_def_hash then
    raise exception 'workflow instance % is pinned to a different definition hash', p_workflow_instance_id
      using errcode = '22023';
  end if;
  if v_inst.current_state is distinct from p_workflow_from_state then
    raise exception 'workflow instance % is in state "%", not "%"',
      p_workflow_instance_id, v_inst.current_state, p_workflow_from_state using errcode = '22023';
  end if;

  -- 3. The V1 supported set: kind, definition and state must be its placement.
  select * into v_v1 from public.licensed_bind_v1_supported() s
   where s.action_kind = p_action_kind
     and s.bound_def_key = v_inst.def_key
     and s.placement_state = v_inst.current_state;
  if not found then
    raise exception 'licensed bind: "%" at %/% is outside the M4 V1 supported set',
      p_action_kind, v_inst.def_key, v_inst.current_state using errcode = 'LB010';
  end if;

  -- 4. M1 lock order, step 2: the CURRENT head of the Decision the licence pins.
  --    The licence ledger is frozen by step 1, so this read cannot go stale.
  select e.decision_id into v_pin from public.atlas_autonomy_license_events e
   where e.workflow_instance_id = v_inst.id
   order by e.license_generation desc, e.event_id
   limit 1;
  if not found then
    raise exception 'licensed bind: no licence for workflow instance % (no_license)', v_inst.id
      using errcode = 'LB010';
  end if;
  select * into v_head from public.atlas_decision_lineage_heads h
   where h.decision_id = v_pin.decision_id
   for share;
  -- (absence is judged by the Decision proof below)

  -- 5. Licence + current Decision: the conservative sufficient conditions.
  select * into v_lic from public.licensed_bind_v1_licence_proof(v_inst.id, p_action_kind, v_anchor) l;
  if v_lic.admissible is not true then
    raise exception 'licensed bind: licence authority not proven (%)', v_lic.reason using errcode = 'LB010';
  end if;
  if v_lic.decision_id is distinct from v_pin.decision_id
     or v_head.head_record_id is distinct from v_lic.decision_record_id then
    raise exception 'licensed bind: the locked Decision head is not the one proven' using errcode = 'LB010';
  end if;

  -- 6. Survival: at least the required level, from raw rows, at the anchor.
  select * into v_srv from public.licensed_bind_v1_survival_proof(v_anchor) s;
  if v_srv.admissible is not true then
    raise exception 'licensed bind: Survival ceiling >= % not proven (%)', v_v1.minimum_level, v_srv.reason
      using errcode = 'LB010';
  end if;
  v_srv_inv := public.survival_clock_invalid_at(v_anchor);

  -- 7. The commit-time authority deadline, from the PROVEN rows only.
  perform public.licensed_bind_register_authority_deadline(v_lic.authority_invalid_at);

  -- 8. The run and its provenance, together. FINANCIAL class values are the
  --    canonical ACTION_CLASS_POLICY.FINANCIAL ones (pinned by guard).
  insert into public.runs (
    project_id, status, kind, input, context, max_attempts, policy_class,
    workflow_instance_id, workflow_def_hash, workflow_from_state,
    action_kind, action_class, target_version_hash, authorization_id,
    idempotency_key, attempt_group, authorized_at
  ) values (
    v_inst.project_id, 'pending', 'workflow.action:' || p_action_kind, '{}', '{}',
    1, 'approval_required',
    v_inst.id, v_inst.def_hash, v_inst.current_state,
    p_action_kind, 'FINANCIAL', p_target_version_hash, p_authorization_id,
    p_idempotency_key, p_attempt_group, now()
  )
  returning id into v_run_id;

  insert into public.run_autonomy_decisions (
    run_id, boundary, claim_id, policy_mode, policy_reason, reason, required_level,
    license_id, license_generation,
    admission_basis, decision_id, decision_record_id, decision_version, decision_head_generation,
    decision_proof, licence_proof, survival_proof,
    survival_anchor, survival_epoch_vector, survival_valid_until, authority_valid_until, proven_min_level
  ) values (
    v_run_id, 'bind', null, 'licensed', null, 'allowed', v_v1.minimum_level,
    v_lic.license_id, v_lic.license_generation,
    'db_conservative_proof_v1', v_lic.decision_id, v_lic.decision_record_id, v_lic.decision_version,
    v_lic.decision_head_generation,
    'v1_two_act_approval_in_force', v_lic.reason, v_srv.reason,
    v_anchor, v_vector, v_srv_inv, v_lic.authority_invalid_at, v_v1.minimum_level
  )
  returning event_id into v_event_id;

  -- 9. LAST authority action. Nothing below reads or locks anything.
  perform public.survival_commit_fence(v_vector, v_anchor);

  return query select v_run_id, v_event_id;
end $$;

comment on function public.bind_licensed_workflow_action_run_v1(uuid, text, text, text, text, text, uuid, uuid) is
  'Phase 3B1B2 M4-B: the single-statement LICENSED bind for the M4 V1 supported set only. Locks '
  'instance -> current Decision head, proves licence + Decision + Survival >= L3 with the M4-A '
  'conservative sufficient-condition predicates, registers the authority deadline, writes the run '
  'and its conservative-proof provenance, and calls survival_commit_fence() LAST. Refuses (LB010) '
  'whenever a fact is not proven; never issues, widens or infers authority.';

revoke all on function public.bind_licensed_workflow_action_run_v1(uuid, text, text, text, text, text, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.bind_licensed_workflow_action_run_v1(uuid, text, text, text, text, text, uuid, uuid)
  to service_role;
