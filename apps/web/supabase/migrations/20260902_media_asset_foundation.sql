-- ─────────────────────────────────────────────────────────────────────────────
--  MEDIA RUNTIME PHASE 1 — CANONICAL ASSET IDENTITY + PROVENANCE
--
--  ── WHAT THIS CLOSES ────────────────────────────────────────────────────────
--  Omnira generates media and then forgets what it is. Every generated image,
--  audio file and video exists only as a URL STRING on a pipeline table:
--  media_scripts.images (a jsonb array of public URLs), media_scripts.audio_url,
--  media_scripts.video_url, website_content.hero_image_url. There is no asset
--  entity anywhere in the schema.
--
--  The Intelligence Fabric canon names that exact shape as non-conformant:
--    §21.7  Asset Is Not URL        "URLs may expire, redirect, change, or
--                                    disappear. Canonical Asset identity shall
--                                    remain independent."
--    §21.9  Asset Is Not Storage Path
--    §21.6  Asset Is Not File
--    §21.10 Asset Is Not Provider Object
--
--  This is not a style objection. app/api/outputs/[id]/route.ts already has to
--  recover a storage path by string-splitting a public URL:
--
--      const path = output.file_url.split('/storage/v1/object/public/outputs/')[1]
--
--  That line breaks if the bucket is renamed, if the URL is signed rather than
--  public, or if Supabase changes its URL shape — because the URL is being used
--  as the identity. This migration creates the identity that line is missing.
--
--  ── OUTPUT IS NOT ASSET (§21.4) ─────────────────────────────────────────────
--  Canon: "An Output is content or data produced by one Execution, Attempt,
--  Provider job, Tool or human contribution … Output identity and Asset identity
--  shall remain distinct." Omnira ALREADY has public.outputs (project_id, run_id,
--  file_url) — that table is the Output. This is the Asset. They are deliberately
--  NOT merged and public.outputs is NOT modified by this migration.
--
--  ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
--    • Not a DAM. No collections, tags, folders, renditions, or rights model.
--      Canon §21.23-21.35 define Representations and Renditions; Phase 1 stores
--      exactly one location per asset because Omnira produces exactly one.
--    • Not a billing ledger. cost_events remains the only spend record.
--      asset_provenance.cost_event_id is a LINK, never a second amount.
--    • Not a second evidence system. The append-only construction below is
--      copied from workflow_evidence / atlas_authorizations, deliberately.
--    • Not a backfill. Phase 1 is FORWARD-ONLY. Existing URL-string media stays
--      legacy and is not silently reinterpreted as an asset. No UPDATE or INSERT
--      against any existing table appears in this file.
--    • Not a change to any EXISTING bucket. Section 1 CREATES one new private
--      bucket; it alters no existing bucket and does not touch the public flag
--      of `media-assets`, which stays public because published heroes are served
--      from it.
--
--  ── VISIBILITY: TWO VALUES, TWO BUCKETS, ENFORCED BOTH WAYS ─────────────────
--  `internal` (private/draft/unpublished) and `public` (published). Each has
--  exactly one permitted destination, and the pairing is enforced in BOTH
--  directions by `assertVisibilityPlacement` in lib/media/asset/validate.ts:
--
--      internal → media-assets-private   (public = false, created in §1)
--      public   → media-assets           (public = true,  pre-existing)
--
--  Enforcing both directions matters. Refusing only "internal into a public
--  bucket" would still permit a PUBLISHED asset to be filed privately, where it
--  would be unreachable by the delivery URL every existing reader expects — a
--  silent breakage rather than a leak, but a breakage the same rule can prevent
--  for free.
--
--  DEFAULT 'internal' is the fail-closed half: an omitted visibility can never
--  yield a public asset. A draft becomes public only when someone writes
--  'public' on purpose.
--
--  ── APPLICATION ─────────────────────────────────────────────────────────────
--  NOT applied to any database by the change that authored it. This migration is
--  post-baseline, so scripts/check-migrations.mjs ENFORCES it: the Vercel build
--  will fail until it is applied via the Supabase migration flow. That is the
--  intended ordering (schema before code), and it means this branch must not be
--  deployed until the migration is applied.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Storage buckets ───────────────────────────────────────────────────────
--
--  ── WHY A PRIVATE BUCKET IS PART OF THE FOUNDATION, NOT A LATER ADDITION ────
--  The first draft of this migration modelled `visibility` and had nowhere
--  private to honour it. `media-assets` is the only bucket Omnira defines and it
--  was created PUBLIC (20260520_media_tables.sql), so an asset marked
--  `internal` would have had its bytes sitting behind a world-readable URL. A
--  visibility column beside publicly readable bytes is false privacy — worse
--  than no column, because it reads as a control in review.
--
--  A public Supabase bucket serves every object at a DETERMINISTIC url:
--      /storage/v1/object/public/<bucket>/<path>
--  Paths here are built from ids (`images/articles/{projectId}/{articleId}-…`),
--  so they are guessable by anyone who knows an article id. Today that is
--  acceptable because everything in `media-assets` is published. It stops being
--  acceptable the moment an unpublished draft lands there.
--
--  ── WHAT `public = false` ACTUALLY BUYS ─────────────────────────────────────
--  Supabase refuses the `/object/public/` route for a non-public bucket
--  outright — that is enforced by the storage service, not by a policy this
--  migration writes and could get wrong. Reads then require either a signed URL
--  or a credential that passes `storage.objects` RLS.
--
--  ── WHY NO storage.objects POLICIES ARE CREATED HERE ────────────────────────
--  There is NO storage.objects RLS anywhere in this repository — verified
--  across both migration directories. Every media read today is either a public
--  URL or a service-role call, and service_role bypasses RLS. So with no policy
--  at all, the reachable set for this bucket is exactly: service_role, and
--  holders of a signed URL Omnira minted. Anonymous and authenticated clients
--  get nothing.
--
--  That is the most fail-closed state available, and it is reached by writing
--  NO policy rather than by writing one. Adding policies for a role that has no
--  read path would invent an access model nobody uses — and an access model
--  invented ahead of its first consumer is one nobody has tested against a real
--  requirement. When a user-facing draft view exists, it brings its own policy.
--
--  ── FILE SIZE / MIME LIMITS ─────────────────────────────────────────────────
--  Deliberately NOT set on the bucket row. The one bucket precedent in this
--  repository inserts (id, name, public) and nothing else, so there is no
--  convention here to follow, and a column this migration cannot test against a
--  live database is a way for the whole migration to fail on apply. Both limits
--  ARE enforced, in `lib/media/asset/validate.ts`, where they are exhaustively
--  unit-tested (`ADMITTED_MIME_TYPES`, `MAX_BYTES`). Promoting them to bucket
--  columns is a sound defence-in-depth follow-up once this applies cleanly.
--
--  ── NOTE ON DRIFT ───────────────────────────────────────────────────────────
--  Two buckets in live use — `outputs` and `run-images` — exist in NO migration.
--  They were created by hand, which is the same drift `20260613_media_rls_
--  hardening.sql` was written to close for tables ("RLS was later enabled by
--  hand in the live project but never written down"). Not fixed here: they are
--  outside the Media Runtime boundary and adopting them would mean asserting a
--  live state this change has not inspected. Recorded so it is a known gap.

insert into storage.buckets (id, name, public)
values ('media-assets-private', 'media-assets-private', false)
on conflict (id) do nothing;

-- ── 2. Assets ────────────────────────────────────────────────────────────────
--
-- `id` is the canonical identity and the ONLY durable handle. Everything else on
-- this row, storage location included, is an attribute that may change without
-- the asset becoming a different asset (§21.9).

create table if not exists public.assets (
  id                uuid primary key default gen_random_uuid(),

  -- Ownership. NOT NULL from the start: media_rls_hardening had to retrofit this
  -- onto media_scripts/media_news_items precisely because it was nullable, and
  -- a nullable owner is a row RLS cannot scope.
  project_id        uuid not null references public.projects(id) on delete cascade,

  -- What it is. Constrained rather than free text so routing and validation can
  -- switch exhaustively. Widening this CHECK later needs no rename and no
  -- application change.
  kind              text not null check (kind in ('image', 'video', 'audio')),

  -- Integrity evidence (§21.3). The checksum is what makes two storage copies
  -- provably the same bytes, and what makes a moved object provably unchanged.
  mime_type         text not null,
  byte_size         bigint not null check (byte_size > 0),
  checksum_sha256   text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),

  -- Intrinsic media properties, where the format exposes them. Nullable because
  -- audio has no dimensions and a still image has no duration — absence here is
  -- a property of the medium, not a missing value.
  width             integer check (width  is null or width  > 0),
  height            integer check (height is null or height > 0),
  duration_ms       integer check (duration_ms is null or duration_ms >= 0),

  -- Visibility. Two values, deliberately: the smallest vocabulary that separates
  -- "not for the world" from "published". DEFAULT 'internal' is the fail-closed
  -- half of this design — see the header note.
  visibility        text not null default 'internal'
                      check (visibility in ('internal', 'public')),

  -- Lifecycle. Matches the existing repository convention
  -- (check (status in ('active','archived','superseded'))).
  status            text not null default 'active'
                      check (status in ('active', 'archived', 'superseded')),

  -- WHERE the bytes currently are. Location metadata, NOT identity (§21.9).
  -- Recorded as bucket + path rather than as a URL so that no consumer ever has
  -- to parse a URL to find the object — which is the bug in
  -- app/api/outputs/[id]/route.ts that this design exists to prevent.
  storage_bucket    text not null,
  storage_path      text not null,

  created_at        timestamptz not null default now(),

  -- One asset per stored object. Prevents two identities claiming the same bytes
  -- at the same location, which would make "move the object" ambiguous.
  constraint assets_storage_object_unique unique (storage_bucket, storage_path)
);

create index if not exists assets_project_created_idx
  on public.assets (project_id, created_at desc);

create index if not exists assets_project_kind_idx
  on public.assets (project_id, kind);

-- Lets "have we already admitted these exact bytes for this project?" be a single
-- indexed lookup rather than a scan.
create index if not exists assets_checksum_idx
  on public.assets (project_id, checksum_sha256);

comment on table public.assets is
  'Canonical Omnira media asset identity (Intelligence Fabric ch21). The id is the durable handle; storage_bucket/storage_path are current location, not identity (§21.9). Distinct from public.outputs, which is the Output (§21.4).';

comment on column public.assets.visibility is
  'internal (default, fail-closed) or public. Admission refuses to place a non-public asset in a public bucket; visibility is never inferred from where the bytes landed.';

comment on column public.assets.storage_path is
  'Current location only. Moving an object does not change the asset identity. Never parse a URL to obtain this.';

-- ── 3. Provenance ────────────────────────────────────────────────────────────
--
-- "What generated this asset?" — one row per asset, created at admission
-- (§21.5: provenance capture is a PRECONDITION of admission, not a later log).
--
-- Shaped so that a human upload and a provider generation are the same kind of
-- record with different fields populated: `source` is required and every
-- provider-specific field is nullable. Requiring `provider` would make it
-- impossible to admit an uploaded reference image, which is exactly the asset
-- class Familje-Stunden's character canon depends on.

create table if not exists public.asset_provenance (
  -- PK is the asset id: exactly one provenance record per asset, and it cannot
  -- outlive the asset or be duplicated.
  asset_id             uuid primary key
                         references public.assets(id) on delete cascade,

  -- How the bytes came to exist. Closed set — an unrecognised origin must be a
  -- deliberate schema change, not a free-text string nobody validates.
  source               text not null
                         check (source in ('generated', 'uploaded', 'derived', 'imported')),

  -- ── Provider facts. ALL nullable: not every asset has a provider. ──────────
  -- These record WHICH VENDOR PRODUCED the bytes. They confer no authority:
  -- reading 'ideogram' here never permits calling Ideogram. Capability is not
  -- permission (§18.6), and provenance is a record of the past, not a grant.
  provider             text,
  model                text,
  -- The vendor's own id, verbatim. Echoed, never parsed.
  provider_request_id  text,
  -- Which adapter version produced it (§16.21: historical executions preserve
  -- the exact adapter version used).
  adapter_version      text,
  seed                 text,

  -- ── Request identity ──────────────────────────────────────────────────────
  -- Hashes, not payloads. A brief may contain editorial content and a prompt may
  -- contain arbitrary retrieved text; storing hashes makes "same request?"
  -- answerable without turning this table into a second content store or a
  -- prompt-injection surface that is later re-read as instructions.
  brief_hash           text check (brief_hash   is null or brief_hash   ~ '^[0-9a-f]{64}$'),
  request_hash         text check (request_hash is null or request_hash ~ '^[0-9a-f]{64}$'),

  -- ── Reference assets, BY IDENTITY (never by URL) ───────────────────────────
  -- The foundation for recurring characters (Nova/Pling). Admission validates
  -- that every id exists and belongs to the SAME project — cross-project asset
  -- reuse would breach Project Isolation, which is an official Omnira
  -- architecture principle, so it is refused rather than silently allowed.
  reference_asset_ids  uuid[] not null default '{}',

  -- ── Cost: a LINK, never an amount ─────────────────────────────────────────
  -- cost_events stays the only ledger. Deliberately NOT a foreign key: cost
  -- logging is fire-and-forget (`void logImageCost(...)`) and must never be able
  -- to block or roll back an admission that already succeeded.
  cost_event_id        uuid,
  duration_ms          integer check (duration_ms is null or duration_ms >= 0),

  -- Whether this came from a sandbox/mock run. On the RECORD, not merely on
  -- config, because a persisted asset outlives the environment that produced it:
  -- without this a mock image is indistinguishable from a paid one.
  simulated            boolean not null default false,

  -- Everything a specific vendor returns that has no canonical home. Optional by
  -- construction — no provider may make a field mandatory at this layer.
  provider_metadata    jsonb not null default '{}'::jsonb,

  recorded_at          timestamptz not null default now()
);

create index if not exists asset_provenance_provider_idx
  on public.asset_provenance (provider, model);

comment on table public.asset_provenance is
  'What produced one asset. Written at admission (§21.5), append-only. Provider fields are a record, never an authority: naming a provider here permits nothing.';

comment on column public.asset_provenance.cost_event_id is
  'Link to cost_events. Intentionally not an FK: cost logging is fire-and-forget and must never be able to fail an admission. This is never an amount — cost_events is the only ledger.';

comment on column public.asset_provenance.reference_asset_ids is
  'Canonical reference assets by identity, never URL. Admission requires each to exist in the SAME project (Project Isolation).';

-- ── 4. Append-only enforcement ───────────────────────────────────────────────
--
-- In the DATABASE, not only in TypeScript, so no application bug and no
-- service-role caller can rewrite what produced an asset. Same construction as
-- workflow_evidence (20260829_workflow_instance_core.sql) and
-- atlas_authorizations (20260819_atlas_authorizations.sql).
--
-- Note what is NOT append-only: public.assets itself. An asset's visibility,
-- status and storage location are meant to change (publish it, archive it, move
-- the bytes) — that is precisely the point of separating identity from location.
-- Its PROVENANCE is what must never change.

create or replace function public.asset_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    '% is append-only: % is not permitted', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists asset_provenance_no_update on public.asset_provenance;
create trigger asset_provenance_no_update
  before update on public.asset_provenance
  for each row execute function public.asset_reject_mutation();

/*
 * DELETE is refused ONLY while the asset still exists.
 *
 * A flat no-delete trigger — the shape `workflow_evidence` uses — deadlocks
 * this table, and the local SQL suite caught it: `asset_provenance.asset_id`
 * is `on delete cascade`, so deleting an asset fires this trigger for its
 * provenance row, the trigger raises, and the delete fails. That would make
 * every asset with provenance permanently undeletable AND, because
 * `assets.project_id` cascades from `projects`, would make a project with any
 * asset undeletable too. `workflow_evidence` never hits this because it
 * references its parent with `on delete restrict` — it forbids the parent
 * delete outright rather than cascading into an append-only child.
 *
 * The property actually worth protecting is narrower than "never deleted": it
 * is that provenance must never be REWRITTEN, and must never disappear while
 * the asset it explains survives — an asset nobody can account for is exactly
 * what §21.5 forbids. Provenance vanishing TOGETHER WITH its asset is not a
 * loss of history; it is the whole record being retired at once, which project
 * deletion and erasure requests both legitimately need.
 *
 * The check is exact rather than heuristic. In a cascade Postgres deletes the
 * parent first, so by the time this BEFORE DELETE fires the asset row is
 * already gone inside the transaction; a direct `delete from asset_provenance`
 * finds it still present. So "is the asset still there?" distinguishes the two
 * cases precisely, with no flag to set and none to forget.
 */
create or replace function public.asset_provenance_reject_orphan_delete()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.assets where id = old.asset_id) then
    raise exception
      'asset_provenance is append-only: DELETE is not permitted while asset % exists', old.asset_id
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists asset_provenance_no_delete on public.asset_provenance;
create trigger asset_provenance_no_delete
  before delete on public.asset_provenance
  for each row execute function public.asset_provenance_reject_orphan_delete();

-- ── 5. Row-level security ────────────────────────────────────────────────────
--
-- The owner-scoped project-native pattern used by cost_events, approvals,
-- media_scripts and media_news_items (20260613_media_rls_hardening.sql).
-- service_role (the admin client the media routes use) bypasses RLS, so route
-- behaviour is unchanged; these policies grant the OWNER access via the
-- anon/authenticated client, which otherwise has none.

alter table public.assets            enable row level security;
alter table public.asset_provenance  enable row level security;

drop policy if exists "assets_owner" on public.assets;
create policy "assets_owner" on public.assets
  for all using (
    project_id in (select id from public.projects where owner_id = auth.uid())
  );

-- Provenance inherits the asset's scope. Written as a subquery against assets so
-- there is ONE ownership rule; duplicating the projects lookup here would let the
-- two drift apart, and provenance is the more sensitive of the two.
drop policy if exists "asset_provenance_owner" on public.asset_provenance;
create policy "asset_provenance_owner" on public.asset_provenance
  for all using (
    asset_id in (
      select a.id from public.assets a
      join public.projects p on p.id = a.project_id
      where p.owner_id = auth.uid()
    )
  );

-- ── 6. The proof path's link ─────────────────────────────────────────────────
--
-- ONE existing table gains ONE nullable column, so that the Phase 1 proof path
-- (article hero images) produces a link that actually survives.
--
-- THIS COLUMN IS THE LEGACY BOUNDARY, made visible in the schema:
--
--   website_content.hero_image_url    text  — LEGACY. A delivery URL. It is what
--                                             every existing row has, it is what
--                                             the publish sync reads, and it is
--                                             NOT an identity (§21.7).
--   website_content.hero_asset_id     uuid  — CANONICAL. The durable identity.
--                                             NULL on every pre-existing row,
--                                             and that null is meaningful: it
--                                             says "this hero predates the asset
--                                             system", not "this hero is broken".
--
-- Both are kept deliberately. Phase 1 is forward-only: no existing row is
-- rewritten, and no existing URL is reinterpreted as an asset. The two columns
-- coexisting is what makes legacy media legible AS legacy rather than silently
-- converted.
--
-- ON DELETE SET NULL rather than CASCADE: deleting an asset must never delete an
-- article. The article losing its canonical hero is a recoverable state; the
-- article disappearing is not.

alter table public.website_content
  add column if not exists hero_asset_id uuid
    references public.assets(id) on delete set null;

create index if not exists website_content_hero_asset_idx
  on public.website_content (hero_asset_id)
  where hero_asset_id is not null;

comment on column public.website_content.hero_asset_id is
  'Canonical asset identity for the hero image (Phase 1, forward-only). NULL means the row predates the asset system and hero_image_url is a legacy delivery URL — not that anything is wrong.';

-- ── 7. Verify ────────────────────────────────────────────────────────────────

select 'assets'           as table_name, count(*) as rows from public.assets
union all
select 'asset_provenance', count(*) from public.asset_provenance;
