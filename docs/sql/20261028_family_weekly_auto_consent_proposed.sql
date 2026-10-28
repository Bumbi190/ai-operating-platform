-- PROPOSED SQL, UNAPPLIED: requires migration-guard and real RLS review before canonical promotion.
-- Familje-Stunden weekly DRAFT preparation enrollment ONLY.
-- This migration alone schedules nothing, spends nothing and publishes nothing.
-- Owner opt-in is append-only, revocable and bounded to a maximum 90 days.
-- A separate worker grant/claim/runtime flag is required before any execution.
create table public.family_weekly_auto_consent_events (
 event_id bigint generated always as identity primary key,
 project_id uuid not null references public.projects(id) on delete restrict,
 owner_id uuid not null references auth.users(id) on delete restrict,
 action text not null check(action in ('enable','revoke')),
 valid_until timestamptz,
 max_completion_tokens integer not null default 1800
   check(max_completion_tokens=1800),
 max_calls_per_week integer not null default 1
   check(max_calls_per_week=1),
 can_schedule boolean not null default false
   check(can_schedule=false),
 can_publish boolean not null default false
   check(can_publish=false),
 created_at timestamptz not null default clock_timestamp(),
 constraint family_weekly_auto_only_family check(
  project_id='77cda551-57c9-4dc0-b019-1bb6438777f7'::uuid
 ),
 constraint family_weekly_auto_expiration_check check (
  (action='enable' and valid_until is not null and valid_until>created_at
   and valid_until<=created_at+interval '90 days')
  or (action='revoke' and valid_until is null)
 )
);
create index family_weekly_auto_consent_owner_idx
 on public.family_weekly_auto_consent_events(owner_id,project_id,event_id desc);

-- Timestamp is ALWAYS stamped by the database; users may not fake grant time.
-- Existing rows can never be updated or deleted, even by service_role.
create function public.family_weekly_auto_consent_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then
  raise exception 'WEEKLY_CONSENT_IMMUTABLE' using errcode='42501';
 end if;
 new.created_at:=clock_timestamp();
 if new.action='enable' and
  (new.valid_until is null or new.valid_until<=new.created_at
   or new.valid_until>new.created_at+interval '90 days') then
  raise exception 'WEEKLY_CONSENT_EXPIRY_INVALID' using errcode='22023';
 end if;
 if new.action='revoke' and new.valid_until is not null then
  raise exception 'WEEKLY_CONSENT_REVOKE_INVALID' using errcode='22023';
 end if;
 return new;
end $$;

create trigger family_weekly_auto_consent_insert
before insert on public.family_weekly_auto_consent_events
for each row execute function public.family_weekly_auto_consent_guard();

create trigger family_weekly_auto_consent_immutable
before update or delete on public.family_weekly_auto_consent_events
for each row execute function public.family_weekly_auto_consent_guard();

alter table public.family_weekly_auto_consent_events enable row level security;
revoke all on public.family_weekly_auto_consent_events from public,anon,authenticated,service_role;
grant select,insert on public.family_weekly_auto_consent_events to authenticated;
grant select on public.family_weekly_auto_consent_events to service_role;

-- Authenticated rows are visible/writable only to the CURRENT owner of the
-- exact Familje-Stunden project. A former owner is automatically denied.
create policy family_weekly_auto_consent_owner_read
 on public.family_weekly_auto_consent_events for select to authenticated
 using (
  owner_id=(select auth.uid()) and
  exists(select 1 from public.projects p
   where p.id=project_id and p.owner_id=(select auth.uid()))
 );
create policy family_weekly_auto_consent_owner_insert
 on public.family_weekly_auto_consent_events for insert to authenticated
 with check (
  owner_id=(select auth.uid()) and
  exists(select 1 from public.projects p
   where p.id=project_id and p.owner_id=(select auth.uid()))
 );

revoke all on function public.family_weekly_auto_consent_guard() from public,anon,authenticated;
-- The trigger function is never a direct client entrypoint; it is invoked by PostgreSQL.
comment on table public.family_weekly_auto_consent_events is
 'Append-only, owner-controlled consent for Familje-Stunden review-only weekly AI captions; no schedule, publication or worker claim authority.';
