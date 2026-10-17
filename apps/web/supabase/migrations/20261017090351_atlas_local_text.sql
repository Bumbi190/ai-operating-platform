-- Dedicated local-text authority. No existing broker or provider privileges reused.
create table public.local_text_devices (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 key_id uuid not null unique, public_jwk jsonb not null, build_hash text not null check(build_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','active','paused','revoked','lost','retired')),
 counter numeric(20,0) not null default 0 check(counter>=0 and counter<=18446744073709551615),
 last_heartbeat_at timestamptz, current_model_digest text, created_at timestamptz not null default now(),
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
 and d.expires_at>clock_timestamp() and d.last_heartbeat_at>clock_timestamp()-interval '45 seconds'
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
 if exists(select 1 from public.local_text_attempts where device_id=d.id and state in ('claimed','running','reconciling')) then return jsonb_build_object('kind','applied','value',null);end if;
 select q.* into j from public.local_text_jobs q join public.local_text_admissions x on x.id=q.admission_id
 where q.state='queued' and q.task is not null and q.payload_expires_at>clock_timestamp() and q.expires_at>clock_timestamp() and not q.cancel_requested and x.device_id=d.id and x.status='active'
 order by q.created_at,q.id for update of q skip locked limit 1;
 if not found then return jsonb_build_object('kind','applied','value',null);end if;
 select * into a from public.local_text_admissions where id=j.admission_id for share;
 select decision into s from public.local_text_selections where id=j.selection_id;
 if not public.local_text_eligible(j.project_id,j.owner_id,a.id,j.task_kind,j.input_hash)
 or s->>'modelDigest' is distinct from a.model_digest or s->>'evidenceHash' is distinct from a.evidence_hash
 or coalesce((s->>'validUntil')::timestamptz<=clock_timestamp(),true) then return jsonb_build_object('kind','refused','reason','SELECTION_STALE');end if;
 lease=least(clock_timestamp()+interval '45 seconds',j.expires_at);
 insert into public.local_text_attempts(id,job_id,device_id,claim_id,fence,input_hash,model_digest,admission_id,state) values(attempt,j.id,d.id,claim,j.fence+1,j.input_hash,a.model_digest,a.id,'claimed');
 update public.local_text_jobs set state='claimed',device_id=d.id,attempt_id=attempt,claim_id=claim,fence=fence+1,lease_until=lease,updated_at=clock_timestamp() where id=j.id returning * into j;
 return jsonb_build_object('kind','applied','value',jsonb_build_object('jobId',j.id,'attemptId',attempt,'deviceId',d.id,'claimId',claim,'fence',j.fence,'inputHash',j.input_hash,'selectionId',j.selection_id,'modelDigest',a.model_digest,
 'leaseUntil',to_char(lease at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'expiresAt',to_char(j.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'task',j.task));
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
 if t='completed' and j.state='reviewing' and j.result_hash is not distinct from p_event->>'resultHash' and j.result is not distinct from r then return jsonb_build_object('kind','duplicate','value',public.local_text_receipt(j.id));end if;
 if j.task is null or j.payload_expires_at<=clock_timestamp() or j.expires_at<=clock_timestamp() or j.lease_until is null or j.lease_until<=clock_timestamp() then return jsonb_build_object('kind','refused','reason','FENCED');end if;
 if j.cancel_requested then return jsonb_build_object('kind','refused','reason','CANCELLED');end if;
 select * into a from public.local_text_admissions where id=j.admission_id for share;
 if p_claim->>'modelDigest' is distinct from a.model_digest or not public.local_text_eligible(j.project_id,j.owner_id,a.id,j.task_kind,j.input_hash) then return jsonb_build_object('kind','refused','reason','ADMISSION_REFUSED');end if;
 if j.state='reconciling' then return jsonb_build_object('kind','refused','reason','RECONCILIATION_REQUIRES_VERIFIED_EVIDENCE');end if;
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
