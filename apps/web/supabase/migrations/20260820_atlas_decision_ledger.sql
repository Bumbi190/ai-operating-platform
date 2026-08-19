-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Atlas Chapter 11 Decision Ledger V1 — append-only institutional history
--   ─────────────────────────────────────────────────────────────────────────
--   EI-S1.3B. Implements the FM.2 Stage 1 requirement "Decision Ledger V1" as
--   the canonical Chapter 11 institutional decision record.
--
--   "Memory remembers context. The Decision Ledger remembers commitments."
--   (§11.2)
--
--   Each row is one immutable act in a decision's lineage. Current status is
--   DERIVED from the lineage in application code and is never stored as a
--   mutable column — an approved decision becomes active when its effective
--   date arrives and expires when its window closes, both from time alone
--   (§11.43, §11.55: "Expiration should not depend on manual memory").
--
--   WHY A DEDICATED TABLE:
--     • atlas_intelligence is EI reasoning — confidence-bearing cognitive
--       artifacts. Institutional decisions are not EI output (§11.5).
--     • memories / D1 operator decisions are active recalled constraints, not
--       formal organizational commitments. "Memory may help explain a decision.
--       The Decision Ledger proves that the decision existed." (§11.5)
--     • the legacy `approvals` table records approval actions and mutates in
--       place. "Not every approval becomes a strategic decision." (§11.7)
--     • atlas_authorizations records scoped human authority. The ledger
--       REFERENCES an authorization; it does not duplicate it (§11.39/§11.41).
--
--   IMMUTABILITY IS ENFORCED IN THE DATABASE (§11.60: "Previous versions should
--   remain immutable… The historical record should not be rewritten"). The
--   reject triggers below make UPDATE and DELETE impossible on this table, so
--   institutional history cannot be rewritten even by a service-role caller.
--
--   ⚠️  THIS MIGRATION IS DELIBERATELY UNAPPLIED. EI-S1.3B is authorized to
--   create and commit it, and explicitly NOT authorized to apply it to any
--   remote database. It sits in the canonical guarded directory, so
--   apps/web/scripts/check-migrations.mjs will correctly fail a Vercel build
--   until a separately authorized rollout applies it — deployment blocked by
--   design. That failure must not be bypassed, grandfathered, or dodged by
--   moving this file to the legacy repo-root directory.
--   Derived ledger name: `atlas_decision_ledger`.
--
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.atlas_decision_ledger (
  -- Identity of one immutable act.
  record_id           uuid primary key default gen_random_uuid(),

  -- §11.21 — stable decision identity. "The identifier should not change when
  -- the decision is updated. Versions should belong to the same lineage."
  decision_id         uuid not null,

  --   drafted | proposed | approved | rejected | deferred
  --   amended | superseded | reversed | completed
  --   outcome_observed | reviewed
  record_type         text not null
    constraint atlas_decision_ledger_record_type_check check (record_type in (
      'drafted', 'proposed', 'approved', 'rejected', 'deferred',
      'amended', 'superseded', 'reversed', 'completed',
      'outcome_observed', 'reviewed'
    )),
  occurred_at         timestamptz not null default now(),

  -- §11.12 — V1 ledger decisions are project-scoped. Global and portfolio
  -- decisions (§11.10/§11.11) need the governed summaries of §11.73, which
  -- Stage 1 does not fund, so scope is NOT NULL by design.
  project_id          uuid not null references public.projects(id) on delete restrict,

  -- The human who performed the act, from the authenticated session.
  principal_id        uuid not null,

  -- §11.22/§11.23 — identity and the commitment itself.
  title               text not null,
  statement           text not null,

  -- §11.24/§11.25 — the Executive recommendation is preserved SEPARATELY from
  -- the final decision. "This distinction supports calibration and learning."
  recommendation      text,
  -- §11.26 — why the final decision was made.
  rationale           text,

  -- §11.19 — the material domains. §11.18 keeps routine activity out, so this
  -- must be a non-empty array drawn from the canonical list.
  materiality         jsonb not null default '[]',

  -- §11.39/§11.41 — authority behind the decision, holding an Authorization V1
  -- reference. Effectiveness is resolved live through the authorization seam;
  -- no `authorized: true` boolean is stored here to drift.
  authority           jsonb,

  -- §11.27 — linked evidence, preserving timestamp and scope.
  evidence            jsonb not null default '[]',
  -- §11.28 — what was known THEN, frozen against later data change.
  snapshot            jsonb,
  -- §11.31/§11.32 — serious alternatives, so future reviewers cannot assume
  -- no other path existed.
  alternatives        jsonb not null default '[]',
  -- §11.30 — recommendation confidence when material.
  confidence          text
    constraint atlas_decision_ledger_confidence_check check (confidence is null or confidence in ('low','medium','high')),
  -- §11.36 — what was expected; the basis for later evaluation.
  expected_impact     text,

  -- §11.43 — when the decision begins to govern; may differ from approval.
  effective_at        timestamptz,
  -- §11.45 — temporary decisions expire safely.
  expires_at          timestamptz,
  -- §11.46 — review date or condition. Chapter 12 owns the full architecture.
  review              jsonb,
  -- §11.47 — conditions requiring reversal or reconsideration.
  reversal_conditions jsonb not null default '[]',

  -- §11.56 — explicit "superseded by Decision X".
  superseded_by       uuid,
  -- §11.59 — version within the lineage; identity stays stable.
  version             integer not null default 1
    constraint atlas_decision_ledger_version_check check (version >= 1),

  -- §11.96 — observed outcome. Never overwrites the original decision.
  outcome             jsonb,
  -- §11.102 — a lesson from review. Accumulates; never rewrites reasoning.
  review_note         text,
  -- §11.53/§11.54/§11.57 — rejection, deferral, reversal, amendment reason.
  reason              text,

  created_at          timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary read: the ordered lineage of one decision (§11.63).
create index if not exists atlas_decision_ledger_lineage_idx
  on public.atlas_decision_ledger (decision_id, occurred_at, record_id);

-- Project audit listing.
create index if not exists atlas_decision_ledger_project_idx
  on public.atlas_decision_ledger (project_id, occurred_at desc);

-- Review-due lookup for open decisions.
create index if not exists atlas_decision_ledger_type_idx
  on public.atlas_decision_ledger (project_id, record_type, occurred_at desc);

-- ── Transition invariants ─────────────────────────────────────────────────────
-- Append-only alone does not stop two concurrent writers appending, say, an
-- approval and a rejection to the same decision. The pure derivation would then
-- reject the persisted lineage as malformed and the decision would become
-- unreadable. These partial unique indexes serialize the transitions in the
-- database; a losing writer gets a unique violation (23505) which the write
-- boundary surfaces as `conflict`, and the lineage stays valid.
--
-- Narrowly scoped: no distributed transaction machinery, no generic
-- event-sourcing framework.

-- Exactly one opening act per decision.
create unique index if not exists atlas_decision_ledger_one_open_idx
  on public.atlas_decision_ledger (decision_id)
  where record_type in ('drafted', 'proposed');

-- Exactly one settling act: approved | rejected.
-- `deferred` is excluded: §11.54 allows a deferred decision to be taken up again.
create unique index if not exists atlas_decision_ledger_one_settlement_idx
  on public.atlas_decision_ledger (decision_id)
  where record_type in ('approved', 'rejected');

-- Exactly one closing act: superseded | reversed | completed.
create unique index if not exists atlas_decision_ledger_one_close_idx
  on public.atlas_decision_ledger (decision_id)
  where record_type in ('superseded', 'reversed', 'completed');

-- One record per decision version for amendments (§11.59).
create unique index if not exists atlas_decision_ledger_one_amendment_per_version_idx
  on public.atlas_decision_ledger (decision_id, version)
  where record_type = 'amended';

-- ── Append-only enforcement (§11.60, §11.61, §11.62) ──────────────────────────
-- History is immutable. Corrections and material amendments append a new record
-- with explicit provenance; they never edit what was recorded before.

create or replace function public.atlas_decision_ledger_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'atlas_decision_ledger is append-only: % is not permitted on institutional decision history', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists atlas_decision_ledger_no_update on public.atlas_decision_ledger;
create trigger atlas_decision_ledger_no_update
  before update on public.atlas_decision_ledger
  for each row execute function public.atlas_decision_ledger_reject_mutation();

drop trigger if exists atlas_decision_ledger_no_delete on public.atlas_decision_ledger;
create trigger atlas_decision_ledger_no_delete
  before delete on public.atlas_decision_ledger
  for each row execute function public.atlas_decision_ledger_reject_mutation();

-- ── Row-level security ────────────────────────────────────────────────────────
-- Service-role only, matching atlas_authorizations and atlas_intelligence. User
-- access is mediated by the server-side principal-scoped boundary in
-- lib/atlas/decision-ledger/, which proves project ownership from the lineage's
-- own recorded scope before returning anything.

alter table public.atlas_decision_ledger enable row level security;
revoke all on public.atlas_decision_ledger from anon, authenticated;

comment on table public.atlas_decision_ledger is
  'Chapter 11 Decision Ledger V1 — append-only institutional decision history. '
  'One row per immutable act in a decision lineage; status is derived, never stored. '
  'References atlas_authorizations for authority; never duplicates it. '
  'Service-role only; UPDATE and DELETE are rejected by trigger. '
  'See docs/architecture/executive-intelligence/ and canonical Ch 11.';
