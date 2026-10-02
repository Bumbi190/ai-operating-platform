-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3B1B2 · M2 — sharded Survival input epoch (INERT)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
--   A future licensed bind evaluates effectiveAutonomy = min(licence, Survival
--   ceiling). M1 gave the bind something to lock for the instance, the Decision
--   head and the licence. Survival is DERIVED from several mutable tables, so a
--   snapshot can observe a permissive state and an input can change before the
--   bind commits. A freshness timestamp is not serialization.
--
--   M2 adds one narrow fact: "did ANY database input capable of changing the
--   Survival ceiling commit since the vector I observed?"
--
-- WHAT (and nothing more — the commit clock/fence is M3, the licensed bind RPC
-- and its provenance are M4; licensed binds still return
-- licensed_bind_not_serializable)
--
--   A. `survival_input_epoch_shards` — 8 rows, (shard_id 0..7, epoch bigint).
--      CHANGE IDENTITY ONLY: no Survival state, no ceiling, no policy, no
--      project value, no timestamp, no source label.
--   B. Every committed mutation of a Survival authority input advances shard
--      txid_current() % 8 by one, in the SAME transaction, by a database
--      trigger. Rollback of either rolls back both.
--   C. `survival_input_epoch_vector()` — all 8 epochs, ascending shard order,
--      in one statement snapshot; fails closed on a missing, extra or
--      malformed shard.
--
-- THE AUTHORITY SOURCE SET (Phase 3B1B2 M2 Section 0, derived from
-- readSurvivalSnapshot → deriveSurvivalState → survivalCeiling on d7de380):
--
--   cost_events              every row   budget_scope_state spent; 30-day burn
--   spend_reservations       every row   budget_scope_state held; pending burn
--   project_budgets          every row   per-project limits
--   platform_config          id + global_daily/weekly/monthly_sek only
--   revenue_snapshots        every row   revenue trend (EXPAND gate)
--   survival_funding_config  every row   declared operating capital
--   projects                 population (id) only — runway coverage and the
--                            budget_headroom row set
--
--   NOT authority: platform_config.automation_paused / paused_* (copied into
--   the snapshot as context, never branched on by derive.ts), every other
--   projects column (slug is presentation), survival_state_events and
--   survival_funding_events (audit). Time-driven windows are NOT detectable by
--   any epoch and remain M3's problem.
--
-- WHY A DEFERRED ROW CONSTRAINT TRIGGER, NOT AN IMMEDIATE STATEMENT TRIGGER
--   A shard lock taken MID-transaction becomes a new edge in every writer's lock
--   order. Two writers on the same shard then deadlock (40P01) whenever the one
--   that bumped first later needs a row the second locked before its own bump —
--   e.g. a settlement and a release racing on one reservation. Before M2 that
--   race simply waited. Deferring the bump to COMMIT makes the shard the LAST
--   lock a writer takes: a writer holding its shard holds every other lock it
--   will ever need, so it cannot wait on a same-shard peer, and the peer cannot
--   close a cycle. The only other deferred trigger on these tables
--   (spend_reservations_settlement_complete) reads and takes no lock.
--
--   Correctness never depends on the deferral: `SET CONSTRAINTS … IMMEDIATE`
--   makes the bump fire at statement end instead, which still bumps.
--
--   Row-level is the only level a constraint trigger supports. A bulk statement
--   still writes the shard ONCE per transaction: the bump is skipped when the
--   shard row's current version was already written by this transaction.
--   TRUNCATE has no row events, so each table also carries an AFTER TRUNCATE
--   statement trigger that bumps immediately (TRUNCATE already holds an ACCESS
--   EXCLUSIVE lock on its table, so it adds no new ordering hazard of its own).
--
-- SHARD FORMULA
--   shard = txid_current() % 8   (txid_current() is the 64-bit top-level id,
--   identical in every subtransaction, so one transaction maps to one shard.)
--
-- DATABASE-OWNER LIMITATION
--   The table owner (postgres) can disable triggers or rewrite rows. Nothing in
--   PostgreSQL can bind a superuser; the guard below stops accidental owner
--   DML, and M2 grants no other role any write path.
--
-- NOT APPLIED BY THIS BRANCH.

-- ── A. The shards ───────────────────────────────────────────────────────────
create table public.survival_input_epoch_shards (
  shard_id smallint primary key check (shard_id between 0 and 7),
  epoch    bigint   not null check (epoch >= 0)
);

comment on table public.survival_input_epoch_shards is
  'Phase 3B1B2 M2: change identity for Survival authority inputs. 8 fixed shards; a committed '
  'mutation of any Survival input advances shard txid_current() % 8 in the same transaction. '
  'Stores no Survival state, ceiling, policy, project value or timestamp.';

insert into public.survival_input_epoch_shards (shard_id, epoch)
select g::smallint, 0 from generate_series(0, 7) g;

-- Only a +1 advance of an existing shard is ever legal. Refuses INSERT, DELETE,
-- TRUNCATE, a shard_id change, and any epoch move that is not exactly +1 — for
-- every role, the owner included (short of disabling the trigger).
create or replace function public.survival_input_epoch_shards_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.shard_id = old.shard_id and new.epoch = old.epoch + 1 then
    return new;
  end if;
  raise exception 'survival_input_epoch_shards: only a +1 advance of an existing shard is permitted (%)', tg_op
    using errcode = '42501';
end $$;

create trigger survival_input_epoch_shards_guard
  before insert or update or delete on public.survival_input_epoch_shards
  for each row execute function public.survival_input_epoch_shards_guard();
create trigger survival_input_epoch_shards_no_truncate
  before truncate on public.survival_input_epoch_shards
  for each statement execute function public.survival_input_epoch_shards_guard();

-- ── B. The bump ─────────────────────────────────────────────────────────────
-- One function for both the deferred row triggers and the TRUNCATE statement
-- triggers. The `xmin` test is the once-per-transaction skip: the shard row's
-- visible version carries this transaction's xid only if this transaction
-- (at top level) already advanced it. A version written by a subtransaction or
-- by anyone else does not match, so the worst case is one extra +1 — never a
-- missed one. A missing shard raises, so the input mutation cannot commit
-- without its epoch.
create or replace function public.survival_input_epoch_bump()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_xid   bigint   := pg_catalog.txid_current();
  v_shard smallint := (v_xid % 8)::smallint;
  v_mine  bigint   := v_xid % 4294967296;
begin
  update public.survival_input_epoch_shards s
     set epoch = s.epoch + 1
   where s.shard_id = v_shard
     and s.xmin::text::bigint <> v_mine;
  if not found then
    perform 1 from public.survival_input_epoch_shards s
     where s.shard_id = v_shard and s.xmin::text::bigint = v_mine;
    if not found then
      raise exception 'survival input epoch shard % is missing', v_shard using errcode = '55000';
    end if;
  end if;
  return null;
end $$;

-- cost_events, spend_reservations, project_budgets, revenue_snapshots,
-- survival_funding_config: every row is authority, every write bumps.
create constraint trigger survival_input_epoch_bump
  after insert or update or delete on public.cost_events
  deferrable initially deferred for each row
  execute function public.survival_input_epoch_bump();
create constraint trigger survival_input_epoch_bump
  after insert or update or delete on public.spend_reservations
  deferrable initially deferred for each row
  execute function public.survival_input_epoch_bump();
create constraint trigger survival_input_epoch_bump
  after insert or update or delete on public.project_budgets
  deferrable initially deferred for each row
  execute function public.survival_input_epoch_bump();
create constraint trigger survival_input_epoch_bump
  after insert or update or delete on public.revenue_snapshots
  deferrable initially deferred for each row
  execute function public.survival_input_epoch_bump();
create constraint trigger survival_input_epoch_bump
  after insert or update or delete on public.survival_funding_config
  deferrable initially deferred for each row
  execute function public.survival_input_epoch_bump();

-- platform_config: the row's existence and its global limits. A pause toggle
-- or an updated_at touch is not Survival authority and does not bump.
create constraint trigger survival_input_epoch_bump
  after insert or delete on public.platform_config
  deferrable initially deferred for each row
  execute function public.survival_input_epoch_bump();
create constraint trigger survival_input_epoch_bump_limits
  after update on public.platform_config
  deferrable initially deferred for each row
  when ((old.id, old.global_daily_sek, old.global_weekly_sek, old.global_monthly_sek)
        is distinct from
        (new.id, new.global_daily_sek, new.global_weekly_sek, new.global_monthly_sek))
  execute function public.survival_input_epoch_bump();

-- projects: the population. A rename, a colour or a stop toggle does not bump.
create constraint trigger survival_input_epoch_bump
  after insert or delete on public.projects
  deferrable initially deferred for each row
  execute function public.survival_input_epoch_bump();
create constraint trigger survival_input_epoch_bump_population
  after update on public.projects
  deferrable initially deferred for each row
  when (old.id is distinct from new.id)
  execute function public.survival_input_epoch_bump();

-- TRUNCATE: no row events exist, so a statement trigger on every source.
create trigger survival_input_epoch_bump_truncate after truncate on public.cost_events
  for each statement execute function public.survival_input_epoch_bump();
create trigger survival_input_epoch_bump_truncate after truncate on public.spend_reservations
  for each statement execute function public.survival_input_epoch_bump();
create trigger survival_input_epoch_bump_truncate after truncate on public.project_budgets
  for each statement execute function public.survival_input_epoch_bump();
create trigger survival_input_epoch_bump_truncate after truncate on public.revenue_snapshots
  for each statement execute function public.survival_input_epoch_bump();
create trigger survival_input_epoch_bump_truncate after truncate on public.survival_funding_config
  for each statement execute function public.survival_input_epoch_bump();
create trigger survival_input_epoch_bump_truncate after truncate on public.platform_config
  for each statement execute function public.survival_input_epoch_bump();
create trigger survival_input_epoch_bump_truncate after truncate on public.projects
  for each statement execute function public.survival_input_epoch_bump();

-- ── C. The vector ───────────────────────────────────────────────────────────
-- One SELECT, so one snapshot: the 8 epochs are mutually consistent. Ordered by
-- shard_id. Anything but exactly shards 0..7 with non-negative epochs raises
-- rather than returning a vector a caller could compare against.
create or replace function public.survival_input_epoch_vector()
returns bigint[] language plpgsql stable security definer set search_path = '' as $$
declare
  v_ids    smallint[];
  v_epochs bigint[];
begin
  select pg_catalog.array_agg(s.shard_id order by s.shard_id),
         pg_catalog.array_agg(s.epoch    order by s.shard_id)
    into v_ids, v_epochs
    from public.survival_input_epoch_shards s;
  if v_ids is distinct from array[0, 1, 2, 3, 4, 5, 6, 7]::smallint[] then
    raise exception 'survival input epoch shards are malformed: %', v_ids using errcode = '55000';
  end if;
  if pg_catalog.array_position(v_epochs, null) is not null
     or exists (select 1 from pg_catalog.unnest(v_epochs) e where e < 0) then
    raise exception 'survival input epoch values are malformed' using errcode = '55000';
  end if;
  return v_epochs;
end $$;

comment on function public.survival_input_epoch_vector() is
  'Phase 3B1B2 M2: the 8 Survival input epochs, ascending shard order, one snapshot. Fails '
  'closed on a missing, extra or malformed shard. Carries no Survival state. No runtime caller '
  'in M2.';

-- ── D. Privileges ───────────────────────────────────────────────────────────
-- RLS on with ZERO policies; every privilege revoked; SELECT to service_role so
-- a future server-side reader can observe the vector. No role may write: the
-- only writer is the SECURITY DEFINER trigger machinery, which no client can
-- call (a trigger function is not callable, and EXECUTE is revoked anyway).
alter table public.survival_input_epoch_shards enable row level security;
revoke all on table public.survival_input_epoch_shards from public, anon, authenticated, service_role;
grant select on table public.survival_input_epoch_shards to service_role;

revoke all on function public.survival_input_epoch_bump() from public, anon, authenticated, service_role;
revoke all on function public.survival_input_epoch_shards_guard() from public, anon, authenticated, service_role;
revoke all on function public.survival_input_epoch_vector() from public, anon, authenticated;
grant execute on function public.survival_input_epoch_vector() to service_role;
