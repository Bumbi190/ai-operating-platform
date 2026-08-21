-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Atlas Intelligence — Cognitive Artifact Store (canonical activation)
--   ────────────────────────────────────────────────────────────────────
--   Derived from the historical, never-applied migration
--   `supabase/migrations/20260629_120000_atlas_intelligence.sql`
--   (sha256 6c8fc2c33f26a812685e9f401c88c19dfa290b4de28dc550ac826b524750299f).
--
--   That file sat in the repo-root legacy directory, which the migration guard
--   (`apps/web/scripts/check-migrations.mjs`) does not scan, so "39 enforced /
--   0 missing" was truthful and simultaneously blind to it: the Executive Brief
--   apex had no storage in production and no brief was ever produced. Bringing
--   the schema into the guarded directory is the point of this migration.
--
--   The store holds one reasoned artifact per row (P3/P4): `body` is the
--   interpretation, `evidence` the provenance chain, `confidence` the calibrated
--   belief, `produced_by` the producer identity.
--
--   RLS: service-role only. EI orchestrators use createAdminClient(). This table
--   is never exposed to anon/authenticated, and carries NO PostgREST policy.
--
--   ── INTENTIONAL DIFFERENCES FROM THE HISTORICAL FILE ─────────────────────────
--
--   (1) project_id ON DELETE SET NULL  →  ON DELETE RESTRICT
--
--       In this store `project_id IS NULL` is not "no project": it is the
--       PLATFORM-GLOBAL WORLD SCOPE, which `principal-read.ts` releases only to a
--       principal holding whole-portfolio authority. Under SET NULL, deleting a
--       project would silently promote every one of its project-scoped artifacts
--       into that world scope — a scope mutation performed by a foreign key,
--       exactly the "evidence silently crossing a project boundary" that project
--       isolation forbids. RESTRICT is also what all four sibling Executive
--       ledgers already do in production (atlas_authorizations,
--       atlas_decision_ledger, atlas_mission_ledger, atlas_delegation_ledger),
--       so this aligns the artifact store with established doctrine rather than
--       inventing a new rule.
--
--   (2) An append-only trigger is added (see below), which the historical file
--       described in prose but never enforced.
--
--   (3) The header no longer claims "EI never updates rows" — it does update
--       exactly one column. See the trigger comment.
--
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.atlas_intelligence (
  -- Identity
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,

  -- Scope: null = platform-global world scope; set = project-scoped.
  project_id      uuid references public.projects(id) on delete restrict,

  -- Subject (optional): the entity this artifact is about
  subject_kind    text,        -- 'project' | 'metric' | 'tenant' | 'content'
  subject_id      text,
  subject_name    text,

  -- Cognitive artifact body (interpretation, never raw data — P3)
  body            jsonb not null default '{}',

  -- Provenance (P4): every artifact carries its evidence chain
  evidence        jsonb not null default '[]',

  -- Calibrated confidence 0–1 (§8.2)
  confidence      numeric(5,4) not null
    constraint atlas_intelligence_confidence_range check (confidence >= 0 and confidence <= 1),

  -- Timestamps
  produced_at     timestamptz not null default now(),

  -- Producer identity (version string, e.g. 'brief-producer-1.0.0')
  produced_by     text not null,

  -- Reasoning window (what time range was reasoned over)
  window_since    timestamptz,
  window_until    timestamptz,

  -- Supersession chain (§8.4, §13.3). When EI produces a newer version of an
  -- artifact, the OLD row gains this pointer to the new row.
  superseded_by   uuid references public.atlas_intelligence(id) on delete restrict
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary read pattern: latest non-superseded artifact by kind + project
create index if not exists atlas_intelligence_kind_project_active_idx
  on public.atlas_intelligence (kind, project_id, produced_at desc)
  where superseded_by is null;

-- Subject lookup (for per-entity reasoning history)
create index if not exists atlas_intelligence_subject_idx
  on public.atlas_intelligence (subject_kind, subject_id, produced_at desc)
  where subject_kind is not null;

-- Window overlap queries (for prior brief continuity — §13.3)
create index if not exists atlas_intelligence_window_idx
  on public.atlas_intelligence (kind, project_id, window_since, window_until);

-- ── Append-only, with one sanctioned transition ───────────────────────────────
--
--   The historical file called this store "append-only" and in the same breath
--   documented that superseding UPDATEs the prior row. Both are true of the
--   INTENT and neither was enforced. Stated precisely:
--
--     immutable  kind, project_id, subject_*, body, evidence, confidence,
--                produced_at, produced_by, window_since, window_until
--     mutable    superseded_by, and only once, NULL → NOT NULL
--
--   The reasoning track record is what makes an artifact evidence; if `body` or
--   `confidence` could be rewritten, a historical interpretation could be
--   retconned and no reader would know. Supersession must therefore be able to
--   close a row without being able to edit it, and must not be able to re-point
--   an already-superseded row at a different successor.
--
--   Every sibling Executive ledger rejects UPDATE and DELETE outright; this is
--   the same posture, minus the one transition the store genuinely needs.

create or replace function public.atlas_intelligence_reject_mutation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'atlas_intelligence is append-only: DELETE of artifact % is not permitted', old.id
      using errcode = 'restrict_violation';
  end if;

  -- Only the supersession pointer may change, and only from unset to set.
  if old.superseded_by is not null then
    raise exception
      'atlas_intelligence artifact % is already superseded and is immutable', old.id
      using errcode = 'restrict_violation';
  end if;

  if new.superseded_by is null then
    raise exception
      'atlas_intelligence UPDATE of artifact % must set superseded_by', old.id
      using errcode = 'restrict_violation';
  end if;

  if row(new.id, new.kind, new.project_id, new.subject_kind, new.subject_id,
         new.subject_name, new.body, new.evidence, new.confidence,
         new.produced_at, new.produced_by, new.window_since, new.window_until)
     is distinct from
     row(old.id, old.kind, old.project_id, old.subject_kind, old.subject_id,
         old.subject_name, old.body, old.evidence, old.confidence,
         old.produced_at, old.produced_by, old.window_since, old.window_until)
  then
    raise exception
      'atlas_intelligence artifact % is immutable: only superseded_by may be set', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists atlas_intelligence_no_delete on public.atlas_intelligence;
create trigger atlas_intelligence_no_delete
  before delete on public.atlas_intelligence
  for each row execute function public.atlas_intelligence_reject_mutation();

drop trigger if exists atlas_intelligence_supersede_only on public.atlas_intelligence;
create trigger atlas_intelligence_supersede_only
  before update on public.atlas_intelligence
  for each row execute function public.atlas_intelligence_reject_mutation();

-- ── Row-level security ────────────────────────────────────────────────────────
-- Service-role only. No PostgREST policies.

alter table public.atlas_intelligence enable row level security;
revoke all on public.atlas_intelligence from anon, authenticated;

comment on table public.atlas_intelligence is
  'Atlas EI cognitive artifact store. Artifact substance is immutable; only '
  'superseded_by may be set, once. Service-role only, no RLS policies.';
