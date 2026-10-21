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
--   A. `survival_input_epoch_shards` — 8 rows, (shard_id 0..7, epoch bigint,
--      last_bump_xid xid8). CHANGE IDENTITY ONLY: no Survival state, no
--      ceiling, no policy, no project value, no timestamp, no source label.
--      `last_bump_xid` is internal dedupe metadata — the full 64-bit id of the
--      transaction that last advanced the shard — never authority.
--   B. Every committed mutation of a Survival authority input advances shard
--      pg_current_xact_id() mod 8, in the SAME transaction, by a database
--      trigger. Rollback of either rolls back both. TRUNCATE of a source cannot
--      commit.
--   C. `survival_input_epoch_vector()` — all 8 epochs, ascending shard order,
--      in one statement snapshot; fails closed on a missing, extra or
--      malformed shard.
--
-- THE EPOCH CONTRACT (exactly what is promised, and nothing more)
--   - one top-level transaction maps to ONE shard (pg_current_xact_id() is the
--     full xid8 of the TOP-LEVEL transaction, identical inside every
--     subtransaction);
--   - a committed transaction that mutated Survival authority has advanced
--     that shard AT LEAST ONCE — and, by the xid8 marker below, exactly once,
--     however many rows, statements, sources or savepoints it used and whether
--     or not it forced the bump IMMEDIATE;
--   - a rolled-back transaction (or rolled-back subtransaction) leaves no
--     committed advance;
--   - the epoch is CHANGE IDENTITY, not a count of mutations. No consumer may
--     read meaning into the magnitude of a difference.
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
--   race simply waited. Deferring the bump to COMMIT means that, under
--   CANONICAL (default) runtime operation, the shard is the writer's FINAL M2
--   lock: a writer holding its shard holds every other lock it will ever need,
--   so it cannot wait on a same-shard peer, and the peer cannot close a cycle.
--   The only other deferred trigger on these tables
--   (spend_reservations_settlement_complete) reads and takes no lock.
--
--   THE CONTRACT IS QUALIFIED, NOT UNCONDITIONAL. `SET CONSTRAINTS … IMMEDIATE`
--   (maintenance/test behaviour) fires the bump at statement end and so MAY take
--   the shard EARLY in the transaction. That still bumps — epoch correctness
--   never depends on the deferral — but the deadlock-freedom argument above does
--   not cover such a writer. No production runtime code issues it today (a
--   permanent guard scans for it), and M3/M4 correctness may not rely on a
--   writer that does unless that writer's lock order is independently proven.
--
--   Row-level is the only level a constraint trigger supports. A bulk statement
--   still writes the shard ONCE per transaction: the bump is skipped when the
--   shard's `last_bump_xid` already equals this transaction's full xid8.
--
-- TRUNCATE CANNOT CHANGE SURVIVAL, BECAUSE TRUNCATE CANNOT COMMIT
--   TRUNCATE fires no row events, so a deferred row trigger never sees it, and
--   an AFTER TRUNCATE bump would run IMMEDIATELY — reintroducing exactly the
--   mid-transaction shard lock the deferral removes. That was reproduced on
--   real PostgreSQL: A truncates a source (shard S taken), then waits for a row
--   B holds; B commits, its deferred bump waits for shard S → 40P01.
--   So every source refuses TRUNCATE outright:
--     - TRUNCATE is revoked from PUBLIC, anon, authenticated and service_role
--       on all seven sources (production granted it to the client roles on
--       four of them and to service_role on cost_events);
--     - a BEFORE TRUNCATE statement trigger refuses it for every role, so an
--       ACL regression cannot reopen it. Cascades are refused too: TRUNCATE …
--       CASCADE reaching a source fires that source's trigger.
--   DELETE stays available through the reviewed writer paths and is covered by
--   the deferred bump. No shard lock is ever taken before commit.
--
-- SHARD FORMULA
--   shard = pg_current_xact_id() mod 8, computed on the full 64-bit value
--   (xid8 → text → numeric, so no width or sign limit applies). The xid8 is the
--   top-level id, identical in every subtransaction, so one transaction maps to
--   one shard. Shard selection needs no uniqueness — only determinism.
--
-- DEDUPE IDENTITY: FULL xid8, NEVER A 32-BIT XID
--   The skip test is `last_bump_xid IS NOT DISTINCT FROM pg_current_xact_id()`
--   — the full epoch-qualified 64-bit transaction id, which PostgreSQL never
--   reuses. It deliberately does NOT use the row's `xmin` system column or any
--   low-32-bit comparison: `xid` is 32-bit and wraps, so a later transaction can
--   share an old row version's 32-bit xid, and an `xmin`/low-32 equality would
--   then report "already bumped" for a transaction that never bumped — a
--   Survival change with no epoch change, the one false negative M2 exists to
--   prevent.
--
--   Why one advance per transaction is safe, including savepoints: the marker
--   is written in the SAME (sub)transaction as the advance it records, so it is
--   visible exactly when that advance survives. A later write in the same
--   transaction skips only while that earlier advance is visible; any ROLLBACK
--   TO that undoes the advance also undoes every later write, because a
--   savepoint rollback discards all work after the savepoint. A surviving
--   mutation therefore always implies a surviving advance.
--
-- DATABASE-OWNER LIMITATION
--   The table owner (postgres) can disable triggers, re-grant TRUNCATE and
--   rewrite rows. Nothing in PostgreSQL can bind a superuser; the guards below
--   stop ACCIDENTAL owner writes and TRUNCATE, and M2 grants no other role any
--   write path to the epoch.
--
-- NOT APPLIED BY THIS BRANCH.

-- ── A. The shards ───────────────────────────────────────────────────────────
create table public.survival_input_epoch_shards (
  shard_id      smallint primary key check (shard_id between 0 and 7),
  epoch         bigint   not null check (epoch >= 0),
  last_bump_xid xid8
);

comment on table public.survival_input_epoch_shards is
  'Phase 3B1B2 M2: change identity for Survival authority inputs. 8 fixed shards; a committed '
  'mutation of any Survival input advances shard pg_current_xact_id() mod 8 in the same transaction. '
  'Stores no Survival state, ceiling, policy, project value or timestamp.';
comment on column public.survival_input_epoch_shards.last_bump_xid is
  'Internal dedupe metadata, NOT authority: the full xid8 of the transaction that last advanced this '
  'shard. Written only by the bump machinery, together with the advance it records.';

insert into public.survival_input_epoch_shards (shard_id, epoch)
select g::smallint, 0 from generate_series(0, 7) g;

-- Only a +1 advance of an existing shard, stamped with the CURRENT
-- transaction's own full xid8, is ever legal. Refuses INSERT, DELETE, TRUNCATE,
-- a shard_id change, any epoch move that is not exactly +1, and any
-- `last_bump_xid` other than this transaction's own — so the marker cannot be
-- forged to another transaction's identity (to make a later bump skip) — for
-- every role, the owner included (short of disabling the trigger).
create or replace function public.survival_input_epoch_shards_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.shard_id = old.shard_id and new.epoch = old.epoch + 1
     and new.last_bump_xid is not distinct from pg_catalog.pg_current_xact_id() then
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
-- Fired ONLY by the deferred row constraint triggers below. Advances the
-- transaction's shard and stamps it with the transaction's FULL xid8, unless
-- that stamp is already visible (this transaction already advanced it — see the
-- header for why that is exact under savepoints). If nothing was updated, the
-- shard must exist AND carry this transaction's stamp; anything else — a
-- missing shard included — raises, so the input mutation cannot commit without
-- its epoch.
create or replace function public.survival_input_epoch_bump()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_xact  xid8     := pg_catalog.pg_current_xact_id();
  v_shard smallint := ((v_xact::text)::numeric % 8)::smallint;
begin
  update public.survival_input_epoch_shards s
     set epoch = s.epoch + 1,
         last_bump_xid = v_xact
   where s.shard_id = v_shard
     and s.last_bump_xid is distinct from v_xact;
  if not found then
    perform 1 from public.survival_input_epoch_shards s
     where s.shard_id = v_shard and s.last_bump_xid = v_xact;
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

-- TRUNCATE: refused on every source (see the header). No epoch bump exists for
-- it because it can never commit.
create or replace function public.survival_input_truncate_refused()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'TRUNCATE of Survival authority source %.% is refused: it cannot be epoch-serialized. '
    'Delete through a reviewed writer path instead.', tg_table_schema, tg_table_name
    using errcode = '42501';
end $$;

create trigger survival_input_truncate_refused before truncate on public.cost_events
  for each statement execute function public.survival_input_truncate_refused();
create trigger survival_input_truncate_refused before truncate on public.spend_reservations
  for each statement execute function public.survival_input_truncate_refused();
create trigger survival_input_truncate_refused before truncate on public.project_budgets
  for each statement execute function public.survival_input_truncate_refused();
create trigger survival_input_truncate_refused before truncate on public.revenue_snapshots
  for each statement execute function public.survival_input_truncate_refused();
create trigger survival_input_truncate_refused before truncate on public.survival_funding_config
  for each statement execute function public.survival_input_truncate_refused();
create trigger survival_input_truncate_refused before truncate on public.platform_config
  for each statement execute function public.survival_input_truncate_refused();
create trigger survival_input_truncate_refused before truncate on public.projects
  for each statement execute function public.survival_input_truncate_refused();

revoke truncate on table public.cost_events, public.spend_reservations, public.project_budgets,
  public.revenue_snapshots, public.survival_funding_config, public.platform_config, public.projects
  from public, anon, authenticated, service_role;

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
revoke all on function public.survival_input_truncate_refused() from public, anon, authenticated, service_role;
revoke all on function public.survival_input_epoch_vector() from public, anon, authenticated;
grant execute on function public.survival_input_epoch_vector() to service_role;
