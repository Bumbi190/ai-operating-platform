\set ON_ERROR_STOP on
-- Disposable DB ONLY: the function under test is loaded from the canonical
-- migration, NOT the older synthetic social_weekly_save stub.
create function public.synthetic_weekly_native_input() returns jsonb
language sql stable as $$
select jsonb_build_object(
 'projectId','77cda551-57c9-4dc0-b019-1bb6438777f7',
 'conversationId','55555555-5555-4555-8555-555555555555',
 'weekStart','2027-01-04','generation',1,
 'contextHash',repeat('a',64),
 'idempotencyKey','weekly_20270104_native',
 'drafts',jsonb_build_array(
  jsonb_build_object(
   'slotKey','2027-01-05T17:00:ordinary','channel','facebook',
   'assetId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'title','Nova tisdag på Facebook',
   'text','Nova och Pling berättar om veckans pyssel på Facebook.',
   'sourceReferences',jsonb_build_array('profile:'||repeat('b',64)),
   'scheduledAt','2027-01-05T16:00:00.000Z'),
  jsonb_build_object(
   'slotKey','2027-01-05T17:00:ordinary','channel','instagram',
   'assetId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'title','Nova tisdag på Instagram',
   'text','Följ med Nova och Pling på veckans äventyr i Instagram.',
   'sourceReferences',jsonb_build_array('profile:'||repeat('b',64)),
   'scheduledAt','2027-01-05T16:00:00.000Z'),
  jsonb_build_object(
   'slotKey','2027-01-08T20:30:ordinary','channel','facebook',
   'assetId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'title','Pling fredag på Facebook',
   'text','Fredagsmys med Plings kluriga uppgifter på Facebook.',
   'sourceReferences',jsonb_build_array('profile:'||repeat('b',64)),
   'scheduledAt','2027-01-08T19:30:00.000Z'),
  jsonb_build_object(
   'slotKey','2027-01-08T20:30:ordinary','channel','instagram',
   'assetId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'title','Pling fredag på Instagram',
   'text','Pling önskar er en fin kreativ helg på Instagram.',
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
 lease_until=clock_timestamp()+interval '25 minutes',attempts=1
 where id='66666666-6666-4666-8666-666666666666';
-- The synthetic test directly inserts the admission row because the real
-- Sunday time window is not active in October 2026; no model is invoked.
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
 owner constant uuid:='77777777-7777-4777-8777-777777777777';
 run constant uuid:='66666666-6666-4666-8666-666666666666';
 claim constant uuid:='88888888-8888-4888-8888-888888888888';
 conv constant uuid:='55555555-5555-4555-8555-555555555555';
 payload jsonb:=public.synthetic_weekly_native_input();
 invalid jsonb;
 saved jsonb;
 repeated jsonb;
 source_id uuid;
begin
 -- Missing scheduledAt MUST be denied by the native SQL. The synthetic
 -- social_weekly_save previously failed to catch exactly this regression.
 invalid:=jsonb_set(payload,'{drafts,0}',(payload->'drafts'->0)-'scheduledAt');
 begin
  perform public.family_weekly_save_editorial_if_current(
   owner,run,claim,1,conv,invalid);
  raise exception 'NATIVE_ACCEPTED_MISSING_SCHEDULED_AT';
 exception when others then
  if sqlerrm='NATIVE_ACCEPTED_MISSING_SCHEDULED_AT' then raise; end if;
  if sqlerrm not like '%SOCIAL_SCHEDULE_INVALID_BODY%' then
   raise exception 'UNEXPECTED_NATIVE_INVALID_FIELD_ERROR: %',sqlerrm;
  end if;
 end;
 if (select count(*) from public.social_content_posts)<>0 then
  raise exception 'FAILED_NATIVE_SAVE_CREATED_POSTS';
 end if;
 -- Dates and channels must reflect the fixed Stockholm January slots.
 saved:=public.family_weekly_save_editorial_if_current(
  owner,run,claim,1,conv,payload);
 if saved->>'status'<>'editorial_review_required'
 or saved->'publicationAuthority' is distinct from 'false'::jsonb
 or jsonb_array_length(saved->'posts')<>4 then
  raise exception 'NATIVE_REVIEW_RECEIPT_INVALID: %',saved;
 end if;
 source_id:=(saved->>'preparationId')::uuid;
 if (select count(*) from public.social_content_posts)<>4 or
    (select count(*) from public.social_weekly_preparations)<>1 then
  raise exception 'NATIVE_DRAFTS_NOT_ATOMICALLY_SAVED';
 end if;
 repeated:=public.family_weekly_save_editorial_if_current(
  owner,run,claim,1,conv,payload);
 if repeated->>'preparationId' is distinct from saved->>'preparationId'
 or (select count(*) from public.social_content_posts)<>4 then
  raise exception 'NATIVE_RETRY_NOT_IDEMPOTENT';
 end if;
 insert into public.family_weekly_review_notices(
  project_id,owner_id,preparation_id,week_start,draft_count
 ) values(
  '77cda551-57c9-4dc0-b019-1bb6438777f7',owner,
  source_id,'2027-01-04',4);
 if (select count(*) from public.family_weekly_review_notices)<>1 then
  raise exception 'NATIVE_NOTICE_NOT_PERSISTED';
 end if;
end $$;
reset role;

set role authenticated;
set "request.jwt.claim.sub"='77777777-7777-4777-8777-777777777777';
insert into public.family_weekly_auto_consent_events(
 project_id,owner_id,action,valid_until
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777','revoke',null);
reset role;
set role service_role;
do $$
begin
 begin
  perform public.family_weekly_save_editorial_if_current(
   '77777777-7777-4777-8777-777777777777',
   '66666666-6666-4666-8666-666666666666',
   '88888888-8888-4888-8888-888888888888',1,
   '55555555-5555-4555-8555-555555555555',
   public.synthetic_weekly_native_input());
  raise exception 'NATIVE_SAVE_AFTER_REVOKE';
 exception when insufficient_privilege then null; end;
 if (select count(*) from public.social_content_posts)<>4 or
 (select count(*) from public.social_weekly_preparations)<>1 then
  raise exception 'NATIVE_REVOKE_MUTATED_DRAFTS';
 end if;
end $$;
reset role;
select 'FAMILY_WEEKLY_CANONICAL_NATIVE_SAVE_WITH_STUB_DEPENDENCIES_PASS' as result;
