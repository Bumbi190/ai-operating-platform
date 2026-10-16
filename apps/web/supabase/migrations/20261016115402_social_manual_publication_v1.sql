-- Explicit manual publication only. No cron, generation or standing authority.
create table public.social_publications(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,post_id uuid not null unique,
 revision_id uuid not null,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),decision_id uuid not null references public.social_content_decisions,
 binding_id uuid not null references public.social_account_bindings(binding_id),channel text not null check(channel in ('facebook','instagram')),account_id text not null,account_label text,
 state text not null default 'requested' check(state in ('requested','creating','processing','publishing','published','failed','uncertain')),version integer not null default 1 check(version>0),
 request_input jsonb not null,idempotency_key text not null,requested_by uuid not null references auth.users,requested_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 container_id text,provider_id text,permalink text,failure_code text,confirmation text check(confirmation in ('provider_id','container_status')),
 capability_hash text check(capability_hash~'^[a-f0-9]{64}$'),capability_expires_at timestamptz,
 foreign key(revision_id,post_id,project_id,sha256) references public.social_content_revisions(id,post_id,project_id,sha256),
 unique(id,project_id),unique(project_id,idempotency_key),
 constraint social_publications_receipt_check check(state<>'published' or coalesce(confirmation='provider_id' and provider_id is not null,false) or coalesce(confirmation='container_status' and channel='instagram' and container_id is not null,false)));
create table public.social_publication_events(
 id uuid primary key default gen_random_uuid(),publication_id uuid not null,project_id uuid not null,
 event text not null check(event in ('requested','claim_create','container_ready','claim_publish','complete','fail','uncertain','confirm_published')),
 from_state text,to_state text not null,version integer not null,actor uuid not null references auth.users,created_at timestamptz not null default now(),
 foreign key(publication_id,project_id) references public.social_publications(id,project_id),unique(publication_id,version));
alter table public.social_publications enable row level security;
alter table public.social_publication_events enable row level security;
revoke all on public.social_publications,public.social_publication_events from public,anon,authenticated,service_role;
grant select,insert,update on public.social_publications to service_role;
grant select,insert on public.social_publication_events to service_role;
create trigger social_publication_events_immutable before update or delete on public.social_publication_events for each row execute function public.social_launch_immutable();
create trigger social_publication_events_no_truncate before truncate on public.social_publication_events for each statement execute function public.social_launch_immutable();

create function public.social_publication_record(r public.social_publications) returns jsonb language sql immutable security invoker set search_path='' as $fn$
 select jsonb_build_object('id',r.id,'projectId',r.project_id,'postId',r.post_id,'revisionId',r.revision_id,'sha256',r.sha256,'decisionId',r.decision_id,'bindingId',r.binding_id,'channel',r.channel,'accountId',r.account_id,'accountLabel',r.account_label,'state',r.state,'version',r.version,'containerId',r.container_id,'providerId',r.provider_id,'permalink',r.permalink,'failureCode',r.failure_code,'confirmation',r.confirmation,'requestedAt',r.requested_at,'updatedAt',r.updated_at);
$fn$;
create function public.social_publication_guard(p_principal jsonb,p_input jsonb) returns public.social_content_revisions language plpgsql security invoker set search_path='' as $fn$
declare r public.social_content_revisions; reasons text[];v jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform public.social_content_active((p_input->>'projectId')::uuid);
 select rev.* into r from public.social_content_posts root join public.social_content_revisions rev on rev.id=root.current_revision_id and rev.post_id=root.id and rev.project_id=root.project_id where root.id=(p_input->>'postId')::uuid and root.project_id=(p_input->>'projectId')::uuid;
 if not found then raise exception 'SOCIAL_PUBLICATION_NOT_FOUND' using errcode='P0002';end if;
 if r.id is distinct from (p_input->>'revisionId')::uuid or r.sha256 is distinct from p_input->>'sha256' or r.binding_id is distinct from (p_input->>'bindingId')::uuid or r.binding_id is null
 or not exists(select 1 from public.social_content_decisions d where d.id=(p_input->>'decisionId')::uuid and d.project_id=r.project_id and d.post_id=r.post_id and d.revision_id=r.id and d.sha256=r.sha256 and d.decision='approve') then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED';end if;
 reasons=public.social_content_requirements(r.id);
 if array_length(array_remove(reasons,'activation_required'),1) is not null then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED';end if;
 v=r.draft;
 if v->>'scheduledAt' is not null or v->>'channel' not in ('facebook','instagram') or v->>'channel'='facebook' and v->>'format' not in ('text','link','image') or v->>'channel'='instagram' and (v->>'format'<>'image' or char_length(v->>'text')>2200) then raise exception 'SOCIAL_PUBLICATION_UNSUPPORTED';end if;
 if v->>'format'='image' then
  if jsonb_array_length(r.media)<>1 or jsonb_array_length(v->'mediaIds')<>1 or r.media->0->>'id'<>v->'mediaIds'->>0 or r.media->0->>'mimeType'<>'image/jpeg'
  or v->>'linkUrl' is not null and position(v->>'linkUrl' in v->>'text')=0
  or not exists(select 1 from public.assets a where a.id=(r.media->0->>'id')::uuid and a.project_id=r.project_id and a.status='active' and a.kind='image' and a.mime_type='image/jpeg' and a.checksum_sha256=r.media->0->>'sha256' and a.byte_size between 1 and 8388608)
  then raise exception 'SOCIAL_PUBLICATION_UNSUPPORTED';end if;
 end if;
 return r;
end $fn$;
create function public.social_publication_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if (select count(*) from jsonb_object_keys(p_input))<>2 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId')) then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
 if not exists(select 1 from public.social_content_posts where id=(p_input->>'postId')::uuid and project_id=(p_input->>'projectId')::uuid) then raise exception 'SOCIAL_PUBLICATION_NOT_FOUND' using errcode='P0002';end if;
 select * into r from public.social_publications where post_id=(p_input->>'postId')::uuid and project_id=(p_input->>'projectId')::uuid;
 return jsonb_build_object('publication',case when r.id is null then null else public.social_publication_record(r) end);
end $fn$;
create function public.social_publication_prepare(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
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
  if r.request_input-'idempotencyKey' is distinct from p_input-'idempotencyKey' then raise exception 'SOCIAL_PUBLICATION_CONFLICT';end if;
  return public.social_publication_record(r);
 end if;
 c=public.social_publication_guard(p_principal,p_input);
 insert into public.social_publications(project_id,post_id,revision_id,sha256,decision_id,binding_id,channel,account_id,account_label,request_input,idempotency_key,requested_by)
 values(c.project_id,c.post_id,c.id,c.sha256,(p_input->>'decisionId')::uuid,c.binding_id,c.draft->>'channel',c.binding->>'accountId',c.binding->>'label',p_input,p_input->>'idempotencyKey',(p_principal->>'userId')::uuid) returning * into r;
 insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor) values(r.id,r.project_id,'requested',null,r.state,r.version,(p_principal->>'userId')::uuid);
 return public.social_publication_record(r);
end $fn$;
create function public.social_publication_step(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
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
create function public.social_publication_media_lookup(p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;c public.social_content_revisions;a public.assets;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input))<>2 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('publicationId','keyHash')) or coalesce(p_input->>'keyHash','') !~ '^[a-f0-9]{64}$' then return null;end if;
 select * into r from public.social_publications where id=(p_input->>'publicationId')::uuid and capability_hash=p_input->>'keyHash' and capability_expires_at>now() and state in ('creating','processing','publishing','uncertain');
 if not found then return null;end if;
 begin perform public.social_content_active(r.project_id);exception when others then return null;end;
 select * into c from public.social_content_revisions where id=r.revision_id and post_id=r.post_id and project_id=r.project_id;
 if jsonb_array_length(c.media)<>1 then return null;end if;
 select * into a from public.assets where id=(c.media->0->>'id')::uuid and project_id=r.project_id and status='active' and kind='image' and mime_type='image/jpeg' and checksum_sha256=c.media->0->>'sha256' and byte_size between 1 and 8388608;
 if not found then return null;end if;
 return jsonb_build_object('projectId',a.project_id,'assetId',a.id,'sha256',a.checksum_sha256,'mimeType',a.mime_type,'byteSize',a.byte_size,'bucket',a.storage_bucket,'path',a.storage_path);
end $fn$;
revoke all on function public.social_publication_record(public.social_publications),public.social_publication_guard(jsonb,jsonb),public.social_publication_read(jsonb,jsonb),public.social_publication_prepare(jsonb,jsonb),public.social_publication_step(jsonb,jsonb),public.social_publication_media_lookup(jsonb) from public,anon,authenticated;
grant execute on function public.social_publication_record(public.social_publications),public.social_publication_guard(jsonb,jsonb),public.social_publication_read(jsonb,jsonb),public.social_publication_prepare(jsonb,jsonb),public.social_publication_step(jsonb,jsonb),public.social_publication_media_lookup(jsonb) to service_role;
