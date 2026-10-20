-- TEST-ONLY SQL PROTOTYPE. DO NOT DEPLOY: other social schedule writers
-- are not yet instrumented and the principal is trusted only on service_role RPCs.
-- The production system must verify server principal before this definer boundary.
create or replace function public.calendar_social_source_lock_probe(p_principal jsonb,p_input jsonb)
returns bigint language plpgsql security definer set search_path='' as $fn$
declare p_project uuid; p_owner uuid; current_revision bigint;
begin
 if jsonb_typeof(p_principal) is distinct from 'object'
   or jsonb_typeof(p_principal->'allowedProjectIds') is distinct from 'array'
   or not coalesce((p_principal->'allowedProjectIds') ? (p_input->>'projectId'),false)
 then raise exception 'SOCIAL_SOURCE_NOT_AUTHORIZED' using errcode='42501'; end if;
 p_project=(p_input->>'projectId')::uuid;
 p_owner=(p_principal->>'userId')::uuid;
 if p_owner is null or p_project is null or not exists (
   select 1 from public.projects p where p.id=p_project and p.owner_id=p_owner
 ) then raise exception 'SOCIAL_SOURCE_NOT_AUTHORIZED' using errcode='42501'; end if;
 select r.revision into current_revision
 from public.calendar_source_revision_probe r
 where r.project_id=p_project and r.owner_user_id=p_owner
 for update;
 if not found then raise exception 'MISSING_SOURCE_REVISION' using errcode='23514'; end if;
 return current_revision;
end $fn$;
revoke all on function public.calendar_social_source_lock_probe(jsonb,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.calendar_social_source_lock_probe(jsonb,jsonb) to service_role;

create or replace function public.calendar_social_source_bump_probe(p_principal jsonb,p_input jsonb)
returns bigint language plpgsql security definer set search_path='' as $fn$
declare p_project uuid; p_owner uuid; next_revision bigint;
begin
 perform public.calendar_social_source_lock_probe(p_principal,p_input);
 p_project=(p_input->>'projectId')::uuid;
 p_owner=(p_principal->>'userId')::uuid;
 update public.calendar_source_revision_probe
 set revision=revision+1
 where owner_user_id=p_owner and project_id=p_project
 returning revision into next_revision;
 if not found then raise exception 'MISSING_SOURCE_REVISION' using errcode='23514'; end if;
 return next_revision;
end $fn$;
revoke all on function public.calendar_social_source_bump_probe(jsonb,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.calendar_social_source_bump_probe(jsonb,jsonb) to service_role;

create or replace function public.social_schedule_monthly_rule_save(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
begin
 perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_schedule_fields(p_input,array['projectId','rule']);
 perform public.social_schedule_fields(p_input->'rule',array['dayOfMonth','localTime','timeZone','channels','enabled']);
 if (p_input->'rule')-'enabled' is distinct from '{"dayOfMonth":1,"localTime":"20:30","timeZone":"Europe/Stockholm","channels":["facebook","instagram"]}'::jsonb or jsonb_typeof(p_input->'rule'->'enabled') is distinct from 'boolean' then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 -- The source revision is locked before the ordinary project FOR UPDATE.
 perform public.calendar_social_source_lock_probe(p_principal,p_input);
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;perform public.social_launch_assert_owner(p_principal,p_input);
 insert into public.social_monthly_release_rules(project_id,rule,updated_by) values((p_input->>'projectId')::uuid,p_input->'rule',(p_principal->>'userId')::uuid)
 on conflict(project_id) do update set rule=excluded.rule,updated_by=excluded.updated_by,updated_at=public.social_schedule_now();
 insert into public.social_schedule_events(project_id,event,actor_kind,actor,details) values((p_input->>'projectId')::uuid,'monthly_rule_saved','owner',(p_principal->>'userId')::uuid,p_input->'rule');
 perform public.calendar_social_source_bump_probe(p_principal,p_input);
 return p_input->'rule';
end $fn$;
revoke all on function public.social_schedule_monthly_rule_save(jsonb,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.social_schedule_monthly_rule_save(jsonb,jsonb) to service_role;
