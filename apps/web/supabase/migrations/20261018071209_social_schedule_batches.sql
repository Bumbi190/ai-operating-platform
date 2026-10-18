
-- Exact owner-approved scheduling. No runner or dispatch is activated by this migration.
create function public.social_schedule_now() returns timestamptz language sql volatile security invoker set search_path='' as $$select clock_timestamp()$$;
create function public.social_schedule_fields(v jsonb,required text[],optional text[] default '{}') returns void language plpgsql immutable security invoker set search_path='' as $fn$
begin
 if jsonb_typeof(v) is distinct from 'object' or not(v?&required) or exists(select 1 from jsonb_object_keys(v) k where not(k=any(required||optional))) then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
end $fn$;
create function public.social_schedule_canonical(v jsonb) returns text language plpgsql immutable security invoker set search_path='' as $fn$
declare result text;
begin
 if jsonb_typeof(v)='object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.social_schedule_canonical(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(v);return result;end if;
 if jsonb_typeof(v)='array' then select '['||coalesce(string_agg(public.social_schedule_canonical(value),',' order by ord),'')||']' into result from jsonb_array_elements(v) with ordinality a(value,ord);return result;end if;
 return v::text;
end $fn$;
create function public.social_schedule_resolve_minute(v text) returns timestamptz language plpgsql immutable security invoker set search_path='' as $fn$
declare naive timestamptz;c timestamptz;result timestamptz;matches integer=0;offset_minutes integer;
begin
 if v is null or v !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 naive=v::timestamp at time zone 'UTC';
 if to_char(naive at time zone 'UTC','YYYY-MM-DD"T"HH24:MI')<>v then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 foreach offset_minutes in array array[60,120] loop
  c=naive-make_interval(mins=>offset_minutes);
  if to_char(c at time zone 'Europe/Stockholm','YYYY-MM-DD"T"HH24:MI')=v then matches=matches+1;result=c;end if;
 end loop;
 if matches<>1 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 return result;
end $fn$;
create table public.social_schedule_batches(
 id uuid primary key default gen_random_uuid(),batch_id uuid not null,project_id uuid not null references public.projects,
 sequence integer not null check(sequence>0),manifest jsonb not null,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 created_by uuid not null references auth.users,created_at timestamptz not null default clock_timestamp(),idempotency_key text not null,input_data jsonb not null,
 unique(id,project_id),unique(batch_id,sequence),unique(project_id,idempotency_key));
create table public.social_schedule_decisions(
 id uuid primary key default gen_random_uuid(),project_id uuid not null,batch_revision_id uuid not null,
 action text not null check(action in ('approve','revoke')),actor uuid not null references auth.users,
 approval_id uuid references public.social_schedule_decisions,reason text,created_at timestamptz not null default clock_timestamp(),
 idempotency_key text not null,input_data jsonb not null,
 foreign key(batch_revision_id,project_id) references public.social_schedule_batches(id,project_id),
 unique(id,project_id),unique(project_id,idempotency_key),
 check((action='approve' and approval_id is null) or (action='revoke' and approval_id is not null)));
create unique index social_schedule_one_approval on public.social_schedule_decisions(batch_revision_id) where action='approve';
create unique index social_schedule_one_revocation on public.social_schedule_decisions(approval_id) where action='revoke';
create table public.social_schedule_jobs(
 id uuid primary key default gen_random_uuid(),project_id uuid not null,batch_revision_id uuid not null,approval_id uuid not null,
 post_id uuid not null,revision_id uuid not null,revision_sha256 text not null,channel text not null check(channel in ('facebook','instagram')),
 occasion_id uuid not null,scheduled_at timestamptz not null,expires_at timestamptz not null,item jsonb not null,release_month text,
 state text not null default 'queued' check(state in ('queued','claimed','waiting','published','failed','uncertain','blocked','cancelled','missed')),
 version integer not null default 1 check(version>0),claim_id uuid,worker_id text,lease_expires_at timestamptz,publication_id uuid,reason text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 foreign key(batch_revision_id,project_id) references public.social_schedule_batches(id,project_id),
 foreign key(approval_id,project_id) references public.social_schedule_decisions(id,project_id),
 foreign key(revision_id,post_id,project_id,revision_sha256) references public.social_content_revisions(id,post_id,project_id,sha256),
 foreign key(publication_id,project_id) references public.social_publications(id,project_id),
 unique(id,project_id),unique(project_id,post_id,revision_id),
 check(expires_at=scheduled_at+interval '10 minutes'),
 check(release_month is null or release_month~'^20[0-9]{2}-(0[1-9]|1[0-2])$'));
-- Cancelled pre-send reservations can be replaced only through a newly reviewed revision.
-- Published/uncertain/missed reservations still block another batch for that month.
create unique index social_schedule_month_channel on public.social_schedule_jobs(project_id,release_month,channel) where release_month is not null and state<>'cancelled';
create index social_schedule_due on public.social_schedule_jobs(scheduled_at,id) where state in ('queued','waiting','claimed');
create table public.social_schedule_events(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,job_id uuid,batch_revision_id uuid,
 event text not null,actor_kind text not null check(actor_kind in ('owner','worker')),actor uuid references auth.users,worker_id text,
 details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp(),
 foreign key(job_id,project_id) references public.social_schedule_jobs(id,project_id),
 foreign key(batch_revision_id,project_id) references public.social_schedule_batches(id,project_id),
 check((actor_kind='owner' and actor is not null and worker_id is null) or (actor_kind='worker' and actor is null and worker_id is not null)));
create table public.social_monthly_release_rules(
 project_id uuid primary key references public.projects,rule jsonb not null,updated_by uuid not null references auth.users,updated_at timestamptz not null default clock_timestamp());
create table public.social_monthly_release_evidence(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,release_month text not null check(release_month~'^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 catalog_sha256 text not null check(catalog_sha256~'^[a-f0-9]{64}$'),kind text not null default 'owner_verified_access' check(kind='owner_verified_access'),
 customer_view_url text not null,verified_by uuid not null references auth.users,verified_at timestamptz not null default clock_timestamp(),unique(id,project_id));
alter table public.social_publications add column authority_source text not null default 'manual',add column job_id uuid,
 add constraint social_publication_authority check((authority_source='manual' and job_id is null) or (authority_source='scheduled' and job_id is not null)),
 add foreign key(job_id,project_id) references public.social_schedule_jobs(id,project_id);
alter table public.social_publication_events alter column actor drop not null,
 add column actor_kind text not null default 'user' check(actor_kind in ('user','worker')),add column job_id uuid,
 add foreign key(job_id,project_id) references public.social_schedule_jobs(id,project_id),
 add constraint social_publication_actor check((actor_kind='user' and actor is not null and job_id is null) or (actor_kind='worker' and actor is null and job_id is not null));
alter table public.social_schedule_batches enable row level security;
revoke all on public.social_schedule_batches from public,anon,authenticated,service_role;
grant select,insert on public.social_schedule_batches to service_role;
alter table public.social_schedule_decisions enable row level security;
revoke all on public.social_schedule_decisions from public,anon,authenticated,service_role;
grant select,insert on public.social_schedule_decisions to service_role;
alter table public.social_schedule_jobs enable row level security;
revoke all on public.social_schedule_jobs from public,anon,authenticated,service_role;
grant select,insert on public.social_schedule_jobs to service_role;
alter table public.social_schedule_events enable row level security;
revoke all on public.social_schedule_events from public,anon,authenticated,service_role;
grant select,insert on public.social_schedule_events to service_role;
alter table public.social_monthly_release_rules enable row level security;
revoke all on public.social_monthly_release_rules from public,anon,authenticated,service_role;
grant select,insert on public.social_monthly_release_rules to service_role;
alter table public.social_monthly_release_evidence enable row level security;
revoke all on public.social_monthly_release_evidence from public,anon,authenticated,service_role;
grant select,insert on public.social_monthly_release_evidence to service_role;
grant update on public.social_schedule_jobs to service_role;
grant update on public.social_monthly_release_rules to service_role;
create trigger social_schedule_batches_immutable before update or delete on public.social_schedule_batches for each row execute function public.social_launch_immutable();
create trigger social_schedule_batches_no_truncate before truncate on public.social_schedule_batches for each statement execute function public.social_launch_immutable();
create trigger social_schedule_decisions_immutable before update or delete on public.social_schedule_decisions for each row execute function public.social_launch_immutable();
create trigger social_schedule_decisions_no_truncate before truncate on public.social_schedule_decisions for each statement execute function public.social_launch_immutable();
create trigger social_schedule_events_immutable before update or delete on public.social_schedule_events for each row execute function public.social_launch_immutable();
create trigger social_schedule_events_no_truncate before truncate on public.social_schedule_events for each statement execute function public.social_launch_immutable();
create trigger social_monthly_release_evidence_immutable before update or delete on public.social_monthly_release_evidence for each row execute function public.social_launch_immutable();
create trigger social_monthly_release_evidence_no_truncate before truncate on public.social_monthly_release_evidence for each statement execute function public.social_launch_immutable();
create or replace function public.social_publication_record(r public.social_publications) returns jsonb language sql immutable security invoker set search_path='' as $fn$
 select jsonb_build_object('id',r.id,'projectId',r.project_id,'postId',r.post_id,'revisionId',r.revision_id,'sha256',r.sha256,'decisionId',r.decision_id,'bindingId',r.binding_id,'channel',r.channel,'accountId',r.account_id,'accountLabel',r.account_label,'state',r.state,'version',r.version,'containerId',r.container_id,'providerId',r.provider_id,'permalink',r.permalink,'failureCode',r.failure_code,'confirmation',r.confirmation,'requestedAt',r.requested_at,'updatedAt',r.updated_at,'reconciledAt',r.reconciled_at,'authoritySource',r.authority_source,'jobId',r.job_id);
$fn$;

create function public.social_schedule_item_guard(p_project uuid,v jsonb) returns public.social_content_revisions language plpgsql security invoker set search_path='' as $fn$
declare r public.social_content_revisions;reasons text[];
begin
 perform public.social_schedule_fields(v,array['postId','revisionId','sha256','decisionId','planRevisionId','bindingId','accountId','channel','asset','localMinute','scheduledAt','expiresAt','occasionId','kind','releaseCondition']);
 perform public.social_schedule_fields(v->'asset',array['id','sha256']);
 select c.* into r from public.social_content_posts p join public.social_content_revisions c on c.id=p.current_revision_id and c.post_id=p.id and c.project_id=p.project_id
 where p.project_id=p_project and p.id=(v->>'postId')::uuid and c.id=(v->>'revisionId')::uuid and c.sha256=v->>'sha256';
 if r.id is null or r.plan_revision_id is distinct from (v->>'planRevisionId')::uuid or r.binding_id is distinct from (v->>'bindingId')::uuid
 or r.binding->>'accountId' is distinct from v->>'accountId' or r.draft->>'channel' is distinct from v->>'channel'
 or r.draft->>'scheduledAt' is distinct from v->>'scheduledAt'
 or not exists(select 1 from public.social_content_decisions d where d.id=(v->>'decisionId')::uuid and d.project_id=p_project and d.post_id=r.post_id and d.revision_id=r.id and d.sha256=r.sha256 and d.decision='approve')
 then raise exception 'SOCIAL_SCHEDULE_REVIEW_REQUIRED';end if;
 reasons=array_remove(array_remove(public.social_content_requirements(r.id),'activation_required'),'time_passed');
 if array_length(reasons,1) is not null then raise exception 'SOCIAL_SCHEDULE_REVIEW_REQUIRED';end if;
 if r.draft->>'format'<>'image' or r.draft->>'channel' not in ('facebook','instagram') or r.draft->>'channel'='instagram' and char_length(r.draft->>'text')>2200
 or jsonb_array_length(r.media)<>1 or jsonb_array_length(r.draft->'mediaIds')<>1
 or r.media->0->>'id' is distinct from v->'asset'->>'id' or r.media->0->>'sha256' is distinct from v->'asset'->>'sha256'
 or r.media->0->>'mimeType'<>'image/jpeg' or r.draft->'mediaIds'->>0 is distinct from v->'asset'->>'id'
 or r.draft->>'linkUrl' is not null and position(r.draft->>'linkUrl' in r.draft->>'text')=0
 or not exists(select 1 from public.assets a where a.project_id=p_project and a.id=(v->'asset'->>'id')::uuid and a.status='active' and a.kind='image' and a.mime_type='image/jpeg' and a.checksum_sha256=v->'asset'->>'sha256' and a.byte_size between 1 and 8388608 and (a.width is null or a.width between 320 and 1440) and (a.height is null or a.height>0) and (a.width is null or a.height is null or a.width::numeric/nullif(a.height,0) between 0.8 and 1.91))
 then raise exception 'SOCIAL_SCHEDULE_REVIEW_REQUIRED';end if;
 return r;
end $fn$;
create function public.social_schedule_validate_manifest(p_project uuid,v jsonb) returns void language plpgsql security invoker set search_path='' as $fn$
declare item jsonb;t timestamptz;expiry timestamptz;condition jsonb;
begin
 perform public.social_schedule_fields(v,array['projectId','items']);
 if v->>'projectId' is distinct from p_project::text or jsonb_typeof(v->'items') is distinct from 'array' or jsonb_array_length(v->'items') not between 1 and 6 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 for item in select value from jsonb_array_elements(v->'items') loop
  perform public.social_schedule_item_guard(p_project,item);
  t=public.social_schedule_resolve_minute(item->>'localMinute');expiry=(item->>'expiresAt')::timestamptz;
  if t<=public.social_schedule_now() or t>public.social_schedule_now()+interval '366 days'
  or item->>'scheduledAt' is distinct from to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') or expiry<>t+interval '10 minutes'
  or coalesce(item->>'accountId','') !~ '^[0-9]{1,80}$' or coalesce(item->>'kind','') not in ('ordinary','month_release')
  or coalesce(item->>'occasionId','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
  condition=item->'releaseCondition';
  if item->>'kind'='ordinary' then if condition is distinct from 'null'::jsonb then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
  else
   perform public.social_schedule_fields(condition,array['releaseMonth','catalogSha256']);
   if coalesce(condition->>'releaseMonth','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or coalesce(condition->>'catalogSha256','') !~ '^[a-f0-9]{64}$'
   or item->>'localMinute' is distinct from (condition->>'releaseMonth')||'-01T20:30' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
  end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(v->'items') a group by a->>'postId' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(v->'items') a group by a->>'occasionId',a->>'channel' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(v->'items') a group by a->>'occasionId' having count(*)>2 or count(distinct a->>'scheduledAt')>1 or count(distinct a->>'kind')>1 or count(distinct (a->'releaseCondition')::text)>1)
 or exists(select 1 from jsonb_array_elements(v->'items') a group by date_trunc('week',(a->>'scheduledAt')::timestamptz at time zone 'Europe/Stockholm') having count(distinct a->>'occasionId')>3)
 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
end $fn$;
create function public.social_schedule_revision(r public.social_content_revisions) returns jsonb language sql immutable security invoker set search_path='' as $fn$
 select jsonb_build_object('id',r.id,'sequence',r.sequence,'sha256',r.sha256,'planRevisionId',r.plan_revision_id,'draft',r.draft,'media',r.media,'binding',r.binding,'createdAt',r.created_at);
$fn$;
create function public.social_schedule_snapshot(j public.social_schedule_jobs) returns jsonb language sql stable security invoker set search_path='' as $fn$
 select jsonb_build_object('projectId',j.project_id,'manifestSha256',b.sha256,'approvalId',j.approval_id,'item',j.item,'revision',public.social_schedule_revision(c),'publication',case when p.id is null then null else public.social_publication_record(p) end)
 from public.social_schedule_batches b join public.social_content_revisions c on c.id=j.revision_id and c.post_id=j.post_id and c.project_id=j.project_id left join public.social_publications p on p.id=j.publication_id and p.project_id=j.project_id where b.id=j.batch_revision_id and b.project_id=j.project_id;
$fn$;
create function public.social_schedule_batch_view(b public.social_schedule_batches) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare a public.social_schedule_decisions;jobs jsonb;revoked boolean;
begin
 select * into a from public.social_schedule_decisions where batch_revision_id=b.id and project_id=b.project_id and action='approve';
 revoked=exists(select 1 from public.social_schedule_decisions where approval_id=a.id and action='revoke');
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'batchId',b.batch_id,'postId',j.post_id,'channel',j.channel,'state',j.state,'scheduledAt',j.scheduled_at,'expiresAt',j.expires_at,'publicationId',j.publication_id,'reason',j.reason,'version',j.version) order by j.scheduled_at,j.channel),'[]') into jobs from public.social_schedule_jobs j where j.batch_revision_id=b.id and j.project_id=b.project_id;
 return jsonb_build_object('projectId',b.project_id,'batchId',b.batch_id,'revisionId',b.id,'sha256',b.sha256,'status',case when revoked then 'revoked' when a.id is not null then 'approved' else 'proposal' end,'manifest',b.manifest,'approval',case when a.id is null then null else jsonb_build_object('id',a.id,'approvedBy',a.actor,'approvedAt',a.created_at) end,'jobs',jobs,'version',1+(select count(*) from public.social_schedule_decisions where batch_revision_id=b.id));
end $fn$;
create function public.social_schedule_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare batches jsonb;rule jsonb;evidence jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_schedule_fields(p_input,array['projectId']);
 select coalesce(jsonb_agg(public.social_schedule_batch_view(b) order by b.created_at desc),'[]') into batches from (select * from public.social_schedule_batches a where a.project_id=(p_input->>'projectId')::uuid and not exists(select 1 from public.social_schedule_batches later where later.batch_id=a.batch_id and later.sequence>a.sequence) order by a.created_at desc limit 100) b;
 select r.rule into rule from public.social_monthly_release_rules r where r.project_id=(p_input->>'projectId')::uuid;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'releaseMonth',e.release_month,'catalogSha256',e.catalog_sha256,'kind',e.kind,'verifiedAt',e.verified_at) order by e.verified_at desc),'[]') into evidence from (select * from public.social_monthly_release_evidence where project_id=(p_input->>'projectId')::uuid order by verified_at desc limit 24) e;
 return jsonb_build_object('projectId',p_input->>'projectId','batches',batches,'monthlyRule',rule,'releaseEvidence',evidence);
end $fn$;

create function public.social_schedule_cancel_jobs(p_approval uuid,p_actor uuid,p_reason text) returns void language plpgsql security invoker set search_path='' as $fn$
declare j public.social_schedule_jobs;r public.social_publications;next_state text;old_state text;
begin
 for j in select * from public.social_schedule_jobs where approval_id=p_approval and state not in ('published','failed','uncertain','cancelled') for update loop
  select * into r from public.social_publications where id=j.publication_id for update;
  next_state=case when r.state='published' then 'published' when r.state in ('creating','publishing','uncertain') then 'uncertain' else 'cancelled' end;
  if r.state in ('creating','publishing') then
   old_state=r.state;
   update public.social_publications set state='uncertain',version=version+1,updated_at=public.social_schedule_now(),failure_code='receipt_unavailable',capability_hash=null,capability_expires_at=null where id=r.id returning * into r;
   insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,details) values(r.id,r.project_id,'uncertain',old_state,'uncertain',r.version,p_actor,jsonb_build_object('reason',p_reason,'jobId',j.id));
  end if;
  update public.social_schedule_jobs set state=next_state,version=version+1,reason=p_reason,claim_id=null,lease_expires_at=null,updated_at=public.social_schedule_now() where id=j.id;
  insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,actor,details) values(j.project_id,j.id,j.batch_revision_id,'revoked','owner',p_actor,jsonb_build_object('reason',p_reason,'state',next_state));
 end loop;
end $fn$;
create function public.social_schedule_propose(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid;previous public.social_schedule_batches;b public.social_schedule_batches;a public.social_schedule_decisions;batch uuid;seq integer;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform public.social_schedule_fields(p_input,array['projectId','manifest','expectedRevisionId','idempotencyKey']);
 if coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 perform 1 from public.projects where id=project for update;perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_content_active(project);
 select * into b from public.social_schedule_batches where project_id=project and idempotency_key=p_input->>'idempotencyKey';
 if b.id is not null then if b.input_data is distinct from p_input then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;return public.social_schedule_batch_view(b);end if;
 perform public.social_schedule_validate_manifest(project,p_input->'manifest');
 if p_input->>'expectedRevisionId' is null then batch=gen_random_uuid();seq=1;
 else
  select * into previous from public.social_schedule_batches where id=(p_input->>'expectedRevisionId')::uuid and project_id=project;
  if previous.id is null or exists(select 1 from public.social_schedule_batches where batch_id=previous.batch_id and sequence>previous.sequence) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
  batch=previous.batch_id;seq=previous.sequence+1;
  select * into a from public.social_schedule_decisions d where d.batch_revision_id=previous.id and d.action='approve' and not exists(select 1 from public.social_schedule_decisions revoke where revoke.approval_id=d.id);
  if a.id is not null then
   insert into public.social_schedule_decisions(project_id,batch_revision_id,action,actor,approval_id,reason,idempotency_key,input_data)
   values(project,previous.id,'revoke',(p_principal->>'userId')::uuid,a.id,'revision_changed','revision-'||a.id,jsonb_build_object('newProposalKey',p_input->>'idempotencyKey'));
   perform public.social_schedule_cancel_jobs(a.id,(p_principal->>'userId')::uuid,'revision_changed');
  end if;
 end if;
 insert into public.social_schedule_batches(batch_id,project_id,sequence,manifest,sha256,created_by,idempotency_key,input_data)
 values(batch,project,seq,p_input->'manifest',encode(sha256(convert_to(public.social_schedule_canonical(p_input->'manifest'),'UTF8')),'hex'),(p_principal->>'userId')::uuid,p_input->>'idempotencyKey',p_input) returning * into b;
 insert into public.social_schedule_events(project_id,batch_revision_id,event,actor_kind,actor) values(project,b.id,'proposed','owner',(p_principal->>'userId')::uuid);
 return public.social_schedule_batch_view(b);
end $fn$;
create function public.social_schedule_approve(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid;b public.social_schedule_batches;a public.social_schedule_decisions;v jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform public.social_schedule_fields(p_input,array['projectId','batchId','revisionId','sha256','confirmed','idempotencyKey']);
 if p_input->'confirmed' is distinct from 'true'::jsonb or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 perform 1 from public.projects where id=project for update;perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_content_active(project);
 select * into b from public.social_schedule_batches where id=(p_input->>'revisionId')::uuid and batch_id=(p_input->>'batchId')::uuid and project_id=project and sha256=p_input->>'sha256';
 if b.id is null or exists(select 1 from public.social_schedule_batches where batch_id=b.batch_id and sequence>b.sequence) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 select * into a from public.social_schedule_decisions where project_id=project and idempotency_key=p_input->>'idempotencyKey';
 if a.id is not null then if a.input_data is distinct from p_input then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;return public.social_schedule_batch_view(b);end if;
 if exists(select 1 from public.social_schedule_decisions where batch_revision_id=b.id) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 perform public.social_schedule_validate_manifest(project,b.manifest);
 -- An occasion has one immutable identity across all approved batches.
 if exists(select 1 from (
  select j.occasion_id::text occasion_id,j.channel,j.scheduled_at,j.item->>'kind' kind,(j.item->'releaseCondition')::text condition from public.social_schedule_jobs j where j.project_id=project and j.state<>'cancelled'
  union all select mi.value->>'occasionId',mi.value->>'channel',(mi.value->>'scheduledAt')::timestamptz,mi.value->>'kind',(mi.value->'releaseCondition')::text from jsonb_array_elements(b.manifest->'items') mi(value)
 ) combined group by occasion_id having count(*)>2 or count(*)>count(distinct channel) or count(distinct scheduled_at)>1 or count(distinct kind)>1 or count(distinct condition)>1) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 if exists(select 1 from (
  select j.occasion_id::text occasion_id,j.scheduled_at from public.social_schedule_jobs j where j.project_id=project and j.state<>'cancelled'
  union all select mi.value->>'occasionId',(mi.value->>'scheduledAt')::timestamptz from jsonb_array_elements(b.manifest->'items') mi(value)
 ) occasions group by date_trunc('week',scheduled_at at time zone 'Europe/Stockholm') having count(distinct occasion_id)>3) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 if exists(select 1 from jsonb_array_elements(b.manifest->'items') mi(value) join public.social_publications p on p.project_id=project and p.post_id=(mi.value->>'postId')::uuid) then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 insert into public.social_schedule_decisions(project_id,batch_revision_id,action,actor,idempotency_key,input_data)
 values(project,b.id,'approve',(p_principal->>'userId')::uuid,p_input->>'idempotencyKey',p_input) returning * into a;
 for v in select value from jsonb_array_elements(b.manifest->'items') loop
  insert into public.social_schedule_jobs(project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item,release_month)
  values(project,b.id,a.id,(v->>'postId')::uuid,(v->>'revisionId')::uuid,v->>'sha256',v->>'channel',(v->>'occasionId')::uuid,(v->>'scheduledAt')::timestamptz,(v->>'expiresAt')::timestamptz,v,v->'releaseCondition'->>'releaseMonth');
 end loop;
 insert into public.social_schedule_events(project_id,batch_revision_id,event,actor_kind,actor,details) values(project,b.id,'approved','owner',a.actor,jsonb_build_object('approvalId',a.id,'manifestSha256',b.sha256));
 return public.social_schedule_batch_view(b);
end $fn$;
create function public.social_schedule_revoke(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid;b public.social_schedule_batches;a public.social_schedule_decisions;view jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_schedule_fields(p_input,array['projectId','batchId','expectedVersion']);
 perform 1 from public.projects where id=project for update;perform public.social_launch_assert_owner(p_principal,p_input);
 select * into b from public.social_schedule_batches where project_id=project and batch_id=(p_input->>'batchId')::uuid order by sequence desc limit 1;
 if b.id is null then raise exception 'SOCIAL_SCHEDULE_NOT_FOUND' using errcode='P0002';end if;
 view=public.social_schedule_batch_view(b);
 if (view->>'version')::integer<>(p_input->>'expectedVersion')::integer then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 if view->>'status'='revoked' then return view;end if;
 select * into a from public.social_schedule_decisions where batch_revision_id=b.id and action='approve';
 if a.id is null then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 insert into public.social_schedule_decisions(project_id,batch_revision_id,action,actor,approval_id,reason,idempotency_key,input_data)
 values(project,b.id,'revoke',(p_principal->>'userId')::uuid,a.id,'owner_revoked','revoke-'||a.id,p_input);
 perform public.social_schedule_cancel_jobs(a.id,(p_principal->>'userId')::uuid,'owner_revoked');
 return public.social_schedule_batch_view(b);
end $fn$;
create function public.social_schedule_monthly_rule_save(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
begin
 perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_schedule_fields(p_input,array['projectId','rule']);
 perform public.social_schedule_fields(p_input->'rule',array['dayOfMonth','localTime','timeZone','channels','enabled']);
 if (p_input->'rule')-'enabled' is distinct from '{"dayOfMonth":1,"localTime":"20:30","timeZone":"Europe/Stockholm","channels":["facebook","instagram"]}'::jsonb or jsonb_typeof(p_input->'rule'->'enabled') is distinct from 'boolean' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;perform public.social_launch_assert_owner(p_principal,p_input);
 insert into public.social_monthly_release_rules(project_id,rule,updated_by) values((p_input->>'projectId')::uuid,p_input->'rule',(p_principal->>'userId')::uuid)
 on conflict(project_id) do update set rule=excluded.rule,updated_by=excluded.updated_by,updated_at=public.social_schedule_now();
 insert into public.social_schedule_events(project_id,event,actor_kind,actor,details) values((p_input->>'projectId')::uuid,'monthly_rule_saved','owner',(p_principal->>'userId')::uuid,p_input->'rule');
 return p_input->'rule';
end $fn$;
create function public.social_schedule_release_confirm(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare e public.social_monthly_release_evidence;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_schedule_fields(p_input,array['projectId','releaseMonth','catalogSha256','customerViewUrl','confirmed']);
 if p_input->'confirmed' is distinct from 'true'::jsonb or coalesce(p_input->>'releaseMonth','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or coalesce(p_input->>'catalogSha256','') !~ '^[a-f0-9]{64}$'
 or coalesce(p_input->>'customerViewUrl','') !~ '^https://[a-zA-Z0-9.-]+(/[^[:space:]?#]*)?$' or char_length(p_input->>'customerViewUrl')>2048 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_content_active((p_input->>'projectId')::uuid);
 insert into public.social_monthly_release_evidence(project_id,release_month,catalog_sha256,customer_view_url,verified_by,verified_at)
 values((p_input->>'projectId')::uuid,p_input->>'releaseMonth',p_input->>'catalogSha256',p_input->>'customerViewUrl',(p_principal->>'userId')::uuid,public.social_schedule_now()) returning * into e;
 insert into public.social_schedule_events(project_id,event,actor_kind,actor,details) values(e.project_id,'release_access_confirmed','owner',e.verified_by,jsonb_build_object('evidenceId',e.id,'releaseMonth',e.release_month,'catalogSha256',e.catalog_sha256,'kind',e.kind));
 return jsonb_build_object('id',e.id,'releaseMonth',e.release_month,'catalogSha256',e.catalog_sha256,'kind',e.kind,'verifiedAt',e.verified_at);
end $fn$;

create function public.social_schedule_authority(j public.social_schedule_jobs,p_require_release boolean default true) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare a public.social_schedule_decisions;b public.social_schedule_batches;evidence uuid;t timestamptz=public.social_schedule_now();result jsonb;
begin
 select * into a from public.social_schedule_decisions where id=j.approval_id and project_id=j.project_id and batch_revision_id=j.batch_revision_id and action='approve';
 select * into b from public.social_schedule_batches where id=j.batch_revision_id and project_id=j.project_id;
 if a.id is null or b.id is null or exists(select 1 from public.social_schedule_decisions where approval_id=a.id and action='revoke')
 or exists(select 1 from public.social_schedule_batches where batch_id=b.batch_id and sequence>b.sequence)
 or not exists(select 1 from public.projects where id=j.project_id and owner_id=a.actor)
 then raise exception 'SOCIAL_SCHEDULE_REVIEW_REQUIRED';end if;
 begin perform public.social_content_active(j.project_id);exception when others then raise exception 'SOCIAL_SCHEDULE_STOPPED';end;
 if t<j.scheduled_at then raise exception 'SOCIAL_SCHEDULE_NOT_DUE';end if;
 if t>j.expires_at then raise exception 'SOCIAL_SCHEDULE_EXPIRED';end if;
 perform public.social_schedule_item_guard(j.project_id,j.item);
 if j.release_month is not null then
  select e.id into evidence from public.social_monthly_release_evidence e where e.project_id=j.project_id and e.release_month=j.release_month and e.catalog_sha256=j.item->'releaseCondition'->>'catalogSha256' and e.kind='owner_verified_access' and e.verified_by=a.actor and e.verified_at between t-interval '24 hours' and t order by e.verified_at desc limit 1;
  if p_require_release and evidence is null then raise exception 'SOCIAL_SCHEDULE_RELEASE_REQUIRED';end if;
 end if;
 result=public.social_schedule_snapshot(j);
 return result||jsonb_build_object('releaseEvidenceId',evidence);
end $fn$;
create function public.social_schedule_locked_claim(p_claim jsonb) returns public.social_schedule_jobs language plpgsql security invoker set search_path='' as $fn$
declare j public.social_schedule_jobs;project uuid;
begin
 perform public.social_schedule_fields(p_claim,array['jobId','claimId','version']);
 select project_id into project from public.social_schedule_jobs where id=(p_claim->>'jobId')::uuid;
 if project is null then raise exception 'SOCIAL_SCHEDULE_NOT_FOUND' using errcode='P0002';end if;
 perform 1 from public.projects where id=project for update;
 select * into j from public.social_schedule_jobs where id=(p_claim->>'jobId')::uuid for update;
 if j.state<>'claimed' or j.claim_id is distinct from (p_claim->>'claimId')::uuid or j.version<>(p_claim->>'version')::integer or j.lease_expires_at<=public.social_schedule_now() then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
 return j;
end $fn$;
create function public.social_schedule_claim(p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare candidate record;j public.social_schedule_jobs;r public.social_publications;t timestamptz=public.social_schedule_now();refusal text;old_state text;
begin
 perform public.social_schedule_fields(p_input,array['workerId','now','dryRun','projectIds']);
 if coalesce(p_input->>'workerId','') !~ '^[A-Za-z0-9_-]{1,100}$' or jsonb_typeof(p_input->'dryRun') is distinct from 'boolean' or jsonb_typeof(p_input->'projectIds') is distinct from 'array' or jsonb_array_length(p_input->'projectIds')>100 or abs(extract(epoch from ((p_input->>'now')::timestamptz-t)))>5 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 if p_input->'dryRun'='true'::jsonb then return null;end if;
 for candidate in select id,project_id from public.social_schedule_jobs where project_id::text in(select jsonb_array_elements_text(p_input->'projectIds')) and scheduled_at<=t and (state in ('queued','waiting') or state='claimed' and lease_expires_at<=t)
 and not(state='waiting' and coalesce(reason,'')='release_required' and t<=expires_at and not exists(select 1 from public.social_monthly_release_evidence e join public.social_schedule_decisions a on a.id=public.social_schedule_jobs.approval_id where e.project_id=public.social_schedule_jobs.project_id and e.release_month=public.social_schedule_jobs.release_month and e.catalog_sha256=item->'releaseCondition'->>'catalogSha256' and e.kind='owner_verified_access' and e.verified_by=a.actor and e.verified_at between t-interval '24 hours' and t))
 order by scheduled_at,case when state='waiting' then 1 else 0 end,updated_at,id limit 50 loop
  -- Same lock order as owner mutations: project, then job. A busy project is skipped.
  perform 1 from public.projects where id=candidate.project_id for update skip locked;if not found then continue;end if;
  select * into j from public.social_schedule_jobs where id=candidate.id and (state in ('queued','waiting') or state='claimed' and lease_expires_at<=t) for update skip locked;
  if not found then continue;end if;
  select * into r from public.social_publications where id=j.publication_id for update;
  if r.state in ('published','failed','uncertain','creating','publishing') then
   if r.state in ('creating','publishing') then
    old_state=r.state;
    update public.social_publications set state='uncertain',version=version+1,updated_at=t,failure_code='receipt_unavailable',capability_hash=null,capability_expires_at=null where id=r.id returning * into r;
    insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,actor_kind,job_id,details) values(r.id,r.project_id,'uncertain',old_state,'uncertain',r.version,null,'worker',j.id,jsonb_build_object('reason','lease_expired','workerId',p_input->>'workerId'));
   end if;
   update public.social_schedule_jobs set state=r.state,version=version+1,reason=case when r.state='uncertain' then 'receipt_unavailable' else null end,lease_expires_at=null,updated_at=t where id=j.id;
   insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,worker_id,details) values(j.project_id,j.id,j.batch_revision_id,'lease_recovered','worker',p_input->>'workerId',jsonb_build_object('state',r.state));
   continue;
  end if;
  if t>j.expires_at then
   update public.social_schedule_jobs set state='missed',version=version+1,reason='time_window_expired',lease_expires_at=null,updated_at=t where id=j.id;
   insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,worker_id) values(j.project_id,j.id,j.batch_revision_id,'missed','worker',p_input->>'workerId');
   continue;
  end if;
  begin perform public.social_schedule_authority(j,false);
  exception when others then
   refusal=case when sqlerrm like '%SOCIAL_SCHEDULE_STOPPED%' then 'stopped' else 'review_required' end;
   update public.social_schedule_jobs set state='blocked',version=version+1,reason=refusal,lease_expires_at=null,updated_at=t where id=j.id;
   insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,worker_id,details) values(j.project_id,j.id,j.batch_revision_id,'blocked','worker',p_input->>'workerId',jsonb_build_object('reason',refusal));
   continue;
  end;
  update public.social_schedule_jobs set state='claimed',version=version+1,claim_id=gen_random_uuid(),worker_id=p_input->>'workerId',lease_expires_at=t+interval '90 seconds',reason=null,updated_at=t where id=j.id returning * into j;
  insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,worker_id,details) values(j.project_id,j.id,j.batch_revision_id,'claimed','worker',j.worker_id,jsonb_build_object('claimId',j.claim_id,'version',j.version));
  return jsonb_build_object('jobId',j.id,'claimId',j.claim_id,'version',j.version,'leaseExpiresAt',j.lease_expires_at,'snapshot',public.social_schedule_snapshot(j));
 end loop;
 return null;
end $fn$;
create function public.social_schedule_authorize_write(p_claim jsonb,p_project_ids jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare j public.social_schedule_jobs;
begin
 j=public.social_schedule_locked_claim(p_claim);
 if jsonb_typeof(p_project_ids) is distinct from 'array' or jsonb_array_length(p_project_ids)>100 or not exists(select 1 from jsonb_array_elements_text(p_project_ids) x where x=j.project_id::text) then raise exception 'SOCIAL_SCHEDULE_DISABLED';end if;
 return public.social_schedule_authority(j,true);
end $fn$;
create function public.social_schedule_peek(p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare j public.social_schedule_jobs;reason text;
begin
 perform public.social_schedule_fields(p_input,array['projectIds']);
 if jsonb_typeof(p_input->'projectIds') is distinct from 'array' or jsonb_array_length(p_input->'projectIds')>100 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 select * into j from public.social_schedule_jobs where project_id::text in(select jsonb_array_elements_text(p_input->'projectIds')) and state in ('queued','waiting','claimed') order by scheduled_at,case when state='waiting' then 1 else 0 end,updated_at,id limit 1;
 if j.id is null then return jsonb_build_object('jobId',null,'result','no_jobs');end if;
 if j.state='claimed' and j.lease_expires_at>public.social_schedule_now() then return jsonb_build_object('jobId',j.id,'result','claimed');end if;
 begin perform public.social_schedule_authority(j,true);reason='eligible';
 exception when others then reason=case when sqlerrm like '%SOCIAL_SCHEDULE_RELEASE_REQUIRED%' then 'release_required' when sqlerrm like '%SOCIAL_SCHEDULE_NOT_DUE%' then 'not_due' when sqlerrm like '%SOCIAL_SCHEDULE_EXPIRED%' then 'expired' when sqlerrm like '%SOCIAL_SCHEDULE_STOPPED%' then 'stopped' else 'review_required' end;end;
 return jsonb_build_object('jobId',j.id,'result',reason);
end $fn$;
create function public.social_schedule_receipt(p_input jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare j public.social_schedule_jobs;r public.social_publications;
begin
 perform public.social_schedule_fields(p_input,array['jobId']);
 select * into j from public.social_schedule_jobs where id=(p_input->>'jobId')::uuid;
 if j.id is null then raise exception 'SOCIAL_SCHEDULE_NOT_FOUND' using errcode='P0002';end if;
 select * into r from public.social_publications where id=j.publication_id and project_id=j.project_id and job_id=j.id;
 return jsonb_build_object('claim',jsonb_build_object('jobId',j.id,'claimId',j.claim_id,'version',j.version,'leaseExpiresAt',j.lease_expires_at,'snapshot',public.social_schedule_snapshot(j)),'publication',case when r.id is null then null else public.social_publication_record(r) end,'jobState',j.state);
end $fn$;

create function public.social_schedule_step(p_claim jsonb,p_step jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare j public.social_schedule_jobs;r public.social_publications;a public.social_schedule_decisions;action text=p_step->>'action';old_state text;next_state text;snapshot jsonb;job_state text;checkpoint_reason text;
begin
 perform public.social_schedule_fields(p_step,array['action'],array['expectedVersion','capabilityHash','containerId','providerId','permalink','failureCode','reason']);
 if action not in ('prepare','claim_create','container_ready','claim_publish','complete','fail','uncertain','confirm_published','checkpoint') then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 j=public.social_schedule_locked_claim(p_claim);
 select * into r from public.social_publications where id=j.publication_id and job_id=j.id and project_id=j.project_id for update;
 if action='prepare' then
  perform public.social_schedule_fields(p_step,array['action']);
  snapshot=public.social_schedule_authority(j,true);
  if r.id is null then
   select * into a from public.social_schedule_decisions where id=j.approval_id and project_id=j.project_id;
   insert into public.social_publications(project_id,post_id,revision_id,sha256,decision_id,binding_id,channel,account_id,account_label,request_input,idempotency_key,requested_by,authority_source,job_id)
   values(j.project_id,j.post_id,j.revision_id,j.revision_sha256,(j.item->>'decisionId')::uuid,(j.item->>'bindingId')::uuid,j.channel,j.item->>'accountId',snapshot->'revision'->'binding'->>'label',jsonb_build_object('jobId',j.id,'approvalId',j.approval_id,'manifestSha256',snapshot->>'manifestSha256'),'schedule-'||j.id,a.actor,'scheduled',j.id) returning * into r;
   insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,actor_kind,job_id,details) values(r.id,r.project_id,'requested',null,r.state,r.version,null,'worker',j.id,jsonb_build_object('approvalId',j.approval_id,'workerId',j.worker_id));
  end if;
 elsif action='checkpoint' then
  if p_step?'reason' and coalesce(p_step->>'reason','') not in ('release_required','stopped','review_required','disabled','budget_exhausted') then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
  if r.state in ('creating','publishing') then
   old_state=r.state;
   update public.social_publications set state='uncertain',version=version+1,updated_at=public.social_schedule_now(),failure_code='receipt_unavailable',capability_hash=null,capability_expires_at=null where id=r.id returning * into r;
   insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,actor_kind,job_id,details) values(r.id,r.project_id,'uncertain',old_state,'uncertain',r.version,null,'worker',j.id,jsonb_build_object('workerId',j.worker_id,'reason','checkpoint_lost'));
  end if;
 else
  if r.id is null or jsonb_typeof(p_step->'expectedVersion') is distinct from 'number' then raise exception 'SOCIAL_SCHEDULE_CONFLICT';end if;
  if r.version<>(p_step->>'expectedVersion')::integer then return public.social_schedule_receipt(jsonb_build_object('jobId',j.id));end if;
  old_state=r.state;
  next_state=case
   when action='claim_create' and r.state='requested' then case when r.channel='instagram' then 'creating' else 'publishing' end
   when action='container_ready' and r.channel='instagram' and r.state='creating' then 'processing'
   when action='claim_publish' and r.channel='instagram' and r.state='processing' and r.container_id is not null then 'publishing'
   when action='complete' and r.state='publishing' then 'published'
   when action='fail' and r.state in ('creating','processing','publishing') then 'failed'
   when action='uncertain' and r.state in ('creating','publishing') then 'uncertain'
   when action='confirm_published' and r.channel='instagram' and r.container_id is not null and r.state in ('processing','publishing','uncertain') then 'published'
   else null end;
  if next_state is null then return public.social_schedule_receipt(jsonb_build_object('jobId',j.id));end if;
  if action in ('claim_create','claim_publish') then snapshot=public.social_schedule_authority(j,true);end if;
  if action='claim_create' then
   if coalesce(p_step->>'capabilityHash','') !~ '^[a-f0-9]{64}$' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
   r.capability_hash=p_step->>'capabilityHash';r.capability_expires_at=least(public.social_schedule_now()+interval '15 minutes',j.expires_at);
  end if;
  if action='container_ready' then
   if coalesce(p_step->>'containerId','') !~ '^[0-9]{1,80}$' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;r.container_id=p_step->>'containerId';
  end if;
  if action='complete' then
   if coalesce(p_step->>'providerId','') !~ '^[0-9]{1,80}(_[0-9]{1,80})?$' or p_step->>'permalink' is not null and not(case when r.channel='instagram' then p_step->>'permalink' ~ '^https://www[.]instagram[.]com/[^[:space:]]+$' else p_step->>'permalink' ~ '^https://www[.]facebook[.]com/[^[:space:]]+$' end) then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
   r.provider_id=p_step->>'providerId';r.permalink=p_step->>'permalink';r.confirmation='provider_id';r.failure_code=null;
  end if;
  if action='confirm_published' then r.confirmation='container_status';r.failure_code=null;end if;
  if action in ('fail','uncertain') then
   if coalesce(p_step->>'failureCode','') not in ('provider_denied','provider_unavailable','invalid_response','receipt_unavailable') then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;r.failure_code=p_step->>'failureCode';
  end if;
  if next_state in ('published','failed','uncertain') then r.capability_hash=null;r.capability_expires_at=null;end if;
  update public.social_publications set state=next_state,version=version+1,updated_at=public.social_schedule_now(),container_id=r.container_id,provider_id=r.provider_id,permalink=r.permalink,failure_code=r.failure_code,confirmation=r.confirmation,capability_hash=r.capability_hash,capability_expires_at=r.capability_expires_at where id=r.id returning * into r;
  insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,actor_kind,job_id,details)
  values(r.id,r.project_id,action,old_state,r.state,r.version,null,'worker',j.id,jsonb_build_object('approvalId',j.approval_id,'workerId',j.worker_id,'releaseEvidenceId',snapshot->>'releaseEvidenceId'));
 end if;
 checkpoint_reason=p_step->>'reason';
 job_state=case when r.state in ('published','failed','uncertain') then r.state
  when action='checkpoint' and checkpoint_reason in ('stopped','review_required','disabled') then 'blocked'
  when action='checkpoint' and public.social_schedule_now()>j.expires_at then 'missed'
  when action='checkpoint' then 'waiting' else 'claimed' end;
 update public.social_schedule_jobs set publication_id=r.id,state=job_state,version=version+1,reason=checkpoint_reason,lease_expires_at=case when job_state='claimed' then lease_expires_at else null end,updated_at=public.social_schedule_now() where id=j.id returning * into j;
 insert into public.social_schedule_events(project_id,job_id,batch_revision_id,event,actor_kind,worker_id,details)
 values(j.project_id,j.id,j.batch_revision_id,action,'worker',j.worker_id,jsonb_build_object('state',j.state,'publicationId',r.id,'publicationVersion',r.version,'reason',checkpoint_reason,'releaseEvidenceId',snapshot->>'releaseEvidenceId'));
 return public.social_schedule_receipt(jsonb_build_object('jobId',j.id));
end $fn$;
-- All application helpers and entry points are explicit server-only privileges.
do $grants$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'social_schedule_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $grants$;

-- Manual mutations never consume queue authority; media and history remain scoped.
create or replace function public.social_publication_step(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;old_state text;action text;next_state text;c public.social_content_revisions;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId','publicationId','expectedVersion','action','capabilityHash','containerId','providerId','permalink','failureCode'))
 or coalesce(p_input->>'action','') not in ('claim_create','container_ready','claim_publish','complete','fail','uncertain','confirm_published')
 or jsonb_typeof(p_input->'expectedVersion') is distinct from 'number' then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;
 perform public.social_launch_assert_owner(p_principal,p_input);
 select * into r from public.social_publications where id=(p_input->>'publicationId')::uuid and project_id=(p_input->>'projectId')::uuid and post_id=(p_input->>'postId')::uuid for update;
 if not found then raise exception 'SOCIAL_PUBLICATION_NOT_FOUND' using errcode='P0002';end if;
 if r.authority_source='scheduled' then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED';end if;
 if r.version<>(p_input->>'expectedVersion')::integer then return jsonb_build_object('changed',false,'record',public.social_publication_record(r));end if;
 action=p_input->>'action';old_state=r.state;
 next_state=case
  when action='claim_create' and r.state='requested' then case when r.channel='instagram' then 'creating' else 'publishing' end
  when action='container_ready' and r.channel='instagram' and r.state='creating' then 'processing'
  when action='claim_publish' and r.channel='instagram' and r.state='processing' then 'publishing'
  when action='complete' and r.state='publishing' then 'published'
  when action='fail' and r.state in ('creating','processing','publishing') then 'failed'
  when action='uncertain' and r.state in ('creating','publishing') then 'uncertain'
  when action='confirm_published' and r.channel='instagram' and r.container_id is not null and r.state in ('processing','publishing','uncertain') then 'published'
  else null end;
 if next_state is null then return jsonb_build_object('changed',false,'record',public.social_publication_record(r));end if;
 if action in ('claim_create','claim_publish') then
  c=public.social_publication_guard(p_principal,r.request_input);
  if action='claim_create' and c.draft->>'format'='image' then
   if coalesce(p_input->>'capabilityHash','') !~ '^[a-f0-9]{64}$' then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
   r.capability_hash=p_input->>'capabilityHash';r.capability_expires_at=now()+interval '15 minutes';
  end if;
 end if;
 if action='container_ready' then
  if coalesce(p_input->>'containerId','') !~ '^[0-9]{1,80}$' then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;r.container_id=p_input->>'containerId';
 end if;
 if action='claim_publish' and r.container_id is null then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
 if action='complete' then
  if coalesce(p_input->>'providerId','') !~ '^[0-9]{1,80}(_[0-9]{1,80})?$'
  or p_input->>'permalink' is not null and not(case when r.channel='instagram' then p_input->>'permalink' ~ '^https://www[.]instagram[.]com/[^[:space:]]+$' else p_input->>'permalink' ~ '^https://www[.]facebook[.]com/[^[:space:]]+$' end)
  then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
  r.provider_id=p_input->>'providerId';r.permalink=p_input->>'permalink';r.confirmation='provider_id';r.failure_code=null;
 end if;
 if action='confirm_published' then r.confirmation='container_status';r.failure_code=null;end if;
 if action in ('fail','uncertain') then
  if coalesce(p_input->>'failureCode','') not in ('provider_denied','provider_unavailable','invalid_response','receipt_unavailable') then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;r.failure_code=p_input->>'failureCode';
 end if;
 if next_state in ('published','failed') then r.capability_hash=null;r.capability_expires_at=null;end if;
 update public.social_publications set state=next_state,version=version+1,updated_at=now(),container_id=r.container_id,provider_id=r.provider_id,permalink=r.permalink,failure_code=r.failure_code,confirmation=r.confirmation,capability_hash=r.capability_hash,capability_expires_at=r.capability_expires_at where id=r.id returning * into r;
 insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor) values(r.id,r.project_id,action,old_state,r.state,r.version,(p_principal->>'userId')::uuid);
 return jsonb_build_object('changed',true,'record',public.social_publication_record(r));
end $fn$;
create or replace function public.social_publication_prepare(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;c public.social_content_revisions;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if (select count(*) from jsonb_object_keys(p_input))<>8 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId','revisionId','sha256','decisionId','bindingId','idempotencyKey','confirmed'))
 or p_input->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'idempotencyKey') is distinct from 'string' or p_input->>'idempotencyKey' !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;
 perform public.social_launch_assert_owner(p_principal,p_input);
 if not exists(select 1 from public.social_content_posts where id=(p_input->>'postId')::uuid and project_id=(p_input->>'projectId')::uuid) then raise exception 'SOCIAL_PUBLICATION_NOT_FOUND' using errcode='P0002';end if;
 select * into r from public.social_publications where project_id=(p_input->>'projectId')::uuid and idempotency_key=p_input->>'idempotencyKey';
 if r.id is null then select * into r from public.social_publications where post_id=(p_input->>'postId')::uuid and project_id=(p_input->>'projectId')::uuid;end if;
 if r.id is not null then
  if r.authority_source='scheduled' then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED';end if;
  if r.request_input-'idempotencyKey' is distinct from p_input-'idempotencyKey' then raise exception 'SOCIAL_PUBLICATION_CONFLICT';end if;
  return public.social_publication_record(r);
 end if;
 c=public.social_publication_guard(p_principal,p_input);
 insert into public.social_publications(project_id,post_id,revision_id,sha256,decision_id,binding_id,channel,account_id,account_label,request_input,idempotency_key,requested_by)
 values(c.project_id,c.post_id,c.id,c.sha256,(p_input->>'decisionId')::uuid,c.binding_id,c.draft->>'channel',c.binding->>'accountId',c.binding->>'label',p_input,p_input->>'idempotencyKey',(p_principal->>'userId')::uuid) returning * into r;
 insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor) values(r.id,r.project_id,'requested',null,r.state,r.version,(p_principal->>'userId')::uuid);
 return public.social_publication_record(r);
end $fn$;
create or replace function public.social_publication_media_lookup(p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;c public.social_content_revisions;a public.assets;j public.social_schedule_jobs;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input))<>2 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('publicationId','keyHash')) or coalesce(p_input->>'keyHash','') !~ '^[a-f0-9]{64}$' then return null;end if;
 select * into r from public.social_publications where id=(p_input->>'publicationId')::uuid and capability_hash=p_input->>'keyHash' and capability_expires_at>now() and state in ('creating','processing','publishing','uncertain');
 if not found then return null;end if;
 if r.authority_source='scheduled' then
  select * into j from public.social_schedule_jobs where id=r.job_id and project_id=r.project_id and publication_id=r.id and state in ('claimed','waiting');
  if j.id is null then return null;end if;
  begin perform public.social_schedule_authority(j,true);exception when others then return null;end;
 end if;
 begin perform public.social_content_active(r.project_id);exception when others then return null;end;
 select * into c from public.social_content_revisions where id=r.revision_id and post_id=r.post_id and project_id=r.project_id;
 if jsonb_array_length(c.media)<>1 then return null;end if;
 select * into a from public.assets where id=(c.media->0->>'id')::uuid and project_id=r.project_id and status='active' and kind='image' and mime_type='image/jpeg' and checksum_sha256=c.media->0->>'sha256' and byte_size between 1 and 8388608;
 if not found then return null;end if;
 return jsonb_build_object('projectId',a.project_id,'assetId',a.id,'sha256',a.checksum_sha256,'mimeType',a.mime_type,'byteSize',a.byte_size,'bucket',a.storage_bucket,'path',a.storage_path);
end $fn$;
create or replace function public.social_publication_reconciliation_complete(p_principal jsonb,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;p public.social_publication_reconciliation_proofs;v jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if jsonb_typeof(p_input) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input))<>8 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId','publicationId','candidateId','expectedVersion','imageConfirmed','candidateHash','readAt'))
 or p_input->'imageConfirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'expectedVersion') is distinct from 'number' or coalesce(p_input->>'candidateHash','') !~ '^[a-f0-9]{64}$'
 then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
 v=public.social_publication_reconciliation_inspect(p_principal,jsonb_build_object('projectId',p_input->>'projectId','postId',p_input->>'postId','publicationId',p_input->>'publicationId'));
 select * into r from public.social_publications where id=(p_input->>'publicationId')::uuid for update;
 select * into p from public.social_publication_reconciliation_proofs where id=(p_input->>'candidateId')::uuid and publication_id=r.id and project_id=r.project_id;
 if p.id is null or p.expires_at<clock_timestamp() or p.candidate_hash is distinct from p_input->>'candidateHash'
 or p.revision_id<>r.revision_id or p.revision_sha256<>r.sha256 or p.version<>(p_input->>'expectedVersion')::integer
 or (p_input->>'readAt')::timestamptz not between clock_timestamp()-interval '30 seconds' and clock_timestamp()+interval '5 seconds'
 then raise exception 'SOCIAL_PUBLICATION_CONFLICT';end if;
 if r.state='published' then
  if r.provider_id=p.candidate->>'providerId' and r.permalink=p.candidate->>'permalink' then return public.social_publication_record(r);end if;
  raise exception 'SOCIAL_PUBLICATION_CONFLICT';
 end if;
 if r.state<>'uncertain' or r.version<>p.version then raise exception 'SOCIAL_PUBLICATION_CONFLICT';end if;
 update public.social_publications set state='published',version=version+1,updated_at=clock_timestamp(),reconciled_at=clock_timestamp(),provider_id=p.candidate->>'providerId',permalink=p.candidate->>'permalink',confirmation='provider_id',failure_code=null,capability_hash=null,capability_expires_at=null where id=r.id returning * into r;
 insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,details)
 values(r.id,r.project_id,'reconcile_verified','uncertain','published',r.version,(p_principal->>'userId')::uuid,jsonb_build_object('revisionId',p.revision_id,'revisionSha256',p.revision_sha256,'reviewedAssetSha256',p.reviewed_asset_sha256,'accountId',r.account_id,'providerId',r.provider_id,'candidateHash',p.candidate_hash,'readAt',p_input->>'readAt'));
 if r.authority_source='scheduled' then
  update public.social_schedule_jobs set state='published',version=version+1,reason=null,lease_expires_at=null,updated_at=public.social_schedule_now() where id=r.job_id and project_id=r.project_id and publication_id=r.id;
  insert into public.social_schedule_events(project_id,job_id,event,actor_kind,actor,details) values(r.project_id,r.job_id,'receipt_reconciled','owner',(p_principal->>'userId')::uuid,jsonb_build_object('publicationId',r.id,'providerId',r.provider_id));
 end if;
 return public.social_publication_record(r);
end $fn$;