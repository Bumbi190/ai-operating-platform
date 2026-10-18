-- Atlas durable review storage. Service-only; no dispatcher, route or lifecycle grant.
create schema atlas_code_review_private;
revoke all on schema atlas_code_review_private from public,anon,authenticated,service_role;
create table public.atlas_code_review_jobs(
 work_id uuid primary key references public.atlas_code_work_runs(work_id) on delete restrict,
 project_id uuid not null references public.projects(id),version bigint not null check(version between 0 and 18),
 data jsonb not null check(jsonb_typeof(data)='object' and (data->>'version')::bigint=version and data->>'workId'=work_id::text and data->>'projectId'=project_id::text)
);
alter table public.atlas_code_review_jobs enable row level security;
revoke all on public.atlas_code_review_jobs from public,anon,authenticated,service_role;
create table atlas_code_review_private.credentials(
 work_id uuid references public.atlas_code_review_jobs(work_id) on delete restrict,
 role text not null check(role in('atlas','worker','reviewer')),actor_id text not null,session_id text not null,
 token_hash text not null check(token_hash~'^[a-f0-9]{64}$'),candidate_version integer not null check(candidate_version between 0 and 2),
 revoked boolean not null default false,primary key(work_id,session_id),unique(work_id,actor_id),unique(work_id,token_hash),
 check((role='reviewer' and candidate_version in(1,2)) or(role in('atlas','worker') and candidate_version=0))
);
create unique index atlas_review_job_role on atlas_code_review_private.credentials(work_id,role,candidate_version);
alter table atlas_code_review_private.credentials enable row level security;
revoke all on atlas_code_review_private.credentials from public,anon,authenticated,service_role;

create function atlas_code_review_private.must(p_ok boolean) returns void language plpgsql set search_path='' as $$
begin if p_ok is distinct from true then raise exception 'review_storage_rejected';end if;end $$;
create function atlas_code_review_private.keys(p jsonb,k text[]) returns void language plpgsql set search_path='' as $$
begin
 perform atlas_code_review_private.must(p is not null and jsonb_typeof(p)='object');
 perform atlas_code_review_private.must((select array_agg(x order by x) from jsonb_object_keys(p)x)=(select array_agg(x order by x) from unnest(k)x));
end $$;
create function atlas_code_review_private.hash(p jsonb) returns text language sql immutable strict set search_path='' as $$
 select encode(extensions.digest(convert_to(public.atlas_code_work_canonical_json(p),'UTF8'),'sha256'),'hex')
$$;
create function atlas_code_review_private.num(p jsonb,lo bigint,hi bigint) returns void language plpgsql set search_path='' as $$
begin perform atlas_code_review_private.must(jsonb_typeof(p)='number' and p::text~'^(0|[1-9][0-9]*)$');perform atlas_code_review_private.must(p::text::numeric between lo and hi);end $$;
create function atlas_code_review_private.actor(p jsonb) returns void language plpgsql set search_path='' as $$
begin perform atlas_code_review_private.keys(p,array['actorId','sessionId']);perform atlas_code_review_private.must(p->>'actorId'~'^[A-Za-z0-9_.:-]{1,128}$' and p->>'sessionId'~'^[A-Za-z0-9_.:-]{1,128}$');end $$;
create function atlas_code_review_private.lock_parent(w uuid) returns public.atlas_code_work_runs language plpgsql security definer set search_path='' as $$
declare r public.atlas_code_work_runs;
begin
 lock table public.atlas_authorizations in share mode;
 select * into strict r from public.atlas_code_work_runs where work_id=w for update;
 return r;
end $$;
create function atlas_code_review_private.live(r public.atlas_code_work_runs,c jsonb) returns void language plpgsql security definer set search_path='' as $$
declare b public.atlas_code_brokers;expiry timestamptz;now_ms bigint;
begin
 select * into strict b from public.atlas_code_brokers where broker_id::text=r.broker_id for share;
 expiry:=public.atlas_code_work_authorization_expiry(r);now_ms:=floor(extract(epoch from clock_timestamp())*1000);
 perform atlas_code_review_private.must(b.status='active' and (b.expires_at is null or b.expires_at>clock_timestamp()) and b.host_id::text=r.broker_host_id and r.repository_id=any(b.allowed_repository_ids));
 perform atlas_code_review_private.must(r.state in('claimed','preparing','working','testing') and not r.cancel_requested and r.lease_until>clock_timestamp() and r.broker_token_expires_at>clock_timestamp() and expiry is not null);
 perform atlas_code_review_private.must(r.created_at+((r.admission#>>'{limits,maxTotalRuntimeSeconds}')::integer*interval '1 second')>clock_timestamp());
 perform atlas_code_review_private.must(c->'admission'=r.admission and c->>'admissionHash'=r.admission_hash and c#>>'{parent,workId}'=r.work_id::text and c#>>'{parent,claimId}'=r.claim_id::text and (c#>>'{parent,fence}')::bigint=r.fence and c#>>'{parent,brokerId}'=r.broker_id and c#>>'{parent,brokerHostId}'=r.broker_host_id);
 perform atlas_code_review_private.must((c->>'deadlineMs')::bigint>now_ms and (c->>'deadlineMs')::bigint<=floor(extract(epoch from expiry)*1000) and (c->>'authorizationExpiresAtMs')::bigint<=floor(extract(epoch from expiry)*1000));
end $$;
create function atlas_code_review_private.proof(r public.atlas_code_work_runs,p jsonb) returns void language plpgsql set search_path='' as $$
begin
 perform atlas_code_review_private.keys(p,array['workId','claimId','fence','brokerId','brokerHostId','brokerTokenHash']);
 perform atlas_code_review_private.must(p->>'workId'=r.work_id::text and p->>'claimId'=r.claim_id::text and (p->>'fence')::bigint=r.fence and p->>'brokerId'=r.broker_id and p->>'brokerHostId'=r.broker_host_id and p->>'brokerTokenHash'=r.broker_token_hash);
end $$;
create function atlas_code_review_private.config(r public.atlas_code_work_runs,c jsonb) returns void language plpgsql set search_path='' as $$
declare limits jsonb:='{"maxReviewSessions":2,"maxModelDispatchesPerSession":3,"maxMessages":12,"maxMessageBodyBytes":4096,"maxContextBytes":65536,"maxResultBytes":32768}';e record;
begin
 perform atlas_code_review_private.keys(c,array['admission','admissionHash','parent','createdAtMs','authorizationExpiresAtMs','targetHeadSha','policyHash','requiredChecks','limits','budget','deadlineMs','coordinator','worker']);
 perform atlas_code_review_private.keys(c->'parent',array['workId','claimId','fence','brokerId','brokerHostId']);
 perform atlas_code_review_private.keys(c->'limits',array['maxReviewSessions','maxModelDispatchesPerSession','maxMessages','maxMessageBodyBytes','maxContextBytes','maxResultBytes']);
 for e in select * from jsonb_each(limits) loop perform atlas_code_review_private.num(c->'limits'->e.key,1,e.value::text::bigint);end loop;
 perform atlas_code_review_private.keys(c->'budget',array['totalMicrousd','reviewerAllocationMicrousd']);
 perform atlas_code_review_private.num(c#>'{budget,totalMicrousd}',1,9007199254740991);
 perform atlas_code_review_private.num(c#>'{budget,reviewerAllocationMicrousd}',1,(c#>>'{budget,totalMicrousd}')::bigint);
 perform atlas_code_review_private.actor(c->'coordinator');perform atlas_code_review_private.actor(c->'worker');
 perform atlas_code_review_private.must(c#>>'{coordinator,actorId}'<>c#>>'{worker,actorId}' and c#>>'{coordinator,sessionId}'<>c#>>'{worker,sessionId}');
 perform atlas_code_review_private.num(c->'createdAtMs',0,9007199254740991);perform atlas_code_review_private.num(c->'deadlineMs',(c->>'createdAtMs')::bigint+1,9007199254740991);
 perform atlas_code_review_private.num(c->'authorizationExpiresAtMs',(c->>'deadlineMs')::bigint,9007199254740991);
 perform atlas_code_review_private.must((c->>'deadlineMs')::bigint-(c->>'createdAtMs')::bigint<=(r.admission#>>'{limits,maxTotalRuntimeSeconds}')::bigint*1000 and (c->>'deadlineMs')::bigint<=floor(extract(epoch from r.created_at)*1000)+(r.admission#>>'{limits,maxTotalRuntimeSeconds}')::bigint*1000);
 perform atlas_code_review_private.must((c->>'createdAtMs')::bigint between floor(extract(epoch from r.created_at)*1000) and floor(extract(epoch from clock_timestamp())*1000)+5000);
 perform atlas_code_review_private.must(c->>'targetHeadSha'~'^[a-f0-9]{40}$' and c->>'policyHash'=atlas_code_review_private.hash(jsonb_build_object('schema','atlas.code_review_policy.v1','limits',limits)));
 perform atlas_code_review_private.must(jsonb_typeof(c->'requiredChecks')='array' and jsonb_array_length(c->'requiredChecks') between 1 and jsonb_array_length(r.admission#>'{commands,approvedCommandIds}'));
 for e in select value v from jsonb_array_elements(c->'requiredChecks') loop
  perform atlas_code_review_private.keys(e.v,array['commandId','commandVersion','arguments','registryHash','argvHash','minPassedTests']);
  perform atlas_code_review_private.must(r.admission#>'{commands,approvedCommandIds}' ? (e.v->>'commandId') and e.v->>'registryHash'=r.command_registry_hash and e.v->>'argvHash'~'^[a-f0-9]{64}$' and e.v->>'commandVersion'='1' and jsonb_typeof(e.v->'arguments')='object');
  if e.v->>'commandId'='sdf1.proof.fixture_test' then perform atlas_code_review_private.num(e.v->'minPassedTests',1,9007199254740991);else perform atlas_code_review_private.must(e.v->'minPassedTests'='null'::jsonb);end if;
 end loop;
 perform atlas_code_review_private.must((select count(*)=count(distinct v->>'commandId') from jsonb_array_elements(c->'requiredChecks')v));
 perform atlas_code_review_private.must(octet_length(public.atlas_code_work_canonical_json(c))<=262144);
end $$;
create function atlas_code_review_private.add_role(w uuid,p jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform atlas_code_review_private.keys(p,array['role','actorId','sessionId','tokenHash','candidateVersion']);
 perform atlas_code_review_private.actor(jsonb_build_object('actorId',p->'actorId','sessionId',p->'sessionId'));
 perform atlas_code_review_private.must(p->>'tokenHash'~'^[a-f0-9]{64}$');
 insert into atlas_code_review_private.credentials(work_id,role,actor_id,session_id,token_hash,candidate_version) values(w,p->>'role',p->>'actorId',p->>'sessionId',p->>'tokenHash',(p->>'candidateVersion')::integer);
end $$;

create function public.atlas_code_review_initialize(p_work_id uuid,p_parent_proof jsonb,p_config jsonb,p_roles jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.atlas_code_work_runs;j public.atlas_code_review_jobs;data jsonb;a jsonb;expect_actor jsonb;
begin
 r:=atlas_code_review_private.lock_parent(p_work_id);perform atlas_code_review_private.proof(r,p_parent_proof);
 perform atlas_code_review_private.config(r,p_config);perform atlas_code_review_private.live(r,p_config);
 perform atlas_code_review_private.must(jsonb_typeof(p_roles)='array' and jsonb_array_length(p_roles)=2);
 select * into j from public.atlas_code_review_jobs where work_id=p_work_id for update;
 if found then
  perform atlas_code_review_private.must(j.data->'config'=p_config);
  for a in select value from jsonb_array_elements(p_roles)loop
   perform atlas_code_review_private.must(exists(select 1 from atlas_code_review_private.credentials where work_id=p_work_id and role=a->>'role' and actor_id=a->>'actorId' and session_id=a->>'sessionId' and token_hash=a->>'tokenHash' and not revoked));
  end loop;
  return j.data;
 end if;
 data:=jsonb_build_object('workId',p_work_id::text,'projectId',r.project_id::text,'version',0,'config',p_config,'candidates','[]'::jsonb,'messages',jsonb_build_object('workId',p_work_id::text,'projectId',r.project_id::text,'entries','[]'::jsonb),'commands','[]'::jsonb);
 insert into public.atlas_code_review_jobs values(p_work_id,r.project_id,0,data);
 for a in select value from jsonb_array_elements(p_roles)loop
  perform atlas_code_review_private.must(a->>'role' in('atlas','worker') and a->>'candidateVersion'='0');
  expect_actor:=case when a->>'role'='atlas' then p_config->'coordinator' else p_config->'worker' end;
  perform atlas_code_review_private.must(expect_actor=jsonb_build_object('actorId',a->'actorId','sessionId',a->'sessionId'));
  perform atlas_code_review_private.add_role(p_work_id,a);
 end loop;
 return data;
end $$;
create function public.atlas_code_review_read(p_work_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select data from public.atlas_code_review_jobs where work_id=p_work_id
$$;

create function atlas_code_review_private.snapshot(c jsonb,s jsonb,reviewer jsonb,cv integer) returns void language plpgsql set search_path='' as $$
declare a jsonb;packet jsonb;art jsonb;checks jsonb;expected_binding jsonb;
begin
 perform atlas_code_review_private.keys(s,array['schema','binding','assignment','candidateVersion','briefArtifactId','files','diffArtifactId','diffBytes','checks','artifacts','snapshotHash']);
 perform atlas_code_review_private.must(s->>'schema'='atlas.code_review_snapshot.v1' and (s->>'candidateVersion')::integer=cv);
 a:=s->'assignment';perform atlas_code_review_private.keys(a,array['workId','projectId','coordinator','worker','reviewer','claim','policyHash']);
 perform atlas_code_review_private.must(a->'coordinator'=c->'coordinator' and a->'worker'=c->'worker' and a->'reviewer'=reviewer and a->>'workId'=c#>>'{admission,workId}' and a->>'projectId'=c#>>'{admission,projectId}' and a->>'policyHash'=c->>'policyHash');
 perform atlas_code_review_private.actor(reviewer);
 perform atlas_code_review_private.must(reviewer->>'actorId' not in(c#>>'{coordinator,actorId}',c#>>'{worker,actorId}') and reviewer->>'sessionId' not in(c#>>'{coordinator,sessionId}',c#>>'{worker,sessionId}'));
 perform atlas_code_review_private.keys(a->'claim',array['id','fence','expiresAt']);
 perform atlas_code_review_private.must(a#>>'{claim,id}'~'^[A-Za-z0-9_.:-]{1,128}$' and a#>>'{claim,id}'<>c#>>'{parent,claimId}' and (a#>>'{claim,fence}')::bigint>=1 and (a#>>'{claim,expiresAt}')::timestamptz=to_timestamp(least((c->>'deadlineMs')::bigint,(c->>'authorizationExpiresAtMs')::bigint)::numeric/1000));
 select jsonb_agg(v order by v->>'commandId' collate "C") into checks from jsonb_array_elements(c->'requiredChecks')v;
 expected_binding:=jsonb_build_object('schema','atlas.code_review_binding.v1','workId',c#>>'{admission,workId}','projectId',c#>>'{admission,projectId}','repositoryId',c#>>'{admission,repository,repositoryId}','missionId',c#>>'{admission,governance,mission,id}','missionVersion',c#>'{admission,governance,mission,version}','missionHash',c#>>'{admission,governance,mission,hash}','admissionHash',c->>'admissionHash','delegationHash',c#>>'{admission,governance,delegation,hash}','workPackageHash',c#>>'{admission,governance,workPackage,hash}','baseSha',c#>>'{admission,repository,pinnedBaseSha}','targetRef',c#>>'{admission,repository,approvedBaseRef}','targetHeadSha',c->>'targetHeadSha','policyHash',c->>'policyHash','reviewSettingsHash',atlas_code_review_private.hash(jsonb_build_object('limits',c->'limits','totalMicrousd',c#>'{budget,totalMicrousd}','reviewerAllocationMicrousd',c#>'{budget,reviewerAllocationMicrousd}','deadlineMs',c->'deadlineMs','requiredChecks',checks)));
 perform atlas_code_review_private.must(s->'binding'=expected_binding);
 packet:=s-'snapshotHash';perform atlas_code_review_private.must(s->>'snapshotHash'=atlas_code_review_private.hash(jsonb_build_object('domain','atlas.code_review_snapshot.v1','packet',packet)) and octet_length(public.atlas_code_work_canonical_json(packet))<=(c#>>'{limits,maxContextBytes}')::bigint);
 perform atlas_code_review_private.must(jsonb_typeof(s->'artifacts')='array' and jsonb_array_length(s->'artifacts') between 1 and 64);
 for art in select value from jsonb_array_elements(s->'artifacts')loop
  perform atlas_code_review_private.keys(art,array['id','kind','body','sha256','byteLength']);
  perform atlas_code_review_private.must(jsonb_typeof(art->'body')='string' and art->>'sha256'=encode(extensions.digest(convert_to(art->>'body','UTF8'),'sha256'),'hex') and (art->>'byteLength')::bigint=octet_length(art->>'body'));
 end loop;
end $$;
create function atlas_code_review_private.report(s jsonb,r jsonb,phase text,max_bytes bigint) returns void language plpgsql set search_path='' as $$
declare m jsonb;
begin
 perform atlas_code_review_private.keys(r,array['schema','snapshotHash','phase','decision','findings','gaps','pendingQuestionIds','assignment','resultHash']);
 m:=r-array['assignment','resultHash'];
 perform atlas_code_review_private.must(r->>'schema'='atlas.code_review_result.v1' and r->>'phase'=phase and r->>'decision' in('passed','changes_requested','inconclusive') and r->>'snapshotHash'=s->>'snapshotHash' and r->'assignment'=s->'assignment');
 perform atlas_code_review_private.must(r->>'resultHash'=atlas_code_review_private.hash(jsonb_build_object('domain','atlas.bound_code_review_result.v1','result',m,'assignment',r->'assignment')) and octet_length(public.atlas_code_work_canonical_json(m))<=max_bytes);
 perform atlas_code_review_private.must(jsonb_typeof(r->'findings')='array' and jsonb_array_length(r->'findings')<=32 and jsonb_typeof(r->'gaps')='array' and jsonb_array_length(r->'gaps')<=32 and jsonb_typeof(r->'pendingQuestionIds')='array' and jsonb_array_length(r->'pendingQuestionIds')<=32);
 if phase='final' and r->>'decision'='passed' then
  perform atlas_code_review_private.must(r->'gaps'='[]'::jsonb and r->'pendingQuestionIds'='[]'::jsonb and not exists(select 1 from jsonb_array_elements(r->'findings')f where f->>'severity' is distinct from 'minor'));
 end if;
end $$;
create function public.atlas_code_review_apply(p_work_id uuid,p_role text,p_session_id text,p_token_hash text,p_expected_version bigint,p_command jsonb,p_command_hash text,p_next jsonb,p_new_reviewer jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare parent public.atlas_code_work_runs;j public.atlas_code_review_jobs;k atlas_code_review_private.credentials;
 c jsonb;actor jsonb;old_receipt jsonb;receipt jsonb;kind text;cv integer;old_candidate jsonb;new_candidate jsonb;expected_candidates jsonb;expected_messages jsonb;payload_ref text;now_ms bigint;input_snapshot jsonb;s jsonb;model jsonb;m jsonb;from_actor jsonb;to_actor jsonb;prior jsonb;ref jsonb;
begin
 parent:=atlas_code_review_private.lock_parent(p_work_id);
 select * into strict j from public.atlas_code_review_jobs where work_id=p_work_id for update;
 select * into strict k from atlas_code_review_private.credentials where work_id=p_work_id and role=p_role and session_id=p_session_id and token_hash=p_token_hash and not revoked for update;
 c:=j.data->'config';actor:=jsonb_build_object('role',k.role,'actorId',k.actor_id,'sessionId',k.session_id);
 perform atlas_code_review_private.must(p_command_hash=atlas_code_review_private.hash(jsonb_build_object('domain','atlas.code_review_storage_command.v1','command',p_command,'actor',actor)));
 kind:=p_command->>'kind';
 if kind='freeze' then perform atlas_code_review_private.keys(p_command,array['id','kind','snapshotInput']);cv:=(p_command#>>'{snapshotInput,candidateVersion}')::integer;
 elsif kind='report' then perform atlas_code_review_private.keys(p_command,array['id','kind','candidateVersion','result']);cv:=(p_command->>'candidateVersion')::integer;
 else perform atlas_code_review_private.must(kind='message');perform atlas_code_review_private.keys(p_command,array['id','kind','candidateVersion','recipientRole','body']);cv:=(p_command->>'candidateVersion')::integer;end if;
 perform atlas_code_review_private.must(p_command->>'id'~'^[A-Za-z0-9_.:-]{1,128}$' and cv in(1,2));
 select v into old_receipt from jsonb_array_elements(j.data->'commands')v where v->>'id'=p_command->>'id';
 if found then
  perform atlas_code_review_private.must(old_receipt->>'commandHash'=p_command_hash);
  return jsonb_build_object('outcome','replayed','jobVersion',(old_receipt->>'jobVersion')::bigint,'commandId',p_command->>'id','productionAuthority',false);
 end if;
 perform atlas_code_review_private.live(parent,c);
 perform atlas_code_review_private.must(j.version=p_expected_version and j.version<18);
 perform atlas_code_review_private.keys(p_next,array['workId','projectId','version','config','candidates','messages','commands']);
 perform atlas_code_review_private.must(octet_length(public.atlas_code_work_canonical_json(p_next))<=1048576 and p_next->'config'=c and p_next->>'workId'=j.work_id::text and p_next->>'projectId'=j.project_id::text and (p_next->>'version')::bigint=j.version+1);
 expected_candidates:=j.data->'candidates';expected_messages:=j.data->'messages';
 if kind='freeze' then
  perform atlas_code_review_private.must(k.role='atlas' and cv=jsonb_array_length(expected_candidates)+1 and cv<=least(2,(c#>>'{limits,maxReviewSessions}')::integer,(c#>>'{admission,limits,maxWorkerIterations}')::integer));
  if cv=2 then perform atlas_code_review_private.must(expected_candidates#>>'{0,final,decision}'='changes_requested');end if;
  new_candidate:=p_next->'candidates'->(cv-1);perform atlas_code_review_private.keys(new_candidate,array['version','snapshot','preliminary','final']);
  perform atlas_code_review_private.must((new_candidate->>'version')::integer=cv and new_candidate->'preliminary'='null'::jsonb and new_candidate->'final'='null'::jsonb);
  perform atlas_code_review_private.keys(p_new_reviewer,array['role','actorId','sessionId','tokenHash','candidateVersion']);
  perform atlas_code_review_private.must(p_new_reviewer->>'role'='reviewer' and (p_new_reviewer->>'candidateVersion')::integer=cv);
  s:=new_candidate->'snapshot';perform atlas_code_review_private.snapshot(c,s,jsonb_build_object('actorId',p_new_reviewer->'actorId','sessionId',p_new_reviewer->'sessionId'),cv);
  if cv=2 then
   perform atlas_code_review_private.must((s-array['binding','assignment','snapshotHash','candidateVersion']) is distinct from (expected_candidates#>'{0,snapshot}'-array['binding','assignment','snapshotHash','candidateVersion']));
   perform atlas_code_review_private.must(s#>>'{assignment,claim,id}'<>expected_candidates#>>'{0,snapshot,assignment,claim,id}');
  end if;
  select coalesce(jsonb_agg(a-array['sha256','byteLength'] order by a->>'id' collate "C"),'[]'::jsonb) into ref from jsonb_array_elements(s->'artifacts')a;
  input_snapshot:=jsonb_set(s-'snapshotHash','{artifacts}',ref);
  perform atlas_code_review_private.must(input_snapshot=p_command->'snapshotInput');
  expected_candidates:=expected_candidates||jsonb_build_array(new_candidate);payload_ref:=s->>'snapshotHash';
 else
  perform atlas_code_review_private.must((p_new_reviewer is null or p_new_reviewer='null'::jsonb) and cv=jsonb_array_length(expected_candidates));
  old_candidate:=expected_candidates->(cv-1);s:=old_candidate->'snapshot';
  perform atlas_code_review_private.must(old_candidate->'final'='null'::jsonb);
  if k.role='reviewer' then perform atlas_code_review_private.must(k.candidate_version=cv and k.actor_id=s#>>'{assignment,reviewer,actorId}' and k.session_id=s#>>'{assignment,reviewer,sessionId}');end if;
  if kind='report' then
   perform atlas_code_review_private.must(k.role='reviewer');
   model:=p_command->'result';
   if model->>'phase'='preliminary' then perform atlas_code_review_private.must(old_candidate->'preliminary'='null'::jsonb);
   else perform atlas_code_review_private.must(model->>'phase'='final' and old_candidate->'preliminary'<>'null'::jsonb);end if;
   new_candidate:=p_next->'candidates'->(cv-1);m:=new_candidate->(model->>'phase');
   perform atlas_code_review_private.report(s,m,model->>'phase',(c#>>'{limits,maxResultBytes}')::bigint);
   perform atlas_code_review_private.must(m-array['assignment','resultHash']=model);
   expected_candidates:=jsonb_set(expected_candidates,array[(cv-1)::text],jsonb_set(old_candidate,array[model->>'phase'],m));payload_ref:=m->>'resultHash';
  else
   perform atlas_code_review_private.must(jsonb_array_length(expected_messages->'entries')<(c#>>'{limits,maxMessages}')::integer);
   m:=p_next#>'{messages,entries}'->jsonb_array_length(expected_messages->'entries');
   perform atlas_code_review_private.keys(m,array['schema','id','snapshotHash','kind','body','replyTo','artifactIds','sequence','workId','projectId','from','to','assignmentHash','observedAt','messageHash']);
   from_actor:=jsonb_build_object('role',k.role,'actorId',k.actor_id,'sessionId',k.session_id);
   perform atlas_code_review_private.must(p_command->>'recipientRole' in('atlas','worker','reviewer') and p_command->>'recipientRole'<>k.role);
   to_actor:=jsonb_build_object('role',p_command->>'recipientRole')||(case when p_command->>'recipientRole'='atlas' then s#>'{assignment,coordinator}' else s->'assignment'->(p_command->>'recipientRole') end);
   perform atlas_code_review_private.must(m->'from'=from_actor and m->'to'=to_actor and m->>'workId'=j.work_id::text and m->>'projectId'=j.project_id::text and m->>'snapshotHash'=s->>'snapshotHash' and (m->>'sequence')::integer=jsonb_array_length(expected_messages->'entries')+1);
   perform atlas_code_review_private.must(m->>'schema'='atlas.code_review_message.v1' and m->>'id'~'^[A-Za-z0-9_.:-]{1,128}$' and m->>'kind' in('question','answer','finding_reference','correction_request','blocker') and jsonb_typeof(m->'body')='string' and length(btrim(m->>'body'))>0 and octet_length(m->>'body')<=(c#>>'{limits,maxMessageBodyBytes}')::bigint);
   perform atlas_code_review_private.must(m-array['sequence','workId','projectId','from','to','assignmentHash','observedAt','messageHash']=p_command->'body');
   perform atlas_code_review_private.must(m->>'assignmentHash'=atlas_code_review_private.hash(s->'assignment') and m->>'messageHash'=atlas_code_review_private.hash(jsonb_build_object('domain','atlas.code_review_message.v1','entry',m-'messageHash')));
   perform atlas_code_review_private.must(not exists(select 1 from jsonb_array_elements(expected_messages->'entries')v where v->>'id'=m->>'id'));
   perform atlas_code_review_private.must(not(p_command->>'recipientRole'='reviewer' and old_candidate->'preliminary'='null'::jsonb));
   if m->>'kind' in('finding_reference','correction_request') then perform atlas_code_review_private.must(k.role='reviewer');end if;
   if m->'replyTo'<>'null'::jsonb then
    select v into prior from jsonb_array_elements(expected_messages->'entries')v where v->>'id'=m->>'replyTo' and v->>'snapshotHash'=s->>'snapshotHash';
    perform atlas_code_review_private.must(prior is not null);
   end if;
   if m->>'kind'='answer' then perform atlas_code_review_private.must(prior->>'kind'='question' and prior->'to'=from_actor and prior->'from'=to_actor);end if;
   perform atlas_code_review_private.must(jsonb_typeof(m->'artifactIds')='array');
   for ref in select value from jsonb_array_elements(m->'artifactIds')loop perform atlas_code_review_private.must(exists(select 1 from jsonb_array_elements(s->'artifacts')a where a->'id'=ref));end loop;
   expected_messages:=jsonb_set(expected_messages,'{entries}',(expected_messages->'entries')||jsonb_build_array(m));payload_ref:=m->>'id';
  end if;
 end if;
 perform atlas_code_review_private.must(p_next->'candidates'=expected_candidates and p_next->'messages'=expected_messages);
 receipt:=p_next->'commands'->j.version::integer;
 perform atlas_code_review_private.keys(receipt,array['id','kind','role','actorId','sessionId','candidateVersion','commandHash','jobVersion','observedAtMs','payloadRef']);
 now_ms:=floor(extract(epoch from clock_timestamp())*1000);
 perform atlas_code_review_private.num(receipt->'observedAtMs',coalesce((j.data->'commands'->(j.version::integer-1)->>'observedAtMs')::bigint,(c->>'createdAtMs')::bigint),least(now_ms+5000,(c->>'deadlineMs')::bigint-1));
 perform atlas_code_review_private.must(receipt=jsonb_build_object('id',p_command->>'id','kind',kind,'role',k.role,'actorId',k.actor_id,'sessionId',k.session_id,'candidateVersion',cv,'commandHash',p_command_hash,'jobVersion',j.version+1,'observedAtMs',receipt->'observedAtMs','payloadRef',payload_ref));
 perform atlas_code_review_private.must(p_next->'commands'=(j.data->'commands')||jsonb_build_array(receipt));
 if kind='message' then perform atlas_code_review_private.must((m->>'observedAt')::timestamptz=to_timestamp((receipt->>'observedAtMs')::numeric/1000));end if;
 if kind='freeze' then perform atlas_code_review_private.add_role(p_work_id,p_new_reviewer);end if;
 update public.atlas_code_review_jobs set version=version+1,data=p_next where work_id=p_work_id;
 return jsonb_build_object('outcome','appended','jobVersion',j.version+1,'commandId',p_command->>'id','productionAuthority',false);
end $$;

-- Deny mutation of the ledger except through the validated append RPC.
create function atlas_code_review_private.no_delete() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'review_history_immutable';end $$;
create trigger atlas_review_no_delete before delete on public.atlas_code_review_jobs for each statement execute function atlas_code_review_private.no_delete();
create trigger atlas_review_no_truncate before truncate on public.atlas_code_review_jobs for each statement execute function atlas_code_review_private.no_delete();
revoke all on all functions in schema atlas_code_review_private from public,anon,authenticated,service_role;
revoke all on function public.atlas_code_review_initialize(uuid,jsonb,jsonb,jsonb),public.atlas_code_review_read(uuid),public.atlas_code_review_apply(uuid,text,text,text,bigint,jsonb,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.atlas_code_review_initialize(uuid,jsonb,jsonb,jsonb),public.atlas_code_review_read(uuid),public.atlas_code_review_apply(uuid,text,text,text,bigint,jsonb,text,jsonb,jsonb) to service_role;
