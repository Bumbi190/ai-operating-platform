-- B3: explicitly requested reply drafts only. No SMTP, automatic text selection or send authority.
create table public.sales_reply_jobs (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),owner_id uuid not null,
 message_id uuid not null,request_key uuid not null,request jsonb not null,snapshot jsonb not null,
 status text not null default 'queued' check(status in('queued','running','needs_input','awaiting_review','failed','reconciling','cancelled')),
 worker_id uuid,claim_id uuid,generation integer not null default 0,host_generation integer,lease_until timestamptz,
 attempts integer not null default 0 check(attempts between 0 and 10),detail text,completion_hash text,completion_receipt jsonb,
 created_at timestamptz not null default clock_timestamp(),unique(project_id,id),unique(project_id,request_key),
 foreign key(project_id,message_id) references public.sales_inbox_messages(project_id,id)
);
create index sales_reply_message on public.sales_reply_jobs(project_id,message_id);
create index sales_reply_queue on public.sales_reply_jobs(project_id,status,created_at);
create table public.sales_reply_attempts (
 id uuid primary key,project_id uuid not null,job_id uuid not null,claim_id uuid not null,generation integer not null,
 status text not null default 'reserved' check(status in('reserved','completed','uncertain')),dispatch_before timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 foreign key(project_id,job_id) references public.sales_reply_jobs(project_id,id)
);
create index sales_reply_attempt_job on public.sales_reply_attempts(project_id,job_id);
create table public.sales_reply_draft_revisions (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,job_id uuid not null,data jsonb not null,sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 run_id uuid references public.runs(id),approval_id uuid references public.approvals(id),is_current boolean not null default true,created_at timestamptz not null default clock_timestamp(),
 foreign key(project_id,job_id) references public.sales_reply_jobs(project_id,id)
);
create index sales_reply_revision_job on public.sales_reply_draft_revisions(project_id,job_id);
create index sales_reply_revision_run on public.sales_reply_draft_revisions(run_id);
create index sales_reply_revision_approval on public.sales_reply_draft_revisions(approval_id);
create unique index sales_reply_current_revision on public.sales_reply_draft_revisions(job_id) where is_current;
alter table public.sales_reply_jobs enable row level security;
alter table public.sales_reply_attempts enable row level security;
alter table public.sales_reply_draft_revisions enable row level security;
revoke all on public.sales_reply_jobs,public.sales_reply_attempts,public.sales_reply_draft_revisions from public,anon,authenticated,service_role;
grant select,insert,update on public.sales_reply_jobs,public.sales_reply_attempts,public.sales_reply_draft_revisions to service_role;

create function public.sales_reply_snapshot(pid uuid,uid uuid,v jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.sales_inbox_messages;b public.sales_inbox_messages;c public.sales_contacts;o public.sales_offer_revisions;i public.sales_inbox_configs;mb public.sales_mailbox_connections;
begin
 select * into m from public.sales_inbox_messages where project_id=pid and owner_id=uid and id=(v->>'messageId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 select * into mb from public.sales_mailbox_connections where project_id=pid and id=m.mailbox_id and owner_id=uid;
 perform 1 from public.sales_worker_registrations w where w.project_id=pid and w.owner_id=uid and w.id=mb.worker_id and w.revoked_at is null and w.managed_authorized_at is not null and w.desired_state='running' for share;
 if not found then raise exception 'REPLY_INPUT_REQUIRED' using errcode='55000';end if;
 select * into mb from public.sales_mailbox_connections where project_id=pid and id=m.mailbox_id and owner_id=uid for share;
 select * into i from public.sales_inbox_configs where project_id=pid and mailbox_id=m.mailbox_id and owner_id=uid for share;
 select * into m from public.sales_inbox_messages where project_id=pid and owner_id=uid and id=(v->>'messageId')::uuid for share;
 select * into c from public.sales_contacts where project_id=pid and id=(v->>'contactId')::uuid for share;
 select * into o from public.sales_offer_revisions where project_id=pid and id=(v->>'offerRevisionId')::uuid for share;
 select * into b from public.sales_inbox_messages where project_id=pid and mailbox_id=m.mailbox_id and owner_id=uid and id=coalesce(m.canonical_id,m.id) for share;
 if i.mailbox_id is null or mb.id is null or c.id is null or o.id is null or b.id is null or m.version is distinct from (v->>'messageVersion')::integer or c.version is distinct from (v->>'contactVersion')::integer or m.contact_id is distinct from c.id or m.contact_version is distinct from c.version
 or i.state<>'enabled' or i.mailbox_generation<>mb.generation or mb.status<>'authenticated' or not m.text_selected or b.text_state<>'complete' or b.body_text is null or b.content_sha256 is null
 or not exists(select from public.sales_inbox_occurrences where mailbox_id=m.mailbox_id and uid_validity=i.uid_validity and message_id=b.id)
 or c.data->>'confirmed' is distinct from 'true' or c.data->>'excluded' is distinct from 'false' or c.data->>'suppressed' is distinct from 'false' or c.data->>'history' not in('contacted','not_contacted')
 or c.data->>'history' is null or lower(c.data->>'email') is distinct from lower(m.header->>'from') or lower(o.data->>'senderEmail') is distinct from lower(mb.email) or o.data->>'confirmed' is distinct from 'true' or c.data->>'pilotMonths' is distinct from o.data->>'freeMonths'
 or exists(select from public.sales_contacts x where x.project_id=pid and lower(x.data->>'email')=lower(c.data->>'email') and x.data->>'suppressed'='true') then raise exception 'REPLY_INPUT_REQUIRED' using errcode='55000';end if;
 return jsonb_build_object('mailboxId',m.mailbox_id,'mailboxGeneration',mb.generation,'inboxConfigVersion',i.version,'messageId',m.id,'messageVersion',m.version,'canonicalMessageId',b.id,'canonicalVersion',b.version,'contentSha256',b.content_sha256,'header',m.header,'text',b.body_text,'contact',c.data||jsonb_build_object('id',c.id,'version',c.version),'offer',o.data||jsonb_build_object('id',o.id));
end $$;
create function public.sales_reply_source_current(j public.sales_reply_jobs) returns boolean language plpgsql security invoker set search_path='' as $$
begin return public.sales_reply_snapshot(j.project_id,j.owner_id,j.request)=j.snapshot;exception when sqlstate '55000' or sqlstate 'P0002' then return false;end $$;
create function public.sales_reply_assert_source(j public.sales_reply_jobs) returns void language plpgsql security invoker set search_path='' as $$
begin perform public.sales_stop(j.project_id);if not public.sales_reply_source_current(j) then raise exception 'SOURCE_CHANGED' using errcode='40001';end if;end $$;
create function public.sales_reply_newer(j public.sales_reply_jobs) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select from public.sales_inbox_messages n where n.project_id=j.project_id and n.owner_id=j.owner_id and n.mailbox_id=(j.snapshot->>'mailboxId')::uuid and n.id<>j.message_id and n.created_at>j.created_at and lower(n.header->>'from')=lower(j.snapshot->'header'->>'from'))
$$;
create function public.sales_reply_job_json(j public.sales_reply_jobs) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('id',j.id,'projectId',j.project_id,'messageId',j.message_id,'status',case when j.status='running' and j.lease_until<=clock_timestamp() then 'reconciling' else j.status end,'attempts',j.attempts,'detail',j.detail,'createdAt',j.created_at,'sourceCurrent',public.sales_reply_source_current(j),'newerIncoming',public.sales_reply_newer(j),'sendingEnabled',false,'source',jsonb_build_object('subject',j.snapshot->'header'->>'subject','companyName',j.snapshot->'contact'->>'companyName','branchName',j.snapshot->'contact'->>'branchName','senderEmail',j.snapshot->'offer'->>'senderEmail','toEmail',j.snapshot->'contact'->>'email','offerText',j.snapshot->'offer'->>'offerText'))
$$;
create function public.sales_reply_prepare(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;j public.sales_reply_jobs;s jsonb;k text;
begin
 perform public.sales_owner(p_principal,pid);perform public.sales_mailbox_fields(p_input,array['projectId','conversationId','messageId','messageVersion','contactId','contactVersion','offerRevisionId','idempotencyKey']);
 foreach k in array array['projectId','conversationId','messageId','contactId','offerRevisionId','idempotencyKey'] loop if p_input->>k is null or p_input->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_BODY' using errcode='22023';end if;end loop;
 if (p_input->>'messageVersion')::integer is null or (p_input->>'contactVersion')::integer is null or (p_input->>'messageVersion')::integer<1 or (p_input->>'contactVersion')::integer<1 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 perform public.sales_validate_conversation(p_principal,jsonb_build_object('projectId',pid,'conversationId',p_input->>'conversationId'));
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':reply:'||(p_input->>'idempotencyKey'),0));
 select * into j from public.sales_reply_jobs where project_id=pid and request_key=(p_input->>'idempotencyKey')::uuid;
 if found then if j.request<>p_input then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return public.sales_reply_job_json(j);end if;
 perform public.sales_stop(pid);s:=public.sales_reply_snapshot(pid,(p_principal->>'userId')::uuid,p_input);
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':reply-message:'||(p_input->>'messageId'),0));
 if exists(select from public.sales_reply_jobs where project_id=pid and message_id=(p_input->>'messageId')::uuid and status not in('cancelled','failed')) then raise exception 'REPLY_ALREADY_EXISTS' using errcode='55000';end if;
 insert into public.sales_reply_jobs(project_id,owner_id,message_id,request_key,request,snapshot) values(pid,(p_principal->>'userId')::uuid,(p_input->>'messageId')::uuid,(p_input->>'idempotencyKey')::uuid,p_input,s) returning * into j;
 return public.sales_reply_job_json(j);
end $$;
create function public.sales_reply_claim(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_reply_jobs;
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array[]::text[]);perform public.sales_stop(w.project_id);
 if w.managed_authorized_at is null or w.desired_state<>'running' then raise exception 'STOPPED' using errcode='55000';end if;
 update public.sales_reply_jobs set status='reconciling',detail='EXECUTION_UNCERTAIN' where project_id=w.project_id and status='running' and lease_until<=clock_timestamp();
 select * into j from public.sales_reply_jobs where project_id=w.project_id and owner_id=w.owner_id and status='queued' order by created_at,id for update skip locked limit 1;
 if not found then return jsonb_build_object('ref',null);end if;
 if not public.sales_reply_source_current(j) then update public.sales_reply_jobs set status='needs_input',detail='SOURCE_CHANGED' where id=j.id;return jsonb_build_object('ref',null);end if;
 update public.sales_reply_jobs set status='running',worker_id=w.id,claim_id=gen_random_uuid(),generation=generation+1,host_generation=w.host_generation,lease_until=clock_timestamp()+interval '180 seconds' where id=j.id returning * into j;
 return jsonb_build_object('ref',jsonb_build_object('projectId',j.project_id,'jobId',j.id,'workerId',w.id,'claimId',j.claim_id,'generation',j.generation),'snapshot',j.snapshot);
end $$;
create function public.sales_reply_access(w public.sales_worker_registrations,v jsonb,need_running boolean default true) returns public.sales_reply_jobs language plpgsql security invoker set search_path='' as $$
declare j public.sales_reply_jobs;
begin
 select * into j from public.sales_reply_jobs where project_id=w.project_id and owner_id=w.owner_id and id=(v->>'jobId')::uuid for update;
 if not found or w.project_id is distinct from (v->>'projectId')::uuid or w.id is distinct from (v->>'workerId')::uuid or j.worker_id is distinct from w.id or j.claim_id is distinct from (v->>'claimId')::uuid or j.generation is distinct from (v->>'generation')::integer then raise exception 'FENCED' using errcode='40001';end if;
 if need_running then
  if j.status<>'running' or j.lease_until<=clock_timestamp() or j.host_generation is distinct from w.host_generation or w.desired_state<>'running' or w.managed_authorized_at is null then raise exception 'FENCED' using errcode='40001';end if;
  perform public.sales_reply_assert_source(j);
 end if;
 return j;
end $$;
create function public.sales_reply_heartbeat(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_reply_jobs;
begin w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','jobId','workerId','claimId','generation']);j:=public.sales_reply_access(w,p_input);
 update public.sales_reply_jobs set lease_until=clock_timestamp()+interval '180 seconds' where id=j.id;update public.sales_worker_registrations set last_seen_at=clock_timestamp() where id=w.id;return jsonb_build_object('ok',true);end $$;
create function public.sales_reply_reserve_attempt(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_reply_jobs;a public.sales_reply_attempts;aid uuid:=(p_input->>'attemptId')::uuid;
begin w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','jobId','workerId','claimId','generation','attemptId']);j:=public.sales_reply_access(w,p_input);
 if aid is null then raise exception 'INVALID_BODY' using errcode='22023';end if;
 select * into a from public.sales_reply_attempts where id=aid;
 if found then if a.job_id<>j.id or a.claim_id<>j.claim_id or a.generation<>j.generation then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return jsonb_build_object('attemptId',a.id,'dispatchBefore',a.dispatch_before);end if;
 if j.attempts>=10 then raise exception 'ATTEMPT_LIMIT' using errcode='55000';end if;
 insert into public.sales_reply_attempts(id,project_id,job_id,claim_id,generation,dispatch_before) values(aid,j.project_id,j.id,j.claim_id,j.generation,clock_timestamp()+interval '5 seconds') returning * into a;
 update public.sales_reply_jobs set attempts=attempts+1 where id=j.id;return jsonb_build_object('attemptId',a.id,'dispatchBefore',a.dispatch_before);
end $$;
create function public.sales_reply_validate_draft(d jsonb,mid uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform public.sales_mailbox_fields(d,array['subject','body','evidenceIds','questions']);
 if jsonb_typeof(d->'subject') is distinct from 'string' or length(btrim(d->>'subject')) not between 1 and 90 or (d->>'subject') ~ E'[\r\n]' or jsonb_typeof(d->'body') is distinct from 'string' or length(btrim(d->>'body')) not between 1 and 2000 or d->>'body' ~* '<\/?[a-z][^>]*>' or d->>'body' ~ '\{\{?\s*\w+\s*\}\}?' or d->'evidenceIds' is distinct from jsonb_build_array(mid::text) or jsonb_typeof(d->'questions') is distinct from 'array' then raise exception 'INVALID_BODY' using errcode='22023';end if;
 if jsonb_array_length(d->'questions')>10 or exists(select from jsonb_array_elements(d->'questions') q where jsonb_typeof(q)<>'string' or length(btrim(q#>>'{}')) not between 1 and 500) then raise exception 'INVALID_BODY' using errcode='22023';end if;
end $$;
create function public.sales_reply_draft_json(d public.sales_reply_draft_revisions) returns jsonb language sql security invoker set search_path='' as $$
 select d.data||jsonb_build_object('id',d.id,'projectId',d.project_id,'jobId',d.job_id,'sha256',d.sha256,'current',d.is_current,'runId',d.run_id,'approvalId',d.approval_id,'createdAt',d.created_at,'status',coalesce((select a.status from public.approvals a where a.id=d.approval_id),'needs_input'))
$$;
create function public.sales_reply_insert_draft(j public.sales_reply_jobs,d jsonb) returns public.sales_reply_draft_revisions language plpgsql security invoker set search_path='' as $$
declare r public.sales_reply_draft_revisions;rid uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();did uuid:=gen_random_uuid();h text;
begin
 perform public.sales_reply_validate_draft(d,j.message_id);h:=encode(extensions.digest(convert_to(jsonb_build_array(j.snapshot,d)::text,'UTF8'),'sha256'),'hex');
 if jsonb_array_length(d->'questions')=0 then
 insert into public.runs(id,project_id,workflow_id,kind,status,input,context,policy_class) values(rid,j.project_id,null,'sales.email.reply.v1','awaiting_approval',jsonb_build_object('salesReplyDraftId',did),'{}','non_destructive');
 insert into public.approvals(id,project_id,run_id,status,kind,output_key,content) values(aid,j.project_id,rid,'pending','sales_reply_review','sales_reply_draft',jsonb_build_object('replyRevisionId',did,'sha256',h,'review','Granska i projektets privata svarsvy','sendingEnabled',false)::text);
 else rid:=null;aid:=null;end if;
 insert into public.sales_reply_draft_revisions(id,project_id,job_id,data,sha256,run_id,approval_id) values(did,j.project_id,j.id,d,h,rid,aid) returning * into r;return r;
end $$;
create function public.sales_reply_complete(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_reply_jobs;d public.sales_reply_draft_revisions;h text;a uuid:=(p_input->>'attemptId')::uuid;
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','jobId','workerId','claimId','generation','attemptId','draft']);j:=public.sales_reply_access(w,p_input,false);
 h:=encode(extensions.digest(convert_to(jsonb_build_array(a,p_input->'draft')::text,'UTF8'),'sha256'),'hex');
 if j.completion_receipt is not null then if h is distinct from j.completion_hash then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;return j.completion_receipt;end if;
 j:=public.sales_reply_access(w,p_input);
 if not exists(select from public.sales_reply_attempts where id=a and job_id=j.id and claim_id=j.claim_id and generation=j.generation and status='reserved') then raise exception 'ATTEMPT_REQUIRED' using errcode='55000';end if;
 d:=public.sales_reply_insert_draft(j,p_input->'draft');
 update public.sales_reply_attempts set status=case when id=a then 'completed' else 'uncertain' end where job_id=j.id and status='reserved';
 update public.sales_reply_jobs set status=case when jsonb_array_length(d.data->'questions')=0 then 'awaiting_review' else 'needs_input' end,completion_hash=h where id=j.id returning * into j;
 update public.sales_reply_jobs set completion_receipt=public.sales_reply_job_json(j) where id=j.id returning * into j;return j.completion_receipt;
end $$;
create function public.sales_reply_read_receipt(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_reply_jobs;
begin w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','jobId','workerId','claimId','generation']);j:=public.sales_reply_access(w,p_input,false);
 return jsonb_build_object('receipt',j.completion_receipt,'status',j.status,'expired',j.lease_until<=clock_timestamp());end $$;
create function public.sales_reply_report_failure(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_reply_jobs;
begin w:=public.sales_worker(p_token_hash);perform public.sales_mailbox_fields(p_input,array['projectId','jobId','workerId','claimId','generation']);j:=public.sales_reply_access(w,p_input,false);
 if j.completion_receipt is not null then return j.completion_receipt;end if;
 if j.status='running' then update public.sales_reply_jobs set status='reconciling',detail='EXECUTION_UNCERTAIN' where id=j.id returning * into j;update public.sales_reply_attempts set status='uncertain' where job_id=j.id and status='reserved';end if;
 return public.sales_reply_job_json(j);end $$;
create function public.sales_reply_read_job(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.sales_reply_jobs;
begin perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);perform public.sales_mailbox_fields(p_input,array['projectId','jobId']);
 select * into j from public.sales_reply_jobs where id=(p_input->>'jobId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;return public.sales_reply_job_json(j);end $$;
create function public.sales_reply_read_drafts(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;jobs jsonb;drafts jsonb;
begin perform public.sales_owner(p_principal,pid);perform public.sales_mailbox_fields(p_input,array['projectId']);
 select coalesce(jsonb_agg(public.sales_reply_job_json(q) order by q.created_at desc),'[]') into jobs from (select * from public.sales_reply_jobs where project_id=pid and owner_id=(p_principal->>'userId')::uuid order by created_at desc,id desc limit 50) q;
 select coalesce(jsonb_agg(public.sales_reply_draft_json(d) order by d.created_at desc),'[]') into drafts from public.sales_reply_draft_revisions d where d.project_id=pid and d.is_current and exists(select from jsonb_array_elements(jobs) j where j->>'id'=d.job_id::text);
 return jsonb_build_object('jobs',jobs,'drafts',drafts,'sendingEnabled',false);end $$;
-- The generic review queue must enforce the same freshness fence as the reply UI.
create function public.sales_reply_guard_approval() returns trigger language plpgsql security invoker set search_path='' as $$
declare d public.sales_reply_draft_revisions;j public.sales_reply_jobs;
begin
 if new.kind='sales_reply_review' and new.status='approved' then
 select * into d from public.sales_reply_draft_revisions where approval_id=new.id and run_id=new.run_id and project_id=new.project_id;
 if not found or not d.is_current then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 select * into j from public.sales_reply_jobs where id=d.job_id and project_id=d.project_id;
 perform public.sales_reply_assert_source(j);
 if j.status in('cancelled','failed','reconciling') or public.sales_reply_newer(j) or jsonb_array_length(d.data->'questions')>0 then raise exception 'REPLY_REVIEW_REQUIRED' using errcode='55000';end if;
 end if;return new;end $$;
create trigger sales_reply_approval_fence before update of status on public.approvals for each row execute function public.sales_reply_guard_approval();
create function public.sales_reply_review_draft(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.sales_reply_draft_revisions;j public.sales_reply_jobs;result text;
begin
 perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);perform public.sales_mailbox_fields(p_input,array['projectId','revisionId','expectedHash','decision']);
 if p_input->>'decision' is null or p_input->>'decision' not in('approved','rejected') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 select * into d from public.sales_reply_draft_revisions where id=(p_input->>'revisionId')::uuid and project_id=(p_input->>'projectId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if not d.is_current or d.sha256 is distinct from p_input->>'expectedHash' then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 if d.approval_id is null then raise exception 'REPLY_REVIEW_REQUIRED' using errcode='55000';end if;
 result:=public.resolve_approval(d.approval_id,d.run_id,d.project_id,p_input->>'decision',null);
 if result<>upper(p_input->>'decision') then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 return public.sales_reply_draft_json(d);end $$;
create function public.sales_reply_edit_draft(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.sales_reply_draft_revisions;j public.sales_reply_jobs;d jsonb;r public.sales_reply_draft_revisions;
begin
 perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);perform public.sales_mailbox_fields(p_input,array['projectId','revisionId','expectedHash','subject','body','questions']);
 select * into old from public.sales_reply_draft_revisions where id=(p_input->>'revisionId')::uuid and project_id=(p_input->>'projectId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 -- Generic resolve_approval locks run then approval; preserve that order here.
 if old.run_id is not null then perform 1 from public.runs where id=old.run_id for update;perform 1 from public.approvals where id=old.approval_id for update;end if;
 select * into j from public.sales_reply_jobs where id=old.job_id and project_id=old.project_id;
 perform public.sales_reply_source_current(j);
 select * into j from public.sales_reply_jobs where id=j.id for update;
 select * into old from public.sales_reply_draft_revisions where id=old.id for update;
 if not old.is_current or old.sha256 is distinct from p_input->>'expectedHash' then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 perform public.sales_reply_assert_source(j);if j.status='cancelled' then raise exception 'FENCED' using errcode='40001';end if;
 d:=jsonb_build_object('subject',p_input->'subject','body',p_input->'body','questions',p_input->'questions','evidenceIds',old.data->'evidenceIds');perform public.sales_reply_validate_draft(d,j.message_id);
 if old.run_id is not null then update public.runs set status='cancelled' where id=old.run_id;update public.approvals set status='returned' where id=old.approval_id;end if;
 update public.sales_reply_draft_revisions set is_current=false where id=old.id;
 r:=public.sales_reply_insert_draft(j,d);update public.sales_reply_jobs set status=case when r.approval_id is null then 'needs_input' else 'awaiting_review' end where id=j.id;
 return public.sales_reply_draft_json(r);end $$;
create function public.sales_reply_cancel_job(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.sales_reply_jobs;d public.sales_reply_draft_revisions;observed_revision uuid;
begin
 perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);perform public.sales_mailbox_fields(p_input,array['projectId','jobId']);
 select * into j from public.sales_reply_jobs where id=(p_input->>'jobId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 select * into d from public.sales_reply_draft_revisions where job_id=j.id and is_current;observed_revision:=d.id;
 if d.run_id is not null then perform 1 from public.runs where id=d.run_id for update;perform 1 from public.approvals where id=d.approval_id for update;end if;
 perform public.sales_reply_source_current(j);
 select * into j from public.sales_reply_jobs where id=j.id for update;
 select * into d from public.sales_reply_draft_revisions where job_id=j.id and is_current for update;
 -- A questions-only edit can create a run while cancellation waits. Retry from
 -- the new revision rather than acquire its run lock after the job lock.
 if d.id is distinct from observed_revision then raise exception 'FENCED' using errcode='40001';end if;
 if d.run_id is not null then update public.runs set status='cancelled' where id=d.run_id;update public.approvals set status='returned' where id=d.approval_id;end if;
 update public.sales_reply_jobs set status='cancelled',detail='CANCELLED_BY_OWNER' where id=j.id returning * into j;return public.sales_reply_job_json(j);end $$;
create function public.sales_reply_immutable_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' or (to_jsonb(new)-'is_current') is distinct from (to_jsonb(old)-'is_current') or (not old.is_current and new.is_current) then raise exception 'IMMUTABLE_REPLY_REVISION' using errcode='42501';end if;return new;end $$;
create trigger sales_reply_revision_immutable before update or delete on public.sales_reply_draft_revisions for each row execute function public.sales_reply_immutable_revision();
-- All B3 RPCs/helpers are server-only SECURITY INVOKER. No default PUBLIC execute.
revoke all on function public.sales_reply_snapshot(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_snapshot(uuid,uuid,jsonb) to service_role;
revoke all on function public.sales_reply_source_current(public.sales_reply_jobs) from public,anon,authenticated;
grant execute on function public.sales_reply_source_current(public.sales_reply_jobs) to service_role;
revoke all on function public.sales_reply_assert_source(public.sales_reply_jobs) from public,anon,authenticated;
grant execute on function public.sales_reply_assert_source(public.sales_reply_jobs) to service_role;
revoke all on function public.sales_reply_newer(public.sales_reply_jobs) from public,anon,authenticated;
grant execute on function public.sales_reply_newer(public.sales_reply_jobs) to service_role;
revoke all on function public.sales_reply_job_json(public.sales_reply_jobs) from public,anon,authenticated;
grant execute on function public.sales_reply_job_json(public.sales_reply_jobs) to service_role;
revoke all on function public.sales_reply_prepare(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_prepare(jsonb,jsonb) to service_role;
revoke all on function public.sales_reply_claim(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_claim(text,jsonb) to service_role;
revoke all on function public.sales_reply_access(public.sales_worker_registrations,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.sales_reply_access(public.sales_worker_registrations,jsonb,boolean) to service_role;
revoke all on function public.sales_reply_heartbeat(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_heartbeat(text,jsonb) to service_role;
revoke all on function public.sales_reply_reserve_attempt(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_reserve_attempt(text,jsonb) to service_role;
revoke all on function public.sales_reply_validate_draft(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.sales_reply_validate_draft(jsonb,uuid) to service_role;
revoke all on function public.sales_reply_draft_json(public.sales_reply_draft_revisions) from public,anon,authenticated;
grant execute on function public.sales_reply_draft_json(public.sales_reply_draft_revisions) to service_role;
revoke all on function public.sales_reply_insert_draft(public.sales_reply_jobs,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_insert_draft(public.sales_reply_jobs,jsonb) to service_role;
revoke all on function public.sales_reply_complete(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_complete(text,jsonb) to service_role;
revoke all on function public.sales_reply_read_receipt(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_read_receipt(text,jsonb) to service_role;
revoke all on function public.sales_reply_report_failure(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_report_failure(text,jsonb) to service_role;
revoke all on function public.sales_reply_read_job(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_read_job(jsonb,jsonb) to service_role;
revoke all on function public.sales_reply_read_drafts(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_read_drafts(jsonb,jsonb) to service_role;
revoke all on function public.sales_reply_guard_approval() from public,anon,authenticated;
grant execute on function public.sales_reply_guard_approval() to service_role;
revoke all on function public.sales_reply_review_draft(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_review_draft(jsonb,jsonb) to service_role;
revoke all on function public.sales_reply_edit_draft(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_edit_draft(jsonb,jsonb) to service_role;
revoke all on function public.sales_reply_cancel_job(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reply_cancel_job(jsonb,jsonb) to service_role;
revoke all on function public.sales_reply_immutable_revision() from public,anon,authenticated;
grant execute on function public.sales_reply_immutable_revision() to service_role;
