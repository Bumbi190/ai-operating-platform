-- Test-only proposed replacement. NOT a migration; do not deploy until batch writers share the lock.
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
 -- Shared transaction lock for every calendar writer for this owner.
 perform pg_advisory_xact_lock(hashtextextended('omnira-calendar-owner:'||who::text,0));
 perform pg_advisory_xact_lock(hashtextextended(who::text||key::text,0));
 select * into previous from public.user_calendar_mutations where owner_user_id=who and idempotency_key=key;
 if found then
  if previous.request_hash<>fingerprint then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
  return previous.result;
 end if;
 -- TEST-ONLY: ordinary writes must refuse overlaps while holding the shared owner lock.
 if op in ('create','update','restore') then
  if op='restore' then
   select * into e from public.user_calendar_events where id=eid and owner_user_id=who;
   if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
  end if;
  if coalesce((case when op='restore' then e.draft else p_input->'draft' end)->'time'->>'kind','')='timed' then
   if exists(select 1 from public.user_calendar_events existing
     where existing.owner_user_id=who and existing.status='scheduled' and existing.id<>eid
       and ((existing.draft->'time'->>'kind')='timed'
         and (existing.draft->'time'->>'startUtc')::timestamptz < ((case when op='restore' then e.draft else p_input->'draft' end)->'time'->>'endUtc')::timestamptz
         and coalesce((existing.draft->'time'->>'endUtc')::timestamptz,(existing.draft->'time'->>'startUtc')::timestamptz+interval '15 minutes') > ((case when op='restore' then e.draft else p_input->'draft' end)->'time'->>'startUtc')::timestamptz)
       ) then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
  end if;
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
