-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Workflow Instance Core — long-lived orchestration primitive (PR1)
--   ────────────────────────────────────────────────────────────────
--   A `run` is a SHORT-LIVED execution: claimed under a lease, reaped when the
--   lease expires, retried by attempt count, fenced on claim_id. Those semantics
--   are correct for something that lives for minutes inside one invocation.
--
--   A workflow INSTANCE is the opposite shape. Familje-Stundens monthly release
--   spans weeks and is mostly AT REST — waiting for an editor, waiting for a
--   release instant. Modelling it as a run would mean either a lease that never
--   expires (defeating the reaper) or a run that the reaper repeatedly requeues
--   (defeating the state). So this is a separate primitive, and automated actions
--   will later execute THROUGH ordinary runs rather than instead of them.
--
--   WHAT THIS MIGRATION IS NOT:
--     • Not an execution engine. Nothing here dispatches work, calls a provider,
--       or reaches another Supabase project. PR1 stores state and history.
--     • Not an approval system. `authorization_id` is a plain uuid column with
--       NO foreign key yet — the seam for atlas_authorizations, deliberately not
--       wired, so PR1 cannot quietly acquire approval semantics.
--     • Not a second graph engine. Transition LEGALITY (next_state,
--       failure_transition, prerequisites) lives in one place: the pure
--       TypeScript machine in lib/workflows/machine.ts. This schema owns only
--       what a pure function cannot: atomicity, compare-and-set against the
--       live state, terminal locking, append-only history, and a projection
--       that cannot drift because nothing else may write it.
--
--   THE PROJECTION RULE (locked). `workflow_instances.current_state` is a CACHE.
--   The authoritative history is `workflow_transitions`. The column is written
--   ONLY inside workflow_append_transition() in the same statement that appends
--   the row, and a trigger rejects every direct UPDATE that would move it any
--   other way. `workflow_projection_drift()` proves the two agree.
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Definitions ────────────────────────────────────────────────────────────
--
-- A definition VERSION is immutable. Principle 3: a definition change creates a
-- new version and must never mutate an active instance. UPDATE is rejected by
-- trigger; DELETE stays possible only while nothing references the row (the
-- instance FK is RESTRICT), which is the correct escape hatch for a definition
-- registered by mistake and never used.

create table if not exists public.workflow_defs (
  id          uuid primary key default gen_random_uuid(),
  def_key     text not null,
  version     integer not null,
  def_hash    text not null,
  spec        jsonb not null,
  created_at  timestamptz not null default now(),

  constraint workflow_defs_version_check check (version >= 1),
  constraint workflow_defs_hash_check    check (def_hash ~ '^[a-f0-9]{64}$'),
  constraint workflow_defs_key_check     check (def_key ~ '^[a-z0-9][a-z0-9._-]*$'),
  constraint workflow_defs_key_version_uniq unique (def_key, version),

  -- Composite target so an instance can pin all four identity fields through ONE
  -- declarative foreign key. Without this the instance's pinned version/hash
  -- would be denormalised data that application code has to keep honest.
  constraint workflow_defs_pin_uniq unique (id, def_key, version, def_hash)
);

-- Re-registering byte-identical content under a new version is a no-op dressed
-- as a change. Refuse it: a version bump must mean something.
create unique index if not exists workflow_defs_key_hash_idx
  on public.workflow_defs (def_key, def_hash);

-- ── 2. Instances ──────────────────────────────────────────────────────────────

create table if not exists public.workflow_instances (
  id            uuid primary key default gen_random_uuid(),

  -- Principle 3 — the instance pins the exact definition it was cut from.
  def_id        uuid    not null,
  def_key       text    not null,
  def_version   integer not null,
  def_hash      text    not null,

  project_id    uuid not null references public.projects(id) on delete restrict,

  -- One instance per definition per key ('2026-11'). Scoped to def_key, NOT
  -- def_id, so registering v2 cannot create a second live November.
  instance_key  text not null,

  -- PROJECTION of workflow_transitions. Never written except by
  -- workflow_append_transition(); see workflow_instances_guard_projection().
  current_state text not null,

  status        text not null default 'active',
  wake_at       timestamptz,          -- inert in PR1; the scheduler lands in PR3
  created_at    timestamptz not null default now(),
  closed_at     timestamptz,

  constraint workflow_instances_status_check
    check (status in ('active', 'complete', 'abandoned')),
  constraint workflow_instances_closed_check
    check ((status = 'active') = (closed_at is null)),
  constraint workflow_instances_key_uniq unique (def_key, instance_key),
  constraint workflow_instances_def_fk
    foreign key (def_id, def_key, def_version, def_hash)
    references public.workflow_defs (id, def_key, version, def_hash)
    on delete restrict
);

create index if not exists workflow_instances_project_idx
  on public.workflow_instances (project_id, status, created_at desc);

-- PR3's scheduler read. Present now so the tick has an index the day it exists.
create index if not exists workflow_instances_wake_idx
  on public.workflow_instances (wake_at)
  where status = 'active' and wake_at is not null;

-- ── 3. Transitions — the authoritative history ────────────────────────────────

create table if not exists public.workflow_transitions (
  id               uuid primary key default gen_random_uuid(),

  -- Monotonic per-table ordering. `occurred_at` alone cannot order two rows
  -- written in the same statement, and a random uuid tiebreaker would make the
  -- "latest transition" non-deterministic — which is exactly the value the
  -- projection is compared against. `seq` makes that comparison total.
  seq              bigint generated always as identity,

  instance_id      uuid not null references public.workflow_instances(id) on delete restrict,

  -- NULL only for the opening transition that creates the instance.
  from_state       text,
  to_state         text not null,

  -- Why the move happened, and who moved it. `actor` is free text in PR1
  -- ('system', an operator label); it becomes a principal reference when the
  -- authorization layer lands.
  reason           text not null,
  actor            text not null,

  evidence_ref     uuid,
  -- Seam for atlas_authorizations. NO foreign key in PR1 — adding one here would
  -- be integrating the approval layer, which this PR is not allowed to do.
  authorization_id uuid,

  -- A self-transition (planning -> planning on failure) is legal by design, so
  -- there is deliberately no from_state <> to_state constraint here.
  occurred_at      timestamptz not null default now()
);

create unique index if not exists workflow_transitions_history_idx
  on public.workflow_transitions (instance_id, seq);

-- Exactly one opening act per instance. Mirrors atlas_authorizations'
-- one-request index: it serialises concurrent openers in the database rather
-- than trusting two callers to agree.
create unique index if not exists workflow_transitions_one_start_idx
  on public.workflow_transitions (instance_id)
  where from_state is null;

-- ── 4. Evidence ───────────────────────────────────────────────────────────────
--
-- A verification result AT A POINT IN TIME. Append-only for the same reason the
-- transitions are: rewriting the record of a check that passed, after it stopped
-- passing, is precisely the failure this workflow exists to prevent.

create table if not exists public.workflow_evidence (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references public.workflow_instances(id) on delete restrict,
  state        text not null,
  check_key    text not null,
  result       text not null,
  source       text not null,
  detail       jsonb not null default '{}'::jsonb,
  recorded_at  timestamptz not null default now(),

  constraint workflow_evidence_result_check check (result in ('pass', 'fail', 'skipped')),
  -- 'automated'  — Omnira performed the check itself and owns the result.
  -- 'attested'   — a human ran it elsewhere (ffprobe, tsc, a click test) and
  --                reported the outcome. The distinction must survive in the
  --                record: an attested PASS is a different kind of fact.
  constraint workflow_evidence_source_check check (source in ('automated', 'attested'))
);

create index if not exists workflow_evidence_lookup_idx
  on public.workflow_evidence (instance_id, state, check_key, recorded_at desc);

-- ── 5. Append-only enforcement ────────────────────────────────────────────────
--
-- Enforced in the DATABASE, not only in TypeScript, so that no application bug
-- and no service-role caller can rewrite history. Same construction as
-- atlas_authorizations (20260819_atlas_authorizations.sql).

create or replace function public.workflow_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    '% is append-only: % is not permitted', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists workflow_transitions_no_update on public.workflow_transitions;
create trigger workflow_transitions_no_update
  before update on public.workflow_transitions
  for each row execute function public.workflow_reject_mutation();

drop trigger if exists workflow_transitions_no_delete on public.workflow_transitions;
create trigger workflow_transitions_no_delete
  before delete on public.workflow_transitions
  for each row execute function public.workflow_reject_mutation();

drop trigger if exists workflow_evidence_no_update on public.workflow_evidence;
create trigger workflow_evidence_no_update
  before update on public.workflow_evidence
  for each row execute function public.workflow_reject_mutation();

drop trigger if exists workflow_evidence_no_delete on public.workflow_evidence;
create trigger workflow_evidence_no_delete
  before delete on public.workflow_evidence
  for each row execute function public.workflow_reject_mutation();

-- A registered definition version is immutable (principle 3).
drop trigger if exists workflow_defs_no_update on public.workflow_defs;
create trigger workflow_defs_no_update
  before update on public.workflow_defs
  for each row execute function public.workflow_reject_mutation();

-- ── 6. Projection integrity ───────────────────────────────────────────────────
--
-- `current_state` may move ONLY to the to_state of the instance's newest
-- transition. This is not a permission flag that a caller could set — it is a
-- consistency proof evaluated against the authoritative history on every write,
-- so a direct UPDATE that invents a state fails even from service_role.

create or replace function public.workflow_instances_guard_projection()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare latest text;
begin
  if new.current_state is distinct from old.current_state then
    select t.to_state into latest
    from public.workflow_transitions t
    where t.instance_id = new.id
    order by t.seq desc
    limit 1;

    if latest is null or latest is distinct from new.current_state then
      raise exception
        'workflow_instances.current_state is a projection of workflow_transitions: '
        '% does not match the newest transition (%)', new.current_state, coalesce(latest, '<none>')
        using errcode = 'restrict_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workflow_instances_projection_guard on public.workflow_instances;
create trigger workflow_instances_projection_guard
  before update on public.workflow_instances
  for each row execute function public.workflow_instances_guard_projection();

-- Operational proof, callable at any time: every instance whose projection
-- disagrees with its own history. An empty result is the invariant holding.
create or replace function public.workflow_projection_drift()
returns table (instance_id uuid, projected text, derived text)
language sql
security definer
set search_path to ''
as $$
  select i.id, i.current_state, t.to_state
  from public.workflow_instances i
  left join lateral (
    select x.to_state from public.workflow_transitions x
    where x.instance_id = i.id order by x.seq desc limit 1
  ) t on true
  where t.to_state is distinct from i.current_state;
$$;
revoke all on function public.workflow_projection_drift() from public, anon, authenticated;
grant execute on function public.workflow_projection_drift() to service_role;

-- ── 7. Atomic writes ──────────────────────────────────────────────────────────
--
-- Two RPCs, following the shape the repository already uses for its critical
-- writes (claim_runs, request_run_cancel, set_project_execution_paused):
-- security definer, service_role only, one round trip, no partial state.

-- Create an instance AND its opening transition atomically. Doing this in two
-- client calls would leave a window in which an instance exists with no history
-- — the exact condition the projection guard is meant to make unreachable.
create or replace function public.workflow_instantiate(
  p_def_id       uuid,
  p_project_id   uuid,
  p_instance_key text,
  p_initial_state text,
  p_actor        text,
  p_reason       text
) returns public.workflow_instances
language plpgsql
security definer
set search_path to ''
as $$
declare
  d public.workflow_defs;
  i public.workflow_instances;
begin
  select * into d from public.workflow_defs where id = p_def_id;
  if not found then
    raise exception 'workflow_instantiate: unknown definition %', p_def_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Membership check only. Graph legality (which state may follow which) is the
  -- TypeScript machine's job and is deliberately not duplicated here.
  if not exists (
    select 1 from jsonb_array_elements(d.spec -> 'states') s
    where s ->> 'id' = p_initial_state
  ) then
    raise exception 'workflow_instantiate: state "%" is not declared by % v%',
      p_initial_state, d.def_key, d.version
      using errcode = 'check_violation';
  end if;

  insert into public.workflow_instances (
    def_id, def_key, def_version, def_hash, project_id, instance_key, current_state
  ) values (
    d.id, d.def_key, d.version, d.def_hash, p_project_id, p_instance_key, p_initial_state
  ) returning * into i;

  insert into public.workflow_transitions (instance_id, from_state, to_state, reason, actor)
  values (i.id, null, p_initial_state, p_reason, p_actor);

  return i;
end;
$$;
revoke all on function public.workflow_instantiate(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.workflow_instantiate(uuid, uuid, text, text, text, text)
  to service_role;

-- Append one transition. The compare-and-set on `p_from_state` is the whole
-- point: two concurrent drainers, two browser tabs, or a retried HTTP request
-- cannot both advance the same instance. The loser sees 0 rows and raises,
-- rather than silently double-advancing a release.
create or replace function public.workflow_append_transition(
  p_instance_id      uuid,
  p_from_state       text,
  p_to_state         text,
  p_reason           text,
  p_actor            text,
  p_evidence_ref     uuid default null,
  p_authorization_id uuid default null
) returns public.workflow_transitions
language plpgsql
security definer
set search_path to ''
as $$
declare
  i        public.workflow_instances;
  t        public.workflow_transitions;
  d_spec   jsonb;
  terminal boolean;
begin
  -- Lock the instance for the duration: the CAS, the append and the projection
  -- update are one serialised unit per instance.
  select * into i from public.workflow_instances where id = p_instance_id for update;
  if not found then
    raise exception 'workflow_append_transition: unknown instance %', p_instance_id
      using errcode = 'foreign_key_violation';
  end if;

  if i.status <> 'active' then
    raise exception 'workflow_append_transition: instance % is % and accepts no further transitions',
      p_instance_id, i.status
      using errcode = 'restrict_violation';
  end if;

  -- Compare-and-set. NULL from_state is rejected here: the opening transition is
  -- written only by workflow_instantiate, and the partial unique index backs that up.
  if p_from_state is null then
    raise exception 'workflow_append_transition: from_state is required (the opening transition belongs to workflow_instantiate)'
      using errcode = 'check_violation';
  end if;
  if i.current_state is distinct from p_from_state then
    raise exception 'workflow_append_transition: stale transition — instance % is in "%" not "%"',
      p_instance_id, i.current_state, p_from_state
      using errcode = 'serialization_failure';
  end if;

  select spec into d_spec from public.workflow_defs where id = i.def_id;
  if not exists (
    select 1 from jsonb_array_elements(d_spec -> 'states') s where s ->> 'id' = p_to_state
  ) then
    raise exception 'workflow_append_transition: state "%" is not declared by % v%',
      p_to_state, i.def_key, i.def_version
      using errcode = 'check_violation';
  end if;

  insert into public.workflow_transitions (
    instance_id, from_state, to_state, reason, actor, evidence_ref, authorization_id
  ) values (
    p_instance_id, p_from_state, p_to_state, p_reason, p_actor, p_evidence_ref, p_authorization_id
  ) returning * into t;

  -- Terminal = the declared state has no successor. A lookup in the pinned spec,
  -- not a second copy of the graph rules.
  select coalesce(
    (select (s -> 'next_state') = 'null'::jsonb or s -> 'next_state' is null
     from jsonb_array_elements(d_spec -> 'states') s where s ->> 'id' = p_to_state),
    false
  ) into terminal;

  update public.workflow_instances set
    current_state = p_to_state,
    status        = case when terminal then 'complete' else status end,
    closed_at     = case when terminal then now() else closed_at end
  where id = p_instance_id;

  return t;
end;
$$;
revoke all on function public.workflow_append_transition(uuid, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.workflow_append_transition(uuid, text, text, text, text, uuid, uuid)
  to service_role;

-- ── 8. Row-level security ─────────────────────────────────────────────────────
--
-- Service-role only, matching atlas_authorizations and atlas_intelligence. User
-- access is mediated server-side; there is no direct client path to these tables.

alter table public.workflow_defs        enable row level security;
alter table public.workflow_instances   enable row level security;
alter table public.workflow_transitions enable row level security;
alter table public.workflow_evidence    enable row level security;

revoke all on public.workflow_defs        from anon, authenticated;
revoke all on public.workflow_instances   from anon, authenticated;
revoke all on public.workflow_transitions from anon, authenticated;
revoke all on public.workflow_evidence    from anon, authenticated;

-- Explicit rather than inherited. atlas_authorizations relies on Supabase's
-- default grants and has never been written to in production, so "it works for
-- the ledgers" is not evidence. The store reaches these tables through PostgREST
-- with the service-role key; say so in the schema instead of assuming it.
grant select, insert on public.workflow_defs        to service_role;
grant select, insert on public.workflow_transitions to service_role;
grant select, insert on public.workflow_evidence    to service_role;
-- Instances additionally need UPDATE: the projection and the terminal close are
-- writes. Every such write still has to satisfy the projection guard.
grant select, insert, update on public.workflow_instances to service_role;

comment on table public.workflow_defs is
  'Versioned, immutable workflow definitions. UPDATE is rejected by trigger; a change is a new version. def_hash is SHA-256 over the deterministically normalised spec.';
comment on table public.workflow_instances is
  'Long-lived workflow orchestration, one per (def_key, instance_key). Pins def id/version/hash through one composite FK. current_state is a PROJECTION of workflow_transitions, guarded by workflow_instances_guard_projection().';
comment on table public.workflow_transitions is
  'Authoritative append-only state history. UPDATE and DELETE rejected by trigger. seq gives a total per-instance order. authorization_id is the (unwired) seam for atlas_authorizations.';
comment on table public.workflow_evidence is
  'Append-only verification records. source distinguishes a check Omnira performed (automated) from one a human ran elsewhere and reported (attested).';
