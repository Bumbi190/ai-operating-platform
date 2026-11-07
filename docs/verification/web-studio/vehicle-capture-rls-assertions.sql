-- Run AFTER the exact docs/sql P1b proposal. Every assertion is fail-closed.
-- Synthetic users / URLs only: no real dealership or customer identifiers.
insert into auth.users(id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.projects(id,owner_id) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.website_vehicle_capture_listings(id,project_id,owner_id,state) values
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','evidence_only'),
 ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','evidence_only'),
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','revoked');
insert into public.website_vehicle_capture_photos(
 listing_id,project_id,owner_id,capture_id,view_kind,sha256,file_format,object_path,recorded_bytes
) values
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','66666666-6666-4666-8666-666666666666','front_three_quarter',repeat('a',64),'png',
 'vehicle-captures/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/66666666-6666-4666-8666-666666666666/front_three_quarter/'||repeat('a',64)||'.png',250000),
 ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','77777777-7777-4777-8777-777777777777','front_three_quarter',repeat('b',64),'png',
 'vehicle-captures/22222222-2222-4222-8222-222222222222/44444444-4444-4444-8444-444444444444/77777777-7777-4777-8777-777777777777/front_three_quarter/'||repeat('b',64)||'.png',250000),
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','88888888-8888-4888-8888-888888888888','front_three_quarter',repeat('c',64),'png',
 'vehicle-captures/11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555/88888888-8888-4888-8888-888888888888/front_three_quarter/'||repeat('c',64)||'.png',250000);

insert into storage.objects(id,bucket_id,name)
select gen_random_uuid(),'vehicle-originals-private',object_path
from public.website_vehicle_capture_photos;
insert into storage.objects(id,bucket_id,name) values
 (gen_random_uuid(),'vehicle-originals-private','vehicle-captures/unbound/unknown.png'),
 (gen_random_uuid(),'another-bucket','vehicle-captures/test.png');

-- Role with no user identity never sees a row.
set role anon;
set request.jwt.claim.sub = '';
set storage.operation = 'object.get_authenticated';
do $$
begin
 if (select count(*) from storage.objects)<>0 then raise exception 'ANON_STORAGE_LEAK'; end if;
end $$;
reset role;

-- Owner A sees only A's active listing and photo (not B's or revoked A's).
set role authenticated;
set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set storage.operation='object.get_authenticated';
do $$
begin
 if (select count(*) from public.website_vehicle_capture_listings)<>2
 then raise exception 'OWNER_A_LISTING_SCOPE_FAILURE';end if;
 if (select count(*) from public.website_vehicle_capture_photos)<>1
 then raise exception 'OWNER_A_PHOTO_SCOPE_FAILURE';end if;
 if (select count(*) from storage.objects)<>1
 then raise exception 'OWNER_A_STORAGE_LEAK_OR_MISSING';end if;
end $$;
reset role;

-- Owner B cannot read owner's A project/listing/photo.
set role authenticated;
set request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set storage.operation='object.get_authenticated';
do $$
begin
 if (select count(*) from public.website_vehicle_capture_listings)<>1
 then raise exception 'OWNER_B_LISTING_SCOPE_FAILURE';end if;
 if (select count(*) from public.website_vehicle_capture_photos)<>1
 then raise exception 'OWNER_B_PHOTO_SCOPE_FAILURE';end if;
 if (select count(*) from storage.objects)<>1
 then raise exception 'OWNER_B_STORAGE_LEAK_OR_MISSING';end if;
end $$;
reset role;

-- Authenticated object listing MUST NOT be allowed by this proposed policy.
set role authenticated;
set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set storage.operation='object.list';
do $$
begin
 if (select count(*) from storage.objects)<>0 then raise exception 'LIST_OPERATION_ALLOWED';end if;
end $$;
reset role;

-- Force no object.get_authenticated_info while listing, validate download only.
set role authenticated;
set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set storage.operation='object.get_authenticated_info';
do $$
begin
 if (select count(*) from storage.objects)<>1
 then raise exception 'OWNED_INFO_NOT_VISIBLE'; end if;
end $$;
reset role;

-- No DML granted for user roles; no all-access shortcut.
do $$
begin
 if has_table_privilege('authenticated','public.website_vehicle_capture_listings','INSERT')
 or has_table_privilege('authenticated','public.website_vehicle_capture_listings','UPDATE')
 or has_table_privilege('authenticated','public.website_vehicle_capture_listings','DELETE')
 or has_table_privilege('authenticated','public.website_vehicle_capture_photos','INSERT')
 or has_table_privilege('authenticated','public.website_vehicle_capture_photos','UPDATE')
 or has_table_privilege('authenticated','public.website_vehicle_capture_photos','DELETE')
 or has_table_privilege('authenticated','storage.objects','INSERT')
 or has_table_privilege('authenticated','storage.objects','UPDATE')
 or has_table_privilege('authenticated','storage.objects','DELETE')
 then raise exception 'UNAUTHORIZED_DML_PRIVILEGE';end if;
end $$;

-- Malicious photo attached to different listing-owner must not pass the FK.
do $$
begin
 begin
 insert into public.website_vehicle_capture_photos(
  listing_id,project_id,owner_id,capture_id,view_kind,sha256,file_format,object_path,recorded_bytes
 )values (
 '33333333-3333-4333-8333-333333333333',
 '11111111-1111-4111-8111-111111111111',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '99999999-9999-4999-8999-999999999999',
 'side',repeat('d',64),'png',
 'vehicle-captures/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/99999999-9999-4999-8999-999999999999/side/'||repeat('d',64)||'.png',250000);
 raise exception 'CROSS_OWNER_FK_ACCEPTED';
 exception when foreign_key_violation then null;end;
end $$;
select 'PASS: isolated owner/foreign/revoked/storage-role SQL assertions' as result;
