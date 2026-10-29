\set ON_ERROR_STOP on
-- Disposable PostgreSQL ONLY. Verbatim canonical social_weekly_context,
-- profile/content readers, JSON canonicalizer, duplicate detection and
-- social_weekly_save with real content persistence; external providers absent.
-- Only the narrow surrounding queue/RLS/binding tables are fixture doubles.
create function public.synthetic_context_weekly_input() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'projectId','77cda551-57c9-4dc0-b019-1bb6438777f7',
 'conversationId','55555555-5555-4555-8555-555555555555',
 'weekStart','2027-01-04','generation',1,
 'contextHash',(
  public.social_weekly_context(
   jsonb_build_object('userId','77777777-7777-4777-8777-777777777777',
    'allowedProjectIds',jsonb_build_array('77cda551-57c9-4dc0-b019-1bb6438777f7')),
   jsonb_build_object('projectId','77cda551-57c9-4dc0-b019-1bb6438777f7',
    'conversationId','55555555-5555-4555-8555-555555555555',
    'weekStart','2027-01-04')
  )->>'contextHash'),
 'idempotencyKey','native_context_full_week_20270104',
 'drafts',jsonb_build_array(
  jsonb_build_object(
   'slotKey','2027-01-05T17:00:ordinary','channel','facebook',
   'assetId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'title','Nova tisdag Facebook',
   'text','Tisdagens nyfikenhet: Upptack en mysig stund med Nova och Pling.',
   'sourceReferences',jsonb_build_array('profile:'||repeat('b',64)),
   'scheduledAt','2027-01-05T16:00:00.000Z'),
  jsonb_build_object(
   'slotKey','2027-01-05T17:00:ordinary','channel','instagram',
   'assetId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'title','Nova tisdag Instagram',
   'text','I dag tipsar vi om att lasa tillsammans och upptacka berattelsen.',
   'sourceReferences',jsonb_build_array('profile:'||repeat('b',64)),
   'scheduledAt','2027-01-05T16:00:00.000Z'),
  jsonb_build_object(
   'slotKey','2027-01-08T20:30:ordinary','channel','facebook',
   'assetId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'title','Pling fredag Facebook',
   'text','Fredagsstunden bjuder pa varm inspiration for familjens fantasi.',
   'sourceReferences',jsonb_build_array('profile:'||repeat('b',64)),
   'scheduledAt','2027-01-08T19:30:00.000Z'),
  jsonb_build_object(
   'slotKey','2027-01-08T20:30:ordinary','channel','instagram',
   'assetId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'title','Pling fredag Instagram',
   'text','Helgen ar har: Pling onskar er tid att skapa nagot eget ihop.',
   'sourceReferences',jsonb_build_array('profile:'||repeat('b',64)),
   'scheduledAt','2027-01-08T19:30:00.000Z')
 )
);
$$;

set role authenticated;
set "request.jwt.claim.sub"='77777777-7777-4777-8777-777777777777';
insert into public.family_weekly_auto_consent_events(
 project_id,owner_id,action,valid_until
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777',
 'enable',clock_timestamp()+interval '80 days'
);
reset role;
set role service_role;
insert into public.family_weekly_run_plans(
 project_id,owner_id,week_start,consent_event_id,conversation_id,run_id
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777',
 '2027-01-04',1,'55555555-5555-4555-8555-555555555555',
 '66666666-6666-4666-8666-666666666666'
);
update public.runs set status='running',
 claim_id='88888888-8888-4888-8888-888888888888',
 lease_until=clock_timestamp()+interval '20 minutes',attempts=1
where id='66666666-6666-4666-8666-666666666666';
-- This ledger row is test-only (no external model is contacted).
insert into public.family_weekly_model_attempts(
 project_id,owner_id,week_start,consent_event_id,run_id,claim_id,conversation_id
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777',
 '2027-01-04',1,'66666666-6666-4666-8666-666666666666',
 '88888888-8888-4888-8888-888888888888',
 '55555555-5555-4555-8555-555555555555'
);
do $$
declare
 actor constant uuid:='77777777-7777-4777-8777-777777777777';
 run constant uuid:='66666666-6666-4666-8666-666666666666';
 claim constant uuid:='88888888-8888-4888-8888-888888888888';
 conv constant uuid:='55555555-5555-4555-8555-555555555555';
 p jsonb:=public.synthetic_context_weekly_input();
 bad jsonb;
 saved jsonb;
 retried jsonb;
begin
 if p->>'contextHash' !~ '^[a-f0-9]{64}$' then
  raise exception 'FULL_CONTEXT_HASH_NOT_VERIFIED';
 end if;
 bad:=jsonb_set(p,'{drafts,0}',(p->'drafts'->0)-'scheduledAt');
 begin
  perform public.family_weekly_save_editorial_if_current(
   actor,run,claim,1,conv,bad);
  raise exception 'FULL_CONTEXT_MISSING_SCHEDULED_AT_ACCEPTED';
 exception when others then
  if sqlerrm<>'SOCIAL_SCHEDULE_INVALID_BODY' then raise;end if;
 end;
 bad:=jsonb_set(p,'{contextHash}',to_jsonb(repeat('0',64)));
 begin
  perform public.family_weekly_save_editorial_if_current(
   actor,run,claim,1,conv,bad);
  raise exception 'FULL_CONTEXT_STALE_HASH_ACCEPTED';
 exception when others then
  if sqlerrm<>'SOCIAL_WEEKLY_CONFLICT' then raise;end if;
 end;
 -- A real provider-attested binding cannot be downgraded or silently
 -- unblocked. Simulate a valid, one-way account block between context read
 -- and save, check the stale-context refusal, then rollback this fixture
 -- subtransaction rather than illicitly reversing a production block.
 begin
  update public.social_account_bindings
   set blocked_at=clock_timestamp(),blocked_reason='account_mismatch'
   where platform='instagram';
  begin
   perform public.family_weekly_save_editorial_if_current(actor,run,claim,1,conv,p);
   raise exception 'FULL_CONTEXT_ACCOUNT_BLOCK_BYPASSED';
  exception when others then
   if sqlerrm<>'SOCIAL_WEEKLY_CONFLICT' then raise;end if;
  end;
  raise exception 'FULL_CONTEXT_TEMP_BLOCK_ROLLBACK';
 exception when others then
  if sqlerrm<>'FULL_CONTEXT_TEMP_BLOCK_ROLLBACK' then raise;end if;
 end;
 if (select count(*) from public.social_content_posts)<>1 then
  raise exception 'FULL_CONTEXT_FAILED_SAVE_CREATED_POSTS';
 end if;

 saved:=public.family_weekly_save_editorial_if_current(actor,run,claim,1,conv,p);
 if saved->>'status'<>'editorial_review_required'
  or saved->'publicationAuthority' is distinct from 'false'::jsonb
  or jsonb_array_length(saved->'posts')<>4 then
  raise exception 'FULL_CONTEXT_NATIVE_WEEKLY_SAVE_FAILED: %',saved;
 end if;
 if (select count(*) from public.social_content_posts)<>5
  or (select count(*) from public.social_content_revisions)<>5
  or (select count(*) from public.social_weekly_preparations)<>1 then
  raise exception 'FULL_CONTEXT_NOT_ALL_EDITORIAL_POSTS_SAVED';
 end if;
 if (select count(*) from public.social_content_decisions)<>0 or
    (select count(*) from public.social_schedule_jobs)<>0 or
    (select count(*) from public.social_publications)<>0 then
  raise exception 'FULL_CONTEXT_UNAUTHORIZED_APPROVAL_OR_PUBLICATION';
 end if;
 if (select count(distinct draft->>'scheduledAt')
     from public.social_content_revisions where
       id not in (select current_revision_id from public.social_content_posts
       where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'))<>2 then
  raise exception 'FULL_CONTEXT_WEEKLY_SLOTS_INCORRECT';
 end if;

 retried:=public.family_weekly_save_editorial_if_current(actor,run,claim,1,conv,p);
 if retried->>'preparationId'<>saved->>'preparationId'
 or (select count(*) from public.social_content_posts)<>5 then
  raise exception 'FULL_CONTEXT_NATIVE_RETRY_NOT_IDEMPOTENT';
 end if;
 insert into public.family_weekly_review_notices(
  project_id,owner_id,preparation_id,week_start,draft_count
 ) values(
  '77cda551-57c9-4dc0-b019-1bb6438777f7',actor,
  (saved->>'preparationId')::uuid,'2027-01-04',4
 );
 if (select count(*) from public.family_weekly_review_notices)<>1 then
  raise exception 'FULL_CONTEXT_REVIEW_NOTICE_MISSING';
 end if;
end $$;
reset role;
set role authenticated;
set "request.jwt.claim.sub"='77777777-7777-4777-8777-777777777777';
insert into public.family_weekly_auto_consent_events(
 project_id,owner_id,action,valid_until
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777','revoke',null
);
reset role;
set role service_role;
do $$
begin
 if public.family_weekly_authority_current(
  '77777777-7777-4777-8777-777777777777',
  '66666666-6666-4666-8666-666666666666',
  '88888888-8888-4888-8888-888888888888',1,
  '55555555-5555-4555-8555-555555555555','2027-01-04'
 ) then raise exception 'FULL_CONTEXT_OLD_GRANT_STILL_VALID_AFTER_REVOKE';end if;
 if (select count(*) from public.social_content_posts)<>5
 or (select count(*) from public.family_weekly_review_notices)<>1 then
  raise exception 'FULL_CONTEXT_REVOKE_MUTATED_EXISTING_DRAFTS';
 end if;
end $$;
reset role;
select 'FAMILY_WEEKLY_NATIVE_CONTEXT_TO_EDITORIAL_SAVE_PASS' as result;
