-- Optional, non-renewing owner allowance in the existing budget/receipt ledger.
-- Not activated by this migration. No project is seeded, resumed or funded.
-- Deploy migration before the four-argument intent caller. Old callers remain
-- compatible for uncapped projects and fail closed for capped projects.
begin;
alter table public.project_budgets
 add column total_usd_limit_micros bigint,
 add column total_usd_committed_micros bigint not null default 0,
 add column total_approval_sha256 text,
 add constraint project_total_allowance_valid check (
  (total_usd_limit_micros is null and total_usd_committed_micros=0 and total_approval_sha256 is null)
  or (total_usd_limit_micros is not null and total_usd_limit_micros between 1 and 100000000000
   and total_usd_committed_micros between 0 and total_usd_limit_micros
   and total_approval_sha256 is not null and total_approval_sha256 ~ '^[0-9a-f]{64}$'));
alter table public.spend_reservations
 add column total_allowance_micros bigint,
 add column total_allowance_usd_sek numeric,
 add constraint spend_total_allowance_valid check (
  (total_allowance_micros is null and total_allowance_usd_sek is null)
  or (total_allowance_micros is not null and total_allowance_micros>=0
   and total_allowance_usd_sek is not null and total_allowance_usd_sek>0
   and total_allowance_usd_sek not in ('NaN'::numeric,'Infinity'::numeric)));

create or replace function public.project_total_allowance_guard()
returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then
  if old.total_usd_limit_micros is not null then raise exception 'TOTAL_ALLOWANCE_IMMUTABLE' using errcode='55000'; end if;
  return old;
 end if;
 if TG_OP='UPDATE' and old.total_usd_limit_micros is not null and
  (new.project_id is distinct from old.project_id or new.total_usd_limit_micros is distinct from old.total_usd_limit_micros
   or new.total_approval_sha256 is distinct from old.total_approval_sha256
   or new.total_usd_committed_micros<old.total_usd_committed_micros) then
  raise exception 'TOTAL_ALLOWANCE_IMMUTABLE' using errcode='55000';
 end if;
 if (TG_OP='INSERT' and new.total_usd_limit_micros is not null)
  or (TG_OP='UPDATE' and (new.total_usd_limit_micros,new.total_usd_committed_micros,new.total_approval_sha256)
      is distinct from (old.total_usd_limit_micros,old.total_usd_committed_micros,old.total_approval_sha256)) then
  if current_user<>'postgres' then raise exception 'TOTAL_ALLOWANCE_SERVICE_ONLY' using errcode='42501'; end if;
 end if;
 return new;
end $$;
create trigger project_total_allowance_guard before insert or update or delete on public.project_budgets
 for each row execute function public.project_total_allowance_guard();
revoke all on function public.project_total_allowance_guard() from public,anon,authenticated,service_role;

-- Activation only for a paused, owned, not-yet-billed dedicated project.
-- Imported local/other prior ceilings MUST be reconciled by the operator and
-- passed explicitly, never assumed to be zero from absence of native costs.
create or replace function public.budget_set_total_allowance(
 p_project_id uuid,p_owner_id uuid,p_limit_micros bigint,p_prior_committed_micros bigint,p_approval_sha256 text
) returns boolean language plpgsql security definer set search_path='' as $$
declare b public.project_budgets;
begin
 if p_limit_micros is null or p_limit_micros not between 1 and 100000000000
  or p_prior_committed_micros is null or p_prior_committed_micros not between 0 and p_limit_micros
  or p_approval_sha256 is null or p_approval_sha256 !~ '^[0-9a-f]{64}$' then
  raise exception 'INVALID_TOTAL_ALLOWANCE' using errcode='22023';
 end if;
 perform 1 from public.projects where id=p_project_id and owner_id=p_owner_id and execution_paused=true for update;
 if not found then raise exception 'TOTAL_ALLOWANCE_REQUIRES_PAUSED_OWNER' using errcode='42501'; end if;
 select * into b from public.project_budgets where project_id=p_project_id for update;
 if not found or b.total_usd_limit_micros is not null then raise exception 'TOTAL_ALLOWANCE_ALREADY_SET_OR_MISSING' using errcode='55000'; end if;
 if exists(select 1 from public.cost_events where project_id=p_project_id)
  or exists(select 1 from public.spend_reservations where project_id=p_project_id) then
  raise exception 'TOTAL_ALLOWANCE_HISTORY_REQUIRES_RECONCILIATION' using errcode='55000';
 end if;
 update public.project_budgets set total_usd_limit_micros=p_limit_micros,
  total_usd_committed_micros=p_prior_committed_micros,total_approval_sha256=p_approval_sha256,updated_at=now()
  where project_id=p_project_id;
 return true;
end $$;
revoke all on function public.budget_set_total_allowance(uuid,uuid,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.budget_set_total_allowance(uuid,uuid,bigint,bigint,text) to service_role;

-- Admission and intent are ONE transaction. No race between a separate check
-- and dispatch, and no refund after timeout, release, settlement or month end.
create or replace function public.budget_mark_dispatch_intent(
 p_reservation_id uuid,p_dispatch_token uuid,p_ceiling_basis text,p_usd_sek numeric
) returns boolean language plpgsql security definer set search_path='' as $$
declare v public.spend_reservations; b public.project_budgets; amount numeric;
begin
 if p_reservation_id is null or p_dispatch_token is null then raise exception 'reservation and dispatch token are required' using errcode='22023'; end if;
 if p_ceiling_basis is null or p_ceiling_basis not in ('token_window','fixed_units','internal_fixed') then raise exception 'dispatch intent requires a hard-ceiling basis' using errcode='22023'; end if;
 select * into v from public.spend_reservations where id=p_reservation_id for update;
 if not found or v.status<>'open' then return false; end if;
 select * into b from public.project_budgets where project_id=v.project_id for update;
 if b.total_usd_limit_micros is not null then
  if p_usd_sek is null or p_usd_sek<=0 or p_usd_sek in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then return false; end if;
  if v.dispatched_at is not null then
   return v.dispatch_token=p_dispatch_token and v.ceiling_basis=p_ceiling_basis
    and v.total_allowance_micros is not null and v.total_allowance_usd_sek=p_usd_sek;
  end if;
  amount=ceil(v.estimated_sek/p_usd_sek*1000000);
  if amount<0 or amount>b.total_usd_limit_micros-b.total_usd_committed_micros then return false; end if;
  update public.project_budgets set total_usd_committed_micros=total_usd_committed_micros+amount::bigint,updated_at=now() where project_id=v.project_id;
 else
  if v.dispatched_at is not null then return v.dispatch_token=p_dispatch_token; end if;
 end if;
 update public.spend_reservations set dispatched_at=now(),dispatch_token=p_dispatch_token,ceiling_basis=p_ceiling_basis,
  total_allowance_micros=case when b.total_usd_limit_micros is not null then amount::bigint else null end,
  total_allowance_usd_sek=case when b.total_usd_limit_micros is not null then p_usd_sek else null end
  where id=p_reservation_id;
 return true;
end $$;
revoke all on function public.budget_mark_dispatch_intent(uuid,uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.budget_mark_dispatch_intent(uuid,uuid,text,numeric) to service_role;

-- Explicit legacy overload: absence of FX is not permission to skip a cap.
create or replace function public.budget_mark_dispatch_intent(
 p_reservation_id uuid,p_dispatch_token uuid,p_ceiling_basis text
) returns boolean language sql security definer set search_path='' as $$
 select public.budget_mark_dispatch_intent(p_reservation_id,p_dispatch_token,p_ceiling_basis,null::numeric);
$$;
revoke all on function public.budget_mark_dispatch_intent(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.budget_mark_dispatch_intent(uuid,uuid,text) to service_role;
comment on column public.project_budgets.total_usd_committed_micros is 'Non-renewing conservative admitted ceilings, not invoices. Never automatically refunded, reset or topped up.';
commit;
