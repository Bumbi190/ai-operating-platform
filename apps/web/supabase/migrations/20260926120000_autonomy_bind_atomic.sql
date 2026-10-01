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
--   only the two PERMISSIVE representations; a refusal has nothing to persist.
--
-- WHAT THIS IS NOT
--   A second autonomy policy. It does NOT recompute the ActionKind policy, the
--   minimum level, licence effectiveness, the registry fingerprint, the Decision
--   Ledger lifecycle or the Survival derivation — those belong to the canonical
--   TypeScript systems. It proves only what SQL can prove without duplicating
--   them: subject identity, scope membership, that the licence ledger has not
--   moved since it was read, and the licence's clock-driven expiry.
--
-- WHY THE 3B1A WRITER IS UNTOUCHED
--   `record_run_autonomy_decision` keeps refusing `bind`. Bind provenance has
--   exactly one writer — this function — and it cannot append to a run that
--   already exists, because the run it records is the run it just inserted.
--
-- CONCURRENCY — what happens if authority changes DURING bind
--   The licence is resolved in TypeScript before this transaction starts, so the
--   ledger can move in between. The caller passes `p_license_watermark`: the
--   highest licence `event_seq` among the exact events the canonical resolver
--   folded for this instance (`ResolvedAutonomyLicense.ledgerWatermark`). Here:
--
--     1. every licence event for the instance is locked FOR SHARE. The licence
--        writer (`autonomy_license_append`) takes FOR UPDATE on the lineage it
--        appends to, so a concurrent restrict / suspend / revoke / supersede
--        BLOCKS until this bind commits or rolls back;
--     2. the current max(event_seq) must EQUAL the watermark. An event that
--        committed after the read — on this lineage or on a new one — raises
--        40001 and nothing is written. The caller re-reads and re-decides.
--
--   A brand-new lineage issued after step 2 has no row to lock; it serializes
--   AFTER this bind, which is a valid order (the bind's view was current when it
--   was checked), and every later boundary re-resolves. Expiry is the one
--   licence narrowing that needs NO event, so it is re-checked against the
--   database clock. Decision-Ledger and Survival changes are not re-provable
--   here without a second implementation; they are bounded by the
--   `license_resolved_at` freshness window instead.
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
--
-- Partial: only `bind`. Repeated readiness/pre_dispatch observations remain
-- legitimate ledger events, exactly as Phase 3B1A designed.

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
  p_license_id           uuid,
  p_license_generation   integer,
  p_license_reason       text,
  p_required_level       text,
  p_effective_level      text,
  p_survival_state       text,
  p_survival_ceiling     text,
  p_survival_reason      text,
  p_bounded_by           text,
  p_license_resolved_at  timestamptz,
  p_survival_as_of       timestamptz,
  p_license_watermark    bigint
)
returns table (bound_run_id uuid, bind_event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inst       public.workflow_instances;
  v_licence    public.atlas_autonomy_license_events;
  v_head_gen   integer;
  v_max_seq    bigint;
  v_expires    timestamptz;
  v_run_id     uuid;
  v_event_id   uuid;
begin
  -- ── Only the two permissive representations ─────────────────────────────
  -- A refused bind creates nothing, so there is no refusal to record here.
  if not (
       (p_policy_mode is not distinct from 'license_exempt_observation'
        and p_reason is not distinct from 'exempt_observation')
    or (p_policy_mode is not distinct from 'licensed'
        and p_reason is not distinct from 'allowed')
  ) then
    raise exception 'bind records only admitted outcomes; policy mode "%" with reason "%" is not one',
      coalesce(p_policy_mode, '<null>'), coalesce(p_reason, '<null>') using errcode = '22023';
  end if;

  if p_action_kind is null or p_workflow_instance_id is null or p_project_id is null then
    raise exception 'bind requires a project, a workflow instance and an action kind'
      using errcode = '22023';
  end if;

  -- ── The subject is read, never trusted ──────────────────────────────────
  -- Project, definition and state are re-proved here AND by the runs binding
  -- trigger. Proving it here gives a precise refusal before anything is written.
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

  -- ── Exempt: bare, and a READ_ONLY action ────────────────────────────────
  -- Necessary, never sufficient: the exempt set is the reviewed TypeScript
  -- list, and every member of it is READ_ONLY. A non-READ_ONLY action claiming
  -- the exemption is a representation that cannot be true, so it is refused.
  if p_policy_mode = 'license_exempt_observation' then
    if p_action_class is distinct from 'READ_ONLY' then
      raise exception 'action kind "%" is %, and only a READ_ONLY observation can be licence-exempt',
        p_action_kind, coalesce(p_action_class, '<null>') using errcode = '22023';
    end if;
    if p_license_id is not null or p_license_generation is not null
       or p_license_watermark is not null then
      raise exception 'an exempt bind consults no licence and must not reference one'
        using errcode = '22023';
    end if;
  end if;

  -- ── Licensed: the exact event, its subject, its scope, and no movement ──
  if p_policy_mode = 'licensed' then
    if p_license_id is null or p_license_generation is null or p_license_watermark is null then
      raise exception 'a licensed bind must pin the exact licence event and the ledger watermark'
        using errcode = '22023';
    end if;

    -- Freshness of the TypeScript resolution. Bounds the window for the facts
    -- this function cannot re-prove (Decision Ledger, Survival). A resolution
    -- from the future is as untrustworthy as a stale one.
    if p_license_resolved_at is null
       or p_license_resolved_at < now() - interval '30 seconds'
       or p_license_resolved_at > now() + interval '5 seconds' then
      raise exception 'licence resolution at % is not fresh at bind time %',
        coalesce(p_license_resolved_at::text, '<null>'), now() using errcode = '40001';
    end if;

    -- Lock every licence event of this instance. Blocks a concurrent act on any
    -- existing lineage until this bind commits.
    perform 1 from public.atlas_autonomy_license_events
      where workflow_instance_id = p_workflow_instance_id
      for share;

    select max(event_seq) into v_max_seq from public.atlas_autonomy_license_events
      where workflow_instance_id = p_workflow_instance_id;
    if v_max_seq is distinct from p_license_watermark then
      raise exception 'licence ledger for instance % moved during bind (observed %, now %)',
        p_workflow_instance_id, p_license_watermark, v_max_seq using errcode = '40001';
    end if;

    select * into v_licence from public.atlas_autonomy_license_events
      where license_id = p_license_id and license_generation = p_license_generation;
    if not found then
      raise exception 'licence event (%, %) does not exist', p_license_id, p_license_generation
        using errcode = 'P0002';
    end if;

    -- The pinned event must be the HEAD of its lineage: the event that decided
    -- the answer, not an earlier one that a later act has since narrowed.
    select max(license_generation) into v_head_gen from public.atlas_autonomy_license_events
      where license_id = p_license_id;
    if v_head_gen is distinct from p_license_generation then
      raise exception 'licence (%) generation % is not the lineage head %',
        p_license_id, p_license_generation, v_head_gen using errcode = '40001';
    end if;

    -- Cross-subject linkage is impossible.
    if v_licence.project_id is distinct from v_inst.project_id then
      raise exception 'licence (%) belongs to project %, not this run''s project %',
        p_license_id, v_licence.project_id, v_inst.project_id using errcode = '22023';
    end if;
    if v_licence.workflow_instance_id is distinct from p_workflow_instance_id then
      raise exception 'licence (%) belongs to workflow instance %, not %',
        p_license_id, v_licence.workflow_instance_id, p_workflow_instance_id using errcode = '22023';
    end if;
    if v_licence.bound_def_key is distinct from v_inst.def_key
       or v_licence.bound_def_hash is distinct from v_inst.def_hash then
      raise exception 'licence (%) is bound to a different workflow definition', p_license_id
        using errcode = '22023';
    end if;

    -- The ONE action kind this function persists is the one in scope. There is
    -- no second kind parameter that could disagree with the run.
    if not (p_action_kind = any (v_licence.allowed_action_kinds)) then
      raise exception 'action kind "%" is not in licence (%) scope', p_action_kind, p_license_id
        using errcode = '22023';
    end if;

    -- Expiry is the only licence narrowing that happens WITHOUT an event, so it
    -- is the only one the watermark cannot see. Re-checked against the database
    -- clock over the lineage's narrowed window (min expires_at).
    select min(expires_at) into v_expires from public.atlas_autonomy_license_events
      where license_id = p_license_id;
    if v_expires is null or now() >= v_expires then
      raise exception 'licence (%) has expired at bind time', p_license_id using errcode = '40001';
    end if;

    -- `allowed` means the effective level reached the requirement. L0..L6 sort
    -- correctly as text; the vocabulary CHECK on the table pins the values.
    if p_effective_level is null or p_required_level is null
       or p_effective_level < p_required_level then
      raise exception 'an allowed bind must carry effective level >= required level (% < %)',
        coalesce(p_effective_level, '<null>'), coalesce(p_required_level, '<null>')
        using errcode = '22023';
    end if;
  end if;

  -- ── The run. Every binding column as derived; the binding trigger re-checks.
  -- A duplicate action identity raises 23505 HERE and rolls everything back.
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

  -- ── Its bind provenance, in the same transaction. The table's CHECK matrices
  -- remain the structural backstop for every field shape.
  insert into public.run_autonomy_decisions (
    run_id, boundary, claim_id, policy_mode, policy_reason, reason,
    license_id, license_generation, license_reason, required_level, effective_level,
    survival_state, survival_ceiling, survival_reason, bounded_by,
    license_resolved_at, survival_as_of
  ) values (
    v_run_id, 'bind', null, p_policy_mode, p_policy_reason, p_reason,
    p_license_id, p_license_generation, p_license_reason, p_required_level, p_effective_level,
    p_survival_state, p_survival_ceiling, p_survival_reason, p_bounded_by,
    p_license_resolved_at, p_survival_as_of
  )
  returning event_id into v_event_id;

  bound_run_id := v_run_id;
  bind_event_id := v_event_id;
  return next;
end;
$$;

comment on function public.bind_workflow_action_run is
  'Phase 3B1B: creates a bound workflow-action run AND its bind autonomy provenance in ONE '
  'transaction — both or neither. Accepts only admitted outcomes (exempt / licensed+allowed); '
  'a refused bind never reaches it. Proves subject identity, licence scope, an unmoved licence '
  'ledger (watermark under FOR SHARE) and unexpired licence; does NOT recompute autonomy policy. '
  'Evidence plus an additional veto, never sufficient authority.';

-- ── 3. Privileges: server-only ──────────────────────────────────────────────

revoke all on function public.bind_workflow_action_run(
  uuid, uuid, text, text, text, text, text, integer, text, uuid, text, uuid,
  text, text, text, uuid, integer, text, text, text, text, text, text, text,
  timestamptz, timestamptz, bigint
) from public, anon, authenticated, service_role;

grant execute on function public.bind_workflow_action_run(
  uuid, uuid, text, text, text, text, text, integer, text, uuid, text, uuid,
  text, text, text, uuid, integer, text, text, text, text, text, text, text,
  timestamptz, timestamptz, bigint
) to service_role;
