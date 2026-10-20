-- CANDIDATE ONLY. Load in isolated fixture, never apply to production.
-- A database trigger catches direct and RPC workflow wake_at edits alike.
create or replace function public.calendar_workflow_wake_revision_trigger_probe()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare owner_id uuid;
begin
 if new.wake_at is not distinct from old.wake_at then return new; end if;
 select p.owner_id into owner_id from public.projects p where p.id=new.project_id;
 if owner_id is null then raise exception 'NO_PROJECT_OWNER' using errcode='23514'; end if;
 update public.calendar_source_revision_probe
 set revision=revision+1 where owner_user_id=owner_id and project_id=new.project_id;
 if not found then raise exception 'MISSING_SOURCE_REVISION' using errcode='23514'; end if;
 return new;
end $fn$;
revoke all on function public.calendar_workflow_wake_revision_trigger_probe() from public,anon,authenticated,service_role;
create trigger calendar_workflow_wake_revision_test_trigger
before update of wake_at on public.workflow_instances
for each row execute function public.calendar_workflow_wake_revision_trigger_probe();
