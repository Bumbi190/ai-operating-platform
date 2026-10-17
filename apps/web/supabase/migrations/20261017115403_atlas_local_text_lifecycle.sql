-- Local-text lifecycle only; canonical runs/approvals remain the activity/read
-- models. No notification sender, provider client or new scheduler is added.
create table public.local_text_incidents(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,device_id uuid not null references public.local_text_devices,
 admission_id uuid references public.local_text_admissions,job_id uuid references public.local_text_jobs on delete set null,
 kind text not null check(kind in ('offline','quality','reconcile','needs_input')),scope_key text not null,
 state text not null default 'open' check(state in ('open','resolved')),version integer not null default 1,
 run_id uuid not null unique references public.runs,approval_id uuid references public.approvals,created_at timestamptz not null default now(),resolved_at timestamptz,acknowledged_at timestamptz
);
create unique index local_text_one_open_incident on public.local_text_incidents(scope_key) where state='open';
create table public.local_text_human_reviews(
 approval_id uuid primary key references public.approvals,job_id uuid not null references public.local_text_jobs,source_stage_id uuid not null references public.local_text_cloud_stages,
 run_id uuid not null unique references public.runs,owner_id uuid not null references auth.users,project_id uuid not null references public.projects,
 input_hash text not null,result_hash text not null,status text not null default 'pending' check(status in ('pending','approved','rejected','expired')),
 version integer not null default 1,expires_at timestamptz not null,created_at timestamptz not null default now(),unique(job_id,input_hash,result_hash)
);
create table public.local_text_retention(
 project_id uuid primary key references public.projects,approved_by uuid not null references auth.users,
 payload_seconds integer not null check(payload_seconds between 1 and 86400),metadata_days integer not null check(metadata_days between 1 and 90),version integer not null default 1,updated_at timestamptz not null default now()
);
alter table public.local_text_jobs add column metadata_expires_at timestamptz;
update public.local_text_jobs set metadata_expires_at=created_at+interval '90 days';
alter table public.local_text_jobs alter column metadata_expires_at set not null;
alter table public.local_text_jobs alter column metadata_expires_at set default now()+interval '90 days';
alter table public.local_text_jobs add check(metadata_expires_at<=created_at+interval '90 days');
alter table public.local_text_incidents enable row level security;
alter table public.local_text_human_reviews enable row level security;
alter table public.local_text_retention enable row level security;
revoke all on public.local_text_incidents,public.local_text_human_reviews,public.local_text_retention from public,anon,authenticated;
grant all on public.local_text_incidents,public.local_text_human_reviews,public.local_text_retention to service_role;
create function public.local_text_job_retention() returns trigger language plpgsql security invoker set search_path='' as $$
declare policy public.local_text_retention;scope_expiry timestamptz;
begin
 select * into policy from public.local_text_retention where project_id=new.project_id;
 select least(a.expires_at,d.expires_at) into scope_expiry from public.local_text_admissions a join public.local_text_devices d on d.id=a.device_id where a.id=new.admission_id;
 new.payload_expires_at=least(new.payload_expires_at,new.created_at+make_interval(secs=>coalesce(policy.payload_seconds,86400)));
 new.metadata_expires_at=least(new.metadata_expires_at,new.created_at+make_interval(days=>coalesce(policy.metadata_days,90)),scope_expiry);
 if tg_op='UPDATE' and new.metadata_expires_at>old.metadata_expires_at then raise check_violation using message='RETENTION_CANNOT_EXTEND';end if;return new;
end$$;
create trigger local_text_job_retention before insert or update on public.local_text_jobs for each row execute function public.local_text_job_retention();
update public.local_text_jobs set payload_expires_at=payload_expires_at,metadata_expires_at=metadata_expires_at;
create function public.local_text_set_retention(p_owner_id uuid,p_project_id uuid,p_payload_seconds integer,p_metadata_days integer) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.projects where id=p_project_id and owner_id=p_owner_id) then return jsonb_build_object('kind','refused','reason','SCOPE_REFUSED');end if;
 if p_payload_seconds not between 1 and 86400 or p_metadata_days not between 1 and 90 or p_payload_seconds is null or p_metadata_days is null then return jsonb_build_object('kind','refused','reason','INVALID_RETENTION');end if;
 insert into public.local_text_retention(project_id,approved_by,payload_seconds,metadata_days) values(p_project_id,p_owner_id,p_payload_seconds,p_metadata_days)
 on conflict(project_id) do update set payload_seconds=least(local_text_retention.payload_seconds,excluded.payload_seconds),metadata_days=least(local_text_retention.metadata_days,excluded.metadata_days),version=local_text_retention.version+1,updated_at=clock_timestamp();
 -- The owner policy decision and all existing job deadlines commit together.
 -- Only timestamps change; physical erasure remains a bounded maintenance unit.
 update public.local_text_jobs set payload_expires_at=payload_expires_at,metadata_expires_at=metadata_expires_at where project_id=p_project_id;
 return jsonb_build_object('kind','applied');
end$$;
create function public.local_text_open_incident(p_project_id uuid,p_device_id uuid,p_admission_id uuid,p_job_id uuid,p_kind text,p_scope text) returns uuid language plpgsql security invoker set search_path='' as $$
declare v uuid=gen_random_uuid();rid uuid=gen_random_uuid();aid uuid;existing uuid;
begin
 if p_kind not in ('offline','quality','reconcile','needs_input') then raise check_violation;end if;
 -- Serialize dedupe before inserting any canonical projection.
 perform pg_advisory_xact_lock(hashtextextended('local_text_incident:'||p_scope,0));
 select id into existing from public.local_text_incidents where scope_key=p_scope and state='open';if found then return existing;end if;
 insert into public.runs(id,project_id,workflow_id,kind,status,input,context,max_attempts,finished_at) values(rid,p_project_id,null,'local_text_incident',case when p_kind='offline' then 'done' else 'awaiting_approval' end,jsonb_build_object('version',1,'incidentId',v,'reasonCode',upper(p_kind)),jsonb_build_object('localText',jsonb_build_object('incidentKind',p_kind,'incidentState','open')),1,clock_timestamp());
 if p_kind<>'offline' then
  aid=gen_random_uuid();insert into public.approvals(id,run_id,project_id,kind,output_key,content,status) values(aid,rid,p_project_id,'local_text_incident','local_text.'||p_kind,jsonb_build_object('incidentId',v,'kind',p_kind,'reasonCode',upper(p_kind),'resolution','acknowledgement_only_no_resume')::text,'pending');
 end if;
 insert into public.local_text_incidents(id,project_id,device_id,admission_id,job_id,kind,scope_key,run_id,approval_id) values(v,p_project_id,p_device_id,p_admission_id,p_job_id,p_kind,p_scope,rid,aid);
 insert into public.local_text_events(project_id,device_id,job_id,event_key,event_type,metadata) values(p_project_id,p_device_id,p_job_id,'incident:'||v::text,'local_text_incident_opened',jsonb_build_object('incidentId',v,'kind',p_kind));
 return v;
end$$;
create function public.local_text_queue_human_review(p_job_id uuid,p_stage_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare j public.local_text_jobs;s public.local_text_cloud_stages;h public.local_text_human_reviews;rid uuid;aid uuid=gen_random_uuid();run_state text;
begin
 select * into s from public.local_text_cloud_stages where id=p_stage_id and job_id=p_job_id;
 if s.id is null then return null;end if;
 -- A caller applying a cloud stage already owns this run lock; others use the
 -- same RUN -> JOB order. No future provider execution is admitted here.
 select status into run_state from public.runs where id=s.run_id for update;
 select * into j from public.local_text_jobs where id=p_job_id for update;
 if j.id is null or j.task is null or j.result is null or j.payload_expires_at<=clock_timestamp() or j.cancel_requested or j.state<>'needs_input'
 or exists(select 1 from public.local_text_cloud_stages where job_id=j.id and state='unknown') or exists(select 1 from public.local_text_attempts where job_id=j.id and state in ('running','reconciling'))
 or not ((s.state='applied' and s.receipt->>'status'='unknown' and run_state='done') or (s.state='applied' and s.reason_code is not null and run_state='awaiting_approval')) then return null;end if;
 select * into h from public.local_text_human_reviews where job_id=j.id and input_hash=j.input_hash and result_hash=j.result_hash;if found then return h.approval_id;end if;
 rid=s.run_id;
 if run_state<>'awaiting_approval' then
  rid=gen_random_uuid();insert into public.runs(id,project_id,workflow_id,kind,status,input,context,max_attempts) values(rid,j.project_id,null,'local_text_human_review','awaiting_approval',jsonb_build_object('version',1,'jobId',j.id,'inputHash',j.input_hash,'resultHash',j.result_hash),'{}',1);
 end if;
 insert into public.approvals(id,run_id,project_id,kind,output_key,content,status) values(aid,rid,j.project_id,'local_text_review','local_text.review',jsonb_build_object('jobId',j.id,'inputHash',j.input_hash,'resultHash',j.result_hash,'expiresAt',j.payload_expires_at,'authority','suggestion_only')::text,'pending');
 insert into public.local_text_human_reviews(approval_id,job_id,source_stage_id,run_id,owner_id,project_id,input_hash,result_hash,expires_at) values(aid,j.id,s.id,rid,j.owner_id,j.project_id,j.input_hash,j.result_hash,j.payload_expires_at);
 return aid;
end$$;
create function public.local_text_read_review(p_owner_id uuid,p_approval_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.local_text_human_reviews;j public.local_text_jobs;
begin
 select q.* into h from public.local_text_human_reviews q join public.projects p on p.id=q.project_id where q.approval_id=p_approval_id and q.owner_id=p_owner_id and p.owner_id=p_owner_id;
 select * into j from public.local_text_jobs where id=h.job_id;
 if h.approval_id is null or j.id is null or h.status<>'pending' or h.expires_at<=clock_timestamp() or j.payload_expires_at<=clock_timestamp() or j.task is null or j.result is null or j.cancel_requested or j.state<>'needs_input' or h.input_hash<>j.input_hash or h.result_hash<>j.result_hash
 or not exists(select 1 from public.conversations where id=j.conversation_id and user_id=p_owner_id) or not exists(select 1 from public.runs where id=h.run_id and project_id=h.project_id and status='awaiting_approval' and not cancel_requested) then return null;end if;
 return jsonb_build_object('approvalId',h.approval_id,'jobId',j.id,'projectId',j.project_id,'version',h.version,'inputHash',h.input_hash,'resultHash',h.result_hash,'expiresAt',least(h.expires_at,j.payload_expires_at),'task',j.task,'result',j.result);
end$$;
create function public.local_text_resolve_approval(p_owner_id uuid,p_approval_id uuid,p_decision text,p_expected_version integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.local_text_human_reviews;j public.local_text_jobs;r public.runs;s public.local_text_cloud_stages;v text;receipt jsonb;
begin
 select * into h from public.local_text_human_reviews where approval_id=p_approval_id and owner_id=p_owner_id;
 if not found or not exists(select 1 from public.projects where id=h.project_id and owner_id=p_owner_id) then return jsonb_build_object('kind','refused','reason','SCOPE_REFUSED');end if;
 select * into r from public.runs where id=h.run_id for update;
 select * into j from public.local_text_jobs where id=h.job_id for update;
 select * into h from public.local_text_human_reviews where approval_id=p_approval_id for update;
 if h.expires_at<=clock_timestamp() or j.payload_expires_at<=clock_timestamp() or j.task is null or j.result is null then return jsonb_build_object('kind','refused','reason','PAYLOAD_EXPIRED');end if;
 if p_decision not in ('approve','reject') or p_decision is null then return jsonb_build_object('kind','refused','reason','INVALID_REVIEW_DECISION');end if;
 if h.status=(case when p_decision='approve' then 'approved' else 'rejected' end) and h.version=p_expected_version+1 then return jsonb_build_object('kind','duplicate','value',jsonb_build_object('receipt',public.local_text_receipt(j.id),'task',j.task,'inputHash',j.input_hash));end if;
 if h.status<>'pending' or h.version is distinct from p_expected_version then return jsonb_build_object('kind','refused','reason','STALE_VERSION');end if;
 if r.status<>'awaiting_approval' or r.cancel_requested or j.cancel_requested or j.state<>'needs_input' or h.input_hash<>j.input_hash or h.result_hash<>j.result_hash
 or not exists(select 1 from public.conversations where id=j.conversation_id and user_id=p_owner_id)
 or not exists(select 1 from public.local_text_admissions a join public.local_text_devices d on d.id=a.device_id where a.id=j.admission_id and a.status='active' and a.qualification_status='verified' and a.expires_at>clock_timestamp() and d.status='active' and d.expires_at>clock_timestamp() and j.input_hash=any(a.approved_input_hashes) and public.local_text_evidence_current(a.id,d.id))
 or exists(select 1 from public.local_text_cloud_stages where job_id=j.id and state='unknown') or exists(select 1 from public.local_text_attempts where job_id=j.id and state in ('running','reconciling')) then return jsonb_build_object('kind','refused','reason','REVIEW_BINDING_MISMATCH');end if;
 v=public.resolve_approval(h.approval_id,r.id,j.project_id,case when p_decision='approve' then 'approved' else 'rejected' end,null);
 if v not in ('APPROVED','REJECTED') then return jsonb_build_object('kind','refused','reason','REVIEW_FENCED');end if;
 select * into s from public.local_text_cloud_stages where id=h.source_stage_id;
 receipt=jsonb_build_object('jobId',j.id,'attemptId',coalesce(s.source_attempt_id,s.cloud_task_id),'inputHash',j.input_hash,'resultHash',j.result_hash,'reviewRunId',r.id,'reviewAttemptId',h.approval_id,'reviewerDeployment','human','status',case when p_decision='approve' then 'approved' else 'rejected' end,'reasonCodes',case when p_decision='approve' then '[]'::jsonb else '["HUMAN_REJECTED"]'::jsonb end,'usageRef',null,'createdAt',clock_timestamp(),'approvedBy',p_owner_id);
 insert into public.local_text_reviews(job_id,attempt_id,cloud_attempt_id,input_hash,result_hash,review_run_id,receipt,status) values(j.id,s.source_attempt_id,s.cloud_task_id,j.input_hash,j.result_hash,r.id,receipt,case when p_decision='approve' then 'approved' else 'rejected' end);
 update public.local_text_human_reviews set status=case when p_decision='approve' then 'approved' else 'rejected' end,version=version+1 where approval_id=h.approval_id;
 update public.local_text_jobs set state=case when p_decision='approve' then 'succeeded' else 'needs_input' end,review_status=case when p_decision='approve' then 'approved' else 'rejected' end,reason_code=case when p_decision='approve' then null else 'HUMAN_REVIEW_REJECTED' end,updated_at=clock_timestamp() where id=j.id;
 return jsonb_build_object('kind','applied','value',jsonb_build_object('receipt',public.local_text_receipt(j.id),'task',j.task,'inputHash',j.input_hash));
end$$;
-- One won unit per transaction prevents maintenance from retaining a DEVICE
-- lock and later waiting for RUN, the inverse of cancellation/physical spend.
-- The server driver repeats this bounded operation (up to100), each RPC commits.
create function public.local_text_maintain(p_limit integer default 1) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.local_text_admissions;d public.local_text_devices;i public.local_text_incidents;j public.local_text_jobs;s public.local_text_cloud_stages;v uuid;rejects integer;
begin
 if p_limit is null or p_limit<1 or p_limit>100 then raise check_violation;end if;
 for a in select * from public.local_text_admissions where status='active' order by id limit 100 loop
  select count(*) filter(where x.quality_reject) into rejects from (
   select (lr.status='rejected' and lr.receipt->'reasonCodes' ?| array['UNSUPPORTED_FACT','INJECTION_FOLLOWED','WRONG_CLASSIFICATION','OMITTED_KEY_FACT','INVALID_EXTRACTION','UNSAFE_TRANSFORM']) as quality_reject from public.local_text_reviews lr join public.local_text_jobs q on q.id=lr.job_id join public.local_text_attempts attempt on attempt.id=lr.attempt_id and attempt.job_id=q.id and attempt.admission_id=a.id and attempt.model_digest=a.model_digest and attempt.state='completed' join public.runs r on r.id=lr.review_run_id
   join public.cost_events ce on ce.id=nullif(lr.receipt->>'usageRef','')::uuid and ce.run_id=r.id and ce.project_id=q.project_id and ce.provider='openai' and ce.operation='local_text.review' and ce.model=lr.receipt->>'reviewerDeployment'
   where q.admission_id=a.id and q.task_kind=a.task_kind and lr.attempt_id is not null and lr.status in ('approved','rejected','unknown') and r.status='done' and not r.cancel_requested
   and lr.receipt->>'status'=lr.status and lr.receipt->>'inputHash'=lr.input_hash and lr.receipt->>'resultHash'=lr.result_hash
   order by lr.created_at desc,lr.id desc limit 20
  ) x;
  if rejects>=3 then
   perform public.local_text_cancel_cloud_runs(a.approved_by,a.project_id,a.device_id,a.id);
   perform 1 from public.local_text_devices where id=a.device_id for update;
   perform 1 from public.local_text_admissions where id=a.id and status='active' for update;if not found then continue;end if;
   update public.local_text_admissions set status='paused',version=version+1 where id=a.id;
   update public.local_text_jobs set state='needs_input',reason_code='QUALITY_PAUSED',updated_at=clock_timestamp() where admission_id=a.id and state='queued';
   perform public.local_text_open_incident(a.project_id,a.device_id,a.id,null,'quality','quality:'||a.deployment_id::text||':'||a.task_kind);
   return jsonb_build_object('processed',1);
  end if;
 end loop;
 for a in select q.* from public.local_text_admissions q join public.local_text_devices node on node.id=q.device_id
 where q.status='active' and q.expires_at>clock_timestamp() and node.status='active' and node.expires_at>clock_timestamp() and coalesce(node.last_heartbeat_at,node.created_at)<clock_timestamp()-interval '90 seconds'
 and not exists(select 1 from public.local_text_incidents x where x.scope_key='offline:'||q.project_id::text||':'||q.device_id::text and x.state='open') order by q.id limit 1 loop
  perform public.local_text_open_incident(a.project_id,a.device_id,null,null,'offline','offline:'||a.project_id::text||':'||a.device_id::text);
  return jsonb_build_object('processed',1);
 end loop;
 for i in select x.* from public.local_text_incidents x join public.local_text_devices node on node.id=x.device_id where x.kind='offline' and x.state='open'
 and node.status='active' and node.health_state='ready' and node.expires_at>clock_timestamp() and node.last_heartbeat_at>clock_timestamp()-interval '45 seconds' and node.last_heartbeat_at<=clock_timestamp()
 and node.enrolled_at is not null and node.reported_health->>'lifecycleLock'='clear' and node.reported_health->'gpuAvailable'='true'::jsonb
 and not exists(select 1 from public.local_text_attempts t where t.device_id=node.id and t.state='reconciling')
 and exists(select 1 from public.local_text_admissions q where q.device_id=node.id and q.project_id=x.project_id and q.status='active' and q.qualification_status='verified' and public.local_text_evidence_current(q.id,node.id)) order by x.id limit 1 loop
  perform 1 from public.runs where id=i.run_id for update;
  update public.runs set context=jsonb_build_object('localText',jsonb_build_object('incidentKind','offline','incidentState','resolved')) where id=i.run_id;
  update public.local_text_incidents set state='resolved',version=version+1,resolved_at=clock_timestamp() where id=i.id and state='open';
  if found then
   insert into public.local_text_events(project_id,device_id,event_key,event_type,metadata) values(i.project_id,i.device_id,'recovery:'||i.id::text,'local_text_incident_resolved',jsonb_build_object('incidentId',i.id));
   return jsonb_build_object('processed',1);
  end if;
 end loop;
 for j in select q.* from public.local_text_jobs q where q.state='needs_input' and q.task is not null and q.result is not null and q.payload_expires_at>clock_timestamp()
 and not exists(select 1 from public.local_text_human_reviews h where h.job_id=q.id and h.input_hash=q.input_hash and h.result_hash=q.result_hash)
 and exists(select 1 from public.local_text_cloud_stages stage where stage.job_id=q.id and stage.state='applied' and (stage.reason_code is not null or stage.receipt->>'status'='unknown')) order by q.id limit 1 loop
  select * into s from public.local_text_cloud_stages where job_id=j.id and state='applied' and (reason_code is not null or receipt->>'status'='unknown') order by created_at desc limit 1;
  v=public.local_text_queue_human_review(j.id,s.id);if v is not null then return jsonb_build_object('processed',1);end if;
 end loop;
 for j in select q.* from public.local_text_jobs q join public.local_text_admissions adm on adm.id=q.admission_id where q.state='reconciling'
 and not exists(select 1 from public.local_text_incidents x where x.scope_key='reconcile:'||q.id::text and x.state='open') order by q.id limit 1 loop
  select * into a from public.local_text_admissions where id=j.admission_id;
  perform public.local_text_open_incident(j.project_id,a.device_id,a.id,j.id,'reconcile','reconcile:'||j.id::text);
  return jsonb_build_object('processed',1);
 end loop;
 return jsonb_build_object('processed',0);
end$$;
revoke all on function public.local_text_job_retention(),public.local_text_set_retention(uuid,uuid,integer,integer),public.local_text_open_incident(uuid,uuid,uuid,uuid,text,text),public.local_text_queue_human_review(uuid,uuid),public.local_text_read_review(uuid,uuid),public.local_text_resolve_approval(uuid,uuid,text,integer),public.local_text_maintain(integer) from public,anon,authenticated;
grant execute on function public.local_text_set_retention(uuid,uuid,integer,integer),public.local_text_open_incident(uuid,uuid,uuid,uuid,text,text),public.local_text_queue_human_review(uuid,uuid),public.local_text_read_review(uuid,uuid),public.local_text_resolve_approval(uuid,uuid,text,integer),public.local_text_maintain(integer) to service_role;

create or replace function public.local_text_cloud_snapshot(p_run_id uuid,p_claim_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.runs;s public.local_text_cloud_stages;j public.local_text_jobs;
begin
 select * into r from public.runs where id=p_run_id;
 select * into s from public.local_text_cloud_stages where run_id=p_run_id;
 select * into j from public.local_text_jobs where id=s.job_id;
 if r.id is null or s.id is null or j.id is null or r.kind is distinct from 'local_text_cloud' or r.workflow_id is not null or r.workflow_instance_id is not null or r.project_id is distinct from j.project_id or r.claim_id is distinct from p_claim_id or r.status<>'running' or r.cancel_requested or r.lease_until is null or r.lease_until<=clock_timestamp()
 or r.input is distinct from jsonb_build_object('version',1,'jobId',j.id,'stageId',s.id,'stage',s.stage,'attemptId',coalesce(s.source_attempt_id,s.cloud_task_id),'inputHash',s.input_hash,'resultHash',s.result_hash)
 or not exists(select 1 from public.projects p join public.conversations c on c.id=j.conversation_id where p.id=j.project_id and p.owner_id=j.owner_id and c.user_id=j.owner_id)
 then return jsonb_build_object('kind','refused','reason','FENCED');end if;
 if j.task is null or j.payload_expires_at<=clock_timestamp() or j.input_hash<>s.input_hash or (s.stage<>'cloud_task' and j.result_hash is distinct from s.result_hash) then return jsonb_build_object('kind','refused','reason','SOURCE_UNAVAILABLE');end if;
 return jsonb_build_object('kind','applied','value',jsonb_build_object('stageId',s.id,'jobId',j.id,'attemptId',coalesce(s.source_attempt_id,s.cloud_task_id),'stage',s.stage,'state',s.state,'dispatchClaimId',s.dispatch_claim_id,'projectId',j.project_id,'inputHash',s.input_hash,'resultHash',s.result_hash,'task',j.task,'result',j.result,'context',j.context,'receipt',s.receipt,'reasonCode',s.reason_code,'reviewMode',coalesce((select configuration->>'reviewMode' from public.local_text_admissions where id=j.admission_id),'governed_openai')));
end$$;

create or replace function public.local_text_cloud_operation(p_run_id uuid,p_claim_id uuid,p_operation text,p_value jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.runs;s public.local_text_cloud_stages;j public.local_text_jobs;v jsonb=p_value;review jsonb=p_value->'receipt';allowed boolean=false;reserved boolean=false;
begin
 -- Same lock order as canonical run finalization/cancellation: RUN first.
 select * into r from public.runs where id=p_run_id for update;
 select * into s from public.local_text_cloud_stages where run_id=p_run_id;
 perform pg_advisory_xact_lock(hashtextextended('local_text_budget:'||r.project_id::text,0));
 select * into j from public.local_text_jobs where id=s.job_id for update;
 if r.id is null or s.id is null or j.id is null or r.kind is distinct from 'local_text_cloud' or r.project_id<>j.project_id or r.claim_id is distinct from p_claim_id or (r.cancel_requested and p_operation<>'unknown') then return jsonb_build_object('kind','refused','reason','FENCED');end if;
 select * into s from public.local_text_cloud_stages where id=s.id for update;
 if p_operation='apply' and s.state='applied' then return jsonb_build_object('kind','duplicate','value',public.local_text_receipt(j.id));end if;
 if p_operation='unknown' and r.status='unknown' and s.state in ('dispatching','response_ready') and s.dispatch_claim_id=p_claim_id then
  update public.local_text_cloud_stages set state='unknown',reason_code='CLOUD_DISPATCH_UNKNOWN',updated_at=clock_timestamp() where id=s.id;
  update public.local_text_jobs set state='reconciling',reason_code='CLOUD_DISPATCH_UNKNOWN',updated_at=clock_timestamp() where id=j.id;
  return jsonb_build_object('kind','applied','value',null);
 end if;
 if p_operation='dispatch' and r.status='running' and s.state='pending' and r.lease_until>clock_timestamp() and j.task is not null and j.payload_expires_at>clock_timestamp() then
  if (public.local_text_cloud_snapshot(r.id,p_claim_id)->>'kind') is distinct from 'applied' or p_value->>'deployment' is distinct from 'gpt-5.4-mini-2026-03-17' or coalesce(p_value->>'qualificationHash','') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('kind','refused','reason','PROFILE_UNVERIFIED');end if;
  if not public.local_text_reserve_cloud(j.id,p_value->>'qualificationHash') then return jsonb_build_object('kind','refused','reason','BUDGET_UNVERIFIED');end if;
  update public.local_text_cloud_stages set state='dispatching',dispatch_claim_id=p_claim_id,profile=p_value,updated_at=clock_timestamp() where id=s.id;
  return jsonb_build_object('kind','applied','value',jsonb_build_object('budgetReserved',true));
 elsif p_operation='human' and r.status='running' and s.state in ('pending','dispatching') and coalesce(v->>'reasonCode','') ~ '^[A-Z][A-Z0-9_]{1,63}$' then
  update public.local_text_cloud_stages set state='human_ready',dispatch_claim_id=p_claim_id,reason_code=v->>'reasonCode',updated_at=clock_timestamp() where id=s.id;
  return jsonb_build_object('kind','applied','value',null);
 elsif p_operation='response' and r.status='running' and s.state='dispatching' and s.dispatch_claim_id=p_claim_id and j.task is not null and j.payload_expires_at>clock_timestamp() then
  if s.stage='cloud_task' then
   if (v-array['receipt','result'])<>'{}' or (review-array['jobId','runId','claimId','inputHash','resultHash','usageRef','status'])<>'{}' or review->>'jobId' is distinct from j.id::text or review->>'runId' is distinct from r.id::text or review->>'claimId' is distinct from p_claim_id::text or review->>'inputHash' is distinct from j.input_hash or coalesce(review->>'status','') not in ('completed','invalid')
   or not exists(select 1 from public.cost_events ce where ce.id=(review->>'usageRef')::uuid and ce.run_id=r.id and ce.project_id=j.project_id and ce.provider='openai' and ce.model=s.profile->>'deployment' and ce.operation='local_text.task') then return jsonb_build_object('kind','refused','reason','TASK_BINDING_MISMATCH');end if;
   if review->>'status'='completed' and (coalesce(review->>'resultHash','') !~ '^[a-f0-9]{64}$' or jsonb_typeof(v->'result') is distinct from 'object') then return jsonb_build_object('kind','refused','reason','TASK_BINDING_MISMATCH');end if;
   update public.local_text_cloud_stages set state='response_ready',receipt=review,raw_result=case when review->>'status'='completed' then v->'result' else null end,updated_at=clock_timestamp() where id=s.id;
   return jsonb_build_object('kind','applied','value',null);
  end if;
  if review->>'jobId' is distinct from j.id::text or review->>'attemptId' is distinct from coalesce(s.source_attempt_id,s.cloud_task_id)::text or review->>'reviewRunId' is distinct from r.id::text or review->>'reviewAttemptId' is distinct from p_claim_id::text
  or review->>'inputHash' is distinct from s.input_hash or review->>'resultHash' is distinct from s.result_hash or review->>'reviewerDeployment' is distinct from s.profile->>'deployment' or coalesce(review->>'status','') not in ('approved','rejected','unknown')
  or (review-array['jobId','attemptId','inputHash','resultHash','reviewRunId','reviewAttemptId','reviewerDeployment','status','reasonCodes','usageRef','createdAt'])<>'{}' or review->>'createdAt' is null
  or jsonb_typeof(review->'reasonCodes') is distinct from 'array' or not exists(select 1 from public.cost_events ce where ce.id=(review->>'usageRef')::uuid and ce.run_id=r.id and ce.project_id=j.project_id and ce.provider='openai' and ce.model=s.profile->>'deployment' and ce.operation='local_text.review') then return jsonb_build_object('kind','refused','reason','REVIEW_BINDING_MISMATCH');end if;
  if jsonb_array_length(review->'reasonCodes')>6 or (review->>'status'='approved' and jsonb_array_length(review->'reasonCodes')<>0) or (review->>'status'<>'approved' and jsonb_array_length(review->'reasonCodes')=0)
  or exists(select 1 from jsonb_array_elements_text(review->'reasonCodes') x where x not in ('UNSUPPORTED_FACT','INJECTION_FOLLOWED','WRONG_CLASSIFICATION','OMITTED_KEY_FACT','INVALID_EXTRACTION','UNSAFE_TRANSFORM','REVIEW_UNAVAILABLE','AUTHORITY_UNAVAILABLE','REVIEW_NOT_ADMITTED'))
  then return jsonb_build_object('kind','refused','reason','INVALID_REVIEW_RECEIPT');end if;
  update public.local_text_cloud_stages set state='response_ready',receipt=review,updated_at=clock_timestamp() where id=s.id;
  return jsonb_build_object('kind','applied','value',null);
 elsif p_operation='apply' and s.dispatch_claim_id=p_claim_id and ((s.state='response_ready' and r.status='done') or (s.state='human_ready' and r.status='awaiting_approval')) then
  if s.state='human_ready' then update public.local_text_jobs set state='needs_input',reason_code=s.reason_code,updated_at=clock_timestamp() where id=j.id;
  elsif s.stage='cloud_task' then
   if s.receipt->>'status'='completed' and j.task is not null and j.payload_expires_at>clock_timestamp() then
    update public.local_text_jobs set state='reviewing',result=s.raw_result,result_hash=s.receipt->>'resultHash',review_status='pending',reason_code=null,updated_at=clock_timestamp() where id=j.id;
   else update public.local_text_jobs set state='needs_input',reason_code='CLOUD_TASK_INVALID',updated_at=clock_timestamp() where id=j.id;end if;
  else
   if s.receipt->>'inputHash' is distinct from j.input_hash or s.receipt->>'resultHash' is distinct from j.result_hash or j.task is null or j.payload_expires_at<=clock_timestamp() then return jsonb_build_object('kind','refused','reason','SOURCE_UNAVAILABLE');end if;
   insert into public.local_text_reviews(job_id,attempt_id,cloud_attempt_id,input_hash,result_hash,review_run_id,receipt,status) values(j.id,s.source_attempt_id,s.cloud_task_id,j.input_hash,j.result_hash,r.id,s.receipt,s.receipt->>'status');
   update public.local_text_jobs set state=case s.receipt->>'status' when 'approved' then 'succeeded' when 'rejected' then case when s.stage='cloud_review' then 'needs_input' else 'escalation_pending' end else 'needs_input' end,
    review_status=s.receipt->>'status',reason_code=case s.receipt->>'status' when 'approved' then null when 'rejected' then case when s.stage='cloud_review' then 'CLOUD_REVIEW_REJECTED' else 'LOCAL_REVIEW_REJECTED' end else 'REVIEW_UNAVAILABLE' end,updated_at=clock_timestamp() where id=j.id;
  end if;
  update public.local_text_cloud_stages set state='applied',updated_at=clock_timestamp() where id=s.id;
  if s.stage='cloud_task' and s.receipt->>'status'='completed' then perform public.local_text_enqueue_cloud(j.id,s.id,'cloud_review',j.input_hash,s.receipt->>'resultHash');end if;
  if (select state in ('succeeded','needs_input','failed','cancelled') from public.local_text_jobs where id=j.id) then update public.local_text_cloud_reservations set held_usd=0,released_at=clock_timestamp() where job_id=j.id;end if;
  if (select state='needs_input' from public.local_text_jobs where id=j.id) then perform public.local_text_queue_human_review(j.id,s.id);end if;
  return jsonb_build_object('kind','applied','value',public.local_text_receipt(j.id));
 end if;
 return jsonb_build_object('kind','refused','reason','STAGE_FENCED');
exception when invalid_text_representation or invalid_datetime_format or numeric_value_out_of_range then return jsonb_build_object('kind','refused','reason','INVALID_CLOUD_OPERATION');end$$;

create or replace function public.local_text_advance(p_job_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.local_text_jobs;v jsonb;
begin
 select * into j from public.local_text_jobs where id=p_job_id for update;
 if not found then return jsonb_build_object('kind','refused','reason','NOT_FOUND');end if;
 if j.state='escalation_pending' and exists(select 1 from public.local_text_admissions where id=j.admission_id and configuration->>'reviewMode'='human') then
  update public.local_text_jobs set state='needs_input',reason_code='HUMAN_MODE_LOCAL_FAILED',updated_at=clock_timestamp() where id=j.id;
 elsif j.state='escalation_pending' and j.task is not null and j.payload_expires_at>clock_timestamp() and not j.cancel_requested then
  v=public.local_text_enqueue_cloud(j.id,j.attempt_id,'cloud_task',j.input_hash,null);
  if v->>'kind'='refused' then return v;end if;
 end if;
 return jsonb_build_object('kind','applied','value',jsonb_build_object('receipt',public.local_text_receipt(j.id),'task',j.task,'inputHash',j.input_hash));
end$$;
-- An explicit human-review admission enables local-only inference without any
-- paid role grant. Placement still permits the server control/review plane.
create function public.local_text_human_selection_context(p_owner_id uuid,p_project_id uuid,p_conversation_id uuid,p_input_hash text,p_kind text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.local_text_admissions;d public.local_text_devices;candidates jsonb='[]';classification text;cap numeric=0.25;daily numeric=5;deadline timestamptz=clock_timestamp()+interval '15 minutes';
begin
 if not exists(select 1 from public.projects where id=p_project_id and owner_id=p_owner_id) or not exists(select 1 from public.conversations where id=p_conversation_id and user_id=p_owner_id) then return jsonb_build_object('kind','refused','reason','SCOPE_REFUSED');end if;
 for a in select * from public.local_text_admissions where project_id=p_project_id and task_kind=p_kind and p_input_hash=any(approved_input_hashes) and status='active' and qualification_status='verified' and expires_at>clock_timestamp() and configuration->>'reviewMode'='human' and approved_by=p_owner_id order by data_class,id limit 100 loop
  if classification is not null and classification<>a.data_class then continue;end if;classification=a.data_class;
  select * into d from public.local_text_devices where id=a.device_id and owner_id=p_owner_id;if not found then continue;end if;
  candidates=candidates||jsonb_build_array(jsonb_build_object('qualification',a.configuration->'qualification','evidenceHash',a.evidence_hash,
   'deployment',jsonb_build_object('id',a.deployment_id,'deviceId',d.id,'ownerId',d.owner_id,'status',d.status,'expiresAt',d.expires_at,'healthAt',d.last_heartbeat_at,'healthState',d.health_state,'lifecycleLock',d.reported_health->>'lifecycleLock','gpuAvailable',d.reported_health->'gpuAvailable','runtimeVersion',d.reported_health->>'runtimeVersion','runtimeHash',d.reported_health->>'runtimeHash','adapterHash',d.reported_health->>'adapterHash','configurationHash',d.reported_health->>'configurationHash','modelDigests',coalesce((select jsonb_agg(x->'modelDigest') from jsonb_array_elements(d.reported_health->'models') x),'[]'),'warmDigest',d.current_model_digest),
   'admission',jsonb_build_object('reviewMode','human','id',a.id,'projectId',a.project_id,'deviceId',a.device_id,'deploymentId',a.deployment_id,'taskKind',a.task_kind,'status',a.status,'qualificationStatus',a.qualification_status,'evidenceHash',a.evidence_hash,'modelDigest',a.model_digest,'dataClass',a.data_class,'placement',a.configuration->>'placement','policyVersion',a.policy_version,'approvedInputHashes',a.approved_input_hashes,'expiresAt',a.expires_at,'jobCostCapUsd',(a.configuration->>'jobCostCapUsd')::numeric,'dailyCostCapUsd',(a.configuration->>'dailyCostCapUsd')::numeric)));
  cap=least(cap,(a.configuration->>'jobCostCapUsd')::numeric);daily=least(daily,(a.configuration->>'dailyCostCapUsd')::numeric);deadline=least(deadline,a.expires_at);
 end loop;
 if jsonb_array_length(candidates)=0 then return jsonb_build_object('kind','absent');end if;
 return jsonb_build_object('kind','applied','value',jsonb_build_object('candidates',candidates,'context',jsonb_build_object('userId',p_owner_id,'projectId',p_project_id,'conversationId',p_conversation_id,'dataClass',classification,'placement','cloud_control_review_allowed','policyVersion','local_assist_v1','deadlineAt',deadline,'jobCostCapUsd',cap,'dailyCostCapUsd',daily,'humanReview',jsonb_build_object('authorized',true,'ownerId',p_owner_id))));
end$$;
create function public.local_text_review_mode_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin if new.configuration ? 'reviewMode' and coalesce(new.configuration->>'reviewMode','') not in ('human','governed_openai') then raise check_violation using message='INVALID_REVIEW_MODE';end if;return new;end$$;
create trigger local_text_review_mode_guard before insert on public.local_text_admissions for each row execute function public.local_text_review_mode_guard();
-- Expire raw payloads regardless of job outcome. At metadata expiry, remove
-- operational lineage, preserving canonical financial/run tombstones only.
create function public.local_text_purge(p_limit integer default 100) returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate public.local_text_jobs;j public.local_text_jobs;rid uuid;payloads integer=0;metadata integer=0;ret public.local_text_retention;changed integer;incident public.local_text_incidents;grant_row public.local_text_cloud_authorizations;admission public.local_text_admissions;device public.local_text_devices;
begin
 if p_limit is null or p_limit<1 or p_limit>100 then raise check_violation;end if;
 -- Select without JOB locks; every unit takes its RUN locks before JOB.
 for candidate in select q.* from public.local_text_jobs q left join public.local_text_retention policy on policy.project_id=q.project_id
 where (q.task is not null or q.result is not null) and least(q.payload_expires_at,q.created_at+make_interval(secs=>coalesce(policy.payload_seconds,86400)))<=clock_timestamp()
 order by q.payload_expires_at,q.id limit 1 loop
  for rid in select run_id from public.local_text_cloud_stages where job_id=candidate.id union select run_id from public.local_text_human_reviews where job_id=candidate.id order by run_id loop
   perform public.request_run_cancel(rid,candidate.project_id,candidate.owner_id::text,'LOCAL_TEXT_PAYLOAD_EXPIRED');
  end loop;
  select * into j from public.local_text_jobs where id=candidate.id for update;
  update public.local_text_jobs set payload_expires_at=payload_expires_at where id=j.id; -- retention trigger may shorten it
  select * into j from public.local_text_jobs where id=candidate.id;
  if j.payload_expires_at<=clock_timestamp() and (j.task is not null or j.result is not null) then
   update public.local_text_jobs set task=null,result=null,state=case when state in ('running','reconciling') then 'reconciling' when state in ('queued','claimed','reviewing','escalation_pending') then 'needs_input' else state end,reason_code='PAYLOAD_EXPIRED',updated_at=clock_timestamp() where id=j.id;
   update public.local_text_attempts set result=null where job_id=j.id;
   update public.local_text_cloud_stages set raw_result=null where job_id=j.id;
   update public.local_text_reviews set raw_payload=null where job_id=j.id;
   update public.local_text_human_reviews set status='expired',version=version+1 where job_id=j.id and status='pending';
   update public.approvals set content='{"reasonCode":"PAYLOAD_EXPIRED","authority":"none"}' where id in(select approval_id from public.local_text_human_reviews where job_id=j.id);
   payloads=payloads+1;
  end if;
 end loop;
 -- Separate purge invocation below handles metadata only when no raw unit was
 -- locked above, avoiding RUN->JOB->another RUN lock inversions across jobs.
 if payloads>0 then return jsonb_build_object('payloadsDeleted',payloads,'metadataDeleted',0);end if;
 for candidate in select q.* from public.local_text_jobs q left join public.local_text_retention policy on policy.project_id=q.project_id where least(q.metadata_expires_at,q.created_at+make_interval(days=>coalesce(policy.metadata_days,90)))<=clock_timestamp() order by q.metadata_expires_at,q.id limit 1 loop
  for rid in select run_id from public.local_text_cloud_stages where job_id=candidate.id union select run_id from public.local_text_human_reviews where job_id=candidate.id order by run_id loop
   perform public.request_run_cancel(rid,candidate.project_id,candidate.owner_id::text,'LOCAL_TEXT_METADATA_EXPIRED');
   update public.runs set input='{}',context='{}' where id=rid;
  end loop;
  perform 1 from public.local_text_jobs where id=candidate.id for update;
  update public.approvals set content='{"reasonCode":"METADATA_EXPIRED","authority":"none"}' where id in(select approval_id from public.local_text_human_reviews where job_id=candidate.id);
  delete from public.local_text_human_reviews where job_id=candidate.id;
  delete from public.local_text_reviews where job_id=candidate.id;
  delete from public.local_text_cloud_reservations where job_id=candidate.id;
  delete from public.local_text_cloud_stages where job_id=candidate.id;
  delete from public.local_text_attempts where job_id=candidate.id;
  delete from public.local_text_events where job_id=candidate.id;
  delete from public.local_text_selections where job_id=candidate.id;
  delete from public.local_text_jobs where id=candidate.id;
  metadata=metadata+1;
 end loop;
 if metadata>0 then return jsonb_build_object('payloadsDeleted',0,'metadataDeleted',metadata);end if;
 select x.* into incident from public.local_text_incidents x join public.local_text_devices d on d.id=x.device_id left join public.local_text_retention policy on policy.project_id=x.project_id
 where least(x.created_at+make_interval(days=>coalesce(policy.metadata_days,90)),d.expires_at)<=clock_timestamp() order by x.created_at limit 1;
 if found then
  perform public.request_run_cancel(incident.run_id,incident.project_id,'local_text_retention','LOCAL_TEXT_METADATA_EXPIRED');
  perform 1 from public.runs where id=incident.run_id for update;
  update public.runs set input='{}',context='{}' where id=incident.run_id;
  update public.approvals set content='{"reasonCode":"METADATA_EXPIRED","authority":"none"}' where id=incident.approval_id;
  delete from public.local_text_events e where e.metadata->>'incidentId'=incident.id::text;
  delete from public.local_text_incidents where id=incident.id;
  return jsonb_build_object('payloadsDeleted',0,'metadataDeleted',1);
 end if;
 select * into grant_row from public.local_text_cloud_authorizations g where g.expires_at<=clock_timestamp() and not exists(select 1 from public.local_text_cloud_reservations held where held.authorization_id=g.id) order by g.expires_at limit 1;
 if found then delete from public.local_text_cloud_authorizations where id=grant_row.id;return jsonb_build_object('payloadsDeleted',0,'metadataDeleted',1);end if;
 select * into admission from public.local_text_admissions a where a.expires_at<=clock_timestamp() and not exists(select 1 from public.local_text_jobs q where q.admission_id=a.id) and not exists(select 1 from public.local_text_incidents x where x.admission_id=a.id) and not exists(select 1 from public.local_text_cloud_authorizations g where g.admission_id=a.id) order by a.expires_at limit 1;
 if found then delete from public.local_text_admissions where id=admission.id;return jsonb_build_object('payloadsDeleted',0,'metadataDeleted',1);end if;
 select * into device from public.local_text_devices d where d.expires_at<=clock_timestamp() and not exists(select 1 from public.local_text_admissions a where a.device_id=d.id) and not exists(select 1 from public.local_text_jobs q where q.device_id=d.id) and not exists(select 1 from public.local_text_incidents x where x.device_id=d.id) order by d.expires_at limit 1;
 if found then
  delete from public.local_text_request_nonces where device_id=device.id;
  delete from public.local_text_events where device_id=device.id;
  delete from public.local_text_devices where id=device.id;
  return jsonb_build_object('payloadsDeleted',0,'metadataDeleted',1);
 end if;
 delete from public.local_text_events where created_at<=clock_timestamp()-interval '90 days' and id in(select id from public.local_text_events where created_at<=clock_timestamp()-interval '90 days' limit 100);
 delete from public.local_text_request_nonces where (device_id,nonce) in(select device_id,nonce from public.local_text_request_nonces where created_at<=clock_timestamp()-interval '2 minutes' order by created_at limit 1000);
 return jsonb_build_object('payloadsDeleted',payloads,'metadataDeleted',metadata);
end$$;
revoke all on function public.local_text_human_selection_context(uuid,uuid,uuid,text,text),public.local_text_review_mode_guard(),public.local_text_purge(integer) from public,anon,authenticated;
grant execute on function public.local_text_human_selection_context(uuid,uuid,uuid,text,text),public.local_text_purge(integer) to service_role;

create or replace function public.local_text_cloud_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='runs' then
  if old.kind='local_text_incident' and new.kind=old.kind and new.id=old.id and new.project_id=old.project_id and new.input='{}'::jsonb and new.context='{}'::jsonb
  and exists(select 1 from public.local_text_incidents x join public.local_text_devices d on d.id=x.device_id left join public.local_text_retention policy on policy.project_id=x.project_id where x.run_id=old.id and least(x.created_at+make_interval(days=>coalesce(policy.metadata_days,90)),d.expires_at)<=clock_timestamp()) then return new;end if;
  if new.input='{}'::jsonb and new.context='{}'::jsonb and row(new.id,new.project_id,new.workflow_id,new.workflow_instance_id,new.kind,new.max_attempts) is not distinct from row(old.id,old.project_id,old.workflow_id,old.workflow_instance_id,old.kind,old.max_attempts)
  and exists(select 1 from public.local_text_jobs q left join public.local_text_retention policy on policy.project_id=q.project_id where least(q.metadata_expires_at,q.created_at+make_interval(days=>coalesce(policy.metadata_days,90)))<=clock_timestamp()
  and (exists(select 1 from public.local_text_cloud_stages stage where stage.job_id=q.id and stage.run_id=old.id) or exists(select 1 from public.local_text_human_reviews h where h.job_id=q.id and h.run_id=old.id))) then return new;end if;
  if (new.kind in ('local_text_cloud','local_text_human_review','local_text_incident') or old.kind in ('local_text_cloud','local_text_human_review','local_text_incident')) and row(new.id,new.project_id,new.workflow_id,new.workflow_instance_id,new.kind,new.input,new.max_attempts)
  is distinct from row(old.id,old.project_id,old.workflow_id,old.workflow_instance_id,old.kind,old.input,old.max_attempts) then raise check_violation using message='IMMUTABLE_LOCAL_TEXT_RUN';end if;
 else
  if row(new.id,new.job_id,new.source_attempt_id,new.cloud_task_id,new.run_id,new.stage,new.input_hash,new.result_hash,new.created_at) is distinct from row(old.id,old.job_id,old.source_attempt_id,old.cloud_task_id,old.run_id,old.stage,old.input_hash,old.result_hash,old.created_at)
  or (old.profile is not null and new.profile is distinct from old.profile) or (old.receipt is not null and new.receipt is distinct from old.receipt) then raise check_violation using message='IMMUTABLE_LOCAL_TEXT_STAGE';end if;
 end if;return new;
end$$;
create function public.local_text_read_incident(p_owner_id uuid,p_approval_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',i.id,'approvalId',i.approval_id,'kind',i.kind,'state',i.state,'version',i.version,'acknowledged',i.acknowledged_at is not null,'resumed',false) from public.local_text_incidents i join public.projects p on p.id=i.project_id where i.approval_id=p_approval_id and p.owner_id=p_owner_id;
$$;
create function public.local_text_ack_incident(p_owner_id uuid,p_approval_id uuid,p_expected_version integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare i public.local_text_incidents;v text;
begin
 select x.* into i from public.local_text_incidents x join public.projects p on p.id=x.project_id where x.approval_id=p_approval_id and p.owner_id=p_owner_id;
 if i.id is null then return jsonb_build_object('kind','refused','reason','SCOPE_REFUSED');end if;
 perform 1 from public.runs where id=i.run_id for update;
 select * into i from public.local_text_incidents where id=i.id for update;
 if i.acknowledged_at is not null and i.version=p_expected_version+1 then return jsonb_build_object('kind','duplicate','value',jsonb_build_object('acknowledged',true,'resumed',false));end if;
 if i.version is distinct from p_expected_version then return jsonb_build_object('kind','refused','reason','STALE_VERSION');end if;
 v=public.resolve_approval(i.approval_id,i.run_id,i.project_id,'approved',null);
 if v<>'APPROVED' then return jsonb_build_object('kind','refused','reason','REVIEW_FENCED');end if;
 update public.local_text_incidents set acknowledged_at=clock_timestamp(),version=version+1 where id=i.id;
 return jsonb_build_object('kind','applied','value',jsonb_build_object('acknowledged',true,'resumed',false));
end$$;
revoke all on function public.local_text_read_incident(uuid,uuid),public.local_text_ack_incident(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.local_text_read_incident(uuid,uuid),public.local_text_ack_incident(uuid,uuid,integer) to service_role;

create function public.local_text_human_review_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if row(new.approval_id,new.job_id,new.source_stage_id,new.run_id,new.owner_id,new.project_id,new.input_hash,new.result_hash,new.created_at) is distinct from row(old.approval_id,old.job_id,old.source_stage_id,old.run_id,old.owner_id,old.project_id,old.input_hash,old.result_hash,old.created_at)
 or new.expires_at>old.expires_at or new.version<old.version or (old.status<>'pending' and new.status<>old.status) then raise check_violation using message='IMMUTABLE_HUMAN_REVIEW';end if;return new;
end$$;
create trigger local_text_human_review_immutable before update on public.local_text_human_reviews for each row execute function public.local_text_human_review_immutable();
revoke all on function public.local_text_human_review_immutable() from public,anon,authenticated;
