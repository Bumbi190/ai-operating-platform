-- ISOLATED TEST PROTOTYPE ONLY. Never run in production without complete source consistency gates.
-- Fixture-only receipt ledger. Owner-scoped and inaccessible to clients directly.
create table if not exists public.calendar_week_probe_receipts(owner_user_id uuid not null,request_key uuid not null,request_hash text not null,result jsonb not null,primary key(owner_user_id,request_key));
revoke all on public.calendar_week_probe_receipts from public,anon,authenticated,service_role;
create or replace function public.calendar_week_batch_probe(p_input jsonb,p_key uuid)
-- Fixture-only elevated function reads sealed receipt ledger; production requires separate reviewed RLS/privilege design.
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare who uuid:=auth.uid(); row jsonb; title text; starts timestamptz; ends timestamptz; digest text; prior public.calendar_week_probe_receipts; outcome jsonb;
begin
 if who is null then return jsonb_build_object('ok',false,'code','UNAUTHORIZED'); end if;
 if p_key is null then raise exception 'INVALID_INPUT' using errcode='23514'; end if;
 if jsonb_typeof(p_input)<>'array' or jsonb_array_length(p_input) not between 1 and 15 then raise exception 'INVALID_INPUT' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('omnira-calendar-owner:'||who::text,0));
 digest:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
 select * into prior from public.calendar_week_probe_receipts where owner_user_id=who and request_key=p_key;
 if found then
  if prior.request_hash<>digest then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
  return prior.result;
 end if;
 -- FAIL-CLOSED: recurrence expansion is not yet reproduced in this SQL prototype.
 -- Any active repeating event for this owner blocks batch writes until canonical occurrence checking is implemented.
 if exists(select 1 from public.user_calendar_events e where e.owner_user_id=who and e.status='scheduled' and e.draft->'repeat' is not null and e.draft->'repeat'<>'null'::jsonb) then raise exception 'RECURRING_SOURCE_NOT_SUPPORTED' using errcode='23514'; end if;
 for row in select value from jsonb_array_elements(p_input) loop
  if jsonb_typeof(row)<>'object' or not(row ?& array['title','startUtc','endUtc']) then raise exception 'INVALID_INPUT' using errcode='23514'; end if;
  title:=row->>'title';starts:=(row->>'startUtc')::timestamptz;ends:=(row->>'endUtc')::timestamptz;
  if title is null or length(title) not between 1 and 150 or starts is null or ends is null or starts>=ends then raise exception 'INVALID_INPUT' using errcode='23514'; end if;
  if exists(select 1 from public.user_calendar_events e where e.owner_user_id=who and e.status='scheduled' and (e.draft->'time'->>'kind')='timed' and (e.draft->'time'->>'startUtc')::timestamptz < ends and coalesce((e.draft->'time'->>'endUtc')::timestamptz,(e.draft->'time'->>'startUtc')::timestamptz + interval '15 minutes') > starts) then raise exception 'CONFLICT' using errcode='23505'; end if;
  if exists(select 1 from public.user_calendar_events e where e.owner_user_id=who and e.status='scheduled' and (e.draft->'time'->>'kind')='all_day' and ((e.draft->'time'->>'startDate')::date::timestamp at time zone 'Europe/Stockholm') < ends and ((e.draft->'time'->>'endDateExclusive')::date::timestamp at time zone 'Europe/Stockholm') > starts) then raise exception 'CONFLICT' using errcode='23505'; end if;
  insert into public.user_calendar_events(id,owner_user_id,draft) values(gen_random_uuid(),who,jsonb_build_object('kind','private','title',title,'description','','location','','projectId',null,'taskId',null,'time',jsonb_build_object('kind','timed','startUtc',to_char(starts at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'endUtc',to_char(ends at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'timeZone','Europe/Stockholm'),'workStatus',null));
 end loop;
 outcome:=jsonb_build_object('ok',true,'count',jsonb_array_length(p_input));
 insert into public.calendar_week_probe_receipts(owner_user_id,request_key,request_hash,result) values(who,p_key,digest,outcome);
 return outcome;
exception when others then raise;
end $fn$;
revoke all on function public.calendar_week_batch_probe(jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.calendar_week_batch_probe(jsonb,uuid) to authenticated;
