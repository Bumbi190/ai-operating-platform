-- Preparation only. No dispatch/publishing authority.
create table public.social_content_posts(id uuid primary key,project_id uuid not null references public.projects,created_by uuid not null references auth.users,current_revision_id uuid,created_at timestamptz not null default now(),unique(id,project_id));
create table public.social_content_revisions(
 id uuid primary key default gen_random_uuid(),post_id uuid not null,project_id uuid not null,sequence integer not null check(sequence>0),
 plan_revision_id uuid not null,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),draft jsonb not null,media jsonb not null,
 binding_id uuid references public.social_account_bindings(binding_id),binding jsonb,conversation_id uuid references public.conversations,
 input_data jsonb not null,idempotency_key text not null,created_by uuid not null references auth.users,created_at timestamptz not null default now(),
 foreign key(post_id,project_id) references public.social_content_posts(id,project_id),foreign key(project_id,plan_revision_id) references public.social_launch_plan_revisions(project_id,id),
 unique(id,post_id,project_id),unique(project_id,idempotency_key),unique(post_id,sequence),unique(id,post_id,project_id,sha256));
alter table public.social_content_posts add foreign key(current_revision_id,id,project_id) references public.social_content_revisions(id,post_id,project_id);
create table public.social_content_decisions(
 id uuid primary key default gen_random_uuid(),project_id uuid not null,post_id uuid not null,revision_id uuid not null,sha256 text not null,
 decision text not null check(decision in ('approve','reject')),idempotency_key text not null,decided_by uuid not null references auth.users,decided_at timestamptz not null default now(),
 foreign key(revision_id,post_id,project_id,sha256) references public.social_content_revisions(id,post_id,project_id,sha256),unique(revision_id),unique(project_id,idempotency_key));
create index social_content_posts_project on public.social_content_posts(project_id,created_at);
alter table public.social_content_posts enable row level security;
alter table public.social_content_revisions enable row level security;
alter table public.social_content_decisions enable row level security;
revoke all on public.social_content_posts,public.social_content_revisions,public.social_content_decisions from public,anon,authenticated,service_role;
grant select,insert,update on public.social_content_posts to service_role;
grant select,insert on public.social_content_revisions,public.social_content_decisions to service_role;
create trigger social_content_revisions_immutable before update or delete on public.social_content_revisions for each row execute function public.social_launch_immutable();
create trigger social_content_decisions_immutable before update or delete on public.social_content_decisions for each row execute function public.social_launch_immutable();
create trigger social_content_revisions_no_truncate before truncate on public.social_content_revisions for each statement execute function public.social_launch_immutable();
create trigger social_content_decisions_no_truncate before truncate on public.social_content_decisions for each statement execute function public.social_launch_immutable();

create function public.social_content_active(p_project uuid) returns void language plpgsql security invoker set search_path='' as $fn$
begin
 if exists(select 1 from public.projects where id=p_project and execution_paused)
 or exists(select 1 from public.project_lifecycle where project_id=p_project and state<>'active')
 or exists(select 1 from public.platform_config where automation_paused) then raise exception 'SOCIAL_CONTENT_STOPPED'; end if;
end $fn$;

create function public.social_content_validate(p_draft jsonb) returns void language plpgsql security invoker set search_path='' as $fn$
declare k text; t timestamptz;
begin
 if jsonb_typeof(p_draft) is distinct from 'object' then raise exception 'SOCIAL_CONTENT_INVALID_BODY'; end if;
 if (select count(*) from jsonb_object_keys(p_draft))<>8 or exists(select 1 from jsonb_object_keys(p_draft) key_name where key_name not in ('channel','format','title','text','linkUrl','mediaIds','mediaBrief','scheduledAt'))
 or coalesce(p_draft->>'channel','') not in ('youtube','facebook','instagram','linkedin','x','pinterest') or coalesce(p_draft->>'format','') not in ('text','image','video','link')
 or p_draft->>'channel'='youtube' and p_draft->>'format'<>'video' or p_draft->>'channel' in ('instagram','pinterest') and p_draft->>'format' not in ('image','video')
 then raise exception 'SOCIAL_CONTENT_INVALID_BODY'; end if;
 foreach k in array array['title','text','mediaBrief'] loop
  if jsonb_typeof(p_draft->k) is distinct from 'string' or char_length(btrim(p_draft->>k))<(case when k='mediaBrief' then 0 else 1 end)
  or char_length(p_draft->>k)>(case k when 'title' then 150 when 'text' then 5000 else 1000 end)
  or p_draft->>k ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'SOCIAL_CONTENT_INVALID_BODY'; end if;
 end loop;
 if p_draft->'linkUrl'<>'null'::jsonb and (jsonb_typeof(p_draft->'linkUrl')<>'string' or char_length(p_draft->>'linkUrl')>2048 or p_draft->>'linkUrl' !~ '^https://[^/@[:space:]]+([/?#]|$)')
 or p_draft->>'format'='link' and coalesce(p_draft->>'linkUrl','')='' or jsonb_typeof(p_draft->'mediaIds') is distinct from 'array' then raise exception 'SOCIAL_CONTENT_INVALID_BODY'; end if;
 if jsonb_array_length(p_draft->'mediaIds')>10 or (select count(*) from jsonb_array_elements(p_draft->'mediaIds'))<>(select count(distinct value) from jsonb_array_elements(p_draft->'mediaIds'))
 or exists(select 1 from jsonb_array_elements(p_draft->'mediaIds') m where jsonb_typeof(m)<>'string' or m#>>'{}' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
 or p_draft->>'format' in ('text','link') and jsonb_array_length(p_draft->'mediaIds')<>0 or p_draft->>'format'='video' and jsonb_array_length(p_draft->'mediaIds')>1 then raise exception 'SOCIAL_CONTENT_INVALID_BODY'; end if;
 if p_draft->'scheduledAt'<>'null'::jsonb then
  if jsonb_typeof(p_draft->'scheduledAt')<>'string' or p_draft->>'scheduledAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then raise exception 'SOCIAL_CONTENT_INVALID_BODY'; end if;
  t=(p_draft->>'scheduledAt')::timestamptz;if t<=now() or t>now()+interval '366 days' then raise exception 'SOCIAL_CONTENT_INVALID_BODY'; end if;
 end if;
end $fn$;

create function public.social_content_requirements(p_revision uuid) returns text[] language plpgsql security invoker set search_path='' as $fn$
declare r public.social_content_revisions; reasons text[]=array['activation_required']; active_binding uuid; blocked timestamptz;
begin
 select * into strict r from public.social_content_revisions where id=p_revision;
 if not exists(select 1 from public.social_launch_plans p join public.social_launch_plan_revisions pr on pr.id=p.current_revision_id and pr.project_id=p.project_id
 join public.social_launch_plan_decisions d on d.project_id=pr.project_id and d.revision_id=pr.id and d.sha256=pr.sha256 and d.decision='approve'
 where p.project_id=r.project_id and p.current_revision_id=r.plan_revision_id) then reasons=array_append(reasons,'plan_changed'); end if;
 select binding_id,blocked_at into active_binding,blocked from public.social_account_bindings where project_id=r.project_id and platform=r.draft->>'channel' and superseded_at is null;
 if active_binding is distinct from r.binding_id or blocked is not null then reasons=array_append(reasons,'destination_changed');elsif active_binding is null then reasons=array_append(reasons,'account_required');end if;
 if r.draft->>'format' in ('image','video') and jsonb_array_length(r.media)=0 then reasons=array_append(reasons,'media_required');end if;
 if exists(select 1 from jsonb_array_elements(r.media) m where not exists(select 1 from public.assets a where a.id=(m->>'id')::uuid and a.project_id=r.project_id and a.status='active' and a.checksum_sha256=m->>'sha256' and a.kind=m->>'kind' and a.mime_type=m->>'mimeType')) then reasons=array_append(reasons,'media_changed');end if;
 if r.draft->>'scheduledAt' is not null and (r.draft->>'scheduledAt')::timestamptz<=now() then reasons=array_append(reasons,'time_passed');end if;
 return reasons;
end $fn$;

create function public.social_content_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare p public.projects; result jsonb; asset_list jsonb; plan_id uuid; approved boolean;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','conversationId')) then raise exception 'SOCIAL_CONTENT_INVALID_BODY';end if;
 select * into strict p from public.projects where id=(p_input->>'projectId')::uuid;
 select current_revision_id into plan_id from public.social_launch_plans where project_id=p.id;
 approved=exists(select 1 from public.social_launch_plan_decisions where project_id=p.id and revision_id=plan_id and decision='approve');
 select coalesce(jsonb_agg(entry order by created_at desc),'[]') into result from (
 select posts.created_at,jsonb_build_object('id',posts.id,'revision',jsonb_build_object('id',r.id,'sequence',r.sequence,'sha256',r.sha256,'planRevisionId',r.plan_revision_id,'draft',r.draft,'media',r.media,'binding',r.binding,'createdAt',r.created_at),
 'decision',case when d.id is null then null else jsonb_build_object('id',d.id,'decision',d.decision,'revisionId',d.revision_id,'sha256',d.sha256,'decidedAt',d.decided_at) end,
 'status',case when reasons && array['plan_changed','destination_changed','media_changed','time_passed'] then 'needs_review' when d.decision='approve' then 'approved' when d.decision='reject' then 'rejected' else 'proposal' end,'requirements',to_jsonb(reasons)) entry
 from public.social_content_posts posts join public.social_content_revisions r on r.id=posts.current_revision_id and r.project_id=posts.project_id and r.post_id=posts.id
 left join public.social_content_decisions d on d.revision_id=r.id cross join lateral (select public.social_content_requirements(r.id) reasons) checks where posts.project_id=p.id) entries;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'sha256',a.checksum_sha256,'mimeType',a.mime_type,'width',a.width,'height',a.height)),'[]') into asset_list
 from (select * from public.assets where project_id=p.id and status='active' and kind in ('image','video') and mime_type in ('image/png','image/jpeg','image/webp','image/gif','image/avif','video/mp4','video/webm') order by created_at desc,id limit 100) a;
 return jsonb_build_object('project',jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug),'posts',result,'assets',asset_list,'hasMoreAssets',(select count(*)>100 from public.assets where project_id=p.id and status='active' and kind in ('image','video')),
 'plannedChannels',coalesce((select choices from public.social_launch_plan_revisions where id=plan_id),'[]'::jsonb),'currentPlanRevisionId',plan_id,'planApproved',approved,'workspaceUrl','/projects/'||p.slug||'/social#content','dispatchEnabled',false,'publicationReady',false);
end $fn$;

create function public.social_content_save(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid; actor uuid=(p_principal->>'userId')::uuid; post uuid=(p_input->>'postId')::uuid;
 root public.social_content_posts; previous public.social_content_revisions; draft jsonb=p_input->'draft'; plan public.social_launch_plan_revisions; media jsonb; binding public.social_account_bindings; binding_json jsonb; rid uuid; seq integer;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','conversationId','postId','expectedRevisionId','planRevisionId','idempotencyKey','draft'))
 or not(p_input?'expectedRevisionId') or p_input->>'postId' is null or p_input->>'planRevisionId' is null or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'SOCIAL_CONTENT_INVALID_BODY';end if;
 perform 1 from public.projects where id=project for update;perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_content_active(project);
 select * into previous from public.social_content_revisions where project_id=project and idempotency_key=p_input->>'idempotencyKey';
 if previous.id is not null then
 if previous.input_data is distinct from p_input or previous.created_by<>actor then raise exception 'SOCIAL_CONTENT_REVISION_CONFLICT';end if;
 return public.social_content_read(p_principal,jsonb_build_object('projectId',project));end if;
 perform public.social_content_validate(draft);
 select r.* into plan from public.social_launch_plans p join public.social_launch_plan_revisions r on r.id=p.current_revision_id and r.project_id=p.project_id
 join public.social_launch_plan_decisions d on d.project_id=r.project_id and d.revision_id=r.id and d.sha256=r.sha256 and d.decision='approve' where p.project_id=project and r.id=(p_input->>'planRevisionId')::uuid;
 if plan.id is null or not exists(select 1 from jsonb_array_elements(plan.choices) c where c->>'channel'=draft->>'channel') then raise exception 'SOCIAL_CONTENT_REVIEW_REQUIRED';end if;
 if exists(select 1 from jsonb_array_elements_text(draft->'mediaIds') m where not exists(select 1 from public.assets a where a.id=m::uuid and a.project_id=project and a.status='active' and a.kind=draft->>'format' and a.mime_type in ('image/png','image/jpeg','image/webp','image/gif','image/avif','video/mp4','video/webm'))) then raise exception 'SOCIAL_CONTENT_INVALID_BODY';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'sha256',a.checksum_sha256,'mimeType',a.mime_type,'width',a.width,'height',a.height) order by m.ord),'[]') into media
 from jsonb_array_elements_text(draft->'mediaIds') with ordinality m(id,ord) join public.assets a on a.id=m.id::uuid;
 select * into binding from public.social_account_bindings where project_id=project and platform=draft->>'channel' and superseded_at is null;
 if binding.blocked_at is not null then raise exception 'SOCIAL_CONTENT_REVIEW_REQUIRED';end if;
 binding_json=case when binding.binding_id is null then null else jsonb_build_object('id',binding.binding_id,'accountId',binding.external_account_id,'label',binding.account_label) end;
 select * into root from public.social_content_posts where id=post for update;
 if root.id is not null and root.project_id<>project then raise exception 'SOCIAL_CONTENT_NOT_FOUND' using errcode='P0002';end if;
 if root.current_revision_id is distinct from (p_input->>'expectedRevisionId')::uuid then raise exception 'SOCIAL_CONTENT_REVISION_CONFLICT';end if;
 if root.id is null then
 if (select count(*) from public.social_content_posts where project_id=project)>=100 then raise exception 'SOCIAL_CONTENT_LIMIT_REACHED';end if;
 insert into public.social_content_posts(id,project_id,created_by) values(post,project,actor);end if;
 select coalesce(max(sequence),0)+1 into seq from public.social_content_revisions where post_id=post;
 insert into public.social_content_revisions(post_id,project_id,sequence,plan_revision_id,sha256,draft,media,binding_id,binding,conversation_id,input_data,idempotency_key,created_by)
 values(post,project,seq,plan.id,encode(sha256(convert_to(jsonb_build_object('draft',draft,'media',media,'bindingId',binding.binding_id,'planRevisionId',plan.id)::text,'UTF8')),'hex'),draft,media,binding.binding_id,binding_json,(p_input->>'conversationId')::uuid,p_input,p_input->>'idempotencyKey',actor) returning id into rid;
 update public.social_content_posts set current_revision_id=rid where id=post and project_id=project;
 return public.social_content_read(p_principal,jsonb_build_object('projectId',project));
end $fn$;

create function public.social_content_decide(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid;actor uuid=(p_principal->>'userId')::uuid;r public.social_content_revisions;d public.social_content_decisions;reasons text[];
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId','revisionId','sha256','decision','idempotencyKey'))
 or coalesce(p_input->>'decision','') not in ('approve','reject') or coalesce(p_input->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'SOCIAL_CONTENT_INVALID_BODY';end if;
 perform 1 from public.projects where id=project for update;perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_content_active(project);
 select * into d from public.social_content_decisions where project_id=project and idempotency_key=p_input->>'idempotencyKey';
 if d.id is not null then
 if d.post_id is distinct from (p_input->>'postId')::uuid or d.revision_id is distinct from (p_input->>'revisionId')::uuid or d.sha256 is distinct from p_input->>'sha256' or d.decision is distinct from p_input->>'decision' or d.decided_by<>actor then raise exception 'SOCIAL_CONTENT_REVISION_CONFLICT';end if;
 return public.social_content_read(p_principal,jsonb_build_object('projectId',project));end if;
 select r0.* into r from public.social_content_posts p join public.social_content_revisions r0 on r0.id=p.current_revision_id and r0.post_id=p.id and r0.project_id=p.project_id where p.id=(p_input->>'postId')::uuid and p.project_id=project for update of p;
 if r.id is null or r.id is distinct from (p_input->>'revisionId')::uuid or r.sha256 is distinct from p_input->>'sha256' then raise exception 'SOCIAL_CONTENT_REVISION_CONFLICT';end if;
 if p_input->>'decision'='approve' then
 reasons=public.social_content_requirements(r.id);if 'media_required'=any(reasons) then raise exception 'SOCIAL_CONTENT_MEDIA_REQUIRED';end if;
 if reasons && array['plan_changed','destination_changed','media_changed','time_passed'] then raise exception 'SOCIAL_CONTENT_REVIEW_REQUIRED';end if;end if;
 select * into d from public.social_content_decisions where revision_id=r.id;
 if d.id is not null then
 if d.decision is distinct from p_input->>'decision' or d.decided_by<>actor then raise exception 'SOCIAL_CONTENT_REVISION_CONFLICT';end if;
 else insert into public.social_content_decisions(project_id,post_id,revision_id,sha256,decision,idempotency_key,decided_by) values(project,r.post_id,r.id,r.sha256,p_input->>'decision',p_input->>'idempotencyKey',actor);end if;
 return public.social_content_read(p_principal,jsonb_build_object('projectId',project));
end $fn$;
revoke all on function public.social_content_active(uuid),public.social_content_validate(jsonb),public.social_content_requirements(uuid),public.social_content_read(jsonb,jsonb),public.social_content_save(jsonb,jsonb),public.social_content_decide(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.social_content_active(uuid),public.social_content_validate(jsonb),public.social_content_requirements(uuid),public.social_content_read(jsonb,jsonb),public.social_content_save(jsonb,jsonb),public.social_content_decide(jsonb,jsonb) to service_role;
comment on table public.social_content_posts is 'Editorial preparations, not scheduled deliveries. No publisher consumes this table.';
comment on table public.social_content_decisions is 'Exact immutable editorial decisions only. Grants no publishing or spend authority.';
