-- Test-only synthetic tables. Real schemas include stronger RLS, authority, provenance.

create table public.conversations(
 id uuid primary key,user_id uuid not null references auth.users(id),
 project_id uuid not null references public.projects(id));

create table public.social_content_revisions(
 id uuid primary key,post_id uuid not null,project_id uuid not null references public.projects(id),
 sha256 text not null,unique(id,post_id,project_id,sha256));

create table public.social_publications(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id),post_id uuid not null,
 state text not null default 'planned',version integer not null default 1,
 updated_at timestamptz not null default now(),failure_code text,
 capability_hash text,capability_expires_at timestamptz,
 unique(id,project_id));

create table public.social_publication_events(
 id uuid primary key default gen_random_uuid(),publication_id uuid,project_id uuid,
 event text,from_state text,to_state text,version integer,
 actor uuid,details jsonb);

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

create table public.social_schedule_events(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,job_id uuid,batch_revision_id uuid,
 event text not null,actor_kind text not null check(actor_kind in ('owner','worker')),actor uuid references auth.users,worker_id text,
 details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp(),
 foreign key(job_id,project_id) references public.social_schedule_jobs(id,project_id),
 foreign key(batch_revision_id,project_id) references public.social_schedule_batches(id,project_id),
 check((actor_kind='owner' and actor is not null and worker_id is null) or (actor_kind='worker' and actor is null and worker_id is not null)));

create unique index social_schedule_one_approval on public.social_schedule_decisions(batch_revision_id) where action='approve';

create unique index social_schedule_one_revocation on public.social_schedule_decisions(approval_id) where action='revoke';

grant usage on schema public,auth to service_role;
grant select,update on public.projects to service_role;
grant select on public.conversations,public.social_content_revisions to service_role;
grant select,insert,update on public.social_publications,public.social_publication_events to service_role;
grant select,insert on public.social_schedule_batches,public.social_schedule_decisions to service_role;
grant select,insert,update on public.social_schedule_jobs to service_role;
grant select,insert on public.social_schedule_events to service_role;

create function public.social_launch_assert_owner(p_principal jsonb,p_input jsonb) returns void language plpgsql security invoker set search_path='' as $fn$
begin
 if jsonb_typeof(p_principal) is distinct from 'object' or jsonb_typeof(p_principal->'allowedProjectIds') is distinct from 'array'
  or not coalesce((p_principal->'allowedProjectIds') ? (p_input->>'projectId'),false)
  or not exists(select 1 from public.projects p where p.id=(p_input->>'projectId')::uuid and p.owner_id=(p_principal->>'userId')::uuid)
 then raise exception 'SOCIAL_LAUNCH_NOT_FOUND' using errcode='P0002'; end if;
 if p_input->>'conversationId' is not null and not exists(select 1 from public.conversations c where c.id=(p_input->>'conversationId')::uuid and c.user_id=(p_principal->>'userId')::uuid and c.project_id=(p_input->>'projectId')::uuid)
 then raise exception 'SOCIAL_LAUNCH_NOT_FOUND' using errcode='P0002'; end if;
end
$fn$;

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

create function public.social_schedule_now() returns timestamptz
language sql volatile security invoker set search_path='' as $$select clock_timestamp()$$;

-- The only intentionally simplified content function: validates the content
-- revision FK but NOT the complete media, account binding or human review.
create function public.social_schedule_item_guard(p_project uuid,v jsonb)
returns public.social_content_revisions
language plpgsql security invoker set search_path='' as $fn$
declare r public.social_content_revisions;
begin
 select * into r from public.social_content_revisions
 where project_id=p_project and post_id=(v->>'postId')::uuid
   and id=(v->>'revisionId')::uuid and sha256=v->>'sha256';
 if not found then raise exception 'SOCIAL_SCHEDULE_REVIEW_REQUIRED';end if;
 return r;
end $fn$;

-- Fixture-only active-content stand-in; production checks more conditions.
create function public.social_content_active(p_project uuid) returns void
language plpgsql security invoker set search_path='' as $fn$
begin
 if not exists(select 1 from public.projects where id=p_project)
 then raise exception 'SOCIAL_CONTENT_STOPPED';end if;
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

create function public.social_schedule_batch_view(b public.social_schedule_batches) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare a public.social_schedule_decisions;jobs jsonb;revoked boolean;
begin
 select * into a from public.social_schedule_decisions where batch_revision_id=b.id and project_id=b.project_id and action='approve';
 revoked=exists(select 1 from public.social_schedule_decisions where approval_id=a.id and action='revoke');
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'batchId',b.batch_id,'postId',j.post_id,'channel',j.channel,'state',j.state,'scheduledAt',j.scheduled_at,'expiresAt',j.expires_at,'publicationId',j.publication_id,'reason',j.reason,'version',j.version) order by j.scheduled_at,j.channel),'[]') into jobs from public.social_schedule_jobs j where j.batch_revision_id=b.id and j.project_id=b.project_id;
 return jsonb_build_object('projectId',b.project_id,'batchId',b.batch_id,'revisionId',b.id,'sha256',b.sha256,'status',case when revoked then 'revoked' when a.id is not null then 'approved' else 'proposal' end,'manifest',b.manifest,'approval',case when a.id is null then null else jsonb_build_object('id',a.id,'approvedBy',a.actor,'approvedAt',a.created_at) end,'jobs',jobs,'version',1+(select count(*) from public.social_schedule_decisions where batch_revision_id=b.id));
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

revoke all on function public.social_launch_assert_owner(jsonb,jsonb),
 public.social_schedule_fields(jsonb,text[],text[]),
 public.social_schedule_canonical(jsonb),public.social_schedule_resolve_minute(text),
 public.social_schedule_now(), public.social_schedule_item_guard(uuid,jsonb),
 public.social_content_active(uuid),public.social_schedule_validate_manifest(uuid,jsonb),
 public.social_schedule_batch_view(public.social_schedule_batches),
 public.social_schedule_cancel_jobs(uuid,uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function public.social_launch_assert_owner(jsonb,jsonb),
 public.social_schedule_fields(jsonb,text[],text[]),
 public.social_schedule_canonical(jsonb),public.social_schedule_resolve_minute(text),
 public.social_schedule_now(),public.social_schedule_item_guard(uuid,jsonb),
 public.social_content_active(uuid),public.social_schedule_validate_manifest(uuid,jsonb),
 public.social_schedule_batch_view(public.social_schedule_batches),
 public.social_schedule_cancel_jobs(uuid,uuid,text)
 to service_role;
