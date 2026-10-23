-- TEST ONLY: install inside the isolated replay transaction and roll back.
-- This tests the SQL privilege boundary, not a deployable Data API identity.
-- The function owner has elevated table access; the caller has none. Before a
-- production cutover, audit every definer body and its inputs, isolate media
-- and credentials, and authenticate provider receipts independently.
create role social_schedule_rpc_only_fixture nologin nobypassrls;
grant usage on schema public to social_schedule_rpc_only_fixture;

-- An administrator seeds principal-to-project bindings in the replay. The
-- RPC caller cannot edit this table. PostgREST supplies the subject from a
-- validated JWT; direct SQL probes set the same transaction-local claim.
-- This is still a test mapping, not a production credential issuer.
create table public.social_schedule_rpc_scope_fixture(
 principal_id uuid not null,project_id uuid not null,
 primary key(principal_id,project_id));
revoke all on public.social_schedule_rpc_scope_fixture from public, anon, authenticated, service_role;

create function public.social_schedule_rpc_check_project_fixture(p_project uuid)
returns void language plpgsql security definer set search_path='' as $fn$
declare principal text; claims jsonb;
begin
 claims := nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 principal := claims->>'sub';
 if claims->>'iss' is distinct from 'omnira-schedule-fixture'
   or claims->>'aud' is distinct from 'authenticated'
   or principal is null or principal !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then raise exception 'SOCIAL_SCHEDULE_PROJECT_SCOPE_DENIED' using errcode='42501'; end if;
 if not exists(select 1 from public.social_schedule_rpc_scope_fixture
   where principal_id=principal::uuid and project_id=p_project)
 then raise exception 'SOCIAL_SCHEDULE_PROJECT_SCOPE_DENIED' using errcode='42501'; end if;
end $fn$;
revoke all on function public.social_schedule_rpc_check_project_fixture(uuid)
 from public, anon, authenticated, service_role;

create function public.social_schedule_rpc_check_projects_fixture(p_projects jsonb)
returns void language plpgsql security definer set search_path='' as $fn$
declare project_text text;
begin
 if jsonb_typeof(p_projects) is distinct from 'array' or jsonb_array_length(p_projects)>100
 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY'; end if;
 for project_text in select jsonb_array_elements_text(p_projects) loop
  perform public.social_schedule_rpc_check_project_fixture(project_text::uuid);
 end loop;
end $fn$;
revoke all on function public.social_schedule_rpc_check_projects_fixture(jsonb)
 from public, anon, authenticated, service_role;

create function public.social_schedule_rpc_check_job_fixture(p_claim jsonb)
returns void language plpgsql security definer set search_path='' as $fn$
declare project uuid;
begin
 select project_id into project from public.social_schedule_jobs where id=(p_claim->>'jobId')::uuid;
 if project is null then raise exception 'SOCIAL_SCHEDULE_NOT_FOUND' using errcode='P0002'; end if;
 perform public.social_schedule_rpc_check_project_fixture(project);
end $fn$;
revoke all on function public.social_schedule_rpc_check_job_fixture(jsonb)
 from public, anon, authenticated, service_role;

-- Preserve the canonical bodies under inaccessible fixture names. Wrappers
-- enforce project scope before their elevated originals see caller JSON.
-- All six worker entry points and their invoker helpers run as the owner.
alter function public.social_schedule_claim(jsonb) security definer;
alter function public.social_schedule_authorize_write(jsonb,jsonb) security definer;
alter function public.social_schedule_step(jsonb,jsonb) security definer;
alter function public.social_schedule_peek(jsonb) security definer;
alter function public.social_schedule_receipt(jsonb) security definer;
alter function public.social_schedule_recover_checkpoint(jsonb) security definer;

revoke execute on function public.social_schedule_claim(jsonb),
 public.social_schedule_authorize_write(jsonb,jsonb),
 public.social_schedule_step(jsonb,jsonb),
 public.social_schedule_peek(jsonb),
 public.social_schedule_receipt(jsonb),
 public.social_schedule_recover_checkpoint(jsonb)
 from public, anon, authenticated, service_role;
alter function public.social_schedule_claim(jsonb) rename to social_schedule_claim_unchecked_fixture;
alter function public.social_schedule_authorize_write(jsonb,jsonb) rename to social_schedule_authorize_unchecked_fixture;
alter function public.social_schedule_step(jsonb,jsonb) rename to social_schedule_step_unchecked_fixture;
alter function public.social_schedule_peek(jsonb) rename to social_schedule_peek_unchecked_fixture;
alter function public.social_schedule_receipt(jsonb) rename to social_schedule_receipt_unchecked_fixture;
alter function public.social_schedule_recover_checkpoint(jsonb) rename to social_schedule_recover_unchecked_fixture;

create function public.social_schedule_claim(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
begin
 perform public.social_schedule_rpc_check_projects_fixture(p_input->'projectIds');
 return public.social_schedule_claim_unchecked_fixture(p_input);
end $fn$;
create function public.social_schedule_authorize_write(p_claim jsonb,p_project_ids jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
begin
 perform public.social_schedule_rpc_check_job_fixture(p_claim);
 perform public.social_schedule_rpc_check_projects_fixture(p_project_ids);
 return public.social_schedule_authorize_unchecked_fixture(p_claim,p_project_ids);
end $fn$;
create function public.social_schedule_step(p_claim jsonb,p_step jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
begin
 perform public.social_schedule_rpc_check_job_fixture(p_claim);
 return public.social_schedule_step_unchecked_fixture(p_claim,p_step);
end $fn$;
create function public.social_schedule_peek(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
begin
 perform public.social_schedule_rpc_check_projects_fixture(p_input->'projectIds');
 return public.social_schedule_peek_unchecked_fixture(p_input);
end $fn$;
create function public.social_schedule_receipt(p_input jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
begin
 perform public.social_schedule_rpc_check_job_fixture(p_input);
 return public.social_schedule_receipt_unchecked_fixture(p_input);
end $fn$;
create function public.social_schedule_recover_checkpoint(p_claim jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
begin
 perform public.social_schedule_rpc_check_job_fixture(p_claim);
 return public.social_schedule_recover_unchecked_fixture(p_claim);
end $fn$;

revoke execute on function public.social_schedule_claim(jsonb),
 public.social_schedule_authorize_write(jsonb,jsonb),
 public.social_schedule_step(jsonb,jsonb),
 public.social_schedule_peek(jsonb),
 public.social_schedule_receipt(jsonb),
 public.social_schedule_recover_checkpoint(jsonb)
 from public, anon, authenticated, service_role;
grant execute on function public.social_schedule_claim(jsonb),
 public.social_schedule_authorize_write(jsonb,jsonb),
 public.social_schedule_step(jsonb,jsonb),
 public.social_schedule_peek(jsonb),
 public.social_schedule_receipt(jsonb),
 public.social_schedule_recover_checkpoint(jsonb)
 to social_schedule_rpc_only_fixture;
