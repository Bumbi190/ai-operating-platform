-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3B1B2 · M3 — commit clock + self-probing Survival fence (INERT)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
--   M2 answers "did any DATABASE Survival input change?". Time changes Survival
--   too, with no row changing: the Europe/Stockholm day/week/month budget windows
--   roll, open undispatched reservations go stale after 30 minutes, and cost rows
--   age out of the 30-day burn window. M3 answers "is the observation still valid
--   at the moment a future licensed bind (M4) is allowed to commit?".
--
-- WHAT (and nothing more — the licensed bind RPC and its provenance are M4;
-- licensed binds still return licensed_bind_not_serializable)
--
--   A. survival_observation_anchor() — the DB clock (clock_timestamp()) and the
--      M2 epoch vector in ONE statement. A fence-grade observation is anchored to
--      this DB instant, never to an application clock.
--   B. survival_clock_invalid_at(anchor) — the EARLIEST instant at which an
--      observation anchored at `anchor` may stop being valid because time passed.
--      Derived from the canonical read semantics (no TTL):
--        - next Europe/Stockholm midnight / ISO-week start / month start — the
--          budget_scope_state window boundaries (DST-correct local arithmetic);
--        - min(created_at + 30 min) over open UNDISPATCHED reservations — the
--          budget_scope_state stale rule (p_stale_minutes = 30, as the snapshot
--          passes it);
--        - min(created_at + 720 h) over cost rows inside the 30-day burn window
--          anchored at `anchor` (720 EXACT hours: the burn cutoff is
--          at − 30·86 400 000 ms, never "30 calendar days").
--      Every input is read over ALL projects, so the deadline never depends on a
--      caller-chosen scope and is never later than the scoped truth.
--      Equality: the observation is invalid AT the instant (reject >=).
--   C. survival_commit_fence(observed_vector, anchor) — INTERNAL (no role may
--      execute it; only a future SECURITY DEFINER bind function can). Self-probes,
--      registers a COMMIT-TIME recheck, locks the 8 shards FOR SHARE in ascending
--      order AS ITS LAST LOCKS, compares the vector exactly, checks
--      clock_timestamp() < invalid_at.
--   D. A deferred constraint trigger re-runs the shard + clock check at COMMIT.
--   E. A guard on the shard table: a fenced transaction may not change Survival
--      authority at all — whether the write came before or after the fence, and
--      whatever order its deferred M2 bump fires in at commit.
--
-- THE CLOCK. Only clock_timestamp() is used as the validity clock: now(),
-- CURRENT_TIMESTAMP, transaction_timestamp() and statement_timestamp() are the
-- transaction/statement START, not the wall clock at the fence or at commit.
--
-- LOCK ORDER (the shard rows are the fence's LAST locks)
--   1. reads (MVCC; never wait on a Survival writer) to compute invalid_at;
--   2. own-row writes to survival_commit_fence_intents (no Survival writer ever
--      touches it); stale-intent cleanup uses SKIP LOCKED, so it never waits;
--   3. survival_input_epoch_shards 0 → 7 FOR SHARE, one at a time, in order.
--   Nothing after step 3 takes a lock or reads a table a writer can hold.
--   M2 writers take their shard as their FINAL lock (deferred, at commit), so a
--   writer and a fence can only meet on the shard rows: the writer waits for the
--   fence's commit; the fence never waits on anything the writer holds.
--
-- COMMIT-TIME, HONESTLY
--   PostgreSQL has no ON COMMIT hook in SQL; a deferred constraint trigger is the
--   latest point a check can run, and it runs at COMMIT under the default
--   constraint mode. So:
--   - the recheck runs at commit in the default mode, which is the only mode on
--     the canonical path;
--   - forcing it IMMEDIATE before the fence is DETECTED and refused (SV007);
--   - any Survival authority write in the fenced transaction aborts it (SV006),
--     in either order, so a post-fence statement cannot change authority;
--   - a caller able to run arbitrary SQL could still SET CONSTRAINTS … IMMEDIATE
--     AFTER the fence and then wait before COMMIT. That is why the fence has NO
--     grant: M4's bind must be the single-statement SECURITY DEFINER transaction
--     that calls it last (an M4 precondition, recorded, not assumed here).
--   The residual after the commit-time recheck is the commit record itself.
--
-- TWO-PHASE COMMIT. Deferred triggers fire at PREPARE TRANSACTION, not at COMMIT
-- PREPARED, so a prepared fenced transaction could commit arbitrarily later.
-- With max_prepared_transactions = 0, PREPARE TRANSACTION is impossible. The
-- fence and the recheck refuse unless the LIVE setting is 0 (SV001).
--
-- REFUSAL CODES (raised; the whole transaction aborts — fail closed)
--   SV001 prepared transactions enabled      SV006 fenced transaction changed authority
--   SV002 observed vector malformed          SV007 commit-time recheck forced IMMEDIATE
--   SV003 shard set malformed                SV008 anchor missing or in the future
--   SV004 epoch vector changed               SV009 fence not at transaction top level
--   SV005 clock validity expired             (23505 a second fence in one transaction)
--
-- NOT APPLIED BY THIS BRANCH.

-- ── 1. Fence intents: one row per fenced transaction ─────────────────────────
-- Change-identity plumbing, not authority and not provenance: it carries only
-- what the commit-time recheck needs. Rows of committed transactions are swept
-- by later fences (SKIP LOCKED); a rolled-back fence leaves nothing.
create table public.survival_commit_fence_intents (
  xact            xid8        primary key,
  anchor          timestamptz not null,
  observed_vector bigint[]    not null,
  invalid_at      timestamptz not null,
  fenced_at       timestamptz not null
);

comment on table public.survival_commit_fence_intents is
  'Phase 3B1B2 M3: one row per fenced transaction (full xid8), read by the commit-time recheck and by '
  'the shard guard that refuses Survival authority writes inside a fenced transaction. Not authority, '
  'not provenance. No role holds any privilege on it.';

-- ── 2. The DB anchor: clock + vector in one statement ────────────────────────
create or replace function public.survival_observation_anchor()
returns table (anchor timestamptz, epoch_vector bigint[])
language sql volatile security definer set search_path = '' as $$
  select pg_catalog.clock_timestamp(), public.survival_input_epoch_vector();
$$;

-- ── 3. The clock-validity deadline ───────────────────────────────────────────
create or replace function public.survival_clock_invalid_at(p_anchor timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare
  z       constant text := 'Europe/Stockholm';
  v_day   timestamptz;
  v_week  timestamptz;
  v_month timestamptz;
  v_stale timestamptz;
  v_burn  timestamptz;
begin
  if p_anchor is null or p_anchor = 'infinity'::timestamptz or p_anchor = '-infinity'::timestamptz then
    raise exception 'survival_fence: anchor is missing' using errcode = 'SV008';
  end if;
  -- budget_scope_state's own window arithmetic, at the anchor.
  v_day   := (pg_catalog.date_trunc('day',   p_anchor at time zone z) + interval '1 day')   at time zone z;
  v_week  := (pg_catalog.date_trunc('week',  p_anchor at time zone z) + interval '1 week')  at time zone z;
  v_month := (pg_catalog.date_trunc('month', p_anchor at time zone z) + interval '1 month') at time zone z;
  -- budget_scope_state's stale rule: counted while created_at > now() − 30 min.
  select pg_catalog.min(r.created_at + interval '30 minutes') into v_stale
    from public.spend_reservations r
   where r.status = 'open' and r.dispatched_at is null
     and r.created_at + interval '30 minutes' > p_anchor;
  -- the 30-day burn window: counted while created_at >= at − 720 h (ms-truncated at).
  select pg_catalog.min(c.created_at + interval '720 hours') into v_burn
    from public.cost_events c
   where c.created_at >= pg_catalog.date_trunc('milliseconds', p_anchor) - interval '720 hours';
  return least(v_day, v_week, v_month, v_stale, v_burn);  -- LEAST is SQL syntax (ignores NULLs), not a catalog function
end $$;

-- ── 4. The commit-time recheck ───────────────────────────────────────────────
-- Fired by the deferred constraint trigger on the intent row: at COMMIT under the
-- default constraint mode. Re-locks the 8 shards FOR SHARE in ascending order
-- (already held by the fence, so it never waits) and repeats every check against
-- the values the fence stored. Leaves a transaction-local marker so the fence can
-- tell whether it was fired IMMEDIATELY (SV007).
create or replace function public.survival_commit_fence_recheck()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ids    smallint[];
  v_epochs bigint[];
  v_own    boolean;
  i        smallint;
begin
  perform pg_catalog.set_config('omnira.survival_fence_rechecked', new.xact::text, true);
  if pg_catalog.current_setting('max_prepared_transactions')::int <> 0 then
    raise exception 'survival_fence: prepared transactions are enabled' using errcode = 'SV001';
  end if;
  for i in 0..7 loop
    perform 1 from public.survival_input_epoch_shards s where s.shard_id = i for share;
  end loop;
  select pg_catalog.array_agg(s.shard_id order by s.shard_id),
         pg_catalog.array_agg(s.epoch    order by s.shard_id),
         pg_catalog.bool_or(s.last_bump_xid is not distinct from new.xact)
    into v_ids, v_epochs, v_own
    from public.survival_input_epoch_shards s;
  if v_ids is distinct from array[0, 1, 2, 3, 4, 5, 6, 7]::smallint[] then
    raise exception 'survival_fence: shard set is malformed at commit' using errcode = 'SV003';
  end if;
  if v_own then
    raise exception 'survival_fence: the fenced transaction changed Survival authority' using errcode = 'SV006';
  end if;
  if v_epochs is distinct from new.observed_vector then
    raise exception 'survival_fence: Survival inputs changed before commit' using errcode = 'SV004';
  end if;
  if pg_catalog.clock_timestamp() >= new.invalid_at then
    raise exception 'survival_fence: observation clock validity expired at commit (%)', new.invalid_at
      using errcode = 'SV005';
  end if;
  return null;
end $$;

create constraint trigger survival_commit_fence_recheck
  after insert on public.survival_commit_fence_intents
  deferrable initially deferred for each row
  execute function public.survival_commit_fence_recheck();

-- ── 5. No Survival authority write inside a fenced transaction ───────────────
-- Every committed authority write reaches the shard table through the M2 bump
-- (an UPDATE). A fenced transaction's bump — from a write before OR after the
-- fence, fired at commit in any order — is refused here. M2's own objects are
-- unchanged; this is an additional BEFORE UPDATE trigger.
create or replace function public.survival_fenced_transaction_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.survival_commit_fence_intents i
              where i.xact = pg_catalog.pg_current_xact_id()) then
    raise exception 'survival_fence: a fenced transaction may not change Survival authority'
      using errcode = 'SV006';
  end if;
  return new;
end $$;

create trigger survival_fenced_transaction_guard
  before update on public.survival_input_epoch_shards
  for each row execute function public.survival_fenced_transaction_guard();

-- ── 6. The fence ─────────────────────────────────────────────────────────────
create or replace function public.survival_commit_fence(p_observed_vector bigint[], p_anchor timestamptz)
returns timestamptz language plpgsql volatile security definer set search_path = '' as $$
declare
  v_xact     xid8 := pg_catalog.pg_current_xact_id();
  v_invalid  timestamptz;
  v_row_xmin bigint;
  v_ids      smallint[];
  v_epochs   bigint[];
  v_own      boolean;
  i          smallint;
begin
  -- Self-probes that need no lock.
  if pg_catalog.current_setting('max_prepared_transactions')::int <> 0 then
    raise exception 'survival_fence: prepared transactions are enabled' using errcode = 'SV001';
  end if;
  if p_observed_vector is null
     or pg_catalog.array_ndims(p_observed_vector) is distinct from 1
     or pg_catalog.array_lower(p_observed_vector, 1) is distinct from 1
     or pg_catalog.array_length(p_observed_vector, 1) is distinct from 8
     or pg_catalog.array_position(p_observed_vector, null) is not null
     or exists (select 1 from pg_catalog.unnest(p_observed_vector) e where e < 0) then
    raise exception 'survival_fence: observed epoch vector is malformed' using errcode = 'SV002';
  end if;
  if p_anchor is null or p_anchor > pg_catalog.clock_timestamp()
     or p_anchor = '-infinity'::timestamptz then
    raise exception 'survival_fence: anchor is missing or in the future' using errcode = 'SV008';
  end if;

  -- 1. Reads: the deadline. MVCC; never waits on a Survival writer.
  v_invalid := public.survival_clock_invalid_at(p_anchor);

  -- 2. Own-row writes. Sweep committed intents of other transactions without
  --    waiting, then register this transaction (a second fence → 23505).
  delete from public.survival_commit_fence_intents d
   where d.xact in (select o.xact from public.survival_commit_fence_intents o
                     where o.xact <> v_xact for update skip locked);
  insert into public.survival_commit_fence_intents (xact, anchor, observed_vector, invalid_at, fenced_at)
  values (v_xact, p_anchor, p_observed_vector, v_invalid, pg_catalog.clock_timestamp());

  -- The intent row must belong to the TOP-LEVEL transaction: a fence inside a
  -- savepoint or an EXCEPTION block could be rolled back with its locks while the
  -- rest commits. (Probe, not identity: the row was written by THIS transaction a
  -- moment ago, so its xmin is either the top-level xid or a subtransaction's.)
  select (x.xmin::text)::bigint into v_row_xmin from public.survival_commit_fence_intents x where x.xact = v_xact;
  if v_row_xmin is distinct from ((v_xact::text)::numeric % 4294967296)::bigint then
    raise exception 'survival_fence: must run at transaction top level' using errcode = 'SV009';
  end if;
  -- The recheck must still be pending. If it already ran, the constraint was
  -- forced IMMEDIATE and the commit-time check would not happen at commit.
  if pg_catalog.current_setting('omnira.survival_fence_rechecked', true) is not distinct from v_xact::text then
    raise exception 'survival_fence: commit-time recheck was forced IMMEDIATE' using errcode = 'SV007';
  end if;

  -- 3. LAST LOCKS: the 8 shards FOR SHARE, 0 → 7.
  for i in 0..7 loop
    perform 1 from public.survival_input_epoch_shards s where s.shard_id = i for share;
  end loop;
  select pg_catalog.array_agg(s.shard_id order by s.shard_id),
         pg_catalog.array_agg(s.epoch    order by s.shard_id),
         pg_catalog.bool_or(s.last_bump_xid is not distinct from v_xact)
    into v_ids, v_epochs, v_own
    from public.survival_input_epoch_shards s;
  if v_ids is distinct from array[0, 1, 2, 3, 4, 5, 6, 7]::smallint[] then
    raise exception 'survival_fence: shard set is malformed' using errcode = 'SV003';
  end if;
  if v_own then
    raise exception 'survival_fence: this transaction already changed Survival authority' using errcode = 'SV006';
  end if;
  if v_epochs is distinct from p_observed_vector then
    raise exception 'survival_fence: Survival inputs changed since the observation' using errcode = 'SV004';
  end if;
  if pg_catalog.clock_timestamp() >= v_invalid then
    raise exception 'survival_fence: observation clock validity expired (%)', v_invalid using errcode = 'SV005';
  end if;
  return v_invalid;
end $$;

comment on function public.survival_commit_fence(bigint[], timestamptz) is
  'Phase 3B1B2 M3: INERT commit fence for a future licensed bind (M4). Internal: no role may execute it. '
  'Refuses (raises SV001–SV009) unless the observed epoch vector still holds, the DB-clock validity '
  'deadline has not passed, and the transaction can be checked again at commit.';

-- ── 7. Privileges ────────────────────────────────────────────────────────────
alter table public.survival_commit_fence_intents enable row level security;
revoke all on table public.survival_commit_fence_intents from public, anon, authenticated, service_role;

revoke all on function public.survival_commit_fence(bigint[], timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.survival_commit_fence_recheck() from public, anon, authenticated, service_role;
revoke all on function public.survival_fenced_transaction_guard() from public, anon, authenticated, service_role;
revoke all on function public.survival_observation_anchor() from public, anon, authenticated;
grant execute on function public.survival_observation_anchor() to service_role;
revoke all on function public.survival_clock_invalid_at(timestamptz) from public, anon, authenticated;
grant execute on function public.survival_clock_invalid_at(timestamptz) to service_role;
