\set ON_ERROR_STOP on
\echo [rls] Starting PostgreSQL 17 real role and RLS negative checks
-- All user IDs, repo IDs and rows in this file are SYNTHETIC.
-- Bootstrap supplied in bootstrap_pg17.sql, policy from PROPOSAL.sql.

insert into public.atlas_owner_github_bindings
(project_id, owner_user_id, project_slug, installation_id, repository_id,
 repository_owner_id, repository_owner, repository_name, default_branch,
 state, approved_by, approved_at)
values
('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
 'family-project',544,1001,321,'ExampleOwner','family-repo','main','approved',
 '11111111-1111-4111-8111-111111111111','2026-10-28T20:00:00Z'),
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',
 'cars-project',544,1002,321,'ExampleOwner','cars-repo','main','approved',
 '11111111-1111-4111-8111-111111111111','2026-10-28T20:00:00Z'),
('55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999999',
 'foreign-project',544,2001,321,'ExampleOwner','foreign-repo','main','approved',
 '99999999-9999-4999-8999-999999999999','2026-10-28T20:00:00Z');

-- The live Supabase project grants ALL default privileges on newly created
-- public tables to service_role. The table must not inherit DML authority.
do $$
begin
 if has_table_privilege('service_role','public.atlas_owner_github_bindings','INSERT')
  or has_table_privilege('service_role','public.atlas_owner_github_bindings','UPDATE')
  or has_table_privilege('service_role','public.atlas_owner_github_bindings','DELETE') then
    raise exception 'FAIL: service_role inherited dangerous write privileges';
 end if;
 raise notice 'PASS: service_role restricted to SELECT despite default grants';
end $$;

-- A deliberately invalid privileged admission must be blocked by composite
-- project+owner FK, not merely hidden later by the RLS SELECT policy.
do $$
begin
 begin
   insert into public.atlas_owner_github_bindings
    (project_id,owner_user_id,project_slug,installation_id,repository_id,
     repository_owner_id,repository_owner,repository_name,default_branch,
     state,approved_by,approved_at)
   values
    ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',
     'foreign-project',544,9001,321,'ExampleOwner','cross-tenant','main',
     'approved','11111111-1111-4111-8111-111111111111','2026-10-28T20:00:00Z');
 exception when foreign_key_violation then
   raise notice 'PASS: cross-owner privileged insert was denied at FK boundary';
   return;
 end;
 raise exception 'FAIL: cross-owner privileged insert was accepted';
end $$;

-- Owner A may see only A's approved mappings, NEVER B's.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
declare count_a integer; count_foreign integer;
begin
 select count(*) into count_a from public.atlas_owner_github_bindings
  where state='approved';
 select count(*) into count_foreign from public.atlas_owner_github_bindings
  where repository_id=2001;
 if count_a <> 2 or count_foreign <> 0 then
   raise exception 'FAIL owner A: approved=% foreign=%',count_a,count_foreign;
 end if;
 raise notice 'PASS: owner A sees 2 approved own mappings and 0 foreign';
end $$;
reset role;

-- Owner B can see their own mapping, cannot see A's records.
set role authenticated;
select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
do $$
declare count_b integer; count_foreign integer;
begin
 select count(*) into count_b from public.atlas_owner_github_bindings
  where state='approved';
 select count(*) into count_foreign from public.atlas_owner_github_bindings
  where repository_id in (1001,1002);
 if count_b <> 1 or count_foreign <> 0 then
   raise exception 'FAIL owner B: approved=% foreign=%',count_b,count_foreign;
 end if;
 raise notice 'PASS: owner B sees 1 approved own mapping and 0 foreign';
end $$;
reset role;

-- No principal => RLS denies all rows (not unscoped).
set role authenticated;
select set_config('request.jwt.claim.sub','',false);
do $$
begin
 if (select count(*) from public.atlas_owner_github_bindings) <> 0 then
   raise exception 'FAIL: missing auth.uid leaked mappings';
 end if;
 raise notice 'PASS: missing auth.uid sees no mappings';
end $$;
reset role;

-- The role authenticated has SELECT only: it must not write even to own rows.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
begin
 begin
   delete from public.atlas_owner_github_bindings where repository_id=1001;
 exception when insufficient_privilege then
   raise notice 'PASS: DELETE denied';
   return;
 end;
 raise exception 'FAIL: authenticated DELETE permitted';
end $$;
do $$
begin
 begin
   update public.atlas_owner_github_bindings set repository_name='changed'
    where repository_id=1001;
 exception when insufficient_privilege then
   raise notice 'PASS: UPDATE denied';
   return;
 end;
 raise exception 'FAIL: authenticated UPDATE permitted';
end $$;
do $$
begin
 begin
   insert into public.atlas_owner_github_bindings
      (project_id,owner_user_id,project_slug,installation_id,repository_id,
       repository_owner_id,repository_owner,repository_name,default_branch)
     values
      ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
       'family-project',544,3001,321,'ExampleOwner','insert-test','main');
 exception when insufficient_privilege then
   raise notice 'PASS: INSERT denied';
   return;
 end;
 raise exception 'FAIL: authenticated INSERT permitted';
end $$;
reset role;

-- Anonymous and Pling have NO SELECT grant and no mutation capability.
set role anon;
do $$
begin
 begin
   perform 1 from public.atlas_owner_github_bindings;
 exception when insufficient_privilege then
   raise notice 'PASS: anon SELECT denied';
   return;
 end;
 raise exception 'FAIL: anon SELECT permitted';
end $$;
reset role;
set role pling_executor;
do $$
begin
 begin
   perform 1 from public.atlas_owner_github_bindings;
 exception when insufficient_privilege then
   raise notice 'PASS: Pling SELECT denied';
   return;
 end;
 raise exception 'FAIL: Pling SELECT permitted';
end $$;
reset role;

-- This fixture mimics Supabase's service_role bypass, proving why the app MUST
-- never pass a service-role client or credential to Nova or Pling.
set role service_role;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
declare n integer;
begin
 select count(*) into n from public.atlas_owner_github_bindings;
 if n <> 3 then
  raise exception 'FAIL: fixture service_role bypass result=%',n;
 end if;
 raise notice 'PASS: service_role BYPASSES RLS as expected – runtime MUST scope';
end $$;
reset role;

-- Confirm unauthorized attempts were rolled back, unchanged three rows.
do $$
begin
 if (select count(*) from public.atlas_owner_github_bindings) <> 3 then
   raise exception 'FAIL: unauthorized change modified fixture';
 end if;
 raise notice 'PASS: final fixture unchanged and strictly three rows';
end $$;

\echo [rls] ALL real PostgreSQL 17 permission/RLS assertions PASS
