-- Saved working context only; never publication authority.
create table public.social_project_profiles(project_id uuid primary key references public.projects,current_revision_id uuid,created_at timestamptz not null default now());
create table public.social_project_profile_revisions(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.social_project_profiles,sequence integer not null check(sequence>0),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),profile jsonb not null,input_data jsonb not null,idempotency_key text not null,
 created_by uuid not null references auth.users,conversation_id uuid references public.conversations,created_at timestamptz not null default now(),
 unique(id,project_id),unique(project_id,sequence),unique(project_id,idempotency_key));
alter table public.social_project_profiles add foreign key(current_revision_id,project_id) references public.social_project_profile_revisions(id,project_id);
alter table public.social_project_profiles enable row level security;
alter table public.social_project_profile_revisions enable row level security;
revoke all on public.social_project_profiles,public.social_project_profile_revisions from public,anon,authenticated,service_role;
grant select,insert,update on public.social_project_profiles to service_role;
grant select,insert on public.social_project_profile_revisions to service_role;
create trigger social_profile_revisions_immutable before update or delete on public.social_project_profile_revisions for each row execute function public.social_launch_immutable();
create trigger social_profile_revisions_no_truncate before truncate on public.social_project_profile_revisions for each statement execute function public.social_launch_immutable();

create function public.social_profile_validate(p_profile jsonb) returns void language plpgsql security invoker set search_path='' as $fn$
declare k text; n integer; v text;
begin
 if jsonb_typeof(p_profile) is distinct from 'object' then raise exception 'SOCIAL_PROFILE_INVALID_BODY';end if;
 if (select count(*) from jsonb_object_keys(p_profile))<>7 or exists(select 1 from jsonb_object_keys(p_profile) key_name where key_name not in ('description','audience','tone','websiteUrl','callToAction','factualBoundaries','preferredMediaIds')) then raise exception 'SOCIAL_PROFILE_INVALID_BODY';end if;
 foreach k in array array['description','audience','tone','callToAction','factualBoundaries'] loop
  n=case k when 'description' then 1200 when 'audience' then 600 when 'tone' then 300 when 'callToAction' then 300 else 1000 end;
  v=p_profile->>k;
  if jsonb_typeof(p_profile->k) is distinct from 'string' or char_length(v)>n or k in ('description','audience','tone') and char_length(btrim(v))<1 or v ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'SOCIAL_PROFILE_INVALID_BODY';end if;
 end loop;
 if p_profile->'websiteUrl'<>'null'::jsonb and (jsonb_typeof(p_profile->'websiteUrl')<>'string' or char_length(p_profile->>'websiteUrl')>2048 or p_profile->>'websiteUrl' !~ '^https://[^/@[:space:]]+([/?#]|$)') then raise exception 'SOCIAL_PROFILE_INVALID_BODY';end if;
 if jsonb_typeof(p_profile->'preferredMediaIds') is distinct from 'array' then raise exception 'SOCIAL_PROFILE_INVALID_BODY';end if;
 if jsonb_array_length(p_profile->'preferredMediaIds')>5
 or (select count(*) from jsonb_array_elements(p_profile->'preferredMediaIds'))<>(select count(distinct value) from jsonb_array_elements(p_profile->'preferredMediaIds'))
 or exists(select 1 from jsonb_array_elements(p_profile->'preferredMediaIds') m where jsonb_typeof(m)<>'string' or m#>>'{}' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') then raise exception 'SOCIAL_PROFILE_INVALID_BODY';end if;
end $fn$;

create function public.social_profile_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare p public.projects; r public.social_project_profile_revisions; asset_list jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','conversationId')) then raise exception 'SOCIAL_PROFILE_INVALID_BODY';end if;
 select * into strict p from public.projects where id=(p_input->>'projectId')::uuid;
 select rev.* into r from public.social_project_profiles roots join public.social_project_profile_revisions rev on rev.id=roots.current_revision_id and rev.project_id=roots.project_id where roots.project_id=p.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'sha256',a.checksum_sha256,'mimeType',a.mime_type,'width',a.width,'height',a.height) order by a.preferred desc,a.created_at desc,a.id),'[]') into asset_list
 from (select a.*,(coalesce(r.profile->'preferredMediaIds','[]') ? a.id::text) as preferred from public.assets a where a.project_id=p.id and a.status='active' and a.kind in ('image','video') and a.checksum_sha256 ~ '^[a-f0-9]{64}$' order by preferred desc,a.created_at desc,a.id limit 55) a;
 return jsonb_build_object('project',jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug),
 'revision',case when r.id is null then null else jsonb_build_object('id',r.id,'sequence',r.sequence,'sha256',r.sha256,'profile',r.profile,'createdAt',r.created_at) end,
 'assets',asset_list,'hasMoreAssets',(select count(*)>55 from public.assets a where a.project_id=p.id and a.status='active' and a.kind in ('image','video') and a.checksum_sha256 ~ '^[a-f0-9]{64}$'),
 'workspaceUrl','/projects/'||p.slug||'/social#profile');
end $fn$;

create function public.social_profile_save(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare p public.projects; current_id uuid; previous public.social_project_profile_revisions; next_id uuid; next_seq integer; data jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','conversationId','expectedRevisionId','idempotencyKey','profile'))
 or not(p_input ? 'expectedRevisionId') or jsonb_typeof(p_input->'idempotencyKey') is distinct from 'string' or p_input->>'idempotencyKey' !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'SOCIAL_PROFILE_INVALID_BODY';end if;
 select * into strict p from public.projects where id=(p_input->>'projectId')::uuid for update;
 perform public.social_content_active(p.id);
 data=p_input-'idempotencyKey';
 select * into previous from public.social_project_profile_revisions where project_id=p.id and idempotency_key=p_input->>'idempotencyKey';
 if found then
  if previous.input_data<>data or previous.created_by<>(p_principal->>'userId')::uuid then raise exception 'SOCIAL_PROFILE_REVISION_CONFLICT';end if;
  return public.social_profile_read(p_principal,jsonb_build_object('projectId',p.id,'conversationId',p_input->'conversationId'));
 end if;
 perform public.social_profile_validate(p_input->'profile');
 if exists(select 1 from jsonb_array_elements_text(p_input->'profile'->'preferredMediaIds') a(id) where not exists(select 1 from public.assets b where b.id=a.id::uuid and b.project_id=p.id and b.status='active' and b.kind in ('image','video') and b.checksum_sha256 ~ '^[a-f0-9]{64}$')) then raise exception 'SOCIAL_PROFILE_INVALID_BODY';end if;
 select current_revision_id into current_id from public.social_project_profiles where project_id=p.id;
 if current_id is distinct from (p_input->>'expectedRevisionId')::uuid then raise exception 'SOCIAL_PROFILE_REVISION_CONFLICT';end if;
 insert into public.social_project_profiles(project_id) values(p.id) on conflict do nothing;
 select coalesce(max(sequence),0)+1 into next_seq from public.social_project_profile_revisions where project_id=p.id;
 insert into public.social_project_profile_revisions(project_id,sequence,sha256,profile,input_data,idempotency_key,created_by,conversation_id)
 values(p.id,next_seq,encode(pg_catalog.sha256(convert_to((p_input->'profile')::text,'UTF8')),'hex'),p_input->'profile',data,p_input->>'idempotencyKey',(p_principal->>'userId')::uuid,(p_input->>'conversationId')::uuid) returning id into next_id;
 update public.social_project_profiles set current_revision_id=next_id where project_id=p.id;
 return public.social_profile_read(p_principal,jsonb_build_object('projectId',p.id,'conversationId',p_input->'conversationId'));
end $fn$;
revoke all on function public.social_profile_validate(jsonb),public.social_profile_read(jsonb,jsonb),public.social_profile_save(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.social_profile_validate(jsonb),public.social_profile_read(jsonb,jsonb),public.social_profile_save(jsonb,jsonb) to service_role;
