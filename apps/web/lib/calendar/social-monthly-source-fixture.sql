-- Test-only subset of existing social infrastructure for original monthly RPC test.
create table public.conversations(id uuid primary key, user_id uuid not null, project_id uuid not null);
create table public.social_monthly_release_rules(project_id uuid primary key references public.projects(id),rule jsonb not null,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default clock_timestamp());
create table public.social_schedule_events(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),event text not null,actor_kind text not null,actor uuid references auth.users(id),details jsonb not null);
grant usage on schema public,auth to service_role; grant select,update on public.projects to service_role; grant select on public.conversations to service_role;
grant select,insert,update on public.social_monthly_release_rules to service_role;
grant select,insert on public.social_schedule_events to service_role;
create function public.social_schedule_fields(v jsonb,required text[],optional text[] default '{}') returns void language plpgsql immutable security invoker set search_path='' as $fn$
begin
 if jsonb_typeof(v) is distinct from 'object' or not(v?&required) or exists(select 1 from jsonb_object_keys(v) k where not(k=any(required||optional))) then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
end $fn$;
create function public.social_schedule_now() returns timestamptz language sql volatile security invoker set search_path='' as $$select clock_timestamp()$$;
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
