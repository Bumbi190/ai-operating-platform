-- ─────────────────────────────────────────────────────────────────────────────
-- Atlas Intelligence domain — refined intelligence objects.
--
-- A SEPARATE domain from public.atlas_signals. The two layers answer different
-- questions and evolve independently:
--   * Signals      ("What happened?")  — normalized facts from collectors.
--   * Intelligence ("What does it mean?") — briefs, trends, reasoning, entity
--     momentum, derived by Intelligence Producers from signals + memory.
--
-- Platform pipeline:
--   Collectors → Signals → Intelligence → Consumers (Manager, Agents, The Prompt)
--
-- This table is accessed ONLY through the IntelligenceStore repository
-- (apps/web/lib/atlas/intelligence/store.ts). That keeps the layer
-- storage-agnostic, so a graph backend (e.g. Graphify) can replace Postgres
-- later WITHOUT changing producers or consumers.
--
-- See OMNIRA_ATLAS_INTELLIGENCE_ADR.md for the full rationale.
--
-- Key design choices:
--   * Dedicated table, NOT a kind of atlas_signals. Strict layering.
--   * subject_ref is a free-text reference (entity key | content id | project id
--     | NULL for global). No FK — subjects span entities, content, and clusters
--     that do not share one parent table. Producers own ref validity.
--   * Append-only by convention. Lifecycle is supersede (superseded_by), never
--     UPDATE-in-place or DELETE. Track record falls out for free.
--   * findings / body / evidence are jsonb, validated at the producer boundary
--     (TypeScript contracts in lib/atlas/intelligence/types.ts), not in the DB.
--   * confidence is 0–1, matching atlas.memories — one platform-wide convention.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.atlas_intelligence (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  subject_kind  text not null check (subject_kind in ('entity','content','project','global')),
  subject_ref   text,
  project_id    uuid references public.projects(id) on delete set null,
  summary       text not null,
  findings      jsonb not null default '[]',
  body          jsonb not null default '{}',
  confidence    numeric(4,3) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  evidence      jsonb not null default '[]',
  produced_by   text not null,
  version       text not null,
  produced_at   timestamptz not null default now(),
  valid_until   timestamptz,
  superseded_by uuid references public.atlas_intelligence(id),

  constraint atlas_intelligence_kind_nonempty        check (length(trim(kind))        > 0),
  constraint atlas_intelligence_summary_nonempty     check (length(trim(summary))     > 0),
  constraint atlas_intelligence_produced_by_nonempty check (length(trim(produced_by)) > 0),
  constraint atlas_intelligence_version_nonempty     check (length(trim(version))     > 0),
  -- Invariant: global objects carry no subject ref; all other subjects must.
  constraint atlas_intelligence_subject_ref_shape
    check ((subject_kind = 'global') = (subject_ref is null))
);

-- Consumer read path: "latest intelligence about subject X, kind Y".
create index atlas_intelligence_subject_idx
  on public.atlas_intelligence(subject_kind, subject_ref, kind, produced_at desc);

-- Kind/time scans: "all trends this week".
create index atlas_intelligence_kind_idx
  on public.atlas_intelligence(kind, produced_at desc);

-- Project-scoped retrieval.
create index atlas_intelligence_project_idx
  on public.atlas_intelligence(project_id, kind, produced_at desc)
  where project_id is not null;

-- Active (non-superseded) lookups — the common consumer filter.
create index atlas_intelligence_active_idx
  on public.atlas_intelligence(produced_at desc)
  where superseded_by is null;

alter table public.atlas_intelligence enable row level security;

-- Admin-only via service role. Anon and authenticated roles cannot read or
-- write; service role bypasses RLS entirely. Add a SELECT policy here if a
-- public read API is ever exposed.
create policy atlas_intelligence_service_role_only
  on public.atlas_intelligence
  for all
  to authenticated
  using (false)
  with check (false);

comment on table public.atlas_intelligence is
  'Atlas Intelligence domain — refined intelligence objects (briefs, trends, reasoning, entity momentum). Distinct from atlas_signals (facts). Accessed via IntelligenceStore. See OMNIRA_ATLAS_INTELLIGENCE_ADR.md.';
comment on column public.atlas_intelligence.kind is
  'Intelligence kind: ''brief'', ''trend'', ''entity_momentum'', ''reasoning'', ''executive_brief''.';
comment on column public.atlas_intelligence.subject_ref is
  'Free-text subject reference: entity key | content id | project id | NULL for global. No FK by design.';
comment on column public.atlas_intelligence.evidence is
  'EvidenceChain jsonb: array of {source_kind, ref_id, weight, observed_at} tracing the inputs behind the conclusion.';
comment on column public.atlas_intelligence.confidence is
  '0–1 confidence, matching atlas.memories convention.';
comment on column public.atlas_intelligence.superseded_by is
  'Lifecycle pointer. Set when a newer object replaces this one. Append-only: no UPDATE-in-place, no DELETE.';
