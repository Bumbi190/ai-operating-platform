-- TEST-ONLY CANDIDATE: revision row must be locked BEFORE a workflow row.
-- This is not the real workflow RPC and does not implement its audit history.
-- Never apply to production without preserving workflow ACL/evidence invariants.
create or replace function public.calendar_workflow_wake_revision_first_probe(p_instance_id uuid,p_wake_at timestamptz)
returns void language plpgsql security definer set search_path='' as $fn$
declare p_project uuid; p_owner uuid;
begin
 select i.project_id into p_project from public.workflow_instances i where i.id=p_instance_id;
 if not found then raise exception 'UNKNOWN_WORKFLOW' using errcode='23503'; end if;
 select p.owner_id into p_owner from public.projects p where p.id=p_project;
 if p_owner is null then raise exception 'UNKNOWN_OWNER' using errcode='23514'; end if;
 -- Shared lock order: source revision, then workflow instance row.
 perform 1 from public.calendar_source_revision_probe r
 where r.owner_user_id=p_owner and r.project_id=p_project for update;
 if not found then raise exception 'MISSING_SOURCE_REVISION' using errcode='23514'; end if;
 perform 1 from public.workflow_instances i
 where i.id=p_instance_id and i.project_id=p_project for update;
 if not found then raise exception 'WORKFLOW_MOVED' using errcode='23514'; end if;
 update public.workflow_instances set wake_at=p_wake_at where id=p_instance_id and project_id=p_project;
 -- Existing fixture trigger bumps the same revision after the wake change.
end $fn$;
revoke all on function public.calendar_workflow_wake_revision_first_probe(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.calendar_workflow_wake_revision_first_probe(uuid,timestamptz) to service_role;
