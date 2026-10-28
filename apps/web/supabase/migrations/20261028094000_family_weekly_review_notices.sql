-- Persistent, owner-only IN-APP notice for verified weekly editorial drafts.
-- No outbound email, provider call, scheduler, model execution or public posting.
-- A unique preparation_id makes worker retries harmless and cost-free.
create table public.family_weekly_review_notices (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 owner_id uuid not null references auth.users(id) on delete restrict,
 preparation_id uuid not null unique references public.social_weekly_preparations(id) on delete restrict,
 week_start date not null,
 draft_count integer not null check (draft_count in (2,4)),
 state text not null default 'awaiting_review' check(state='awaiting_review'),
 can_schedule boolean not null default false check(can_schedule=false),
 can_publish boolean not null default false check(can_publish=false),
 created_at timestamptz not null default clock_timestamp(),
 constraint family_weekly_review_notice_project_only check(
  project_id='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid
 )
);
create index family_weekly_review_notices_owner_idx
 on public.family_weekly_review_notices(owner_id,project_id,created_at desc);

-- Every notice MUST match a real persisted owner-created weekly preparation;
-- a forged source ID or a foreign project cannot be used for notifications.
create function public.family_weekly_review_notice_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare expected_count integer;
begin
 if tg_op<>'INSERT' then
  raise exception 'WEEKLY_NOTICE_IMMUTABLE' using errcode='42501';
 end if;
 select jsonb_array_length(p.result->'posts') into expected_count
 from public.social_weekly_preparations p
 where p.id=new.preparation_id
   and p.project_id=new.project_id
   and p.created_by=new.owner_id
   and p.week_start=new.week_start
   and p.result->>'status'='editorial_review_required'
   and p.result->'publicationAuthority'='false'::jsonb;
 if expected_count is null or expected_count<>new.draft_count then
  raise exception 'WEEKLY_NOTICE_UNVERIFIED' using errcode='42501';
 end if;
 new.created_at:=clock_timestamp();
 return new;
end $$;

create trigger family_weekly_review_notice_insert
before insert on public.family_weekly_review_notices
for each row execute function public.family_weekly_review_notice_guard();

create trigger family_weekly_review_notice_immutable
before update or delete on public.family_weekly_review_notices
for each row execute function public.family_weekly_review_notice_guard();

alter table public.family_weekly_review_notices enable row level security;
revoke all on public.family_weekly_review_notices from public,anon,authenticated,service_role;
grant select on public.family_weekly_review_notices to authenticated,service_role;
grant insert on public.family_weekly_review_notices to service_role;

create policy family_weekly_review_notice_owner_read
 on public.family_weekly_review_notices for select to authenticated
 using (
  owner_id=(select auth.uid()) and
  exists(select 1 from public.projects p
   where p.id=project_id and p.owner_id=(select auth.uid()))
 );
revoke all on function public.family_weekly_review_notice_guard() from public,anon,authenticated;

comment on table public.family_weekly_review_notices is
 'Idempotent, owner-private in-app review notices; no provider delivery and no publication authority.';
