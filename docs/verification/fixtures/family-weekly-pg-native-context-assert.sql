\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. This invokes the verbatim canonical weekly
-- context + real content/profile readers + real JSON canonicalization.
-- All named principals, source assets and approvals are fixture-only.
set role service_role;
do $$
declare
 v_project constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid;
 v_owner constant uuid:='77777777-7777-4777-8777-777777777777'::uuid;
 v_input jsonb:=jsonb_build_object(
  'projectId','77cda551-57c9-4dc0-b019-1bb6438777f7',
  'conversationId','55555555-5555-4555-8555-555555555555',
  'weekStart','2027-01-04');
 v_principal jsonb:=jsonb_build_object(
  'userId','77777777-7777-4777-8777-777777777777',
  'allowedProjectIds',jsonb_build_array('77cda551-57c9-4dc0-b019-1bb6438777f7'));
 v jsonb;
 repeated jsonb;
 stale jsonb;
begin
 v:=public.social_weekly_context(v_principal,v_input);
 if v->>'contextHash' !~ '^[a-f0-9]{64}$' then
  raise exception 'NATIVE_CONTEXT_HASH_MISSING';
 end if;
 if v->'profile'->'revision'->>'sha256'<>repeat('b',64)
 or v->'profile'->'revision'->'profile'->>'description'
  <>'Familje-Stunden erbjuder sagor och aktiviteter med Nova och Pling.' then
  raise exception 'NATIVE_CONTEXT_PROFILE_SOURCE_MISSING';
 end if;
 if v->'content'->'planApproved' is distinct from 'true'::jsonb
 or v->'content'->>'currentPlanRevisionId'
  <>'99999999-9999-4999-8999-999999999999'
 or jsonb_array_length(v->'content'->'posts')<>1
 or jsonb_array_length(v->'content'->'assets')<>1 then
  raise exception 'NATIVE_CONTEXT_APPROVED_CONTENT_MISSING';
 end if;
 if jsonb_array_length(v->'describedAssets')<>1
 or v->'describedAssets'->0->>'id'<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 or v->'describedAssets'->0->>'description'
  <>'Nova och Pling vid pysselbordet i en egen godkänd bild.'
 or v->'describedAssets'->0->>'sha256'<>repeat('c',64) then
  raise exception 'NATIVE_CONTEXT_OWNED_DESCRIBED_JPEG_MISSING';
 end if;
 if jsonb_array_length(v->'bindings')<>2
 or (select count(distinct b->>'channel') from jsonb_array_elements(v->'bindings') b
     where b->>'verification'='provider_attested'
       and b->'blocked'='false'::jsonb
       and b->>'channel' in ('facebook','instagram'))<>2 then
  raise exception 'NATIVE_CONTEXT_VERIFIED_ACCOUNT_BINDINGS_MISSING';
 end if;
 if v->'monthlyRuleEnabled' is distinct from 'false'::jsonb
 or v->'preparation'<>'null'::jsonb
 or jsonb_array_length(v->'jobs')<>0
 or jsonb_array_length(v->'history')<>0 then
  raise exception 'NATIVE_CONTEXT_UNEXPECTED_SCHEDULE_PUBLICATION_AUTHORITY';
 end if;
 if (select count(*) from public.social_weekly_preparations)<>0
 or (select count(*) from public.social_content_posts)<>1 then
  raise exception 'NATIVE_CONTEXT_READ_UNEXPECTEDLY_MUTATED_EDITORIAL';
 end if;
 repeated:=public.social_weekly_context(v_principal,v_input);
 if repeated->>'contextHash' is distinct from v->>'contextHash' then
  raise exception 'NATIVE_CONTEXT_HASH_NOT_DETERMINISTIC';
 end if;

 -- A provider-attested account cannot be downgraded in the actual
 -- schema. Simulate a real account-mismatch block instead, and ROLLBACK
 -- the test-only block with a PL/pgSQL subtransaction (never lift a block).
 begin
  update public.social_account_bindings
   set blocked_at=clock_timestamp(),blocked_reason='account_mismatch'
   where platform='instagram';
  stale:=public.social_weekly_context(v_principal,v_input);
  if stale->>'contextHash'=v->>'contextHash'
  or (select count(*) from jsonb_array_elements(stale->'bindings') b
      where b->>'channel'='instagram' and b->'blocked'='true'::jsonb)<>1 then
   raise exception 'NATIVE_CONTEXT_DID_NOT_NOTICE_ACCOUNT_BLOCK';
  end if;
  raise exception 'NATIVE_CONTEXT_TEMPORARY_BLOCK_ROLLBACK';
 exception when others then
  if sqlerrm<>'NATIVE_CONTEXT_TEMPORARY_BLOCK_ROLLBACK' then raise;end if;
 end;
 if (public.social_weekly_context(v_principal,v_input))->>'contextHash'
  is distinct from v->>'contextHash' then
  raise exception 'NATIVE_CONTEXT_HASH_DID_NOT_RECOVER_ON_RESTORE';
 end if;

 begin
  perform public.social_weekly_context(
   jsonb_build_object('userId','88888888-8888-4888-8888-888888888888',
    'allowedProjectIds',jsonb_build_array(v_project)),
   v_input
  );
  raise exception 'NATIVE_CONTEXT_FOREIGN_OWNER_ACCEPTED';
 exception when others then
  if sqlerrm<>'SOCIAL_LAUNCH_NOT_FOUND' then raise;end if;
 end;
 begin
  perform public.social_weekly_context(v_principal,v_input||jsonb_build_object('weekStart','2027-01-05'));
  raise exception 'NATIVE_CONTEXT_NONMONDAY_ACCEPTED';
 exception when others then
  if sqlerrm<>'SOCIAL_WEEKLY_INVALID_BODY' then raise;end if;
 end;
end $$;
reset role;
select 'FAMILY_WEEKLY_CANONICAL_CONTEXT_WITH_REAL_READERS_PASS' as result;
