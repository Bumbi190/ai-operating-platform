-- Owner-authorized immutable reply sending; no default policy or customer scope.
create table public.sales_send_policies(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),owner_id uuid not null,
 mailbox_id uuid not null references public.sales_mailbox_connections(id),worker_id uuid not null references public.sales_worker_registrations(id),
 recipient text not null,sender_email text not null,sender_name text not null,version integer not null check(version>0),
 expires_at timestamptz not null,enabled boolean not null default true,unique(project_id,mailbox_id)
);
create table public.sales_send_jobs(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),owner_id uuid not null,
 revision_id uuid not null references public.sales_reply_draft_revisions(id),revision_hash text not null check(revision_hash ~ '^[a-f0-9]{64}$'),
 request_key uuid not null,request jsonb not null,policy_id uuid not null references public.sales_send_policies(id),policy_version integer not null,
 sealed_json text not null,snapshot_sha256 text not null check(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'queued' check(status in('queued','claimed','dispatching','smtp_accepted','failed_before_send','delivery_unknown','cancelled')),
 worker_id uuid,claim_id uuid,generation integer not null default 0,host_generation integer,lease_until timestamptz,dispatch_before timestamptz,
 receipt jsonb,accepted_at timestamptz,detail text,created_at timestamptz not null default clock_timestamp(),
 unique(project_id,request_key),unique(revision_id)
);
create index sales_send_queue on public.sales_send_jobs(project_id,status,created_at);
create index sales_send_policy on public.sales_send_jobs(policy_id);
create table public.sales_send_events(
 id bigint generated always as identity primary key,send_job_id uuid not null references public.sales_send_jobs(id),
 kind text not null check(kind in('confirmed','claimed','dispatching','smtp_accepted','failed_before_send','delivery_unknown','cancelled')),
 created_at timestamptz not null default clock_timestamp()
);
create index sales_send_event_job on public.sales_send_events(send_job_id);
alter table public.sales_send_policies enable row level security;
alter table public.sales_send_jobs enable row level security;
alter table public.sales_send_events enable row level security;
revoke all on public.sales_send_policies,public.sales_send_jobs,public.sales_send_events from public,anon,authenticated,service_role;
grant select,insert,update on public.sales_send_policies,public.sales_send_jobs to service_role;
grant select,insert on public.sales_send_events to service_role;
grant usage,select on sequence public.sales_send_events_id_seq to service_role;

create function public.sales_send_json(j public.sales_send_jobs) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('id',j.id,'status',case when j.status='dispatching' and j.dispatch_before<=clock_timestamp() then 'delivery_unknown' when j.status='claimed' and j.lease_until<=clock_timestamp() then 'failed_before_send' else j.status end,'revisionId',j.revision_id,'revisionHash',j.revision_hash,'createdAt',j.created_at,'acceptedAt',j.accepted_at,'detail',j.detail,'serverAccepted',j.status='smtp_accepted','deliveryConfirmed',false)
$$;
-- Match the reply editor's run/approval -> source -> job -> revision lock order.
create function public.sales_send_authority(pid uuid,uid uuid,rid uuid,h text,mg integer) returns public.sales_send_policies language plpgsql security invoker set search_path='' as $$
declare d public.sales_reply_draft_revisions;j public.sales_reply_jobs;p public.sales_send_policies;
begin
 select * into d from public.sales_reply_draft_revisions where id=rid and project_id=pid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 perform 1 from public.runs where id=d.run_id for share;
 perform 1 from public.approvals where id=d.approval_id for share;
 select * into j from public.sales_reply_jobs where id=d.job_id and owner_id=uid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 -- Lock worker before source relations, matching inbox ingestion's worker-first order.
 perform 1 from public.sales_worker_registrations w where w.id=(select worker_id from public.sales_mailbox_connections where id=(j.snapshot->>'mailboxId')::uuid) and w.project_id=pid and w.owner_id=uid and w.revoked_at is null and w.desired_state='running' and w.managed_authorized_at is not null and w.expires_at>clock_timestamp() for share;
 if not found then raise exception 'SOURCE_CHANGED' using errcode='40001';end if;
 -- Source row locks alone cannot fence a NEW same-address message/suppression row.
 -- These short authority transactions take relation SHARE locks before inspecting
 -- either source set, so concurrent inserts linearize before or after the permit.
 lock table public.sales_contacts,public.sales_inbox_messages in share mode;
 perform public.sales_reply_assert_source(j);
 select * into j from public.sales_reply_jobs where id=j.id for share;
 select * into d from public.sales_reply_draft_revisions where id=rid for share;
 if not d.is_current or d.sha256 is distinct from h or (j.snapshot->>'mailboxGeneration')::integer is distinct from mg
 then raise exception 'SOURCE_CHANGED' using errcode='40001';end if;
 if j.status in('cancelled','failed','reconciling') or public.sales_reply_newer(j) or jsonb_array_length(d.data->'questions')<>0
 or not exists(select from public.approvals a join public.runs r on r.id=a.run_id where a.id=d.approval_id and a.project_id=pid and r.id=d.run_id and a.status='approved' and r.status='done')
 then raise exception 'TEXT_APPROVAL_REQUIRED' using errcode='55000';end if;
 perform public.sales_validate_conversation(jsonb_build_object('userId',uid,'allowedProjectIds',jsonb_build_array(pid)),j.request);
 select p0.* into p from public.sales_send_policies p0 join public.sales_mailbox_connections b on b.id=p0.mailbox_id and b.project_id=p0.project_id and b.owner_id=p0.owner_id and b.worker_id=p0.worker_id
 where p0.project_id=pid and p0.owner_id=uid and p0.mailbox_id=(j.snapshot->>'mailboxId')::uuid for share of p0;
 if not found or not p.enabled or p.expires_at<=clock_timestamp() or j.snapshot->>'replyMode' is distinct from 'general'
 or p.recipient is distinct from j.snapshot->'correspondent'->>'email' or p.sender_email is distinct from j.snapshot->'sender'->>'email'
 or p.sender_name is distinct from j.snapshot->'sender'->>'displayName'
 then raise exception 'SEND_POLICY_REQUIRED' using errcode='40001';end if;
 return p;
end $$;
create function public.sales_send_confirm(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;uid uuid:=(p_principal->>'userId')::uuid;
j public.sales_send_jobs;p public.sales_send_policies;d public.sales_reply_draft_revisions;r public.sales_reply_jobs;s text;mid uuid:=gen_random_uuid();k text;
begin
 perform public.sales_owner(p_principal,pid);
 perform public.sales_mailbox_fields(p_input,array['projectId','revisionId','expectedRevisionHash','expectedMailboxGeneration','idempotencyKey']);
 foreach k in array array['projectId','revisionId','idempotencyKey'] loop if p_input->>k is null or p_input->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_BODY' using errcode='22023';end if;end loop;
 if p_input->>'expectedRevisionHash' is null or p_input->>'expectedRevisionHash' !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_input->'expectedMailboxGeneration') is distinct from 'number' or p_input->>'expectedMailboxGeneration' !~ '^[1-9][0-9]*$' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':send-key:'||(p_input->>'idempotencyKey'),0));
 select * into j from public.sales_send_jobs where project_id=pid and request_key=(p_input->>'idempotencyKey')::uuid;
 if found then if j.request is distinct from p_input then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return public.sales_send_json(j);end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':send-revision:'||(p_input->>'revisionId'),0));
 select * into j from public.sales_send_jobs where project_id=pid and revision_id=(p_input->>'revisionId')::uuid;
 if found then
 if (j.request-'idempotencyKey') is distinct from (p_input-'idempotencyKey') then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 return public.sales_send_json(j);end if;
 p:=public.sales_send_authority(pid,uid,(p_input->>'revisionId')::uuid,p_input->>'expectedRevisionHash',(p_input->>'expectedMailboxGeneration')::integer);
 select * into d from public.sales_reply_draft_revisions where id=(p_input->>'revisionId')::uuid;
 select * into r from public.sales_reply_jobs where id=d.job_id;
 s:=jsonb_build_object('version',1,'projectId',pid,'ownerId',uid,'revisionId',d.id,'revisionHash',d.sha256,'sourceJobId',r.id,'sourceMessageId',r.message_id,
 'mailboxId',p.mailbox_id,'mailboxGeneration',p_input->'expectedMailboxGeneration','workerId',p.worker_id,'policyId',p.id,'policyVersion',p.version,
 'senderEmail',p.sender_email,'senderName',p.sender_name,'toEmail',p.recipient,'subject',d.data->>'subject','body',d.data->>'body',
 'messageId','<omnira-reply-'||mid::text||'@'||split_part(p.sender_email,'@',2)||'>','date',to_char(clock_timestamp() at time zone 'UTC','Dy, DD Mon YYYY HH24:MI:SS +0000'),
 'inReplyTo',r.snapshot->'header'->'messageId','references',coalesce(r.snapshot->'header'->'references','[]'::jsonb))::text;
 insert into public.sales_send_jobs(id,project_id,owner_id,revision_id,revision_hash,request_key,request,policy_id,policy_version,sealed_json,snapshot_sha256)
 values(mid,pid,uid,d.id,d.sha256,(p_input->>'idempotencyKey')::uuid,p_input,p.id,p.version,s,encode(extensions.digest(convert_to(s,'UTF8'),'sha256'),'hex')) returning * into j;
 insert into public.sales_send_events(send_job_id,kind) values(j.id,'confirmed');
 return public.sales_send_json(j);
end $$;
create function public.sales_send_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.sales_send_jobs;
begin
 perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId']);
 select * into j from public.sales_send_jobs where id=(p_input->>'sendJobId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;return public.sales_send_json(j);
end $$;
create function public.sales_send_cancel(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.sales_send_jobs;
begin
 perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId','expectedRevisionHash']);
 select * into j from public.sales_send_jobs where id=(p_input->>'sendJobId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if j.revision_hash is distinct from p_input->>'expectedRevisionHash' then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 if j.status='cancelled' then return public.sales_send_json(j);end if;
 if j.status not in('queued','claimed') or j.dispatch_before is not null then raise exception 'DISPATCH_ALREADY_RESERVED' using errcode='55000';end if;
 update public.sales_send_jobs set status='cancelled',detail='CANCELLED_BY_OWNER' where id=j.id returning * into j;
 insert into public.sales_send_events(send_job_id,kind) values(j.id,'cancelled');return public.sales_send_json(j);
end $$;
create function public.sales_send_access(w public.sales_worker_registrations,v jsonb) returns public.sales_send_jobs language plpgsql security invoker set search_path='' as $$
declare j public.sales_send_jobs;
begin
 select * into j from public.sales_send_jobs where id=(v->>'sendJobId')::uuid and project_id=w.project_id and owner_id=w.owner_id for update;
 if not found or w.id is distinct from (v->>'workerId')::uuid or w.project_id is distinct from (v->>'projectId')::uuid or j.worker_id is distinct from w.id or j.claim_id is distinct from (v->>'claimId')::uuid or j.generation is distinct from (v->>'generation')::integer then raise exception 'FENCED' using errcode='40001';end if;
 return j;
end $$;
create function public.sales_send_claim(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_send_jobs;
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array[]::text[]);perform public.sales_stop(w.project_id);
 if w.managed_authorized_at is null or w.desired_state<>'running' then raise exception 'STOPPED' using errcode='55000';end if;
 update public.sales_send_jobs set status='delivery_unknown',detail='DISPATCH_UNCERTAIN' where project_id=w.project_id and status='dispatching' and dispatch_before<=clock_timestamp();
 update public.sales_send_jobs set status='failed_before_send',detail='CLAIM_EXPIRED' where project_id=w.project_id and status='claimed' and lease_until<=clock_timestamp();
 select j0.* into j from public.sales_send_jobs j0 join public.sales_send_policies p on p.id=j0.policy_id and p.worker_id=w.id
 where j0.project_id=w.project_id and j0.owner_id=w.owner_id and j0.status='queued' order by j0.created_at,j0.id for update of j0 skip locked limit 1;
 if not found then return jsonb_build_object('ref',null);end if;
 update public.sales_send_jobs set status='claimed',worker_id=w.id,claim_id=gen_random_uuid(),generation=generation+1,host_generation=w.host_generation,lease_until=clock_timestamp()+interval '180 seconds' where id=j.id returning * into j;
 insert into public.sales_send_events(send_job_id,kind) values(j.id,'claimed');
 return jsonb_build_object('ref',jsonb_build_object('projectId',j.project_id,'sendJobId',j.id,'workerId',w.id,'claimId',j.claim_id,'generation',j.generation),'snapshot',jsonb_build_object('sealedJson',j.sealed_json,'snapshotSha256',j.snapshot_sha256));
end $$;
create function public.sales_send_heartbeat(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_send_jobs;
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId','workerId','claimId','generation']);j:=public.sales_send_access(w,p_input);
 if j.status<>'claimed' or j.lease_until<=clock_timestamp() or j.host_generation is distinct from w.host_generation or w.desired_state<>'running' then raise exception 'FENCED' using errcode='40001';end if;
 update public.sales_send_jobs set lease_until=clock_timestamp()+interval '180 seconds' where id=j.id;
 update public.sales_worker_registrations set last_seen_at=clock_timestamp() where id=w.id;return jsonb_build_object('ok',true);
end $$;
create function public.sales_send_begin_dispatch(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_send_jobs;p public.sales_send_policies;d public.sales_reply_draft_revisions;
begin
 perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId','workerId','claimId','generation']);
 -- Discover without locks, then acquire the existing editorial run lock BEFORE the worker.
 select j0.* into j from public.sales_send_jobs j0 join public.sales_worker_registrations w0 on w0.project_id=j0.project_id and w0.owner_id=j0.owner_id where w0.token_hash=p_token_hash and j0.id=(p_input->>'sendJobId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 select * into d from public.sales_reply_draft_revisions where id=j.revision_id;
 perform 1 from public.runs where id=d.run_id for share;perform 1 from public.approvals where id=d.approval_id for share;
 w:=public.sales_worker(p_token_hash);
 p:=public.sales_send_authority(j.project_id,j.owner_id,j.revision_id,j.revision_hash,(j.request->>'expectedMailboxGeneration')::integer);
 j:=public.sales_send_access(w,p_input);
 if j.status<>'claimed' or j.dispatch_before is not null or j.lease_until<=clock_timestamp() or j.host_generation is distinct from w.host_generation
 or w.desired_state<>'running' or w.managed_authorized_at is null or p.id<>j.policy_id or p.version<>j.policy_version or p.worker_id<>w.id
 then raise exception 'FENCED' using errcode='40001';end if;
 update public.sales_send_jobs set status='dispatching',dispatch_before=clock_timestamp()+interval '5 seconds' where id=j.id returning * into j;
 insert into public.sales_send_events(send_job_id,kind) values(j.id,'dispatching');
 return jsonb_build_object('dispatchBefore',j.dispatch_before,'snapshotSha256',j.snapshot_sha256);
end $$;
create function public.sales_send_complete(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_send_jobs;r jsonb:=p_input->'receipt';s text:=r->>'status';
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId','workerId','claimId','generation','receipt']);
 perform public.sales_mailbox_fields(r,array['status','mimeSha256']);
 if s is null or s not in('smtp_accepted','failed_before_send','delivery_unknown') or r->>'mimeSha256' is null or r->>'mimeSha256' !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 j:=public.sales_send_access(w,p_input);
 if j.receipt is not null then if j.receipt is distinct from r then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return public.sales_send_json(j);end if;
 if (s='failed_before_send' and (j.status<>'claimed' or j.dispatch_before is not null))
 or (s in('smtp_accepted','delivery_unknown') and (j.dispatch_before is null or j.status not in('dispatching','delivery_unknown')))
 then raise exception 'FENCED' using errcode='40001';end if;
 update public.sales_send_jobs set status=s,receipt=r,accepted_at=case when s='smtp_accepted' then clock_timestamp() end,detail=case when s='delivery_unknown' then 'DISPATCH_UNCERTAIN' end where id=j.id returning * into j;
 insert into public.sales_send_events(send_job_id,kind) values(j.id,s);return public.sales_send_json(j);
end $$;
create function public.sales_send_read_receipt(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_send_jobs;
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId','workerId','claimId','generation']);j:=public.sales_send_access(w,p_input);
 return jsonb_build_object('receipt',j.receipt,'summary',public.sales_send_json(j),'dispatchReserved',j.dispatch_before is not null,'expired',j.lease_until<=clock_timestamp());
end $$;
create function public.sales_send_report_uncertain(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_send_jobs;
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId','workerId','claimId','generation']);j:=public.sales_send_access(w,p_input);
 if j.receipt is null and j.status in('claimed','dispatching') then
 update public.sales_send_jobs set status=case when dispatch_before is null then 'failed_before_send' else 'delivery_unknown' end,detail='RECOVERY_NO_RETRY' where id=j.id returning * into j;
 insert into public.sales_send_events(send_job_id,kind) values(j.id,j.status);end if;
 return public.sales_send_json(j);
end $$;
create function public.sales_send_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' or (to_jsonb(new)-array['status','worker_id','claim_id','generation','host_generation','lease_until','dispatch_before','receipt','accepted_at','detail']) is distinct from (to_jsonb(old)-array['status','worker_id','claim_id','generation','host_generation','lease_until','dispatch_before','receipt','accepted_at','detail'])
 then raise exception 'IMMUTABLE_SEND_AUTHORITY' using errcode='42501';end if;return new;
end $$;
create trigger sales_send_authority_immutable before update or delete on public.sales_send_jobs for each row execute function public.sales_send_immutable();
-- No policy is created by this migration. Reviewed operator installation is separate.
do $$ declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'sales_send_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);end loop;
end $$;

create or replace function public.sales_reply_job_json(j public.sales_reply_jobs) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('editorialStatus',coalesce((select a.status from public.sales_reply_draft_revisions d left join public.approvals a on a.id=d.approval_id where d.job_id=j.id and d.is_current),'not_ready'),'replyMode',coalesce(j.snapshot->>'replyMode','commercial'),'id',j.id,'projectId',j.project_id,'messageId',j.message_id,'status',case when j.status='running' and j.lease_until<=clock_timestamp() then 'reconciling' else j.status end,'attempts',j.attempts,'detail',j.detail,'createdAt',j.created_at,'sourceCurrent',public.sales_reply_source_current(j),'newerIncoming',public.sales_reply_newer(j),'sendingEnabled',false,'source',jsonb_build_object('subject',j.snapshot->'header'->>'subject','companyName',coalesce(j.snapshot->'contact'->>'companyName','Mejlsvar'),'branchName',j.snapshot->'contact'->>'branchName','senderEmail',coalesce(j.snapshot->'sender'->>'email',j.snapshot->'offer'->>'senderEmail'),'senderName',j.snapshot->'sender'->>'displayName','toEmail',coalesce(j.snapshot->'correspondent'->>'email',j.snapshot->'contact'->>'email'),'offerText',coalesce(j.snapshot->'offer'->>'offerText','Inget erbjudande')))
$$;
create function public.sales_send_preview(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.sales_reply_draft_revisions;r public.sales_reply_jobs;j public.sales_send_jobs;p public.sales_send_policies;reason text;can_confirm boolean:=false;
begin
 perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);
 perform public.sales_mailbox_fields(p_input,array['projectId','revisionId']);
 select d0.* into d from public.sales_reply_draft_revisions d0 join public.sales_reply_jobs r0 on r0.id=d0.job_id and r0.owner_id=(p_principal->>'userId')::uuid where d0.id=(p_input->>'revisionId')::uuid and d0.project_id=(p_input->>'projectId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 select * into r from public.sales_reply_jobs where id=d.job_id;
 select * into j from public.sales_send_jobs where revision_id=d.id and owner_id=r.owner_id and project_id=r.project_id;
 if j.id is null then
  begin
   p:=public.sales_send_authority(r.project_id,r.owner_id,d.id,d.sha256,(r.snapshot->>'mailboxGeneration')::integer);can_confirm:=true;
  exception when sqlstate '55000' then reason:='TEXT_APPROVAL_OR_PROJECT_REQUIRED';when sqlstate '40001' then reason:='SOURCE_OR_SEND_POLICY_CHANGED';when sqlstate 'P0002' then reason:='SOURCE_UNAVAILABLE';end;
 end if;
 return jsonb_build_object('revisionId',d.id,'revisionHash',d.sha256,'mailboxGeneration',(r.snapshot->>'mailboxGeneration')::integer,'canConfirm',can_confirm,'blockedReason',reason,'job',case when j.id is null then null else public.sales_send_json(j) end);
end $$;
revoke all on function public.sales_send_preview(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_send_preview(jsonb,jsonb) to service_role;
