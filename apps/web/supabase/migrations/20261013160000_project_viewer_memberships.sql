-- Project viewer membership foundation: DATA ONLY, not project-data authorization.
-- No projects / API RLS policy is broadened by this migration.
create table if not exists public.project_viewer_memberships (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role = 'viewer'),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.project_viewer_memberships enable row level security;
alter table public.project_viewer_memberships force row level security;

revoke all on public.project_viewer_memberships from public, anon, authenticated;
grant select, insert, delete on public.project_viewer_memberships to authenticated;

-- Owners can inspect memberships; a viewer can inspect their own membership.
create policy project_viewers_select
on public.project_viewer_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
);

-- Only the actual project owner may add viewers. Role cannot be elevated.
create policy project_viewers_owner_insert
on public.project_viewer_memberships for insert to authenticated
with check (
  role = 'viewer'
  and exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
);

-- Revocation is deletion only. No UPDATE privilege or policy is provided.
create policy project_viewers_owner_delete
on public.project_viewer_memberships for delete to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  )
);

comment on table public.project_viewer_memberships is
'Project viewer grants registry only. Not sufficient to read project resources, use Atlas tools or perform writes.';
