-- ISOLATED PROOF ONLY: emulate an external workflow wake writer and its source revision in one transaction.
-- Does not patch the real workflow RPC or grant production capabilities.
create table public.calendar_workflow_wake_probe(owner_user_id uuid not null,project_id uuid not null,wake_at timestamptz,primary key(owner_user_id,project_id));
revoke all on public.calendar_workflow_wake_probe from public,anon,authenticated,service_role;
create or replace function public.calendar_workflow_wake_revision_probe(p_project uuid,p_wake timestamptz,p_fail boolean default false)
returns bigint language plpgsql security definer set search_path='' as $fn$
declare who uuid:=auth.uid(); next_revision bigint;
begin
 if who is null or not exists(select 1 from public.projects where id=p_project and owner_id=who) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 -- Lock the revision first; future real writers need identical lock ordering.
 update public.calendar_source_revision_probe set revision=revision+1 where owner_user_id=who and project_id=p_project returning revision into next_revision;
 if not found then raise exception 'MISSING_SOURCE_REVISION' using errcode='23514'; end if;
 insert into public.calendar_workflow_wake_probe(owner_user_id,project_id,wake_at) values(who,p_project,p_wake)
 on conflict(owner_user_id,project_id) do update set wake_at=excluded.wake_at;
 if p_fail then raise exception 'INJECTED_FAILURE' using errcode='23514'; end if;
 return next_revision;
end $fn$;
revoke all on function public.calendar_workflow_wake_revision_probe(uuid,timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function public.calendar_workflow_wake_revision_probe(uuid,timestamptz,boolean) to authenticated;
