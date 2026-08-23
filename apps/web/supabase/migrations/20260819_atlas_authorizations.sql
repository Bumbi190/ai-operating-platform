-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Atlas Explicit Human Authorization V1 — append-only authority event log
--   ──────────────────────────────────────────────────────────────────────────
--   EI-S1.3A. Implements the FM.2 Stage 1 requirement "explicit human
--   authorization", and is the dependency Chapter 11 Decision Ledger V1
--   (EI-S1.3B) needs in order to prove that a decision became effective through
--   proper authority (canonical §11.41).
--
--   An authorization is an AUTHORITY ACT (§27.3), not reasoning and not
--   execution. Each row is one immutable act; current status is DERIVED from
--   the chain in application code and is never stored as a mutable column.
--
--   WHY A DEDICATED TABLE (owner decision 1):
--     • atlas_intelligence is EI reasoning — every row is an interpretation with
--       confidence and an evidence chain. A human authority act is not EI
--       output, and storing it there would collapse decision ≠ authorization.
--     • memories / D1 operator decisions are active recalled constraints with
--       salience and dedup semantics, not immutable authority history.
--     • the existing `approvals` table UPDATEs status in place, which cannot
--       satisfy §11.60 immutable history, and changing its write semantics
--       would alter live drain / marketing / manager / publish behaviour.
--
--   IMMUTABILITY IS ENFORCED IN THE DATABASE, not only by TypeScript: the
--   reject trigger below makes UPDATE and DELETE impossible on this table, so
--   history cannot be rewritten even by a service-role caller.
--
--   ⚠️  THIS MIGRATION IS DELIBERATELY UNAPPLIED. EI-S1.3A is authorized to
--   create and commit it, and explicitly NOT authorized to apply it to any
--   remote database. Until it is applied by the owner, every runtime path in
--   lib/atlas/authorization/ fails closed (typed 'unavailable'), and nothing in
--   the live Atlas surface depends on this table.
--
--   It lives in the CANONICAL guarded directory apps/web/supabase/migrations/
--   (owner ruling, EI-S1.3A-R1), so apps/web/scripts/check-migrations.mjs will
--   correctly fail a Vercel build until the schema has been applied through a
--   separately authorized rollout. That failure is the guard working as designed
--   — it must not be bypassed, grandfathered, or worked around by moving this
--   file back to the legacy repo-root directory.
--   Derived ledger name: `atlas_authorizations`.
--
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.atlas_authorizations (
  -- Identity
  event_id              uuid primary key default gen_random_uuid(),
  -- The aggregate: all events sharing this id are one authorization's history.
  authorization_id      uuid not null,

  -- The immutable act. Derived status lives in application code, never here.
  --   requested | granted | granted_with_conditions | denied
  --   revoked   | superseded | expired
  event_type            text not null
    constraint atlas_authorizations_event_type_check check (event_type in (
      'requested', 'granted', 'granted_with_conditions',
      'denied', 'revoked', 'superseded', 'expired'
    )),
  occurred_at           timestamptz not null default now(),

  -- Scope: V1 requires an explicit project (§27.15). Cross-project authority is
  -- excluded from V1 (§27.16), so this column is NOT NULL by design.
  project_id            uuid not null references public.projects(id) on delete restrict,

  -- The human who performed the act. Never a service role: capability is not
  -- authority (§10.4). Written from the authenticated session, never a caller.
  principal_id          uuid not null,
  authority_basis       text not null default 'founder_owner'
    constraint atlas_authorizations_authority_basis_check check (authority_basis in ('founder_owner')),

  -- Requested authority (§27.20): exactly what is permitted, structured.
  action_kind           text not null,
  authority_description text,

  -- Target and version pin (§27.21, §27.22). A material change to the target
  -- yields a different hash, which invalidates the prior authorization.
  target_type           text not null,
  target_id             text not null,
  target_version_hash   text not null
    constraint atlas_authorizations_version_hash_check check (target_version_hash ~ '^[a-f0-9]{64}$'),

  -- Conditions are part of the authority act, not optional notes (§11.42).
  -- V1 RECORDS them; it does not enforce them (no policy engine in Stage 1).
  conditions            jsonb not null default '[]',

  -- Evidence available at the moment of the act (§11.27, §27.27).
  evidence              jsonb not null default '[]',

  -- Bounded validity is mandatory on a grant (§27.319). Enforced in application
  -- code, which knows the event type; expiry is DERIVED from time at read, so
  -- safety never depends on a job writing an `expired` row.
  expires_at            timestamptz,

  -- Set only by a `superseded` act.
  superseded_by         uuid,

  -- Human-readable reason (why denied, why revoked). Never the permission.
  reason                text,

  created_at            timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary read: the ordered history of one authorization.
create index if not exists atlas_authorizations_chain_idx
  on public.atlas_authorizations (authorization_id, occurred_at, event_id);

-- Project audit listing.
create index if not exists atlas_authorizations_project_idx
  on public.atlas_authorizations (project_id, occurred_at desc);

-- "Is there live authority for this pinned target?"
create index if not exists atlas_authorizations_target_idx
  on public.atlas_authorizations (project_id, target_type, target_id, occurred_at);

-- ── Transition invariants (EI-S1.3A-R1) ──────────────────────────────────────
-- Append-only alone does not stop two concurrent writers appending two grants,
-- or a grant and a deny, to the same aggregate. The pure derivation would then
-- reject the persisted chain as malformed and the authorization would be
-- permanently unreadable. These partial unique indexes serialize the transitions
-- in the database, so a losing concurrent writer gets a unique violation (23505)
-- which the write boundary surfaces as `conflict` and the chain stays valid.
--
-- Narrowly scoped on purpose: three indexes, no distributed transaction
-- machinery, no generic event-sourcing framework.

-- Exactly one opening request per aggregate.
create unique index if not exists atlas_authorizations_one_request_idx
  on public.atlas_authorizations (authorization_id)
  where event_type = 'requested';

-- Exactly one deciding act: granted | granted_with_conditions | denied.
create unique index if not exists atlas_authorizations_one_decision_idx
  on public.atlas_authorizations (authorization_id)
  where event_type in ('granted', 'granted_with_conditions', 'denied');

-- Exactly one closing act: revoked | superseded | expired.
create unique index if not exists atlas_authorizations_one_close_idx
  on public.atlas_authorizations (authorization_id)
  where event_type in ('revoked', 'superseded', 'expired');

-- ── Append-only enforcement (§11.60, §27.207) ────────────────────────────────
-- History is immutable. This is enforced at the database layer so that no
-- application bug, and no service-role caller, can rewrite an authority record.

create or replace function public.atlas_authorizations_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'atlas_authorizations is append-only: % is not permitted on authorization history', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists atlas_authorizations_no_update on public.atlas_authorizations;
create trigger atlas_authorizations_no_update
  before update on public.atlas_authorizations
  for each row execute function public.atlas_authorizations_reject_mutation();

drop trigger if exists atlas_authorizations_no_delete on public.atlas_authorizations;
create trigger atlas_authorizations_no_delete
  before delete on public.atlas_authorizations
  for each row execute function public.atlas_authorizations_reject_mutation();

-- ── Row-level security ────────────────────────────────────────────────────────
-- Service-role only, matching atlas_intelligence. User access is mediated by
-- the server-side principal-scoped boundary in lib/atlas/authorization/, which
-- checks project ownership before returning anything.

alter table public.atlas_authorizations enable row level security;
revoke all on public.atlas_authorizations from anon, authenticated;

comment on table public.atlas_authorizations is
  'Explicit Human Authorization V1 — append-only authority event log. '
  'One row per immutable authority act; current status is derived, never stored. '
  'Service-role only; UPDATE and DELETE are rejected by trigger. '
  'See docs/architecture/executive-intelligence/ and canonical Ch 27 / Ch 11 §11.41.';
