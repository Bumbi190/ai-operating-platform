-- PROPOSED ONLY — NEVER AUTO-APPLY.
-- Omnira Web Studio real-vehicle original capture, P1b. This file is a review
-- artifact, NOT a committed Supabase migration. No customer data is inserted.
-- Use only after owner approval + isolated pgTAP/SQL fixture + storage API setup.
-- Handlarborsen B2B is a DIFFERENT Supabase project and MUST NOT be touched.
-- Storage bucket must first be created by Storage API / Dashboard as PRIVATE,
-- max file 15,000,000 bytes, allowed image/png,image/jpeg,image/webp.
-- Do NOT INSERT/UPDATE storage.buckets or storage.objects directly.
--
-- Preconditions: public.projects(id uuid primary key, owner_id uuid) exists.
-- This proposed table has no direct client INSERT/UPDATE/DELETE policies.
-- Any future server writer must enforce authenticated owner and listing binding,
-- record source rights and never auto-approve a 3D model.

begin;

create table if not exists public.website_vehicle_capture_listings (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  state text not null default 'evidence_only'
    check (state in ('evidence_only','revoked')),
  created_at timestamptz not null default now(),
  unique (id, project_id, owner_id)
);
comment on table public.website_vehicle_capture_listings is
  'DRAFT only: owner-scoped future vehicle reference binding; not sale or public verification.';

create table if not exists public.website_vehicle_capture_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  project_id uuid not null,
  owner_id uuid not null,
  capture_id uuid not null,
  view_kind text not null check (view_kind in (
    'front_three_quarter','side','rear_three_quarter',
    'opposite_side_front','wheel_detail','trim_identifier')),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_format text not null check(file_format in ('png','jpg','webp')),
  object_path text not null unique,
  recorded_bytes bigint not null check(recorded_bytes between 20000 and 15000000),
  recorded_at timestamptz not null default now(),
  constraint vehicle_capture_listing_binding foreign key
    (listing_id,project_id,owner_id)
    references public.website_vehicle_capture_listings(id,project_id,owner_id)
    on delete restrict,
  constraint vehicle_capture_unique_angle unique(listing_id,capture_id,view_kind),
  constraint vehicle_capture_immutable_path check(
    object_path = 'vehicle-captures/'||project_id::text||'/'||
      listing_id::text||'/'||capture_id::text||'/'||
      view_kind||'/'||sha256||'.'||file_format
  )
);
comment on table public.website_vehicle_capture_photos is
  'DRAFT only: private original photo metadata for future authenticated reviewer; not a client upload authorization.';

create index if not exists website_vehicle_capture_listings_owner_project_idx
  on public.website_vehicle_capture_listings (owner_id,project_id,state);
create index if not exists website_vehicle_capture_photos_owner_listing_idx
  on public.website_vehicle_capture_photos (owner_id,project_id,listing_id);

alter table public.website_vehicle_capture_listings enable row level security;
alter table public.website_vehicle_capture_photos enable row level security;

revoke all on public.website_vehicle_capture_listings from anon,authenticated;
revoke all on public.website_vehicle_capture_photos from anon,authenticated;
grant select on public.website_vehicle_capture_listings to authenticated;
grant select on public.website_vehicle_capture_photos to authenticated;

-- Even if a privileged writer accidentally recorded the wrong owner_id,
-- RLS requires the current real project owner, not just the inserted label.
create policy vehicle_capture_listing_owner_read
on public.website_vehicle_capture_listings
for select to authenticated
using (
  owner_id=(select auth.uid())
  and exists (
    select 1 from public.projects p
    where p.id=project_id and p.owner_id=(select auth.uid())
  )
);

create policy vehicle_capture_photo_owner_read
on public.website_vehicle_capture_photos
for select to authenticated
using (
  owner_id=(select auth.uid())
  and exists (
    select 1 from public.website_vehicle_capture_listings l
    join public.projects p on p.id=l.project_id
    where l.id=public.website_vehicle_capture_photos.listing_id
      and l.project_id=public.website_vehicle_capture_photos.project_id
      and l.owner_id=public.website_vehicle_capture_photos.owner_id
      and l.state='evidence_only'
      and p.owner_id=(select auth.uid())
  )
);

-- This SELECT policy is deliberately restricted to authenticated-object READ
-- operations; it does not grant listing, writing, upserting, moving or deleting.
-- Never add an unrestricted public bucket / service-role front-end fallback.
-- The Storage service handles all actual object writes via its API.
create policy vehicle_originals_authenticated_get_only
on storage.objects
for select to authenticated
using (
  bucket_id='vehicle-originals-private'
  and storage.allow_any_operation(array[
    'object.get_authenticated',
    'object.get_authenticated_info'
  ])
  and exists (
    select 1 from public.website_vehicle_capture_photos ph
    join public.website_vehicle_capture_listings l
      on l.id=ph.listing_id and l.project_id=ph.project_id
      and l.owner_id=ph.owner_id
    join public.projects p on p.id=l.project_id
    where ph.object_path=name
      and ph.owner_id=(select auth.uid())
      and l.state='evidence_only'
      and p.owner_id=(select auth.uid())
  )
);

commit;

-- MANDATORY before applying in future:
-- 1. Exercise these RLS rules with A/B owner JWTs and anonymous user
--    in an ISOLATED Supabase/Postgres+Storage fixture, no live objects.
-- 2. Confirm server-authenticated download behavior and approved-only objects.
-- 3. Confirm denied operations: list, insert, overwrite, move, delete,
--    wrong project/listing, revoked listing, absent photo record.
-- 4. Verify 15MB MIME and bucket private limits through Storage API settings.
-- 5. Check DB advisors/security lint, migration guard, and rollback strategy.
-- 6. Obtain explicit owner approval to install any schema, policy or bucket.
