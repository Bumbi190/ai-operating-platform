-- Atlas Signal Platform foundation table.
--
-- ONE generic table for ALL signal types Atlas will ever produce. Score is
-- the first kind; opportunity, prediction, recommendation, cluster_emerged,
-- entity_momentum, market_summary slot in as future kinds without schema
-- change.
--
-- See OMNIRA_ATLAS_BRIEF_ADR.md for the full rationale.
--
-- Key design choices:
--   * content_id is NULLABLE and has NO foreign key. Future kinds may
--     reference media_news_items, entities, clusters, or be global.
--     Producer is responsible for content_id validity. Atlas is append-only
--     and historical — orphan signals remain valid track-record entries.
--   * payload is jsonb. Each signal kind has its own shape, validated at the
--     producer boundary (TypeScript types), not in the DB.
--   * version is a string (e.g. 'score-engine-1.0.0'). Multiple producer
--     versions can coexist; readers filter by version when needed.
--   * Append-only by convention. No UPDATE, no DELETE in producer code.
--     Track record falls out for free.

create table public.atlas_signals (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid,
  kind        text not null,
  payload     jsonb not null,
  version     text not null,
  produced_at timestamptz not null default now(),

  constraint atlas_signals_kind_nonempty    check (length(trim(kind))    > 0),
  constraint atlas_signals_version_nonempty check (length(trim(version)) > 0)
);

-- Content-scoped queries: "latest signals for article X, kind Y"
create index atlas_signals_content_kind_idx
  on public.atlas_signals(content_id, kind, produced_at desc)
  where content_id is not null;

-- Global queries: "all opportunities this week", "all predictions awaiting resolution"
create index atlas_signals_kind_idx
  on public.atlas_signals(kind, produced_at desc);

alter table public.atlas_signals enable row level security;

-- Admin-only via service role. Anon and authenticated roles cannot read or
-- write. Service role bypasses RLS entirely. If we later expose a public
-- read API, add a SELECT policy then.
create policy atlas_signals_service_role_only
  on public.atlas_signals
  for all
  to authenticated
  using (false)
  with check (false);

comment on table public.atlas_signals is
  'Atlas Signal Platform — append-only log of all Atlas-emitted signals. See OMNIRA_ATLAS_BRIEF_ADR.md.';
comment on column public.atlas_signals.kind is
  'Signal kind. ''impact_score'' (v1); future: ''opportunity'', ''prediction'', ''recommendation''…';
comment on column public.atlas_signals.version is
  'Producer version, e.g. ''score-engine-1.0.0''. Multiple versions can coexist.';
comment on column public.atlas_signals.content_id is
  'Nullable, no FK — future signal types may span clusters, entities, or be global rather than article-scoped.';
