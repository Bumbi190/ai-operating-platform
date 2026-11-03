-- Owner-authorized immutable initial outreach; no default policy or customer scope.
create table public.sales_initial_send_policies(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),owner_id uuid not null,
 mailbox_id uuid not null references public.sales_mailbox_connections(id),worker_id uuid not null references public.sales_worker_registrations(id),
 contact_id uuid not null references public.sales_contacts(id),offer_revision_id uuid not null references public.sales_offer_revisions(id),entity_key text not null check(length(entity_key) between 1 and 200),allow_history_gap boolean not null default false,recipient text not null check(recipient=lower(btrim(recipient))),sender_email text not null,sender_name text not null,version integer not null check(version>0),
 expires_at timestamptz not null,enabled boolean not null default false,unique(project_id,mailbox_id,recipient)
);
create table public.sales_initial_send_jobs(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),owner_id uuid not null,
 revision_id uuid not null references public.sales_draft_revisions(id),revision_hash text not null check(revision_hash ~ '^[a-f0-9]{64}$'),
 recipient text not null,entity_key text not null,policy_snapshot jsonb not null,request_key uuid not null,request jsonb not null,policy_id uuid not null references public.sales_initial_send_policies(id),policy_version integer not null,
 sealed_json text not null,snapshot_sha256 text not null check(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'queued' check(status in('queued','claimed','dispatching','smtp_accepted','failed_before_send','delivery_unknown','cancelled')),
 worker_id uuid,claim_id uuid,generation integer not null default 0,host_generation integer,lease_until timestamptz,dispatch_before timestamptz,
 receipt jsonb,accepted_at timestamptz,detail text,created_at timestamptz not null default clock_timestamp(),
 unique(project_id,request_key),unique(revision_id),unique(project_id,id)
);
create index sales_initial_send_queue on public.sales_initial_send_jobs(project_id,status,created_at);
create index sales_initial_send_policy on public.sales_initial_send_jobs(policy_id);
create table public.sales_initial_send_events(
 id bigint generated always as identity primary key,project_id uuid not null,send_job_id uuid not null,request_key uuid,request jsonb,
 foreign key(project_id,send_job_id) references public.sales_initial_send_jobs(project_id,id),unique(project_id,request_key),
 check((request_key is null)=(request is null)),
 kind text not null check(kind in('confirmed','claimed','dispatching','smtp_accepted','failed_before_send','delivery_unknown','cancelled')),
 check((kind='confirmed')=(request_key is not null)),
 created_at timestamptz not null default clock_timestamp()
);
create index sales_initial_send_event_job on public.sales_initial_send_events(send_job_id);
alter table public.sales_initial_send_policies enable row level security;
alter table public.sales_initial_send_jobs enable row level security;
alter table public.sales_initial_send_events enable row level security;
revoke all on public.sales_initial_send_policies,public.sales_initial_send_jobs,public.sales_initial_send_events from public,anon,authenticated,service_role;
grant select,insert,update on public.sales_initial_send_policies,public.sales_initial_send_jobs to service_role;
grant select,insert on public.sales_initial_send_events to service_role;
revoke all on sequence public.sales_initial_send_events_id_seq from public,anon,authenticated,service_role;
grant usage,select on sequence public.sales_initial_send_events_id_seq to service_role;

create function public.sales_initial_send_json(j public.sales_initial_send_jobs) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('id',j.id,'status',case when j.status='dispatching' and j.dispatch_before<=clock_timestamp() then 'delivery_unknown' when j.status='claimed' and j.lease_until<=clock_timestamp() then 'failed_before_send' else j.status end,'revisionId',j.revision_id,'revisionHash',j.revision_hash,'createdAt',j.created_at,'acceptedAt',j.accepted_at,'detail',j.detail,'serverAccepted',j.status='smtp_accepted','deliveryConfirmed',false)
$$;

create unique index sales_initial_send_one_recipient on public.sales_initial_send_jobs(project_id,recipient) where status in('queued','claimed','dispatching','smtp_accepted','delivery_unknown');
create unique index sales_initial_send_one_entity on public.sales_initial_send_jobs(project_id,entity_key) where status in('queued','claimed','dispatching','smtp_accepted','delivery_unknown');

-- Self is ignored only for the pending queue row currently being dispatched.
create function public.sales_initial_send_authority(pid uuid,uid uuid,v jsonb,own_job uuid default null)
returns public.sales_initial_send_policies language plpgsql security invoker set search_path='' as $$
declare d public.sales_draft_revisions;r public.sales_jobs;c public.sales_contacts;h public.sales_contact_history_revisions;p public.sales_initial_send_policies;b public.sales_mailbox_connections;t jsonb;o jsonb;gap boolean;channel text;begin
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-contact-eligibility',0));
 select * into d from public.sales_draft_revisions where id=(v->>'revisionId')::uuid and project_id=pid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 perform 1 from public.runs where id=d.run_id for share;perform 1 from public.approvals where id=d.approval_id for share;
 select * into r from public.sales_jobs where id=d.job_id and project_id=pid and owner_id=uid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 perform public.sales_stop(pid);perform public.sales_validate_conversation(jsonb_build_object('userId',uid,'allowedProjectIds',jsonb_build_array(pid)),r.request);
 select p0.* into p from public.sales_initial_send_policies p0 where p0.project_id=pid and p0.owner_id=uid and p0.contact_id=d.contact_id and p0.recipient=lower(btrim(d.data->>'toEmail')) for share;
 if not found or not p.enabled or p.expires_at<=clock_timestamp() or p.version is distinct from (v->>'expectedPolicyVersion')::integer then raise exception 'INITIAL_SEND_POLICY_REQUIRED' using errcode='40001';end if;
 perform 1 from public.sales_worker_registrations w where w.id=p.worker_id and w.project_id=pid and w.owner_id=uid and w.revoked_at is null and w.desired_state='running' and w.managed_authorized_at is not null and w.expires_at>clock_timestamp() for share;
 if not found then raise exception 'SOURCE_CHANGED' using errcode='40001';end if;
 lock table public.sales_contacts,public.sales_inbox_messages,public.sales_send_jobs in share mode;
 select * into c from public.sales_contacts where id=d.contact_id and project_id=pid for share;
 select * into b from public.sales_mailbox_connections where id=p.mailbox_id and project_id=pid and owner_id=uid and worker_id=p.worker_id for share;
 if not found or b.status<>'authenticated' or b.generation is distinct from (v->>'expectedMailboxGeneration')::integer or b.email is distinct from p.sender_email then raise exception 'SOURCE_CHANGED' using errcode='40001';end if;
 select * into d from public.sales_draft_revisions where id=d.id and project_id=pid for share;
 if not d.is_current or d.sha256 is distinct from v->>'expectedRevisionHash' or (d.data->>'contactVersion')::integer is distinct from c.version
 or p.contact_id is distinct from d.contact_id or p.offer_revision_id is distinct from (d.data->>'offerRevisionId')::uuid
 or p.sender_email is distinct from d.data->>'senderEmail' or p.recipient is distinct from lower(btrim(c.data->>'email'))
 then raise exception 'SOURCE_CHANGED' using errcode='40001';end if;
 if r.status in('cancelled','failed','reconciling') or jsonb_array_length(d.data->'questions')<>0
 or not exists(select from public.approvals a join public.runs run on run.id=a.run_id where a.id=d.approval_id and a.project_id=pid and run.id=d.run_id and a.status='approved' and run.status='done')
 then raise exception 'TEXT_APPROVAL_REQUIRED' using errcode='55000';end if;
 select data into o from public.sales_offer_revisions where project_id=pid and id=p.offer_revision_id for share;
 if o is null or not public.sales_confirmed_offer(o) or not public.sales_offer_matches(c.data,o) or o->>'senderEmail' is distinct from p.sender_email then raise exception 'OFFER_REVIEW_REQUIRED' using errcode='55000';end if;
 t:=public.sales_timing_evaluate(pid,c.id,clock_timestamp());
 select * into h from public.sales_contact_history_revisions where project_id=pid and recipient=p.recipient order by version desc limit 1;
 if h.id is distinct from (v->>'expectedHistoryRevisionId')::uuid or t->>'ruleRevisionId' is distinct from v->>'expectedRuleRevisionId' then raise exception 'SOURCE_CHANGED' using errcode='40001';end if;
 if h.id is null or h.data->>'history' not in('unknown','owner_confirmed_none') or jsonb_array_length(h.data->'events')<>0 or c.data->>'history'<>'not_contacted'
 or exists(select from jsonb_array_elements_text(t->'blockers') reason where reason not in('HISTORY_REVIEW_REQUIRED','SOURCE_GAP','NOT_INITIAL_CONTACT','SEND_PENDING'))
 or exists(select from jsonb_array_elements(h.data->'sources') source where source->>'state'='failed' or clock_timestamp()-(source->>'through')::timestamptz>interval '900 seconds')
 or exists(select from public.sales_contacts linked where linked.project_id=pid and lower(btrim(linked.data->>'email'))=p.recipient and (linked.data->>'history'='contacted' or linked.data->>'suppressed'='true' or linked.data->>'excluded'='true'))
 or exists(select from public.sales_send_jobs sent where sent.project_id=pid and lower(btrim(sent.sealed_json::jsonb->>'toEmail'))=p.recipient and (sent.status in('queued','claimed','dispatching','smtp_accepted','delivery_unknown') or sent.accepted_at is not null))
 or exists(select from public.sales_initial_send_jobs sent where sent.project_id=pid and sent.id is distinct from own_job and (sent.recipient=p.recipient or sent.entity_key=p.entity_key) and (sent.status in('queued','claimed','dispatching','smtp_accepted','delivery_unknown') or sent.accepted_at is not null))
 then raise exception 'INITIAL_CONTACT_REVIEW_REQUIRED' using errcode='55000';end if;
 foreach channel in array array['strato_sent','strato_inbox','resend'] loop
  if not exists(select from jsonb_array_elements(h.data->'sources') source where source->>'channel'=channel and source->>'state' in('complete','gap')) then raise exception 'INITIAL_CONTACT_REVIEW_REQUIRED' using errcode='55000';end if;
 end loop;
 gap:=h.data->>'history'='unknown' or h.data->'olderHistoryAttestation'='null' or t->'blockers' ? 'SOURCE_GAP';
 if gap and (not p.allow_history_gap or v->'acceptHistoryGap' is distinct from 'true'::jsonb) then raise exception 'EXPLICIT_HISTORY_GAP_DECISION_REQUIRED' using errcode='55000';end if;
 if p.expires_at<=clock_timestamp() then raise exception 'INITIAL_SEND_POLICY_REQUIRED' using errcode='40001';end if;
 return p;
end$$;

create function public.sales_initial_send_confirm(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid;uid uuid;j public.sales_initial_send_jobs;p public.sales_initial_send_policies;d public.sales_draft_revisions;c public.sales_contacts;e public.sales_initial_send_events;s text;mid uuid:=gen_random_uuid();k text;begin
 pid:=public.sales_timing_uuid(p_input->'projectId');uid:=public.sales_timing_uuid(p_principal->'userId');perform public.sales_owner(p_principal,pid);
 perform public.sales_timing_fields(p_input,array['projectId','revisionId','expectedRevisionHash','expectedMailboxGeneration','expectedHistoryRevisionId','expectedRuleRevisionId','expectedPolicyVersion','acceptHistoryGap','idempotencyKey']);
 foreach k in array array['revisionId','expectedHistoryRevisionId','expectedRuleRevisionId','idempotencyKey'] loop perform public.sales_timing_uuid(p_input->k);end loop;
 foreach k in array array['expectedMailboxGeneration','expectedPolicyVersion'] loop
  if jsonb_typeof(p_input->k) is distinct from 'number' or p_input->>k !~ '^[1-9][0-9]{0,8}$' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 end loop;
 if p_input->>'expectedRevisionHash' is null or p_input->>'expectedRevisionHash' !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_input->'acceptHistoryGap') is distinct from 'boolean' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-contact-eligibility',0));
 select * into e from public.sales_initial_send_events where project_id=pid and request_key=(p_input->>'idempotencyKey')::uuid;
 if found then
  if e.request is distinct from p_input then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
  select * into j from public.sales_initial_send_jobs where id=e.send_job_id and project_id=pid and owner_id=uid;return public.sales_initial_send_json(j);
 end if;
 select * into j from public.sales_initial_send_jobs where project_id=pid and owner_id=uid and revision_id=(p_input->>'revisionId')::uuid;
 if found then
  if (j.request-'idempotencyKey') is distinct from (p_input-'idempotencyKey') then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
  insert into public.sales_initial_send_events(project_id,send_job_id,kind,request_key,request) values(pid,j.id,'confirmed',(p_input->>'idempotencyKey')::uuid,p_input);return public.sales_initial_send_json(j);
 end if;
 p:=public.sales_initial_send_authority(pid,uid,p_input);
 select * into d from public.sales_draft_revisions where id=(p_input->>'revisionId')::uuid;
 select * into c from public.sales_contacts where id=d.contact_id;
 s:=jsonb_build_object('version',2,'kind','initial','projectId',pid,'ownerId',uid,'revisionId',d.id,'revisionHash',d.sha256,'sourceJobId',d.job_id,
 'contactId',c.id,'contactVersion',c.version,'offerRevisionId',p.offer_revision_id,'historyRevisionId',p_input->'expectedHistoryRevisionId','ruleRevisionId',p_input->'expectedRuleRevisionId','historyGapAccepted',p_input->'acceptHistoryGap',
 'mailboxId',p.mailbox_id,'mailboxGeneration',p_input->'expectedMailboxGeneration','workerId',p.worker_id,'policyId',p.id,'policyVersion',p.version,
 'senderEmail',p.sender_email,'senderName',p.sender_name,'toEmail',p.recipient,'subject',d.data->>'subject','body',d.data->>'body',
 'messageId','<omnira-initial-'||mid::text||'@'||split_part(p.sender_email,'@',2)||'>','date',to_char(clock_timestamp() at time zone 'UTC','Dy, DD Mon YYYY HH24:MI:SS +0000'),'inReplyTo',null,'references','[]'::jsonb)::text;
 insert into public.sales_initial_send_jobs(id,project_id,owner_id,revision_id,revision_hash,recipient,entity_key,policy_snapshot,request_key,request,policy_id,policy_version,sealed_json,snapshot_sha256)
 values(mid,pid,uid,d.id,d.sha256,p.recipient,p.entity_key,to_jsonb(p),(p_input->>'idempotencyKey')::uuid,p_input,p.id,p.version,s,encode(extensions.digest(convert_to(s,'UTF8'),'sha256'),'hex')) returning * into j;
 insert into public.sales_initial_send_events(project_id,send_job_id,kind,request_key,request) values(pid,j.id,'confirmed',(p_input->>'idempotencyKey')::uuid,p_input);
 return public.sales_initial_send_json(j);
end$$;
create function public.sales_initial_send_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.sales_initial_send_jobs;
begin
 perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId']);
 select * into j from public.sales_initial_send_jobs where id=(p_input->>'sendJobId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;return public.sales_initial_send_json(j);
end $$;
create function public.sales_initial_send_cancel(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.sales_initial_send_jobs;
begin
 perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId','expectedRevisionHash']);
 perform pg_advisory_xact_lock(hashtextextended(p_input->>'projectId'||':sales-contact-eligibility',0));
 select * into j from public.sales_initial_send_jobs where id=(p_input->>'sendJobId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if j.revision_hash is distinct from p_input->>'expectedRevisionHash' then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 if j.status='cancelled' then return public.sales_initial_send_json(j);end if;
 if j.status not in('queued','claimed') or j.dispatch_before is not null then raise exception 'DISPATCH_ALREADY_RESERVED' using errcode='55000';end if;
 update public.sales_initial_send_jobs set status='cancelled',detail='CANCELLED_BY_OWNER' where id=j.id returning * into j;
 insert into public.sales_initial_send_events(project_id,send_job_id,kind) values(j.project_id,j.id,'cancelled');return public.sales_initial_send_json(j);
end $$;
create function public.sales_initial_send_access(w public.sales_worker_registrations,v jsonb) returns public.sales_initial_send_jobs language plpgsql security invoker set search_path='' as $$
declare j public.sales_initial_send_jobs;
begin
 select * into j from public.sales_initial_send_jobs where id=(v->>'sendJobId')::uuid and project_id=w.project_id and owner_id=w.owner_id for update;
 if not found or w.id is distinct from (v->>'workerId')::uuid or w.project_id is distinct from (v->>'projectId')::uuid or j.worker_id is distinct from w.id or j.claim_id is distinct from (v->>'claimId')::uuid or j.generation is distinct from (v->>'generation')::integer then raise exception 'FENCED' using errcode='40001';end if;
 return j;
end $$;
create function public.sales_initial_send_claim(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_initial_send_jobs;
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array[]::text[]);perform public.sales_stop(w.project_id);
 if w.managed_authorized_at is null or w.desired_state<>'running' then raise exception 'STOPPED' using errcode='55000';end if;
 update public.sales_initial_send_jobs set status='delivery_unknown',detail='DISPATCH_UNCERTAIN' where project_id=w.project_id and status='dispatching' and dispatch_before<=clock_timestamp();
 update public.sales_initial_send_jobs set status='failed_before_send',detail='CLAIM_EXPIRED' where project_id=w.project_id and status='claimed' and lease_until<=clock_timestamp();
 select j0.* into j from public.sales_initial_send_jobs j0 join public.sales_initial_send_policies p on p.id=j0.policy_id and p.worker_id=w.id
 where j0.project_id=w.project_id and j0.owner_id=w.owner_id and j0.status='queued' order by j0.created_at,j0.id for update of j0 skip locked limit 1;
 if not found then return jsonb_build_object('ref',null);end if;
 update public.sales_initial_send_jobs set status='claimed',worker_id=w.id,claim_id=gen_random_uuid(),generation=generation+1,host_generation=w.host_generation,lease_until=clock_timestamp()+interval '180 seconds' where id=j.id returning * into j;
 insert into public.sales_initial_send_events(project_id,send_job_id,kind) values(j.project_id,j.id,'claimed');
 return jsonb_build_object('ref',jsonb_build_object('projectId',j.project_id,'sendJobId',j.id,'workerId',w.id,'claimId',j.claim_id,'generation',j.generation),'snapshot',jsonb_build_object('sealedJson',j.sealed_json,'snapshotSha256',j.snapshot_sha256));
end $$;
create function public.sales_initial_send_heartbeat(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_initial_send_jobs;
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId','workerId','claimId','generation']);j:=public.sales_initial_send_access(w,p_input);
 if j.status<>'claimed' or j.lease_until<=clock_timestamp() or j.host_generation is distinct from w.host_generation or w.desired_state<>'running' then raise exception 'FENCED' using errcode='40001';end if;
 update public.sales_initial_send_jobs set lease_until=clock_timestamp()+interval '180 seconds' where id=j.id;
 update public.sales_worker_registrations set last_seen_at=clock_timestamp() where id=w.id;return jsonb_build_object('ok',true);
end $$;
create function public.sales_initial_send_begin_dispatch(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_initial_send_jobs;p public.sales_initial_send_policies;d public.sales_draft_revisions;
begin
 perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId','workerId','claimId','generation']);
 -- Discover without locks, then acquire the existing editorial run lock BEFORE the worker.
 select j0.* into j from public.sales_initial_send_jobs j0 join public.sales_worker_registrations w0 on w0.project_id=j0.project_id and w0.owner_id=j0.owner_id where w0.token_hash=p_token_hash and j0.id=(p_input->>'sendJobId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 select * into d from public.sales_draft_revisions where id=j.revision_id;
 perform pg_advisory_xact_lock(hashtextextended(j.project_id::text||':sales-contact-eligibility',0));
 perform 1 from public.runs where id=d.run_id for share;perform 1 from public.approvals where id=d.approval_id for share;
 w:=public.sales_worker(p_token_hash);
 p:=public.sales_initial_send_authority(j.project_id,j.owner_id,j.request,j.id);
 j:=public.sales_initial_send_access(w,p_input);
 if j.status<>'claimed' or j.dispatch_before is not null or j.lease_until<=clock_timestamp() or j.host_generation is distinct from w.host_generation
 or w.desired_state<>'running' or w.managed_authorized_at is null or p.id<>j.policy_id or p.version<>j.policy_version or p.worker_id<>w.id or to_jsonb(p) is distinct from j.policy_snapshot
 then raise exception 'FENCED' using errcode='40001';end if;
 update public.sales_initial_send_jobs set status='dispatching',dispatch_before=clock_timestamp()+interval '5 seconds' where id=j.id returning * into j;
 insert into public.sales_initial_send_events(project_id,send_job_id,kind) values(j.project_id,j.id,'dispatching');
 return jsonb_build_object('dispatchBefore',j.dispatch_before,'snapshotSha256',j.snapshot_sha256);
end $$;
create function public.sales_initial_send_complete(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_initial_send_jobs;r jsonb:=p_input->'receipt';s text:=r->>'status';
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId','workerId','claimId','generation','receipt']);
 perform public.sales_mailbox_fields(r,array['status','mimeSha256']);
 if s is null or s not in('smtp_accepted','failed_before_send','delivery_unknown') or r->>'mimeSha256' is null or r->>'mimeSha256' !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 j:=public.sales_initial_send_access(w,p_input);
 if j.receipt is not null then if j.receipt is distinct from r then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return public.sales_initial_send_json(j);end if;
 if (s='failed_before_send' and (j.status<>'claimed' or j.dispatch_before is not null))
 or (s in('smtp_accepted','delivery_unknown') and (j.dispatch_before is null or j.status not in('dispatching','delivery_unknown')))
 then raise exception 'FENCED' using errcode='40001';end if;
 update public.sales_initial_send_jobs set status=s,receipt=r,accepted_at=case when s='smtp_accepted' then clock_timestamp() end,detail=case when s='delivery_unknown' then 'DISPATCH_UNCERTAIN' end where id=j.id returning * into j;
 insert into public.sales_initial_send_events(project_id,send_job_id,kind) values(j.project_id,j.id,s);return public.sales_initial_send_json(j);
end $$;
create function public.sales_initial_send_read_receipt(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_initial_send_jobs;
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId','workerId','claimId','generation']);j:=public.sales_initial_send_access(w,p_input);
 return jsonb_build_object('receipt',j.receipt,'summary',public.sales_initial_send_json(j),'snapshotSha256',j.snapshot_sha256,'dispatchReserved',j.dispatch_before is not null,'expired',j.lease_until<=clock_timestamp());
end $$;
create function public.sales_initial_send_report_uncertain(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_initial_send_jobs;
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','sendJobId','workerId','claimId','generation']);j:=public.sales_initial_send_access(w,p_input);
 if j.receipt is null and j.status in('claimed','dispatching') then
 update public.sales_initial_send_jobs set status=case when dispatch_before is null then 'failed_before_send' else 'delivery_unknown' end,detail='RECOVERY_NO_RETRY' where id=j.id returning * into j;
 insert into public.sales_initial_send_events(project_id,send_job_id,kind) values(j.project_id,j.id,j.status);end if;
 return public.sales_initial_send_json(j);
end $$;
create function public.sales_initial_send_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' or (to_jsonb(new)-array['status','worker_id','claim_id','generation','host_generation','lease_until','dispatch_before','receipt','accepted_at','detail']) is distinct from (to_jsonb(old)-array['status','worker_id','claim_id','generation','host_generation','lease_until','dispatch_before','receipt','accepted_at','detail'])
 then raise exception 'IMMUTABLE_SEND_AUTHORITY' using errcode='42501';end if;return new;
end $$;
create trigger sales_initial_send_authority_immutable before update or delete on public.sales_initial_send_jobs for each row execute function public.sales_initial_send_immutable();

create function public.sales_initial_send_preview(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid;uid uuid;d public.sales_draft_revisions;r public.sales_jobs;j public.sales_initial_send_jobs;p public.sales_initial_send_policies;b public.sales_mailbox_connections;t jsonb;v jsonb;reason text;allowed boolean:=false;gap boolean:=true;begin
 pid:=public.sales_timing_uuid(p_input->'projectId');uid:=public.sales_timing_uuid(p_principal->'userId');perform public.sales_owner(p_principal,pid);perform public.sales_timing_fields(p_input,array['projectId','revisionId']);
 select d0.* into d from public.sales_draft_revisions d0 join public.sales_jobs r0 on r0.id=d0.job_id and r0.project_id=d0.project_id and r0.owner_id=uid where d0.id=(p_input->>'revisionId')::uuid and d0.project_id=pid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 select * into j from public.sales_initial_send_jobs where project_id=pid and owner_id=uid and revision_id=d.id;
 select * into p from public.sales_initial_send_policies where project_id=pid and owner_id=uid and contact_id=d.contact_id and recipient=lower(btrim(d.data->>'toEmail'));
 select * into b from public.sales_mailbox_connections where id=p.mailbox_id and project_id=pid;
 t:=public.sales_timing_evaluate(pid,d.contact_id,clock_timestamp());
 gap:=t->'blockers' ?| array['HISTORY_REVIEW_REQUIRED','SOURCE_GAP'];
 v:=jsonb_build_object('revisionId',d.id,'expectedRevisionHash',d.sha256,'expectedMailboxGeneration',b.generation,'expectedPolicyVersion',p.version,'expectedHistoryRevisionId',t->'historyRevisionId','expectedRuleRevisionId',t->'ruleRevisionId','acceptHistoryGap',true);
 if j.id is null then
  begin perform public.sales_initial_send_authority(pid,uid,v);allowed:=true;
  exception when sqlstate '55000' then reason:='CONTACT_OR_TEXT_REVIEW_REQUIRED';when sqlstate '40001' then reason:='SOURCE_OR_SEND_POLICY_CHANGED';when sqlstate 'P0002' then reason:='SOURCE_UNAVAILABLE';end;
 end if;
 return jsonb_build_object('revisionId',d.id,'revisionHash',d.sha256,'mailboxGeneration',b.generation,'policyVersion',p.version,'historyRevisionId',t->'historyRevisionId','ruleRevisionId',t->'ruleRevisionId','requiresHistoryGapAcceptance',gap,'canConfirm',allowed,'blockedReason',reason,'job',case when j.id is null then null else public.sales_initial_send_json(j) end);
end$$;
-- No active policy is installed. Operator-reviewed activation is a later action.
do $$declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'sales_initial_send_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end$$;

-- Central timing includes both send queues; fresh history cannot erase durable send outcomes.
create or replace function public.sales_timing_evaluate(pid uuid,cid uuid,at timestamptz) returns jsonb language plpgsql stable security invoker set search_path='' as $$
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
 if exists(select from public.sales_initial_send_jobs j where j.project_id=pid and j.recipient=address and j.status in('queued','claimed','dispatching')) then b:=array_append(b,'SEND_PENDING');end if;
 if exists(select from public.sales_initial_send_jobs j where j.project_id=pid and j.recipient=address and j.status='delivery_unknown') then b:=array_append(b,'SEND_UNCERTAIN');uncertain:=true;end if;
 select greatest(accepted,max(j.accepted_at)) into accepted from public.sales_initial_send_jobs j where j.project_id=pid and j.recipient=address and j.status='smtp_accepted';
 latest:=greatest(latest,accepted);
 -- Every stored matching incoming message requires review; headers cannot authorize replying.
 if exists(select from public.sales_inbox_messages m where m.project_id=pid and lower(btrim(coalesce(substring(m.header->>'from' from '<([^<>]+)>'),m.header->>'from')))=address) then b:=array_append(b,'REPLY_REVIEW_REQUIRED');end if;
 if c.data->>'history'<>'not_contacted' or h.data->>'history' is distinct from 'owner_confirmed_none' or latest is not null or exists(select from public.sales_contacts x where x.project_id=pid and lower(btrim(x.data->>'email'))=address and x.data->>'history'='contacted') then b:=array_append(b,'NOT_INITIAL_CONTACT');end if;
 if uncertain or 'DUPLICATE_UNRESOLVED'=any(b) or 'EVENT_CLASSIFICATION_REQUIRED'=any(b) or 'SOURCE_GAP'=any(b) or 'HISTORY_REVIEW_REQUIRED'=any(b) then latest:=null;reminders:=null;end if;
 if latest is not null and r.id is not null then floor_at:=latest+make_interval(secs=>r.min_wait_seconds);if at<floor_at then b:=array_append(b,'WAIT_INTERVAL');end if;end if;
 select coalesce(array_agg(distinct value order by value),'{}') into b from unnest(b) value;
 return jsonb_build_object('contactId',cid,'recipient',address,'contactVersion',c.version,'historyRevisionId',h.id,'ruleRevisionId',r.id,'latestObservedOutboundAt',latest,'reminderCount',reminders,'intervalFloorAt',floor_at,'sourceThrough',through_at,'blockers',to_jsonb(b),'initialPreparationAllowed',cardinality(b)=0);
end$$;
