-- DESIGN ONLY / NOT A CANONICAL MIGRATION / DO NOT EXECUTE AGAINST PRODUCTION.
-- Issue #604 Stage 1: proposed future owner-approved GitHub mapping.
-- Must be independently security-reviewed and converted with Supabase CLI's
-- migration new command, checked against the live migration ledger, and explicitly
-- approved before any real schema write or Data API activation.
--
-- Caution: Supabase Data API auto-exposure changes effective 2026-10-30.
-- Creating this table alone is not a working endpoint. An explicit, separately
-- reviewed API exposure and privilege decision is required. Never bypass RLS.

-- The foreign key must enforce *both* the project identity AND its owner;
-- otherwise privileged code can incorrectly attach another owner's project.
-- PostgreSQL requires a unique/nonpartial referenced key on both columns.
-- This index changes an EXISTING projects table if ever applied live:
-- separate review of locks, index size, rollback and migration ledger required.
create unique index atlas_github_projects_id_owner_key
  on public.projects(id,owner_id);

create table public.atlas_owner_github_bindings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  owner_user_id uuid not null references auth.users(id),
  constraint atlas_owner_github_project_owner_fk
    foreign key (project_id,owner_user_id)
    references public.projects(id,owner_id) on delete restrict,
  project_slug text not null
    check (project_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  installation_id bigint not null check (installation_id > 0),
  repository_id bigint not null check (repository_id > 0),
  repository_owner_id bigint not null check (repository_owner_id > 0),
  repository_owner text not null
    check (repository_owner ~ '^[A-Za-z0-9_.-]{1,100}$'),
  repository_name text not null
    check (repository_name ~ '^[A-Za-z0-9_.-]{1,100}$'),
  default_branch text not null
    check (length(default_branch) between 1 and 120),
  state text not null default 'pending'
    check (state in ('pending', 'approved', 'revoked')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint atlas_owner_github_approval_consistency check (
    state <> 'approved' or
    (approved_by = owner_user_id and approved_at is not null
      and revoked_at is null)
  ),
  constraint atlas_owner_github_revocation_consistency check (
    state <> 'revoked' or revoked_at is not null
  )
);

-- Until a monorepo/path-scope model is separately reviewed, do not bind
-- one repository to multiple projects or a project to multiple active repos.
create unique index atlas_owner_github_one_active_project
  on public.atlas_owner_github_bindings(owner_user_id,project_id)
  where state='approved';
create unique index atlas_owner_github_one_active_repo
  on public.atlas_owner_github_bindings(owner_user_id,repository_id)
  where state='approved';

create index atlas_owner_github_owner_project_lookup
  on public.atlas_owner_github_bindings(owner_user_id,project_id,state);

alter table public.atlas_owner_github_bindings enable row level security;

-- Owner may read only their own and owned-project mapping metadata.
-- No browser/Pling/user API can create, approve, revoke or mutate rows.
-- Stage 1 proposes NO mutation endpoint or permanent secret storage.
-- Supabase's postgres/supabase_admin default ACLs can GRANT ALL to
-- service_role, authenticated and anon on new public tables. Merely GRANTing
-- SELECT does NOT remove the inherited DML privileges. Explicitly revoke
-- EVERY default role first, including the RLS-bypassing service_role.
revoke all on public.atlas_owner_github_bindings from public, anon, authenticated, service_role;
grant select on public.atlas_owner_github_bindings to authenticated;
grant select on public.atlas_owner_github_bindings to service_role;

create policy atlas_owner_github_owner_read
  on public.atlas_owner_github_bindings
  for select to authenticated
  using (
    owner_user_id = (select auth.uid()) and
    exists (
      select 1
      from public.projects p
      where p.id = atlas_owner_github_bindings.project_id
        and p.owner_id = (select auth.uid())
    )
  );

-- No insert/update/delete policy, grant, SECURITY DEFINER function,
-- service-role write endpoint or automatic owner approval.
-- A later approved write API must independently confirm project membership,
-- immutable provider repo identity, owner approval and append-only audit.
