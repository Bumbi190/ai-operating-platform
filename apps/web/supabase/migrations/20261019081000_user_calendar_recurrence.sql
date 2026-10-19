-- Recurrence support for private user-owned calendar series; no writes to social queues.
create or replace function public.calendar_draft_valid(d jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $fn$
declare t jsonb; a text; b text;
begin
 if jsonb_typeof(d) <> 'object' or not (d ?& array['kind','title','description','location','projectId','taskId','time','workStatus'])
 or exists(select 1 from jsonb_object_keys(d) k where k not in ('kind','title','description','location','projectId','taskId','time','workStatus','repeat')) then return false; end if;
 if coalesce(d->>'kind','') not in ('private','work_block') or jsonb_typeof(d->'title') <> 'string'
 or length(btrim(d->>'title')) not between 1 and 150 or d->>'title' <> btrim(d->>'title') or (d->>'title') ~ '[[:cntrl:]]'
 or jsonb_typeof(d->'description') <> 'string' or length(d->>'description') > 5000
 or regexp_replace(d->>'description',E'[\n\r\t]','','g') ~ '[[:cntrl:]]'
 or jsonb_typeof(d->'location') <> 'string' or length(d->>'location') > 500 or (d->>'location') ~ '[[:cntrl:]]' then return false; end if;
 if (d->>'kind' = 'private' and d->'workStatus' <> 'null'::jsonb)
 or (d->>'kind' = 'work_block' and coalesce(d->>'workStatus','') not in ('planned','in_progress','done')) then return false; end if;
 foreach a in array array['projectId','taskId'] loop
  if d->a <> 'null'::jsonb and (jsonb_typeof(d->a) <> 'string' or d->>a !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') then return false; end if;
 end loop;
 if d->'taskId' <> 'null'::jsonb and d->'projectId' = 'null'::jsonb then return false; end if;
 t := d->'time';
 if jsonb_typeof(t) <> 'object' or t->>'timeZone' is distinct from 'Europe/Stockholm' then return false; end if;
 if t->>'kind' = 'timed' then
  if not(t ?& array['kind','startUtc','endUtc','timeZone']) or exists(select 1 from jsonb_object_keys(t) k where k not in ('kind','startUtc','endUtc','timeZone')) then return false; end if;
  foreach a in array array['startUtc','endUtc'] loop
   if a='endUtc' and t->a='null'::jsonb then continue; end if;
   b := t->>a;
   if jsonb_typeof(t->a) <> 'string' or b !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
   or to_char(b::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> b then return false; end if;
  end loop;
  if t->'endUtc' <> 'null'::jsonb and (t->>'endUtc')::timestamptz <= (t->>'startUtc')::timestamptz then return false; end if;
 elsif t->>'kind' = 'all_day' then
  if not(t ?& array['kind','startDate','endDateExclusive','timeZone']) or exists(select 1 from jsonb_object_keys(t) k where k not in ('kind','startDate','endDateExclusive','timeZone')) then return false; end if;
  foreach a in array array['startDate','endDateExclusive'] loop
   b := t->>a;
   if jsonb_typeof(t->a)<>'string' or b !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(b::date,'YYYY-MM-DD')<>b then return false; end if;
  end loop;
  if (t->>'endDateExclusive')::date <= (t->>'startDate')::date then return false; end if;
 else return false;
 end if;
 if d ? 'repeat' and d->'repeat' <> 'null'::jsonb then
  if jsonb_typeof(d->'repeat') <> 'object'
   or not (d->'repeat' ?& array['frequency','until'])
   or exists(select 1 from jsonb_object_keys(d->'repeat') k where k not in ('frequency','until'))
   or coalesce(d->'repeat'->>'frequency','') not in ('daily','weekly')
   or (d->'repeat'->'until' <> 'null'::jsonb and (
       jsonb_typeof(d->'repeat'->'until') <> 'string'
       or (d->'repeat'->>'until') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} when others then return false;
end $fn$;


       or to_char((d->'repeat'->>'until')::date,'YYYY-MM-DD') <> d->'repeat'->>'until'
       or (d->'repeat'->>'until')::date < (case when t->>'kind'='all_day' then (t->>'startDate')::date else ((t->>'startUtc')::timestamptz at time zone 'Europe/Stockholm')::date end)
   )) then return false; end if;
 end if;
 return true;
exception when others then return false;
end $fn$;


create or replace function public.calendar_event_list(p_input jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $fn$
declare first_date date; last_date date; items jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'code','UNAUTHORIZED'); end if;
 if jsonb_typeof(p_input)<>'object' or not(p_input ?& array['fromDate','toDateExclusive','timeZone'])
 or exists(select 1 from jsonb_object_keys(p_input) k where k not in('fromDate','toDateExclusive','timeZone'))
 or p_input->>'timeZone' is distinct from 'Europe/Stockholm' then return jsonb_build_object('ok',false,'code','INVALID_INPUT'); end if;
 if coalesce(p_input->>'fromDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(p_input->>'toDateExclusive','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT'); end if;
 first_date := (p_input->>'fromDate')::date;last_date := (p_input->>'toDateExclusive')::date;
 if to_char(first_date,'YYYY-MM-DD')<>p_input->>'fromDate' or to_char(last_date,'YYYY-MM-DD')<>p_input->>'toDateExclusive'
 or last_date-first_date not between 1 and 31 then return jsonb_build_object('ok',false,'code','INVALID_INPUT'); end if;
 select coalesce(jsonb_agg(public.calendar_event_json(e) order by e.created_at,e.id),'[]'::jsonb) into items from (
  select * from public.user_calendar_events where owner_user_id=auth.uid() and (
   (draft->'repeat'->>'frequency' in ('daily','weekly')
    and (case when draft->'time'->>'kind'='all_day' then (draft->'time'->>'startDate')::date
     else ((draft->'time'->>'startUtc')::timestamptz at time zone 'Europe/Stockholm')::date end) < last_date
    and (draft->'repeat'->>'until' is null or (draft->'repeat'->>'until')::date >= first_date))
   or
   (draft->'time'->>'kind'='all_day' and (draft->'time'->>'startDate')::date<last_date and (draft->'time'->>'endDateExclusive')::date>first_date)
   or (draft->'time'->>'kind'='timed'
    and (draft->'time'->>'startUtc')::timestamptz < (last_date::timestamp at time zone 'Europe/Stockholm')
    and coalesce((draft->'time'->>'endUtc')::timestamptz,(draft->'time'->>'startUtc')::timestamptz) >= (first_date::timestamp at time zone 'Europe/Stockholm')
    and ((draft->'time'->>'endUtc') is null or (draft->'time'->>'endUtc')::timestamptz > (first_date::timestamp at time zone 'Europe/Stockholm')))
  ) order by created_at,id limit 501
 ) e;
 return jsonb_build_object('events',(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(items) with ordinality x(value,n) where n<=500),'truncated',jsonb_array_length(items)>500);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $fn$;

