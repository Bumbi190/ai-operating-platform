-- ISOLATED SQL TEST ONLY; not a migration or permission grant for Omnira.
create table public.calendar_source_revision_probe (
 owner_user_id uuid not null references auth.users(id),
 project_id uuid not null references public.projects(id),
 revision bigint not null default 0 check (revision>=0),
 primary key(owner_user_id,project_id)
);
revoke all on public.calendar_source_revision_probe from public,anon,authenticated,service_role;
create or replace function public.calendar_source_revision_probe_bump(p_owner uuid,p_project uuid)
returns bigint language plpgsql security definer set search_path='' as $fn$
declare updated_revision bigint;
begin
 if p_owner is distinct from auth.uid() or not exists(select 1 from public.projects where id=p_project and owner_id=p_owner)
 then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values(p_owner,p_project,1)
 on conflict(owner_user_id,project_id) do update set revision=calendar_source_revision_probe.revision+1
 returning revision into updated_revision;
 return updated_revision;
end $fn$;
revoke all on function public.calendar_source_revision_probe_bump(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.calendar_source_revision_probe_bump(uuid,uuid) to authenticated;
-- Fixture-only comparison, not an authorization for writes.
create or replace function public.calendar_source_revision_probe_compare(p_owner uuid,p_project uuid,p_expected bigint)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare current_revision bigint;
begin
 if p_owner is distinct from auth.uid() or p_expected is null or p_expected<0 or not exists(select 1 from public.projects where id=p_project and owner_id=p_owner)
 then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 -- Lock the revision row; concurrent revisions cannot commit while it is locked.
 select revision into current_revision from public.calendar_source_revision_probe
 where owner_user_id=p_owner and project_id=p_project for update;
 return current_revision is not null and current_revision=p_expected;
end $fn$;
revoke all on function public.calendar_source_revision_probe_compare(uuid,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.calendar_source_revision_probe_compare(uuid,uuid,bigint) to authenticated;

