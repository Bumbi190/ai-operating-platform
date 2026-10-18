-- User-owned Omnira calendar. No social queue, approval or agent execution writes.
create or replace function public.calendar_draft_valid(d jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $fn$
declare t jsonb; a text; b text;
begin
 if jsonb_typeof(d) <> 'object' or not (d ?& array['kind','title','description','location','projectId','taskId','time','workStatus'])
 or exists(select 1 from jsonb_object_keys(d) k where k not in ('kind','title','description','location','projectId','taskId','time','workStatus')) then return false; end if;
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
 return true;
exception when others then return false;
end $fn$;

create table public.user_calendar_events (
 id uuid primary key,
 owner_user_id uuid not null default auth.uid() references auth.users(id),
 draft jsonb not null check(public.calendar_draft_valid(draft)),
 version integer not null default 1 check(version > 0),
 status text not null default 'scheduled' check(status in ('scheduled','cancelled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_user_id,id)
);
create index user_calendar_events_owner on public.user_calendar_events(owner_user_id);

create table public.user_calendar_mutations (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null default auth.uid() references auth.users(id),
 idempotency_key uuid not null,
 operation text not null check(operation in ('create','update','cancel','restore')),
 event_id uuid not null,
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 result jsonb not null check(result->'ok'='true'::jsonb and result->'event'->>'id'=event_id::text),
 created_at timestamptz not null default now(),
 unique(owner_user_id,idempotency_key),
 foreign key(owner_user_id,event_id) references public.user_calendar_events(owner_user_id,id)
);
alter table public.user_calendar_events enable row level security;
alter table public.user_calendar_mutations enable row level security;
create policy calendar_owner_select on public.user_calendar_events for select to authenticated using(owner_user_id=(select auth.uid()));
create policy calendar_owner_insert on public.user_calendar_events for insert to authenticated with check(owner_user_id=(select auth.uid()));
create policy calendar_owner_update on public.user_calendar_events for update to authenticated using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));
create policy calendar_mutation_select on public.user_calendar_mutations for select to authenticated using(owner_user_id=(select auth.uid()));
create policy calendar_mutation_insert on public.user_calendar_mutations for insert to authenticated with check(owner_user_id=(select auth.uid()));
revoke all on public.user_calendar_events,public.user_calendar_mutations from public,anon,authenticated,service_role;
grant select,insert,update on public.user_calendar_events to authenticated;
grant select,insert on public.user_calendar_mutations to authenticated;

create or replace function public.calendar_event_row_guard()
returns trigger language plpgsql security invoker set search_path = '' as $fn$
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 if TG_OP='INSERT' then
  new.owner_user_id := auth.uid();new.version := 1;new.created_at := now();
 elsif new.id <> old.id or new.owner_user_id <> old.owner_user_id or old.owner_user_id <> auth.uid() then
  raise exception 'INVALID_INPUT' using errcode='23514';
 else
  new.version := old.version+1;new.created_at := old.created_at;
 end if;
 if new.draft->>'projectId' is not null and not exists(
  select 1 from public.projects where id=(new.draft->>'projectId')::uuid and owner_id=auth.uid()
 ) then raise exception 'INVALID_INPUT' using errcode='23514'; end if;
 if new.draft->>'taskId' is not null and not exists(
  select 1 from public.manager_tasks where id=(new.draft->>'taskId')::uuid and project_id=(new.draft->>'projectId')::uuid
 ) then raise exception 'INVALID_INPUT' using errcode='23514'; end if;
 new.updated_at := now();return new;
end $fn$;
create trigger calendar_event_row_guard before insert or update on public.user_calendar_events for each row execute function public.calendar_event_row_guard();

create or replace function public.calendar_event_json(e public.user_calendar_events)
returns jsonb language sql stable security invoker set search_path = '' as $fn$
 select e.draft || jsonb_build_object('id',e.id,'version',e.version,'status',e.status,
 'createdAt',to_char(e.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'updatedAt',to_char(e.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$fn$;

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

create or replace function public.calendar_event_apply(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $fn$
declare who uuid:=auth.uid(); eid uuid; key uuid; op text; fingerprint text; previous public.user_calendar_mutations;
 e public.user_calendar_events; result jsonb; mid uuid:=gen_random_uuid(); local_day date; expected integer;
begin
 if who is null then return jsonb_build_object('ok',false,'code','UNAUTHORIZED'); end if;
 if jsonb_typeof(p_input)<>'object' or not(p_input ?& array['operation','eventId','idempotencyKey'])
 or exists(select 1 from jsonb_object_keys(p_input) k where k not in('operation','eventId','idempotencyKey','draft','expectedVersion')) then return jsonb_build_object('ok',false,'code','INVALID_INPUT'); end if;
 eid:=(p_input->>'eventId')::uuid;key:=(p_input->>'idempotencyKey')::uuid;op:=p_input->>'operation';
 if eid is null or key is null or op is null or op not in('create','update','cancel','restore')
 or (op='create' and p_input ? 'expectedVersion')
 or (op in('cancel','restore') and p_input ? 'draft')
 or (op in('create','update') and not coalesce(public.calendar_draft_valid(p_input->'draft'),false))
 then return jsonb_build_object('ok',false,'code','INVALID_INPUT'); end if;
 if op<>'create' then
  if jsonb_typeof(p_input->'expectedVersion') is distinct from 'number' or (p_input->>'expectedVersion') !~ '^[1-9][0-9]*$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT'); end if;
  expected:=(p_input->>'expectedVersion')::integer;
 end if;
 fingerprint:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(who::text||key::text,0));
 select * into previous from public.user_calendar_mutations where owner_user_id=who and idempotency_key=key;
 if found then
  if previous.request_hash<>fingerprint then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
  return previous.result;
 end if;
 if op='create' then
  insert into public.user_calendar_events(id,owner_user_id,draft) values(eid,who,p_input->'draft') returning * into e;
 else
  select * into e from public.user_calendar_events where id=eid and owner_user_id=who for update;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
  if e.version<>expected then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
  update public.user_calendar_events set
   draft=case when op='update' then p_input->'draft' else draft end,
   status=case when op='cancel' then 'cancelled' when op='restore' then 'scheduled' else status end
   where id=eid and owner_user_id=who returning * into e;
 end if;
 local_day:=case when e.draft->'time'->>'kind'='all_day' then (e.draft->'time'->>'startDate')::date
 else ((e.draft->'time'->>'startUtc')::timestamptz at time zone 'Europe/Stockholm')::date end;
 local_day:=local_day-(extract(isodow from local_day)::integer-1);
 result:=jsonb_build_object('ok',true,'mutationId',mid,'event',public.calendar_event_json(e),'calendarHref','/calendar?week='||to_char(local_day,'YYYY-MM-DD'));
 insert into public.user_calendar_mutations(id,owner_user_id,idempotency_key,operation,event_id,request_hash,result) values(mid,who,key,op,eid,fingerprint,result);
 return result;
exception
 when unique_violation then return jsonb_build_object('ok',false,'code','CONFLICT');
 when check_violation or foreign_key_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $fn$;

revoke all on function public.calendar_draft_valid(jsonb),public.calendar_event_row_guard(),public.calendar_event_json(public.user_calendar_events),public.calendar_event_list(jsonb),public.calendar_event_apply(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.calendar_draft_valid(jsonb),public.calendar_event_json(public.user_calendar_events),public.calendar_event_list(jsonb),public.calendar_event_apply(jsonb) to authenticated;
