-- Reviewed metadata and preparation checks only. No sender or scheduler changes.
create table public.sales_contact_timing_rules(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),owner_id uuid not null,
 version integer not null check(version>0),previous_id uuid,request_key uuid not null,request jsonb not null,
 min_wait_seconds integer not null check(min_wait_seconds>=1209600),max_reminders integer not null check(max_reminders between 0 and 1),
 max_source_age_seconds integer not null check(max_source_age_seconds between 1 and 900),created_at timestamptz not null default clock_timestamp(),
 unique(project_id,id),unique(project_id,version),unique(project_id,request_key),
 foreign key(project_id,previous_id) references public.sales_contact_timing_rules(project_id,id),check((version=1)=(previous_id is null))
);
create table public.sales_contact_history_revisions(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),owner_id uuid not null,recipient text not null,
 version integer not null check(version>0),previous_id uuid,request_key uuid not null,request jsonb not null,data jsonb not null,source_context jsonb not null,
 created_at timestamptz not null default clock_timestamp(),unique(project_id,id),unique(project_id,recipient,version),unique(project_id,request_key),
 foreign key(project_id,previous_id) references public.sales_contact_history_revisions(project_id,id),check((version=1)=(previous_id is null)),
 check(recipient=lower(btrim(recipient)) and recipient !~ E'[\\r\\n]' and length(recipient) between 3 and 254)
);
alter table public.sales_contact_timing_rules enable row level security;
alter table public.sales_contact_history_revisions enable row level security;
revoke all on public.sales_contact_timing_rules,public.sales_contact_history_revisions from public,anon,authenticated,service_role;
grant select,insert on public.sales_contact_timing_rules,public.sales_contact_history_revisions to service_role;
create trigger sales_timing_rules_immutable before update or delete on public.sales_contact_timing_rules for each row execute function public.sales_immutable();
create trigger sales_timing_history_immutable before update or delete on public.sales_contact_history_revisions for each row execute function public.sales_immutable();

create function public.sales_timing_fields(v jsonb,keys text[]) returns void language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'object' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 if not(v ?& keys) or exists(select from jsonb_object_keys(v) k where not(k=any(keys))) then raise exception 'INVALID_BODY' using errcode='22023';end if;
end$$;
create function public.sales_timing_uuid(v jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 return (v#>>'{}')::uuid;
end$$;
create function public.sales_timing_text(v jsonb) returns text language plpgsql security invoker set search_path='' as $$
declare s text:=v#>>'{}';begin
 if jsonb_typeof(v) is distinct from 'string' or length(btrim(s)) not between 1 and 500 or s ~ E'[\\r\\n\\x01]' then raise exception 'INVALID_BODY' using errcode='22023';end if;return s;
end$$;
create function public.sales_timing_instant(v jsonb,at timestamptz) returns timestamptz language plpgsql security invoker set search_path='' as $$
declare s text:=v#>>'{}';t timestamptz;begin
 if jsonb_typeof(v) is distinct from 'string' or s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 t:=s::timestamptz;if not isfinite(t) or t>at then raise exception 'INVALID_BODY' using errcode='22023';end if;return t;
exception when invalid_datetime_format or datetime_field_overflow or invalid_time_zone_displacement_value then raise exception 'INVALID_BODY' using errcode='22023';
end$$;
create function public.sales_timing_context(pid uuid,address text) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('mailboxes',coalesce((select jsonb_agg(jsonb_build_array(b.id,b.generation,b.email,b.status,c.version,c.epoch,c.since_at,c.selected_contact_ids) order by b.id) from public.sales_mailbox_connections b left join public.sales_inbox_configs c on c.mailbox_id=b.id where b.project_id=pid),'[]'::jsonb),
 'inbox',coalesce((select jsonb_agg(jsonb_build_array(m.id,m.version,m.mailbox_id,m.internal_date) order by m.id) from public.sales_inbox_messages m where m.project_id=pid and lower(btrim(coalesce(substring(m.header->>'from' from '<([^<>]+)>'),m.header->>'from')))=address),'[]'::jsonb))
$$;
create function public.sales_timing_validate_history(d jsonb,at timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare s jsonb;e jsonb;p jsonb;x jsonb;t jsonb;sid text;since_at timestamptz;through_at timestamptz;occurred timestamptz;begin
 perform public.sales_timing_fields(d,array['schemaVersion','contactVersions','history','olderHistoryAttestation','sources','events','correctionOf','reviewNote']);
 if d->'schemaVersion' is distinct from '1'::jsonb or coalesce(d->>'history','') not in('unknown','owner_confirmed_none','contacted') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 perform public.sales_timing_text(d->'reviewNote');
 if d->'olderHistoryAttestation'<>'null' then perform public.sales_timing_text(d->'olderHistoryAttestation');end if;
 if d->>'history'='owner_confirmed_none' and d->'olderHistoryAttestation'='null' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 if d->'correctionOf'<>'null' then perform public.sales_timing_uuid(d->'correctionOf');end if;
 if jsonb_typeof(d->'contactVersions')<>'array' or jsonb_array_length(d->'contactVersions') not between 1 and 16 or jsonb_typeof(d->'sources')<>'array' or jsonb_array_length(d->'sources')>8 or jsonb_typeof(d->'events')<>'array' or jsonb_array_length(d->'events')>100 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(d->'contactVersions') loop
  perform public.sales_timing_fields(x,array['id','version']);perform public.sales_timing_uuid(x->'id');
  if jsonb_typeof(x->'version')<>'number' or x->>'version' !~ '^[1-9][0-9]{0,8}$' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 end loop;
 if (select count(*)<>count(distinct q->>'id') from jsonb_array_elements(d->'contactVersions') q) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 for s in select value from jsonb_array_elements(d->'sources') loop
  perform public.sales_timing_fields(s,array['sourceKey','channel','identityRef','scopeRef','since','through','observedAt','state','reference']);
  foreach sid in array array['sourceKey','identityRef','scopeRef','reference'] loop perform public.sales_timing_text(s->sid);end loop;
  if coalesce(s->>'channel','') not in('strato_sent','strato_inbox','resend','operator') or coalesce(s->>'state','') not in('complete','gap','failed') then raise exception 'INVALID_BODY' using errcode='22023';end if;
  since_at:=public.sales_timing_instant(s->'since',at);through_at:=public.sales_timing_instant(s->'through',at);
  if since_at>through_at or through_at>public.sales_timing_instant(s->'observedAt',at) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 end loop;
 if (select count(*)<>count(distinct q->>'sourceKey') from jsonb_array_elements(d->'sources') q) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 for e in select value from jsonb_array_elements(d->'events') loop
  perform public.sales_timing_fields(e,array['id','sourceRefs','providerRefs','occurredAt','direction','outcome','kind','invitationId','inReplyToEventId','reviewedDuplicateOf']);
  perform public.sales_timing_uuid(e->'id');occurred:=public.sales_timing_instant(e->'occurredAt',at);
  foreach sid in array array['invitationId','inReplyToEventId','reviewedDuplicateOf'] loop if e->sid<>'null' then perform public.sales_timing_uuid(e->sid);end if;end loop;
  if coalesce(e->>'direction','') not in('outbound','inbound') or coalesce(e->>'outcome','') not in('accepted','delivery_unknown','failed_before_send','received','bounced','unsubscribed') or coalesce(e->>'kind','') not in('initial','reminder','requested_reply','unclassified')
  or ((e->>'direction'='outbound') is distinct from (e->>'outcome' in('accepted','delivery_unknown','failed_before_send'))) then raise exception 'INVALID_BODY' using errcode='22023';end if;
  if jsonb_typeof(e->'sourceRefs')<>'array' or jsonb_array_length(e->'sourceRefs') not between 1 and 8 or jsonb_typeof(e->'providerRefs')<>'array' or jsonb_array_length(e->'providerRefs') not between 1 and 8 then raise exception 'INVALID_BODY' using errcode='22023';end if;
  for x in select value from jsonb_array_elements(e->'sourceRefs') loop
   sid:=public.sales_timing_text(x);select value into s from jsonb_array_elements(d->'sources') where value->>'sourceKey'=sid;
   if not found or occurred<(s->>'since')::timestamptz or occurred>(s->>'through')::timestamptz then raise exception 'INVALID_BODY' using errcode='22023';end if;
  end loop;
  if (select count(*)<>count(distinct value) from jsonb_array_elements(e->'sourceRefs')) then raise exception 'INVALID_BODY' using errcode='22023';end if;
  for p in select value from jsonb_array_elements(e->'providerRefs') loop
   perform public.sales_timing_fields(p,array['sourceKey','id']);perform public.sales_timing_text(p->'id');
   if not(e->'sourceRefs' ? public.sales_timing_text(p->'sourceKey')) then raise exception 'INVALID_BODY' using errcode='22023';end if;
  end loop;
  if (select count(*)<>count(distinct value) from jsonb_array_elements(e->'providerRefs')) then raise exception 'INVALID_BODY' using errcode='22023';end if;
  if e->'reviewedDuplicateOf'<>'null' then
   select value into t from jsonb_array_elements(d->'events') where value->>'id'=e->>'reviewedDuplicateOf';
   if not found or t->>'id'=e->>'id' or t->'reviewedDuplicateOf'<>'null' or (t-array['id','sourceRefs','providerRefs','reviewedDuplicateOf']) is distinct from (e-array['id','sourceRefs','providerRefs','reviewedDuplicateOf']) then raise exception 'INVALID_BODY' using errcode='22023';end if;
  end if;
 end loop;
 if (select count(*)<>count(distinct q->>'id') from jsonb_array_elements(d->'events') q) then raise exception 'INVALID_BODY' using errcode='22023';end if;
end$$;
create function public.sales_timing_rules_json(r public.sales_contact_timing_rules) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'projectId',r.project_id,'version',r.version,'previousId',r.previous_id,'minWaitSeconds',r.min_wait_seconds,'maxReminders',r.max_reminders,'maxSourceAgeSeconds',r.max_source_age_seconds,'reviewedBy',r.owner_id,'createdAt',r.created_at)
$$;
create function public.sales_timing_history_json(h public.sales_contact_history_revisions) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',h.id,'projectId',h.project_id,'recipient',h.recipient,'version',h.version,'previousId',h.previous_id,'data',h.data,'reviewedBy',h.owner_id,'createdAt',h.created_at)
$$;
create function public.sales_timing_save_rules(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid;r public.sales_contact_timing_rules;old public.sales_contact_timing_rules;begin
 pid:=public.sales_timing_uuid(p_input->'projectId');perform public.sales_owner(p_principal,pid);
 perform public.sales_timing_fields(p_input,array['projectId','idempotencyKey','expectedPreviousId','minWaitSeconds','maxReminders','maxSourceAgeSeconds','confirmed']);
 perform public.sales_timing_uuid(p_input->'idempotencyKey');
 if p_input->'expectedPreviousId'<>'null' then perform public.sales_timing_uuid(p_input->'expectedPreviousId');end if;
 if p_input->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'minWaitSeconds')<>'number' or p_input->>'minWaitSeconds' !~ '^[1-9][0-9]{0,9}$' or (p_input->>'minWaitSeconds')::bigint not between 1209600 and 2147483647 or p_input->'maxReminders' not in('0'::jsonb,'1'::jsonb) or jsonb_typeof(p_input->'maxSourceAgeSeconds')<>'number' or p_input->>'maxSourceAgeSeconds' !~ '^[1-9][0-9]{0,2}$' or (p_input->>'maxSourceAgeSeconds')::integer>900 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-contact-eligibility',0));
 select * into r from public.sales_contact_timing_rules where project_id=pid and request_key=(p_input->>'idempotencyKey')::uuid;
 if found then if r.request is distinct from p_input then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return public.sales_timing_rules_json(r);end if;
 select * into old from public.sales_contact_timing_rules where project_id=pid order by version desc limit 1;
 if old.id is distinct from (p_input->>'expectedPreviousId')::uuid then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 insert into public.sales_contact_timing_rules(project_id,owner_id,version,previous_id,request_key,request,min_wait_seconds,max_reminders,max_source_age_seconds)
 values(pid,(p_principal->>'userId')::uuid,coalesce(old.version,0)+1,old.id,(p_input->>'idempotencyKey')::uuid,p_input,(p_input->>'minWaitSeconds')::integer,(p_input->>'maxReminders')::integer,(p_input->>'maxSourceAgeSeconds')::integer) returning * into r;
 return public.sales_timing_rules_json(r);
end$$;
create function public.sales_timing_save_history(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid;c public.sales_contacts;h public.sales_contact_history_revisions;old public.sales_contact_history_revisions;v jsonb;address text;begin
 pid:=public.sales_timing_uuid(p_input->'projectId');perform public.sales_owner(p_principal,pid);
 perform public.sales_timing_fields(p_input,array['projectId','idempotencyKey','expectedPreviousId','contactId','expectedContactVersion','data','confirmed']);
 perform public.sales_timing_uuid(p_input->'idempotencyKey');perform public.sales_timing_uuid(p_input->'contactId');
 if p_input->'expectedPreviousId'<>'null' then perform public.sales_timing_uuid(p_input->'expectedPreviousId');end if;
 if p_input->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'expectedContactVersion')<>'number' or p_input->>'expectedContactVersion' !~ '^[1-9][0-9]{0,8}$' or octet_length(p_input::text)>65536 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 perform public.sales_timing_validate_history(p_input->'data',clock_timestamp());
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-contact-eligibility',0));
 select * into h from public.sales_contact_history_revisions where project_id=pid and request_key=(p_input->>'idempotencyKey')::uuid;
 if found then if h.request is distinct from p_input then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return public.sales_timing_history_json(h);end if;
 select * into c from public.sales_contacts where project_id=pid and id=(p_input->>'contactId')::uuid for share;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if c.version<>(p_input->>'expectedContactVersion')::integer then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 address:=lower(btrim(c.data->>'email'));
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':timing-recipient:'||address,0));
 for v in select value from jsonb_array_elements(p_input->'data'->'contactVersions') loop
  if not exists(select from public.sales_contacts linked where linked.project_id=pid and linked.id=(v->>'id')::uuid and linked.version=(v->>'version')::integer and lower(btrim(linked.data->>'email'))=address) then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 end loop;
 if not exists(select from jsonb_array_elements(p_input->'data'->'contactVersions') q where q->>'id'=c.id::text and (q->>'version')::integer=c.version) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 select * into old from public.sales_contact_history_revisions where project_id=pid and recipient=address order by version desc limit 1;
 if old.id is distinct from (p_input->>'expectedPreviousId')::uuid then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 if p_input->'data'->>'correctionOf' is not null and p_input->'data'->>'correctionOf' is distinct from old.id::text then raise exception 'INVALID_BODY' using errcode='22023';end if;
 -- A new snapshot cannot silently erase prior evidence. Corrections remain explicit.
 if old.id is not null and exists(select from jsonb_array_elements(old.data->'events') e where not exists(select from jsonb_array_elements(p_input->'data'->'events') n where n->>'id'=e->>'id' and n=e)) and p_input->'data'->>'correctionOf' is distinct from old.id::text then raise exception 'HISTORY_CORRECTION_REQUIRED' using errcode='22023';end if;
 insert into public.sales_contact_history_revisions(project_id,owner_id,recipient,version,previous_id,request_key,request,data,source_context)
 values(pid,(p_principal->>'userId')::uuid,address,coalesce(old.version,0)+1,old.id,(p_input->>'idempotencyKey')::uuid,p_input,p_input->'data',public.sales_timing_context(pid,address)) returning * into h;
 return public.sales_timing_history_json(h);
end$$;
create function public.sales_timing_evaluate(pid uuid,cid uuid,at timestamptz) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c public.sales_contacts;r public.sales_contact_timing_rules;h public.sales_contact_history_revisions;address text;b text[]:='{}';e jsonb;s jsonb;cv jsonb;latest timestamptz;floor_at timestamptz;through_at timestamptz;reminders integer;uncertain boolean:=false;channel text;accepted timestamptz;required_from timestamptz;begin
 select * into c from public.sales_contacts where project_id=pid and id=cid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 address:=lower(btrim(c.data->>'email'));
 select * into r from public.sales_contact_timing_rules where project_id=pid order by version desc limit 1;
 select * into h from public.sales_contact_history_revisions where project_id=pid and recipient=address order by version desc limit 1;
 if r.id is null then b:=array_append(b,'RULE_REVIEW_REQUIRED');end if;
 if c.data->'confirmed' is distinct from 'true'::jsonb then b:=array_append(b,'CONTACT_UNCONFIRMED');end if;
 if exists(select from public.sales_contacts x where x.project_id=pid and lower(btrim(x.data->>'email'))=address and x.data->'suppressed'='true') then b:=array_append(b,'CONTACT_SUPPRESSED');end if;
 if exists(select from public.sales_contacts x where x.project_id=pid and lower(btrim(x.data->>'email'))=address and x.data->'excluded'='true') then b:=array_append(b,'CONTACT_EXCLUDED');end if;
 if not exists(select from public.projects where id=pid and execution_paused=false) or not exists(select from public.platform_config where id=1 and automation_paused=false) then b:=array_append(b,'PROJECT_PAUSED');end if;
 if h.id is null then b:=array_append(b,'HISTORY_REVIEW_REQUIRED');
 else
  perform public.sales_timing_validate_history(h.data,at);
  if h.source_context is distinct from public.sales_timing_context(pid,address) then b:=array_append(b,'SOURCE_CHANGED');end if;
  if not exists(select from jsonb_array_elements(h.data->'contactVersions') x where x->>'id'=cid::text and (x->>'version')::integer=c.version) then b:=array_append(b,'SOURCE_CHANGED');end if;
  if exists(select from public.sales_contacts linked where linked.project_id=pid and lower(btrim(linked.data->>'email'))=address and not exists(select from jsonb_array_elements(h.data->'contactVersions') bound where bound->>'id'=linked.id::text and (bound->>'version')::integer=linked.version)) then b:=array_append(b,'SOURCE_CHANGED');end if;
  for cv in select value from jsonb_array_elements(h.data->'contactVersions') loop
   if not exists(select from public.sales_contacts linked where linked.project_id=pid and linked.id=(cv->>'id')::uuid and linked.version=(cv->>'version')::integer and lower(btrim(linked.data->>'email'))=address) then b:=array_append(b,'SOURCE_CHANGED');end if;
  end loop;
  if h.data->>'history'='unknown' or h.data->'olderHistoryAttestation'='null' then b:=array_append(b,'HISTORY_REVIEW_REQUIRED');end if;
  foreach channel in array array['strato_sent','strato_inbox','resend'] loop
   if not exists(select from jsonb_array_elements(h.data->'sources') x where x->>'channel'=channel and x->>'state'='complete') then b:=array_append(b,'SOURCE_GAP');end if;
  end loop;
  for s in select value from jsonb_array_elements(h.data->'sources') loop
   if s->>'state'<>'complete' then b:=array_append(b,'SOURCE_GAP');end if;
   if (s->>'through')::timestamptz>at then b:=array_append(b,'SOURCE_CHANGED');end if;
   through_at:=least(through_at,(s->>'through')::timestamptz);
   if r.id is not null and at-(s->>'through')::timestamptz>make_interval(secs=>r.max_source_age_seconds) then b:=array_append(b,'SOURCE_STALE');end if;
  end loop;
  select least((select min((v->>'since')::timestamptz) from jsonb_array_elements(h.data->'sources') v),(select min((v->>'occurredAt')::timestamptz) from jsonb_array_elements(h.data->'events') v)) into required_from;
  foreach channel in array array['strato_sent','strato_inbox','resend'] loop
   if not exists(select from jsonb_array_elements(h.data->'sources') coverage where coverage->>'channel'=channel and coverage->>'state'='complete' and (coverage->>'since')::timestamptz<=required_from and (coverage->>'through')::timestamptz>=through_at) then b:=array_append(b,'SOURCE_GAP');end if;
  end loop;
  reminders:=0;
  for e in select value from jsonb_array_elements(h.data->'events') loop
   if e->'reviewedDuplicateOf'<>'null' then continue;end if;
   if e->>'outcome'='delivery_unknown' then uncertain:=true;b:=array_append(b,'SEND_UNCERTAIN');end if;
   if e->>'outcome' in('bounced','unsubscribed') then b:=array_append(b,'RECIPIENT_STOPPED');end if;
   if e->>'direction'='inbound' then b:=array_append(b,'REPLY_REVIEW_REQUIRED');end if;
   if e->>'kind'='unclassified' and e->>'outcome'<>'failed_before_send' then b:=array_append(b,'EVENT_CLASSIFICATION_REQUIRED');end if;
   if e->>'direction'='outbound' and e->>'outcome'='accepted' then
    latest:=greatest(latest,(e->>'occurredAt')::timestamptz);
    if e->>'kind'='reminder' then reminders:=reminders+1;end if;
    if e->>'kind' in('initial','reminder') and e->>'invitationId' is null then b:=array_append(b,'INVITATION_UNRESOLVED');end if;
   end if;
  end loop;
  if exists(select from jsonb_array_elements(h.data->'events') ev cross join lateral jsonb_array_elements(ev->'providerRefs') p where ev->'reviewedDuplicateOf'='null' group by p->>'sourceKey',p->>'id' having count(*)>1) then b:=array_append(b,'DUPLICATE_UNRESOLVED');end if;
  if exists(select from jsonb_array_elements(h.data->'events') a join jsonb_array_elements(h.data->'events') z on a->>'id'<z->>'id' and a->>'occurredAt'=z->>'occurredAt' and a->>'direction'=z->>'direction' and a->>'outcome'=z->>'outcome' and a->>'kind'=z->>'kind' where a->'reviewedDuplicateOf'='null' and z->'reviewedDuplicateOf'='null' and a->'sourceRefs' is distinct from z->'sourceRefs') then b:=array_append(b,'DUPLICATE_UNRESOLVED');end if;
  if r.id is not null and latest is not null and reminders>=r.max_reminders then b:=array_append(b,'REMINDER_LIMIT');end if;
 end if;
 if exists(select from public.sales_send_jobs j where j.project_id=pid and lower(btrim(j.sealed_json::jsonb->>'toEmail'))=address and j.status in('queued','claimed','dispatching')) then b:=array_append(b,'SEND_PENDING');end if;
 if exists(select from public.sales_send_jobs j where j.project_id=pid and lower(btrim(j.sealed_json::jsonb->>'toEmail'))=address and j.status='delivery_unknown') then b:=array_append(b,'SEND_UNCERTAIN');uncertain:=true;end if;
 select max(accepted_at) into accepted from public.sales_send_jobs j where j.project_id=pid and lower(btrim(j.sealed_json::jsonb->>'toEmail'))=address and j.status='smtp_accepted';
 latest:=greatest(latest,accepted);
 -- Every stored matching incoming message requires review; headers cannot authorize replying.
 if exists(select from public.sales_inbox_messages m where m.project_id=pid and lower(btrim(coalesce(substring(m.header->>'from' from '<([^<>]+)>'),m.header->>'from')))=address) then b:=array_append(b,'REPLY_REVIEW_REQUIRED');end if;
 if c.data->>'history'<>'not_contacted' or h.data->>'history' is distinct from 'owner_confirmed_none' or latest is not null or exists(select from public.sales_contacts x where x.project_id=pid and lower(btrim(x.data->>'email'))=address and x.data->>'history'='contacted') then b:=array_append(b,'NOT_INITIAL_CONTACT');end if;
 if uncertain or 'DUPLICATE_UNRESOLVED'=any(b) or 'EVENT_CLASSIFICATION_REQUIRED'=any(b) or 'SOURCE_GAP'=any(b) or 'HISTORY_REVIEW_REQUIRED'=any(b) then latest:=null;reminders:=null;end if;
 if latest is not null and r.id is not null then floor_at:=latest+make_interval(secs=>r.min_wait_seconds);if at<floor_at then b:=array_append(b,'WAIT_INTERVAL');end if;end if;
 select coalesce(array_agg(distinct value order by value),'{}') into b from unnest(b) value;
 return jsonb_build_object('contactId',cid,'recipient',address,'contactVersion',c.version,'historyRevisionId',h.id,'ruleRevisionId',r.id,'latestObservedOutboundAt',latest,'reminderCount',reminders,'intervalFloorAt',floor_at,'sourceThrough',through_at,'blockers',to_jsonb(b),'initialPreparationAllowed',cardinality(b)=0);
end$$;
create function public.sales_timing_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare pid uuid;at timestamptz:=clock_timestamp();rows jsonb;r public.sales_contact_timing_rules;ids jsonb:=p_input->'contactIds';n integer;slug text;begin
 pid:=public.sales_timing_uuid(p_input->'projectId');perform public.sales_owner(p_principal,pid);
 if jsonb_typeof(p_input) is distinct from 'object' or exists(select from jsonb_object_keys(p_input) k where k not in('projectId','contactIds')) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 if ids is not null then
  if jsonb_typeof(ids)<>'array' or jsonb_array_length(ids) not between 1 and 200 then raise exception 'INVALID_BODY' using errcode='22023';end if;
  perform public.sales_timing_uuid(value) from jsonb_array_elements(ids);
  if (select count(*)<>count(distinct value) from jsonb_array_elements(ids)) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 end if;
 select count(*) into n from public.sales_contacts where project_id=pid and (ids is null or ids @> jsonb_build_array(id));
 if n>200 then raise exception 'TIMING_SELECTION_TOO_LARGE' using errcode='22023';end if;
 if ids is not null and n<>jsonb_array_length(ids) then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 select jsonb_agg(public.sales_timing_evaluate(pid,id,at) order by data->>'companyName',id) into rows from public.sales_contacts where project_id=pid and (ids is null or ids @> jsonb_build_array(id));
 select * into r from public.sales_contact_timing_rules where project_id=pid order by version desc limit 1;
 select p.slug into slug from public.projects p where p.id=pid;
 return jsonb_build_object('projectId',pid,'evaluatedAt',at,'contacts',coalesce(rows,'[]'),'historyRevisions',coalesce((select jsonb_agg(public.sales_timing_history_json(h)) from public.sales_contact_history_revisions h where h.project_id=pid and h.id in(select (value->>'historyRevisionId')::uuid from jsonb_array_elements(rows))),'[]'),'rules',case when r.id is null then null else public.sales_timing_rules_json(r) end,'customerSendingEnabled',false,'workspaceUrl','/projects/'||slug||'/sales#contact-timing');
end$$;
-- Explicitly close PUBLIC's default function execution. Service calls still validate owner.
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'sales_timing_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;
end$$;


create function public.sales_timing_assert_snapshot(j public.sales_jobs) returns void language plpgsql security invoker set search_path='' as $$
declare old jsonb;current_timing jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended(j.project_id::text||':sales-contact-eligibility',0));
 lock table public.sales_inbox_messages,public.sales_send_jobs in share mode;
 if jsonb_typeof(j.snapshot->'timing'->'contacts') is distinct from 'array' or jsonb_array_length(j.snapshot->'timing'->'contacts')<>jsonb_array_length(j.snapshot->'contacts') then raise exception 'CONTACT_TIMING_CHANGED' using errcode='40001';end if;
 for old in select value from jsonb_array_elements(j.snapshot->'timing'->'contacts') loop
  current_timing:=public.sales_timing_evaluate(j.project_id,(old->>'contactId')::uuid,clock_timestamp());
  if current_timing->>'initialPreparationAllowed' is distinct from 'true' or current_timing->'historyRevisionId' is distinct from old->'historyRevisionId' or current_timing->'ruleRevisionId' is distinct from old->'ruleRevisionId' or current_timing->'contactVersion' is distinct from old->'contactVersion' then raise exception 'CONTACT_TIMING_CHANGED' using errcode='40001';end if;
 end loop;
end$$;
revoke all on function public.sales_timing_assert_snapshot(public.sales_jobs) from public,anon,authenticated;
grant execute on function public.sales_timing_assert_snapshot(public.sales_jobs) to service_role;

create or replace function public.sales_prepare_job(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;j public.sales_jobs;o jsonb;contacts jsonb;expected integer;timing jsonb;
begin
 perform public.sales_owner(p_principal,pid);
 if not exists(select 1 from public.conversations where id=(p_input->>'conversationId')::uuid and user_id=(p_principal->>'userId')::uuid and project_id=pid) then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':'||(p_input->>'idempotencyKey'),0));
 select * into j from public.sales_jobs where project_id=pid and request_key=p_input->>'idempotencyKey';
 if found then if j.request<>p_input then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return public.sales_job_json(j);end if;
 perform public.sales_stop(pid);
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-contact-eligibility',0));
 expected:=jsonb_array_length(p_input->'contactIds');if expected not between 1 and 5 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 select jsonb_agg(c.data order by c.id) into contacts from public.sales_contacts c where c.project_id=pid and (p_input->'contactIds') @> jsonb_build_array(c.id::text) and c.data->>'history'='not_contacted' and (c.data->>'confirmed')::boolean is true and (c.data->>'excluded')::boolean is false and (c.data->>'suppressed')::boolean is false;
 if coalesce(jsonb_array_length(contacts),0)<>expected then raise exception 'CONTACT_REVIEW_REQUIRED' using errcode='55000';end if;
 if exists(select from public.sales_contacts c where c.project_id=pid and (c.data->>'history'='contacted' or (c.data->>'suppressed')::boolean is true) and exists(select from jsonb_array_elements(contacts) selected where lower(selected->>'email')=lower(c.data->>'email'))) then raise exception 'MAILBOX_REVIEW_REQUIRED' using errcode='55000';end if;
 if exists(select from public.sales_jobs previous cross join lateral jsonb_array_elements(previous.snapshot->'contacts') old_contact where previous.project_id=pid and previous.status not in('cancelled','failed') and exists(select from jsonb_array_elements(contacts) selected where lower(selected->>'email')=lower(old_contact->>'email'))) then raise exception 'INITIAL_JOB_ALREADY_EXISTS' using errcode='55000';end if;
 select data into o from public.sales_offer_revisions where project_id=pid and id=(p_input->>'offerRevisionId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if exists(select from jsonb_array_elements(contacts) c where c->>'pilotMonths' is distinct from o->>'freeMonths') then raise exception 'PILOT_TIER_MISMATCH' using errcode='55000';end if;
 lock table public.sales_inbox_messages,public.sales_send_jobs in share mode;
 timing:=public.sales_timing_read(p_principal,jsonb_build_object('projectId',pid,'contactIds',p_input->'contactIds'));
 if exists(select from jsonb_array_elements(timing->'contacts') x where x->>'initialPreparationAllowed' is distinct from 'true') then raise exception 'CONTACT_TIMING_REVIEW_REQUIRED' using errcode='55000';end if;
 insert into public.sales_jobs(project_id,owner_id,request_key,request,snapshot) values(pid,(p_principal->>'userId')::uuid,p_input->>'idempotencyKey',p_input,jsonb_build_object('contacts',contacts,'offer',o,'timing',timing)) returning * into j;
 return public.sales_job_json(j);
end $$;
create or replace function public.sales_assert_contacts(j public.sales_jobs) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform public.sales_timing_assert_snapshot(j);
 perform pg_advisory_xact_lock(hashtextextended(j.project_id::text||':sales-contact-eligibility',0));
 if exists(select from jsonb_array_elements(j.snapshot->'contacts') old_contact where not exists(select from public.sales_contacts c where c.project_id=j.project_id and c.id=(old_contact->>'id')::uuid and c.version=(old_contact->>'version')::integer and c.data->>'history'='not_contacted' and (c.data->>'confirmed')::boolean is true and (c.data->>'excluded')::boolean is false and (c.data->>'suppressed')::boolean is false)) then raise exception 'CONTACT_CHANGED' using errcode='40001';end if;
 if exists(select from public.sales_contacts c where c.project_id=j.project_id and (c.data->>'history'='contacted' or (c.data->>'suppressed')::boolean is true) and exists(select from jsonb_array_elements(j.snapshot->'contacts') old_contact where lower(old_contact->>'email')=lower(c.data->>'email'))) then raise exception 'MAILBOX_CHANGED' using errcode='40001';end if;
end $$;
create or replace function public.sales_read_workspace(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;slug text;
begin perform public.sales_owner(p_principal,pid);perform public.sales_reconcile_expired(pid);select p.slug into slug from public.projects p where id=pid;
 return jsonb_build_object('projectId',pid,'state','ok','sendingEnabled',false,'workspaceUrl','/projects/'||slug||'/sales',
 'timing',public.sales_timing_read(p_principal,jsonb_build_object('projectId',pid)),
 'workerState',case when exists(select from public.sales_worker_registrations where project_id=pid and revoked_at is null and expires_at>now() and last_seen_at>now()-interval '90 seconds') then 'connected' else 'not_connected' end,
 'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'contactId',e.contact_id,'source',e.data,'question',e.question,'provenance',e.provenance)) from public.sales_evidence e where e.project_id=pid),'[]'),
 'workers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'expiresAt',expires_at,'lastSeenAt',last_seen_at,'revoked',revoked_at is not null)) from public.sales_worker_registrations where project_id=pid),'[]'),
 'contacts',coalesce((select jsonb_agg(data order by created_at) from public.sales_contacts where project_id=pid),'[]'),
 'offers',coalesce((select jsonb_agg(data order by created_at desc) from public.sales_offer_revisions where project_id=pid),'[]'),
 'jobs',coalesce((select jsonb_agg(public.sales_job_json(j) order by created_at desc) from (select * from public.sales_jobs where project_id=pid order by created_at desc limit 20) j),'[]'),
 'drafts',coalesce((select jsonb_agg(d.data||jsonb_build_object('id',d.id,'projectId',pid,'jobId',d.job_id,'sha256',d.sha256,'approvalId',d.approval_id,'runId',d.run_id,'status',coalesce(a.status,'needs_input'),'current',d.is_current,'createdAt',d.created_at) order by d.created_at desc) from public.sales_draft_revisions d left join public.approvals a on a.id=d.approval_id where d.project_id=pid and d.is_current),'[]'));
end $$;
