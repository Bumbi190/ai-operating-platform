-- Dedicated local-text authority. No existing broker or provider privileges reused.
create table public.local_text_devices (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 server_origin text not null,key_id uuid not null unique, public_jwk jsonb not null, build_hash text not null check(build_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','active','paused','revoked','lost','retired')),
 counter numeric(20,0) not null default 0 check(counter>=0 and counter<=18446744073709551615),
 pairing_project_id uuid references public.projects(id),public_key_fingerprint text,version integer not null default 1,
 enrolled_at timestamptz,revoked_at timestamptz,health_state text not null default 'unknown' check(health_state in ('unknown','ready','blocked','stopped')),
 reported_health jsonb not null default '{}',last_heartbeat_at timestamptz, current_model_digest text, created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '90 days', check(expires_at<=created_at+interval '90 days')
);
create table public.local_text_admissions (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),
 device_id uuid not null references public.local_text_devices(id), deployment_id uuid not null,
 task_kind text not null check(task_kind in ('classify','extract','summarize')),
 model_digest text not null check(model_digest ~ '^sha256:[a-f0-9]{64}$'),
 evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),policy_version text not null,
 qualification_status text not null default 'unqualified' check(qualification_status in ('unqualified','verified','revoked')),
 status text not null default 'pending' check(status in ('pending','active','paused','revoked')),
 data_class text not null check(data_class in ('synthetic','approved_cloud_text')),
 approved_input_hashes text[] not null default '{}', configuration jsonb not null default '{}',
 created_at timestamptz not null default now(),expires_at timestamptz not null,
 check(expires_at>created_at and expires_at<=created_at+interval '90 days')
);
create table public.local_text_jobs (
 id uuid primary key,project_id uuid not null references public.projects(id),owner_id uuid not null references auth.users(id),
 conversation_id uuid not null references public.conversations(id),idempotency_key uuid not null,
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),schema_version integer not null default 1 check(schema_version=1),
 task_kind text not null check(task_kind in ('classify','extract','summarize')),task jsonb,
 context jsonb not null,admission_id uuid not null references public.local_text_admissions(id),selection_id uuid,
 state text not null default 'queued' check(state in ('queued','claimed','running','reviewing','escalation_pending','needs_input','succeeded','failed','cancelled','reconciling')),
 reason_code text,result jsonb,result_hash text,review_status text not null default 'pending' check(review_status in ('pending','approved','rejected','unknown')),
 device_id uuid references public.local_text_devices(id),attempt_id uuid,claim_id uuid,fence bigint not null default 0,
 lease_until timestamptz,cancel_requested boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),expires_at timestamptz not null,
 payload_expires_at timestamptz not null, check(payload_expires_at<=expires_at),
 unique(project_id,conversation_id,idempotency_key),check(expires_at<=created_at+interval '24 hours')
);
create table public.local_text_selections (
 id uuid primary key,job_id uuid not null references public.local_text_jobs(id),decision jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.local_text_jobs add constraint local_text_selection_fk foreign key(selection_id) references public.local_text_selections(id) deferrable initially deferred;
create table public.local_text_attempts (
 id uuid primary key,job_id uuid not null references public.local_text_jobs(id),device_id uuid not null references public.local_text_devices(id),
 claim_id uuid not null unique,fence bigint not null,input_hash text not null,model_digest text not null,admission_id uuid not null references public.local_text_admissions(id),
 state text not null check(state in ('claimed','running','completed','failed','cancelled','reconciling','expired')),
 started_at timestamptz,finished_at timestamptz,result jsonb,result_hash text,usage jsonb not null default '{}',
 created_at timestamptz not null default now(),unique(job_id,fence)
);
create unique index local_text_one_device_flight on public.local_text_attempts(device_id) where state in ('claimed','running','reconciling');
create unique index local_text_one_started_local on public.local_text_attempts(job_id) where started_at is not null;
create table public.local_text_reviews (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.local_text_jobs(id),attempt_id uuid not null references public.local_text_attempts(id),
 input_hash text not null,result_hash text not null,review_run_id uuid not null unique,receipt jsonb not null,
 status text not null check(status in ('approved','rejected','unknown')),raw_payload jsonb,created_at timestamptz not null default now()
);
create table public.local_text_events (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),job_id uuid references public.local_text_jobs(id),
 device_id uuid references public.local_text_devices(id),event_key text not null unique,event_type text not null,
 metadata jsonb not null default '{}',created_at timestamptz not null default now()
);
create table public.local_text_request_nonces (
 device_id uuid not null references public.local_text_devices(id),nonce uuid not null,counter numeric(20,0) not null,
 created_at timestamptz not null default now(),primary key(device_id,nonce),unique(device_id,counter)
);
-- Service-only RPCs are invokers: they do not acquire postgres/BYPASSRLS authority.
create function public.local_text_receipt(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',j.id,'projectId',j.project_id,'conversationId',j.conversation_id,'state',j.state,
 'reasonCode',case when j.payload_expires_at<=clock_timestamp() then 'PAYLOAD_EXPIRED' else j.reason_code end,'result',case when j.state='succeeded' and j.review_status='approved' and j.expires_at>now() and j.payload_expires_at>clock_timestamp() then j.result else null end,
 'reviewStatus',j.review_status,'selectionId',j.selection_id,'expiresAt',to_char(j.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'updatedAt',to_char(j.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) from public.local_text_jobs j where j.id=p_id;
$$;
create function public.local_text_eligible(p_project uuid,p_owner uuid,p_admission uuid,p_kind text,p_input_hash text) returns boolean
language plpgsql volatile security invoker set search_path='' as $$
declare s record;
begin
 select * into s from public.stop_state(p_project);
 if not found or s.global_paused is distinct from false or s.project_found is distinct from true or s.project_paused is distinct from false then return false;end if;
 return exists(select 1 from public.local_text_admissions a join public.local_text_devices d on d.id=a.device_id join public.projects p on p.id=a.project_id
 where a.id=p_admission and a.project_id=p_project and p.owner_id=p_owner and d.owner_id=p_owner and a.task_kind=p_kind
 and a.status='active' and a.qualification_status='verified' and a.expires_at>clock_timestamp() and d.status='active'
 and d.expires_at>clock_timestamp() and d.health_state='ready' and d.last_heartbeat_at>clock_timestamp()-interval '45 seconds'
 and p_input_hash=any(a.approved_input_hashes));
end$$;
create function public.local_text_enqueue(p_context jsonb,p_request jsonb,p_input_hash text,p_job_id uuid,p_selection jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.local_text_jobs; a public.local_text_admissions; t jsonb=p_request->'task';project uuid;v_owner uuid;conversation uuid;expires timestamptz;
begin
 project=(p_request->>'projectId')::uuid;v_owner=(p_context->>'userId')::uuid;conversation=(p_request->>'conversationId')::uuid;
 if p_context->>'projectId' is distinct from project::text or p_context->>'conversationId' is distinct from conversation::text
 or not exists(select 1 from public.projects p where p.id=project and p.owner_id=v_owner)
 or not exists(select 1 from public.conversations c where c.id=conversation and c.user_id=v_owner) then return jsonb_build_object('kind','refused','reason','SCOPE_REFUSED');end if;
 -- Serialize equal idempotency keys even before their row exists.
 perform pg_advisory_xact_lock(hashtextextended(project::text||conversation::text||(p_request->>'idempotencyKey'),0));
 select * into j from public.local_text_jobs where project_id=project and conversation_id=conversation and idempotency_key=(p_request->>'idempotencyKey')::uuid for update;
 if found then
  if j.owner_id<>v_owner or j.input_hash<>p_input_hash or (j.task is not null and j.task is distinct from t) then return jsonb_build_object('kind','refused','reason','IDEMPOTENCY_CONFLICT');end if;
  return jsonb_build_object('kind','duplicate','value',public.local_text_receipt(j.id));
 end if;
 if p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(t) is distinct from 'object' or t->>'kind' not in ('classify','extract','summarize')
 or jsonb_typeof(t->'text') is distinct from 'string' or length(t->>'text')>3000 or length(btrim(t->>'text'))=0
 or (t->>'kind'='classify' and ((t-array['kind','text','labels'])<>'{}' or jsonb_typeof(t->'labels') is distinct from 'array'))
 or (t->>'kind'<>'classify' and (t-array['kind','text'])<>'{}') then return jsonb_build_object('kind','refused','reason','INVALID_TASK');end if;
 if t->>'kind'='classify' then
  if jsonb_array_length(t->'labels') not between 2 and 8 or exists(select 1 from jsonb_array_elements(t->'labels') v where jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 64 or btrim(v#>>'{}')<>v#>>'{}')
  or (select count(distinct v) from jsonb_array_elements(t->'labels') v)<>jsonb_array_length(t->'labels') then return jsonb_build_object('kind','refused','reason','INVALID_TASK');end if;
 end if;
 select * into a from public.local_text_admissions where id=(p_context->>'admissionId')::uuid;
 if not found or not public.local_text_eligible(project,v_owner,a.id,t->>'kind',p_input_hash) then return jsonb_build_object('kind','refused','reason','ADMISSION_REFUSED');end if;
 if p_context->>'placement' is distinct from 'cloud_control_review_allowed' or p_context->>'dataClass' is distinct from a.data_class
 or p_context->>'policyVersion' is distinct from a.policy_version then return jsonb_build_object('kind','refused','reason','PLACEMENT_REFUSED');end if;
 if not coalesce((p_context->>'jobCostCapUsd')::numeric between 0 and 0.25,false) or not coalesce((p_context->>'dailyCostCapUsd')::numeric between 0 and 5,false) then return jsonb_build_object('kind','refused','reason','BUDGET_UNVERIFIED');end if;
 expires=least(clock_timestamp()+interval '24 hours',(p_context->>'deadlineAt')::timestamptz);
 if expires is null or expires<=clock_timestamp() then return jsonb_build_object('kind','refused','reason','EXPIRED');end if;
 if p_selection->>'jobId' is distinct from p_job_id::text or p_selection->>'projectId' is distinct from project::text
 or p_selection->>'inputHash' is distinct from p_input_hash or p_selection->>'admissionId' is distinct from a.id::text
 or p_selection->>'modelDigest' is distinct from a.model_digest or p_selection->>'evidenceHash' is distinct from a.evidence_hash
 or p_selection->>'deploymentId' is distinct from a.deployment_id::text or p_selection->>'policyVersion' is distinct from a.policy_version
 or p_selection->>'profile' is distinct from 'local_assist_v1' or p_selection->>'candidateId' is distinct from a.configuration#>>'{qualification,candidateId}'
 or (p_context->>'jobCostCapUsd')::numeric>(a.configuration->>'jobCostCapUsd')::numeric or (p_context->>'dailyCostCapUsd')::numeric>(a.configuration->>'dailyCostCapUsd')::numeric
 or coalesce((p_selection->>'validUntil')::timestamptz<=clock_timestamp(),true) then return jsonb_build_object('kind','refused','reason','SELECTION_REFUSED');end if;
 insert into public.local_text_jobs(id,project_id,owner_id,conversation_id,idempotency_key,input_hash,task_kind,task,context,admission_id,expires_at,payload_expires_at)
 values(p_job_id,project,v_owner,conversation,(p_request->>'idempotencyKey')::uuid,p_input_hash,t->>'kind',t,p_context,a.id,expires,greatest(clock_timestamp(),expires-interval '5 minutes'));
 insert into public.local_text_selections(id,job_id,decision) values((p_selection->>'id')::uuid,p_job_id,p_selection);
 update public.local_text_jobs set selection_id=(p_selection->>'id')::uuid where id=p_job_id;
 return jsonb_build_object('kind','applied','value',public.local_text_receipt(p_job_id));
exception when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range then return jsonb_build_object('kind','refused','reason','INVALID_REQUEST');
end$$;
create function public.local_text_claim(p_device_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.local_text_devices;j public.local_text_jobs;a public.local_text_admissions;s jsonb;attempt uuid=gen_random_uuid();claim uuid=gen_random_uuid();lease timestamptz;
begin
 select * into d from public.local_text_devices where id=p_device_id for update;
 if not found or d.status<>'active' or d.expires_at<=clock_timestamp() or d.last_heartbeat_at is null or d.last_heartbeat_at<=clock_timestamp()-interval '45 seconds' then return jsonb_build_object('kind','refused','reason','DEVICE_UNAVAILABLE');end if;
 perform public.local_text_reap_device(d.id);
 if exists(select 1 from public.local_text_attempts where device_id=d.id and state in ('claimed','running','reconciling')) then return jsonb_build_object('kind','applied','value',null);end if;
 select q.* into j from public.local_text_jobs q join public.local_text_admissions x on x.id=q.admission_id
 where q.state='queued' and q.task is not null and q.payload_expires_at>clock_timestamp() and q.expires_at>clock_timestamp() and not q.cancel_requested and x.device_id=d.id and x.status='active'
 order by q.created_at,q.id for update of q skip locked limit 1;
 if not found then return jsonb_build_object('kind','applied','value',null);end if;
 select * into a from public.local_text_admissions where id=j.admission_id for share;
 select decision into s from public.local_text_selections where id=j.selection_id;
 -- Renew only the same immutable admitted tuple, after fresh health/authority checks.
 -- Retain the old decision as history; never revive drifted evidence or retry a started task.
 if public.local_text_eligible(j.project_id,j.owner_id,a.id,j.task_kind,j.input_hash)
 and s->>'modelDigest'=a.model_digest and s->>'evidenceHash'=a.evidence_hash and s->>'deploymentId'=a.deployment_id::text
 and s->>'profile'='local_assist_v1' and s->>'candidateId'=a.configuration#>>'{qualification,candidateId}'
 and (s->>'validUntil')::timestamptz<=clock_timestamp() then
  s=s||jsonb_build_object('id',gen_random_uuid(),'healthAt',to_char(d.last_heartbeat_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'validUntil',to_char(least(clock_timestamp()+interval '30 seconds',d.last_heartbeat_at+interval '45 seconds',a.expires_at,d.expires_at,j.payload_expires_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  insert into public.local_text_selections(id,job_id,decision) values((s->>'id')::uuid,j.id,s);
  update public.local_text_jobs set selection_id=(s->>'id')::uuid where id=j.id returning * into j;
 end if;
 if not public.local_text_eligible(j.project_id,j.owner_id,a.id,j.task_kind,j.input_hash)
 or s->>'modelDigest' is distinct from a.model_digest or s->>'evidenceHash' is distinct from a.evidence_hash
 or coalesce((s->>'validUntil')::timestamptz<=clock_timestamp(),true) then return jsonb_build_object('kind','refused','reason','SELECTION_STALE');end if;
 lease=least(clock_timestamp()+interval '45 seconds',j.expires_at);
 insert into public.local_text_attempts(id,job_id,device_id,claim_id,fence,input_hash,model_digest,admission_id,state) values(attempt,j.id,d.id,claim,j.fence+1,j.input_hash,a.model_digest,a.id,'claimed');
 update public.local_text_jobs set state='claimed',device_id=d.id,attempt_id=attempt,claim_id=claim,fence=fence+1,lease_until=lease,updated_at=clock_timestamp() where id=j.id returning * into j;
 return jsonb_build_object('kind','applied','value',jsonb_build_object('jobId',j.id,'attemptId',attempt,'deviceId',d.id,'claimId',claim,'fence',j.fence,'inputHash',j.input_hash,'selectionId',j.selection_id,'modelDigest',a.model_digest,
 'leaseUntil',to_char(lease at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'expiresAt',to_char(least(j.expires_at,j.payload_expires_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'task',j.task));
end$$;
create function public.local_text_transition(p_claim jsonb,p_event jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.local_text_jobs;d public.local_text_devices;a public.local_text_admissions;t text=p_event->>'type';r jsonb=p_event->'result';valid boolean=false;
begin
 select * into d from public.local_text_devices where id=(p_claim->>'deviceId')::uuid for share;
 if not found or d.status<>'active' or d.expires_at<=clock_timestamp() then return jsonb_build_object('kind','refused','reason','DEVICE_UNAVAILABLE');end if;
 select * into j from public.local_text_jobs where id=(p_claim->>'jobId')::uuid for update;
 if not found or j.device_id<>d.id or j.claim_id is distinct from (p_claim->>'claimId')::uuid or j.attempt_id is distinct from (p_claim->>'attemptId')::uuid
 or j.fence is distinct from (p_claim->>'fence')::bigint or j.input_hash is distinct from p_claim->>'inputHash' or j.selection_id is distinct from (p_claim->>'selectionId')::uuid
 then return jsonb_build_object('kind','refused','reason','FENCED');end if;
 if t='completed' and exists(select 1 from public.local_text_attempts att where att.id=j.attempt_id and att.job_id=j.id and att.state='completed' and att.result_hash is not distinct from p_event->>'resultHash' and att.result is not distinct from r) then return jsonb_build_object('kind','duplicate','value',public.local_text_receipt(j.id));end if;
 if j.task is null or j.payload_expires_at<=clock_timestamp() or j.expires_at<=clock_timestamp() or j.lease_until is null or j.lease_until<=clock_timestamp() then return jsonb_build_object('kind','refused','reason','FENCED');end if;
 if j.cancel_requested then return jsonb_build_object('kind','refused','reason','CANCELLED');end if;
 select * into a from public.local_text_admissions where id=j.admission_id for share;
 if p_claim->>'modelDigest' is distinct from a.model_digest or not public.local_text_eligible(j.project_id,j.owner_id,a.id,j.task_kind,j.input_hash) then return jsonb_build_object('kind','refused','reason','ADMISSION_REFUSED');end if;
 if j.state='reconciling' then return jsonb_build_object('kind','refused','reason','RECONCILIATION_REQUIRES_VERIFIED_EVIDENCE');end if;
 if t='started' and (public.local_text_revalidate(p_claim)->>'kind') is distinct from 'applied' then return jsonb_build_object('kind','refused','reason','EVIDENCE_DRIFT');end if;
 if t='started' and j.state='running' then return jsonb_build_object('kind','duplicate','value',public.local_text_receipt(j.id));end if;
 if t='started' and j.state='claimed' then
  update public.local_text_attempts set state='running',started_at=clock_timestamp() where id=j.attempt_id;
  update public.local_text_jobs set state='running',updated_at=clock_timestamp() where id=j.id;
 elsif t='dispatch_unknown' and j.state in ('claimed','running') then
  update public.local_text_attempts set state='reconciling' where id=j.attempt_id;
  update public.local_text_jobs set state='reconciling',reason_code='DISPATCH_UNKNOWN',updated_at=clock_timestamp() where id=j.id;
 elsif t='completed' and j.state='running' then
  if jsonb_typeof(r)='object' then
   if j.task_kind='classify' then valid=(r-array['label'])='{}' and jsonb_typeof(r->'label')='string' and j.task->'labels' ? (r->>'label');
   elsif j.task_kind='extract' then valid=(r-array['company','city','registrationNumber'])='{}' and r ?& array['company','city','registrationNumber'] and not exists(select 1 from jsonb_each(r) v where jsonb_typeof(v.value) not in ('string','null') or (jsonb_typeof(v.value)='string' and length(v.value#>>'{}') not between 1 and 300));
   elsif j.task_kind='summarize' and jsonb_typeof(r->'bullets')='array' then valid=(r-array['bullets'])='{}' and jsonb_array_length(r->'bullets') between 1 and 3 and not exists(select 1 from jsonb_array_elements(r->'bullets') v where jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}'))=0 or length(v#>>'{}')>300);end if;
  end if;
  if valid is distinct from true or coalesce(p_event->>'resultHash','') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('kind','refused','reason','INVALID_RESULT');end if;
  update public.local_text_attempts set state='completed',finished_at=clock_timestamp(),result=r,result_hash=p_event->>'resultHash',usage=coalesce(p_event->'usage','{}') where id=j.attempt_id;
  update public.local_text_jobs set state='reviewing',result=r,result_hash=p_event->>'resultHash',updated_at=clock_timestamp() where id=j.id;
  perform public.local_text_enqueue_cloud(j.id,j.attempt_id,'local_review',j.input_hash,p_event->>'resultHash');
 elsif t='known_failed' and j.state in ('claimed','running') and p_event->>'reasonCode' in ('TOKEN_BUDGET_UNVERIFIED','INPUT_TOO_LARGE','IDENTITY_CHANGED','INVALID_MODEL_RESPONSE','LOCAL_MODEL_UNAVAILABLE','LOCAL_STATE_ERROR') then
  update public.local_text_attempts set state='failed',finished_at=clock_timestamp() where id=j.attempt_id;
  update public.local_text_jobs set state='escalation_pending',reason_code=p_event->>'reasonCode',updated_at=clock_timestamp() where id=j.id;
 else return jsonb_build_object('kind','refused','reason','INVALID_TRANSITION');end if;
 return jsonb_build_object('kind','applied','value',public.local_text_receipt(j.id));
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('kind','refused','reason','INVALID_REQUEST');
end$$;
create function public.local_text_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='local_text_selections' then raise check_violation using message='IMMUTABLE_SELECTION';end if;
 if row(new.id,new.project_id,new.owner_id,new.conversation_id,new.idempotency_key,new.input_hash,new.schema_version,new.task_kind,new.context,new.admission_id,new.created_at)
 is distinct from row(old.id,old.project_id,old.owner_id,old.conversation_id,old.idempotency_key,old.input_hash,old.schema_version,old.task_kind,old.context,old.admission_id,old.created_at)
 or (new.task is distinct from old.task and not(new.task is null and clock_timestamp()>=old.payload_expires_at))
 or new.expires_at>old.expires_at or new.payload_expires_at>old.payload_expires_at then raise check_violation using message='IMMUTABLE_JOB_INPUT';end if;
 if new.selection_id is distinct from old.selection_id and (old.state<>'queued' or old.attempt_id is not null or not exists(select 1 from public.local_text_selections s where s.id=new.selection_id and s.job_id=old.id)) then raise check_violation using message='SELECTION_FENCED';end if;
 return new;
end$$;
create trigger local_text_job_immutable before update on public.local_text_jobs for each row execute function public.local_text_immutable();
create trigger local_text_selection_immutable before update on public.local_text_selections for each row execute function public.local_text_immutable();
revoke all on function public.local_text_immutable() from public,anon,authenticated;
-- No raw source/output/review payload is exposed through authenticated SELECT.
alter table public.local_text_devices enable row level security;
alter table public.local_text_admissions enable row level security;
alter table public.local_text_jobs enable row level security;
alter table public.local_text_attempts enable row level security;
alter table public.local_text_selections enable row level security;
alter table public.local_text_reviews enable row level security;
alter table public.local_text_events enable row level security;
alter table public.local_text_request_nonces enable row level security;
revoke all on public.local_text_devices,public.local_text_admissions,public.local_text_jobs,public.local_text_attempts,public.local_text_selections,public.local_text_reviews,public.local_text_events,public.local_text_request_nonces from public,anon,authenticated;
grant all on public.local_text_devices,public.local_text_admissions,public.local_text_jobs,public.local_text_attempts,public.local_text_selections,public.local_text_reviews,public.local_text_events,public.local_text_request_nonces to service_role;
grant select(id,project_id,conversation_id,input_hash,task_kind,state,reason_code,review_status,selection_id,created_at,updated_at,expires_at) on public.local_text_jobs to authenticated;
create policy local_text_owner_read on public.local_text_jobs for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
revoke all on function public.local_text_receipt(uuid),public.local_text_eligible(uuid,uuid,uuid,text,text),public.local_text_enqueue(jsonb,jsonb,text,uuid,jsonb),public.local_text_claim(uuid),public.local_text_transition(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.local_text_receipt(uuid),public.local_text_eligible(uuid,uuid,uuid,text,text),public.local_text_enqueue(jsonb,jsonb,text,uuid,jsonb),public.local_text_claim(uuid),public.local_text_transition(jsonb,jsonb) to service_role;
create function public.local_text_read_receipt(p_user_id uuid,p_job_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('receipt',public.local_text_receipt(j.id),'task',case when j.expires_at>clock_timestamp() and j.payload_expires_at>clock_timestamp() then j.task else null end)
 from public.local_text_jobs j join public.projects p on p.id=j.project_id join public.conversations c on c.id=j.conversation_id
 where j.id=p_job_id and j.owner_id=p_user_id and p.owner_id=p_user_id and c.user_id=p_user_id;
$$;
revoke all on function public.local_text_read_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.local_text_read_receipt(uuid,uuid) to service_role;
create function public.local_text_device_identity(p_device_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('deviceId',d.id,'ownerId',d.owner_id,'keyId',d.key_id,'serverOrigin',d.server_origin,'publicJwk',d.public_jwk,'buildHash',d.build_hash,'status',d.status,'counter',d.counter::text,
 'expiresAt',to_char(d.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'allowedProjects',coalesce((select jsonb_agg(distinct a.project_id) from public.local_text_admissions a join public.projects p on p.id=a.project_id where a.device_id=d.id and p.owner_id=d.owner_id and a.status='active' and a.qualification_status='verified' and a.expires_at>now()),'[]'),
 'allowedTasks',coalesce((select jsonb_agg(distinct a.task_kind) from public.local_text_admissions a join public.projects p on p.id=a.project_id where a.device_id=d.id and p.owner_id=d.owner_id and a.status='active' and a.qualification_status='verified' and a.expires_at>now()),'[]'))
 from public.local_text_devices d where d.id=p_device_id;
$$;
create function public.local_text_owner_device(p_owner_id uuid,p_project_id uuid,p_device_id uuid,p_action text,p_expected_version integer,p_registration jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.local_text_devices;
begin
 if not exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=p_owner_id) then return jsonb_build_object('kind','refused','reason','SCOPE_REFUSED');end if;
 select * into d from public.local_text_devices where id=p_device_id for update;
 if p_action='register' then
  if found then return jsonb_build_object('kind','refused','reason','DEVICE_EXISTS');end if;
  if jsonb_typeof(p_registration->'publicJwk') is distinct from 'object' or coalesce(p_registration->>'buildHash','') !~ '^[a-f0-9]{64}$' or coalesce(p_registration->>'fingerprint','') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('kind','refused','reason','INVALID_IDENTITY');end if;
  insert into public.local_text_devices(id,owner_id,key_id,public_jwk,build_hash,server_origin,pairing_project_id,public_key_fingerprint)
  values(p_device_id,p_owner_id,(p_registration->>'keyId')::uuid,p_registration->'publicJwk',p_registration->>'buildHash',p_registration->>'origin',p_project_id,p_registration->>'fingerprint') returning * into d;
 else
  if not found or d.owner_id<>p_owner_id then return jsonb_build_object('kind','refused','reason','SCOPE_REFUSED');end if;
  if d.version is distinct from p_expected_version then return jsonb_build_object('kind','refused','reason','STALE_VERSION');end if;
  if p_action='approve' then
   if d.pairing_project_id is distinct from p_project_id or d.status<>'pending' or d.enrolled_at is null or d.public_key_fingerprint is distinct from p_registration->>'confirmFingerprint' then return jsonb_build_object('kind','refused','reason','POSSESSION_PROOF_REQUIRED');end if;
   update public.local_text_devices set status='active',version=version+1 where id=d.id returning * into d;
  elsif p_action='revoke' then
   update public.local_text_devices set status='revoked',health_state='blocked',revoked_at=clock_timestamp(),version=version+1 where id=d.id returning * into d;
   update public.local_text_admissions set status='revoked' where device_id=d.id;
   update public.local_text_attempts set state=case when started_at is null then 'cancelled' else 'reconciling' end where device_id=d.id and state in ('claimed','running');
   update public.local_text_jobs j set state=case when a.started_at is null then 'cancelled' else 'reconciling' end,cancel_requested=true,reason_code='DEVICE_REVOKED',updated_at=clock_timestamp()
   from public.local_text_attempts a where j.attempt_id=a.id and a.device_id=d.id and j.state in ('claimed','running');
  else return jsonb_build_object('kind','refused','reason','INVALID_OPERATION');end if;
 end if;
 return jsonb_build_object('kind','applied','value',jsonb_build_object('deviceId',d.id,'projectId',d.pairing_project_id,'status',d.status,'version',d.version,'fingerprint',d.public_key_fingerprint));
exception when unique_violation then return jsonb_build_object('kind','refused','reason','DEVICE_EXISTS');
 when invalid_text_representation then return jsonb_build_object('kind','refused','reason','INVALID_REQUEST');
end$$;
create function public.local_text_worker_operation(p_envelope jsonb,p_operation text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.local_text_devices;e jsonb=p_envelope;counter_value numeric(20,0);issued timestamptz;expires timestamptz;j public.local_text_jobs;health jsonb=p_payload->'health';answer jsonb;
begin
 if p_operation not in ('enroll','heartbeat','claim','started','complete','fail','reconcile') or e->>'path' is distinct from '/api/local-text/worker/'||p_operation or e->>'method' is distinct from 'POST' or e->>'version' is distinct from '1' then return jsonb_build_object('kind','refused','reason','REQUEST_BINDING_REFUSED');end if;
 issued=(e->>'issuedAt')::timestamptz;expires=(e->>'expiresAt')::timestamptz;
 if issued is null or expires is null or issued>clock_timestamp()+interval '5 seconds' or expires<=clock_timestamp() or expires<=issued or expires-issued>interval '60 seconds' then return jsonb_build_object('kind','refused','reason','REQUEST_EXPIRED');end if;
 if coalesce(e->>'counter','') !~ '^[1-9][0-9]{0,19}$' then return jsonb_build_object('kind','refused','reason','REPLAY_REFUSED');end if;
 counter_value=(e->>'counter')::numeric;
 select * into d from public.local_text_devices where id=(e->>'deviceId')::uuid for update;
 if not found or not(d.status='active' or d.status='pending' and p_operation='enroll') or d.expires_at<=clock_timestamp() then return jsonb_build_object('kind','refused','reason','DEVICE_UNAVAILABLE');end if;
 if e->>'origin' is distinct from d.server_origin or d.key_id is distinct from (e->>'keyId')::uuid or d.build_hash is distinct from e->>'buildHash' then return jsonb_build_object('kind','refused','reason','REQUEST_BINDING_REFUSED');end if;
 if counter_value>18446744073709551615 or counter_value<=d.counter or exists(select 1 from public.local_text_request_nonces n where n.device_id=d.id and n.nonce=(e->>'nonce')::uuid) then return jsonb_build_object('kind','refused','reason','REPLAY_REFUSED');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then return jsonb_build_object('kind','refused','reason','INVALID_PAYLOAD');end if;
 insert into public.local_text_request_nonces(device_id,nonce,counter) values(d.id,(e->>'nonce')::uuid,counter_value);
 update public.local_text_devices set counter=counter_value where id=d.id;
 if p_operation in ('enroll','claim') and p_payload<>'{}' then return jsonb_build_object('kind','refused','reason','INVALID_PAYLOAD');end if;
 if p_operation='enroll' then
  update public.local_text_devices set version=case when enrolled_at is null then version+1 else version end,enrolled_at=coalesce(enrolled_at,clock_timestamp()) where id=d.id returning * into d;
  return jsonb_build_object('kind','applied','value',jsonb_build_object('deviceId',d.id,'status',d.status,'version',d.version));
 elsif p_operation='claim' then return public.local_text_claim(d.id);
 elsif p_operation='heartbeat' then
  if (p_payload-array['health','activeAttemptId'])<>'{}' or jsonb_typeof(health) is distinct from 'object' or health->>'state' not in ('ready','blocked','stopped') or health->>'lifecycleLock' not in ('clear','uncertain') then return jsonb_build_object('kind','refused','reason','INVALID_PAYLOAD');end if;
  update public.local_text_devices set last_heartbeat_at=clock_timestamp(),health_state=case when health->>'state'='ready' and health->>'lifecycleLock'='clear' and health->'gpuAvailable'='true'::jsonb then 'ready' else 'blocked' end,
  reported_health=jsonb_build_object('state',health->'state','lifecycleLock',health->'lifecycleLock','gpuAvailable',health->'gpuAvailable','runtimeVersion',health->'runtimeVersion','runtimeHash',health->'runtimeHash','adapterHash',health->'adapterHash','configurationHash',health->'configurationHash','models',health->'models') where id=d.id;
  if p_payload->>'activeAttemptId' is not null then
   select * into j from public.local_text_jobs where device_id=d.id and attempt_id=(p_payload->>'activeAttemptId')::uuid for update;
   if not found or j.state not in ('claimed','running') or j.cancel_requested or j.lease_until<=clock_timestamp() or j.payload_expires_at<=clock_timestamp() or not public.local_text_eligible(j.project_id,j.owner_id,j.admission_id,j.task_kind,j.input_hash) then
    return jsonb_build_object('kind','applied','value',jsonb_build_object('deviceId',d.id,'jobAction','abort','reasonCode','AUTHORITY_LOST'));
   end if;
   update public.local_text_jobs set lease_until=least(clock_timestamp()+interval '45 seconds',expires_at,payload_expires_at),updated_at=clock_timestamp() where id=j.id;
  end if;
  return jsonb_build_object('kind','applied','value',jsonb_build_object('deviceId',d.id,'jobAction','continue'));
 elsif p_operation in ('started','complete','fail','reconcile') then
  if p_payload#>>'{claim,deviceId}' is distinct from d.id::text then return jsonb_build_object('kind','refused','reason','SCOPE_REFUSED');end if;
  if p_operation='started' then answer=jsonb_build_object('type','started');
  elsif p_operation='complete' then answer=jsonb_build_object('type','completed','result',p_payload->'result','resultHash',p_payload->'resultHash','usage',coalesce(p_payload->'usage','{}'));
  elsif p_operation='fail' then answer=jsonb_build_object('type',p_payload->>'outcome','reasonCode',p_payload->>'reasonCode');
  else return jsonb_build_object('kind','refused','reason','RECONCILIATION_REQUIRES_VERIFIED_EVIDENCE');end if;
  return public.local_text_transition(p_payload->'claim',answer);
 end if;
 return jsonb_build_object('kind','refused','reason','INVALID_OPERATION');
exception when unique_violation then return jsonb_build_object('kind','refused','reason','REPLAY_REFUSED');
 when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format then return jsonb_build_object('kind','refused','reason','INVALID_REQUEST');
end$$;
create function public.local_text_device_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if row(new.id,new.owner_id,new.key_id,new.public_jwk,new.public_key_fingerprint,new.build_hash,new.server_origin,new.pairing_project_id,new.created_at)
 is distinct from row(old.id,old.owner_id,old.key_id,old.public_jwk,old.public_key_fingerprint,old.build_hash,old.server_origin,old.pairing_project_id,old.created_at)
 or new.counter<old.counter or new.expires_at>old.expires_at then raise check_violation using message='IMMUTABLE_DEVICE_IDENTITY';end if;
 return new;
end$$;
create trigger local_text_device_immutable before update on public.local_text_devices for each row execute function public.local_text_device_immutable();
revoke all on function public.local_text_device_identity(uuid),public.local_text_owner_device(uuid,uuid,uuid,text,integer,jsonb),public.local_text_worker_operation(jsonb,text,jsonb),public.local_text_device_immutable() from public,anon,authenticated;
grant execute on function public.local_text_device_identity(uuid),public.local_text_owner_device(uuid,uuid,uuid,text,integer,jsonb),public.local_text_worker_operation(jsonb,text,jsonb) to service_role;
create function public.local_text_owner_devices(p_owner_id uuid,p_project_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=p_owner_id) then return jsonb_build_object('kind','refused','reason','SCOPE_REFUSED');end if;
 return jsonb_build_object('kind','applied','value',coalesce((select jsonb_agg(jsonb_build_object('deviceId',d.id,'projectId',d.pairing_project_id,'status',d.status,'version',d.version,'fingerprint',d.public_key_fingerprint,'enrolled',d.enrolled_at is not null,'lastHeartbeatAt',d.last_heartbeat_at)) from public.local_text_devices d where d.owner_id=p_owner_id and d.pairing_project_id=p_project_id),'[]'));
end$$;
revoke all on function public.local_text_owner_devices(uuid,uuid) from public,anon,authenticated;
grant execute on function public.local_text_owner_devices(uuid,uuid) to service_role;
-- Qualification is supplied only by the server-owned independently reviewed catalog.
-- No authenticated/device caller may write admissions or qualification evidence.
alter table public.local_text_admissions add column version integer not null default 1;
alter table public.local_text_admissions add column approved_by uuid references auth.users(id);
alter table public.local_text_admissions add column approved_at timestamptz;
create function public.local_text_evidence_current(p_admission uuid,p_device uuid) returns boolean language sql volatile security invoker set search_path='' as $$
 select coalesce((
 a.approved_by=d.owner_id and a.approved_at is not null and a.configuration->>'placement'='cloud_control_review_allowed'
 and a.configuration->>'policyVersion'='local_assist_v1' and a.policy_version='local_assist_v1'
 and a.configuration#>>'{qualification,taskKind}'=a.task_kind and a.configuration#>>'{qualification,modelDigest}'=a.model_digest
 and ((a.task_kind in ('classify','extract') and a.configuration#>>'{qualification,candidateId}'='qwen3.5:4b') or (a.task_kind='classify' and a.configuration#>>'{qualification,candidateId}'='qwen3.5:9b') or (a.task_kind='summarize' and a.configuration#>>'{qualification,candidateId}'='qwen3:8b'))
 and a.configuration#>>'{qualification,review,status}'='approved' and a.configuration#>>'{qualification,review,corpus}'='sv-atlas-v2'
 and (a.configuration#>>'{qualification,review,cases}')::numeric>=25
 and (a.configuration#>>'{qualification,review,accuracy}')::numeric between case when a.task_kind='summarize' then 1 else 0.9 end and 1
 and a.configuration#>>'{qualification,review,invented}'='0' and a.configuration#>>'{qualification,review,injectionPasses}'='0'
 and a.configuration#>>'{qualification,review,reviewRunId}' ~ '^[a-f0-9-]{36}$'
 and a.configuration#>>'{qualification,license,permission}'='allowed'
 and not exists(select 1 from unnest(array['runtimeHash','templateHash','schemaHash','adapterHash','configurationHash','tokenizerEvidenceHash']) k where coalesce(a.configuration->'qualification'->>k,'') !~ '^[a-f0-9]{64}$')
 and coalesce(a.configuration#>>'{qualification,license,evidenceHash}','') ~ '^[a-f0-9]{64}$'
 and (a.configuration->>'jobCostCapUsd')::numeric>0 and (a.configuration->>'jobCostCapUsd')::numeric<=0.25
 and (a.configuration->>'dailyCostCapUsd')::numeric>0 and (a.configuration->>'dailyCostCapUsd')::numeric<=5
 and d.reported_health->>'runtimeVersion'=a.configuration#>>'{qualification,runtimeVersion}'
 and d.reported_health->>'runtimeHash'=a.configuration#>>'{qualification,runtimeHash}'
 and d.reported_health->>'adapterHash'=a.configuration#>>'{qualification,adapterHash}'
 and d.reported_health->>'configurationHash'=a.configuration#>>'{qualification,configurationHash}'
 and d.reported_health->>'lifecycleLock'='clear' and d.reported_health->'gpuAvailable'='true'::jsonb
 and d.reported_health->'models' @> jsonb_build_array(jsonb_build_object('candidateId',a.configuration#>>'{qualification,candidateId}','modelDigest',a.model_digest))
 ),false) from public.local_text_admissions a join public.local_text_devices d on d.id=a.device_id where a.id=p_admission and d.id=p_device;
$$;
create or replace function public.local_text_eligible(p_project uuid,p_owner uuid,p_admission uuid,p_kind text,p_input_hash text) returns boolean
language plpgsql volatile security invoker set search_path='' as $$
declare s record;
begin
 select * into s from public.stop_state(p_project);
 if not found or s.global_paused is distinct from false or s.project_found is distinct from true or s.project_paused is distinct from false then return false;end if;
 return coalesce((select a.project_id=p_project and p.owner_id=p_owner and d.owner_id=p_owner and a.task_kind=p_kind
 and a.status='active' and a.qualification_status='verified' and a.expires_at>clock_timestamp() and d.status='active'
 and d.expires_at>clock_timestamp() and d.health_state='ready' and d.last_heartbeat_at>clock_timestamp()-interval '45 seconds' and d.last_heartbeat_at<=clock_timestamp()
 and p_input_hash=any(a.approved_input_hashes) and public.local_text_evidence_current(a.id,d.id)
 from public.local_text_admissions a join public.local_text_devices d on d.id=a.device_id join public.projects p on p.id=a.project_id where a.id=p_admission),false);
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end$$;
create function public.local_text_revalidate(p_claim jsonb) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare j public.local_text_jobs;a public.local_text_admissions;s jsonb;
begin
 select * into j from public.local_text_jobs where id=(p_claim->>'jobId')::uuid;
 if not found or j.state not in ('claimed','running') or j.cancel_requested or j.task is null or j.payload_expires_at<=clock_timestamp() or j.expires_at<=clock_timestamp() or j.lease_until<=clock_timestamp()
 or j.device_id is distinct from (p_claim->>'deviceId')::uuid or j.attempt_id is distinct from (p_claim->>'attemptId')::uuid or j.claim_id is distinct from (p_claim->>'claimId')::uuid or j.fence is distinct from (p_claim->>'fence')::bigint
 or j.selection_id is distinct from (p_claim->>'selectionId')::uuid or j.input_hash is distinct from p_claim->>'inputHash' then return jsonb_build_object('kind','refused','reason','FENCED');end if;
 select * into a from public.local_text_admissions where id=j.admission_id;
 select decision into s from public.local_text_selections where id=j.selection_id and job_id=j.id;
 if not public.local_text_eligible(j.project_id,j.owner_id,a.id,j.task_kind,j.input_hash)
 or s is null or s->>'id' is distinct from j.selection_id::text or s->>'jobId' is distinct from j.id::text or s->>'inputHash' is distinct from j.input_hash
 or s->>'projectId' is distinct from j.project_id::text or s->>'admissionId' is distinct from a.id::text or s->>'deploymentId' is distinct from a.deployment_id::text
 or s->>'evidenceHash' is distinct from a.evidence_hash or s->>'modelDigest' is distinct from a.model_digest or p_claim->>'modelDigest' is distinct from a.model_digest
 or s->>'policyVersion' is distinct from a.policy_version or s->>'profile' is distinct from 'local_assist_v1' or s->>'candidateId' is distinct from a.configuration#>>'{qualification,candidateId}'
 or coalesce((s->>'validUntil')::timestamptz<=clock_timestamp(),true) then return jsonb_build_object('kind','refused','reason','EVIDENCE_DRIFT');end if;
 return jsonb_build_object('kind','applied','value',s);
exception when invalid_text_representation or invalid_datetime_format or numeric_value_out_of_range then return jsonb_build_object('kind','refused','reason','INVALID_CLAIM');end$$;
create function public.local_text_owner_admission(p_owner_id uuid,p_project_id uuid,p_device_id uuid,p_action text,p_specification jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.local_text_devices;a public.local_text_admissions;q jsonb=p_specification->'qualification';v uuid=gen_random_uuid();expiry timestamptz;
begin
 select * into d from public.local_text_devices where id=p_device_id for update;
 if not found or d.owner_id<>p_owner_id or not exists(select 1 from public.projects where id=p_project_id and owner_id=p_owner_id) then return jsonb_build_object('kind','refused','reason','SCOPE_REFUSED');end if;
 if p_action='revoke' then
  select * into a from public.local_text_admissions where id=(p_specification->>'id')::uuid and device_id=d.id and project_id=p_project_id for update;
  if not found then return jsonb_build_object('kind','refused','reason','SCOPE_REFUSED');end if;
  if a.version is distinct from (p_specification->>'expectedVersion')::integer then return jsonb_build_object('kind','refused','reason','STALE_VERSION');end if;
  update public.local_text_admissions set status='revoked',version=version+1 where id=a.id returning * into a;
 elsif p_action='admit' then
  expiry=(p_specification->>'expiresAt')::timestamptz;
  if d.status<>'active' or d.enrolled_at is null or d.expires_at<=clock_timestamp() or expiry is null or expiry<=clock_timestamp() or expiry>least(clock_timestamp()+interval '90 days',d.expires_at)
  or p_specification->>'policyVersion' is distinct from 'local_assist_v1' or p_specification->>'placement' is distinct from 'cloud_control_review_allowed'
  or coalesce(p_specification->>'dataClass','') not in ('synthetic','approved_cloud_text') or coalesce(p_specification->>'evidenceHash','') !~ '^[a-f0-9]{64}$'
  or coalesce(q->>'modelDigest','') !~ '^sha256:[a-f0-9]{64}$' or q->>'taskKind' not in ('classify','extract','summarize')
  or jsonb_typeof(p_specification->'approvedInputHashes') is distinct from 'array' then return jsonb_build_object('kind','refused','reason','INVALID_ADMISSION');end if;
  if jsonb_array_length(p_specification->'approvedInputHashes') not between 1 and 100 or exists(select 1 from jsonb_array_elements_text(p_specification->'approvedInputHashes') x where x !~ '^[a-f0-9]{64}$') then return jsonb_build_object('kind','refused','reason','INVALID_INPUT_APPROVAL');end if;
  insert into public.local_text_admissions(id,project_id,device_id,deployment_id,task_kind,model_digest,evidence_hash,policy_version,qualification_status,status,data_class,approved_input_hashes,configuration,expires_at,approved_by,approved_at)
  values(v,p_project_id,d.id,v,q->>'taskKind',q->>'modelDigest',p_specification->>'evidenceHash','local_assist_v1','verified','active',p_specification->>'dataClass',array(select jsonb_array_elements_text(p_specification->'approvedInputHashes')),p_specification,expiry,p_owner_id,clock_timestamp()) returning * into a;
  -- Raising rolls back the candidate insert; no half-admitted row is retained.
  if public.local_text_evidence_current(a.id,d.id) is distinct from true then raise check_violation using message='EVIDENCE_UNVERIFIED';end if;
 else return jsonb_build_object('kind','refused','reason','INVALID_OPERATION');end if;
 return jsonb_build_object('kind','applied','value',jsonb_build_object('id',a.id,'projectId',a.project_id,'deviceId',a.device_id,'status',a.status,'evidenceHash',a.evidence_hash,'version',a.version,'expiresAt',to_char(a.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
exception when invalid_text_representation or invalid_datetime_format or numeric_value_out_of_range or check_violation then return jsonb_build_object('kind','refused','reason','INVALID_ADMISSION');end$$;
create function public.local_text_admission_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if row(new.id,new.project_id,new.device_id,new.deployment_id,new.task_kind,new.model_digest,new.evidence_hash,new.policy_version,new.data_class,new.approved_input_hashes,new.configuration,new.created_at,new.approved_by,new.approved_at)
 is distinct from row(old.id,old.project_id,old.device_id,old.deployment_id,old.task_kind,old.model_digest,old.evidence_hash,old.policy_version,old.data_class,old.approved_input_hashes,old.configuration,old.created_at,old.approved_by,old.approved_at)
 or new.expires_at>old.expires_at or new.version<old.version then raise check_violation using message='IMMUTABLE_ADMISSION';end if;return new;
end$$;
create trigger local_text_admission_immutable before update on public.local_text_admissions for each row execute function public.local_text_admission_immutable();
revoke all on function public.local_text_evidence_current(uuid,uuid),public.local_text_revalidate(jsonb),public.local_text_owner_admission(uuid,uuid,uuid,text,jsonb),public.local_text_admission_immutable() from public,anon,authenticated;
grant execute on function public.local_text_evidence_current(uuid,uuid),public.local_text_revalidate(jsonb),public.local_text_owner_admission(uuid,uuid,uuid,text,jsonb) to service_role;
-- Expired, never-started claims may be fenced and returned to the queue. A running
-- or physically uncertain attempt always holds its device pending owned proof.
create function public.local_text_reap_device(p_device_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare j public.local_text_jobs;a public.local_text_attempts;
begin
 perform 1 from public.local_text_devices where id=p_device_id for update;
 for j in select * from public.local_text_jobs where device_id=p_device_id and state in ('claimed','running') and lease_until<=clock_timestamp() order by created_at for update skip locked loop
  select * into a from public.local_text_attempts where id=j.attempt_id for update;
  if j.state='claimed' and a.started_at is null then
   update public.local_text_attempts set state='expired',finished_at=clock_timestamp() where id=a.id;
   update public.local_text_jobs set state=case when task is null or payload_expires_at<=clock_timestamp() or expires_at<=clock_timestamp() then 'needs_input' else 'queued' end,
    reason_code='UNDISPATCHED_LEASE_EXPIRED',attempt_id=null,claim_id=null,device_id=null,lease_until=null,updated_at=clock_timestamp() where id=j.id;
  else
   update public.local_text_attempts set state='reconciling' where id=a.id;
   update public.local_text_jobs set state='reconciling',reason_code='LEASE_LOST',updated_at=clock_timestamp() where id=j.id;
  end if;
 end loop;
end$$;
revoke all on function public.local_text_reap_device(uuid) from public,anon,authenticated;
grant execute on function public.local_text_reap_device(uuid) to service_role;
-- Canonical cloud continuations carry metadata only. Raw source/result stays in
-- local_text_jobs and expires with its payload; never copied into runs.context.
create table public.local_text_cloud_stages(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.local_text_jobs,
 source_attempt_id uuid not null references public.local_text_attempts,run_id uuid not null unique references public.runs,
 stage text not null check(stage in ('local_review','cloud_task','cloud_review')),input_hash text not null,result_hash text,
 state text not null default 'pending' check(state in ('pending','dispatching','response_ready','human_ready','unknown','applied')),
 dispatch_claim_id uuid,profile jsonb,receipt jsonb,raw_result jsonb,reason_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(job_id,stage)
);
alter table public.local_text_cloud_stages enable row level security;
revoke all on public.local_text_cloud_stages from public,anon,authenticated;
grant all on public.local_text_cloud_stages to service_role;
alter table public.local_text_reviews add constraint local_text_review_run_fk foreign key(review_run_id) references public.runs(id);
create function public.local_text_enqueue_cloud(p_job_id uuid,p_attempt_id uuid,p_stage text,p_input_hash text,p_result_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.local_text_jobs;s public.local_text_cloud_stages;rid uuid=gen_random_uuid();sid uuid=gen_random_uuid();binding jsonb;
begin
 select * into j from public.local_text_jobs where id=p_job_id for update;
 if not found or p_stage not in ('local_review','cloud_task','cloud_review') or j.input_hash is distinct from p_input_hash or j.task is null or j.payload_expires_at<=clock_timestamp() then return jsonb_build_object('kind','refused','reason','SOURCE_UNAVAILABLE');end if;
 select * into s from public.local_text_cloud_stages where job_id=j.id and stage=p_stage;
 if found then
  if s.source_attempt_id is distinct from p_attempt_id or s.input_hash is distinct from p_input_hash or s.result_hash is distinct from p_result_hash then return jsonb_build_object('kind','refused','reason','STAGE_BINDING_MISMATCH');end if;
  return jsonb_build_object('kind','duplicate','value',jsonb_build_object('runId',s.run_id));
 end if;
 if p_stage<>'local_review' then return jsonb_build_object('kind','refused','reason','STAGE_NOT_IMPLEMENTED');end if;
 if j.state<>'reviewing' or j.attempt_id is distinct from p_attempt_id or j.result_hash is distinct from p_result_hash or j.result is null
 or not exists(select 1 from public.local_text_attempts where id=p_attempt_id and job_id=j.id and state='completed' and input_hash=p_input_hash and result_hash=p_result_hash)
 or not exists(select 1 from public.projects p join public.conversations c on c.id=j.conversation_id where p.id=j.project_id and p.owner_id=j.owner_id and c.user_id=j.owner_id) then return jsonb_build_object('kind','refused','reason','STAGE_BINDING_MISMATCH');end if;
 binding=jsonb_build_object('version',1,'jobId',j.id,'stageId',sid,'stage',p_stage,'attemptId',p_attempt_id,'inputHash',j.input_hash,'resultHash',j.result_hash);
 insert into public.runs(id,project_id,workflow_id,kind,status,input,context,max_attempts) values(rid,j.project_id,null,'local_text_cloud','pending',binding,'{}',1);
 insert into public.local_text_cloud_stages(id,job_id,source_attempt_id,run_id,stage,input_hash,result_hash) values(sid,j.id,p_attempt_id,rid,p_stage,p_input_hash,p_result_hash);
 return jsonb_build_object('kind','applied','value',jsonb_build_object('runId',rid));
end$$;
create function public.local_text_cloud_snapshot(p_run_id uuid,p_claim_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.runs;s public.local_text_cloud_stages;j public.local_text_jobs;
begin
 select * into r from public.runs where id=p_run_id;
 select * into s from public.local_text_cloud_stages where run_id=p_run_id;
 select * into j from public.local_text_jobs where id=s.job_id;
 if r.id is null or s.id is null or j.id is null or r.kind is distinct from 'local_text_cloud' or r.workflow_id is not null or r.workflow_instance_id is not null or r.project_id is distinct from j.project_id or r.claim_id is distinct from p_claim_id or r.status<>'running' or r.cancel_requested or r.lease_until is null or r.lease_until<=clock_timestamp()
 or r.input is distinct from jsonb_build_object('version',1,'jobId',j.id,'stageId',s.id,'stage',s.stage,'attemptId',s.source_attempt_id,'inputHash',s.input_hash,'resultHash',s.result_hash)
 or not exists(select 1 from public.projects p join public.conversations c on c.id=j.conversation_id where p.id=j.project_id and p.owner_id=j.owner_id and c.user_id=j.owner_id)
 then return jsonb_build_object('kind','refused','reason','FENCED');end if;
 if j.task is null or j.payload_expires_at<=clock_timestamp() or j.input_hash<>s.input_hash or j.result_hash is distinct from s.result_hash then return jsonb_build_object('kind','refused','reason','SOURCE_UNAVAILABLE');end if;
 return jsonb_build_object('kind','applied','value',jsonb_build_object('stageId',s.id,'jobId',j.id,'attemptId',s.source_attempt_id,'stage',s.stage,'state',s.state,'dispatchClaimId',s.dispatch_claim_id,'projectId',j.project_id,'inputHash',s.input_hash,'resultHash',s.result_hash,'task',j.task,'result',j.result,'context',j.context,'receipt',s.receipt,'reasonCode',s.reason_code));
end$$;
create function public.local_text_cloud_operation(p_run_id uuid,p_claim_id uuid,p_operation text,p_value jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.runs;s public.local_text_cloud_stages;j public.local_text_jobs;v jsonb=p_value;review jsonb=p_value->'receipt';allowed boolean=false;
begin
 -- Same lock order as canonical run finalization/cancellation: RUN first.
 select * into r from public.runs where id=p_run_id for update;
 select * into s from public.local_text_cloud_stages where run_id=p_run_id;
 select * into j from public.local_text_jobs where id=s.job_id for update;
 if r.id is null or s.id is null or j.id is null or r.kind is distinct from 'local_text_cloud' or r.project_id<>j.project_id or r.claim_id is distinct from p_claim_id or r.cancel_requested then return jsonb_build_object('kind','refused','reason','FENCED');end if;
 select * into s from public.local_text_cloud_stages where id=s.id for update;
 if p_operation='apply' and s.state='applied' then return jsonb_build_object('kind','duplicate','value',public.local_text_receipt(j.id));end if;
 if p_operation='unknown' and r.status='unknown' and s.state in ('dispatching','response_ready') and s.dispatch_claim_id=p_claim_id then
  update public.local_text_cloud_stages set state='unknown',reason_code='CLOUD_DISPATCH_UNKNOWN',updated_at=clock_timestamp() where id=s.id;
  update public.local_text_jobs set state='reconciling',reason_code='CLOUD_DISPATCH_UNKNOWN',updated_at=clock_timestamp() where id=j.id;
  return jsonb_build_object('kind','applied','value',null);
 end if;
 if p_operation='dispatch' and r.status='running' and s.state='pending' and r.lease_until>clock_timestamp() and j.task is not null and j.payload_expires_at>clock_timestamp() then
  if (public.local_text_cloud_snapshot(r.id,p_claim_id)->>'kind') is distinct from 'applied' or p_value->>'deployment' is distinct from 'gpt-5.4-mini-2026-03-17' or coalesce(p_value->>'qualificationHash','') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('kind','refused','reason','PROFILE_UNVERIFIED');end if;
  update public.local_text_cloud_stages set state='dispatching',dispatch_claim_id=p_claim_id,profile=p_value,updated_at=clock_timestamp() where id=s.id;
  return jsonb_build_object('kind','applied','value',null);
 elsif p_operation='human' and r.status='running' and s.state in ('pending','dispatching') and coalesce(v->>'reasonCode','') ~ '^[A-Z][A-Z0-9_]{1,63}$' then
  update public.local_text_cloud_stages set state='human_ready',dispatch_claim_id=p_claim_id,reason_code=v->>'reasonCode',updated_at=clock_timestamp() where id=s.id;
  return jsonb_build_object('kind','applied','value',null);
 elsif p_operation='response' and r.status='running' and s.state='dispatching' and s.dispatch_claim_id=p_claim_id and j.task is not null and j.payload_expires_at>clock_timestamp() then
  if review->>'jobId' is distinct from j.id::text or review->>'attemptId' is distinct from s.source_attempt_id::text or review->>'reviewRunId' is distinct from r.id::text or review->>'reviewAttemptId' is distinct from p_claim_id::text
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
  else
   if s.receipt->>'inputHash' is distinct from j.input_hash or s.receipt->>'resultHash' is distinct from j.result_hash or j.task is null or j.payload_expires_at<=clock_timestamp() then return jsonb_build_object('kind','refused','reason','SOURCE_UNAVAILABLE');end if;
   insert into public.local_text_reviews(job_id,attempt_id,input_hash,result_hash,review_run_id,receipt,status) values(j.id,s.source_attempt_id,j.input_hash,j.result_hash,r.id,s.receipt,s.receipt->>'status');
   update public.local_text_jobs set state=case s.receipt->>'status' when 'approved' then 'succeeded' when 'rejected' then 'escalation_pending' else 'needs_input' end,
    review_status=s.receipt->>'status',reason_code=case s.receipt->>'status' when 'approved' then null when 'rejected' then 'LOCAL_REVIEW_REJECTED' else 'REVIEW_UNAVAILABLE' end,updated_at=clock_timestamp() where id=j.id;
  end if;
  update public.local_text_cloud_stages set state='applied',updated_at=clock_timestamp() where id=s.id;
  return jsonb_build_object('kind','applied','value',public.local_text_receipt(j.id));
 end if;
 return jsonb_build_object('kind','refused','reason','STAGE_FENCED');
exception when invalid_text_representation or invalid_datetime_format or numeric_value_out_of_range then return jsonb_build_object('kind','refused','reason','INVALID_CLOUD_OPERATION');end$$;
create function public.local_text_cloud_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='runs' then
  if (new.kind='local_text_cloud' or old.kind='local_text_cloud') and row(new.id,new.project_id,new.workflow_id,new.workflow_instance_id,new.kind,new.input,new.max_attempts)
  is distinct from row(old.id,old.project_id,old.workflow_id,old.workflow_instance_id,old.kind,old.input,old.max_attempts) then raise check_violation using message='IMMUTABLE_LOCAL_TEXT_RUN';end if;
 else
  if row(new.id,new.job_id,new.source_attempt_id,new.run_id,new.stage,new.input_hash,new.result_hash,new.created_at) is distinct from row(old.id,old.job_id,old.source_attempt_id,old.run_id,old.stage,old.input_hash,old.result_hash,old.created_at)
  or (old.profile is not null and new.profile is distinct from old.profile) or (old.receipt is not null and new.receipt is distinct from old.receipt) then raise check_violation using message='IMMUTABLE_LOCAL_TEXT_STAGE';end if;
 end if;return new;
end$$;
create trigger local_text_run_immutable before update on public.runs for each row execute function public.local_text_cloud_immutable();
create trigger local_text_cloud_stage_immutable before update on public.local_text_cloud_stages for each row execute function public.local_text_cloud_immutable();
revoke all on function public.local_text_enqueue_cloud(uuid,uuid,text,text,text),public.local_text_cloud_snapshot(uuid,uuid),public.local_text_cloud_operation(uuid,uuid,text,jsonb),public.local_text_cloud_immutable() from public,anon,authenticated;
grant execute on function public.local_text_enqueue_cloud(uuid,uuid,text,text,text),public.local_text_cloud_snapshot(uuid,uuid),public.local_text_cloud_operation(uuid,uuid,text,jsonb) to service_role;
