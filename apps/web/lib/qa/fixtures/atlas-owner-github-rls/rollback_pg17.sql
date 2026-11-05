\set ON_ERROR_STOP on
\echo [rollback] Verifying entirely synthetic proposed schema rollback
-- This rollback is ONLY for the disposable test fixture.
-- In production NEVER drop a populated approval table without backup/consent.
do $$
declare n integer;
begin
 if to_regclass('public.atlas_owner_github_bindings') is null
   or to_regclass('public.atlas_github_projects_id_owner_key') is null then
    raise exception 'FAIL: prerequisite test table or supporting index absent';
 end if;
 select count(*) into n from public.atlas_owner_github_bindings;
 if n <> 3 then raise exception 'FAIL: pre-rollback expected 3 synthetic bindings; got %',n; end if;
 raise notice 'PASS: isolated candidate objects and 3 synthetic rows present before rollback';
end $$;

begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';
drop table public.atlas_owner_github_bindings restrict;
drop index public.atlas_github_projects_id_owner_key restrict;
commit;

do $$
declare project_count int; user_count int;
begin
 if to_regclass('public.atlas_owner_github_bindings') is not null then
   raise exception 'FAIL: ephemeral bindings table remains';
 end if;
 if to_regclass('public.atlas_github_projects_id_owner_key') is not null then
   raise exception 'FAIL: ephemeral projects index remains';
 end if;
 if to_regclass('public.projects') is null
   or to_regclass('auth.users') is null then
   raise exception 'FAIL: baseline projects/users tables were removed';
 end if;
 select count(*) into project_count from public.projects;
 select count(*) into user_count from auth.users;
 if project_count <> 3 or user_count <> 2 then
    raise exception 'FAIL: baseline data changed, projects %, users %', project_count,user_count;
 end if;
 raise notice 'PASS: rollback removed only synthetic candidate table/index, preserved 3 projects/2 users';
end $$;

-- Confirm no loss of the underlying owner policy or baseline index.
do $$
begin
 if not exists(
   select 1 from pg_policies
   where schemaname='public' and tablename='projects'
     and policyname='projects_owner'
 ) then raise exception 'FAIL: original projects RLS owner policy was lost'; end if;
 raise notice 'PASS: existing projects owner policy retained';
end $$;
\echo [rollback] PASS: disposable PG17 candidate rollback finished
