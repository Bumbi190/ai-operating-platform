-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3B1B2 · M4-A — licensed-bind AUTHORITY SUBSTRATE (inert: no bind yet)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- OWNER RULING (Option B+): the database does NOT re-implement Chapter 11, the
-- licence resolver or the Survival state machine. The TypeScript folds remain
-- the canonical, COMPLETE semantic interpretation. What this migration adds is:
--
--   A. DATABASE MUTATION INTEGRITY for the Decision Ledger: a narrow SECURITY
--      DEFINER append boundary, and service_role loses direct INSERT.
--   B. The licence-issuance / current-Decision race closed in the licence
--      writer (instance -> decision head FOR SHARE -> licence rows).
--   C. Three CONSERVATIVE SUFFICIENT-CONDITION PREDICATES for the ONE supported
--      M4 V1 licensed action (proof_governed_effect, minimum L3):
--        licensed_bind_v1_decision_proof   — a V1 admissible subset of
--                                            "this decision governs"
--        licensed_bind_v1_licence_proof    — a V1 admissible subset of
--                                            "this licence is effective, >= L3,
--                                            and proof_governed_effect is in scope"
--        licensed_bind_v1_survival_proof   — a fail-closed proof that the
--                                            Survival ceiling is AT LEAST L3
--      They are deliberately INCOMPLETE SAFE SUBSETS. They answer only:
--      "have we proven enough facts to safely admit THIS supported action?"
--      Required relationship (proven by generated parity tests, mutation-tested):
--             DB_ALLOWS  =>  CANONICAL_TYPESCRIPT_ALLOWS
--      The converse is deliberately NOT true: valid-but-complex authority is
--      refused in V1 (amendments, annotations, restricted licences, multi-kind
--      licences, partial evidence, thin headroom margins …).
--   D. A COMMIT-TIME AUTHORITY DEADLINE: Decision expiry and licence expiry are
--      time-derived, and M3's deadline covers Survival time only. A future bind
--      registers the earliest such instant; a DEFERRED constraint trigger refuses
--      the COMMIT once it has passed.
--
-- NOTHING here admits anything. There is no licensed bind RPC in M4-A, no grant
-- of any predicate to any role, no licence, no Decision, no scheduler.
--
-- NOT APPLIED BY THIS BRANCH.

-- ═══ A. Decision Ledger append boundary — MUTATION INTEGRITY, not Chapter 11 ═══
--
-- What this function checks is REPRESENTATION integrity that a single new row
-- can be judged against the rows already present: the lineage starts with a
-- draft or a proposal, keeps one project, keeps one causal time order, carries
-- the right lifecycle generation, and an act carries the fields its own type
-- cannot exist without. It does NOT decide whether a transition is legal in
-- Chapter 11's lifecycle — the TypeScript write boundary still folds
-- [...lineage, candidate] through deriveDecisionState() BEFORE it calls this,
-- and that fold remains the only interpretation of the ledger. Nothing here may
-- be read as "this decision governs".
--
-- Serialization: the lineage head is locked FOR UPDATE (when it exists) before
-- the checks read the lineage, so two appends to one decision see each other's
-- committed rows. A brand-new decision has no head; two concurrent first acts
-- collide on the ledger's own (decision_id, generation 0) unique index.
create or replace function public.atlas_decision_ledger_append(
  p_record_id            uuid,
  p_decision_id          uuid,
  p_record_type          text,
  p_occurred_at          timestamptz,
  p_project_id           uuid,
  p_principal_id         uuid,
  p_title                text,
  p_statement            text,
  p_recommendation       text,
  p_rationale            text,
  p_materiality          jsonb,
  p_authority            jsonb,
  p_evidence             jsonb,
  p_snapshot             jsonb,
  p_alternatives         jsonb,
  p_confidence           text,
  p_expected_impact      text,
  p_effective_at         timestamptz,
  p_expires_at           timestamptz,
  p_review               jsonb,
  p_reversal_conditions  jsonb,
  p_superseded_by        uuid,
  p_version              integer,
  p_outcome              jsonb,
  p_review_note          text,
  p_reason               text,
  p_lifecycle_generation integer
)
returns setof public.atlas_decision_ledger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_head      public.atlas_decision_lineage_heads;
  v_rows      bigint;
  v_last      timestamptz;
  v_foreign   boolean;
  v_lifecycle integer;
begin
  if p_record_id is null or p_decision_id is null or p_record_type is null
     or p_occurred_at is null or p_project_id is null or p_principal_id is null
     or p_title is null or p_statement is null or p_version is null
     or p_lifecycle_generation is null then
    raise exception 'decision append: a required field is missing' using errcode = '22023';
  end if;
  if not pg_catalog.isfinite(p_occurred_at)
     or p_occurred_at > pg_catalog.clock_timestamp() + interval '5 minutes' then
    raise exception 'decision append: occurred_at must be a finite, non-future instant' using errcode = '22023';
  end if;

  select * into v_head from public.atlas_decision_lineage_heads
   where decision_id = p_decision_id
   for update;

  select pg_catalog.count(*), pg_catalog.max(l.occurred_at),
         pg_catalog.bool_or(l.project_id <> p_project_id)
    into v_rows, v_last, v_foreign
    from public.atlas_decision_ledger l
   where l.decision_id = p_decision_id;

  v_lifecycle := case when v_head.decision_id is null then 0 else v_head.head_generation + 1 end;

  if v_rows = 0 then
    if p_record_type not in ('drafted', 'proposed') or p_lifecycle_generation <> 0 then
      raise exception 'decision append: a lineage must start with drafted or proposed at generation 0'
        using errcode = '22023';
    end if;
  else
    if v_foreign then
      raise exception 'decision append: a decision lineage belongs to exactly one project' using errcode = '22023';
    end if;
    if p_occurred_at < v_last then
      raise exception 'decision append: an act may not be stamped before the lineage''s latest act'
        using errcode = '22023';
    end if;
    if p_lifecycle_generation <> v_lifecycle then
      raise exception 'decision append: lifecycle generation % does not match the lineage (%)',
        p_lifecycle_generation, v_lifecycle using errcode = '40001';
    end if;
  end if;

  -- Fields an act of this TYPE cannot exist without (row-local integrity).
  if p_record_type = 'approved' and (
       pg_catalog.jsonb_typeof(p_authority) is distinct from 'object'
       or pg_catalog.jsonb_typeof(p_authority -> 'authorizationId') is distinct from 'string'
       or pg_catalog.length(p_authority ->> 'authorizationId') = 0
       or p_effective_at is null or not pg_catalog.isfinite(p_effective_at)) then
    raise exception 'decision append: an approval carries its authority reference and a finite effective date'
      using errcode = '22023';
  end if;
  if p_record_type = 'outcome_observed' and pg_catalog.jsonb_typeof(p_outcome) is distinct from 'object' then
    raise exception 'decision append: an outcome observation carries its outcome' using errcode = '22023';
  end if;
  if p_record_type = 'superseded' and p_superseded_by is null then
    raise exception 'decision append: a supersession names its successor' using errcode = '22023';
  end if;
  if p_record_type in ('amended', 'reversed') and pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'decision append: % carries a reason', p_record_type using errcode = '22023';
  end if;

  return query
  insert into public.atlas_decision_ledger (
    record_id, decision_id, record_type, occurred_at, project_id, principal_id,
    title, statement, recommendation, rationale, materiality, authority,
    evidence, snapshot, alternatives, confidence, expected_impact,
    effective_at, expires_at, review, reversal_conditions, superseded_by,
    version, outcome, review_note, reason, lifecycle_generation
  ) values (
    p_record_id, p_decision_id, p_record_type, p_occurred_at, p_project_id, p_principal_id,
    p_title, p_statement, p_recommendation, p_rationale, coalesce(p_materiality, '[]'::jsonb), p_authority,
    coalesce(p_evidence, '[]'::jsonb), p_snapshot, coalesce(p_alternatives, '[]'::jsonb), p_confidence, p_expected_impact,
    p_effective_at, p_expires_at, p_review, coalesce(p_reversal_conditions, '[]'::jsonb), p_superseded_by,
    p_version, p_outcome, p_review_note, p_reason, p_lifecycle_generation
  )
  returning *;
end $$;

comment on function public.atlas_decision_ledger_append(
  uuid, uuid, text, timestamptz, uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb,
  jsonb, text, text, timestamptz, timestamptz, jsonb, jsonb, uuid, integer, jsonb, text, text, integer) is
  'Phase 3B1B2 M4-A: the ONLY write path for atlas_decision_ledger. Database mutation INTEGRITY '
  '(start shape, one project, causal time order, lifecycle generation, type-required fields). '
  'NOT Chapter 11 semantics: the application folds the candidate through deriveDecisionState() '
  'before calling this, and that fold remains the only interpretation of the ledger.';

-- service_role keeps SELECT and loses every write privilege on the ledger; the
-- append boundary above is the only writer. anon/authenticated gain nothing.
revoke all on table public.atlas_decision_ledger from public, anon, authenticated, service_role;
grant select on table public.atlas_decision_ledger to service_role;

revoke all on function public.atlas_decision_ledger_append(
  uuid, uuid, text, timestamptz, uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb,
  jsonb, text, text, timestamptz, timestamptz, jsonb, jsonb, uuid, integer, jsonb, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.atlas_decision_ledger_append(
  uuid, uuid, text, timestamptz, uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb,
  jsonb, text, text, timestamptz, timestamptz, jsonb, jsonb, uuid, integer, jsonb, text, text, integer)
  to service_role;

-- ═══ B. Licence issuance serializes on the CURRENT Decision ════════════════════
-- The M1 writer body verbatim, plus ONE block (marked M4-A) on LICENSE_ISSUED.
-- Same signature: CREATE OR REPLACE replaces it in place, grants unchanged.
create or replace function public.autonomy_license_append(
  p_license_id               uuid,
  p_expected_generation      integer,
  p_act                      text,
  p_project_id               uuid,
  p_workflow_instance_id     uuid,
  p_bound_def_key            text,
  p_bound_def_hash           text,
  p_licensed_level           text,
  p_allowed_action_kinds     text[],
  p_action_scope_fingerprint text,
  p_decision_id              uuid,
  p_decision_version         integer,
  p_decision_record_id       uuid,
  p_effective_at             timestamptz,
  p_expires_at               timestamptz,
  p_superseded_by_license_id uuid,
  p_reason                   text,
  p_actor                    text
)
returns public.atlas_autonomy_license_events
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_generation   integer;
  v_first        public.atlas_autonomy_license_events;
  v_prior_start  timestamptz;
  v_prior_end    timestamptz;
  v_level_index  integer;
  v_prior_min_level integer;
  v_row          public.atlas_autonomy_license_events;
  v_head         public.atlas_decision_lineage_heads;
begin
  -- ── Actor shape ─────────────────────────────────────────────────────────
  -- The authoritative check is `resolvePlatformOperator()` upstream; this
  -- refuses to let the LEDGER record a non-human actor regardless.
  if p_actor is null
     or p_actor !~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'p_actor must be the canonical human actor shape user:<uuid>' using errcode = '22023';
  end if;

  if p_act is null or p_act not in (
    'LICENSE_ISSUED', 'LICENSE_RESTRICTED', 'LICENSE_SUSPENDED',
    'LICENSE_REVOKED', 'LICENSE_SUPERSEDED'
  ) then
    raise exception 'unsupported act %', p_act using errcode = '22023';
  end if;

  if p_licensed_level is null or p_licensed_level not in ('L0','L1','L2','L3','L4','L5','L6') then
    raise exception 'unsupported licensed level %', p_licensed_level using errcode = '22023';
  end if;

  if p_allowed_action_kinds is null or cardinality(p_allowed_action_kinds) = 0 then
    raise exception 'at least one allowed action kind is required' using errcode = '22023';
  end if;

  if p_effective_at is null or p_expires_at is null or p_expires_at <= p_effective_at then
    raise exception 'the licence window must be a non-empty forward interval' using errcode = '22023';
  end if;

  if p_expected_generation is null or p_expected_generation < 0 then
    raise exception 'p_expected_generation must be the caller''s observed generation, >= 0'
      using errcode = '22023';
  end if;

  -- ── Phase 3B1B2 M1: the workflow instance is locked FIRST ─────────────────
  -- Before any licence-lineage truth is read or locked. A brand-new license_id
  -- has no rows to lock, so this is what serializes a fresh LICENSE_ISSUED
  -- against every other licence act and every future bind on the same
  -- instance. Canonical order: instance -> decision head -> licence rows.
  -- NO KEY UPDATE: conflicts with other licence writers and with a bind's
  -- FOR UPDATE, but not with FK child inserts (FOR KEY SHARE).
  perform 1 from public.workflow_instances
   where id = p_workflow_instance_id
   for no key update;

  -- ── Phase 3B1B2 M4-A: an ISSUED act serializes on the CURRENT Decision ──────
  -- Canonical order (M1): instance -> decision head -> licence rows. The issuing
  -- application proves "the decision governs" against Chapter 11's fold and pins
  -- the decision's latest lifecycle act (its head record). Between that proof and
  -- this append a lifecycle writer could commit a reversal, supersession or
  -- amendment; the licence would then be recorded against a Decision state that
  -- no longer exists. FOR SHARE on the head makes a concurrent lifecycle writer's
  -- head UPDATE wait for this transaction, and the equality check refuses an act
  -- whose pinned head has already moved (40001: a stale observation, nothing
  -- written). Continuing acts (restrict, suspend, revoke, supersede) only narrow
  -- authority and are deliberately NOT blocked by Decision changes.
  if p_act = 'LICENSE_ISSUED' then
    select * into v_head from public.atlas_decision_lineage_heads
     where decision_id = p_decision_id
     for share;
    if not found
       or v_head.head_record_id <> p_decision_record_id
       or v_head.project_id <> p_project_id then
      raise exception
        'the pinned decision act is not the current lifecycle head of decision % (stale observation)',
        p_decision_id using errcode = '40001';
    end if;
  end if;

  -- The lineage is serialized here. `for update` on the existing chain, then the
  -- max generation read under that lock.
  perform 1 from public.atlas_autonomy_license_events
   where license_id = p_license_id
   for update;

  select coalesce(max(license_generation) + 1, 0) into v_generation
    from public.atlas_autonomy_license_events
   where license_id = p_license_id;

  -- ── Optimistic concurrency: the caller's OBSERVED generation ──────────────
  -- This is what actually serializes two humans acting on the same licence
  -- state, and the unique index alone does NOT do it.
  --
  -- Without this check the generation is derived purely from committed database
  -- truth, so a caller that read the chain BEFORE another act committed simply
  -- receives the NEXT generation and inserts a second, later act built from a
  -- view that no longer exists:
  --
  --     A reads generation 1   B reads generation 1
  --     A calls RPC → lock → derives 1 → inserts 1 → commits
  --     B waits on the lock, then derives 2 and inserts 2 — no conflict, because
  --     B never asked for 1. The unique index is never given the chance to fire.
  --
  -- Comparing the caller's observation against the locked truth BEFORE inserting
  -- turns that into a refusal, and nothing is written. Fail closed: the stale
  -- caller must re-read and re-decide, never have its stale decision absorbed.
  --
  -- 40001 (serialization_failure) is the canonical PostgreSQL concurrency
  -- conflict code. A stale human decision is a CONFLICT, never malformed data,
  -- so it must not be reported as a 22023 data error.
  if p_expected_generation <> v_generation then
    raise exception
      'stale licence generation: caller expected %, lineage is at %',
      p_expected_generation, v_generation
      using errcode = '40001';
  end if;

  -- An ISSUED act starts a lineage and nothing else may; every other act
  -- continues one and may not be the first.
  if (v_generation = 0) <> (p_act = 'LICENSE_ISSUED') then
    raise exception 'act % is inconsistent with lineage position %', p_act, v_generation
      using errcode = '22023';
  end if;

  -- ── A terminal lineage accepts no further act ───────────────────────────
  -- §18.57 (revoked) and §18.56 (superseded) end a lineage. Ruling 7: after a
  -- suspension, restoring autonomy requires a NEW reviewed licensing act, not
  -- an appended one, so there is deliberately no RESUMED act to append.
  if exists (
    select 1 from public.atlas_autonomy_license_events
     where license_id = p_license_id
       and act in ('LICENSE_REVOKED', 'LICENSE_SUPERSEDED')
  ) then
    raise exception 'licence lineage % is terminal and accepts no further act', p_license_id
      using errcode = '22023';
  end if;

  if v_generation = 0 then
    -- ── ISSUED: the subject must be the instance's OWN truth ─────────────
    -- ONE relational check. The caller names the instance and nothing else: the
    -- project, the definition key and the definition hash are read from that
    -- instance's row rather than believed. Without this the ledger could record
    -- a binding the database itself knows to be false — a licence claiming a
    -- project or a definition its own workflow instance does not have.
    if not exists (
      select 1 from public.workflow_instances wi
       where wi.id = p_workflow_instance_id
         and wi.project_id = p_project_id
         and wi.def_key = p_bound_def_key
         and wi.def_hash = p_bound_def_hash
    ) then
      raise exception
        'the licence subject does not match workflow instance %: project, def_key or def_hash disagrees',
        p_workflow_instance_id using errcode = '22023';
    end if;

    -- ── ISSUED: the pinned decision act says exactly what we claim ───────
    -- ONE exact-row condition on the immutable record the licence pins.
    -- Deliberately NOT a scan of the whole lineage: a material amendment to the
    -- same decision may legitimately carry different materiality, and refusing
    -- on that would reject a valid pin. Whether the decision is CURRENTLY
    -- GOVERNING is proven in TypeScript against Chapter 11's own fold, which
    -- this function does not re-implement.
    if not exists (
      select 1 from public.atlas_decision_ledger dl
       where dl.decision_id = p_decision_id
         and dl.record_id = p_decision_record_id
         and dl.version = p_decision_version
         and dl.project_id = p_project_id
         and dl.materiality @> '["autonomy"]'::jsonb
    ) then
      raise exception
        'the pinned decision act is not a same-project autonomy record as claimed'
        using errcode = '22023';
    end if;
  else
    -- ── After a suspension, ONLY revocation and supersession ─────────────
    -- There is no RESUMED act. A restriction must not become a hidden resume
    -- path, and a SECOND suspension is not a narrowing act either — stopping
    -- something already stopped is outside the approved lifecycle. Restoring
    -- autonomy requires a NEW reviewed licensing lineage, not another act on
    -- this one. Refused here, refused again by the pure fold, and re-derived as
    -- ineffective at read time: three independent mechanisms, because
    -- "suspended means stopped" is the whole point of a suspension.
    if exists (
      select 1 from public.atlas_autonomy_license_events
       where license_id = p_license_id and act = 'LICENSE_SUSPENDED'
    ) and p_act not in ('LICENSE_REVOKED', 'LICENSE_SUPERSEDED') then
      raise exception
        'after a suspension the only admissible acts are revocation and supersession (got %)', p_act
        using errcode = '22023';
    end if;

    -- ── Every continuing act inherits the issued subject, unchanged ───────
    select * into v_first from public.atlas_autonomy_license_events
     where license_id = p_license_id and license_generation = 0;

    if v_first.project_id <> p_project_id
       or v_first.workflow_instance_id <> p_workflow_instance_id
       or v_first.bound_def_key <> p_bound_def_key
       or v_first.bound_def_hash <> p_bound_def_hash
       or v_first.decision_id <> p_decision_id
       or v_first.decision_version <> p_decision_version
       or v_first.decision_record_id <> p_decision_record_id then
      raise exception 'a continuing act may not move the licence subject or its provenance'
        using errcode = '22023';
    end if;

    -- ── Narrowing, enforced as an aggregate rather than a second fold ────
    -- Ruling 7: RESTRICTED may only narrow level, action set and window. This
    -- compares against the aggregate of every prior act, which is exactly what
    -- the read-time fold computes — without re-implementing its control flow.
    v_level_index := substring(p_licensed_level from 2)::integer;

    select min(substring(licensed_level from 2)::integer) into v_prior_min_level
      from public.atlas_autonomy_license_events where license_id = p_license_id;
    if v_level_index > v_prior_min_level then
      raise exception 'a continuing act may not raise the licensed level' using errcode = '22023';
    end if;

    -- Subset of EVERY prior action set is subset of their intersection.
    if exists (
      select 1 from public.atlas_autonomy_license_events e
       where e.license_id = p_license_id
         and not (p_allowed_action_kinds <@ e.allowed_action_kinds)
    ) then
      raise exception 'a continuing act may not add an action kind' using errcode = '22023';
    end if;

    select max(effective_at), min(expires_at) into v_prior_start, v_prior_end
      from public.atlas_autonomy_license_events where license_id = p_license_id;
    if p_effective_at < v_prior_start then
      raise exception 'a continuing act may not move the window start earlier' using errcode = '22023';
    end if;
    if p_expires_at > v_prior_end then
      raise exception 'a continuing act may not extend the window end' using errcode = '22023';
    end if;

    if p_act = 'LICENSE_SUPERSEDED' then
      if p_superseded_by_license_id is null
         or p_superseded_by_license_id = p_license_id
         or not exists (
           select 1 from public.atlas_autonomy_license_events
            where license_id = p_superseded_by_license_id
              and workflow_instance_id = p_workflow_instance_id
         ) then
        raise exception 'a supersession must name a replacement licence for the SAME instance'
          using errcode = '22023';
      end if;
    end if;
  end if;

  insert into public.atlas_autonomy_license_events (
    license_id, license_generation, act,
    project_id, workflow_instance_id, bound_def_key, bound_def_hash,
    licensed_level, allowed_action_kinds, action_scope_fingerprint,
    decision_id, decision_version, decision_record_id,
    effective_at, expires_at, superseded_by_license_id, reason, actor
  ) values (
    p_license_id, v_generation, p_act,
    p_project_id, p_workflow_instance_id, p_bound_def_key, p_bound_def_hash,
    p_licensed_level, p_allowed_action_kinds, p_action_scope_fingerprint,
    p_decision_id, p_decision_version, p_decision_record_id,
    p_effective_at, p_expires_at, p_superseded_by_license_id, p_reason, p_actor
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.autonomy_license_append(
  uuid, integer, text, uuid, uuid, text, text, text, text[], text, uuid, integer, uuid,
  timestamptz, timestamptz, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.autonomy_license_append(
  uuid, integer, text, uuid, uuid, text, text, text, text[], text, uuid, integer, uuid,
  timestamptz, timestamptz, uuid, text, text
) to service_role;

-- ═══ C. M4 V1 conservative sufficient-condition predicates ════════════════════
--
-- The V1 supported set, ONCE. A permanent guard compares it with the TypeScript
-- policy table (exactly one licensed kind, its minimum level) and with the
-- canonical `fingerprintFor([kind], def_key)` for every registry placement, so
-- adding a licensed kind, changing its minimum level, or moving the registry
-- fails CI until a reviewed migration updates this function.
create or replace function public.licensed_bind_v1_supported()
returns table (action_kind text, minimum_level text, bound_def_key text, scope_fingerprint text)
language sql
immutable
set search_path = ''
as $$
  -- licensed-bind-v1-supported:begin
  select 'proof_governed_effect'::text, 'L3'::text, 'omnira.execution-proof'::text,
         'c2f8cc24bc5cca84100be20283148f970393a4385e89b1c3d0617822ccb9875a'::text
  -- licensed-bind-v1-supported:end
$$;

-- ── C1. Decision: a V1 admissible subset of "this decision governs" ───────────
-- ACCEPTS ONLY the two-act lineage   {drafted|proposed @ g0}  →  {approved @ g1}
-- with nothing else in it (no annotation, no amendment, no closing act), whose
-- locked lifecycle head is exactly the approval the licence pinned, carrying its
-- authority reference and a finite effective date that has arrived, and whose
-- expiry (if any) has not. Under the canonical fold that lineage is `active`,
-- so isDecisionGoverning() is true — and every other shape REFUSES here.
--
-- Timestamps: the fold orders by occurred_at and compares in MILLISECONDS
-- (Date.parse), and PostgREST serialises ±infinity as text (Date.parse → NaN).
-- So: finite instants in years 2000–9999 only; g0 not after g1; the effective
-- date at least 1 ms in the past (covers truncation AND rounding of µs); expiry
-- compared at millisecond truncation, strictly after the evaluation instant.
-- The caller holds the decision head FOR SHARE; this function only reads.
create or replace function public.licensed_bind_v1_decision_proof(
  p_decision_id        uuid,
  p_decision_record_id uuid,
  p_decision_version   integer,
  p_project_id         uuid,
  p_at                 timestamptz
)
returns table (admissible boolean, reason text, head_generation integer, authority_invalid_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_head public.atlas_decision_lineage_heads;
  v_n    bigint;
  v_g0   public.atlas_decision_ledger;
  v_g1   public.atlas_decision_ledger;
begin
  if p_decision_id is null or p_decision_record_id is null or p_decision_version is null
     or p_project_id is null or p_at is null or not pg_catalog.isfinite(p_at) then
    return query select false, 'malformed_input'::text, null::integer, null::timestamptz; return;
  end if;

  select * into v_head from public.atlas_decision_lineage_heads h where h.decision_id = p_decision_id;
  if not found then
    return query select false, 'decision_head_missing'::text, null::integer, null::timestamptz; return;
  end if;
  if v_head.head_record_id <> p_decision_record_id then
    return query select false, 'decision_head_moved'::text, v_head.head_generation, null::timestamptz; return;
  end if;
  if v_head.head_generation <> 1 or v_head.head_record_type <> 'approved' or v_head.project_id <> p_project_id then
    return query select false, 'decision_shape_outside_v1_subset'::text, v_head.head_generation, null::timestamptz; return;
  end if;

  select pg_catalog.count(*) into v_n from public.atlas_decision_ledger l where l.decision_id = p_decision_id;
  if v_n <> 2 then
    return query select false, 'decision_lineage_outside_v1_subset'::text, v_head.head_generation, null::timestamptz; return;
  end if;

  select * into v_g0 from public.atlas_decision_ledger l
   where l.decision_id = p_decision_id and l.lifecycle_generation = 0 and l.record_type in ('drafted', 'proposed');
  select * into v_g1 from public.atlas_decision_ledger l
   where l.decision_id = p_decision_id and l.record_id = p_decision_record_id
     and l.lifecycle_generation = 1 and l.record_type = 'approved' and l.version = p_decision_version;
  if v_g0.record_id is null or v_g1.record_id is null then
    return query select false, 'decision_lineage_outside_v1_subset'::text, v_head.head_generation, null::timestamptz; return;
  end if;

  if v_g0.project_id <> p_project_id or v_g1.project_id <> p_project_id then
    return query select false, 'decision_project_mismatch'::text, v_head.head_generation, null::timestamptz; return;
  end if;

  if not pg_catalog.isfinite(v_g0.occurred_at) or not pg_catalog.isfinite(v_g1.occurred_at)
     or extract(year from v_g0.occurred_at at time zone 'UTC') not between 2000 and 9999
     or extract(year from v_g1.occurred_at at time zone 'UTC') not between 2000 and 9999
     or v_g0.occurred_at > v_g1.occurred_at then
    return query select false, 'decision_time_order_outside_v1_subset'::text, v_head.head_generation, null::timestamptz; return;
  end if;

  if pg_catalog.jsonb_typeof(v_g1.authority) is distinct from 'object'
     or pg_catalog.jsonb_typeof(v_g1.authority -> 'authorizationId') is distinct from 'string'
     or pg_catalog.length(v_g1.authority ->> 'authorizationId') = 0 then
    return query select false, 'decision_authority_missing'::text, v_head.head_generation, null::timestamptz; return;
  end if;

  if v_g1.effective_at is null or not pg_catalog.isfinite(v_g1.effective_at)
     or extract(year from v_g1.effective_at at time zone 'UTC') not between 2000 and 9999 then
    return query select false, 'decision_effective_date_outside_v1_subset'::text, v_head.head_generation, null::timestamptz; return;
  end if;
  if v_g1.effective_at > p_at - interval '1 millisecond' then
    return query select false, 'decision_not_yet_effective'::text, v_head.head_generation, null::timestamptz; return;
  end if;

  if v_g1.expires_at is not null then
    if not pg_catalog.isfinite(v_g1.expires_at)
       or extract(year from v_g1.expires_at at time zone 'UTC') not between 2000 and 9999 then
      return query select false, 'decision_expiry_outside_v1_subset'::text, v_head.head_generation, null::timestamptz; return;
    end if;
    if pg_catalog.date_trunc('milliseconds', v_g1.expires_at) <= pg_catalog.date_trunc('milliseconds', p_at) then
      return query select false, 'decision_expired'::text, v_head.head_generation, null::timestamptz; return;
    end if;
  end if;

  return query select true, 'v1_two_act_approval_in_force'::text, v_head.head_generation,
    case when v_g1.expires_at is null then null::timestamptz
         else pg_catalog.date_trunc('milliseconds', v_g1.expires_at) end;
end $$;

-- ── C2. Licence: a V1 admissible subset of "effective, >= L3, kind in scope" ──
-- ACCEPTS ONLY: the instance has EXACTLY ONE licence event anywhere — a single
-- LICENSE_ISSUED at generation 0 (no restriction, suspension, revocation,
-- supersession, or competing lineage); its subject is the instance's own
-- project / def_key / def_hash; it licenses EXACTLY the V1 kind with the V1
-- scope fingerprint for the V1 definition; its level is L3..L6; its window is
-- open at the evaluation instant (same millisecond rules as C1); and its pinned
-- decision satisfies C1. Under the canonical resolver that lineage is the single
-- live lineage, folds to `active`, is effective, resolves to its licensed level
-- and contains the kind. Everything else REFUSES here.
create or replace function public.licensed_bind_v1_licence_proof(
  p_workflow_instance_id uuid,
  p_action_kind          text,
  p_at                   timestamptz
)
returns table (
  admissible boolean, reason text,
  license_id uuid, license_event_id uuid, license_generation integer, licensed_level text,
  decision_id uuid, decision_record_id uuid, decision_version integer, decision_head_generation integer,
  authority_invalid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_v1   record;
  v_inst record;
  v_n    bigint;
  v_ev   public.atlas_autonomy_license_events;
  v_dec  record;
  v_inv  timestamptz;
begin
  if p_workflow_instance_id is null or p_action_kind is null or p_at is null or not pg_catalog.isfinite(p_at) then
    return query select false, 'malformed_input'::text, null::uuid, null::uuid, null::integer, null::text,
      null::uuid, null::uuid, null::integer, null::integer, null::timestamptz; return;
  end if;

  select * into v_v1 from public.licensed_bind_v1_supported() s where s.action_kind = p_action_kind;
  if not found then
    return query select false, 'action_kind_outside_v1_subset'::text, null::uuid, null::uuid, null::integer, null::text,
      null::uuid, null::uuid, null::integer, null::integer, null::timestamptz; return;
  end if;

  select wi.project_id, wi.def_key, wi.def_hash into v_inst
    from public.workflow_instances wi where wi.id = p_workflow_instance_id;
  if not found then
    return query select false, 'unknown_workflow_instance'::text, null::uuid, null::uuid, null::integer, null::text,
      null::uuid, null::uuid, null::integer, null::integer, null::timestamptz; return;
  end if;

  select pg_catalog.count(*) into v_n from public.atlas_autonomy_license_events e
   where e.workflow_instance_id = p_workflow_instance_id;
  if v_n = 0 then
    return query select false, 'no_license'::text, null::uuid, null::uuid, null::integer, null::text,
      null::uuid, null::uuid, null::integer, null::integer, null::timestamptz; return;
  end if;
  if v_n <> 1 then
    return query select false, 'licence_history_outside_v1_subset'::text, null::uuid, null::uuid, null::integer, null::text,
      null::uuid, null::uuid, null::integer, null::integer, null::timestamptz; return;
  end if;

  select * into v_ev from public.atlas_autonomy_license_events e
   where e.workflow_instance_id = p_workflow_instance_id;

  if v_ev.act <> 'LICENSE_ISSUED' or v_ev.license_generation <> 0 then
    return query select false, 'licence_history_outside_v1_subset'::text, v_ev.license_id, v_ev.event_id,
      v_ev.license_generation, v_ev.licensed_level, null::uuid, null::uuid, null::integer, null::integer, null::timestamptz; return;
  end if;
  if v_ev.project_id <> v_inst.project_id or v_ev.bound_def_key <> v_inst.def_key or v_ev.bound_def_hash <> v_inst.def_hash then
    return query select false, 'licence_subject_drifted'::text, v_ev.license_id, v_ev.event_id,
      v_ev.license_generation, v_ev.licensed_level, null::uuid, null::uuid, null::integer, null::integer, null::timestamptz; return;
  end if;
  if v_ev.allowed_action_kinds is distinct from array[v_v1.action_kind]::text[]
     or v_ev.bound_def_key <> v_v1.bound_def_key
     or v_ev.action_scope_fingerprint <> v_v1.scope_fingerprint then
    return query select false, 'licence_scope_outside_v1_subset'::text, v_ev.license_id, v_ev.event_id,
      v_ev.license_generation, v_ev.licensed_level, null::uuid, null::uuid, null::integer, null::integer, null::timestamptz; return;
  end if;
  if v_ev.licensed_level not in ('L3', 'L4', 'L5', 'L6') or v_v1.minimum_level <> 'L3' then
    return query select false, 'licensed_level_below_required'::text, v_ev.license_id, v_ev.event_id,
      v_ev.license_generation, v_ev.licensed_level, null::uuid, null::uuid, null::integer, null::integer, null::timestamptz; return;
  end if;

  if not pg_catalog.isfinite(v_ev.effective_at) or not pg_catalog.isfinite(v_ev.expires_at)
     or extract(year from v_ev.effective_at at time zone 'UTC') not between 2000 and 9999
     or extract(year from v_ev.expires_at at time zone 'UTC') not between 2000 and 9999 then
    return query select false, 'licence_window_outside_v1_subset'::text, v_ev.license_id, v_ev.event_id,
      v_ev.license_generation, v_ev.licensed_level, null::uuid, null::uuid, null::integer, null::integer, null::timestamptz; return;
  end if;
  if v_ev.effective_at > p_at - interval '1 millisecond' then
    return query select false, 'licence_not_yet_effective'::text, v_ev.license_id, v_ev.event_id,
      v_ev.license_generation, v_ev.licensed_level, null::uuid, null::uuid, null::integer, null::integer, null::timestamptz; return;
  end if;
  if pg_catalog.date_trunc('milliseconds', v_ev.expires_at) <= pg_catalog.date_trunc('milliseconds', p_at) then
    return query select false, 'licence_expired'::text, v_ev.license_id, v_ev.event_id,
      v_ev.license_generation, v_ev.licensed_level, null::uuid, null::uuid, null::integer, null::integer, null::timestamptz; return;
  end if;

  select * into v_dec from public.licensed_bind_v1_decision_proof(
    v_ev.decision_id, v_ev.decision_record_id, v_ev.decision_version, v_inst.project_id, p_at) d;
  if not v_dec.admissible then
    return query select false, ('decision:' || v_dec.reason)::text, v_ev.license_id, v_ev.event_id,
      v_ev.license_generation, v_ev.licensed_level, v_ev.decision_id, v_ev.decision_record_id, v_ev.decision_version,
      v_dec.head_generation, null::timestamptz; return;
  end if;

  v_inv := least(pg_catalog.date_trunc('milliseconds', v_ev.expires_at), v_dec.authority_invalid_at);
  return query select true, 'v1_single_issued_licence_in_force'::text, v_ev.license_id, v_ev.event_id,
    v_ev.license_generation, v_ev.licensed_level, v_ev.decision_id, v_ev.decision_record_id, v_ev.decision_version,
    v_dec.head_generation, v_inv;
end $$;

-- ── C3. Survival: a fail-closed proof that the ceiling is AT LEAST L3 ──────────
-- The canonical derivation (TypeScript, owner-approved v1 thresholds) maps
-- EXPAND/NORMAL → L6, CONSERVE → L3, CRITICAL → L1, HIBERNATE → L0, so "ceiling
-- >= L3" means "not CRITICAL and not HIBERNATE". This function does not derive
-- the state. It requires facts, read from the same raw tables the canonical
-- snapshot reads over the whole platform, that rule out EVERY branch of the
-- derivation that can reach CRITICAL or HIBERNATE — with margins:
--
--   population   1..1000 projects (the whole platform; a PostgREST page bounds
--                what the TypeScript portfolio read can see, and a truncated
--                portfolio would make the canonical observation PARTIAL)
--   headroom     EVERY budget_headroom(30) row has limit > 0, remaining > 0 and
--                remaining >= 0.11 × limit (canonical CRITICAL is < 0.10). Every
--                row, so no choice of binding scope, tie-break or subset can
--                land below the canonical bound.
--   funding      the singleton row exists (else UNAVAILABLE → HIBERNATE); either
--                UNDECLARED (CONSERVE floor, >= L3) or a finite value > 0; never
--                NaN (PostgreSQL orders NaN above every number).
--   runway       for KNOWN funding: an UPPER bound on the canonical burn — every
--                cost row of the platform in a window one second LONGER than
--                the canonical 720 h, each counted at max(cost, 0), plus every
--                open dispatched reservation at max(estimate, 0) — must give at
--                least 4 days (canonical CRITICAL is < 3), or be zero.
--
-- It never reads a caller-supplied state, ceiling, headroom, runway, project
-- list or "allowed" flag: it takes only the evaluation instant.
create or replace function public.licensed_bind_v1_survival_proof(p_at timestamptz)
returns table (admissible boolean, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_projects   bigint;
  v_rows       bigint;
  v_bad        bigint;
  v_found      boolean;
  v_funding    numeric;
  v_recorded   numeric;
  v_pending    numeric;
  v_burn_upper numeric;
begin
  if p_at is null or not pg_catalog.isfinite(p_at) then
    return query select false, 'malformed_input'::text; return;
  end if;

  select pg_catalog.count(*) into v_projects from public.projects;
  if v_projects < 1 or v_projects > 1000 then
    return query select false, 'platform_population_outside_v1_subset'::text; return;
  end if;

  select pg_catalog.count(*),
         pg_catalog.count(*) filter (where not (
           h.limit_sek is not null and h.remaining_sek is not null
           and h.limit_sek <> 'NaN'::numeric and h.remaining_sek <> 'NaN'::numeric
           and h.limit_sek > 0 and h.remaining_sek > 0
           and h.remaining_sek >= 0.11 * h.limit_sek))
    into v_rows, v_bad
    from public.budget_headroom(30) h;
  if v_rows < 1 then
    return query select false, 'headroom_unproven'::text; return;
  end if;
  if v_bad > 0 then
    return query select false, 'headroom_below_v1_margin'::text; return;
  end if;

  select true, c.declared_operating_capital_sek into v_found, v_funding
    from public.survival_funding_config c where c.id = 1;
  if v_found is null then
    return query select false, 'funding_unavailable'::text; return;
  end if;
  if v_funding is null then
    -- UNDECLARED: the canonical CONSERVE floor (>= L3). Headroom above already
    -- rules out CRITICAL and HIBERNATE; coverage and runway play no part.
    return query select true, 'v1_headroom_margin_funding_undeclared'::text; return;
  end if;
  if v_funding = 'NaN'::numeric or v_funding <= 0 then
    return query select false, 'funding_not_positive'::text; return;
  end if;

  select coalesce(pg_catalog.sum(greatest(coalesce(c.cost_sek, 0), 0)), 0) into v_recorded
    from public.cost_events c
   where c.project_id in (select p.id from public.projects p)
     and c.created_at >= p_at - interval '720 hours' - interval '1 second';
  select coalesce(pg_catalog.sum(greatest(coalesce(r.estimated_sek, 0), 0)), 0) into v_pending
    from public.spend_reservations r
   where r.status = 'open' and r.dispatched_at is not null
     and r.project_id in (select p.id from public.projects p);
  v_burn_upper := (v_recorded + v_pending) / 30;

  if v_burn_upper = 'NaN'::numeric then
    return query select false, 'burn_unproven'::text; return;
  end if;
  if v_burn_upper > 0 and v_funding < 4 * v_burn_upper then
    return query select false, 'runway_below_v1_margin'::text; return;
  end if;
  return query select true, 'v1_headroom_margin_funding_known_runway_margin'::text;
end $$;

-- ═══ D. Commit-time authority deadline ════════════════════════════════════════
-- Decision expiry and licence expiry are TIME-derived. Between an admission
-- read and COMMIT, an expiry may pass with no row changing, which M3's deadline
-- (Survival time only) cannot see. A future licensed bind registers the
-- earliest authority instant here, BEFORE it calls survival_commit_fence()
-- LAST; a DEFERRED constraint trigger refuses the COMMIT once that instant has
-- passed. Same honest limits and self-probes as M3: top-level only (LB001), the
-- recheck may not have been forced IMMEDIATE (LB002), refused at COMMIT when
-- clock_timestamp() >= the deadline (LB003). No role holds any privilege.
create table public.licensed_bind_authority_intents (
  xact                 xid8        primary key,
  authority_invalid_at timestamptz not null,
  registered_at        timestamptz not null
);

comment on table public.licensed_bind_authority_intents is
  'Phase 3B1B2 M4-A: one row per licensed-bind transaction (full xid8) carrying the earliest '
  'Decision/licence expiry instant, read by its deferred commit-time recheck. DB_INTERNAL: no role '
  'holds any privilege on it.';

create or replace function public.licensed_bind_authority_recheck()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('omnira.licensed_bind_rechecked', new.xact::text, true);
  if pg_catalog.clock_timestamp() >= new.authority_invalid_at then
    raise exception 'licensed bind: Decision/licence validity expired at commit (%)', new.authority_invalid_at
      using errcode = 'LB003';
  end if;
  return null;
end $$;

create constraint trigger licensed_bind_authority_recheck
  after insert on public.licensed_bind_authority_intents
  deferrable initially deferred for each row
  execute function public.licensed_bind_authority_recheck();

create or replace function public.licensed_bind_register_authority_deadline(p_authority_invalid_at timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_xact     xid8 := pg_catalog.pg_current_xact_id();
  v_row_xmin bigint;
begin
  if p_authority_invalid_at is null or not pg_catalog.isfinite(p_authority_invalid_at) then
    raise exception 'licensed bind: an authority deadline is required' using errcode = '22023';
  end if;
  if pg_catalog.clock_timestamp() >= p_authority_invalid_at then
    raise exception 'licensed bind: Decision/licence validity already expired (%)', p_authority_invalid_at
      using errcode = 'LB003';
  end if;
  delete from public.licensed_bind_authority_intents d
   where d.xact in (select o.xact from public.licensed_bind_authority_intents o
                     where o.xact <> v_xact for update skip locked);
  insert into public.licensed_bind_authority_intents (xact, authority_invalid_at, registered_at)
  values (v_xact, p_authority_invalid_at, pg_catalog.clock_timestamp());
  select (x.xmin::text)::bigint into v_row_xmin from public.licensed_bind_authority_intents x where x.xact = v_xact;
  if v_row_xmin is distinct from ((v_xact::text)::numeric % 4294967296)::bigint then
    raise exception 'licensed bind: must run at transaction top level' using errcode = 'LB001';
  end if;
  if pg_catalog.current_setting('omnira.licensed_bind_rechecked', true) is not distinct from v_xact::text then
    raise exception 'licensed bind: commit-time authority recheck was forced IMMEDIATE' using errcode = 'LB002';
  end if;
end $$;

-- ═══ Privileges: every M4-A primitive is INTERNAL ══════════════════════════════
alter table public.licensed_bind_authority_intents enable row level security;
revoke all on table public.licensed_bind_authority_intents from public, anon, authenticated, service_role;

revoke all on function public.licensed_bind_v1_supported() from public, anon, authenticated, service_role;
revoke all on function public.licensed_bind_v1_decision_proof(uuid, uuid, integer, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.licensed_bind_v1_licence_proof(uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.licensed_bind_v1_survival_proof(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.licensed_bind_authority_recheck() from public, anon, authenticated, service_role;
revoke all on function public.licensed_bind_register_authority_deadline(timestamptz)
  from public, anon, authenticated, service_role;
