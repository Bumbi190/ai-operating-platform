\set ON_ERROR_STOP on
-- Disposable PostgreSQL fixture only. Read-only production pg_policies
-- verified the following real parent-table RLS rules on 2026-10-28:
-- projects_owner:      FOR ALL USING(owner_id=auth.uid())
-- conversations_owner: FOR ALL USING(user_id=auth.uid())
-- runs_owner:          FOR ALL USING(project_id IN (SELECT projects.id
--                         FROM projects WHERE owner_id=auth.uid()))
-- The real tables contain many more columns, constraints and triggers.
-- This overlay makes the narrow test enforce the canonical parent RLS
-- *predicates*; it does not claim to replay a full production schema.
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.runs enable row level security;
alter table public.platform_config enable row level security;
alter table public.project_lifecycle enable row level security;

create policy projects_owner on public.projects
 for all to public using (owner_id=auth.uid());
create policy conversations_owner on public.conversations
 for all to public using (user_id=auth.uid());
create policy runs_owner on public.runs
 for all to public using (
  project_id in (
   select p.id from public.projects p where p.owner_id=auth.uid()
  )
 );
-- Production grants SELECT to authenticated on runs, constrained by RLS.
grant select on public.runs to authenticated;

-- Authenticated owner may read project/conversation/run. Another user cannot
-- see any of them even though the Postgres role has SELECT.
set role authenticated;
set "request.jwt.claim.sub"='77777777-7777-4777-8777-777777777777';
do $$
begin
 if (select count(*) from public.projects)<>1 or
    (select count(*) from public.conversations)<>1 or
    (select count(*) from public.runs)<>1 then
  raise exception 'PARENT_RLS_OWNER_CANNOT_READ_OWN_ROWS';
 end if;
end $$;
set "request.jwt.claim.sub"='88888888-8888-4888-8888-888888888888';
do $$
begin
 if (select count(*) from public.projects)<>0 or
    (select count(*) from public.conversations)<>0 or
    (select count(*) from public.runs)<>0 then
  raise exception 'PARENT_RLS_FOREIGN_CAN_READ_OWNER_ROWS';
 end if;
end $$;
reset role;
set role service_role;
do $$
begin
 if (select count(*) from public.projects)<>1 or
    (select count(*) from public.conversations)<>1 or
    (select count(*) from public.runs)<>1 then
  raise exception 'PARENT_RLS_SERVICE_ROLE_CANNOT_READ_FIXTURE';
 end if;
end $$;
reset role;
select 'FAMILY_WEEKLY_PRODUCTION_PARENT_RLS_PREDICATES_PASS' as result;
