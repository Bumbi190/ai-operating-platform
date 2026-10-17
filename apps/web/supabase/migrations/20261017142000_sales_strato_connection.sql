-- B1: login-only encrypted setup. No inbox import, SMTP send or campaign rights.
create table public.sales_mailbox_connections (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,worker_id uuid not null unique,owner_id uuid not null,
 public_jwk jsonb not null,kid text not null check(kid ~ '^[a-f0-9]{64}$'),key_generation integer not null check(key_generation>0),
 generation integer not null default 0,head_setup_id uuid,email text not null default '',
 status text not null default 'not_connected' check(status in('not_connected','waiting_for_host','probing','authenticated','needs_input','reconciling')),
 smtp_authenticated_at timestamptz,imap_authenticated_at timestamptz,reason_code text,created_at timestamptz not null default now(),
 foreign key(project_id,worker_id) references public.sales_worker_registrations(project_id,id),unique(project_id,id)
);
create table public.sales_mailbox_setups (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,worker_id uuid not null,mailbox_id uuid not null,owner_id uuid not null,
 host_generation integer not null,mailbox_generation integer not null,kid text not null,email text not null,
 state text not null default 'created' check(state in('created','waiting_for_host','probing','authenticated','needs_input','reconciling')),
 sealed jsonb,sealed_hash text,claim_id uuid,lease_until timestamptz,receipt jsonb,receipt_hash text,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '15 minutes',
 foreign key(project_id,worker_id) references public.sales_worker_registrations(project_id,id),foreign key(project_id,mailbox_id) references public.sales_mailbox_connections(project_id,id)
);
create unique index sales_mailbox_one_setup on public.sales_mailbox_setups(worker_id) where state in('created','waiting_for_host','probing');
create index sales_mailbox_setup_expiry on public.sales_mailbox_setups(expires_at) where sealed is not null;
alter table public.sales_mailbox_connections enable row level security;
alter table public.sales_mailbox_setups enable row level security;
revoke all on public.sales_mailbox_connections,public.sales_mailbox_setups from public,anon,authenticated,service_role;
grant select on public.sales_mailbox_connections to authenticated;
grant select,insert,update on public.sales_mailbox_connections,public.sales_mailbox_setups to service_role;
create policy sales_mailbox_owner_read on public.sales_mailbox_connections for select to authenticated using(owner_id=(select auth.uid()) and exists(select from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));

create function public.sales_mailbox_fields(v jsonb,allowed text[]) returns void language plpgsql security invoker set search_path='' as $$
begin if jsonb_typeof(v) is distinct from 'object' or exists(select from jsonb_object_keys(v) k where not k=any(allowed)) then raise exception 'INVALID_BODY' using errcode='22023';end if;end $$;
create function public.sales_mailbox_binary(v text,minimum integer,maximum integer) returns bytea language plpgsql security invoker set search_path='' as $$
declare b bytea;
begin
 if v is null or v !~ '^[A-Za-z0-9_-]+$' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 b:=decode(translate(v,'-_','+/')||repeat('=',(4-length(v)%4)%4),'base64');
 if octet_length(b) not between minimum and maximum or rtrim(translate(replace(encode(b,'base64'),E'\n',''),'+/','-_'),'=')<>v then raise exception 'INVALID_BODY' using errcode='22023';end if;
 return b;
end $$;
create function public.sales_mailbox_status(c public.sales_mailbox_connections) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('mailboxId',c.id,'email',c.email,'status',c.status,'smtpAuthenticatedAt',c.smtp_authenticated_at,'imapAuthenticatedAt',c.imap_authenticated_at,'reasonCode',c.reason_code,'inboxEnabled',false,'sendingEnabled',false)
$$;
create function public.sales_mailbox_context(s public.sales_mailbox_setups) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('projectId',s.project_id,'workerId',s.worker_id,'mailboxId',s.mailbox_id,'setupId',s.id,'kid',s.kid,'email',s.email,'expiresAt',s.expires_at)
$$;
create function public.sales_mailbox_expire_worker(wid uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(wid::text||':sales-mailbox',0));
 with expired as (
  update public.sales_mailbox_setups set state=case when state='probing' then 'reconciling' else 'needs_input' end,sealed=null
  where worker_id=wid and state in('created','waiting_for_host','probing') and (expires_at<=clock_timestamp() or (state='probing' and lease_until<=clock_timestamp())) returning id,state
 ) update public.sales_mailbox_connections c set status=e.state,reason_code='SETUP_EXPIRED' from expired e where c.head_setup_id=e.id;
 get diagnostics n=row_count;return n;
end $$;
create function public.sales_mailbox_expire_setups() returns integer language plpgsql security invoker set search_path='' as $$
declare wid uuid;total integer:=0;
begin
 for wid in select distinct worker_id from public.sales_mailbox_setups where state in('created','waiting_for_host','probing') and (expires_at<=clock_timestamp() or (state='probing' and lease_until<=clock_timestamp())) order by worker_id loop
  total:=total+public.sales_mailbox_expire_worker(wid);
 end loop;return total;
end $$;
create function public.sales_mailbox_publish_key(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;c public.sales_mailbox_connections;j jsonb:=p_input->'jwk';n bytea;k text;
begin
 w:=public.sales_host_registration(p_token_hash);perform public.sales_mailbox_fields(p_input,array['generation','kid','jwk']);
 if (p_input->>'generation')::integer is distinct from w.host_generation then raise exception 'FENCED' using errcode='40001';end if;
 perform public.sales_mailbox_fields(j,array['kty','n','e']);
 if j->>'kty' is distinct from 'RSA' or j->>'e' is distinct from 'AQAB' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 n:=public.sales_mailbox_binary(j->>'n',384,384);if get_byte(n,0)<128 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 k:=encode(extensions.digest(decode('308201a2300d06092a864886f70d01010105000382018f003082018a0282018100','hex')||n||decode('0203010001','hex'),'sha256'),'hex');
 if k is distinct from p_input->>'kid' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(w.id::text||':sales-mailbox',0));perform public.sales_mailbox_expire_worker(w.id);
 select * into c from public.sales_mailbox_connections where worker_id=w.id for update;
 if found then
  if c.owner_id<>w.owner_id then raise exception 'NOT_FOUND' using errcode='P0002';end if;
  if c.kid<>k and exists(select from public.sales_mailbox_setups where worker_id=w.id and state in('created','waiting_for_host','probing')) then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
  update public.sales_mailbox_connections set public_jwk=j,kid=k,key_generation=w.host_generation where id=c.id returning * into c;
 else
  insert into public.sales_mailbox_connections(project_id,worker_id,owner_id,public_jwk,kid,key_generation) values(w.project_id,w.id,w.owner_id,j,k,w.host_generation) returning * into c;
 end if;return jsonb_build_object('mailboxId',c.id,'kid',c.kid,'generation',c.key_generation);
end $$;
-- Only a boolean for this exact owned job; service_role gets no cron schema reach.
create function public.sales_mailbox_cleanup_ready() returns boolean language sql security definer set search_path='' as $$
 select exists(select from cron.job where jobname='omnira-sales-mailbox-expiry-v1' and database=current_database() and username=current_user and active and schedule='*/5 * * * *' and command='select public.sales_mailbox_expire_setups();')
$$;
create function public.sales_mailbox_begin_setup(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;c public.sales_mailbox_connections;s public.sales_mailbox_setups;e text:=p_input->>'email';
begin
 perform public.sales_mailbox_fields(p_input,array['projectId','workerId','email']);perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);
 if e is null or octet_length(e)>254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or e<>lower(btrim(e)) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 if not public.sales_mailbox_cleanup_ready() then raise exception 'CLEANUP_UNAVAILABLE' using errcode='55000';end if;
 select * into w from public.sales_worker_registrations where id=(p_input->>'workerId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid and revoked_at is null and managed_authorized_at is not null and manager_token_hash is not null for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended(w.id::text||':sales-mailbox',0));perform public.sales_mailbox_expire_worker(w.id);
 select * into c from public.sales_mailbox_connections where worker_id=w.id and owner_id=w.owner_id and key_generation=w.host_generation for update;
 if not found then raise exception 'HOST_KEY_UNAVAILABLE' using errcode='55000';end if;
 select * into s from public.sales_mailbox_setups where worker_id=w.id and state in('created','waiting_for_host','probing') for update;
 if found then
  if s.email<>e then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 else
  insert into public.sales_mailbox_setups(project_id,worker_id,mailbox_id,owner_id,host_generation,mailbox_generation,kid,email) values(w.project_id,w.id,c.id,w.owner_id,w.host_generation,c.generation+1,c.kid,e) returning * into s;
  update public.sales_mailbox_connections set generation=s.mailbox_generation,head_setup_id=s.id,email=e,status='waiting_for_host',smtp_authenticated_at=null,imap_authenticated_at=null,reason_code=null where id=c.id;
 end if;
 return jsonb_build_object('context',public.sales_mailbox_context(s),'publicJwk',c.public_jwk,'alreadySubmitted',s.sealed_hash is not null);
end $$;
create function public.sales_mailbox_submit_sealed(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.sales_mailbox_setups;e jsonb:=p_input->'envelope';h text;wid uuid;
begin
 perform public.sales_mailbox_fields(p_input,array['projectId','setupId','envelope']);perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);
 select worker_id into wid from public.sales_mailbox_setups where id=(p_input->>'setupId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended(wid::text||':sales-mailbox',0));
 select * into s from public.sales_mailbox_setups where id=(p_input->>'setupId')::uuid for update;
 perform public.sales_mailbox_fields(e,array['format','wrappedKey','iv','ciphertext']);if e->>'format' is distinct from 'sales-strato-envelope-v1' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 perform public.sales_mailbox_binary(e->>'wrappedKey',384,384);perform public.sales_mailbox_binary(e->>'iv',12,12);perform public.sales_mailbox_binary(e->>'ciphertext',17,4112);
 h:=encode(extensions.digest(convert_to(e::text,'UTF8'),'sha256'),'hex');
 if s.sealed_hash is not null then
  if s.sealed_hash<>h then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
  return jsonb_build_object('setupId',s.id,'accepted',true);
 end if;
 if s.state<>'created' or s.expires_at<=clock_timestamp() or not exists(select from public.sales_worker_registrations w join public.projects p on p.id=w.project_id and p.owner_id=w.owner_id where w.id=s.worker_id and w.revoked_at is null and w.host_generation=s.host_generation and w.managed_authorized_at is not null) then raise exception 'FENCED' using errcode='40001';end if;
 update public.sales_mailbox_setups set sealed=e,sealed_hash=h,state='waiting_for_host' where id=s.id;
 return jsonb_build_object('setupId',s.id,'accepted',true);
end $$;
create function public.sales_mailbox_claim_setup(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;s public.sales_mailbox_setups;
begin
 w:=public.sales_host_registration(p_token_hash);perform public.sales_mailbox_fields(p_input,array[]::text[]);
 perform pg_advisory_xact_lock(hashtextextended(w.id::text||':sales-mailbox',0));perform public.sales_mailbox_expire_worker(w.id);
 select s0.* into s from public.sales_mailbox_setups s0 join public.sales_mailbox_connections c on c.id=s0.mailbox_id and c.head_setup_id=s0.id and c.generation=s0.mailbox_generation and c.kid=s0.kid
 where s0.worker_id=w.id and s0.owner_id=w.owner_id and s0.host_generation=w.host_generation and s0.state='waiting_for_host' and s0.expires_at>clock_timestamp() for update of s0;
 if not found then return jsonb_build_object('setup',null);end if;
 update public.sales_mailbox_setups set state='probing',claim_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds' where id=s.id returning * into s;
 update public.sales_mailbox_connections set status='probing' where id=s.mailbox_id;
 return jsonb_build_object('context',public.sales_mailbox_context(s),'envelope',s.sealed,'claimId',s.claim_id,'hostGeneration',s.host_generation,'mailboxGeneration',s.mailbox_generation);
end $$;
create function public.sales_mailbox_commit_probe(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;s public.sales_mailbox_setups;c public.sales_mailbox_connections;r jsonb:=p_input->'receipt';h text;smtp timestamptz;imap timestamptz;reason text;stored boolean;good boolean;
begin
 w:=public.sales_host_registration(p_token_hash);perform public.sales_mailbox_fields(p_input,array['setupId','claimId','hostGeneration','mailboxGeneration','receipt']);
 perform pg_advisory_xact_lock(hashtextextended(w.id::text||':sales-mailbox',0));
 select * into s from public.sales_mailbox_setups where id=(p_input->>'setupId')::uuid and worker_id=w.id and owner_id=w.owner_id for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if (p_input->>'hostGeneration')::integer is distinct from s.host_generation or (p_input->>'mailboxGeneration')::integer is distinct from s.mailbox_generation or (p_input->>'claimId')::uuid is distinct from s.claim_id then raise exception 'FENCED' using errcode='40001';end if;
 perform public.sales_mailbox_fields(r,array['smtpAuthenticatedAt','imapAuthenticatedAt','localStored','reasonCode']);
 h:=encode(extensions.digest(convert_to(r::text,'UTF8'),'sha256'),'hex');
 select * into c from public.sales_mailbox_connections where id=s.mailbox_id for update;
 if s.receipt_hash is not null then
  if s.receipt_hash<>h then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
  return jsonb_build_object('current',c.head_setup_id=s.id and c.generation=s.mailbox_generation,'mailboxGeneration',s.mailbox_generation,'status',public.sales_mailbox_status(c));
 end if;
 if w.host_generation<>s.host_generation or s.state<>'probing' or s.expires_at<=clock_timestamp() or s.lease_until<=clock_timestamp() or c.head_setup_id<>s.id or c.generation<>s.mailbox_generation then raise exception 'FENCED' using errcode='40001';end if;
 if jsonb_typeof(r->'localStored') is distinct from 'boolean' or not (r ?& array['smtpAuthenticatedAt','imapAuthenticatedAt','localStored','reasonCode']) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 smtp:=(r->>'smtpAuthenticatedAt')::timestamptz;imap:=(r->>'imapAuthenticatedAt')::timestamptz;stored:=(r->>'localStored')::boolean;reason:=r->>'reasonCode';
 if (smtp is not null and (smtp<s.created_at-interval '5 minutes' or smtp>clock_timestamp()+interval '5 minutes')) or (imap is not null and (imap<s.created_at-interval '5 minutes' or imap>clock_timestamp()+interval '5 minutes')) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 good:=smtp is not null and imap is not null and stored and reason is null;
 if not good and (stored or reason is null or reason not in('AUTH_FAILED','SMTP_AUTH_FAILED','IMAP_AUTH_FAILED','TLS_FAILED','CONNECTION_FAILED','UNSUPPORTED_AUTH','LOCAL_STORE_FAILED','CRYPTO_REFUSED','UNCERTAIN_PROBE')) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 update public.sales_mailbox_setups set state=case when good then 'authenticated' when reason='UNCERTAIN_PROBE' then 'reconciling' else 'needs_input' end,receipt=r,receipt_hash=h,sealed=null where id=s.id returning * into s;
 update public.sales_mailbox_connections set status=s.state,smtp_authenticated_at=smtp,imap_authenticated_at=imap,reason_code=reason where id=c.id returning * into c;
 return jsonb_build_object('current',true,'mailboxGeneration',s.mailbox_generation,'status',public.sales_mailbox_status(c));
end $$;
create function public.sales_mailbox_read_status(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.sales_mailbox_connections;
begin
 perform public.sales_mailbox_fields(p_input,array['projectId','mailboxId']);perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);
 select * into c from public.sales_mailbox_connections where id=(p_input->>'mailboxId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;return public.sales_mailbox_status(c);
end $$;
create function public.sales_mailbox_reference(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.sales_mailbox_connections;h jsonb;
begin
 perform public.sales_mailbox_fields(p_input,array['projectId','workerId']);
 h:=public.sales_host_read_status(p_principal,p_input);
 if h->>'managed'<>'true' or h->>'connectionState'='revoked' then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 select * into c from public.sales_mailbox_connections where project_id=(p_input->>'projectId')::uuid and worker_id=(p_input->>'workerId')::uuid and owner_id=(p_principal->>'userId')::uuid;
 return jsonb_build_object('connection',case when c.id is null then null else public.sales_mailbox_status(c) end);
end $$;
do $$ declare f regprocedure;begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname like 'sales_mailbox_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
select cron.schedule('omnira-sales-mailbox-expiry-v1','*/5 * * * *','select public.sales_mailbox_expire_setups();');
