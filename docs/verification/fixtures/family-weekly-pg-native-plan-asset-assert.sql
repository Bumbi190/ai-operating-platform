\set ON_ERROR_STOP on
-- Disposable PostgreSQL ONLY. All plan and media constraints, plan/content
-- immutability triggers and media-owner RLS under test were loaded from
-- checked-in canonical migrations, not synthetic rewrites.
-- Only these in-memory fixture IDs/content are synthetic.
set role service_role;
do $$
declare
 v_principal jsonb:=jsonb_build_object(
  'userId','77777777-7777-4777-8777-777777777777',
  'allowedProjectIds',jsonb_build_array('77cda551-57c9-4dc0-b019-1bb6438777f7'));
 v_input jsonb:=jsonb_build_object(
  'projectId','77cda551-57c9-4dc0-b019-1bb6438777f7',
  'conversationId','55555555-5555-4555-8555-555555555555');
 v_plan jsonb;
 v_save jsonb;
 v_decide jsonb;
 v_approved jsonb;
 v_revision uuid;
begin
 if has_table_privilege('authenticated','public.social_launch_plans','SELECT')
  or has_table_privilege('authenticated','public.social_launch_plan_revisions','SELECT')
  or has_table_privilege('authenticated','public.social_launch_plan_decisions','SELECT')
  or not has_table_privilege('service_role','public.social_launch_plans','SELECT') then
  raise exception 'NATIVE_PLAN_ACL_MISMATCH';
 end if;
 v_plan:=public.social_launch_plan_read(v_principal,v_input);
 if v_plan->'currentRevision'->>'id'
    <>'99999999-9999-4999-8999-999999999999'
  or v_plan->'decision'->>'decision'<>'approve'
  or v_plan->'decision'->>'sha256'<>repeat('d',64)
  or (select count(*) from public.social_content_revisions)<>5
  or (select count(*) from public.social_weekly_preparations)<>1 then
  raise exception 'NATIVE_PLAN_APPROVED_READ_INTEGRITY_INVALID';
 end if;
 -- The actual owner-scoped plan-save and decide RPCs work with the real FK
 -- graph, but the revision is rolled back and never affects the baseline.
 begin
  v_save:=public.social_launch_plan_save(v_principal,v_input||
   jsonb_build_object(
    'expectedRevisionId','99999999-9999-4999-8999-999999999999',
    'idempotencyKey','native_plan_second_revision_test',
    'choices',jsonb_build_array(
      jsonb_build_object('channel','facebook','purpose','Ny veckoplan',
        'format','image','cadence','twice_weekly'),
      jsonb_build_object('channel','instagram','purpose','Ny pysselplan',
        'format','image','cadence','twice_weekly')
    )));
  v_revision:=(v_save->'currentRevision'->>'id')::uuid;
  if v_revision is null
     or v_revision='99999999-9999-4999-8999-999999999999'
     or v_save->'currentRevision'->>'sequence'<>'2' then
   raise exception 'NATIVE_PLAN_SAVE_DID_NOT_VERSION';
  end if;
  v_decide:=public.social_launch_plan_decide(v_principal,
    jsonb_build_object(
      'projectId','77cda551-57c9-4dc0-b019-1bb6438777f7',
      'revisionId',v_revision,
      'sha256',v_save->'currentRevision'->>'sha256',
      'decision','approve','idempotencyKey','native_plan_second_approval'
    ));
  if v_decide->'decision'->>'decision'<>'approve'
     or v_decide->'decision'->>'revisionId'<>v_revision::text then
   raise exception 'NATIVE_PLAN_DECIDE_NOT_APPROVED';
  end if;
  raise exception 'NATIVE_PLAN_TEMP_VERSION_ROLLBACK';
 exception when others then
  if sqlerrm<>'NATIVE_PLAN_TEMP_VERSION_ROLLBACK' then raise;end if;
 end;
 if (public.social_launch_plan_read(v_principal,v_input))->'currentRevision'->>'id'
  <>'99999999-9999-4999-8999-999999999999' then
  raise exception 'NATIVE_PLAN_TEMP_REVISION_WAS_NOT_ROLLED_BACK';
 end if;
 -- Wrong owner cannot read a project-scoped approved plan via canonical RPC.
 begin
  perform public.social_launch_plan_read(
   jsonb_build_object(
      'userId','88888888-8888-4888-8888-888888888888',
      'allowedProjectIds',jsonb_build_array('77cda551-57c9-4dc0-b019-1bb6438777f7')),
   v_input);
  raise exception 'NATIVE_PLAN_FOREIGN_OWNER_ACCEPTED';
 exception when others then
  if sqlerrm<>'SOCIAL_LAUNCH_NOT_FOUND' then raise;end if;
 end;
end $$;
reset role;

-- Real immutable plan revisions/decisions, and immutable content revisions.
-- Test as postgres to ensure the trigger, not a missing UPDATE grant,
-- is enforcing the invariant.
do $$
begin
 begin
  update public.social_launch_plan_revisions set sequence=2
   where id='99999999-9999-4999-8999-999999999999';
  raise exception 'NATIVE_PLAN_REVISION_UPDATE_ACCEPTED';
 exception when insufficient_privilege then
  if sqlerrm<>'SOCIAL_LAUNCH_IMMUTABLE' then raise;end if;
 end;
 begin
  delete from public.social_launch_plan_decisions
   where revision_id='99999999-9999-4999-8999-999999999999';
  raise exception 'NATIVE_PLAN_DECISION_DELETE_ACCEPTED';
 exception when insufficient_privilege then
  if sqlerrm<>'SOCIAL_LAUNCH_IMMUTABLE' then raise;end if;
 end;
 begin
  update public.social_content_revisions set sequence=99
   where post_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  raise exception 'NATIVE_CONTENT_REVISION_UPDATE_ACCEPTED';
 exception when insufficient_privilege then
  if sqlerrm<>'SOCIAL_LAUNCH_IMMUTABLE' then raise;end if;
 end;

 -- Plan decisions are bound by a real composite (project,revision,sha) FK.
 -- Use a temporary distinct revision so the UNIQUE(project,revision)
 -- constraint cannot mask the composite SHA foreign key.
 begin
  insert into public.social_launch_plan_revisions(
   id,project_id,sequence,sha256,choices,conversation_id,
   idempotency_key,created_by
  ) values(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   '77cda551-57c9-4dc0-b019-1bb6438777f7',
   2,repeat('e',64),'[]'::jsonb,
   '55555555-5555-4555-8555-555555555555',
   'native_plan_temp_fk_sha_check',
   '77777777-7777-4777-8777-777777777777'
  );
  begin
   insert into public.social_launch_plan_decisions(
     project_id,revision_id,sha256,decision,idempotency_key,decided_by
   ) values(
    '77cda551-57c9-4dc0-b019-1bb6438777f7',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    repeat('0',64),'approve','invalid_mismatched_plan_sha',
    '77777777-7777-4777-8777-777777777777'
   );
   raise exception 'NATIVE_PLAN_SHA_FK_ACCEPTED_WRONG_SHA';
  exception when foreign_key_violation then null;end;
  raise exception 'NATIVE_PLAN_TEMP_SHA_FK_ROLLBACK';
 exception when others then
  if sqlerrm<>'NATIVE_PLAN_TEMP_SHA_FK_ROLLBACK' then raise;end if;
 end;

 -- The canonical media identity requires positive bytes, valid checksum,
 -- valid kind and unique storage object identity.
 begin
  insert into public.assets(
    project_id,kind,mime_type,byte_size,checksum_sha256,width,height,
    storage_bucket,storage_path
  ) values(
    '77cda551-57c9-4dc0-b019-1bb6438777f7',
    'image','image/jpeg',0,repeat('f',64),1080,1080,
    'media-assets-private','fixture-only/bad-size.jpg'
  );
  raise exception 'NATIVE_ASSET_ZERO_BYTES_ACCEPTED';
 exception when check_violation then null;end;
 begin
  insert into public.assets(
    project_id,kind,mime_type,byte_size,checksum_sha256,width,height,
    storage_bucket,storage_path
  ) values(
    '77cda551-57c9-4dc0-b019-1bb6438777f7',
    'image','image/jpeg',100,'bad',1080,1080,
    'media-assets-private','fixture-only/bad-checksum.jpg'
  );
  raise exception 'NATIVE_ASSET_INVALID_SHA_ACCEPTED';
 exception when check_violation then null;end;
 begin
  insert into public.assets(
    project_id,kind,mime_type,byte_size,checksum_sha256,width,height,
    storage_bucket,storage_path
  ) values(
    '77cda551-57c9-4dc0-b019-1bb6438777f7',
    'archive','application/zip',100,repeat('f',64),null,null,
    'media-assets-private','fixture-only/unknown-kind.zip'
  );
  raise exception 'NATIVE_ASSET_UNKNOWN_KIND_ACCEPTED';
 exception when check_violation then null;end;
 begin
  insert into public.assets(
    project_id,kind,mime_type,byte_size,checksum_sha256,width,height,
    storage_bucket,storage_path
  ) values(
    '77cda551-57c9-4dc0-b019-1bb6438777f7',
    'image','image/jpeg',100,repeat('f',64),1080,1080,
    'media-assets-private','fixture-only/family-weekly/nova-pling-owned.jpg'
  );
  raise exception 'NATIVE_ASSET_DUPLICATE_STORAGE_ID_ACCEPTED';
 exception when unique_violation then null;end;
 begin
  insert into public.assets(
    project_id,kind,mime_type,byte_size,checksum_sha256,width,height,
    storage_bucket,storage_path
  ) values(
    '88888888-8888-4888-8888-888888888888',
    'image','image/jpeg',100,repeat('f',64),1080,1080,
    'media-assets-private','fixture-only/foreign-project.jpg'
  );
  raise exception 'NATIVE_ASSET_UNKNOWN_PROJECT_ACCEPTED';
 exception when foreign_key_violation then null;end;

 if (select count(*) from public.assets)<>1 or
    (select count(*) from public.social_launch_plan_decisions)<>1 or
    (select count(*) from public.social_launch_plan_revisions)<>1 or
    (select count(*) from public.social_content_revisions)<>5 then
  raise exception 'NATIVE_PLAN_ASSET_NEGATIVE_TEST_MUTATED_BASELINE';
 end if;
end $$;

-- Exact asset ownership RLS predicate from 20260902 migration: an owner sees
-- their owned row, an unrelated authenticated user sees zero.
set role authenticated;
set "request.jwt.claim.sub"='77777777-7777-4777-8777-777777777777';
do $$
begin
 if (select count(*) from public.assets)<>1
  or has_table_privilege('authenticated','public.social_launch_plans','SELECT')
  or has_table_privilege('authenticated','public.social_launch_plan_revisions','SELECT')
  or has_table_privilege('authenticated','public.social_launch_plan_decisions','SELECT') then
  raise exception 'NATIVE_ASSET_RLS_OWNER_OR_PLAN_ACL_FAILED';
 end if;
end $$;
set "request.jwt.claim.sub"='88888888-8888-4888-8888-888888888888';
do $$
begin
 if (select count(*) from public.assets)<>0 then
  raise exception 'NATIVE_ASSET_FOREIGN_USER_READ_ACCEPTED';
 end if;
end $$;
reset role;
select 'FAMILY_WEEKLY_CANONICAL_PLAN_FK_TRIGGERS_AND_ASSET_RLS_PASS' as result;
