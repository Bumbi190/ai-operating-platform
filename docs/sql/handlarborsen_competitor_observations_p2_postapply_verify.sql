-- READ-ONLY OPERATOR PREFLIGHT / POST-APPLY VERIFICATION.
-- Execute only after a separately authorized migration. It mutates nothing.
-- Every expected result is documented; never use it to bypass Migration Guard.
SELECT current_setting('server_version') AS server_version,
  (SELECT count(*) FROM public.projects
    WHERE id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid AND slug = 'handlarborsen')
    AS matching_handlarborsen_project,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'handlarborsen_competitor_observations')
    AS competitor_table_count;

-- After apply: exists=true, RLS/FORCE=true, no policies.
SELECT c.relname AS table_name,
  c.relrowsecurity AS rls_on,
  c.relforcerowsecurity AS force_rls,
  (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'handlarborsen_competitor_observations';

-- After apply: anon/authenticated no privileges; service role SELECT and INSERT
-- only. Global role BYPASSRLS does not grant UPDATE/DELETE privileges.
SELECT role_name,
  has_table_privilege(role_name, 'public.handlarborsen_competitor_observations', 'SELECT') AS can_select,
  has_table_privilege(role_name, 'public.handlarborsen_competitor_observations', 'INSERT') AS can_insert,
  has_table_privilege(role_name, 'public.handlarborsen_competitor_observations', 'UPDATE') AS can_update,
  has_table_privilege(role_name, 'public.handlarborsen_competitor_observations', 'DELETE') AS can_delete,
  has_table_privilege(role_name, 'public.handlarborsen_competitor_observations', 'TRUNCATE') AS can_truncate
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name);

-- After apply: only one unique primary key over project/source/UTC date.
SELECT conname, pg_get_constraintdef(oid) AS contract
FROM pg_constraint
WHERE conrelid='public.handlarborsen_competitor_observations'::regclass
ORDER BY conname;

-- After apply: new ledger name exactly once.
SELECT name, count(*) AS ledger_count
FROM supabase_migrations.schema_migrations
WHERE name='handlarborsen_competitor_observations_v1'
GROUP BY name;
