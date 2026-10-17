-- Pilot A: draft preparation only. No mail transport, campaign scheduler or send rights.
create table public.sales_contacts (
 id uuid primary key, project_id uuid not null references public.projects(id), version integer not null check(version>0),
 data jsonb not null, created_at timestamptz not null default now(), unique(project_id,id)
);
create table public.sales_offer_revisions (
 id uuid primary key, project_id uuid not null references public.projects(id), data jsonb not null, created_at timestamptz not null default now(),unique(project_id,id)
);
create table public.sales_jobs (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),owner_id uuid not null,
 request_key text not null,request jsonb not null,snapshot jsonb not null,status text not null default 'queued' check(status in('queued','running','needs_input','awaiting_review','failed','reconciling','cancelled')),
 worker_id uuid,claim_id uuid,generation integer not null default 1,lease_until timestamptz,attempts integer not null default 0 check(attempts between 0 and 10),detail text,
 completion_hash text,created_at timestamptz not null default now(),unique(project_id,request_key),unique(project_id,id)
);
create table public.sales_worker_registrations (
 id uuid primary key,project_id uuid not null references public.projects(id),owner_id uuid not null,token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null default now()+interval '24 hours',revoked_at timestamptz,last_seen_at timestamptz,
 capability text not null default 'draft_prepare' check(capability='draft_prepare'),unique(project_id,id)
);
create table public.sales_evidence (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,job_id uuid not null,contact_id uuid not null,data jsonb,question text,
 provenance text not null default 'worker_observed' check(provenance='worker_observed'),
 foreign key(project_id,job_id) references public.sales_jobs(project_id,id),foreign key(project_id,contact_id) references public.sales_contacts(project_id,id),unique(job_id,contact_id)
);
create table public.sales_model_attempts (
 id uuid primary key,project_id uuid not null,job_id uuid not null,contact_id uuid not null,claim_id uuid not null,generation integer not null,
 status text not null default 'reserved' check(status in('reserved','completed','uncertain')),created_at timestamptz not null default now(),
 foreign key(project_id,job_id) references public.sales_jobs(project_id,id),foreign key(project_id,contact_id) references public.sales_contacts(project_id,id)
);
create table public.sales_draft_revisions (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,job_id uuid not null,contact_id uuid not null,data jsonb not null,sha256 text not null,
 run_id uuid references public.runs(id),approval_id uuid references public.approvals(id),is_current boolean not null default true,created_at timestamptz not null default now(),
 foreign key(project_id,job_id) references public.sales_jobs(project_id,id),foreign key(project_id,contact_id) references public.sales_contacts(project_id,id)
);
create unique index sales_one_current_draft on public.sales_draft_revisions(job_id,contact_id) where is_current;
create index sales_job_queue on public.sales_jobs(project_id,status,created_at);
create or replace function public.sales_owner(p jsonb,pid uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.projects where id=pid and owner_id=(p->>'userId')::uuid) or not coalesce(p->'allowedProjectIds' @> jsonb_build_array(pid::text),false) then raise exception 'SALES_NOT_FOUND' using errcode='P0002';end if;
end $$;
create or replace function public.sales_stop(pid uuid) returns void language plpgsql security invoker set search_path='' as $$
declare g boolean;p boolean;
begin
 select automation_paused into g from public.platform_config where id=1 for share;
 select execution_paused into p from public.projects where id=pid for share;
 if g is distinct from false or p is distinct from false then raise exception 'SALES_STOPPED' using errcode='55000';end if;
end $$;
create or replace function public.sales_job_json(j public.sales_jobs) returns jsonb language sql security invoker set search_path='' as $$ select jsonb_build_object('id',j.id,'projectId',j.project_id,'status',j.status,'createdAt',j.created_at,'attempts',j.attempts,'detail',j.detail) $$;
create or replace function public.sales_validate_conversation(p_principal jsonb,p_input jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
begin perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);
 if not exists(select from public.conversations where id=(p_input->>'conversationId')::uuid and user_id=(p_principal->>'userId')::uuid and project_id=(p_input->>'projectId')::uuid) then raise exception 'NOT_FOUND' using errcode='P0002';end if;return true;end $$;
create or replace function public.sales_save_contact(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;cid uuid:=(p_input->>'id')::uuid;c public.sales_contacts;d jsonb;
begin
 perform public.sales_owner(p_principal,pid);
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':sales-contact-eligibility',0));
 select * into c from public.sales_contacts where project_id=pid and id=cid for update;
 if coalesce(c.version,0)<>(p_input->>'expectedVersion')::integer then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 d:=(p_input-'expectedVersion')||jsonb_build_object('id',cid,'projectId',pid,'version',coalesce(c.version,0)+1);
 if length(d->>'companyName') not between 1 and 200 or d->>'history' not in('not_contacted','contacted','unknown') or (d->>'email') ~ E'[\r\n]' or length(d->>'historySource') not between 1 and 2000 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 insert into public.sales_contacts(id,project_id,version,data) values(cid,pid,coalesce(c.version,0)+1,d) on conflict(id) do update set version=excluded.version,data=excluded.data where sales_contacts.project_id=pid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 return d;
end $$;
create or replace function public.sales_save_offer(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;d jsonb;
begin
 perform public.sales_owner(p_principal,pid);
 if coalesce((p_input->>'confirmed')::boolean,false) is not true or (p_input->>'freeMonths')::integer not in(2,6,12) or length(p_input->>'offerText') not between 1 and 2000 then raise exception 'INVALID_BODY' using errcode='22023';end if;
 d:=p_input||jsonb_build_object('createdAt',now());
 insert into public.sales_offer_revisions(id,project_id,data) values((p_input->>'id')::uuid,pid,d);return d;
end $$;
create or replace function public.sales_prepare_job(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;j public.sales_jobs;o jsonb;contacts jsonb;expected integer;
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
 insert into public.sales_jobs(project_id,owner_id,request_key,request,snapshot) values(pid,(p_principal->>'userId')::uuid,p_input->>'idempotencyKey',p_input,jsonb_build_object('contacts',contacts,'offer',o)) returning * into j;
 return public.sales_job_json(j);
end $$;
create or replace function public.sales_enroll_worker(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;
begin
 perform public.sales_owner(p_principal,pid);
 insert into public.sales_worker_registrations(id,project_id,owner_id,token_hash) values((p_input->>'workerId')::uuid,pid,(p_principal->>'userId')::uuid,p_input->>'tokenHash');
 return jsonb_build_object('workerId',p_input->>'workerId','expiresAt',now()+interval '24 hours');
end $$;
create or replace function public.sales_revoke_worker(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);
 update public.sales_worker_registrations set revoked_at=now() where id=(p_input->>'workerId')::uuid and project_id=(p_input->>'projectId')::uuid;
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.sales_worker(p_hash text) returns public.sales_worker_registrations language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;
begin
 select w0.* into w from public.sales_worker_registrations w0 join public.projects p on p.id=w0.project_id and p.owner_id=w0.owner_id where w0.token_hash=p_hash and w0.revoked_at is null and w0.expires_at>clock_timestamp() for update of w0;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;return w;
end $$;
create or replace function public.sales_assert_claim(w public.sales_worker_registrations,v jsonb) returns public.sales_jobs language plpgsql security invoker set search_path='' as $$
declare j public.sales_jobs;
begin
 if w.id<>(v->>'workerId')::uuid or w.project_id<>(v->>'projectId')::uuid then raise exception 'FENCED' using errcode='40001';end if;
 select * into j from public.sales_jobs where id=(v->>'jobId')::uuid and project_id=w.project_id for update;
 if not found or j.worker_id<>w.id or j.claim_id is distinct from (v->>'claimId')::uuid or j.generation<>(v->>'generation')::integer or j.status<>'running' or j.lease_until<=clock_timestamp() then raise exception 'FENCED' using errcode='40001';end if;
 return j;
end $$;
create or replace function public.sales_worker_identity(p_token_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;
begin w:=public.sales_worker(p_token_hash);return jsonb_build_object('projectId',w.project_id,'workerId',w.id);end $$;
-- A project advisory lock serializes mailbox eligibility with operator edits.
create or replace function public.sales_assert_contacts(j public.sales_jobs) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(j.project_id::text||':sales-contact-eligibility',0));
 if exists(select from jsonb_array_elements(j.snapshot->'contacts') old_contact where not exists(select from public.sales_contacts c where c.project_id=j.project_id and c.id=(old_contact->>'id')::uuid and c.version=(old_contact->>'version')::integer and c.data->>'history'='not_contacted' and (c.data->>'confirmed')::boolean is true and (c.data->>'excluded')::boolean is false and (c.data->>'suppressed')::boolean is false)) then raise exception 'CONTACT_CHANGED' using errcode='40001';end if;
 if exists(select from public.sales_contacts c where c.project_id=j.project_id and (c.data->>'history'='contacted' or (c.data->>'suppressed')::boolean is true) and exists(select from jsonb_array_elements(j.snapshot->'contacts') old_contact where lower(old_contact->>'email')=lower(c.data->>'email'))) then raise exception 'MAILBOX_CHANGED' using errcode='40001';end if;
end $$;
-- Operator reads can reconcile expired leases even when no worker can authenticate.
create or replace function public.sales_reconcile_expired(pid uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 with expired as (
  update public.sales_jobs set status='reconciling',detail='Workeranslutningen har upphört. Uppdraget behöver stämmas av.' where project_id=pid and status='running' and lease_until<=clock_timestamp() returning id
 ) update public.sales_model_attempts set status='uncertain' where status='reserved' and job_id in(select id from expired);
end $$;
create or replace function public.sales_claim_job(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_jobs;
begin
 w:=public.sales_worker(p_token_hash);perform public.sales_stop(w.project_id);
 update public.sales_worker_registrations set last_seen_at=now() where id=w.id;
 perform public.sales_reconcile_expired(w.project_id);
 select * into j from public.sales_jobs where project_id=w.project_id and status='queued' order by created_at for update skip locked limit 1;
 if not found then return jsonb_build_object('ref',null);end if;
 perform public.sales_assert_contacts(j);
 update public.sales_jobs set status='running',worker_id=w.id,claim_id=gen_random_uuid(),lease_until=now()+interval '90 seconds' where id=j.id returning * into j;
 return jsonb_build_object('ref',jsonb_build_object('projectId',j.project_id,'jobId',j.id,'workerId',w.id,'claimId',j.claim_id,'generation',j.generation),'snapshot',j.snapshot);
end $$;
create or replace function public.sales_heartbeat(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_jobs;
begin w:=public.sales_worker(p_token_hash);j:=public.sales_assert_claim(w,p_input);perform public.sales_stop(w.project_id);update public.sales_jobs set lease_until=now()+interval '90 seconds' where id=j.id;update public.sales_worker_registrations set last_seen_at=now() where id=w.id;return jsonb_build_object('ok',true);end $$;
create or replace function public.sales_commit_research(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_jobs;c jsonb;e jsonb:=nullif(p_input->'evidence','null'::jsonb);saved public.sales_evidence;
begin
 w:=public.sales_worker(p_token_hash);j:=public.sales_assert_claim(w,p_input);perform public.sales_stop(w.project_id);
 select value into c from jsonb_array_elements(j.snapshot->'contacts') where value->>'id'=p_input->>'contactId';if c is null then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if c->>'websiteUrl' is not null and e is null and coalesce(length(btrim(p_input->>'question')),0)=0 then raise exception 'RESEARCH_QUESTION_REQUIRED' using errcode='22023';end if;
 if e is not null and (e->>'sourceUrl' is distinct from c->>'websiteUrl' or length(e->>'text')>8192) then raise exception 'INVALID_BODY' using errcode='22023';end if;
 insert into public.sales_evidence(project_id,job_id,contact_id,data,question) values(j.project_id,j.id,(c->>'id')::uuid,e,p_input->>'question') on conflict(job_id,contact_id) do nothing;
 select * into saved from public.sales_evidence where job_id=j.id and contact_id=(c->>'id')::uuid;
 if saved.data is distinct from e or saved.question is distinct from (p_input->>'question') then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 return jsonb_build_object('evidenceId',case when saved.data is null then null else saved.id end,'evidence',saved.data,'question',saved.question);
end $$;
create or replace function public.sales_reserve_attempt(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_jobs;a public.sales_model_attempts;
begin
 w:=public.sales_worker(p_token_hash);j:=public.sales_assert_claim(w,p_input);perform public.sales_stop(w.project_id);perform public.sales_assert_contacts(j);
 select * into a from public.sales_model_attempts where id=(p_input->>'attemptId')::uuid;
 if found then if a.job_id<>j.id or a.contact_id<>(p_input->>'contactId')::uuid then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;raise exception 'ATTEMPT_ALREADY_RESERVED' using errcode='40001';end if;
 if j.attempts>=10 then raise exception 'LIMIT_REACHED' using errcode='55000';end if;
 if not exists(select from public.sales_evidence where job_id=j.id and contact_id=(p_input->>'contactId')::uuid) then raise exception 'RESEARCH_REQUIRED' using errcode='55000';end if;
 insert into public.sales_model_attempts(id,project_id,job_id,contact_id,claim_id,generation) values((p_input->>'attemptId')::uuid,j.project_id,j.id,(p_input->>'contactId')::uuid,j.claim_id,j.generation);
 update public.sales_jobs set attempts=attempts+1 where id=j.id;
 return jsonb_build_object('attemptId',p_input->>'attemptId','dispatchBefore',clock_timestamp()+interval '5 seconds');
end $$;
create or replace function public.sales_draft_hash(d jsonb) returns text language sql immutable security invoker set search_path='' as $$
 select encode(extensions.digest(convert_to(jsonb_build_array(d->>'contactId',(d->>'contactVersion')::integer,d->>'offerRevisionId',lower(d->>'senderEmail'),lower(d->>'toEmail'),d->>'subject',d->>'body',coalesce((select jsonb_agg(value order by value) from jsonb_array_elements(d->'evidenceIds')),'[]'::jsonb),d->'questions')::text,'UTF8'),'sha256'),'hex')
$$;
create or replace function public.sales_insert_draft(pid uuid,jid uuid,d jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare rid uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();did uuid:=gen_random_uuid();h text:=public.sales_draft_hash(d);
begin
 if jsonb_array_length(d->'questions')=0 then
 insert into public.runs(id,project_id,workflow_id,kind,status,input,context,policy_class) values(rid,pid,null,'sales.email.draft.v1','awaiting_approval',jsonb_build_object('salesDraftId',did),'{}','non_destructive');
 insert into public.approvals(id,project_id,run_id,status,kind,output_key,content) values(aid,pid,rid,'pending','sales_draft_review','sales_draft',jsonb_build_object('draft',d,'sha256',h,'sendingEnabled',false)::text);
 else rid:=null;aid:=null;end if;
 insert into public.sales_draft_revisions(id,project_id,job_id,contact_id,data,sha256,run_id,approval_id) values(did,pid,jid,(d->>'contactId')::uuid,d,h,rid,aid);return did;
end $$;
create or replace function public.sales_commit_drafts(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_jobs;d jsonb;c jsonb;e uuid;seen uuid[]:='{}';h text;needs boolean:=false;
begin
 w:=public.sales_worker(p_token_hash);select * into j from public.sales_jobs where id=(p_input->>'jobId')::uuid and project_id=w.project_id for update;
 h:=encode(extensions.digest(convert_to((p_input->'drafts')::text,'UTF8'),'sha256'),'hex');
 if j.worker_id=w.id and j.claim_id=(p_input->>'claimId')::uuid and j.generation=(p_input->>'generation')::integer and j.status in('awaiting_review','needs_input') then
 if j.completion_hash=h then return public.sales_job_json(j);end if;raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 j:=public.sales_assert_claim(w,p_input);perform public.sales_stop(w.project_id);perform public.sales_assert_contacts(j);
 if jsonb_array_length(p_input->'drafts')<>jsonb_array_length(j.snapshot->'contacts') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 for d in select value from jsonb_array_elements(p_input->'drafts') loop
 select value into c from jsonb_array_elements(j.snapshot->'contacts') where value->>'id'=d->>'contactId';
 if c is null or (d->>'contactId')::uuid=any(seen) or c->>'version'<>d->>'contactVersion' or j.snapshot->'offer'->>'id'<>d->>'offerRevisionId' or j.snapshot->'offer'->>'senderEmail'<>d->>'senderEmail' or c->>'email'<>d->>'toEmail' then raise exception 'FENCED' using errcode='40001';end if;
 if not exists(select from public.sales_contacts where id=(c->>'id')::uuid and project_id=j.project_id and version=(c->>'version')::integer) then raise exception 'FENCED' using errcode='40001';end if;
 if not exists(select from public.sales_model_attempts where job_id=j.id and contact_id=(c->>'id')::uuid and claim_id=j.claim_id) then raise exception 'ATTEMPT_REQUIRED' using errcode='55000';end if;
 if exists(select from public.sales_evidence source where source.job_id=j.id and source.contact_id=(c->>'id')::uuid and source.question is not null and not coalesce(d->'questions' @> jsonb_build_array(source.question),false)) then raise exception 'RESEARCH_QUESTION_REQUIRED' using errcode='55000';end if;
 if exists(select from public.sales_evidence source where source.job_id=j.id and source.contact_id=(c->>'id')::uuid and source.data is not null and not coalesce(d->'evidenceIds' @> jsonb_build_array(source.id::text),false)) then raise exception 'RESEARCH_EVIDENCE_REQUIRED' using errcode='55000';end if;
 for e in select value::text::uuid from jsonb_array_elements_text(d->'evidenceIds') loop if not exists(select from public.sales_evidence where id=e and job_id=j.id and contact_id=(c->>'id')::uuid and data is not null) then raise exception 'FENCED' using errcode='40001';end if;end loop;
 seen:=array_append(seen,(c->>'id')::uuid);needs:=needs or jsonb_array_length(d->'questions')>0;perform public.sales_insert_draft(j.project_id,j.id,d);
 end loop;
 update public.sales_model_attempts set status='completed' where job_id=j.id and claim_id=j.claim_id;
 update public.sales_jobs set status=case when needs then 'needs_input' else 'awaiting_review' end,completion_hash=h where id=j.id returning * into j;return public.sales_job_json(j);
end $$;
create or replace function public.sales_save_revision(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;old public.sales_draft_revisions;d jsonb:=p_input->'draft';did uuid;
begin
 perform public.sales_owner(p_principal,pid);
 -- Lock the canonical run before its approval; serialize edits on the job first.
 select * into old from public.sales_draft_revisions where id=(p_input->>'revisionId')::uuid and project_id=pid;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 perform 1 from public.sales_jobs where id=old.job_id for update;
 if not exists(select from public.sales_draft_revisions where id=old.id and is_current) then raise exception 'REVISION_CONFLICT' using errcode='23505';end if;
 if (d-'subject'-'body'-'questions')<>(old.data-'subject'-'body'-'questions') then raise exception 'INVALID_BODY' using errcode='22023';end if;
 if old.run_id is not null then perform 1 from public.runs where id=old.run_id for update;perform 1 from public.approvals where id=old.approval_id for update;
 update public.runs set status='cancelled' where id=old.run_id and status='awaiting_approval';update public.approvals set status='returned' where id=old.approval_id and status in('pending','revised','needs_input');end if;
 update public.sales_draft_revisions set is_current=false where id=old.id;did:=public.sales_insert_draft(pid,old.job_id,d);return jsonb_build_object('revisionId',did);
end $$;
create or replace function public.sales_control_job(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.sales_jobs;
begin perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);
 select * into j from public.sales_jobs where id=(p_input->>'jobId')::uuid and project_id=(p_input->>'projectId')::uuid for update;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if j.status in('queued','running','reconciling') then update public.sales_jobs set status='cancelled',detail='Cancelled by operator' where id=j.id returning * into j;end if;return public.sales_job_json(j);end $$;
create or replace function public.sales_report_failure(p_token_hash text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.sales_worker_registrations;j public.sales_jobs;
begin w:=public.sales_worker(p_token_hash);j:=public.sales_assert_claim(w,p_input);
 update public.sales_jobs set status='reconciling',detail='Local execution requires reconciliation' where id=j.id returning * into j;
 update public.sales_model_attempts set status='uncertain' where job_id=j.id and status='reserved';return public.sales_job_json(j);end $$;
create or replace function public.sales_read_job(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.sales_jobs;
begin perform public.sales_owner(p_principal,(p_input->>'projectId')::uuid);perform public.sales_reconcile_expired((p_input->>'projectId')::uuid);select * into j from public.sales_jobs where id=(p_input->>'jobId')::uuid and project_id=(p_input->>'projectId')::uuid;if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;return public.sales_job_json(j);end $$;
create or replace function public.sales_read_workspace(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(p_input->>'projectId')::uuid;slug text;
begin perform public.sales_owner(p_principal,pid);perform public.sales_reconcile_expired(pid);select p.slug into slug from public.projects p where id=pid;
 return jsonb_build_object('projectId',pid,'state','ok','sendingEnabled',false,'workspaceUrl','/projects/'||slug||'/sales',
 'workerState',case when exists(select from public.sales_worker_registrations where project_id=pid and revoked_at is null and expires_at>now() and last_seen_at>now()-interval '90 seconds') then 'connected' else 'not_connected' end,
 'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'contactId',e.contact_id,'source',e.data,'question',e.question,'provenance',e.provenance)) from public.sales_evidence e where e.project_id=pid),'[]'),
 'workers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'expiresAt',expires_at,'lastSeenAt',last_seen_at,'revoked',revoked_at is not null)) from public.sales_worker_registrations where project_id=pid),'[]'),
 'contacts',coalesce((select jsonb_agg(data order by created_at) from public.sales_contacts where project_id=pid),'[]'),
 'offers',coalesce((select jsonb_agg(data order by created_at desc) from public.sales_offer_revisions where project_id=pid),'[]'),
 'jobs',coalesce((select jsonb_agg(public.sales_job_json(j) order by created_at desc) from (select * from public.sales_jobs where project_id=pid order by created_at desc limit 20) j),'[]'),
 'drafts',coalesce((select jsonb_agg(d.data||jsonb_build_object('id',d.id,'projectId',pid,'jobId',d.job_id,'sha256',d.sha256,'approvalId',d.approval_id,'runId',d.run_id,'status',coalesce(a.status,'needs_input'),'current',d.is_current,'createdAt',d.created_at) order by d.created_at desc) from public.sales_draft_revisions d left join public.approvals a on a.id=d.approval_id where d.project_id=pid and d.is_current),'[]'));
end $$;
create or replace function public.sales_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'SALES_IMMUTABLE' using errcode='55000';end if;
 if tg_table_name='sales_draft_revisions' and (to_jsonb(new)-'is_current')=(to_jsonb(old)-'is_current') then return new;end if;
 raise exception 'SALES_IMMUTABLE' using errcode='55000';
end $$;
create trigger sales_offer_immutable before update or delete on public.sales_offer_revisions for each row execute function public.sales_immutable();
create trigger sales_draft_immutable before update or delete on public.sales_draft_revisions for each row execute function public.sales_immutable();
-- Explicit declarations keep the repository security scanner and database aligned.
alter table public.sales_contacts enable row level security;
revoke all on public.sales_contacts from public,anon,authenticated;
grant all on public.sales_contacts to service_role;
grant select on public.sales_contacts to authenticated;
create policy sales_owner_read on public.sales_contacts for select to authenticated using(project_id in(select id from public.projects where owner_id=auth.uid()));
alter table public.sales_offer_revisions enable row level security;
revoke all on public.sales_offer_revisions from public,anon,authenticated;
grant all on public.sales_offer_revisions to service_role;
grant select on public.sales_offer_revisions to authenticated;
create policy sales_owner_read on public.sales_offer_revisions for select to authenticated using(project_id in(select id from public.projects where owner_id=auth.uid()));
alter table public.sales_jobs enable row level security;
revoke all on public.sales_jobs from public,anon,authenticated;
grant all on public.sales_jobs to service_role;
grant select on public.sales_jobs to authenticated;
create policy sales_owner_read on public.sales_jobs for select to authenticated using(project_id in(select id from public.projects where owner_id=auth.uid()));
alter table public.sales_worker_registrations enable row level security;
revoke all on public.sales_worker_registrations from public,anon,authenticated;
grant all on public.sales_worker_registrations to service_role;
alter table public.sales_evidence enable row level security;
revoke all on public.sales_evidence from public,anon,authenticated;
grant all on public.sales_evidence to service_role;
grant select on public.sales_evidence to authenticated;
create policy sales_owner_read on public.sales_evidence for select to authenticated using(project_id in(select id from public.projects where owner_id=auth.uid()));
alter table public.sales_model_attempts enable row level security;
revoke all on public.sales_model_attempts from public,anon,authenticated;
grant all on public.sales_model_attempts to service_role;
grant select on public.sales_model_attempts to authenticated;
create policy sales_owner_read on public.sales_model_attempts for select to authenticated using(project_id in(select id from public.projects where owner_id=auth.uid()));
alter table public.sales_draft_revisions enable row level security;
revoke all on public.sales_draft_revisions from public,anon,authenticated;
grant all on public.sales_draft_revisions to service_role;
grant select on public.sales_draft_revisions to authenticated;
create policy sales_owner_read on public.sales_draft_revisions for select to authenticated using(project_id in(select id from public.projects where owner_id=auth.uid()));
revoke all on function public.sales_owner(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.sales_owner(jsonb,uuid) to service_role;
revoke all on function public.sales_stop(uuid) from public,anon,authenticated;
grant execute on function public.sales_stop(uuid) to service_role;
revoke all on function public.sales_job_json(public.sales_jobs) from public,anon,authenticated;
grant execute on function public.sales_job_json(public.sales_jobs) to service_role;
revoke all on function public.sales_validate_conversation(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_validate_conversation(jsonb,jsonb) to service_role;
revoke all on function public.sales_save_contact(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_save_contact(jsonb,jsonb) to service_role;
revoke all on function public.sales_save_offer(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_save_offer(jsonb,jsonb) to service_role;
revoke all on function public.sales_prepare_job(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_prepare_job(jsonb,jsonb) to service_role;
revoke all on function public.sales_enroll_worker(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_enroll_worker(jsonb,jsonb) to service_role;
revoke all on function public.sales_revoke_worker(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_revoke_worker(jsonb,jsonb) to service_role;
revoke all on function public.sales_worker(text) from public,anon,authenticated;
grant execute on function public.sales_worker(text) to service_role;
revoke all on function public.sales_assert_claim(public.sales_worker_registrations,jsonb) from public,anon,authenticated;
grant execute on function public.sales_assert_claim(public.sales_worker_registrations,jsonb) to service_role;
revoke all on function public.sales_worker_identity(text) from public,anon,authenticated;
grant execute on function public.sales_worker_identity(text) to service_role;
revoke all on function public.sales_assert_contacts(public.sales_jobs) from public,anon,authenticated;
grant execute on function public.sales_assert_contacts(public.sales_jobs) to service_role;
revoke all on function public.sales_reconcile_expired(uuid) from public,anon,authenticated;
grant execute on function public.sales_reconcile_expired(uuid) to service_role;
revoke all on function public.sales_claim_job(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_claim_job(text,jsonb) to service_role;
revoke all on function public.sales_heartbeat(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_heartbeat(text,jsonb) to service_role;
revoke all on function public.sales_commit_research(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_commit_research(text,jsonb) to service_role;
revoke all on function public.sales_reserve_attempt(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_reserve_attempt(text,jsonb) to service_role;
revoke all on function public.sales_draft_hash(jsonb) from public,anon,authenticated;
grant execute on function public.sales_draft_hash(jsonb) to service_role;
revoke all on function public.sales_insert_draft(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sales_insert_draft(uuid,uuid,jsonb) to service_role;
revoke all on function public.sales_commit_drafts(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_commit_drafts(text,jsonb) to service_role;
revoke all on function public.sales_save_revision(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_save_revision(jsonb,jsonb) to service_role;
revoke all on function public.sales_control_job(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_control_job(jsonb,jsonb) to service_role;
revoke all on function public.sales_report_failure(text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_report_failure(text,jsonb) to service_role;
revoke all on function public.sales_read_job(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_read_job(jsonb,jsonb) to service_role;
revoke all on function public.sales_read_workspace(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sales_read_workspace(jsonb,jsonb) to service_role;
revoke all on function public.sales_immutable() from public,anon,authenticated;
grant execute on function public.sales_immutable() to service_role;
