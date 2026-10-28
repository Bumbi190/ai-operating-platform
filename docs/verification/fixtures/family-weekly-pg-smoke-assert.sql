\set ON_ERROR_STOP on
-- Real PostgreSQL 16 role/trigger/once-only smoke tests against synthetics.
-- Assertions fail psql with nonzero status. Never run on a real project DB.

set role authenticated;
set "request.jwt.claim.sub" = '77777777-7777-4777-8777-777777777777';

insert into public.family_weekly_auto_consent_events(
 project_id,owner_id,action,valid_until
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777',
 'enable',clock_timestamp()+interval '7 days'
);
do $$
begin
 if (select count(*) from public.family_weekly_auto_consent_events)<>1 then
  raise exception 'OWNER_CANNOT_READ_OWN_CONSENT';
 end if;
 if (select can_publish from public.family_weekly_auto_consent_events limit 1) is distinct from false then
  raise exception 'OWNER_MAY_PUBLISH';
 end if;
end $$;

-- Signed-in foreign user must not see the owner's consent or add her own.
set "request.jwt.claim.sub" = '88888888-8888-4888-8888-888888888888';
do $$
begin
 if (select count(*) from public.family_weekly_auto_consent_events)<>0 then
  raise exception 'FOREIGN_CAN_READ_CONSENT';
 end if;
 begin
  insert into public.family_weekly_auto_consent_events(
   project_id,owner_id,action,valid_until
  ) values(
   '77cda551-57c9-4dc0-b019-1bb6438777f7',
   '88888888-8888-4888-8888-888888888888',
   'enable',clock_timestamp()+interval '7 days'
  );
  raise exception 'FOREIGN_INSERT_WAS_ALLOWED';
 exception
  when insufficient_privilege then null;
 end;
end $$;

reset role;
set role service_role;
-- The synthetic fixture starts with a pending native workflow row.
-- Link it to the unique weekly queue plan (one per week) BEFORE the model
-- admission, then simulate the existing claim_runs() atomic claim.
insert into public.family_weekly_run_plans(
 project_id,owner_id,week_start,consent_event_id,
 conversation_id,run_id
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777',
 '2027-01-04'::date,1,
 '55555555-5555-4555-8555-555555555555',
 '66666666-6666-4666-8666-666666666666'
);
update public.runs
 set status='running',
 claim_id='88888888-8888-4888-8888-888888888888',
 lease_until=clock_timestamp()+interval '25 minutes',attempts=1
 where id='66666666-6666-4666-8666-666666666666';
do $$
declare
 family constant uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7';
 owner constant uuid:='77777777-7777-4777-8777-777777777777';
 conv constant uuid:='55555555-5555-4555-8555-555555555555';
 run constant uuid:='66666666-6666-4666-8666-666666666666';
 claim constant uuid:='88888888-8888-4888-8888-888888888888';
 event bigint;
 denied jsonb;
 saved jsonb;
 prep uuid;
begin
 select max(event_id) into event from public.family_weekly_auto_consent_events;
 if event is null then raise exception 'OWNER_EVENT_MISSING';end if;
 if not public.family_weekly_authority_current(owner,run,claim,event,conv,'2027-01-04'::date) then
  raise exception 'BOUND_RUN_OR_OWNER_VERIFICATION_FAILED';
 end if;
 if public.family_weekly_authority_current(owner,run,'11111111-1111-4111-8111-111111111111',event,conv,'2027-01-04'::date) then
  raise exception 'FORGED_CLAIM_ACCEPTED';
 end if;
 -- Mirror native social_content_active: all three STOP sources must
 -- revoke claimed-run authority BEFORE any possible paid admission.
 update public.projects set execution_paused=true where id=family;
 if public.family_weekly_authority_current(owner,run,claim,event,conv,'2027-01-04') then
  raise exception 'PAUSED_PROJECT_HAS_MODEL_AUTHORITY';
 end if;
 update public.projects set execution_paused=false where id=family;
 update public.platform_config set automation_paused=true;
 if public.family_weekly_authority_current(owner,run,claim,event,conv,'2027-01-04') then
  raise exception 'GLOBAL_STOP_HAS_MODEL_AUTHORITY';
 end if;
 update public.platform_config set automation_paused=false;
 insert into public.project_lifecycle(project_id,state) values(family,'hibernate');
 if public.family_weekly_authority_current(owner,run,claim,event,conv,'2027-01-04') then
  raise exception 'INACTIVE_PROJECT_HAS_MODEL_AUTHORITY';
 end if;
 delete from public.project_lifecycle where project_id=family;
 denied:=public.family_weekly_admit_once(owner,'2027-01-04'::date,run,claim,event,conv);
 if denied->>'status' is distinct from 'blocked' then
  raise exception 'PRE_START_SUNDAY_WINDOW_ACCEPTED';
 end if;
 if (select count(*) from public.family_weekly_model_attempts)<>0 then
  raise exception 'EARLY_ATTEMPT_SAVED';
 end if;
 -- Direct fixture-only synthetic row proves unique project/week constraint.
 -- Real production worker may NOT write this directly (RPC only).
 insert into public.family_weekly_model_attempts(
  project_id,owner_id,week_start,consent_event_id,run_id,claim_id,conversation_id
 ) values(family,owner,'2027-01-04'::date,event,run,claim,conv);
 begin
  insert into public.family_weekly_model_attempts(
   project_id,owner_id,week_start,consent_event_id,run_id,claim_id,conversation_id
  ) values(
   family,owner,'2027-01-04'::date,event,
   '11111111-1111-4111-8111-111111111111',claim,conv
  );
  raise exception 'DUPLICATE_WEEK_ACCEPTED';
 exception when unique_violation then null;
 end;
 if (select count(*) from public.family_weekly_model_attempts)<>1 then
  raise exception 'MORE_THAN_ONE_MODEL_ATTEMPT';
 end if;
 saved:=public.family_weekly_save_editorial_if_current(owner,run,claim,event,conv,
  jsonb_build_object(
   'projectId',family,'conversationId',conv,'weekStart','2027-01-04',
   'contextHash',repeat('a',64),'generation',1,
   'idempotencyKey','weekly_20270104_demo','drafts','[]'::jsonb
  )
 );
 if saved->>'status' is distinct from 'editorial_review_required' or
    saved->'publicationAuthority' is distinct from 'false'::jsonb then
  raise exception 'NO_EDITORIAL_SAVE_RECEIPT';
 end if;
 prep:=(saved->>'preparationId')::uuid;
 insert into public.family_weekly_review_notices(
  project_id,owner_id,preparation_id,week_start,draft_count
 ) values(family,owner,prep,'2027-01-04'::date,2);
 if (select count(*) from public.family_weekly_review_notices)<>1 then
  raise exception 'NOTICE_INSERT_FAILED';
 end if;
 begin
  insert into public.family_weekly_review_notices(
   project_id,owner_id,preparation_id,week_start,draft_count
  ) values(family,owner,prep,'2027-01-04'::date,2);
  raise exception 'DUPLICATE_NOTICE_ACCEPTED';
 exception when unique_violation then null;
 end;
end $$;
reset role;

-- Owner can see her notice through RLS; other user never can.
set role authenticated;
set "request.jwt.claim.sub" = '77777777-7777-4777-8777-777777777777';
do $$
begin
 if (select count(*) from public.family_weekly_review_notices)<>1 then
  raise exception 'OWNER_NOTICE_NOT_VISIBLE';
 end if;
end $$;
set "request.jwt.claim.sub" = '88888888-8888-4888-8888-888888888888';
do $$
begin
 if (select count(*) from public.family_weekly_review_notices)<>0 then
  raise exception 'FOREIGN_NOTICE_VISIBLE';
 end if;
end $$;
-- Owner revoke is an independent, append-only database event.
set "request.jwt.claim.sub" = '77777777-7777-4777-8777-777777777777';
insert into public.family_weekly_auto_consent_events(
 project_id,owner_id,action,valid_until
) values(
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 '77777777-7777-4777-8777-777777777777','revoke',null
);
reset role;
set role service_role;
do $$
declare event bigint;
begin
 select min(event_id) into event from public.family_weekly_auto_consent_events;
 if public.family_weekly_authority_current(
   '77777777-7777-4777-8777-777777777777',
   '66666666-6666-4666-8666-666666666666',
   '88888888-8888-4888-8888-888888888888',
   event,
   '55555555-5555-4555-8555-555555555555',
   '2027-01-04'::date
  ) then
  raise exception 'REVOKED_OLD_GRANT_STILL_ACTIVE';
 end if;
 begin
  perform public.family_weekly_save_editorial_if_current(
   '77777777-7777-4777-8777-777777777777',
   '66666666-6666-4666-8666-666666666666',
   '88888888-8888-4888-8888-888888888888',
   event,
   '55555555-5555-4555-8555-555555555555',
   jsonb_build_object(
    'projectId','77cda551-57c9-4dc0-b019-1bb6438777f7',
    'conversationId','55555555-5555-4555-8555-555555555555',
    'weekStart','2027-01-04'
   )
  );
  raise exception 'REVOKED_SAVE_WAS_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;

-- Trigger must enforce immutable rows even for a privileged DB owner.
do $$
begin
 begin
  update public.family_weekly_auto_consent_events set action='enable';
  raise exception 'CONSENT_MODIFIED';
 exception when insufficient_privilege then null;
 end;
 begin
  delete from public.family_weekly_review_notices;
  raise exception 'NOTICE_DELETED';
 exception when insufficient_privilege then null;
 end;
end $$;

select 'FAMILY_WEEKLY_SYNTHETIC_PG_ROLE_AND_CLAIM_TESTS_PASS' as result;
