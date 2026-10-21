-- Isolated review candidate derived from the actual social_schedule_release_confirm.
-- NOT A PRODUCTION MIGRATION: other social writers and real content checks absent.
-- Every confirmed evidence insertion is a new write: the original RPC does NOT
-- implement an idempotency key, and we retain its append-only semantics.
create or replace function public.social_schedule_release_confirm(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare e public.social_monthly_release_evidence;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_schedule_fields(p_input,array['projectId','releaseMonth','catalogSha256','customerViewUrl','confirmed']);
 if p_input->'confirmed' is distinct from 'true'::jsonb or coalesce(p_input->>'releaseMonth','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or coalesce(p_input->>'catalogSha256','') !~ '^[a-f0-9]{64}$'
 or coalesce(p_input->>'customerViewUrl','') !~ '^https://[a-zA-Z0-9.-]+(/[^[:space:]?#]*)?$' or char_length(p_input->>'customerViewUrl')>2048 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 -- Calendar source revision must be locked before the project row.
 perform public.calendar_social_source_lock_probe(p_principal,p_input);
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_content_active((p_input->>'projectId')::uuid);
 insert into public.social_monthly_release_evidence(project_id,release_month,catalog_sha256,customer_view_url,verified_by,verified_at)
 values((p_input->>'projectId')::uuid,p_input->>'releaseMonth',p_input->>'catalogSha256',p_input->>'customerViewUrl',(p_principal->>'userId')::uuid,public.social_schedule_now()) returning * into e;
 insert into public.social_schedule_events(project_id,event,actor_kind,actor,details) values(e.project_id,'release_access_confirmed','owner',e.verified_by,jsonb_build_object('evidenceId',e.id,'releaseMonth',e.release_month,'catalogSha256',e.catalog_sha256,'kind',e.kind));
 perform public.calendar_social_source_bump_probe(p_principal,p_input);
 return jsonb_build_object('id',e.id,'releaseMonth',e.release_month,'catalogSha256',e.catalog_sha256,'kind',e.kind,'verifiedAt',e.verified_at);
end $fn$;
revoke all on function public.social_schedule_release_confirm(jsonb,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.social_schedule_release_confirm(jsonb,jsonb) to service_role;
