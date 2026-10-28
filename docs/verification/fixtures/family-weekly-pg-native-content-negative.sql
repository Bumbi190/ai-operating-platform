\set ON_ERROR_STOP on
-- Fully disposable DB only: prove canonical writer denies invalid image,
-- changed provider binding, lost approval and foreign owner; no extra drafts.
set role service_role;
do $$
declare r public.social_content_revisions; attempt jsonb;
begin
 select * into strict r from public.social_content_revisions limit 1;
 attempt:=r.input_data||jsonb_build_object(
  'postId',gen_random_uuid(),'idempotencyKey','native_reject_asset',
  'draft',jsonb_set(r.draft,'{mediaIds}',
   jsonb_build_array('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')));
 begin
  perform public.social_content_save(
   jsonb_build_object('userId','77777777-7777-4777-8777-777777777777',
    'allowedProjectIds',jsonb_build_array(r.project_id)),attempt);
  raise exception 'INVALID_MEDIA_ACCEPTED';
 exception when others then
  if sqlerrm<>'SOCIAL_CONTENT_INVALID_BODY' then raise; end if;
 end;
 begin
  perform public.social_content_save(
   jsonb_build_object('userId','88888888-8888-4888-8888-888888888888',
    'allowedProjectIds',jsonb_build_array(r.project_id)),
   r.input_data||jsonb_build_object(
    'postId',gen_random_uuid(),'idempotencyKey','native_reject_foreign'));
  raise exception 'FOREIGN_OWNER_ACCEPTED';
 exception when others then
  if sqlerrm<>'SOCIAL_LAUNCH_NOT_FOUND' then raise; end if;
 end;
end $$;
reset role;

-- Synthetic administrative change: provider binding was blocked.
update public.social_account_bindings
 set blocked_at=clock_timestamp() where platform='instagram';
set role service_role;
do $$
declare r public.social_content_revisions;
begin
 select * into strict r from public.social_content_revisions
 where draft->>'channel'='instagram' limit 1;
 begin
  perform public.social_content_save(
   jsonb_build_object('userId','77777777-7777-4777-8777-777777777777',
    'allowedProjectIds',jsonb_build_array(r.project_id)),
   r.input_data||jsonb_build_object(
    'postId',gen_random_uuid(),'idempotencyKey','native_reject_binding'));
  raise exception 'BLOCKED_ACCOUNT_ACCEPTED';
 exception when others then
  if sqlerrm<>'SOCIAL_CONTENT_REVIEW_REQUIRED' then raise; end if;
 end;
end $$;
reset role;
update public.social_account_bindings set blocked_at=null where platform='instagram';

-- Synthetic administrative change: approval is absent.
delete from public.social_launch_plan_decisions where decision='approve';
set role service_role;
do $$
declare r public.social_content_revisions;
begin
 select * into strict r from public.social_content_revisions limit 1;
 begin
  perform public.social_content_save(
   jsonb_build_object('userId','77777777-7777-4777-8777-777777777777',
    'allowedProjectIds',jsonb_build_array(r.project_id)),
   r.input_data||jsonb_build_object(
    'postId',gen_random_uuid(),'idempotencyKey','native_reject_plan'));
  raise exception 'UNAPPROVED_PLAN_ACCEPTED';
 exception when others then
  if sqlerrm<>'SOCIAL_CONTENT_REVIEW_REQUIRED' then raise; end if;
 end;
 if (select count(*) from public.social_content_posts)<>4 or
    (select count(*) from public.social_content_revisions)<>4 or
    (select count(*) from public.social_weekly_preparations)<>1 then
  raise exception 'REJECTED_ATTEMPT_MUTATED_EDITORIAL_DATA';
 end if;
end $$;
reset role;
select 'FAMILY_WEEKLY_CANONICAL_CONTENT_NEGATIVE_AUTHORITIES_PASS' as result;
