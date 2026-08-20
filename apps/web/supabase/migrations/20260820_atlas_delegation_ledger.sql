-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Delegation Envelope V1 — append-only Executive → Manager handoff
--   ────────────────────────────────────────────────────────────────
--   EI-S1.4C. Implements the FM.2 Stage 1 requirement "Executive → Manager
--   Bounded Handoff" as the canonical Chapter 21 delegation record.
--
--   "Delegation is not instruction. It is the transfer of BOUNDED authority."
--   (§21.12)
--
--   Each row is one immutable act in a delegation's lineage. Current status is
--   DERIVED from the lineage in application code and is never stored as a
--   mutable column. One derived status — `invalidated` — is not even a function
--   of this table: an envelope is invalidated when its PARENT MISSION stops
--   authorizing it (§21.27), which is a live question about another record. No
--   column here could hold it honestly and none tries.
--
--   WHY A DEDICATED TABLE:
--     • manager_tasks is operational coordination with a NULLABLE project and a
--       MUTABLE status. A delegation carries attenuated authority, inherited
--       prohibitions and a pinned mission version; storing that where any
--       writer can UPDATE the row, and where project scope may be null, would
--       be a security regression against §6.117 project isolation.
--     • agent_messages is inter-agent chat: free-text `content` plus an untyped
--       `metadata` jsonb, with no immutability and no structural constraints. A
--       bounded contract stored as a chat message is a bounded contract that
--       anyone can rewrite, and §21.18 requires the opposite.
--     • atlas_mission_ledger records the MISSION. Folding delegation acts into
--       that lineage would corrupt `lifecycle_generation`, whose optimistic
--       concurrency invariant counts mission lifecycle acts — a Manager's
--       acceptance is not a mission transition and must not consume a mission
--       generation. §20.7's separation of concerns applies here too: this table
--       REFERENCES a mission version; it never duplicates or mutates one, and
--       the mission ledger schema is untouched by this migration.
--     • atlas_decision_ledger records institutional decisions. §21.18 — a
--       delegation is not a decision and an acceptance is not an authorization.
--       Nothing in this migration writes to either.
--
--   THE ENVELOPE IS PINNED, NOT LIVE. `mission_version` and `mission_bound_hash`
--   record the exact Mission version an envelope was cut from, and they are
--   immutable like every other column. §21.15 — acceptance of version N must
--   never float to N+1, so the pin is stored rather than re-derived, and the
--   application compares it to the live Mission on every prepare, decide,
--   replan and read. The hash is over the DELEGABLE bounds only (authority,
--   actions, tools, data, scope, budget, deadline, gates), so an editorial
--   amendment does not spuriously invalidate live delegations while every
--   change that moves a bound does.
--
--   IMMUTABILITY IS ENFORCED IN THE DATABASE. §21.18 — a two-sided contract
--   whose terms can be edited after acceptance is not a contract. The reject
--   triggers below make UPDATE and DELETE impossible on this table, so an
--   accepted envelope cannot be widened after the fact even by a caller holding
--   the service role.
--
--   ACTORS ARE DISTINCT AND SERVER-DERIVED. §21.19 — `actor_kind` separates the
--   Executive principal (a human, recorded by user id), the Manager (a constant
--   agent identity, never a borrowed user id) and the system. The application
--   sets these; no caller supplies them. Conflating the three is how fake
--   provenance enters a ledger.
--
--   NOTHING HERE EXECUTES ANYTHING. `tools` inside the envelope jsonb is a
--   §21.13 MAXIMUM BOUND, not permission to invoke anything, and this migration
--   creates no queue, no task, no trigger that dispatches work, and no path to
--   any runner, publisher or external API.
--
--   DEPLOYMENT ORDER IS DELIBERATE. This file is committed BEFORE it is applied,
--   so apps/web/scripts/check-migrations.mjs will correctly fail a Vercel build
--   until a separately authorized rollout applies it — deployment blocked by
--   design. That failure must not be bypassed, grandfathered, or dodged by
--   moving this file to the legacy repo-root directory.
--   Derived ledger name: `atlas_delegation_ledger`.
--
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.atlas_delegation_ledger (
  -- Identity of one immutable act.
  record_id           uuid primary key default gen_random_uuid(),

  -- Stable envelope identity. Like §20.25 for missions: the identifier does not
  -- change as the delegation is decided; every act shares this lineage key.
  envelope_id         uuid not null,

  -- §6.117 — project isolation. NOT NULL and never widened by a caller: the
  -- application takes it from the Mission's own recorded scope. The contrast
  -- with manager_tasks.project_id (nullable) is the point.
  project_id          uuid not null references public.projects(id) on delete restrict,

  --   delegation.prepared | delegation.accepted | delegation.rejected
  --   delegation.revoked  | delegation.replan.operational
  --   delegation.replan.referred
  act_type            text not null
    constraint atlas_delegation_ledger_act_type_check check (act_type in (
      'delegation.prepared',
      'delegation.accepted',
      'delegation.rejected',
      'delegation.revoked',
      'delegation.replan.operational',
      'delegation.replan.referred'
    )),

  occurred_at         timestamptz not null default now(),

  -- ── The pin (§21.15) ────────────────────────────────────────────────────────
  -- WHICH mission, WHICH version, and WHAT that version said about the bounds
  -- this envelope was cut from.
  mission_id          uuid not null,
  mission_version     integer not null
    constraint atlas_delegation_ledger_mission_version_check check (mission_version >= 1),
  mission_bound_hash  text not null
    constraint atlas_delegation_ledger_bound_hash_check check (mission_bound_hash ~ '^[0-9a-f]{64}$'),

  -- ── The envelope (§21.12) ───────────────────────────────────────────────────
  -- Present on `delegation.prepared` and null on every later act: the envelope
  -- is stated once and never restated, so no later row can quietly disagree
  -- with it. The structure is the DelegationEnvelope in
  -- lib/atlas/delegation/types.ts — objective, deliverables, success criteria,
  -- scope, authority, allowed/forbidden actions, tools, data scope, budget,
  -- deadline, constraints, approval gates, escalation triggers, stop
  -- conditions, reporting and dependencies. Deliberately NOT a prompt string: a
  -- string cannot be checked for containment against its parent.
  envelope            jsonb,

  -- §21.17 — typed refusal grounds. Always structured, never free text: an
  -- Executive cannot act on "didn't work", and an untyped refusal cannot be
  -- tested. Empty on every act that is not a rejection.
  rejections          jsonb not null default '[]',

  -- §21.20–§21.26 — the replanning classification, on the two replan acts only.
  -- Records `changeClass`, the specific bounds `exceeded`, and a summary.
  replan              jsonb,

  -- ── Provenance (§21.19) ─────────────────────────────────────────────────────
  -- Server-derived on every write. `executive_principal` carries the acting
  -- human's user id; `manager` carries the Manager's own constant identity and
  -- NEVER the id of whichever human asked it to decide; `system` is neither.
  actor_kind          text not null
    constraint atlas_delegation_ledger_actor_kind_check check (actor_kind in (
      'executive_principal', 'manager', 'system'
    )),
  actor_id            text,

  note                text,

  -- §21.27 — why an envelope stopped being usable, on revocation only.
  revoked_reason      text
    constraint atlas_delegation_ledger_revoked_reason_check check (
      revoked_reason is null or revoked_reason in (
        'executive_withdrew',
        'mission_no_longer_authorizes',
        'mission_amended',
        'mission_superseded'
      )
    ),

  -- ── Shape invariants ────────────────────────────────────────────────────────
  -- The envelope belongs to the preparing act and to no other. Enforced here as
  -- well as in the pure core, because a row inserted by any other path must
  -- still be unable to introduce a second, divergent envelope.
  constraint atlas_delegation_ledger_envelope_shape_check check (
    (act_type = 'delegation.prepared' and envelope is not null)
    or (act_type <> 'delegation.prepared' and envelope is null)
  ),

  -- A revocation reason is exactly as meaningful as the revocation it explains.
  constraint atlas_delegation_ledger_revocation_shape_check check (
    (act_type = 'delegation.revoked' and revoked_reason is not null)
    or (act_type <> 'delegation.revoked' and revoked_reason is null)
  ),

  -- §21.24 — a replan act without its classification would be a referral that
  -- names nothing, which is exactly the silence §20.87 forbids.
  constraint atlas_delegation_ledger_replan_shape_check check (
    (act_type in ('delegation.replan.operational', 'delegation.replan.referred') and replan is not null)
    or (act_type not in ('delegation.replan.operational', 'delegation.replan.referred') and replan is null)
  ),

  -- §21.17 — a rejection states its grounds. An empty-grounds rejection would
  -- be an untyped refusal wearing a typed column.
  constraint atlas_delegation_ledger_rejection_shape_check check (
    act_type <> 'delegation.rejected' or jsonb_array_length(rejections) > 0
  ),

  -- §21.19 — a human act names its human; the Manager names itself. A row that
  -- claims an Executive acted without saying who is unattributable authority.
  constraint atlas_delegation_ledger_actor_shape_check check (
    actor_kind <> 'executive_principal' or actor_id is not null
  )
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary read: the ordered lineage of one envelope. Matches the pure core's
-- canonical order (occurred_at, then record_id).
create index if not exists atlas_delegation_ledger_lineage_idx
  on public.atlas_delegation_ledger (envelope_id, occurred_at, record_id);

-- Project audit listing.
create index if not exists atlas_delegation_ledger_project_idx
  on public.atlas_delegation_ledger (project_id, occurred_at desc);

-- Every delegation cut from one mission — the Executive's view of what it has
-- handed out, and the lookup used when a mission is amended or superseded.
create index if not exists atlas_delegation_ledger_mission_idx
  on public.atlas_delegation_ledger (mission_id, occurred_at desc);

-- ── Decision serialization ────────────────────────────────────────────────────
-- The write boundary folds every prospective lineage through the pure core
-- BEFORE it appends, so a semantically invalid act never reaches this table.
-- What pure validation cannot do is serialize two writers who each read the
-- same `prepared` state and each produce an individually valid candidate — an
-- acceptance and a rejection, or two acceptances. Appended together those form
-- a history the pure core would then refuse to read, and on an append-only
-- table that is permanent.
--
-- The invariant is simpler than the mission ledger's because a delegation has
-- no generation counter to advance: an envelope is prepared once, decided once,
-- and revoked at most once. Three partial unique indexes state exactly that.
-- The loser of any race gets a unique violation (23505), which the store
-- surfaces as `conflict`, and no row is written.
--
-- Replan acts are deliberately NOT serialized: they annotate an accepted
-- delegation without deciding anything, and two classifications recorded in the
-- same millisecond make no history less safe.

create unique index if not exists atlas_delegation_ledger_one_prepared_idx
  on public.atlas_delegation_ledger (envelope_id)
  where act_type = 'delegation.prepared';

create unique index if not exists atlas_delegation_ledger_one_decision_idx
  on public.atlas_delegation_ledger (envelope_id)
  where act_type in ('delegation.accepted', 'delegation.rejected');

create unique index if not exists atlas_delegation_ledger_one_revocation_idx
  on public.atlas_delegation_ledger (envelope_id)
  where act_type = 'delegation.revoked';

-- ── Append-only enforcement (§21.18) ──────────────────────────────────────────
-- A two-sided contract whose terms can move after acceptance is not a contract.
-- History is immutable: a changed delegation is a NEW envelope prepared from
-- the mission, never an edit to this one.

create or replace function public.atlas_delegation_ledger_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'atlas_delegation_ledger is append-only: % is not permitted on delegation history', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists atlas_delegation_ledger_no_update on public.atlas_delegation_ledger;
create trigger atlas_delegation_ledger_no_update
  before update on public.atlas_delegation_ledger
  for each row execute function public.atlas_delegation_ledger_reject_mutation();

drop trigger if exists atlas_delegation_ledger_no_delete on public.atlas_delegation_ledger;
create trigger atlas_delegation_ledger_no_delete
  before delete on public.atlas_delegation_ledger
  for each row execute function public.atlas_delegation_ledger_reject_mutation();

-- ── Row-level security ────────────────────────────────────────────────────────
-- Service-role only, matching atlas_authorizations, atlas_decision_ledger and
-- atlas_mission_ledger. User access is mediated by the server-side
-- principal-scoped boundary in lib/atlas/delegation/, which proves project
-- ownership from the lineage's own recorded scope before returning anything,
-- and which collapses unknown and foreign envelopes into one indistinguishable
-- denial so the boundary cannot become an existence oracle (§6.117).

alter table public.atlas_delegation_ledger enable row level security;
revoke all on public.atlas_delegation_ledger from anon, authenticated;

comment on table public.atlas_delegation_ledger is
  'Delegation Envelope V1 — append-only Executive to Manager handoff (Ch21). '
  'One row per immutable act in a delegation lineage; status is derived, never stored. '
  'Pins an exact mission version (mission_version + mission_bound_hash); acceptance never floats to a later version (s21.15). '
  'Authority is attenuated, never widened (s6.39): downstream bounds are a subset and inherited prohibitions cannot be dropped. '
  'The envelope''s tool list is a maximum bound, not permission to execute (s21.13); nothing in this schema dispatches work. '
  'Service-role only; UPDATE and DELETE are rejected by trigger. '
  'See docs/architecture/executive-intelligence/ and canonical Ch 21.';
