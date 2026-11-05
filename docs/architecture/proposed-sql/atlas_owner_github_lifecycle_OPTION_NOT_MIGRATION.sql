-- ISSUE #604 – ISOLATED LIFECYCLE ALTERNATIVE, NOT A CANONICAL MIGRATION.
-- DO NOT RUN ON LIVE SUPABASE. Applies to synthetic Stage 1 SQL in PG17 only.
-- Requires separate owner decision + true independent security/retention review.
--
-- Goal: stop mapping use on revoke, keep project-owned audit AFTER unlink,
-- allow project/account erasure without overriding existing projects cascade.
-- This changes future FK behavior, not production. No real audit API/crypto
-- approval receipts and no provider token revocation are implemented here.
--
-- Binding data is a *component* of the project; data protection after erasure
-- takes priority over indefinitely retaining personally linkable records.
alter table public.atlas_owner_github_bindings
  drop constraint atlas_owner_github_project_owner_fk,
  add constraint atlas_owner_github_project_owner_fk
    foreign key (project_id,owner_user_id)
    references public.projects(id,owner_id)
    on delete cascade;

-- An owner's auth-user deletion must not be stopped by a detached row.
alter table public.atlas_owner_github_bindings
  drop constraint atlas_owner_github_bindings_owner_user_id_fkey,
  add constraint atlas_owner_github_bindings_owner_user_id_fkey
    foreign key (owner_user_id) references auth.users(id)
    on delete cascade;

-- Approved-by points at the same owner for approved rows; no review FK may
-- hold up a legitimate user deletion after project cascade.
alter table public.atlas_owner_github_bindings
  drop constraint atlas_owner_github_bindings_approved_by_fkey,
  add constraint atlas_owner_github_bindings_approved_by_fkey
    foreign key (approved_by) references auth.users(id)
    on delete cascade;

-- Audit history belongs to the project, not to the currently linked row:
-- a binding may be unlinked without destroying its project-level event trail.
-- No FK on binding_id is INTENTIONAL; it is an immutable correlation label.
-- Deleting the actual project/account also erases the linked audit metadata.
create table public.atlas_owner_github_binding_events (
  event_id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  owner_user_id uuid not null,
  constraint atlas_owner_github_events_project_owner_fk
    foreign key (project_id,owner_user_id)
    references public.projects(id,owner_id) on delete cascade,
  binding_id uuid not null,
  event_sequence integer not null check (event_sequence > 0),
  repository_id bigint not null check (repository_id > 0),
  event_kind text not null
    check (event_kind in ('approved','revoked','unlinked')),
  -- Synthetic tests only. A matching value is NOT independent proof of
  -- human authorization. Design signed/replay-resistant receipts separately.
  decision_receipt_sha256 text not null
    check (decision_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default now(),
  unique(binding_id,event_sequence)
);
create index atlas_owner_github_event_owner_project_lookup
  on public.atlas_owner_github_binding_events(owner_user_id,project_id,occurred_at);

alter table public.atlas_owner_github_binding_events enable row level security;
-- The real Supabase instance may auto-grant ALL table privileges to API roles.
-- Explicitly remove them before granting narrow owner read access.
revoke all on public.atlas_owner_github_binding_events
  from public, anon, authenticated, service_role;
grant select on public.atlas_owner_github_binding_events to authenticated;
grant select on public.atlas_owner_github_binding_events to service_role;
create policy atlas_owner_github_event_owner_read
  on public.atlas_owner_github_binding_events
  for select to authenticated
  using (
    owner_user_id = (select auth.uid()) and
    exists (
      select 1 from public.projects p
      where p.id = atlas_owner_github_binding_events.project_id
        and p.owner_id = (select auth.uid())
    )
  );

-- No INSERT / UPDATE / DELETE grants to anon/authenticated/service_role.
-- No production event writer or service-role bypass authorization is created.
-- Review a signed, SERIALIZED owner-approval/revocation event API separately.
-- Actual source reads must re-validate live project/binding and project SHA
-- before any GitHub grant. Prior GitHub tokens may stay valid until revoked
-- through a provider-specific control; DB cascade alone is not sufficient.
