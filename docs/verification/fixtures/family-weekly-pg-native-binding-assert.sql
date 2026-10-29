\set ON_ERROR_STOP on
-- Disposable PostgreSQL ONLY. Exercise the actual 20260914 account-binding
-- CHECKs, unique indexes, triggers and guarded rebind RPC. No real accounts.
set role service_role;
do $$
declare
 v_project constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid;
 v_ig constant uuid:='22222222-2222-4222-8222-222222222222'::uuid;
 v_new uuid;
begin
 if has_table_privilege('anon','public.social_account_bindings','SELECT')
 or has_table_privilege('authenticated','public.social_account_bindings','SELECT')
 or has_table_privilege('authenticated','public.social_account_bindings','UPDATE')
 or not has_table_privilege('service_role','public.social_account_bindings','SELECT') then
  raise exception 'NATIVE_BINDING_ACL_MISMATCH';
 end if;
 if (select count(*) from public.social_account_bindings
      where project_id=v_project and superseded_at is null
      and verification='provider_attested' and blocked_at is null)<>2 then
  raise exception 'NATIVE_BINDING_INITIAL_STATE_INVALID';
 end if;

 -- Real provider attestation is monotonic; it must never be downgraded.
 begin
  update public.social_account_bindings
  set verification='runtime_evidence'
  where binding_id=v_ig;
  raise exception 'NATIVE_BINDING_VERIFICATION_DOWNGRADE_ACCEPTED';
 exception when others then
  if sqlerrm not like 'social_account_bindings: verification of binding % cannot be downgraded'
  then raise;end if;
 end;

 -- External account identity is immutable, even though the replacement ID
 -- itself would satisfy the textual shape constraint.
 begin
  update public.social_account_bindings
  set external_account_id='different_fixture_account'
  where binding_id=v_ig;
  raise exception 'NATIVE_BINDING_IDENTITY_MUTATION_ACCEPTED';
 exception when others then
  if sqlerrm not like 'social_account_bindings: the identity of binding % is immutable'
  then raise;end if;
 end;

 -- A second active provider account for same project/platform is impossible.
 begin
  insert into public.social_account_bindings(
    project_id,platform,external_account_id,account_label,
    credential_source,verification,verified_at,bound_by
  ) values(
    v_project,'instagram','duplicate-fixture-ig','Duplicate IG',
    'project_store','provider_attested',clock_timestamp(),
    'user:77777777-7777-4777-8777-777777777777'
  );
  raise exception 'NATIVE_BINDING_ACTIVE_DUPLICATE_ACCEPTED';
 exception when unique_violation then null;end;

 -- Invalid verification vocabulary never becomes a live binding.
 begin
  insert into public.social_account_bindings(
   project_id,platform,external_account_id,account_label,
   credential_source,verification,verified_at,bound_by
  ) values(
   v_project,'facebook','illegal-fixture-fb','Illegal FB',
   'project_store','unverified',clock_timestamp(),
   'user:77777777-7777-4777-8777-777777777777'
  );
  raise exception 'NATIVE_BINDING_UNKNOWN_VERIFICATION_ACCEPTED';
 exception when check_violation then null;end;

 -- A valid account-mismatch block is one-way. Roll it back using an
 -- isolated PL/pgSQL subtransaction, never an illicit unblock update.
 begin
  update public.social_account_bindings
   set blocked_at=clock_timestamp(),blocked_reason='account_mismatch'
   where binding_id=v_ig;
  if (select blocked_at is not null from public.social_account_bindings
       where binding_id=v_ig) is distinct from true then
   raise exception 'NATIVE_BINDING_VALID_BLOCK_NOT_SAVED';
  end if;
  begin
   update public.social_account_bindings
    set blocked_at=null,blocked_reason=null where binding_id=v_ig;
   raise exception 'NATIVE_BINDING_BLOCK_LIFT_ACCEPTED';
  exception when others then
   if sqlerrm not like 'social_account_bindings: the block on binding % cannot be lifted or changed'
   then raise;end if;
  end;
  raise exception 'NATIVE_BINDING_TEMP_BLOCK_ROLLBACK';
 exception when others then
  if sqlerrm<>'NATIVE_BINDING_TEMP_BLOCK_ROLLBACK' then raise;end if;
 end;

 -- The canonical rebind RPC supersedes the old row then inserts a new
 -- attested row. Both actions roll back after verification in this fixture.
 begin
  v_new:=public.social_account_rebind(
   v_project,'instagram',v_ig,'replacement-fixture-ig',
   'Replacement Fixture IG','user:77777777-7777-4777-8777-777777777777'
  );
  if (select count(*) from public.social_account_bindings
       where project_id=v_project and platform='instagram'
         and superseded_at is null)<>1
  or (select count(*) from public.social_account_bindings
       where binding_id=v_ig and superseded_at is not null)<>1
  or (select verification from public.social_account_bindings
       where binding_id=v_new)<>'provider_attested' then
   raise exception 'NATIVE_BINDING_REBIND_NOT_ATOMIC';
  end if;
  raise exception 'NATIVE_BINDING_TEMP_REBIND_ROLLBACK';
 exception when others then
  if sqlerrm<>'NATIVE_BINDING_TEMP_REBIND_ROLLBACK' then raise;end if;
 end;
 if (select count(*) from public.social_account_bindings
     where project_id=v_project and superseded_at is null
       and verification='provider_attested' and blocked_at is null)<>2 then
  raise exception 'NATIVE_BINDING_NEGATIVE_TEST_CHANGED_ACTIVE_ACCOUNTS';
 end if;
end $$;
reset role;

-- The actual DELETE guard must apply even to a privileged DB owner.
do $$
begin
 begin
  delete from public.social_account_bindings
   where binding_id='22222222-2222-4222-8222-222222222222';
  raise exception 'NATIVE_BINDING_DELETE_ACCEPTED';
 exception when others then
  if sqlerrm not like 'social_account_bindings rows are never deleted%'
  then raise;end if;
 end;
 if (select count(*) from public.social_account_bindings)<>2 then
  raise exception 'NATIVE_BINDING_DELETE_TEST_MUTATED_ROWS';
 end if;
end $$;
select 'FAMILY_WEEKLY_CANONICAL_BINDING_GUARDS_AND_REBIND_PASS' as result;
