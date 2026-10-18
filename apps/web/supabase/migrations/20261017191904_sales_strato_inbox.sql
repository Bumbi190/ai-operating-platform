-- B2: owner-scoped read-only inbox. No send rights or automatic model dispatch.
create table public.sales_inbox_configs (
 mailbox_id uuid primary key,project_id uuid not null,worker_id uuid not null,owner_id uuid not null,
 version integer not null check(version>0),mailbox_generation integer not null check(mailbox_generation>0),
 folder text not null check(folder='INBOX'),since_at timestamptz not null,selected_contact_ids uuid[] not null default '{}',
 state text not null check(state in('disabled','enabled','paused','needs_input','reconciling','revoked')),
 uid_validity bigint check(uid_validity between 1 and 4294967295),scanned_through_uid bigint not null default 0 check(scanned_through_uid between 0 and 4294967295),epoch integer not null default 0 check(epoch>=0),
 last_synced_at timestamptz,reason_code text,created_at timestamptz not null default now(),
 foreign key(project_id,mailbox_id) references public.sales_mailbox_connections(project_id,id),foreign key(project_id,worker_id) references public.sales_worker_registrations(project_id,id),unique(project_id,mailbox_id)
);
create table public.sales_inbox_messages (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,mailbox_id uuid not null,owner_id uuid not null,
 header jsonb,header_sha256 text check(header_sha256 ~ '^[a-f0-9]{64}$'),content_sha256 text check(content_sha256 ~ '^[a-f0-9]{64}$'),
 body_text text check(octet_length(body_text)<=8192),text_state text not null check(text_state in('not_selected','complete','truncated','unsupported','vanished','too_large')),
 canonical_id uuid, text_selected boolean not null default false,contact_id uuid,contact_version integer,version integer not null default 1,
 internal_date timestamptz,size_bytes bigint,created_at timestamptz not null default clock_timestamp(),
 foreign key(project_id,mailbox_id) references public.sales_inbox_configs(project_id,mailbox_id),foreign key(project_id,contact_id) references public.sales_contacts(project_id,id),foreign key(project_id,canonical_id) references public.sales_inbox_messages(project_id,id),unique(project_id,id),unique(mailbox_id,id)
);
create unique index sales_inbox_complete_content on public.sales_inbox_messages(mailbox_id,content_sha256) where content_sha256 is not null;
create index sales_inbox_message_page on public.sales_inbox_messages(mailbox_id,created_at desc,id desc);
create table public.sales_inbox_occurrences (
 project_id uuid not null,mailbox_id uuid not null,folder text not null check(folder='INBOX'),uid_validity bigint not null check(uid_validity between 1 and 4294967295),uid bigint not null check(uid between 1 and 4294967295),
 message_id uuid not null,text_requested boolean not null default false,
 primary key(mailbox_id,folder,uid_validity,uid),foreign key(project_id,mailbox_id) references public.sales_inbox_configs(project_id,mailbox_id),foreign key(mailbox_id,message_id) references public.sales_inbox_messages(mailbox_id,id)
);
create index sales_inbox_occurrence_message on public.sales_inbox_occurrences(message_id);
create table public.sales_inbox_batches (
 id uuid primary key default gen_random_uuid(),claim_id uuid not null default gen_random_uuid(),project_id uuid not null,mailbox_id uuid not null,owner_id uuid not null,
 config_version integer not null,mailbox_generation integer not null,host_generation integer not null,expected_cursor jsonb not null,
 lease_until timestamptz not null,created_at timestamptz not null default clock_timestamp(),payload_hash text,receipt jsonb,
 foreign key(project_id,mailbox_id) references public.sales_inbox_configs(project_id,mailbox_id),unique(mailbox_id,id)
);
create index sales_inbox_active_batch on public.sales_inbox_batches(mailbox_id,lease_until) where receipt is null;
-- No direct mutation and no public RPC execution. RLS is defense in depth.
alter table public.sales_inbox_configs enable row level security;
alter table public.sales_inbox_messages enable row level security;
alter table public.sales_inbox_occurrences enable row level security;
alter table public.sales_inbox_batches enable row level security;
revoke all on public.sales_inbox_configs,public.sales_inbox_messages,public.sales_inbox_occurrences,public.sales_inbox_batches from public,anon,authenticated,service_role;
grant select,insert,update on public.sales_inbox_configs,public.sales_inbox_messages,public.sales_inbox_occurrences,public.sales_inbox_batches to service_role;

-- Once inbox history exists, UIDVALIDITY/UID must stay bound to one account.
-- A different email address requires a distinct mailbox identity; same-address
-- password renewal still increments generation and requires scope reconfirmation.
create function public.sales_inbox_guard_mailbox_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.email is distinct from old.email and exists(select from public.sales_inbox_configs where mailbox_id=old.id) then
  raise exception 'MAILBOX_IDENTITY_REQUIRED' using errcode='P0I01';
 end if;
 return new;
end $$;
revoke all on function public.sales_inbox_guard_mailbox_identity() from public,anon,authenticated;
grant execute on function public.sales_inbox_guard_mailbox_identity() to service_role;
create trigger sales_inbox_mailbox_identity before update of email on public.sales_mailbox_connections for each row execute function public.sales_inbox_guard_mailbox_identity();

-- Preserve the B1 status contract while projecting the actual current B2 grant.
create or replace function public.sales_mailbox_status(c public.sales_mailbox_connections) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('mailboxId',c.id,'email',c.email,'status',c.status,'smtpAuthenticatedAt',c.smtp_authenticated_at,'imapAuthenticatedAt',c.imap_authenticated_at,'reasonCode',c.reason_code,
 'inboxEnabled',c.status='authenticated' and exists(select from public.sales_worker_registrations w where w.id=c.worker_id and w.project_id=c.project_id and w.owner_id=c.owner_id and w.revoked_at is null and w.managed_authorized_at is not null and w.manager_token_hash is not null) and exists(select from public.sales_inbox_configs i where i.mailbox_id=c.id and i.project_id=c.project_id and i.owner_id=c.owner_id and i.mailbox_generation=c.generation and i.state='enabled'),'sendingEnabled',false)
$$;
-- CREATE OR REPLACE preserves the existing explicit service-role-only ACL.

create function public.sales_inbox_cursor(c public.sales_inbox_configs) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('uidValidity',c.uid_validity::text,'scannedThroughUid',c.scanned_through_uid,'epoch',c.epoch)
$$;
create function public.sales_inbox_config_json(c public.sales_inbox_configs) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('projectId',c.project_id,'mailboxId',c.mailbox_id,'folder',c.folder,'since',c.since_at,'selectedContactIds',to_jsonb(c.selected_contact_ids),'version',c.version,'mailboxGeneration',c.mailbox_generation,'state',c.state,'cursor',public.sales_inbox_cursor(c),'lastSyncedAt',c.last_synced_at,'reasonCode',c.reason_code)
$$;
create function public.sales_inbox_owner(p jsonb,pid uuid,mid uuid) returns public.sales_mailbox_connections language plpgsql security invoker set search_path='' as $$
declare m public.sales_mailbox_connections;
begin perform public.sales_owner(p,pid);select * into m from public.sales_mailbox_connections where id=mid and project_id=pid and owner_id=(p->>'userId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;return m;end $$;
create function public.sales_inbox_configure_inbox(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.sales_mailbox_connections;c public.sales_inbox_configs;ids uuid[];t timestamptz;pid uuid:=(p_input->>'projectId')::uuid;expected integer;
begin
 m:=public.sales_inbox_owner(p_principal,pid,(p_input->>'mailboxId')::uuid);
 perform public.sales_mailbox_fields(p_input,array['projectId','mailboxId','expectedVersion','folder','since','selectedContactIds']);
 if p_input->>'folder' is distinct from 'INBOX' or jsonb_typeof(p_input->'selectedContactIds') is distinct from 'array' or jsonb_array_length(p_input->'selectedContactIds')>50 or p_input->>'since' is null or p_input->>'expectedVersion' is null then raise exception 'INVALID_BODY' using errcode='22023';end if;
 t:=(p_input->>'since')::timestamptz;expected:=(p_input->>'expectedVersion')::integer;if t>clock_timestamp()+interval '5 minutes' or expected<0 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p_input->'selectedContactIds');
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or cardinality(ids)<>(select count(*) from public.sales_contacts where project_id=pid and id=any(ids) and data->>'confirmed'='true') then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if m.status<>'authenticated' then raise exception 'MAILBOX_REQUIRED' using errcode='55000';end if;
 perform pg_advisory_xact_lock(hashtextextended(m.id::text||':sales-inbox',0));select * into c from public.sales_inbox_configs where mailbox_id=m.id for update;
 if coalesce(c.version,0)<>expected then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 if found and c.owner_id<>m.owner_id then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 insert into public.sales_inbox_configs(mailbox_id,project_id,worker_id,owner_id,version,mailbox_generation,folder,since_at,selected_contact_ids,state)
 values(m.id,pid,m.worker_id,m.owner_id,expected+1,m.generation,'INBOX',t,ids,'disabled')
 on conflict(mailbox_id) do update set version=expected+1,mailbox_generation=m.generation,since_at=t,selected_contact_ids=ids,state='disabled',uid_validity=null,scanned_through_uid=0,epoch=0,reason_code=null returning * into c;
 return public.sales_inbox_config_json(c);
end $$;
create function public.sales_inbox_set_inbox_state(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.sales_mailbox_connections;c public.sales_inbox_configs;s text:=p_input->>'state';
begin
 m:=public.sales_inbox_owner(p_principal,(p_input->>'projectId')::uuid,(p_input->>'mailboxId')::uuid);
 perform public.sales_mailbox_fields(p_input,array['projectId','mailboxId','expectedVersion','state']);
 if s not in('enabled','paused','revoked') or s is null then raise exception 'INVALID_BODY' using errcode='22023';end if;
 select * into c from public.sales_inbox_configs where mailbox_id=m.id and owner_id=m.owner_id for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if c.version is distinct from (p_input->>'expectedVersion')::integer then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 if c.mailbox_generation<>m.generation or m.status<>'authenticated' or c.state='revoked' then raise exception 'FENCED' using errcode='40001';end if;
 if s='enabled' then perform public.sales_stop(c.project_id);end if;
 update public.sales_inbox_configs set state=s,version=version+1,reason_code=null where mailbox_id=c.mailbox_id returning * into c;
 return public.sales_inbox_config_json(c);
end $$;
create function public.sales_inbox_public_message(m public.sales_inbox_messages,include_text boolean) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('id',m.id,'mailboxId',m.mailbox_id,'header',m.header,'text',case when include_text and m.text_selected then coalesce(m.body_text,(select body_text from public.sales_inbox_messages where id=m.canonical_id)) else null end,'textState',coalesce((select text_state from public.sales_inbox_messages where id=m.canonical_id),m.text_state),'canonicalMessageId',coalesce(m.canonical_id,m.id),'possibleDuplicate',m.canonical_id is not null or (m.content_sha256 is null and exists(select from public.sales_inbox_messages d where d.mailbox_id=m.mailbox_id and d.id<>m.id and d.header_sha256=m.header_sha256)),'textSelected',m.text_selected,'contactId',m.contact_id,
 'contactState',case when exists(select from public.sales_contacts c where c.id=m.contact_id and c.project_id=m.project_id and c.version=m.contact_version and c.data->>'confirmed'='true') then 'linked' when (select count(*) from public.sales_contacts c where c.project_id=m.project_id and c.data->>'confirmed'='true' and lower(c.data->>'email')=lower(m.header->>'from'))>1 then 'ambiguous' else 'unlinked' end,
 'version',m.version,'internalDate',m.internal_date,'occurrences',coalesce((select jsonb_agg(jsonb_build_object('uid',o.uid,'uidValidity',o.uid_validity::text) order by o.uid_validity,o.uid) from public.sales_inbox_occurrences o where o.message_id=coalesce(m.canonical_id,m.id)),'[]'))
$$;
create function public.sales_inbox_read_message(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.sales_inbox_messages;
begin perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);perform public.sales_mailbox_fields(p_input,array['projectId','messageId']);select * into m from public.sales_inbox_messages where id=(p_input->>'messageId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;return public.sales_inbox_public_message(m,true);end $$;
create function public.sales_inbox_read_inbox(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare mb public.sales_mailbox_connections;c public.sales_inbox_configs;w public.sales_worker_registrations;h jsonb;effective boolean;reading boolean;reason text;m public.sales_inbox_messages;after_time timestamptz;after_id uuid;rows jsonb:='[]';n integer:=0;last_id uuid;
begin mb:=public.sales_inbox_owner(p_principal,(p_input->>'projectId')::uuid,(p_input->>'mailboxId')::uuid);perform public.sales_mailbox_fields(p_input,array['projectId','mailboxId','cursor']);
 select * into c from public.sales_inbox_configs where mailbox_id=mb.id and owner_id=mb.owner_id;
 select * into w from public.sales_worker_registrations where id=mb.worker_id and project_id=mb.project_id and owner_id=mb.owner_id;
 h:=public.sales_host_status(w);effective:=coalesce((public.sales_mailbox_status(mb)->>'inboxEnabled')::boolean,false);
 reading:=coalesce(effective and h->>'connectionState'='online' and h->>'desiredState'='running' and (h->>'executionPaused')::boolean=false,false);
 reason:=case when c.mailbox_id is null then 'NOT_CONFIGURED' when c.mailbox_generation is distinct from mb.generation then 'SCOPE_RECONFIRMATION_REQUIRED' when mb.status<>'authenticated' then 'MAILBOX_REQUIRED' when c.state<>'enabled' then coalesce(c.reason_code,'INBOX_'||upper(c.state)) when not effective then 'HOST_UNAVAILABLE' when (h->>'executionPaused')::boolean then 'EXECUTION_PAUSED' when h->>'desiredState'<>'running' then 'HOST_PAUSED' when h->>'connectionState'<>'online' then 'HOST_OFFLINE' else null end;

 if p_input->>'cursor' is not null then select created_at,id into after_time,after_id from public.sales_inbox_messages where id=(p_input->>'cursor')::uuid and mailbox_id=mb.id and owner_id=mb.owner_id;if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;end if;
 for m in select * from public.sales_inbox_messages where mailbox_id=mb.id and owner_id=mb.owner_id and (canonical_id is null or contact_id is not null) and (after_id is null or (created_at,id)<(after_time,after_id)) order by created_at desc,id desc limit 50 loop
  rows:=rows||jsonb_build_array(public.sales_inbox_public_message(m,false));n:=n+1;last_id:=m.id;
 end loop;
 return jsonb_build_object('config',case when c.mailbox_id is null then null else public.sales_inbox_config_json(c) end,'messages',rows,'nextCursor',case when n=50 then last_id else null end,'inboxEnabled',effective,'readingEnabled',reading,'scopeCurrent',coalesce(c.mailbox_generation=mb.generation,false),'reasonCode',reason,'sendingEnabled',false);
end $$;
create function public.sales_inbox_select_message_text(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.sales_inbox_messages;c public.sales_inbox_configs;
begin perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);perform public.sales_mailbox_fields(p_input,array['projectId','messageId','expectedVersion']);
 select * into m from public.sales_inbox_messages where id=(p_input->>'messageId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if m.version is distinct from (p_input->>'expectedVersion')::integer then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 select * into c from public.sales_inbox_configs where mailbox_id=m.mailbox_id;
 if not exists(select from public.sales_inbox_occurrences where message_id=m.id and uid_validity=c.uid_validity) then raise exception 'FENCED' using errcode='40001';end if;
 update public.sales_inbox_messages set text_selected=true,version=version+1 where id=m.id returning * into m;
 if m.text_state not in('complete','vanished') then update public.sales_inbox_occurrences set text_requested=true where message_id=m.id and uid_validity=c.uid_validity;end if;
 return public.sales_inbox_public_message(m,true);
end $$;
create function public.sales_inbox_link_message(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.sales_inbox_messages;c public.sales_contacts;
begin perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);perform public.sales_mailbox_fields(p_input,array['projectId','messageId','contactId','expectedVersion']);
 select * into m from public.sales_inbox_messages where id=(p_input->>'messageId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if m.version is distinct from (p_input->>'expectedVersion')::integer then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 select * into c from public.sales_contacts where project_id=m.project_id and id=(p_input->>'contactId')::uuid and data->>'confirmed'='true';if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 update public.sales_inbox_messages set contact_id=c.id,contact_version=c.version,version=version+1 where id=m.id returning * into m;return public.sales_inbox_public_message(m,true);
end $$;

create function public.sales_inbox_claim_sync(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;c public.sales_inbox_configs;mb public.sales_mailbox_connections;b public.sales_inbox_batches;selected jsonb;addresses jsonb;
begin
 w:=public.sales_host_registration(p_token_hash);perform public.sales_mailbox_fields(p_input,array[]::text[]);perform public.sales_stop(w.project_id);
 if w.desired_state<>'running' then raise exception 'STOPPED' using errcode='55000';end if;
 select * into c from public.sales_inbox_configs where worker_id=w.id and project_id=w.project_id and owner_id=w.owner_id for update;
 if not found or c.state<>'enabled' then return jsonb_build_object('sync',null);end if;
 select * into mb from public.sales_mailbox_connections where id=c.mailbox_id and owner_id=w.owner_id;
 if mb.generation is distinct from c.mailbox_generation or mb.status<>'authenticated' then return jsonb_build_object('sync',null);end if;
 if exists(select from public.sales_inbox_batches where mailbox_id=c.mailbox_id and config_version=c.version and receipt is null and lease_until>clock_timestamp()) then return jsonb_build_object('sync',null);end if;
 insert into public.sales_inbox_batches(project_id,mailbox_id,owner_id,config_version,mailbox_generation,host_generation,expected_cursor,lease_until) values(c.project_id,c.mailbox_id,c.owner_id,c.version,c.mailbox_generation,w.host_generation,public.sales_inbox_cursor(c),clock_timestamp()+interval '180 seconds') returning * into b;
 select coalesce(jsonb_agg(jsonb_build_object('messageId',o.message_id,'uid',o.uid,'uidValidity',o.uid_validity::text)),'[]') into selected from (select * from public.sales_inbox_occurrences where mailbox_id=c.mailbox_id and uid_validity=c.uid_validity and text_requested order by uid limit 20) o;
 select coalesce(jsonb_agg(distinct lower(data->>'email')),'[]') into addresses from public.sales_contacts where project_id=c.project_id and id=any(c.selected_contact_ids) and data->>'confirmed'='true';
 return jsonb_build_object('sync',jsonb_build_object('ref',jsonb_build_object('projectId',c.project_id,'mailboxId',c.mailbox_id,'configVersion',c.version,'mailboxGeneration',c.mailbox_generation,'hostGeneration',w.host_generation,'claimId',b.claim_id,'batchId',b.id),'config',public.sales_inbox_config_json(c),'mailboxEmail',mb.email,'cursor',b.expected_cursor,'selectedMessages',selected,'selectedAddresses',addresses));
end $$;
create function public.sales_inbox_batch_access(p_token_hash text,r jsonb) returns public.sales_inbox_batches language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;c public.sales_inbox_configs;b public.sales_inbox_batches;mb public.sales_mailbox_connections;
begin w:=public.sales_host_registration(p_token_hash);perform public.sales_stop(w.project_id);if w.desired_state<>'running' then raise exception 'STOPPED' using errcode='55000';end if;
 perform public.sales_mailbox_fields(r,array['projectId','mailboxId','configVersion','mailboxGeneration','hostGeneration','claimId','batchId']);
 select * into c from public.sales_inbox_configs where mailbox_id=(r->>'mailboxId')::uuid and project_id=w.project_id and worker_id=w.id and owner_id=w.owner_id for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 select * into mb from public.sales_mailbox_connections where id=c.mailbox_id and owner_id=w.owner_id;
 if c.state<>'enabled' or c.version is distinct from (r->>'configVersion')::integer or c.project_id is distinct from (r->>'projectId')::uuid or c.mailbox_generation is distinct from (r->>'mailboxGeneration')::integer or c.mailbox_generation is distinct from mb.generation or mb.status<>'authenticated' or w.host_generation is distinct from (r->>'hostGeneration')::integer then raise exception 'FENCED' using errcode='40001';end if;
 select * into b from public.sales_inbox_batches where id=(r->>'batchId')::uuid and mailbox_id=c.mailbox_id and claim_id=(r->>'claimId')::uuid and owner_id=w.owner_id and config_version=c.version and mailbox_generation=c.mailbox_generation and host_generation=w.host_generation for update;
 if not found then raise exception 'FENCED' using errcode='40001';end if;return b;
end $$;
create function public.sales_inbox_read_batch_receipt(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.sales_inbox_batches;
begin b:=public.sales_inbox_batch_access(p_token_hash,p_input);return jsonb_build_object('receipt',b.receipt,'expired',b.receipt is null and b.lease_until<=clock_timestamp());end $$;
create function public.sales_inbox_commit_batch(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.sales_inbox_batches;c public.sales_inbox_configs;o public.sales_inbox_occurrences;m public.sales_inbox_messages;r jsonb;h text;uidv bigint;through_uid bigint;end_uid bigint;low_uid bigint;new_epoch integer;body text;header_hash text;content_hash text;mid uuid;allowed boolean;outcome jsonb;seen bigint[]:='{}';inserted integer:=0;st text;new_header jsonb;canonical uuid;
begin
 perform public.sales_mailbox_fields(p_input,array['ref','mode','expectedCursor','uidValidity','throughUid','rangeEnd','records']);
 b:=public.sales_inbox_batch_access(p_token_hash,p_input->'ref');
 h:=encode(extensions.digest(convert_to(p_input::text,'UTF8'),'sha256'),'hex');
 if b.receipt is not null then if b.payload_hash<>h then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return b.receipt;end if;
 if b.lease_until<=clock_timestamp() then raise exception 'FENCED' using errcode='40001';end if;
 select * into c from public.sales_inbox_configs where mailbox_id=b.mailbox_id;
 if public.sales_inbox_cursor(c) is distinct from p_input->'expectedCursor' or b.expected_cursor is distinct from p_input->'expectedCursor' then raise exception 'FENCED' using errcode='40001';end if;
 if octet_length(convert_to(p_input::text,'UTF8'))>60000 or jsonb_typeof(p_input->'records') is distinct from 'array' or jsonb_array_length(p_input->'records')>20 or (p_input->>'mode') not in('scan','selected_text') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 uidv:=(p_input->>'uidValidity')::bigint;through_uid:=(p_input->>'throughUid')::bigint;end_uid:=(p_input->>'rangeEnd')::bigint;
 if uidv not between 1 and 4294967295 or through_uid not between 0 and 4294967295 or end_uid not between 0 and 4294967295 or through_uid>end_uid then raise exception 'INVALID_BODY' using errcode='22023';end if;
 low_uid:=case when uidv=c.uid_validity then c.scanned_through_uid else 0 end;new_epoch:=case when uidv is distinct from c.uid_validity then c.epoch+1 else c.epoch end;
 if p_input->>'mode'='selected_text' then
  if uidv is distinct from c.uid_validity or through_uid<>c.scanned_through_uid or end_uid<>through_uid then raise exception 'INVALID_BODY' using errcode='22023';end if;
 elsif through_uid<low_uid or end_uid-low_uid>500 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 for r in select value from jsonb_array_elements(p_input->'records') loop
  perform public.sales_mailbox_fields(r,array['uid','internalDate','size','headerSha256','header','text','textState','contentSha256']);
  if (r->>'uid')::bigint not between 1 and 4294967295 or (r->>'uid')::bigint=any(seen) then raise exception 'INVALID_BODY' using errcode='22023';end if;
  seen:=array_append(seen,(r->>'uid')::bigint);
  if p_input->>'mode'='scan' and ((r->>'uid')::bigint<=low_uid or (r->>'uid')::bigint>through_uid) then raise exception 'INVALID_BODY' using errcode='22023';end if;
  select * into o from public.sales_inbox_occurrences where mailbox_id=c.mailbox_id and folder='INBOX' and uid_validity=uidv and uid=(r->>'uid')::bigint;
  if o.message_id is not null then select * into m from public.sales_inbox_messages where id=o.message_id for update;else m:=null;end if;
  st:=r->>'textState';body:=r->>'text';header_hash:=r->>'headerSha256';content_hash:=r->>'contentSha256';new_header:=r->'header';
  if st is null or st not in('not_selected','complete','truncated','unsupported','vanished','too_large') then raise exception 'INVALID_BODY' using errcode='22023';end if;
  if st='vanished' then
   if body is not null or header_hash is not null or content_hash is not null or r->>'internalDate' is not null or r->>'size' is not null or new_header is distinct from 'null'::jsonb then raise exception 'INVALID_BODY' using errcode='22023';end if;
  else
   perform public.sales_mailbox_fields(new_header,array['from','to','subject','messageId','inReplyTo','references']);
   if header_hash !~ '^[a-f0-9]{64}$' or header_hash is null or octet_length(body)>8192 or octet_length(new_header::text)>5000 or jsonb_typeof(new_header->'references') is distinct from 'array' or jsonb_array_length(new_header->'references')>20 or r->>'internalDate' is null or r->>'size' is null or (r->>'size')::bigint<0 then raise exception 'INVALID_BODY' using errcode='22023';end if;
   if m.id is not null and (m.header_sha256 is distinct from header_hash or m.header is distinct from new_header) then raise exception 'FENCED' using errcode='40001';end if;
   if (r->>'internalDate')::timestamptz<c.since_at then raise exception 'INVALID_BODY' using errcode='22023';end if;
   if st='not_selected' and (body is not null or content_hash is not null) then raise exception 'INVALID_BODY' using errcode='22023';end if;
   if st='complete' then
    if body is null or content_hash is distinct from encode(extensions.digest(convert_to(E'OmniraInbox/v1\n','UTF8')||decode(header_hash,'hex')||pg_catalog.int8send(octet_length(convert_to(body,'UTF8'))::bigint)||convert_to(body,'UTF8'),'sha256'),'hex') then raise exception 'INVALID_BODY' using errcode='22023';end if;
   elsif content_hash is not null then raise exception 'INVALID_BODY' using errcode='22023';end if;
  end if;
  allowed:=coalesce(o.text_requested,false) or coalesce(m.text_selected,false) or exists(select from public.sales_contacts sc where sc.project_id=c.project_id and sc.id=any(c.selected_contact_ids) and sc.data->>'confirmed'='true' and lower(sc.data->>'email')=lower(new_header->>'from'));
  if body is not null and not allowed then raise exception 'TEXT_NOT_SELECTED' using errcode='42501';end if;
  if p_input->>'mode'='selected_text' and (o.message_id is null or not o.text_requested) then raise exception 'FENCED' using errcode='40001';end if;
  if m.id is null and content_hash is not null then select * into m from public.sales_inbox_messages where mailbox_id=c.mailbox_id and content_sha256=content_hash;end if;
  if m.id is null then
   insert into public.sales_inbox_messages(project_id,mailbox_id,owner_id,header,header_sha256,content_sha256,body_text,text_state,text_selected,internal_date,size_bytes)
   values(c.project_id,c.mailbox_id,c.owner_id,case when st='vanished' then null else new_header end,header_hash,content_hash,body,st,allowed and body is not null,(r->>'internalDate')::timestamptz,(r->>'size')::bigint) returning * into m;inserted:=inserted+1;
  elsif o.message_id is not null then
   if m.content_sha256 is not null and content_hash is not null and m.content_sha256<>content_hash then raise exception 'FENCED' using errcode='40001';end if;
   if m.text_state<>'complete' and st<>'not_selected' then
    canonical:=null;
    if content_hash is not null then select id into canonical from public.sales_inbox_messages where mailbox_id=c.mailbox_id and content_sha256=content_hash and id<>m.id;end if;
    if canonical is not null then
     -- Keep the old public ID/contact decision as an alias; share only content.
     update public.sales_inbox_occurrences set message_id=canonical where message_id=m.id;
     update public.sales_inbox_messages set canonical_id=canonical,content_sha256=null,body_text=null,text_selected=true,version=version+1 where id=m.id;
     update public.sales_inbox_messages set text_selected=true where id=canonical returning * into m;
    else
     update public.sales_inbox_messages set content_sha256=content_hash,body_text=body,text_state=st,text_selected=text_selected or (allowed and body is not null),version=version+1 where id=m.id returning * into m;
    end if;
   end if;
  end if;
  insert into public.sales_inbox_occurrences(project_id,mailbox_id,folder,uid_validity,uid,message_id) values(c.project_id,c.mailbox_id,'INBOX',uidv,(r->>'uid')::bigint,m.id)
  on conflict(mailbox_id,folder,uid_validity,uid) do update set text_requested=false;
 end loop;
 update public.sales_inbox_configs set uid_validity=uidv,scanned_through_uid=through_uid,epoch=new_epoch,last_synced_at=clock_timestamp(),reason_code=null where mailbox_id=c.mailbox_id returning * into c;
 outcome:=jsonb_build_object('accepted',true,'batchId',b.id,'cursor',public.sales_inbox_cursor(c),'records',jsonb_array_length(p_input->'records'),'inserted',inserted);
 update public.sales_inbox_batches set payload_hash=h,receipt=outcome where id=b.id;
 return outcome;
end $$;
create function public.sales_inbox_report_sync_failure(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.sales_inbox_batches;code text:=p_input->>'reasonCode';r jsonb;
begin
 perform public.sales_mailbox_fields(p_input,array['ref','reasonCode']);b:=public.sales_inbox_batch_access(p_token_hash,p_input->'ref');
 if code is null or code not in('AUTH_FAILED','TLS_FAILED','CONNECTION_FAILED','UNSUPPORTED_MIME','RECONCILING') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 if b.receipt is not null then return b.receipt;end if;
 if b.lease_until<=clock_timestamp() then raise exception 'FENCED' using errcode='40001';end if;
 r:=jsonb_build_object('accepted',false,'batchId',b.id,'reasonCode',code);
 update public.sales_inbox_batches set receipt=r where id=b.id;
 update public.sales_inbox_configs set reason_code=code,state=case when code='AUTH_FAILED' then 'needs_input' when code='RECONCILING' then 'reconciling' else state end where mailbox_id=b.mailbox_id;
 return r;
end $$;
-- Explicitly close PostgreSQL's default PUBLIC execute grant for every new helper/RPC.
revoke all on function public.sales_inbox_cursor(public.sales_inbox_configs) from public,anon,authenticated;
grant execute on function public.sales_inbox_cursor(public.sales_inbox_configs) to service_role;
revoke all on function public.sales_inbox_config_json(public.sales_inbox_configs) from public,anon,authenticated;
grant execute on function public.sales_inbox_config_json(public.sales_inbox_configs) to service_role;
revoke all on function public.sales_inbox_owner(jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.sales_inbox_owner(jsonb,uuid,uuid) to service_role;
revoke all on function public.sales_inbox_configure_inbox(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inbox_configure_inbox(jsonb,jsonb) to service_role;
revoke all on function public.sales_inbox_set_inbox_state(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inbox_set_inbox_state(jsonb,jsonb) to service_role;
revoke all on function public.sales_inbox_public_message(public.sales_inbox_messages,boolean) from public,anon,authenticated;
grant execute on function public.sales_inbox_public_message(public.sales_inbox_messages,boolean) to service_role;
revoke all on function public.sales_inbox_read_message(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inbox_read_message(jsonb,jsonb) to service_role;
revoke all on function public.sales_inbox_read_inbox(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inbox_read_inbox(jsonb,jsonb) to service_role;
revoke all on function public.sales_inbox_select_message_text(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inbox_select_message_text(jsonb,jsonb) to service_role;
revoke all on function public.sales_inbox_link_message(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inbox_link_message(jsonb,jsonb) to service_role;
revoke all on function public.sales_inbox_claim_sync(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inbox_claim_sync(text,jsonb) to service_role;
revoke all on function public.sales_inbox_batch_access(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inbox_batch_access(text,jsonb) to service_role;
revoke all on function public.sales_inbox_read_batch_receipt(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inbox_read_batch_receipt(text,jsonb) to service_role;
revoke all on function public.sales_inbox_commit_batch(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inbox_commit_batch(text,jsonb) to service_role;
revoke all on function public.sales_inbox_report_sync_failure(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_inbox_report_sync_failure(text,jsonb) to service_role;
