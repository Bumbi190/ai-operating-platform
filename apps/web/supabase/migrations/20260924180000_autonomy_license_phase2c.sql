-- 20260924180000_autonomy_license_phase2c.sql
--
-- Chapter 18 Autonomy Licensing — Phase 2C: the canonical durable source of
-- licensed autonomy.
--
-- §18.2: "Executive Intelligence may recommend higher autonomy. Executive
-- Intelligence may not grant itself higher autonomy." §18.247: "No system
-- component may grant itself more authority."
--
-- ── WHAT THIS MIGRATION DOES NOT DO ────────────────────────────────────────
-- It grants nothing and enforces nothing at run time. No executor, gate,
-- provider, spend boundary or scheduler reads this table in Phase 2C. The
-- table is a RECORD of a human licensing decision, and the read model that
-- interprets it (`lib/atlas/autonomy-license/`) is inert by construction. The
-- composition of a licence with the rest of the authority chain is a later,
-- separately reviewed phase.
--
-- ── WHY AN APPEND-ONLY LEDGER AND NOT A CURRENT-ROW TABLE ──────────────────
-- §18.274 requires Omnira to "preserve every grant, renewal, restriction,
-- suspension, and revocation". A mutable status column destroys the evidence
-- that the earlier state existed; a fold over immutable events cannot. The
-- current licence is DERIVED, never stored.
--
-- ── THE DECISION-CHECK SPLIT (deliberate, and load-bearing) ────────────────
-- Two different facts are proven in two different places, and neither
-- re-implements the other:
--
--   • THIS FILE proves the IMMUTABLE STRUCTURAL facts about the pinned
--     decision — that it exists, that it belongs to the same project, and that
--     its declared materiality includes 'autonomy'. Each is a single-row read
--     on an immutable table.
--
--   • `lib/atlas/autonomy-license/issue.ts` proves whether the decision is
--     CURRENTLY GOVERNING, using Chapter 11's own lifecycle fold
--     (`deriveDecisionState`) through the pure core.
--
-- The fold is deliberately NOT re-implemented in SQL. A second implementation
-- of Chapter 11's lifecycle — a dozen record types, generation ordering,
-- effective dates, expiry — would be a duplicate authority truth that drifts
-- from the real one, and the whole point of pointing the licence at the
-- Decision Ledger is that there is ONE answer to "does this decision govern?".

-- ── 1. The licence event ledger ────────────────────────────────────────────

create table if not exists public.atlas_autonomy_license_events (
  event_id                 uuid primary key default gen_random_uuid(),
  -- The database's monotonic cursor and the deterministic TOTAL order across
  -- every event. It is NOT the authority on lineage order — `license_generation`
  -- is — but it breaks the only tie generation can leave and makes two
  -- same-instant events orderable at all. `occurred_at` is audit evidence and
  -- never decides order.
  event_seq                bigint generated always as identity unique,

  -- The licence aggregate. NOT supplied by a caller for an existing licence —
  -- it is the key the chain is read back by, and it carries no authority of its
  -- own; every authority fact below is derived or proven server-side.
  license_id               uuid not null,

  -- Lineage position, and the CAUSAL order the reader folds in: generation 1
  -- was derived from generation 0 and can be nothing else.
  --
  -- Contiguous from 0, and unique per licence: a second act claiming the same
  -- generation FAILS rather than both becoming canonical.
  --
  -- That uniqueness is DEFENCE IN DEPTH, not the concurrency authority. It
  -- cannot see a stale read: a caller that read the chain before another act
  -- committed asks for the NEXT generation, never one that already exists, so
  -- the index is never given the chance to fire. What actually serializes two
  -- humans on one licence state is the writer's comparison of the caller's
  -- OBSERVED generation against the locked truth (SQLSTATE 40001, nothing
  -- written) — see `autonomy_license_append` below.
  --
  -- Ordering is never by timestamp (Ruling 7), which cannot distinguish two
  -- acts stamped in the same millisecond and which a clock correction could
  -- reorder against the acts it was derived from.
  license_generation       integer not null,

  act                      text not null,

  -- The subject (§18.4/§18.21/§18.22). Immutable across a lineage: an act that
  -- named a different project or instance would be a second grant smuggled
  -- into a narrowing act, and the RPC refuses it.
  project_id               uuid not null references public.projects (id) on delete restrict,
  workflow_instance_id     uuid not null references public.workflow_instances (id) on delete restrict,
  bound_def_key            text not null,
  bound_def_hash           text not null,

  -- What is licensed. The level is Chapter 18's; the action kinds are the
  -- workflow engine's existing closed registry names. NOT an ActionClass —
  -- §18.18: "An autonomy level describes the category of authority. The license
  -- defines the actual scope."
  licensed_level           text not null,
  allowed_action_kinds     text[] not null,
  -- `canonicalTargetVersionHash` over the load-bearing registry facts at issue
  -- time. Recomputed at read time: a difference means the registry was
  -- reclassified and the licence no longer describes what it permitted
  -- (§18.60), which resolves to L0 WITHOUT touching this row.
  action_scope_fingerprint text not null,

  -- The institutional provenance (Ruling 2). EXISTING ledger identity — the
  -- immutable record_id and version of the governing decision act — not a
  -- second hash invented here.
  decision_id              uuid not null,
  decision_version         integer not null,
  decision_record_id       uuid not null,

  effective_at             timestamptz not null,
  expires_at               timestamptz not null,

  superseded_by_license_id uuid,

  reason                   text,
  -- Server-derived from the authenticated operator session, never a request
  -- body, and constrained below to the canonical human shape.
  actor                    text not null,

  -- When the event happened. Named `occurred_at` — the vocabulary
  -- `LicenseEvent.occurredAt` and the rest of the repo's event ledgers use — so
  -- the column the TypeScript store selects is the column this table has.
  -- Audit evidence only: it is NOT the authority ordering, which is
  -- `license_generation` (the column above), not any index and not the clock.
  occurred_at              timestamptz not null default now(),

  constraint atlas_autonomy_license_events_act_valid
    check (act in (
      'LICENSE_ISSUED', 'LICENSE_RESTRICTED', 'LICENSE_SUSPENDED',
      'LICENSE_REVOKED', 'LICENSE_SUPERSEDED'
    )),

  -- §18.10's seven levels. A closed vocabulary: a free-text level would be a
  -- grant no reader could compare.
  constraint atlas_autonomy_license_events_level_valid
    check (licensed_level in ('L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6')),

  -- A licence that permits nothing is not a licence (§18.272: "Every license
  -- must define allowed and forbidden actions"), so the empty set is refused
  -- structurally rather than left to a future reader to interpret.
  constraint atlas_autonomy_license_events_actions_present
    check (cardinality(allowed_action_kinds) > 0),

  -- A real forward window. §18.44/§18.45: duration and expiration are part of
  -- the licence, and "no expiry" is not an admissible value here — §18.274
  -- requires Omnira to "expire temporary authority safely", which an
  -- open-ended grant cannot do. There is deliberately no NULL branch.
  constraint atlas_autonomy_license_events_window_ordered
    check (expires_at > effective_at),

  -- Only a supersession names a replacement, and it must name one.
  constraint atlas_autonomy_license_events_supersession_shape
    check ((act = 'LICENSE_SUPERSEDED') = (superseded_by_license_id is not null)),

  -- ── Representation invariants ─────────────────────────────────────────
  -- Facts the ledger already assumes, stated structurally so a malformed row
  -- cannot become history. These are REPRESENTATION only: no authority policy
  -- lives here, because authority is decided in TypeScript against Chapter 11's
  -- own fold and in the RPC below.
  constraint atlas_autonomy_license_events_generation_non_negative
    check (license_generation >= 0),
  constraint atlas_autonomy_license_events_decision_version_positive
    check (decision_version >= 1),
  -- Both hashes are the repository's canonical sha256 shape. A shorter or
  -- non-hex value could not have come from `canonicalTargetVersionHash`, so
  -- accepting one would let a row look pinned while pinning nothing.
  constraint atlas_autonomy_license_events_def_hash_shape
    check (bound_def_hash ~ '^[0-9a-f]{64}$'),
  constraint atlas_autonomy_license_events_scope_fingerprint_shape
    check (action_scope_fingerprint ~ '^[0-9a-f]{64}$'),
  -- No NULL element may hide inside the licensed set. A NULL would make
  -- `cardinality(allowed_action_kinds) > 0` true while the set is meaningless,
  -- and every read-side comparison would silently treat it as an unknown kind.
  constraint atlas_autonomy_license_events_action_kinds_non_null
    check (array_position(allowed_action_kinds, null) is null),

  -- The same canonical human-identity shape the survival funding ledger uses:
  -- the version nibble must be 1–5 and the variant nibble 8, 9, a or b. A loose
  -- hex pattern would accept bit patterns no generator in this repository can
  -- produce, so the ledger could look like it recorded a real authenticated
  -- human while naming one that cannot exist.
  --
  -- This does NOT replace `resolvePlatformOperator()`; that remains the
  -- authority boundary. It removes the ledger's ABILITY to claim a
  -- machine-shaped actor even if some future caller tried — §18.47's "The
  -- workflow may not approve its own license" is a property of the record too.
  constraint atlas_autonomy_license_events_actor_human_identity
    check (actor ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);

-- Structural uniqueness of a lineage position, and defence in depth against a
-- duplicate literal generation. This index is NOT what serializes two humans on
-- one licence state: a caller whose read went stale claims the FOLLOWING
-- generation, so nothing here ever collides and no error is raised. That race is
-- refused by `autonomy_license_append`'s observed-generation comparison instead.
create unique index if not exists atlas_autonomy_license_events_generation_idx
  on public.atlas_autonomy_license_events (license_id, license_generation);

create index if not exists atlas_autonomy_license_events_instance_idx
  on public.atlas_autonomy_license_events (workflow_instance_id, event_seq);

create index if not exists atlas_autonomy_license_events_seq_idx
  on public.atlas_autonomy_license_events (event_seq desc);

comment on table public.atlas_autonomy_license_events is
  'Append-only Chapter 18 autonomy licence lineage. The current licence is DERIVED by folding '
  'these events; there is no mutable current row and no status column. Phase 2C records the '
  'licence truth only — nothing executes against it.';

-- ── 2. Append-only, structurally ───────────────────────────────────────────
--
-- A ledger its own writer can rewrite is not a ledger. Triggers rather than
-- convention, for the same reason the survival funding ledger uses them.

create or replace function public.atlas_autonomy_license_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'atlas_autonomy_license_events is append-only (attempted %)', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists atlas_autonomy_license_events_no_mutation on public.atlas_autonomy_license_events;
create trigger atlas_autonomy_license_events_no_mutation
  before update or delete on public.atlas_autonomy_license_events
  for each row execute function public.atlas_autonomy_license_events_append_only();

drop trigger if exists atlas_autonomy_license_events_no_truncate on public.atlas_autonomy_license_events;
create trigger atlas_autonomy_license_events_no_truncate
  before truncate on public.atlas_autonomy_license_events
  for each statement execute function public.atlas_autonomy_license_events_append_only();

-- ── 3. The one licensing write boundary ────────────────────────────────────

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

comment on function public.autonomy_license_append(
  uuid, integer, text, uuid, uuid, text, text, text, text[], text, uuid, integer, uuid,
  timestamptz, timestamptz, uuid, text, text
) is
  'The ONLY write path for the autonomy licence ledger. Serializes the lineage by generation and '
  'refuses any act whose caller-observed p_expected_generation no longer matches the locked truth '
  '(SQLSTATE 40001, nothing written) — that optimistic-concurrency check, not the unique index, is '
  'what stops two humans acting on the same licence state from both committing. It also '
  'refuses an act after a terminal one, admits ONLY revocation or supersession after a '
  'suspension, refuses any continuing act that widens level, actions or window, and proves on issue '
  'that the licence subject is the workflow instance''s OWN project/def_key/def_hash and that the '
  'pinned decision record says exactly what the licence claims. Whether that decision is '
  'CURRENTLY governing is proven in TypeScript against Chapter 11''s own fold, which this function '
  'deliberately does not re-implement. The actor-shape CHECK is defence in depth, NOT proof of '
  'platform-operator authority: that authority is resolvePlatformOperator() in the application.';

-- ── 4. Server-only reachability ────────────────────────────────────────────
--
-- RLS on with ZERO policies, and every role's privilege revoked. `select` to
-- service_role is what lets the read model and the fold load the chain; there is
-- deliberately no INSERT/UPDATE/DELETE grant to ANY role, including
-- service_role — the SECURITY DEFINER function above is the only writer.

alter table public.atlas_autonomy_license_events enable row level security;

revoke all on table public.atlas_autonomy_license_events from public, anon, authenticated, service_role;
grant select on table public.atlas_autonomy_license_events to service_role;

revoke all on function public.autonomy_license_append(
  uuid, integer, text, uuid, uuid, text, text, text, text[], text, uuid, integer, uuid,
  timestamptz, timestamptz, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.autonomy_license_append(
  uuid, integer, text, uuid, uuid, text, text, text, text[], text, uuid, integer, uuid,
  timestamptz, timestamptz, uuid, text, text
) to service_role;

revoke all on sequence public.atlas_autonomy_license_events_event_seq_seq
  from public, anon, authenticated, service_role;

-- The trigger function is machinery, not an API.
revoke all on function public.atlas_autonomy_license_events_append_only()
  from public, anon, authenticated, service_role;
