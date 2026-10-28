-- Synthetic-only schema for isolated disposable PostgreSQL 16 smoke tests.
-- This DOES NOT recreate Omnira's native source-hash and social approval logic.
-- It only tests proposal DDL, RLS, consent locks, bound-run checks and notices.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

create table public.projects(
 id uuid primary key,
 owner_id uuid not null references auth.users(id),
 slug text not null,
 execution_paused boolean not null default false
);
create table public.conversations(
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 project_id uuid references public.projects(id),
 created_at timestamptz default clock_timestamp()
);
create table public.runs(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id),
 workflow_id uuid,
 workflow_instance_id uuid,
 status text not null default 'pending',
 claim_id uuid,
 lease_until timestamptz,
 attempts integer not null default 0,
 max_attempts integer not null default 3,
 cancel_requested boolean not null default false,
 kind text,
 idempotency_key text,
 input jsonb not null default '{}'::jsonb,
 context jsonb not null default '{}'::jsonb,
 constraint runs_idempotency_key_sha256
 check(idempotency_key is null or idempotency_key~'^[0-9a-f]{64}$'),
 constraint runs_action_binding_complete
 check(workflow_instance_id is not null or idempotency_key is null)
);
create table public.social_weekly_preparations(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id),
 created_by uuid not null references auth.users(id),
 week_start date not null,
 result jsonb not null
);
create function public.social_weekly_save(p_principal jsonb,p_input jsonb)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_project uuid:=(p_input->>'projectId')::uuid;
 v_owner uuid:=(p_principal->>'userId')::uuid;
 v_conversation uuid:=(p_input->>'conversationId')::uuid;
 v_id uuid:=gen_random_uuid();
 v_result jsonb;
begin
 if not exists(select 1 from public.projects
    where id=v_project and owner_id=v_owner)
  or not exists(select 1 from public.conversations
    where id=v_conversation and user_id=v_owner and project_id=v_project)
  or p_input->>'contextHash' is null then
  raise exception 'STUB_EDITORIAL_SCOPE_REFUSED' using errcode='42501';
 end if;
 v_result:=jsonb_build_object(
  'preparationId',v_id,'status','editorial_review_required',
  'publicationAuthority',false,'posts',
  jsonb_build_array(jsonb_build_object('postId',gen_random_uuid()),
                    jsonb_build_object('postId',gen_random_uuid())),
  'workspaceUrl','https://app.omniraos.se/projects/familje-stunden/social#content'
 );
 insert into public.social_weekly_preparations(
  id,project_id,created_by,week_start,result
 ) values(v_id,v_project,v_owner,(p_input->>'weekStart')::date,v_result);
 return v_result;
end $$;

grant select on public.projects,public.conversations to authenticated;
grant select on public.projects,public.conversations,public.runs,public.social_weekly_preparations to service_role;
grant update,insert on public.runs to service_role;
grant insert on public.social_weekly_preparations to service_role;
grant usage on schema public to authenticated,service_role;
grant select on public.social_weekly_preparations to authenticated;
grant execute on function public.social_weekly_save(jsonb,jsonb) to service_role;

insert into auth.users(id) values
 ('77777777-7777-4777-8777-777777777777'),
 ('88888888-8888-4888-8888-888888888888');
insert into public.projects(id,owner_id,slug) values
 ('77cda551-57c9-4dc0-b019-1bb6438777f7',
  '77777777-7777-4777-8777-777777777777','familje-stunden');
insert into public.conversations(id,user_id,project_id) values
 ('55555555-5555-4555-8555-555555555555',
  '77777777-7777-4777-8777-777777777777',
  '77cda551-57c9-4dc0-b019-1bb6438777f7');
insert into public.runs(
 id,project_id,status,claim_id,lease_until,
 attempts,max_attempts,cancel_requested,kind,idempotency_key,input
) values(
 '66666666-6666-4666-8666-666666666666',
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 'pending',null,
 null,
 0,1,false,
 'family_weekly_editorial_drafts',
 null,
 '{"ownerId":"77777777-7777-4777-8777-777777777777","conversationId":"55555555-5555-4555-8555-555555555555","weekStart":"2027-01-04","eventId":1,"source":"family_weekly_sunday_v1"}'::jsonb
);
