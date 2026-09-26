-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3B1A — run_autonomy_decisions: the durable autonomy provenance ledger
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS IS
--   An append-only record of what the AUTONOMY LAYER concluded, for one durable
--   run, at one execution boundary, using which resolved licence and which
--   Survival observation.
--
-- WHAT THIS IS NOT
--   It authorizes nothing. It changes no run admission, readiness, dispatch,
--   provider call or spend decision, and it is not a second authority engine.
--   "The autonomy layer added no refusal" is the WHOLE meaning of an `allowed`
--   row — it is not a claim that dispatch occurred. A later stop/claim
--   checkpoint may still block, and the trace will correctly still read
--   `allowed`, because that is what the autonomy layer observed.
--
-- WHY AN EVENT LEDGER AND NOT ONE ROW PER RUN
--   Authority narrows BETWEEN boundaries. A bind-time decision of "L3, allowed"
--   can be followed by a Survival drop and a pre-dispatch refusal. A one-row
--   table can hold only one of those, so it cannot answer the audit question
--   the trace exists for: what did the layer observe AT THE BOUNDARY THAT
--   ALLOWED OR REFUSED DISPATCH? Hence: no uniqueness on (run_id, boundary),
--   and `event_seq` as the only total order.
--
-- WHY NO verdict COLUMN
--   Outcome is derived from `reason`. Storing both would be two copies of one
--   fact that can disagree.
--
-- WHY NO project_id / workflow_instance_id / action_kind / licensed_level
--   Every one of those is already canonical somewhere (runs, or the referenced
--   licence event). Copying them would create a second truth that can drift
--   away from the first. The writer PROVES agreement with the canonical source
--   instead of duplicating it.
--
-- WHY SERVER-ONLY
--   `runs` is project-owner readable, and autonomy provenance carries
--   PLATFORM-SENSITIVE Survival facts. That is why this is its own table rather
--   than columns on `runs`.
--
-- WHY A LOCKED WRITER
--   See record_run_autonomy_decision below: claim fencing must be real.

-- ── 1. The ledger ───────────────────────────────────────────────────────────

create table public.run_autonomy_decisions (
  event_id            uuid        primary key default gen_random_uuid(),

  -- The database's monotonic cursor and the total order across this run's
  -- decisions. `occurred_at` is audit evidence and never decides order.
  event_seq           bigint      generated always as identity unique,

  run_id              uuid        not null,

  -- Which runtime boundary made this observation. Closed, and deliberately only
  -- the boundaries a durable run can actually reach.
  boundary            text        not null,

  -- The claim that owned the run when this observation was taken.
  --
  -- Load-bearing. Claim ownership is TRANSIENT — it is cleared on release and
  -- unrecoverable afterwards — so a trace that does not record it cannot later
  -- prove which worker was entitled to act. NULL at `bind` (no claim exists
  -- before a run is claimed); required at every execution boundary.
  claim_id            uuid,

  policy_mode         text        not null,
  policy_reason       text,
  reason              text        not null,

  license_id          uuid,
  license_generation  integer,
  license_reason      text,

  required_level      text,
  effective_level     text,

  survival_state      text,
  survival_ceiling    text,
  survival_reason     text,
  bounded_by          text,

  -- When the licence was resolved, and when Survival was observed. Both are the
  -- SOURCE's own server instant, recorded so a later auditor does not have to
  -- re-resolve against a clock that has moved.
  license_resolved_at timestamptz,
  survival_as_of      timestamptz,

  occurred_at         timestamptz not null default now(),

  -- ── Referential integrity ────────────────────────────────────────────────
  --
  -- RESTRICT, not CASCADE. Autonomy provenance exists precisely so that a run's
  -- authority history cannot silently disappear. A traced run becoming
  -- undeletable is the intended trade; deleting the evidence to preserve
  -- cleanup convenience would defeat the table's purpose.
  constraint run_autonomy_decisions_run_fk
    foreign key (run_id) references public.runs (id) on delete restrict,

  -- The EXACT immutable licence event used, not merely a licence id. The
  -- generation is what identifies one event of a lineage, so the pair is the
  -- provenance. `(license_id, license_generation)` is already UNIQUE on the
  -- licence ledger, which is what makes this FK valid.
  constraint run_autonomy_decisions_license_fk
    foreign key (license_id, license_generation)
    references public.atlas_autonomy_license_events (license_id, license_generation),

  -- ── Closed vocabularies ──────────────────────────────────────────────────
  --
  -- `col is null or col in (...)` is deliberately NULL-TOTAL: on NULL the first
  -- disjunct is TRUE, so the check passes for an absent optional value and
  -- still rejects a present-but-unknown one. It never evaluates to UNKNOWN.

  constraint run_autonomy_decisions_boundary_vocabulary
    check (boundary in ('bind', 'readiness', 'pre_dispatch')),

  constraint run_autonomy_decisions_policy_mode_vocabulary
    check (policy_mode in ('license_exempt_observation', 'licensed', 'unsupported')),

  constraint run_autonomy_decisions_policy_reason_vocabulary
    check (policy_reason is null
       or policy_reason in ('canonical_read_only_observation',
                            'v1_scope_incomplete', 'not_executable')),

  constraint run_autonomy_decisions_reason_vocabulary
    check (reason in ('exempt_observation', 'allowed', 'unsupported_action',
                      'licence_not_effective', 'action_not_in_licence_scope',
                      'effective_level_below_required')),

  -- Set-equal to Phase 2C's LICENSE_REASONS.
  constraint run_autonomy_decisions_license_reason_vocabulary
    check (license_reason is null
       or license_reason in ('active', 'no_license', 'unknown_workflow_instance',
                             'unavailable', 'not_yet_effective', 'expired',
                             'suspended', 'revoked', 'superseded',
                             'ambiguous_licenses', 'malformed_lineage',
                             'decision_not_governing', 'workflow_definition_drifted',
                             'workflow_project_drifted', 'scope_drifted')),

  -- Set-equal to the canonical Chapter 18 L0–L6 vocabulary.
  constraint run_autonomy_decisions_levels_vocabulary
    check ((required_level   is null or required_level   in ('L0','L1','L2','L3','L4','L5','L6'))
       and (effective_level  is null or effective_level  in ('L0','L1','L2','L3','L4','L5','L6'))
       and (survival_ceiling is null or survival_ceiling in ('L0','L1','L2','L3','L4','L5','L6'))),

  constraint run_autonomy_decisions_survival_state_vocabulary
    check (survival_state is null
       or survival_state in ('EXPAND', 'NORMAL', 'CONSERVE', 'CRITICAL', 'HIBERNATE')),

  constraint run_autonomy_decisions_survival_reason_vocabulary
    check (survival_reason is null
       or survival_reason in ('population_unavailable', 'snapshot_unavailable')),

  constraint run_autonomy_decisions_bounded_by_vocabulary
    check (bounded_by is null
       or bounded_by in ('licence', 'survival_ceiling', 'survival_unavailable')),

  -- ── Shape rules ──────────────────────────────────────────────────────────
  --
  -- Every matrix below uses `IS NOT DISTINCT FROM`, `IS NULL` / `IS NOT NULL`,
  -- or `IS NOT NULL AND ... IN (...)`. That is not style: PostgreSQL rejects a
  -- CHECK only when it is FALSE, so a nullable `col = 'x'` inside a required
  -- branch evaluates to UNKNOWN on NULL and SILENTLY PASSES. Five matrices in
  -- the first draft had exactly that defect. These forms make every branch a
  -- real TRUE or FALSE for every nullable input.

  constraint run_autonomy_decisions_generation_non_negative
    check (license_generation is null or license_generation >= 0),

  -- Identity is a PAIR: an id without its generation names no event.
  constraint run_autonomy_decisions_license_identity_pair
    check ((license_id is null) = (license_generation is null)),

  -- Claim fencing, structurally.
  constraint run_autonomy_decisions_claim_id_matrix
    check ((boundary = 'bind' and claim_id is null)
        or (boundary <> 'bind' and claim_id is not null)),

  -- `bind` records an admission taken BEFORE a run exists, so it cannot carry a
  -- refused outcome (a refused bind creates no run and therefore no row) and
  -- cannot be `unsupported` (refused before the run).
  constraint run_autonomy_decisions_bind_is_admission_only
    check (boundary <> 'bind'
        or (reason in ('exempt_observation', 'allowed')
            and policy_mode in ('license_exempt_observation', 'licensed'))),

  constraint run_autonomy_decisions_unsupported_not_at_bind
    check (boundary <> 'bind' or policy_mode <> 'unsupported'),

  -- EXEMPT. The exemption IS the basis, so it must be bare: no licence was
  -- consulted and no Survival was read, and recording either would fabricate an
  -- observation that never happened.
  constraint run_autonomy_decisions_exempt_matrix
    check (policy_mode <> 'license_exempt_observation'
        or (reason            is not distinct from 'exempt_observation'
            and policy_reason is not distinct from 'canonical_read_only_observation'
            and required_level is not distinct from 'L0'
            and license_id is null and license_generation is null
            and license_reason is null and license_resolved_at is null
            and effective_level is null and bounded_by is null
            and survival_state is null and survival_ceiling is null
            and survival_reason is null and survival_as_of is null)),

  -- UNSUPPORTED. No level can compensate for a scope the licence cannot
  -- express, so no level and no Survival may appear.
  constraint run_autonomy_decisions_unsupported_matrix
    check (policy_mode <> 'unsupported'
        or (reason            is not distinct from 'unsupported_action'
            and policy_reason is not null
            and policy_reason in ('v1_scope_incomplete', 'not_executable')
            and required_level is null and effective_level is null and bounded_by is null
            and license_id is null and license_generation is null
            and license_reason is null and license_resolved_at is null
            and survival_state is null and survival_ceiling is null
            and survival_reason is null and survival_as_of is null)),

  -- LICENSED, common shape. `policy_reason` is a PROPERTY of the policy mode, so
  -- a licensed row must not carry one.
  constraint run_autonomy_decisions_licensed_common
    check (policy_mode <> 'licensed'
        or (policy_reason is null
            and required_level is not null
            and license_resolved_at is not null
            and license_reason is not null)),

  -- An EFFECTIVE licensed decision must name the exact event it used. Note the
  -- `is not distinct from 'active'`: a NULL license_reason must FAIL here, not
  -- slip through as UNKNOWN.
  constraint run_autonomy_decisions_licensed_effective_requires_identity
    check (reason not in ('allowed', 'action_not_in_licence_scope',
                          'effective_level_below_required')
        or (policy_mode        is not distinct from 'licensed'
            and license_reason is not distinct from 'active'
            and license_id        is not null
            and license_generation is not null)),

  -- …and an INEFFECTIVE one must say why, without inventing an identity. Some
  -- canonical resolutions (no_license, unavailable, malformed_lineage) carry no
  -- lineage at all, so identity is optional here — but the reason is not.
  constraint run_autonomy_decisions_licensed_not_effective
    check (reason is distinct from 'licence_not_effective'
        or (policy_mode        is not distinct from 'licensed'
            and license_reason is not null
            and license_reason is distinct from 'active')),

  -- THE CROSS-MODE BACKSTOP — which admission reasons a policy mode may record.
  --
  -- Every matrix above constrains ONE mode's field shape. None of them
  -- constrains the RELATION between mode and reason, so a pair the Phase 3B0
  -- admission core could never produce was representable: `licensed` +
  -- `unsupported_action` satisfied the licensed matrices (policy_reason NULL,
  -- required_level present, license_reason present) AND the reason-sensitive
  -- identity rule (which only singles out three of the six reasons) AND
  -- `unsupported_matrix` (which only looks at `policy_mode <> 'unsupported'`).
  -- It was accepted by the frozen draft — proven with a real INSERT, not by
  -- reading.
  --
  -- This is a REPRESENTATION invariant. It does not re-derive authority: it
  -- says only that a row must describe a decision the runtime can actually
  -- reach. `policy_mode` and `reason` are both NOT NULL, so this expression is
  -- two-valued; `IS NOT DISTINCT FROM` and the explicit `IN (...)` are kept for
  -- consistency with the NULL-total discipline above, so a future edit that
  -- made either column nullable could not silently turn this into UNKNOWN.
  constraint run_autonomy_decisions_policy_reason_matrix
    check ((policy_mode is not distinct from 'license_exempt_observation'
            and reason is not distinct from 'exempt_observation')
        or (policy_mode is not distinct from 'unsupported'
            and reason is not distinct from 'unsupported_action')
        or (policy_mode is not distinct from 'licensed'
            and reason in ('allowed', 'licence_not_effective',
                           'action_not_in_licence_scope',
                           'effective_level_below_required'))),

  -- Survival is consulted ONLY after effectiveness AND scope have passed. A
  -- refusal earlier in the admission order must not claim a Survival reading —
  -- evaluating a later step after an earlier refusal is exactly the
  -- over-permission bug the admission order exists to prevent.
  constraint run_autonomy_decisions_survival_never_consulted
    check (reason not in ('licence_not_effective', 'action_not_in_licence_scope')
        or (survival_state is null and survival_ceiling is null
            and survival_reason is null and survival_as_of is null
            and bounded_by is null and effective_level is null)),

  -- When Survival WAS consulted there are exactly TWO shapes, and both are
  -- complete.
  --
  -- The distinction this preserves is the whole point: "Survival observed
  -- HIBERNATE, so the ceiling is L0" and "Survival could not be established, so
  -- autonomy failed closed to L0" are DIFFERENT facts with different operator
  -- responses, and collapsing them into one observed L0 would lose the second.
  constraint run_autonomy_decisions_survival_observed_or_failed_closed
    check (reason not in ('allowed', 'effective_level_below_required')
        or (
          -- (a) OBSERVED
          (survival_state   is not null
           and survival_ceiling is not null
           and survival_as_of   is not null
           and survival_reason  is null
           and bounded_by       is not null
           and bounded_by in ('licence', 'survival_ceiling')
           and effective_level  is not null)
          or
          -- (b) COULD NOT BE ESTABLISHED → composition received NULL → L0
          (survival_state   is null
           and survival_ceiling is null
           and survival_as_of   is null
           and survival_reason  is not null
           and survival_reason in ('population_unavailable', 'snapshot_unavailable')
           and bounded_by      is not distinct from 'survival_unavailable'
           and effective_level is not distinct from 'L0')
        ))
);

comment on table public.run_autonomy_decisions is
  'Phase 3B1A append-only autonomy provenance: what the autonomy layer concluded for ONE '
  'durable run at ONE execution boundary, with the exact licence event and Survival '
  'observation used. Evidence, never authority — an allowed row does not mean dispatch '
  'occurred, only that the autonomy layer added no refusal.';

comment on column public.run_autonomy_decisions.claim_id is
  'The claim owning the run when this was observed. Recorded because claim ownership is '
  'transient and unrecoverable after release. NULL at bind; required at execution boundaries.';

comment on column public.run_autonomy_decisions.bounded_by is
  'Which input decided the effective level. survival_unavailable means the ceiling could '
  'NOT be computed and L0 was imposed for that reason — deliberately distinct from a ceiling '
  'that was computed and happened to be L0.';

-- ── 2. Indexes ──────────────────────────────────────────────────────────────

create index run_autonomy_decisions_run_idx
  on public.run_autonomy_decisions (run_id, event_seq);

create index run_autonomy_decisions_license_idx
  on public.run_autonomy_decisions (license_id, license_generation)
  where license_id is not null;

-- ── 3. Append-only ──────────────────────────────────────────────────────────
--
-- The same mechanism as the licence ledger. There is no repair API, no upsert
-- and no mutable "current decision" row: current state is derived by folding
-- the events.

create or replace function public.run_autonomy_decisions_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'run_autonomy_decisions is append-only (attempted %)', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists run_autonomy_decisions_no_mutation on public.run_autonomy_decisions;
create trigger run_autonomy_decisions_no_mutation
  before update or delete on public.run_autonomy_decisions
  for each row execute function public.run_autonomy_decisions_append_only();

drop trigger if exists run_autonomy_decisions_no_truncate on public.run_autonomy_decisions;
create trigger run_autonomy_decisions_no_truncate
  before truncate on public.run_autonomy_decisions
  for each statement execute function public.run_autonomy_decisions_append_only();

-- ── 4. The one write boundary ───────────────────────────────────────────────

create or replace function public.record_run_autonomy_decision(
  p_run_id              uuid,
  p_claim_id            uuid,
  p_boundary            text,
  p_policy_mode         text,
  p_policy_reason       text,
  p_reason              text,
  p_license_id          uuid,
  p_license_generation  integer,
  p_license_reason      text,
  p_required_level      text,
  p_effective_level     text,
  p_survival_state      text,
  p_survival_ceiling    text,
  p_survival_reason     text,
  p_bounded_by          text,
  p_license_resolved_at timestamptz,
  p_survival_as_of      timestamptz
)
returns public.run_autonomy_decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run      public.runs;
  v_licence  public.atlas_autonomy_license_events;
  v_event    public.run_autonomy_decisions;
  v_in_scope boolean;
begin
  -- ═══ CLAIM FENCING IS A LOCK, NOT A COMPARISON ════════════════════════════
  --
  -- The run row is locked FIRST, and the lock is held until this transaction
  -- commits. A non-locking `select claim_id → compare → insert` has a real
  -- race: the claim can rotate between the comparison and the append, and the
  -- resulting row would then be an UNFENCED observation wearing the clothes of
  -- a fenced one — provenance that appears to prove ownership it never had.
  --
  -- With the row locked, the claim this row was validated against is the claim
  -- that is still in force at the moment the decision is durably appended. A
  -- concurrent re-claim blocks here until we commit.
  select * into v_run from public.runs where id = p_run_id for update;

  if not found then
    raise exception 'run % does not exist', p_run_id using errcode = 'P0002';
  end if;

  -- It must be a BOUND WORKFLOW ACTION. A plain run has no project binding or
  -- action kind, so there is no subject for an autonomy decision.
  if v_run.workflow_instance_id is null then
    raise exception 'run % is not a workflow action', p_run_id using errcode = '22023';
  end if;

  -- ── Claimed execution boundaries only ─────────────────────────────────────
  --
  -- This writer deliberately REFUSES `bind`. Bind provenance must be created in
  -- the SAME transaction as the run row (Phase 3B1B), so that an enforced run
  -- can never exist without its admission evidence. A generic writer able to
  -- append `bind` after the fact would reopen exactly that non-atomic path.
  if p_boundary is null or p_boundary not in ('readiness', 'pre_dispatch') then
    raise exception
      'record_run_autonomy_decision records claimed execution boundaries only '
      '(readiness, pre_dispatch); got % — bind provenance is created atomically with the '
      'run by the 3B1B bind RPC', coalesce(p_boundary, '<null>')
      using errcode = '22023';
  end if;

  -- ── The fence ─────────────────────────────────────────────────────────────
  if v_run.claim_id is null then
    raise exception 'run % is not claimed; no execution boundary can be recorded',
      p_run_id using errcode = '22023';
  end if;
  if p_claim_id is null or v_run.claim_id is distinct from p_claim_id then
    raise exception 'run % is owned by claim %, not %; refusing to record a stale observation',
      p_run_id, v_run.claim_id, coalesce(p_claim_id::text, '<null>')
      using errcode = '22023';
  end if;

  -- ── Closed vocabularies ───────────────────────────────────────────────────
  -- Explicit here so a caller gets a readable message; the table's CHECK
  -- constraints remain the structural backstop for any other writer.
  if p_policy_mode is null
     or p_policy_mode not in ('license_exempt_observation', 'licensed', 'unsupported') then
    raise exception 'unsupported policy mode %', coalesce(p_policy_mode, '<null>')
      using errcode = '22023';
  end if;
  if p_reason is null
     or p_reason not in ('exempt_observation', 'allowed', 'unsupported_action',
                         'licence_not_effective', 'action_not_in_licence_scope',
                         'effective_level_below_required') then
    raise exception 'unsupported admission reason %', coalesce(p_reason, '<null>')
      using errcode = '22023';
  end if;
  -- ── MODE + REASON COMPATIBILITY ───────────────────────────────────────────
  --
  -- The two checks above validate each field INDEPENDENTLY, which leaves the
  -- PAIR unconstrained: `licensed` + `unsupported_action` satisfies both. The
  -- table carries a cross-mode CHECK as a structural backstop, but the
  -- sanctioned write path must refuse the impossible representation itself —
  -- a ledger whose only defence is a constraint it never reaches is one
  -- refactor away from recording provenance the runtime cannot produce.
  --
  -- Placed BEFORE licence identity and subject evaluation: there is no reason
  -- to consult a licence for a pair that cannot mean anything.
  if not (
       (p_policy_mode = 'license_exempt_observation' and p_reason = 'exempt_observation')
    or (p_policy_mode = 'unsupported'              and p_reason = 'unsupported_action')
    or (p_policy_mode = 'licensed' and p_reason in
        ('allowed', 'licence_not_effective', 'action_not_in_licence_scope',
         'effective_level_below_required'))
  ) then
    raise exception 'policy mode "%" cannot record admission reason "%"',
      p_policy_mode, p_reason using errcode = '22023';
  end if;

  if (p_license_id is null) <> (p_license_generation is null) then
    raise exception 'licence identity must be a pair: id and generation, or neither'
      using errcode = '22023';
  end if;

  -- ── The referenced licence event, and the subject it must belong to ───────
  --
  -- The FK alone proves the event EXISTS. It proves nothing about whether it is
  -- THIS run's licence. Cross-subject linkage must be impossible, so the writer
  -- proves project and workflow-instance agreement against the RUN's canonical
  -- subject, and membership according to the reason.
  if p_license_id is not null then
    select * into v_licence from public.atlas_autonomy_license_events
     where license_id = p_license_id and license_generation = p_license_generation;

    if not found then
      raise exception 'licence event (%, %) does not exist',
        p_license_id, p_license_generation using errcode = 'P0002';
    end if;

    if v_licence.project_id is distinct from v_run.project_id then
      raise exception 'licence event (%) belongs to project %, not this run''s project %',
        p_license_id, v_licence.project_id, v_run.project_id using errcode = '22023';
    end if;

    if v_licence.workflow_instance_id is distinct from v_run.workflow_instance_id then
      raise exception 'licence event (%) belongs to workflow instance %, not this run''s %',
        p_license_id, v_licence.workflow_instance_id, v_run.workflow_instance_id
        using errcode = '22023';
    end if;

    -- ── MEMBERSHIP IS REASON-SENSITIVE ──────────────────────────────────────
    --
    -- A blanket "the kind must be in scope" rule would make the
    -- action_not_in_licence_scope refusal IMPOSSIBLE TO RECORD — that refusal
    -- means the exact opposite. And for licence_not_effective the admission
    -- pipeline stopped at effectiveness, so consulting scope here would
    -- evaluate a step the runtime never reached.
    v_in_scope := v_run.action_kind = any (v_licence.allowed_action_kinds);

    if p_reason in ('allowed', 'effective_level_below_required') and not v_in_scope then
      raise exception 'run action kind "%" is not in licence (%) scope, so reason "%" cannot be recorded',
        v_run.action_kind, p_license_id, p_reason using errcode = '22023';
    end if;

    if p_reason = 'action_not_in_licence_scope' and v_in_scope then
      raise exception 'run action kind "%" IS in licence (%) scope, so an out-of-scope refusal cannot be recorded',
        v_run.action_kind, p_license_id using errcode = '22023';
    end if;
  end if;

  -- ── Append exactly one event. No update. No repair. ───────────────────────
  insert into public.run_autonomy_decisions (
    run_id, boundary, claim_id, policy_mode, policy_reason, reason,
    license_id, license_generation, license_reason, required_level, effective_level,
    survival_state, survival_ceiling, survival_reason, bounded_by,
    license_resolved_at, survival_as_of
  ) values (
    p_run_id, p_boundary, p_claim_id, p_policy_mode, p_policy_reason, p_reason,
    p_license_id, p_license_generation, p_license_reason, p_required_level, p_effective_level,
    p_survival_state, p_survival_ceiling, p_survival_reason, p_bounded_by,
    p_license_resolved_at, p_survival_as_of
  )
  returning * into v_event;

  return v_event;
end;
$$;

comment on function public.record_run_autonomy_decision is
  'The single write boundary for claimed execution-boundary autonomy observations. Locks the '
  'run row FOR UPDATE so claim fencing is real rather than a read-then-write race, refuses '
  'boundary=bind (bind is created atomically with the run in 3B1B), and validates the '
  'representation matrices. It does NOT recompute licence effectiveness, the registry '
  'fingerprint, the Chapter 18 admission result or the Survival derivation — those belong to '
  'the canonical TypeScript authority systems. This records provenance; it does not grant autonomy.';

-- ── 5. Privileges ───────────────────────────────────────────────────────────
--
-- Server-only. The table is not readable or writable by any client role, and
-- the writer is the only path that can append.

alter table public.run_autonomy_decisions enable row level security;
-- Deliberately ZERO policies. RLS with no policy denies every client role, and
-- the revokes below close the grants that would otherwise sit behind it.

revoke all on table public.run_autonomy_decisions
  from public, anon, authenticated, service_role;
grant select on table public.run_autonomy_decisions to service_role;

revoke all on function public.record_run_autonomy_decision(
  uuid, uuid, text, text, text, text, uuid, integer, text, text, text,
  text, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.record_run_autonomy_decision(
  uuid, uuid, text, text, text, text, uuid, integer, text, text, text,
  text, text, text, text, timestamptz, timestamptz
) to service_role;

revoke all on sequence public.run_autonomy_decisions_event_seq_seq
  from public, anon, authenticated, service_role;

-- The trigger function is machinery, not an API.
revoke all on function public.run_autonomy_decisions_append_only()
  from public, anon, authenticated, service_role;
