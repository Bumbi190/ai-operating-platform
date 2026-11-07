-- Run after synthetic photo RLS fixture AND the unchanged proposed review DDL.
-- All user IDs, assets, hashes and projects are synthetic.
insert into public.website_vehicle_review_assignments
 (listing_id,project_id,owner_id,reviewer_id,active) values
 ('33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),
 ('44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
insert into public.website_vehicle_review_revisions
 (revision_id,listing_id,project_id,owner_id,capture_id,asset_id,
 glb_sha256,evidence_digest,photo_proof) values
 ('90000000-0000-4000-8000-000000000001',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '66666666-6666-4666-8666-666666666666',
  'vehicle3d:synthetic-a',repeat('a',64),repeat('b',64),
  'pixels_checked_for_human_review'),
 ('90000000-0000-4000-8000-000000000002',
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '77777777-7777-4777-8777-777777777777',
  'vehicle3d:synthetic-b',repeat('c',64),repeat('d',64),
  'pixels_checked_for_human_review');
insert into public.website_vehicle_review_current
 (listing_id,project_id,owner_id,revision_id) values
 ('33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '90000000-0000-4000-8000-000000000001'),
 ('44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '90000000-0000-4000-8000-000000000002');

-- No interactive client can browse or mutate the sensitive audit registry.
do $$
declare rel text;
begin
 foreach rel in array array['website_vehicle_review_assignments',
  'website_vehicle_review_revisions','website_vehicle_review_current',
  'website_vehicle_review_audit'] loop
  if has_table_privilege('authenticated','public.'||rel,'SELECT') or
     has_table_privilege('authenticated','public.'||rel,'INSERT') or
     has_table_privilege('authenticated','public.'||rel,'UPDATE') or
     has_table_privilege('authenticated','public.'||rel,'DELETE') or
     has_table_privilege('anon','public.'||rel,'SELECT') then
   raise exception 'CLIENT_REVIEW_PRIVILEGE_LEAK: %',rel;
  end if;
 end loop;
 if has_schema_privilege('authenticated','website_review_private','USAGE') or
    has_schema_privilege('anon','website_review_private','USAGE') then
  raise exception 'REVIEW_WRITER_EXPOSED';
 end if;
end $$;

-- Calls below are executed with a fixture service role on an isolated DB.
set role service_role;
do $$
declare r record;
begin
 select * into r from website_review_private.append_pending(
 'a0000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333',
 '66666666-6666-4666-8666-666666666666',
 '90000000-0000-4000-8000-000000000001',
 'vehicle3d:synthetic-a',
 repeat('a',64),repeat('b',64),repeat('e',64),now(),
 'human_review_required','{}'::text[],'{}'::text[],'Fixture pending review');
 if r.stored is distinct from true or r.audit_id is null then
  raise exception 'VALID_PENDING_WRITE_REJECTED: %',r.reason;
 end if;
 select * into r from website_review_private.append_pending(
 'a0000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333',
 '66666666-6666-4666-8666-666666666666',
 '90000000-0000-4000-8000-000000000001',
 'vehicle3d:synthetic-a',
 repeat('a',64),repeat('b',64),repeat('e',64),now(),
 'human_review_required','{}'::text[],'{}'::text[],'Replay');
 if r.stored is distinct from false or r.reason<>'duplicate' then
  raise exception 'REPLAY_NOT_DENIED: %',r.reason;
 end if;
 -- B has never been assigned to A's listing, even though the service
 -- writer supplied B's reviewer ID. The DB must reject cross-project.
 select * into r from website_review_private.append_pending(
 'a0000000-0000-4000-8000-000000000002',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333',
 '66666666-6666-4666-8666-666666666666',
 '90000000-0000-4000-8000-000000000001',
 'vehicle3d:synthetic-a',
 repeat('a',64),repeat('b',64),repeat('e',64),now(),
 'human_review_required','{}'::text[],'{}'::text[],'Foreign reviewer');
 if r.stored is distinct from false or r.reason<>'no_permission' then
  raise exception 'FOREIGN_REVIEWER_ACCEPTED: %',r.reason;
 end if;
 -- Modified GLB digest cannot be attached to the old evidence version.
 select * into r from website_review_private.append_pending(
 'a0000000-0000-4000-8000-000000000003',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333',
 '66666666-6666-4666-8666-666666666666',
 '90000000-0000-4000-8000-000000000001',
 'vehicle3d:synthetic-a',
 repeat('f',64),repeat('b',64),repeat('e',64),now(),
 'human_review_required','{}'::text[],'{}'::text[],'Forged GLB');
 if r.stored is distinct from false or r.reason<>'stale_revision' then
  raise exception 'GLB_SWAP_NOT_DENIED: %',r.reason;
 end if;
end $$;
reset role;

-- A stale client/server clock or replayed timestamp must not be accepted.
set role service_role;
do $$
declare r record;
begin
 select * into r from website_review_private.append_pending(
 'a0000000-0000-4000-8000-000000000007',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333',
 '66666666-6666-4666-8666-666666666666',
 '90000000-0000-4000-8000-000000000001',
 'vehicle3d:synthetic-a',
 repeat('a',64),repeat('b',64),repeat('e',64),
 now()-interval '1 hour','human_review_required',
 '{}'::text[],'{}'::text[],'Old event timestamp');
 if r.stored is distinct from false or r.reason<>'invalid_input' then
  raise exception 'STALE_EVENT_TIMESTAMP_ACCEPTED: %',r.reason;
 end if;
end $$;
reset role;

-- Immutable audit evidence and audit events, including for privileged
-- fixture DB owner. Both update and delete must fail.
do $$
begin
 begin
  update public.website_vehicle_review_audit
   set outcome='revision_required';
  raise exception 'AUDIT_HISTORY_MUTATED';
 exception when raise_exception then
  if SQLERRM <> 'VEHICLE_REVIEW_IMMUTABLE_HISTORY' then raise;end if;
 end;
 begin
  delete from public.website_vehicle_review_revisions;
  raise exception 'EVIDENCE_HISTORY_MUTATED';
 exception when raise_exception then
  if SQLERRM <> 'VEHICLE_REVIEW_IMMUTABLE_HISTORY' then raise;end if;
 end;
end $$;

-- A new evidence snapshot can be appended, but an old review cannot
-- follow the active revision pointer after it changes.
insert into public.website_vehicle_review_revisions
 (revision_id,listing_id,project_id,owner_id,capture_id,asset_id,
 glb_sha256,evidence_digest,photo_proof) values
 ('90000000-0000-4000-8000-000000000003',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '66666666-6666-4666-8666-666666666666',
  'vehicle3d:synthetic-a',repeat('8',64),repeat('9',64),
  'pixels_checked_for_human_review');
update public.website_vehicle_review_current
 set revision_id='90000000-0000-4000-8000-000000000003',changed_at=now()
 where listing_id='33333333-3333-4333-8333-333333333333';

set role service_role;
do $$
declare r record;
begin
 select * into r from website_review_private.append_pending(
 'a0000000-0000-4000-8000-000000000004',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333',
 '66666666-6666-4666-8666-666666666666',
 '90000000-0000-4000-8000-000000000001',
 'vehicle3d:synthetic-a',
 repeat('a',64),repeat('b',64),repeat('e',64),now(),
 'human_review_required','{}'::text[],'{}'::text[],'Stale');
 if r.stored is distinct from false or r.reason<>'stale_revision' then
  raise exception 'STALE_REVISION_ACCEPTED: %',r.reason;
 end if;
 select * into r from website_review_private.append_pending(
 'a0000000-0000-4000-8000-000000000005',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333',
 '66666666-6666-4666-8666-666666666666',
 '90000000-0000-4000-8000-000000000003',
 'vehicle3d:synthetic-a',
 repeat('8',64),repeat('9',64),repeat('e',64),now(),
 'revision_required',array['wheels'], '{}'::text[],'Changed wheels');
 if r.stored is distinct from true then
  raise exception 'CURRENT_REVISION_DENIED: %',r.reason;
 end if;
end $$;
reset role;

-- Revoke reviewer after the successful new event. No future inserts.
update public.website_vehicle_review_assignments set active=false
 where listing_id='33333333-3333-4333-8333-333333333333'
  and reviewer_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role service_role;
do $$
declare r record;
begin
 select * into r from website_review_private.append_pending(
 'a0000000-0000-4000-8000-000000000006',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333',
 '66666666-6666-4666-8666-666666666666',
 '90000000-0000-4000-8000-000000000003',
 'vehicle3d:synthetic-a',
 repeat('8',64),repeat('9',64),repeat('e',64),now(),
 'human_review_required','{}'::text[],'{}'::text[],'Revoked reviewer');
 if r.stored is distinct from false or r.reason<>'no_permission' then
  raise exception 'REVOKED_REVIEWER_ACCEPTED: %',r.reason;
 end if;
end $$;
reset role;
do $$
begin
 if (select count(*) from public.website_vehicle_review_audit)<>2 then
  raise exception 'AUDIT_EVENT_COUNT_NOT_EXACTLY_TWO';
 end if;
 if exists (select 1 from public.website_vehicle_review_audit
  where outcome not in ('human_review_required','revision_required','additional_evidence_required'))
 then raise exception 'AUDIT_CONTAINED_APPROVAL';end if;
end $$;
select 'PASS: isolated append-only reviewer A/B, duplicate, swapped GLB, stale revision, revoke and immutability' as result;
