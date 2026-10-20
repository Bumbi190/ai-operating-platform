-- ISOLATED CLAIM TEST INFRASTRUCTURE: never deploy.
-- Existing project/content/batch/job tables are copied from social-review-source-fixture.sql.
-- Missing full provider, release and content-review schemas are intentional limitations.
create table public.social_monthly_release_evidence(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id),
 release_month text not null,
 catalog_sha256 text not null,
 kind text not null default 'owner_verified_access',
 verified_by uuid not null references auth.users(id),
 verified_at timestamptz not null default now()
);
grant select on public.social_monthly_release_evidence to service_role;
alter table public.social_publication_events add column actor_kind text,add column job_id uuid;

create function public.social_schedule_snapshot(j public.social_schedule_jobs)
returns jsonb language sql stable security invoker set search_path='' as $fn$
 select jsonb_build_object(
  'projectId',j.project_id,'jobId',j.id,'postId',j.post_id,
  'scheduledAt',j.scheduled_at,'version',j.version,'approvalId',j.approval_id);
$fn$;

-- Deliberately abbreviated authority: verifies approved/not revoked + due time,
-- but does not verify real media, account, provider, release or content gates.
create function public.social_schedule_authority(
 j public.social_schedule_jobs,p_require_release boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
begin
 if not exists(
   select 1 from public.social_schedule_decisions a
   join public.projects p on p.id=a.project_id and p.owner_id=a.actor
   where a.id=j.approval_id and a.project_id=j.project_id and a.action='approve'
     and not exists(select 1 from public.social_schedule_decisions v
       where v.approval_id=a.id and v.action='revoke')
 ) then raise exception 'SOCIAL_SCHEDULE_REVIEW_REQUIRED';end if;
 if j.scheduled_at>public.social_schedule_now()
 then raise exception 'SOCIAL_SCHEDULE_NOT_DUE';end if;
 if j.expires_at<public.social_schedule_now()
 then raise exception 'SOCIAL_SCHEDULE_EXPIRED';end if;
 return public.social_schedule_snapshot(j);
end $fn$;
revoke all on function public.social_schedule_snapshot(public.social_schedule_jobs),
 public.social_schedule_authority(public.social_schedule_jobs,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.social_schedule_snapshot(public.social_schedule_jobs),
 public.social_schedule_authority(public.social_schedule_jobs,boolean)
 to service_role;
