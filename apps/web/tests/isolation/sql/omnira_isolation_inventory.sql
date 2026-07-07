-- ─────────────────────────────────────────────────────────────────────────────
-- PR-0 / Isolation measurement layer — catalog enumeration function
--
-- Read-only. Returns one row per table in the `public` schema with the facts the
-- inventory-drift check needs: does it have a project_id, is RLS enabled, how many
-- policies exist, is project_id nullable, and is there an index on project_id.
--
-- This is a MEASUREMENT artifact (PR-0). It changes no data and fixes nothing.
-- Run once in the Supabase test branch (and prod, read-only) so `enumerate.ts`
-- can call it via supabase-js `.rpc('omnira_isolation_inventory')`.
--
-- Security: security definer, granted to service_role only (matches the existing
-- pattern of claim_runs / cron_job_status). Never exposed to anon/authenticated.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.omnira_isolation_inventory()
returns table (
  table_name           text,
  has_project_id       boolean,
  rls_enabled          boolean,
  policy_count         integer,
  project_id_nullable  boolean,
  has_project_id_index boolean
)
language sql
security definer
set search_path to ''
as $$
  select
    c.relname::text as table_name,

    exists (
      select 1 from information_schema.columns col
      where col.table_schema = 'public'
        and col.table_name   = c.relname
        and col.column_name  = 'project_id'
    ) as has_project_id,

    c.relrowsecurity as rls_enabled,

    (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policy_count,

    coalesce((
      select (col.is_nullable = 'YES')
      from information_schema.columns col
      where col.table_schema = 'public'
        and col.table_name   = c.relname
        and col.column_name  = 'project_id'
    ), false) as project_id_nullable,

    exists (
      select 1
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
      where i.indrelid = c.oid and a.attname = 'project_id'
    ) as has_project_id_index

  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'          -- ordinary tables only
  order by c.relname;
$$;

revoke all  on function public.omnira_isolation_inventory() from public, anon, authenticated;
grant execute on function public.omnira_isolation_inventory() to service_role;
