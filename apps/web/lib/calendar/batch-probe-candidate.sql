-- ISOLATED TEST PROTOTYPE ONLY. Never run in production without complete source consistency gates.
create or replace function public.calendar_week_batch_probe(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $fn$
declare who uuid:=auth.uid(); row jsonb; title text; starts timestamptz; ends timestamptz;
begin
 if who is null then return jsonb_build_object('ok',false,'code','UNAUTHORIZED'); end if;
 if jsonb_typeof(p_input)<>'array' or jsonb_array_length(p_input) not between 1 and 15 then raise exception 'INVALID_INPUT' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('omnira-calendar-owner:'||who::text,0));
 for row in select value from jsonb_array_elements(p_input) loop
  if jsonb_typeof(row)<>'object' or not(row ?& array['title','startUtc','endUtc']) then raise exception 'INVALID_INPUT' using errcode='23514'; end if;
  title:=row->>'title';starts:=(row->>'startUtc')::timestamptz;ends:=(row->>'endUtc')::timestamptz;
  if title is null or length(title) not between 1 and 150 or starts is null or ends is null or starts>=ends then raise exception 'INVALID_INPUT' using errcode='23514'; end if;
  if exists(select 1 from public.user_calendar_events e where e.owner_user_id=who and e.status='scheduled' and (e.draft->'time'->>'kind')='timed' and (e.draft->'time'->>'startUtc')::timestamptz < ends and coalesce((e.draft->'time'->>'endUtc')::timestamptz,(e.draft->'time'->>'startUtc')::timestamptz + interval '15 minutes') > starts) then raise exception 'CONFLICT' using errcode='23505'; end if;
  insert into public.user_calendar_events(id,owner_user_id,draft) values(gen_random_uuid(),who,jsonb_build_object('kind','private','title',title,'description','','location','','projectId',null,'taskId',null,'time',jsonb_build_object('kind','timed','startUtc',to_char(starts at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'endUtc',to_char(ends at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'timeZone','Europe/Stockholm'),'workStatus',null));
 end loop;
 return jsonb_build_object('ok',true,'count',jsonb_array_length(p_input));
exception when others then raise;
end $fn$;
revoke all on function public.calendar_week_batch_probe(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.calendar_week_batch_probe(jsonb) to authenticated;
