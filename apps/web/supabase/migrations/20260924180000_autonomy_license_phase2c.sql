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
  -- Database-assigned total order. The ledger is read by time, but a monotonic
  -- cursor is what makes two same-instant events orderable at all.
  event_seq                bigint generated always as identity unique,

  -- The licence aggregate. NOT supplied by a caller for an existing licence —
  -- it is the key the chain is read back by, and it carries no authority of its
  -- own; every authority fact below is derived or proven server-side.
  license_id               uuid not null,

  -- Lineage position. Contiguous from 0, and unique per licence: a second act
  -- claiming the same generation FAILS rather than both becoming canonical.
  -- This is the concurrency mechanism (Ruling 7) — never timestamp ordering,
  -- which cannot distinguish two acts stamped in the same millisecond.
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

  created_at               timestamptz not null default now(),

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

-- The serialization index. Two acts derived from the same lineage state claim
-- the same generation, and one of them loses here rather than both landing.
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

  -- The lineage is serialized here. `for update` on the existing chain, then the
  -- max generation read under that lock; the unique index is what actually
  -- decides, so two concurrent acts on the same state cannot both commit.
  perform 1 from public.atlas_autonomy_license_events
   where license_id = p_license_id
   for update;

  select coalesce(max(license_generation) + 1, 0) into v_generation
    from public.atlas_autonomy_license_events
   where license_id = p_license_id;

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
    -- ── ISSUED: prove the immutable facts about the pinned decision ───────
    -- The structural half of the decision check. Whether it is CURRENTLY
    -- GOVERNING is proven in TypeScript against Chapter 11's own fold; this
    -- refuses a record whose decision does not exist, belongs elsewhere, or was
    -- never an autonomy decision.
    if not exists (
      select 1 from public.atlas_decision_ledger
       where decision_id = p_decision_id
         and record_id = p_decision_record_id
         and version = p_decision_version
    ) then
      raise exception 'pinned decision act does not exist' using errcode = 'P0002';
    end if;

    if exists (
      select 1 from public.atlas_decision_ledger
       where decision_id = p_decision_id
         and (project_id <> p_project_id
              or not (materiality @> '["autonomy"]'::jsonb))
    ) then
      raise exception 'the authorizing decision is not a same-project autonomy decision'
        using errcode = '22023';
    end if;

    if not exists (select 1 from public.workflow_instances where id = p_workflow_instance_id) then
      raise exception 'workflow instance % does not exist', p_workflow_instance_id
        using errcode = 'P0002';
    end if;
  else
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
  uuid, text, uuid, uuid, text, text, text, text[], text, uuid, integer, uuid,
  timestamptz, timestamptz, uuid, text, text
) is
  'The ONLY write path for the autonomy licence ledger. Serializes the lineage by generation, '
  'refuses an act after a terminal one, refuses any continuing act that widens level, actions or '
  'window, and re-proves the immutable facts about the authorizing decision. Whether that '
  'decision is CURRENTLY governing is proven in TypeScript against Chapter 11''s own fold, which '
  'this function deliberately does not re-implement.';

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
  uuid, text, uuid, uuid, text, text, text, text[], text, uuid, integer, uuid,
  timestamptz, timestamptz, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.autonomy_license_append(
  uuid, text, uuid, uuid, text, text, text, text[], text, uuid, integer, uuid,
  timestamptz, timestamptz, uuid, text, text
) to service_role;

revoke all on sequence public.atlas_autonomy_license_events_event_seq_seq
  from public, anon, authenticated, service_role;

-- The trigger function is machinery, not an API.
revoke all on function public.atlas_autonomy_license_events_append_only()
  from public, anon, authenticated, service_role;
