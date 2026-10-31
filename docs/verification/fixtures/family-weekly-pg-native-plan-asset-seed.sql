\set ON_ERROR_STOP on
-- Disposable PostgreSQL ONLY. Synthetic plan decisions and JPEG metadata
-- inserted into the REAL checked-in SQL tables/FKs/triggers.
-- No actual media bytes or social credentials are read or written.
set role service_role;
insert into public.social_launch_plans(
 project_id,created_by
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777'
);
insert into public.social_launch_plan_revisions(
 id,project_id,sequence,sha256,choices,conversation_id,
 expected_revision_id,idempotency_key,created_by
) values(
 '99999999-9999-4999-8999-999999999999',
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 1,repeat('d',64),
 jsonb_build_array(
   jsonb_build_object('channel','facebook','purpose','Familjens sagostund',
      'format','image','cadence','twice_weekly'),
   jsonb_build_object('channel','instagram','purpose','Pyssel med Nova och Pling',
      'format','image','cadence','twice_weekly')
 ),
 '55555555-5555-4555-8555-555555555555',
 null,'native_plan_fixture_1',
 '77777777-7777-4777-8777-777777777777'
);
update public.social_launch_plans
 set current_revision_id='99999999-9999-4999-8999-999999999999'
 where project_id='77cda551-57c9-4dc0-b019-1bb6438777f7';
insert into public.social_launch_plan_decisions(
 project_id,revision_id,sha256,decision,idempotency_key,decided_by
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '99999999-9999-4999-8999-999999999999',
 repeat('d',64),'approve','native_plan_fixture_approve_1',
 '77777777-7777-4777-8777-777777777777'
);
reset role;
insert into public.assets(
 id,project_id,kind,mime_type,byte_size,checksum_sha256,
 width,height,visibility,status,storage_bucket,storage_path
) values(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 'image','image/jpeg',2048,repeat('c',64),1080,1080,
 'internal','active','media-assets-private',
 'fixture-only/family-weekly/nova-pling-owned.jpg'
);
select 'FAMILY_WEEKLY_CANONICAL_PLAN_ASSET_SEED_PASS' as result;
