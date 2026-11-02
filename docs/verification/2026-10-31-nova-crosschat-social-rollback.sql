-- Reviewed rollback candidate; apply only through separately approved forward migration.
create or replace function public.social_launch_assert_owner(p_principal jsonb,p_input jsonb) returns void language plpgsql security invoker set search_path='' as $fn$
begin
 if jsonb_typeof(p_principal) is distinct from 'object' or jsonb_typeof(p_principal->'allowedProjectIds') is distinct from 'array'
  or not coalesce((p_principal->'allowedProjectIds') ? (p_input->>'projectId'),false)
  or not exists(select 1 from public.projects p where p.id=(p_input->>'projectId')::uuid and p.owner_id=(p_principal->>'userId')::uuid)
 then raise exception 'SOCIAL_LAUNCH_NOT_FOUND' using errcode='P0002'; end if;
 if p_input->>'conversationId' is not null and not exists(select 1 from public.conversations c where c.id=(p_input->>'conversationId')::uuid and c.user_id=(p_principal->>'userId')::uuid and c.project_id=(p_input->>'projectId')::uuid)
 then raise exception 'SOCIAL_LAUNCH_NOT_FOUND' using errcode='P0002'; end if;
end
$fn$;
revoke all on function public.social_launch_assert_owner(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.social_launch_assert_owner(jsonb,jsonb) to service_role;
