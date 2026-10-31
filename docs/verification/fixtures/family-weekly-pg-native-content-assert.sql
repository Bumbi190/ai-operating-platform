\set ON_ERROR_STOP on
-- Execute AFTER canonical social_weekly_save and canonical social_content_save.
-- All source tables, functions and rows are in an isolated disposable PG.
set role service_role;
do $$
declare
 v_project constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid;
 v_tue constant text:='2027-01-05T16:00:00.000Z';
 v_fri constant text:='2027-01-08T19:30:00.000Z';
begin
 if (select count(*) from public.social_content_posts where project_id=v_project)<>4 or
    (select count(*) from public.social_content_revisions where project_id=v_project)<>4 then
  raise exception 'NATIVE_CONTENT_WRITER_DID_NOT_PERSIST_FOUR_REVISIONS';
 end if;
 if exists (
  select 1 from public.social_content_posts p
  left join public.social_content_revisions r on r.id=p.current_revision_id
  where p.project_id=v_project and (
   r.id is null or r.post_id<>p.id or r.project_id<>p.project_id or
   r.plan_revision_id<>'99999999-9999-4999-8999-999999999999'::uuid or
   r.binding_id is null or r.sha256 !~ '^[a-f0-9]{64}$' or
   jsonb_array_length(r.media)<>1 or
   r.media->0->>'id'<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' or
   r.media->0->>'sha256'<>repeat('c',64) or
   r.draft->>'format'<>'image' or
   r.draft->>'linkUrl' is not null
  )
 ) then raise exception 'NATIVE_CONTENT_REVISION_INVALID'; end if;
 if (select count(*) from public.social_content_revisions
     where draft->>'scheduledAt'=v_tue)<>2 or
    (select count(*) from public.social_content_revisions
     where draft->>'scheduledAt'=v_fri)<>2 or
    (select count(distinct draft->>'channel') from public.social_content_revisions)<>2 then
  raise exception 'NATIVE_CONTENT_WEEKLY_TIME_OR_CHANNEL_INVALID';
 end if;
 if (select count(*) from public.social_content_revisions r
     join public.social_account_bindings b on b.binding_id=r.binding_id
     where r.project_id=v_project and r.draft->>'channel'=b.platform)<>4 then
  raise exception 'NATIVE_CONTENT_CHANNEL_ACCOUNT_MISMATCH';
 end if;
 if (select count(*) from public.social_content_decisions)<>0 then
  raise exception 'NATIVE_CONTENT_APPROVED_WITHOUT_OWNER';
 end if;
 if (select count(*) from public.family_weekly_review_notices)<>1 or
    (select count(*) from public.social_weekly_preparations)<>1 then
  raise exception 'NATIVE_CONTENT_REVIEW_RECEIPT_MISSING';
 end if;
end $$;
reset role;
select 'FAMILY_WEEKLY_CANONICAL_CONTENT_WRITER_AND_EDITORIAL_SAVE_PASS' as result;
