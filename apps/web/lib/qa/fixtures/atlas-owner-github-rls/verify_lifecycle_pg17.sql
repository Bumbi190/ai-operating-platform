\set ON_ERROR_STOP on
\echo [lifecycle] Real PostgreSQL 17 candidate test – SYNTHETIC IDs and rows ONLY

-- The baseline bootstrap inserts owner A's two projects and owner B's one.
-- All binding/receipt values below are synthetic and not provider tokens.
insert into public.atlas_owner_github_bindings
(id,project_id,owner_user_id,project_slug,installation_id,repository_id,
 repository_owner_id,repository_owner,repository_name,default_branch,
 state,approved_by,approved_at)
values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
 'family-project',544,1001,321,'ExampleOwner','family-repo','main','approved',
 '11111111-1111-4111-8111-111111111111','2026-10-28T20:00:00Z'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',
 'cars-project',544,1002,321,'ExampleOwner','cars-repo','main','approved',
 '11111111-1111-4111-8111-111111111111','2026-10-28T20:00:00Z'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999999',
 'foreign-project',544,2001,321,'ExampleOwner','foreign-repo','main','approved',
 '99999999-9999-4999-8999-999999999999','2026-10-28T20:00:00Z');

insert into public.atlas_owner_github_binding_events
 (project_id,owner_user_id,binding_id,event_sequence,repository_id,event_kind,decision_receipt_sha256)
values
 ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,1001,'approved',repeat('a',64)),
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,1002,'approved',repeat('b',64)),
 ('55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999999',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,2001,'approved',repeat('c',64));

do $$
begin
 if (select count(*) from public.atlas_owner_github_bindings) <> 3 or
    (select count(*) from public.atlas_owner_github_binding_events) <> 3 then
   raise exception 'FAIL: candidate synthetic bind/event seed';
 end if;
 raise notice 'PASS: approved bindings and per-project audit seeds created';
end $$;

-- Revised composite FK still blocks cross-owner mapping even in CASCADE model.
do $$
begin
 begin
  insert into public.atlas_owner_github_bindings
   (project_id,owner_user_id,project_slug,installation_id,repository_id,
    repository_owner_id,repository_owner,repository_name,default_branch,state,
    approved_by,approved_at)
  values('55555555-5555-4555-8555-555555555555',
   '11111111-1111-4111-8111-111111111111',
   'foreign-project',544,9001,321,'ExampleOwner','forged-repo','main',
   'approved','11111111-1111-4111-8111-111111111111','2026-10-28T20:00:00Z');
 exception when foreign_key_violation then
  raise notice 'PASS: cross-owner binding still denied by composite FK';
  return;
 end;
 raise exception 'FAIL: cross-owner binding inserted';
end $$;

-- A forged audit event for a foreign-owned project must also be denied.
do $$
begin
 begin
  insert into public.atlas_owner_github_binding_events
    (project_id,owner_user_id,binding_id,event_sequence,repository_id,event_kind,decision_receipt_sha256)
  values('55555555-5555-4555-8555-555555555555',
   '11111111-1111-4111-8111-111111111111',
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,9001,'approved',repeat('d',64));
 exception when foreign_key_violation then
   raise notice 'PASS: forged cross-owner audit event denied by composite FK';
   return;
 end;
 raise exception 'FAIL: forged cross-owner audit event inserted';
end $$;

-- Service-role may read audit for a verified scoped server task, but its
-- inherited default DML privileges MUST be revoked even though it bypasses RLS.
do $$
begin
 if has_table_privilege('service_role','public.atlas_owner_github_binding_events','INSERT')
    or has_table_privilege('service_role','public.atlas_owner_github_binding_events','UPDATE')
    or has_table_privilege('service_role','public.atlas_owner_github_binding_events','DELETE') then
  raise exception 'FAIL: service_role has event DML privileges';
 end if;
 raise notice 'PASS: service_role audit DML denied despite inherited ACL';
end $$;

-- Evidence is readable by the owner only, but no normal actor can mutate it.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
begin
 if (select count(*) from public.atlas_owner_github_binding_events) <> 2
   or (select count(*) from public.atlas_owner_github_bindings) <> 2 then
  raise exception 'FAIL: owner A saw foreign project audit/connection';
 end if;
 raise notice 'PASS: owner A sees own two mappings and audit entries only';
end $$;
do $$
begin
 begin
  delete from public.atlas_owner_github_binding_events where repository_id=1001;
 exception when insufficient_privilege then
  raise notice 'PASS: authenticated audit DELETE denied';
  return;
 end;
 raise exception 'FAIL: authenticated audit DELETE allowed';
end $$;
do $$
begin
 begin
  insert into public.atlas_owner_github_binding_events
   (project_id,owner_user_id,binding_id,event_sequence,repository_id,event_kind,decision_receipt_sha256)
  values('22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',9,1001,'approved',repeat('f',64));
 exception when insufficient_privilege then
  raise notice 'PASS: authenticated audit INSERT denied';
  return;
 end;
 raise exception 'FAIL: authenticated audit INSERT allowed';
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
do $$
begin
 if (select count(*) from public.atlas_owner_github_binding_events) <> 1
   or (select count(*) from public.atlas_owner_github_bindings) <> 1 then
   raise exception 'FAIL: owner B sees owner A data';
 end if;
 raise notice 'PASS: owner B is isolated from owner A data';
end $$;
reset role;

set role anon;
do $$
begin
 begin
  perform 1 from public.atlas_owner_github_binding_events;
 exception when insufficient_privilege then
  raise notice 'PASS: anonymous audit access denied';
  return;
 end;
 raise exception 'FAIL: anonymous audit read allowed';
end $$;
reset role;

set role pling_executor;
do $$
begin
 begin
  perform 1 from public.atlas_owner_github_binding_events;
 exception when insufficient_privilege then
  raise notice 'PASS: project-bound Pling cannot read global audit table';
  return;
 end;
 raise exception 'FAIL: Pling audit access permitted';
end $$;
reset role;

-- App roles may query only; a privileged *future signed owner workflow*
-- must serialize this act. Here postgres superuser simulates a transaction;
-- this is NOT implemented as a live permission endpoint.
begin;
with revoked as (
  update public.atlas_owner_github_bindings
    set state='revoked', revoked_at=clock_timestamp()
  where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and state='approved' and revoked_at is null
  returning project_id,owner_user_id,id,repository_id
)
insert into public.atlas_owner_github_binding_events
 (project_id,owner_user_id,binding_id,event_sequence,repository_id,event_kind,decision_receipt_sha256)
select project_id,owner_user_id,id,2,repository_id,'revoked',repeat('d',64)
 from revoked;
commit;

do $$
begin
 if (select count(*) from public.atlas_owner_github_bindings
       where repository_id=1001 and state='approved') <> 0 then
  raise exception 'FAIL: revoked binding still eligible for scope';
 end if;
 if (select count(*) from public.atlas_owner_github_binding_events
       where repository_id=1001) <> 2 then
  raise exception 'FAIL: approve+revoke audit history missing';
 end if;
 raise notice 'PASS: revoked binding is inactive while two audit records remain';
end $$;

-- Repeat the same guarded revocation: must be idempotent (no new event).
do $$
declare affected int;
begin
 update public.atlas_owner_github_bindings set revoked_at=clock_timestamp()
  where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and state='approved' and revoked_at is null;
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'FAIL: stale revoke mutated a revoked row'; end if;
 raise notice 'PASS: stale duplicate revocation is denied by state predicate';
end $$;

-- A detached binding may be deleted without deleting the *project's* audit.
begin;
delete from public.atlas_owner_github_bindings
  where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and state='revoked';
insert into public.atlas_owner_github_binding_events
 (project_id,owner_user_id,binding_id,event_sequence,repository_id,event_kind,decision_receipt_sha256)
values('22222222-2222-4222-8222-222222222222',
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',3,1001,'unlinked',repeat('e',64));
commit;
do $$
begin
 if exists(select 1 from public.atlas_owner_github_bindings where repository_id=1001)
  or (select count(*) from public.atlas_owner_github_binding_events
      where repository_id=1001) <> 3 then
   raise exception 'FAIL: unlink did not preserve project-owned audit';
 end if;
 raise notice 'PASS: unlinked repo has no live mapping but retains 3 project-owned events';
end $$;

-- Transfer of a project still requires a separate, audited lifecycle
-- decision; DO NOT reassign a bound project to a different owner.
do $$
begin
 begin
  update public.projects set owner_id='99999999-9999-4999-8999-999999999999'
   where id='33333333-3333-4333-8333-333333333333';
 exception when foreign_key_violation then
  raise notice 'EXPECTED BLOCKER: project ownership transfer needs explicit unlink and audit handling';
  return;
 end;
 raise exception 'FAIL: owner transfer bypassed active binding';
end $$;

-- Project deletion can proceed without being blocked by a lingering,
-- project-owned audit event, and the audit disappears for the erased project.
delete from public.projects
 where id='22222222-2222-4222-8222-222222222222';
do $$
begin
 if exists(select 1 from public.atlas_owner_github_binding_events
             where repository_id=1001)
   or exists(select 1 from public.atlas_owner_github_bindings
             where repository_id=1001)
   or exists(select 1 from public.projects
             where id='22222222-2222-4222-8222-222222222222') then
   raise exception 'FAIL: project erasure left binding/audit rows';
 end if;
 raise notice 'PASS: project deletion erases linked audit, no orphan mapping';
end $$;

-- Deleting the owner should honor the EXISTING projects.owner_id ON DELETE
-- CASCADE; a remaining approved mapping MUST NOT create an FK blocker.
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
do $$
begin
 if exists(select 1 from public.projects
           where owner_id='11111111-1111-4111-8111-111111111111')
   or exists(select 1 from public.atlas_owner_github_bindings
           where owner_user_id='11111111-1111-4111-8111-111111111111')
   or exists(select 1 from public.atlas_owner_github_binding_events
           where owner_user_id='11111111-1111-4111-8111-111111111111')
   or (select count(*) from public.atlas_owner_github_bindings) <> 1
   or (select count(*) from public.atlas_owner_github_binding_events) <> 1
   or (select count(*) from public.projects) <> 1
   or (select count(*) from auth.users) <> 1 then
  raise exception 'FAIL: owner erasure blocked or corrupted foreign owner rows';
 end if;
 raise notice 'PASS: owner erasure cascades only own mappings/audit; foreign owner intact';
end $$;
\echo [lifecycle] PG17 lifecycle alternative completed – no provider token revoked
