-- Atlas studio control plane. Folder requests are not execution capabilities.
begin;
create table public.website_build_studio_intents(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id), project_id uuid not null references public.projects(id),
 conversation_id uuid not null references public.conversations(id),
 intent_key text not null check(intent_key~'^[A-Za-z0-9_-]{1,100}$'), input jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), unique(owner_id,intent_key)
);
create table public.website_build_workspace_requests(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id), project_id uuid not null references public.projects(id),
 intent_key text not null check(intent_key~'^[A-Za-z0-9_-]{1,100}$'),
 generation bigint not null check(generation>0),
 mode text not null check(mode in ('new','existing_git','existing_folder')),
 root jsonb not null, target_id uuid, state text not null default 'pending_runner' check(state='pending_runner'),
 input jsonb not null, created_at timestamptz not null default now(),
 unique(owner_id,intent_key),unique(project_id,generation)
);
create table public.project_lifecycle(
 project_id uuid primary key references public.projects(id), owner_id uuid not null references auth.users(id),
 state text not null default 'active' check(state in ('active','archived','trashed')),
 version bigint not null default 0 check(version>=0),
 intents jsonb not null default '{}', updated_at timestamptz not null default now()
);
create index website_studio_intents_project on public.website_build_studio_intents(project_id);
create index website_workspace_requests_project on public.website_build_workspace_requests(project_id,generation desc);
create index project_lifecycle_owner_state on public.project_lifecycle(owner_id,state);
alter table public.website_build_studio_intents enable row level security;
alter table public.website_build_workspace_requests enable row level security;
alter table public.project_lifecycle enable row level security;
create policy website_studio_intents_owner_read on public.website_build_studio_intents for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy website_workspace_requests_owner_read on public.website_build_workspace_requests for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy project_lifecycle_owner_read on public.project_lifecycle for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
revoke all on public.website_build_studio_intents,public.website_build_workspace_requests,public.project_lifecycle from public,anon,authenticated,service_role;
grant select on public.website_build_studio_intents,public.website_build_workspace_requests,public.project_lifecycle to authenticated,service_role;

-- Only the authenticated server may invoke these RPCs. Narrow definer writes
-- keep table DML unavailable even to service_role; the principal comes from Auth.
create function public.website_build_studio_require_owner(p_principal jsonb,p_project_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(p_principal->>'userId')::uuid;
begin
 if uid is null then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 if p_project_id is not null and (not coalesce(p_principal->'allowedProjectIds' ? p_project_id::text,false) or not exists(select 1 from public.projects where id=p_project_id and owner_id=uid)) then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 return uid;
end $$;
create function public.website_build_studio_require_active(p_project_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project_id for update;
 if not found then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 if exists(select 1 from public.project_lifecycle where project_id=p_project_id and state<>'active') then raise exception 'PROJECT_INACTIVE' using errcode='55000'; end if;
end $$;
create function public.website_build_studio_ensure(p_principal jsonb,p_input jsonb,p_preset jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; pid uuid; aid uuid; cid uuid; slug text; title text;
 key text:=p_input->>'idempotencyKey'; normalized jsonb:=p_input-'idempotencyKey'; old public.website_build_studio_intents;
 result jsonb; base jsonb; location jsonb; folder text;
begin
 uid:=public.website_build_studio_require_owner(p_principal);
 if key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' or jsonb_typeof(p_input)<>'object' then raise exception 'INVALID_STUDIO_INPUT' using errcode='22023'; end if;
 if p_input->>'kind'='existing' then
  pid:=(p_input->>'projectId')::uuid;
  perform public.website_build_studio_require_owner(p_principal,pid);
 elsif p_input->>'kind' is distinct from 'new' then raise exception 'INVALID_STUDIO_INPUT' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('atlas-studio:'||uid::text||':'||key,0));
 select * into old from public.website_build_studio_intents where owner_id=uid and intent_key=key;
 if found then
  if old.input is distinct from normalized then raise exception 'STUDIO_KEY_CONFLICT' using errcode='23505'; end if;
  perform public.website_build_studio_require_active(old.project_id);
  return old.result;
 end if;
 if p_input->>'kind'='new' then
  title:=btrim(p_input->>'name');
  if title is null or length(title) not between 1 and 120 or p_preset->>'version' is distinct from 'atlas-web-builder-v1' or p_preset->>'model' is distinct from 'claude-sonnet-4-6' or (p_preset->>'maxTokens')::integer is distinct from 6000 then raise exception 'INVALID_STUDIO_INPUT' using errcode='22023'; end if;
  pid:=gen_random_uuid(); aid:=gen_random_uuid(); slug:='webb-'||replace(pid::text,'-','');
  insert into public.projects(id,owner_id,name,slug) values(pid,uid,title,slug);
  insert into public.agents(id,project_id,name,model,system_prompt,config,skill_ids) values(aid,pid,'Webbbyggare (Atlas)',p_preset->>'model',p_preset->>'systemPrompt',jsonb_build_object('max_tokens',6000,'atlas_builder_preset',p_preset-'systemPrompt'),array['design-taste-frontend','impeccable']);
  select default_root into base from public.website_build_operator_settings where owner_id=uid;
  if base is not null then
   folder:=slug;
   location:=base||jsonb_build_object('projectId',pid,'folderName',folder,'root',(base->>'root')||case when base->>'os'='windows' then chr(92) else '/' end||folder,'status','pending_runner');
  end if;
  insert into public.website_build_project_settings(project_id,builder_agent_id,location) values(pid,aid,location);
 else
  perform public.website_build_studio_require_active(pid);
  select name,projects.slug into title,slug from public.projects where id=pid and owner_id=uid;
 end if;
 cid:=gen_random_uuid();
 insert into public.conversations(id,user_id,project_id,title) values(cid,uid,pid,'Bygg med Atlas · '||title);
 result:=jsonb_build_object('projectId',pid,'projectSlug',slug,'conversationId',cid);
 insert into public.website_build_studio_intents(owner_id,project_id,conversation_id,intent_key,input,result) values(uid,pid,cid,key,normalized,result);
 return result;
end $$;
revoke all on function public.website_build_studio_require_owner(jsonb,uuid),public.website_build_studio_require_active(uuid),public.website_build_studio_ensure(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.website_build_studio_ensure(jsonb,jsonb,jsonb) to service_role;
commit;
