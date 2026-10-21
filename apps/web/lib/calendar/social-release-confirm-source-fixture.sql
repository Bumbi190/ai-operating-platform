-- Isolated test-only release fixture; table schema from the real scheduling migration.
-- social_content_active below is intentionally abbreviated; never deploy.
create table public.social_monthly_release_evidence(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,release_month text not null check(release_month~'^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 catalog_sha256 text not null check(catalog_sha256~'^[a-f0-9]{64}$'),kind text not null default 'owner_verified_access' check(kind='owner_verified_access'),
 customer_view_url text not null,verified_by uuid not null references auth.users,verified_at timestamptz not null default clock_timestamp(),unique(id,project_id));
grant select,insert on public.social_monthly_release_evidence to service_role;

create or replace function public.social_content_active(p_project uuid)
returns void language plpgsql security invoker set search_path='' as $fn$
begin
 if not exists(select 1 from public.projects where id=p_project)
 then raise exception 'SOCIAL_CONTENT_STOPPED';end if;
end $fn$;
revoke all on function public.social_content_active(uuid) from public,anon,authenticated,service_role;
grant execute on function public.social_content_active(uuid) to service_role;
