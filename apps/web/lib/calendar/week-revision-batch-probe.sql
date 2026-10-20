-- TEST-ONLY wrapper: same SQL transaction locks source revision before batch insert.
-- Not integrated with actual social/workflow writers; do not deploy.
create or replace function public.calendar_week_revision_batch_probe(p_rows jsonb,p_key uuid,p_project uuid,p_expected bigint)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare who uuid:=auth.uid(); seen bigint;
begin
 if who is null or p_project is null or p_expected is null or p_expected<0
 or not exists(select 1 from public.projects where id=p_project and owner_id=who)
 then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 select revision into seen from public.calendar_source_revision_probe
 where owner_user_id=who and project_id=p_project for update;
 if seen is null or seen<>p_expected then raise exception 'STALE_SOURCE' using errcode='23514'; end if;
 return public.calendar_week_batch_probe(p_rows,p_key);
end $fn$;
revoke all on function public.calendar_week_revision_batch_probe(jsonb,uuid,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.calendar_week_revision_batch_probe(jsonb,uuid,uuid,bigint) to authenticated;
