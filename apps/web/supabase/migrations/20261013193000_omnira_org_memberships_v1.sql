-- Omnira organization membership foundation (schema only).
-- This does not grant access to existing project resources, Atlas tools or API routes.
create table if not exists public.omnira_organization_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','collaborator')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint omnira_owner_not_revoked check (role <> 'owner' or revoked_at is null)
);

-- At most one active owner; all role creation/updates require an audited
-- trusted backend or a separately reviewed owner-only RPC.
create unique index if not exists omnira_single_active_owner
on public.omnira_organization_memberships ((role))
where role = 'owner' and revoked_at is null;

alter table public.omnira_organization_memberships enable row level security;
alter table public.omnira_organization_memberships force row level security;

revoke all on public.omnira_organization_memberships from public, anon, authenticated;
grant select on public.omnira_organization_memberships to authenticated;

do $policy$ begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'omnira_organization_memberships'
      and policyname = 'omnira_member_own_status'
  ) then
    create policy omnira_member_own_status
    on public.omnira_organization_memberships
    for select to authenticated
    using (user_id = (select auth.uid()));
  end if;
end $policy$;

comment on table public.omnira_organization_memberships is
'Role registry only: no automatic permissions for existing project resources or execution. Managed by audited backend.';

-- No INSERT/UPDATE/DELETE grants or policies to authenticated users.
-- No automatic owner creation; establish owner identity only after verifying
-- existing auth principal and approving a separate one-time bootstrap.
