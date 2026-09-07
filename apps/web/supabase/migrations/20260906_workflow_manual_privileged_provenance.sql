-- ─────────────────────────────────────────────────────────────────────────────
-- A third evidence provenance: manual_privileged.
--
-- ── WHY A THIRD VALUE AND NOT `attested` ─────────────────────────────────────
-- Four deployed-source checks on the Familje-Stunden monthly release can only
-- be answered by reading DEPLOYED Edge Function source through the Supabase
-- Management API. That API accepts only an account-wide personal access token —
-- Supabase offers no project-scoped read-only credential on this plan — so the
-- read may happen on an Editor's machine and nowhere else. The result is a real
-- privileged verification, and it is NOT the same kind of fact as a human
-- reporting that they ran ffprobe.
--
-- Reusing `attested` would make those two indistinguishable, and would let any
-- ordinary human attestation satisfy a CRITICAL source-integrity invariant. A
-- distinct value keeps the refusal in the provenance layer, which is the layer
-- every consumer already checks.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ──────────────────────────────────────────
-- It grants storage capability and nothing else. After it runs:
--   * no application path can emit `manual_privileged` — `recordEvidence`
--     refuses it explicitly, and the two evidence routes hard-code their own
--     provenance
--   * no check lists it in `allowed_provenance`
--   * no reachability or readiness changes
-- The producer is a later, separately reviewed slice. A column that CAN hold a
-- value nobody can write is deliberate: capability first, authority second.
--
-- ── SAFETY ───────────────────────────────────────────────────────────────────
-- One CHECK constraint is replaced by a strictly wider one. Every existing row
-- satisfies the new predicate, so Postgres validates without rewriting the
-- table. No column, default, index, trigger or other constraint is touched, and
-- nothing is deleted.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.workflow_evidence
  drop constraint if exists workflow_evidence_source_check;

alter table public.workflow_evidence
  add constraint workflow_evidence_source_check
  check (source in ('automated', 'attested', 'manual_privileged'));

comment on column public.workflow_evidence.source is
  'automated — Omnira performed the check itself and owns the result. '
  'attested — a human ran it elsewhere and reported the outcome. '
  'manual_privileged — an authorized Editor executed a named read-only '
  'privileged procedure (today: reading deployed Edge Function source via the '
  'Supabase Management API from a local machine) and submitted the result. '
  'Never collapse the three: they carry different authority.';

commit;
