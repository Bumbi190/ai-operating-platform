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
--     6. the HUMAN EXECUTION AUTHORIZATION's head FOR SHARE (M4 order, step 3)
--          → no authorization writer (grant, revoke, supersede, close) can
--            append to that chain until COMMIT; then
--        licensed_bind_v1_authorization_proof(), at the anchor. The caller's
--        authorization id is a SELECTOR only: the chain must prove, on its own,
--        a human `workflow.action.execute` grant pinning exactly this instance,
--        definition, state, kind, class, target hash and attempt group.
--     7. licensed_bind_v1_survival_proof(), at the anchor
--     8. licensed_bind_register_authority_deadline(<earliest proven expiry:
--        licence, Decision, human authorization>)
--     9. INSERT run; INSERT bind provenance (atomic: both or neither)
--    10. survival_commit_fence(vector, anchor)   ← LAST authority action
--        then only RETURN of local variables.
--
--   No SET CONSTRAINTS. No authority read or lock after the fence. Three deferred
--   commit-time rechecks (M3 Survival clock, M4 authority deadline, bind
--   provenance) run at COMMIT.
--
-- TOTAL LOCK ORDER
--   workflow_instances → atlas_decision_lineage_heads → atlas_authorization_heads
--   → (M2/M3) survival_input_epoch_shards. Each writer takes at most one of these
--   and nothing after it: licence writers take the instance (then, for ISSUED,
--   the Decision head — same order); Decision writers take only the Decision
--   head; authorization writers take only the authorization head; Survival
--   writers take only shards. No cycle is possible.
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
  add column proven_min_level         text,
  add column authorization_id               uuid,
  add column authorization_request_event_id uuid,
  add column authorization_grant_event_id   uuid,
  add column authorization_granted_by       uuid,
  add column authorization_proof            text,
  add column authorization_valid_until      timestamptz,
  add column authorization_attestation_id   uuid;

comment on column public.run_autonomy_decisions.authorization_grant_event_id is
  'M4 V1: the exact immutable atlas_authorizations GRANT event the database proved permits this '
  'bound action (workflow.action.execute, pinning the run''s instance, definition, state, kind, class, '
  'target hash and attempt group). With authorization_granted_by it answers "which human '
  'authorization permitted this exact bound action?".';

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
        and survival_valid_until is null and authority_valid_until is null and proven_min_level is null
        and authorization_id is null and authorization_request_event_id is null
        and authorization_grant_event_id is null and authorization_granted_by is null
        and authorization_proof is null and authorization_valid_until is null
        and authorization_attestation_id is null)
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
        and authority_valid_until is not null and authority_valid_until > survival_anchor
        -- Claimed: the exact human authorization proof.
        and authorization_id is not null and authorization_request_event_id is not null
        and authorization_grant_event_id is not null and authorization_granted_by is not null
        and authorization_proof is not distinct from 'v1_human_attested_execution_grant_in_force'
        and authorization_attestation_id is not null
        and authorization_valid_until is not null and authorization_valid_until > survival_anchor
        and authority_valid_until <= authorization_valid_until)
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

alter table public.run_autonomy_decisions
  add constraint run_autonomy_decisions_authorization_request_fk
    foreign key (authorization_request_event_id) references public.atlas_authorizations (event_id),
  add constraint run_autonomy_decisions_authorization_grant_fk
    foreign key (authorization_grant_event_id) references public.atlas_authorizations (event_id);

-- ═══ 2. Human execution authorization: serialization head + V1 proof ═══════════
--
-- WHY. A governed effect needs a HUMAN `workflow.action.execute` grant
-- (ACTION_CLASS_POLICY.FINANCIAL.requiresAuthorization; checked canonically by
-- assertExecutionAuthorized → isEffectiveNow). That chain is mutable authority:
-- a revoke / supersede / close can be appended, and the grant expires. Before
-- this section the bind took a caller-chosen authorization id on trust, and
-- nothing serialized the ledger's writers against a bind.
--
-- A2a. `atlas_authorization_heads` — ONE row per authorization chain, moved by
--      the DATABASE in the same transaction as every authorization event (an
--      AFTER INSERT row trigger, inside the writer's statement). A SERIALIZATION
--      CURSOR only: the event count and
--      the latest event id — no status, no "effective" flag. The immutable
--      ledger remains the only truth; isEffectiveNow() the only interpretation.
--      Lock contract: a licensed bind takes the head FOR SHARE; any authorization
--      writer's head UPDATE then waits until the bind commits (and its ledger row
--      commits with it — or both roll back).
create table public.atlas_authorization_heads (
  authorization_id uuid primary key,
  event_count      integer not null
    constraint atlas_authorization_heads_count_positive check (event_count >= 1),
  last_event_id    uuid not null unique
                     references public.atlas_authorizations (event_id) on delete restrict
);

comment on table public.atlas_authorization_heads is
  'Phase 3B1B2 M4-B: serialization cursor per atlas_authorizations chain (event count + latest '
  'event id), moved only by the ledger''s insert trigger. DB_INTERNAL: no role holds any privilege.';

-- The head moves only by the ledger trigger (owner). It is never deleted, and an
-- update may only advance it by exactly one event.
create or replace function public.atlas_authorization_heads_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'atlas_authorization_heads: % is not permitted', tg_op using errcode = '42501';
  end if;
  if new.authorization_id is distinct from old.authorization_id
     or new.event_count is distinct from old.event_count + 1 then
    raise exception 'atlas_authorization_heads: a head only advances by one event' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger atlas_authorization_heads_guard
  before update or delete on public.atlas_authorization_heads
  for each row execute function public.atlas_authorization_heads_guard();
create trigger atlas_authorization_heads_no_truncate
  before truncate on public.atlas_authorization_heads
  for each statement execute function public.atlas_authorization_heads_guard();

-- The maintenance trigger. It must run BEFORE the ledger row exists (so the head
-- row is locked first, exactly like the Decision head) — but last_event_id has a
-- foreign key to the ledger, so the head is written AFTER INSERT, still inside
-- the writer's transaction. The UPDATE takes the head's row lock; a bind holding
-- FOR SHARE makes it wait.
create or replace function public.atlas_authorization_head_advance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.atlas_authorization_heads as h (authorization_id, event_count, last_event_id)
  values (new.authorization_id, 1, new.event_id)
  on conflict (authorization_id) do update
     set event_count = h.event_count + 1, last_event_id = excluded.last_event_id;
  return null;
end $$;

create trigger atlas_authorization_head_advance
  after insert on public.atlas_authorizations
  for each row execute function public.atlas_authorization_head_advance();

-- Backfill AFTER the trigger exists, so no event can land between the two. An
-- existing head (an event inserted concurrently) is left alone.
insert into public.atlas_authorization_heads (authorization_id, event_count, last_event_id)
select a.authorization_id, pg_catalog.count(*)::integer,
       (pg_catalog.array_agg(a.event_id order by a.occurred_at desc, a.event_id desc))[1]
  from public.atlas_authorizations a
 group by a.authorization_id
on conflict (authorization_id) do nothing;

alter table public.atlas_authorization_heads enable row level security;
revoke all on table public.atlas_authorization_heads from public, anon, authenticated, service_role;
revoke all on function public.atlas_authorization_heads_guard() from public, anon, authenticated, service_role;
revoke all on function public.atlas_authorization_head_advance() from public, anon, authenticated, service_role;

-- A2c. HUMAN ORIGIN — the non-forgeable attestation of an M4 execution grant.
--
-- THREAT. service_role can append ordinary atlas_authorizations rows, including
-- `requested` → `granted` with any principal_id. A ledger that service_role can
-- write proves internal consistency, never human origin. Owner ruling: a
-- service_role capability must not be convertible into human authority — NO
-- HUMAN-AUTHENTICATED GRANT = NO LICENSED BIND.
--
-- DESIGN. `atlas_authorization_human_grants` holds ONE attestation per grant
-- event. Its ONLY writer is atlas_grant_m4_execution_authorization(), a SECURITY
-- DEFINER boundary EXECUTABLE BY `authenticated` ONLY (never service_role, anon or
-- PUBLIC). It derives the human from auth.uid(), requires that user to OWN the
-- authorization's project (projects.owner_id — the platform's isolation truth),
-- accepts only the M4 V1 purpose, copies every pin from the pending REQUEST, and
-- appends the `granted` event AND its attestation in one statement — both commit
-- or neither. The grant event moves the same authorization head through the
-- ledger's own insert trigger: there is no second authorization history.
--
-- Ordinary service_role authorization writes still work (mixed-version safety),
-- but a grant WITHOUT this attestation can never satisfy the M4 proof.
create table public.atlas_authorization_human_grants (
  attestation_id      uuid        primary key default gen_random_uuid(),
  -- The exact grant event this attestation vouches for: one attestation per grant.
  grant_event_id      uuid        not null unique
                        references public.atlas_authorizations (event_id) on delete restrict,
  request_event_id    uuid        not null
                        references public.atlas_authorizations (event_id) on delete restrict,
  authorization_id    uuid        not null,
  project_id          uuid        not null references public.projects (id) on delete restrict,
  -- auth.uid() of the authenticated human who granted it. Never a caller value.
  human_principal     uuid        not null,
  action_kind         text        not null
    constraint atlas_authorization_human_grants_action check (action_kind = 'workflow.action.execute'),
  target_type         text        not null
    constraint atlas_authorization_human_grants_target_type check (target_type = 'workflow_execution'),
  target_id           text        not null,
  target_version_hash text        not null
    constraint atlas_authorization_human_grants_hash check (target_version_hash ~ '^[a-f0-9]{64}$'),
  expires_at          timestamptz not null,
  profile             text        not null
    constraint atlas_authorization_human_grants_profile check (profile = 'm4_v1_human_execution_grant'),
  attested_at         timestamptz not null
);

comment on table public.atlas_authorization_human_grants is
  'Phase 3B1B2 M4-B: non-forgeable HUMAN-ORIGIN attestation of one M4 execution grant event. Written '
  'only by atlas_grant_m4_execution_authorization() (authenticated only; principal = auth.uid(); caller '
  'must own the project). Immutable. DB_INTERNAL: no role holds any privilege.';

-- Defence in depth: an attestation must describe EXACTLY its grant and request
-- rows (one chain, one project, one human, one target, one expiry), whoever
-- writes it.
create or replace function public.atlas_authorization_human_grants_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req   public.atlas_authorizations;
  v_grant public.atlas_authorizations;
begin
  select * into v_grant from public.atlas_authorizations a where a.event_id = new.grant_event_id;
  select * into v_req   from public.atlas_authorizations a where a.event_id = new.request_event_id;
  if v_grant.event_id is null or v_req.event_id is null
     or v_grant.event_type <> 'granted' or v_req.event_type <> 'requested'
     or v_grant.authorization_id <> new.authorization_id or v_req.authorization_id <> new.authorization_id
     or v_grant.project_id <> new.project_id or v_req.project_id <> new.project_id
     or v_grant.principal_id <> new.human_principal
     or v_grant.action_kind <> new.action_kind or v_req.action_kind <> new.action_kind
     or v_grant.target_type <> new.target_type or v_req.target_type <> new.target_type
     or v_grant.target_id <> new.target_id or v_req.target_id <> new.target_id
     or v_grant.target_version_hash <> new.target_version_hash or v_req.target_version_hash <> new.target_version_hash
     or v_grant.expires_at is distinct from new.expires_at then
    raise exception 'atlas_authorization_human_grants: attestation does not describe its grant and request exactly'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger atlas_authorization_human_grants_integrity
  before insert on public.atlas_authorization_human_grants
  for each row execute function public.atlas_authorization_human_grants_integrity();

-- Immutable: an attestation is a historical fact.
create or replace function public.atlas_authorization_human_grants_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'atlas_authorization_human_grants is append-only: % is not permitted', tg_op
    using errcode = '42501';
end $$;

create trigger atlas_authorization_human_grants_no_mutation
  before update or delete on public.atlas_authorization_human_grants
  for each row execute function public.atlas_authorization_human_grants_immutable();
create trigger atlas_authorization_human_grants_no_truncate
  before truncate on public.atlas_authorization_human_grants
  for each statement execute function public.atlas_authorization_human_grants_immutable();

alter table public.atlas_authorization_human_grants enable row level security;
revoke all on table public.atlas_authorization_human_grants from public, anon, authenticated, service_role;
revoke all on function public.atlas_authorization_human_grants_integrity() from public, anon, authenticated, service_role;
revoke all on function public.atlas_authorization_human_grants_immutable() from public, anon, authenticated, service_role;

alter table public.run_autonomy_decisions
  add constraint run_autonomy_decisions_authorization_attestation_fk
    foreign key (authorization_attestation_id)
    references public.atlas_authorization_human_grants (attestation_id);

-- The ONLY writer of human-origin attestations. The caller chooses exactly two
-- things: WHICH pending request to approve, and an expiry within the V1 bound.
-- Everything authority-bearing — the human, the project, the action, the target
-- pin — is derived here, never accepted.
create or replace function public.atlas_grant_m4_execution_authorization(
  p_authorization_id uuid,
  p_expires_at       timestamptz
)
returns table (authorization_id uuid, grant_event_id uuid, attestation_id uuid,
               human_principal uuid, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid;
  v_role   text;
  v_now    timestamptz;
  v_n      bigint;
  v_req    public.atlas_authorizations;
  v_owner  uuid;
  v_parts  text[];
  v_inst   public.workflow_instances;
  v_grant  uuid;
  v_att    uuid;
  c_uuid   constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  -- 1. A REAL authenticated human. The principal is auth.uid(), never a parameter.
  v_uid := auth.uid();
  v_role := coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
                     nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
  if v_uid is null or v_role is distinct from 'authenticated' then
    raise exception 'human execution grant: requires an authenticated human session' using errcode = '42501';
  end if;

  v_now := pg_catalog.clock_timestamp();
  if p_authorization_id is null or p_expires_at is null or not pg_catalog.isfinite(p_expires_at)
     or pg_catalog.date_trunc('milliseconds', p_expires_at) <= pg_catalog.date_trunc('milliseconds', v_now)
     or p_expires_at > v_now + interval '30 days' then
    raise exception 'human execution grant: expiry must be after now and within 30 days' using errcode = '22023';
  end if;

  -- 2. Serialize on the chain's authorization head — the same row the ledger's
  --    insert trigger moves (so a concurrent revoke, grant or bind is ordered).
  perform 1 from public.atlas_authorization_heads h where h.authorization_id = p_authorization_id for update;
  if not found then
    raise exception 'human execution grant: unknown authorization %', p_authorization_id using errcode = 'P0002';
  end if;

  -- 3. Exactly one PENDING request; replay and already-decided chains refuse.
  select pg_catalog.count(*) into v_n from public.atlas_authorizations a where a.authorization_id = p_authorization_id;
  select * into v_req from public.atlas_authorizations a
   where a.authorization_id = p_authorization_id and a.event_type = 'requested';
  if v_n <> 1 or v_req.event_id is null then
    raise exception 'human execution grant: authorization % is not a single pending request', p_authorization_id
      using errcode = '55000';
  end if;
  if not pg_catalog.isfinite(v_req.occurred_at) or v_req.occurred_at > v_now then
    raise exception 'human execution grant: the request time is outside the V1 subset' using errcode = '22023';
  end if;

  -- 4. The M4 V1 purpose only.
  if v_req.action_kind <> 'workflow.action.execute' or v_req.target_type <> 'workflow_execution' then
    raise exception 'human execution grant: only workflow.action.execute / workflow_execution requests'
      using errcode = '22023';
  end if;

  -- 5. The human must OWN the project (projects.owner_id, the isolation truth).
  select p.owner_id into v_owner from public.projects p where p.id = v_req.project_id;
  if v_owner is null or v_owner <> v_uid then
    raise exception 'human execution grant: the authenticated user does not own this project' using errcode = '42501';
  end if;

  -- 6. The request must still name a CURRENT M4 V1 placement:
  --    <instance>:<state>:<kind>:<attempt group>, on an instance of this project,
  --    at that state, for a supported (kind, definition, state).
  v_parts := pg_catalog.string_to_array(v_req.target_id, ':');
  if pg_catalog.array_length(v_parts, 1) is distinct from 4
     or v_parts[1] !~ c_uuid or v_parts[4] !~ c_uuid then
    raise exception 'human execution grant: malformed execution target' using errcode = '22023';
  end if;
  select * into v_inst from public.workflow_instances w where w.id = v_parts[1]::uuid;
  if not found or v_inst.project_id <> v_req.project_id or v_inst.current_state <> v_parts[2] then
    raise exception 'human execution grant: the request target drifted from the workflow instance'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.licensed_bind_v1_supported() s
                  where s.action_kind = v_parts[3] and s.bound_def_key = v_inst.def_key
                    and s.placement_state = v_inst.current_state) then
    raise exception 'human execution grant: not an M4 V1 governed effect' using errcode = '22023';
  end if;

  -- 7. The grant (every pin copied from the REQUEST) and its attestation, together.
  insert into public.atlas_authorizations (
    authorization_id, event_type, occurred_at, project_id, principal_id, authority_basis,
    action_kind, authority_description, target_type, target_id, target_version_hash,
    conditions, evidence, expires_at, superseded_by, reason
  ) values (
    p_authorization_id, 'granted', v_now, v_req.project_id, v_uid, 'founder_owner',
    v_req.action_kind, v_req.authority_description, v_req.target_type, v_req.target_id, v_req.target_version_hash,
    '[]'::jsonb, '[]'::jsonb, p_expires_at, null, null
  )
  returning event_id into v_grant;

  insert into public.atlas_authorization_human_grants (
    grant_event_id, request_event_id, authorization_id, project_id, human_principal,
    action_kind, target_type, target_id, target_version_hash, expires_at, profile, attested_at
  ) values (
    v_grant, v_req.event_id, p_authorization_id, v_req.project_id, v_uid,
    v_req.action_kind, v_req.target_type, v_req.target_id, v_req.target_version_hash, p_expires_at,
    'm4_v1_human_execution_grant', v_now
  )
  returning atlas_authorization_human_grants.attestation_id into v_att;

  return query select p_authorization_id, v_grant, v_att, v_uid, p_expires_at;
end $$;

comment on function public.atlas_grant_m4_execution_authorization(uuid, timestamptz) is
  'Phase 3B1B2 M4-B: the ONLY path that creates an M4-acceptable human execution grant. Authenticated '
  'only; principal = auth.uid(); caller must own the project; M4 V1 purpose only; every pin copied from the '
  'pending request; grant event + human-origin attestation in one statement.';

revoke all on function public.atlas_grant_m4_execution_authorization(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.atlas_grant_m4_execution_authorization(uuid, timestamptz) to authenticated;

-- A2b. The V1 admissible subset of "assertExecutionAuthorized() would ALLOW".
--
-- ACCEPTS ONLY the two-event chain  {requested} → {granted}  (no conditions, no
-- close, nothing else), whose every row names the instance's project, the action
-- `workflow.action.execute`, target type `workflow_execution`, target id
-- `<instance>:<state>:<kind>:<attempt group>`, and a target version hash that the
-- DATABASE recomputes from the instance row plus the run's target hash and
-- attempt group — so a caller cannot pair an authorization with a different
-- target, attempt group, state, definition or class. Under the canonical fold
-- that chain is `granted` and effective for exactly that target.
--
-- The hash is canonicalJson() of the flat execution payload (sorted keys,
-- JSON.stringify values). It is rebuilt here ONLY over a strict value domain in
-- which JSON.stringify of a string is exactly '"' || s || '"' and of the two
-- integers is their decimal text; any value outside that domain REFUSES. Parity
-- with computeExecutionAuthorizationTarget() is a permanent generated test.
--
-- Time: millisecond comparison (Date.parse); finite instants in years 2000–9999;
-- request ≤ grant (equal ms is ordered request-first by phase); the grant is in
-- the past (≥ 1 ms before the instant); its expiry is strictly after the grant
-- AND strictly after the instant. The caller holds the head FOR SHARE.
create or replace function public.licensed_bind_v1_authorization_proof(
  p_authorization_id    uuid,
  p_project_id          uuid,
  p_instance_id         uuid,
  p_def_key             text,
  p_def_version         integer,
  p_def_hash            text,
  p_state               text,
  p_action_kind         text,
  p_action_class        text,
  p_target_version_hash text,
  p_attempt_group       uuid,
  p_at                  timestamptz
)
returns table (admissible boolean, reason text, request_event_id uuid, grant_event_id uuid,
               granted_by uuid, authority_invalid_at timestamptz, attestation_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_head     public.atlas_authorization_heads;
  v_n        bigint;
  v_req      public.atlas_authorizations;
  v_grant    public.atlas_authorizations;
  v_tid      text;
  v_payload  text;
  v_hash     text;
  v_att      public.atlas_authorization_human_grants;
  c_plain    constant text := '^[A-Za-z0-9_.:-]+$';
begin
  if p_authorization_id is null or p_project_id is null or p_instance_id is null or p_def_key is null
     or p_def_version is null or p_def_hash is null or p_state is null or p_action_kind is null
     or p_action_class is null or p_target_version_hash is null or p_attempt_group is null
     or p_at is null or not pg_catalog.isfinite(p_at) then
    return query select false, 'malformed_input'::text, null::uuid, null::uuid, null::uuid, null::timestamptz, null::uuid; return;
  end if;

  -- The canonical-JSON domain. Outside it the database does not claim parity.
  if p_def_key !~ c_plain or p_state !~ c_plain or p_action_kind !~ c_plain or p_action_class !~ c_plain
     or p_def_hash !~ '^[a-f0-9]{64}$' or p_target_version_hash !~ '^[a-f0-9]{64}$'
     or p_def_version < 0 or p_def_version > 999999999 then
    return query select false, 'authorization_target_outside_v1_subset'::text, null::uuid, null::uuid, null::uuid, null::timestamptz, null::uuid; return;
  end if;

  select * into v_head from public.atlas_authorization_heads h where h.authorization_id = p_authorization_id;
  if not found then
    return query select false, 'authorization_unknown'::text, null::uuid, null::uuid, null::uuid, null::timestamptz, null::uuid; return;
  end if;

  select pg_catalog.count(*) into v_n from public.atlas_authorizations a where a.authorization_id = p_authorization_id;
  if v_n <> 2 or v_head.event_count <> 2 then
    return query select false, 'authorization_history_outside_v1_subset'::text, null::uuid, null::uuid, null::uuid, null::timestamptz, null::uuid; return;
  end if;

  select * into v_req from public.atlas_authorizations a
   where a.authorization_id = p_authorization_id and a.event_type = 'requested';
  select * into v_grant from public.atlas_authorizations a
   where a.authorization_id = p_authorization_id and a.event_type = 'granted';
  if v_req.event_id is null or v_grant.event_id is null or v_head.last_event_id <> v_grant.event_id then
    -- denied, granted_with_conditions, or any close: outside the subset.
    return query select false, 'authorization_not_an_unconditioned_grant'::text, null::uuid, null::uuid, null::uuid, null::timestamptz, null::uuid; return;
  end if;

  -- One subject on BOTH rows (the fold requires it stable; we require it exact).
  v_tid := p_instance_id::text || ':' || p_state || ':' || p_action_kind || ':' || p_attempt_group::text;
  v_payload := '{"action_class":"' || p_action_class
    || '","action_kind":"' || p_action_kind
    || '","attempt_group":"' || p_attempt_group::text
    || '","def_hash":"' || p_def_hash
    || '","def_key":"' || p_def_key
    || '","def_version":' || p_def_version::text
    || ',"instance_id":"' || p_instance_id::text
    || '","kind":"workflow.action.execute","schema":1,"state":"' || p_state
    || '","target_version_hash":"' || p_target_version_hash || '"}';
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_payload, 'UTF8')), 'hex');

  if v_req.project_id <> p_project_id or v_grant.project_id <> p_project_id then
    return query select false, 'authorization_project_mismatch'::text, null::uuid, null::uuid, null::uuid, null::timestamptz, null::uuid; return;
  end if;
  if v_req.action_kind <> 'workflow.action.execute' or v_grant.action_kind <> 'workflow.action.execute' then
    return query select false, 'authorization_action_mismatch'::text, null::uuid, null::uuid, null::uuid, null::timestamptz, null::uuid; return;
  end if;
  if v_req.target_type <> 'workflow_execution' or v_grant.target_type <> 'workflow_execution'
     or v_req.target_id <> v_tid or v_grant.target_id <> v_tid
     or v_req.target_version_hash <> v_hash or v_grant.target_version_hash <> v_hash then
    return query select false, 'authorization_target_mismatch'::text, null::uuid, null::uuid, null::uuid, null::timestamptz, null::uuid; return;
  end if;

  if not pg_catalog.isfinite(v_req.occurred_at) or not pg_catalog.isfinite(v_grant.occurred_at)
     or v_grant.expires_at is null or not pg_catalog.isfinite(v_grant.expires_at)
     or extract(year from v_req.occurred_at at time zone 'UTC') not between 2000 and 9999
     or extract(year from v_grant.occurred_at at time zone 'UTC') not between 2000 and 9999
     or extract(year from v_grant.expires_at at time zone 'UTC') not between 2000 and 9999
     or pg_catalog.date_trunc('milliseconds', v_req.occurred_at) > pg_catalog.date_trunc('milliseconds', v_grant.occurred_at)
     or pg_catalog.date_trunc('milliseconds', v_grant.expires_at) <= pg_catalog.date_trunc('milliseconds', v_grant.occurred_at) then
    return query select false, 'authorization_time_outside_v1_subset'::text, null::uuid, null::uuid, null::uuid, null::timestamptz, null::uuid; return;
  end if;
  if v_grant.occurred_at > p_at - interval '1 millisecond' then
    return query select false, 'authorization_grant_not_yet_in_force'::text, null::uuid, null::uuid, null::uuid, null::timestamptz, null::uuid; return;
  end if;
  if pg_catalog.date_trunc('milliseconds', v_grant.expires_at) <= pg_catalog.date_trunc('milliseconds', p_at) then
    return query select false, 'authorization_expired'::text, null::uuid, null::uuid, null::uuid, null::timestamptz, null::uuid; return;
  end if;

  -- HUMAN ORIGIN: the grant must carry the non-forgeable attestation written by the
  -- authenticated-only boundary, describing exactly this chain. A service_role-
  -- written grant has none, whatever its principal_id says.
  select * into v_att from public.atlas_authorization_human_grants h where h.grant_event_id = v_grant.event_id;
  if not found
     or v_att.authorization_id <> p_authorization_id or v_att.request_event_id <> v_req.event_id
     or v_att.project_id <> p_project_id or v_att.human_principal <> v_grant.principal_id
     or v_att.action_kind <> v_grant.action_kind or v_att.target_type <> v_grant.target_type
     or v_att.target_id <> v_grant.target_id or v_att.target_version_hash <> v_grant.target_version_hash
     or v_att.expires_at is distinct from v_grant.expires_at
     or v_att.profile <> 'm4_v1_human_execution_grant' then
    return query select false, 'authorization_not_human_attested'::text, null::uuid, null::uuid, null::uuid, null::timestamptz, null::uuid; return;
  end if;

  return query select true, 'v1_human_attested_execution_grant_in_force'::text, v_req.event_id, v_grant.event_id,
    v_att.human_principal, pg_catalog.date_trunc('milliseconds', v_grant.expires_at), v_att.attestation_id;
end $$;

revoke all on function public.licensed_bind_v1_authorization_proof(
  uuid, uuid, uuid, text, integer, text, text, text, text, text, uuid, timestamptz
) from public, anon, authenticated, service_role;

-- ═══ 3. No authority write after a bind, in the same transaction ═══════════════
-- PostgREST runs the bind as one statement in its own transaction, so nothing can
-- follow it. A direct session could still try: bind, then append a Decision act,
-- a licence act or a human-authorization act, then COMMIT both — a run bound under authority that the same
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
  'Phase 3B1B2 M4-B: refuses a Decision Ledger, licence-ledger or authorization-ledger insert in a transaction that already '
  'performed a licensed bind. Trigger machinery only; executable by no role.';

create trigger atlas_decision_ledger_no_write_after_licensed_bind
  before insert on public.atlas_decision_ledger
  for each row execute function public.licensed_bind_no_authority_write_after_bind();
create trigger atlas_autonomy_license_events_no_write_after_licensed_bind
  before insert on public.atlas_autonomy_license_events
  for each row execute function public.licensed_bind_no_authority_write_after_bind();
create trigger atlas_authorizations_no_write_after_licensed_bind
  before insert on public.atlas_authorizations
  for each row execute function public.licensed_bind_no_authority_write_after_bind();

revoke all on function public.licensed_bind_no_authority_write_after_bind()
  from public, anon, authenticated, service_role;

-- ═══ 4. The licensed bind ═════════════════════════════════════════════════════

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
  v_auth     record;
  v_deadline timestamptz;
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

  -- 6. M4 lock order, step 3: the HUMAN execution authorization's head, then its
  --    proof. The caller's id only SELECTS a chain; the chain must prove itself
  --    for exactly this instance, definition, state, kind, class, target hash and
  --    attempt group. While the share lock is held no grant/revoke/supersede/close
  --    can be appended to that chain.
  perform 1 from public.atlas_authorization_heads ah
   where ah.authorization_id = p_authorization_id
   for share;
  select * into v_auth from public.licensed_bind_v1_authorization_proof(
    p_authorization_id, v_inst.project_id, v_inst.id, v_inst.def_key, v_inst.def_version, v_inst.def_hash,
    v_inst.current_state, p_action_kind, 'FINANCIAL', p_target_version_hash, p_attempt_group, v_anchor) a;
  if v_auth.admissible is not true then
    raise exception 'licensed bind: human execution authorization not proven (%)', v_auth.reason
      using errcode = 'LB010';
  end if;

  -- 7. Survival: at least the required level, from raw rows, at the anchor.
  select * into v_srv from public.licensed_bind_v1_survival_proof(v_anchor) s;
  if v_srv.admissible is not true then
    raise exception 'licensed bind: Survival ceiling >= % not proven (%)', v_v1.minimum_level, v_srv.reason
      using errcode = 'LB010';
  end if;
  v_srv_inv := public.survival_clock_invalid_at(v_anchor);

  -- 8. The commit-time authority deadline: the EARLIEST proven expiry of the
  --    licence, its Decision and the human authorization. Never caller-supplied.
  v_deadline := least(v_lic.authority_invalid_at, v_auth.authority_invalid_at);
  perform public.licensed_bind_register_authority_deadline(v_deadline);

  -- 9. The run and its provenance, together. FINANCIAL class values are the
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
    survival_anchor, survival_epoch_vector, survival_valid_until, authority_valid_until, proven_min_level,
    authorization_id, authorization_request_event_id, authorization_grant_event_id, authorization_granted_by,
    authorization_proof, authorization_valid_until, authorization_attestation_id
  ) values (
    v_run_id, 'bind', null, 'licensed', null, 'allowed', v_v1.minimum_level,
    v_lic.license_id, v_lic.license_generation,
    'db_conservative_proof_v1', v_lic.decision_id, v_lic.decision_record_id, v_lic.decision_version,
    v_lic.decision_head_generation,
    'v1_two_act_approval_in_force', v_lic.reason, v_srv.reason,
    v_anchor, v_vector, v_srv_inv, v_deadline, v_v1.minimum_level,
    p_authorization_id, v_auth.request_event_id, v_auth.grant_event_id, v_auth.granted_by,
    v_auth.reason, v_auth.authority_invalid_at, v_auth.attestation_id
  )
  returning event_id into v_event_id;

  -- 10. LAST authority action. Nothing below reads or locks anything.
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
