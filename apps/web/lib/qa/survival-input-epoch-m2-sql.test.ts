/**
 * Phase 3B1B2 · M2 — the sharded Survival input epoch, proven on REAL
 * PostgreSQL 17 with REAL concurrent sessions.
 *
 *   A. `survival_input_epoch_shards` — 8 fixed shards (0..7), change identity
 *      only, readable by service_role, writable by no role.
 *   B. Every committed mutation of a Survival authority input advances shard
 *      txid_current() % 8 in the SAME transaction (deferred row constraint
 *      trigger + AFTER TRUNCATE statement trigger). Rollback undoes both.
 *   C. `survival_input_epoch_vector()` — all 8 epochs, ascending, one snapshot,
 *      fail-closed.
 *
 * Built from the REAL migration chain: the cost ledger, the budget gate and
 * scopes, M0 durable settlement, Survival history and Phase 2B funding, then
 * M2 applied over POPULATED tables. `projects`, `platform_config` and
 * `revenue_snapshots` are fixtures in their production shape (revenue_snapshots
 * has no creating migration in this repository).
 *
 * The future commit fence is a SIMULATOR here (a test-local SQL string). It
 * creates no run, binds nothing and is not shipped: M3 owns the real one.
 *
 * Every two-session case proves blocking with pg_stat_activity /
 * pg_blocking_pids / pgrowlocks, not with elapsed time. Sessions run with
 * `lock_timeout` and a 200 ms deadlock detector, and the database's own
 * `pg_stat_database.deadlocks` counter is asserted unchanged across every M2
 * case.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { join } from 'node:path'

function findPsql(): string | null {
  const candidates = [
    process.env.ATLAS_SQL_TEST_PSQL, 'psql',
    '/opt/homebrew/opt/libpq/bin/psql', '/usr/local/opt/libpq/bin/psql', '/usr/bin/psql',
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    try { execFileSync(c, ['--version'], { stdio: 'pipe' }); return c } catch { /* next */ }
  }
  return null
}

const PSQL = findPsql()
const ADMIN_URL = process.env.ATLAS_SQL_TEST_URL
  ?? `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/postgres`
const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'
const MIGRATIONS = join(process.cwd(), 'supabase/migrations')
const CHAIN = [
  '20260602_cost_events.sql',
  '20260602_project_budgets.sql',
  '20260830_spend_budget_gate.sql',
  '20260831_budget_scopes.sql',
  '20260910120000_cost_ledger_rls_isolation.sql',
  '20261001160000_m0_durable_spend_settlement.sql',
  '20260923120000_survival_state_events.sql',
  '20260924120000_survival_funding_phase2b.sql',
].map(f => join(MIGRATIONS, f))
const M2 = join(MIGRATIONS, '20261002190000_survival_input_epoch.sql')

function dsnFor(database: string, app?: string): string {
  const url = new URL(ADMIN_URL)
  url.pathname = `/${database}`
  if (app) url.searchParams.set('application_name', app)
  return url.toString()
}
function run(dsn: string, args: string[]): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000 })
}
function query(dsn: string, sql: string): string[][] {
  const out = execFileSync(PSQL!,
    ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-F', '|', '-d', dsn, '-c', sql],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000 })
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|'))
}
const one = (dsn: string, sql: string) => (query(dsn, sql)[0] ?? []).join('|')
/** SQLSTATE of a statement expected to fail ('' if it succeeded). */
function sqlstate(dsn: string, sql: string): string {
  try {
    execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-X', '-q', '-d', dsn, '-c', sql],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return ''
  } catch (e) {
    return /ERROR:\s+([0-9A-Z]{5}):/.exec(String((e as { stderr?: unknown }).stderr ?? ''))?.[1] ?? 'unknown'
  }
}

function reachable(): boolean {
  if (!PSQL) return false
  try { execFileSync(PSQL, ['-X', '-q', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 }); return true }
  catch { return false }
}
const AVAILABLE = reachable()
if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn('[survival-input-epoch-m2-sql] SKIPPED — no reachable local Postgres. M2 was NOT proven in this run. '
    + 'Set ATLAS_SQL_TEST_URL to enable it.')
}

const DB = `omnira_m2_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

// ── Fixture: production shapes the chain reads, reduced to what it touches ──
const FIXTURE = `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role')  then begin create role service_role;  exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then begin create role anon;          exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then begin create role authenticated; exception when duplicate_object or unique_violation then null; end; end if;
end $$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
  $u$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $u$;
create table public.projects (
  id uuid primary key default gen_random_uuid(), owner_id uuid, name text, slug text unique not null,
  color text, settings jsonb, created_at timestamptz not null default now(), atlas_mode text,
  execution_paused boolean not null default false, paused_at timestamptz, paused_reason text);
create table public.platform_config (
  id int primary key, automation_paused boolean not null default false,
  max_daily_renders int not null default 4, max_retry_attempts int not null default 3,
  paused_at timestamptz, paused_reason text, updated_at timestamptz not null default now());
insert into public.platform_config (id) values (1);
create table public.infra_costs (id uuid primary key default gen_random_uuid());
create table public.revenue_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  snapshot_date date not null, captured_at timestamptz not null default now(),
  active_subscribers int, new_subscribers int, trialing int, churned_this_month int,
  mrr_sek numeric, revenue_month_sek numeric, currency text, raw jsonb,
  unique (project_id, snapshot_date));
alter table public.revenue_snapshots enable row level security;
`

const ACTOR = 'user:11111111-1111-4111-8111-111111111111'
const TOKEN = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`

// ── Epoch helpers ───────────────────────────────────────────────────────────

const parseVec = (s: string) => s.replace(/[{}]/g, '').split(',').map(Number)
const vec = (): number[] => parseVec(one(dsn, 'select survival_input_epoch_vector()'))
const delta = (a: number[], b: number[]) => b.map((x, i) => x - a[i])
const unit = (shard: number, by = 1) => Array.from({ length: 8 }, (_, i) => (i === shard ? by : 0))
const ZERO = unit(-1)

/** Run `sql` in one committed transaction; return the shard it used and the vector delta. */
function committed(sql: string): { shard: number; d: number[] } {
  const v0 = vec()
  const rows = query(dsn, `begin; ${sql}; select 'm2shard=' || (txid_current() % 8); commit;`)
  const tag = rows.map(r => r.join('|')).find(l => l.startsWith('m2shard='))!
  return { shard: Number(tag.split('=')[1]), d: delta(v0, vec()) }
}
function expectBump(sql: string, label = sql): number {
  const { shard, d } = committed(sql)
  expect(d, label).toEqual(unit(shard))
  return shard
}
function expectNoBump(sql: string, label = sql) {
  const { d } = committed(sql)
  expect(d, label).toEqual(ZERO)
}
/** The bump happens INSIDE the transaction (made immediate) and vanishes on rollback. */
function expectRollbackClean(sql: string, label = sql) {
  const v0 = vec()
  const rows = query(dsn, `begin; set constraints all immediate; ${sql};
    select 'm2mid=' || (txid_current() % 8) || ':' || survival_input_epoch_vector()::text; rollback;`)
  const [shard, mid] = rows.map(r => r.join('|')).find(l => l.startsWith('m2mid='))!.slice(6).split(':')
  expect(delta(v0, parseVec(mid)), `${label} bumps inside its transaction`).toEqual(unit(Number(shard)))
  expect(vec(), `${label} rolled back`).toEqual(v0)
}
/** A mutation that fails leaves the epoch exactly where it was. */
function expectFailedClean(sql: string, label = sql): string {
  const v0 = vec()
  const state = sqlstate(dsn, `begin; set constraints all immediate; ${sql}; commit;`)
  expect(state, `${label} must fail`).not.toBe('')
  expect(vec(), `${label} left the epoch unchanged`).toEqual(v0)
  return state
}

const deadlocks = () => Number(one(dsn, `select deadlocks from pg_stat_database where datname = current_database()`))

// ── Concurrent sessions ─────────────────────────────────────────────────────

interface Outcome { ok: boolean; out: string; stderr: string; state: string; endedAt: number; shard: number | null }
/** Statements in ONE session, each its own -c (so a DO block may COMMIT). */
function session(app: string, statements: string[]): Promise<Outcome> {
  const args = ['-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-X', '-q', '-t', '-A', '-F', '|',
    '-d', dsnFor(DB, app), '-c', `set lock_timeout = '20s'`, '-c', `set deadlock_timeout = '200ms'`,
    ...statements.flatMap(s => ['-c', s])]
  return new Promise(resolve => {
    const child = spawn(PSQL!, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let stderr = ''
    child.stdout.on('data', c => { out += String(c) })
    child.stderr.on('data', c => { stderr += String(c) })
    child.on('close', code => {
      const m = /m2shard=(\d)/.exec(out + stderr)
      resolve({
        ok: code === 0, out: out.trim(), stderr,
        state: /ERROR:\s+([0-9A-Z]{5}):/.exec(stderr)?.[1] ?? '', endedAt: Date.now(),
        shard: m ? Number(m[1]) : null,
      })
    })
  })
}

/**
 * A writer pinned to shard `target`: it commits empty transactions until its
 * xid lands on the target shard, then runs `body` in that transaction.
 *   immediate → SET CONSTRAINTS ALL IMMEDIATE, so the bump (and the shard lock)
 *               happens at statement end instead of at commit;
 *   holdS     → pg_sleep while still inside the transaction;
 *   rollback  → raise after the hold, so the whole transaction rolls back.
 */
function writer(app: string, target: number, body: string,
  opts: { immediate?: boolean; holdS?: number; rollback?: boolean } = {}): Promise<Outcome> {
  return session(app, [`do $w$ begin
    loop exit when txid_current() % 8 = ${target}; commit; end loop;
    ${opts.immediate ? `execute 'set constraints all immediate';` : ''}
    ${body}
    raise notice 'm2shard=%', txid_current() % 8;
    perform pg_sleep(${opts.holdS ?? 0});
    ${opts.rollback ? `raise exception 'm2 writer rollback' using errcode = 'P0001';` : ''}
  end $w$;`])
}

/** The FUTURE commit fence, simulated: lock all 8 shards FOR SHARE ascending, compare, hold. */
const FENCE_LOCK_SQL =
  'with l as (select shard_id, epoch from public.survival_input_epoch_shards order by shard_id for share) '
  + 'select array_agg(epoch order by shard_id) from l'
function fence(app: string, observed: number[], holdS: number): Promise<Outcome> {
  return session(app, [`begin`,
    `select 'm2fence=' || case when (${FENCE_LOCK_SQL}) = '{${observed.join(',')}}'::bigint[]
       then 'proceed' else 'refuse' end`,
    `select pg_sleep(${holdS})`, `commit`])
}
const verdict = (o: Outcome) => /m2fence=(\w+)/.exec(o.out)?.[1]

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const pidOf = (app: string) => one(dsn, `select pid from pg_stat_activity where application_name = '${app}'`)

/** Resolves once `app` is waiting on a heavyweight lock. */
async function blockedOnLock(app: string, timeoutMs = 30_000): Promise<boolean> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (one(dsn, `select count(*) from pg_stat_activity where application_name = '${app}' and wait_event_type = 'Lock'`) === '1') return true
    await sleep(50)
  }
  return false
}
/** Resolves once `app` is inside pg_sleep (holding its locks). */
async function holding(app: string, timeoutMs = 30_000): Promise<boolean> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (one(dsn, `select count(*) from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep'`) === '1') return true
    await sleep(50)
  }
  return false
}
/**
 * Waits until `app` is blocked on a heavyweight lock and returns, from the SAME
 * query, the application names it is blocked behind ([] on timeout). Reading the
 * wait and its blockers in one statement keeps the evidence coherent under load.
 */
async function waitingBehind(app: string, timeoutMs = 30_000): Promise<string[]> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const rows = query(dsn, `select coalesce(string_agg(a.application_name, ',' order by a.application_name), '')
      from pg_stat_activity w
      cross join lateral unnest(pg_blocking_pids(w.pid)) b(pid) join pg_stat_activity a on a.pid = b.pid
      where w.application_name = '${app}' and w.wait_event_type = 'Lock'`)
    const names = rows[0]?.[0] ?? ''
    if (names) return names.split(',')
    await sleep(50)
  }
  return []
}

/** Row locks on the shard table: shard → lock modes held by `app`. */
function shardLocks(app: string): Record<number, string> {
  const pid = pidOf(app)
  if (!pid) return {}
  return Object.fromEntries(query(dsn, `select s.shard_id, array_to_string(r.modes, ',')
      from public.survival_input_epoch_shards s
      join pgrowlocks('public.survival_input_epoch_shards') r on r.locked_row = s.ctid
     where ${pid} = any (r.pids) order by s.shard_id`).map(r => [Number(r[0]), r[1]]))
}

// ── Domain helpers ──────────────────────────────────────────────────────────

let n = 0
/** A fresh project with a budget row. */
function project(withBudget = true): string {
  n += 1
  const id = one(dsn, `insert into projects (slug, name) values ('m2-${n}-${Math.random().toString(36).slice(2, 7)}', 'P${n}') returning id`)
  if (withBudget) run(dsn, ['-c', `insert into project_budgets (project_id, monthly_sek, daily_sek, weekly_sek) values ('${id}', 1000, 1000, 1000)`])
  return id
}
function reserve(pid: string, est: number): string {
  const r = query(dsn, `select allowed, reservation_id from budget_reserve('${pid}'::uuid, ${est}::numeric, null, 'anthropic', 'messages.create')`)[0]
  expect(r[0]).toBe('t')
  return r[1]
}
const metered = (sek: number) => JSON.stringify([{
  provider: 'anthropic', model: 'claude-test', unit_type: 'tokens', units: 100, tokens_in: 60, tokens_out: 40,
  cost_usd: Number((sek / 10.5).toFixed(6)), cost_sek: sek, metadata: { probe: 'm2' } }])

/**
 * A fingerprint of every Survival authority column — exactly the M2 source set.
 * Used to prove "authority changed ⇒ epoch moved" over the whole M0 lifecycle.
 */
const AUTHORITY_FINGERPRINT = `select md5(concat_ws('#',
  (select string_agg(concat_ws(',', id, project_id, cost_sek, created_at), ';' order by id) from cost_events),
  (select string_agg(concat_ws(',', id, project_id, status, estimated_sek, dispatched_at, created_at), ';' order by id) from spend_reservations),
  (select string_agg(concat_ws(',', project_id, daily_sek, weekly_sek, monthly_sek), ';' order by project_id) from project_budgets),
  (select string_agg(concat_ws(',', id, global_daily_sek, global_weekly_sek, global_monthly_sek), ';' order by id) from platform_config),
  (select string_agg(concat_ws(',', id, project_id, snapshot_date, mrr_sek), ';' order by id) from revenue_snapshots),
  (select string_agg(concat_ws(',', id, declared_operating_capital_sek), ';' order by id) from survival_funding_config),
  (select string_agg(id::text, ';' order by id) from projects)))`
/** `sql` (one transaction) changed authority ⇔ the epoch moved, and by exactly +1 on its shard. */
function authorityStep(sql: string, label: string): { changed: boolean; bumped: boolean } {
  const f0 = one(dsn, AUTHORITY_FINGERPRINT)
  const { shard, d } = committed(sql)
  const changed = one(dsn, AUTHORITY_FINGERPRINT) !== f0
  const bumped = d.some(x => x !== 0)
  if (bumped) expect(d, label).toEqual(unit(shard))
  expect(bumped, `${label}: authority changed=${changed}`).toBe(changed)
  return { changed, bumped }
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('M2 sharded Survival input epoch (real PostgreSQL)', () => {
  let legacy = ''
  let baseline: number[] = []
  let applyMs = 0
  const report: Record<string, unknown> = {}

  beforeAll(() => {
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${DB}`])
    dsn = dsnFor(DB)
    run(dsn, ['-c', FIXTURE])
    for (const m of CHAIN) run(dsn, ['-f', m])
    run(dsn, ['-c', `update platform_config set global_daily_sek = 100000, global_weekly_sek = 100000,
                       global_monthly_sek = 100000 where id = 1`])
    // Populated tables BEFORE M2, as in production.
    legacy = project()
    run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${legacy}', 'anthropic', 5, 0.47)`])
    run(dsn, ['-c', `insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values
                       ('${legacy}', current_date - 1, 100), ('${legacy}', current_date, 120)`])
    const t0 = Date.now()
    run(dsn, ['-f', M2])
    applyMs = Date.now() - t0
    baseline = vec()
    run(dsn, ['-c', 'create extension if not exists pgrowlocks'])
  }, 240_000)

  afterAll(() => {
    if (Object.keys(report).length) console.info('[M2 measurements]', JSON.stringify(report))
    if (!AVAILABLE || !dsn) return
    try { run(ADMIN_URL, ['-c', `drop database if exists ${DB} with (force)`]) } catch { /* best effort */ }
  })

  it('PostgreSQL is reachable and is 17.x — this suite must never pass by skipping in CI', () => {
    if (!AVAILABLE && SQL_REQUIRED) {
      throw new Error('SQL proof is REQUIRED (CI=true or ATLAS_SQL_TEST_REQUIRED=1) but no Postgres was reachable.')
    }
    expect(one(dsn, `select current_setting('server_version_num')::int / 10000`)).toBe('17')
  })

  // ── Basic epoch ───────────────────────────────────────────────────────────

  describe('basic epoch', () => {
    it('the migration creates exactly 8 shards, ids 0..7, all at the deterministic baseline 0', () => {
      expect(query(dsn, 'select shard_id, epoch from survival_input_epoch_shards order by shard_id'))
        .toEqual([0, 1, 2, 3, 4, 5, 6, 7].map(i => [String(i), '0']))
      expect(baseline).toEqual(ZERO)
      report.applyMs = applyMs
    })

    it('the table carries change identity ONLY: (shard_id smallint, epoch bigint), nothing else', () => {
      expect(query(dsn, `select column_name, data_type, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'survival_input_epoch_shards' order by ordinal_position`))
        .toEqual([['shard_id', 'smallint', 'NO'], ['epoch', 'bigint', 'NO']])
    })

    it('the vector is all 8 epochs in ascending shard order: a bump on shard s appears at position s', () => {
      const p = project(false)
      const { shard, d } = committed(`insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${p}', current_date, 1)`)
      expect(d).toEqual(unit(shard))
      const table = query(dsn, `select epoch from survival_input_epoch_shards order by shard_id`).map(r => Number(r[0]))
      expect(vec()).toEqual(table)
    })

    it('fails closed on a MISSING shard (vector read and every bump)', () => {
      const missing = `alter table survival_input_epoch_shards disable trigger survival_input_epoch_shards_guard;
        delete from survival_input_epoch_shards where shard_id = 3;`
      expect(sqlstate(dsn, `begin; ${missing} select survival_input_epoch_vector(); rollback;`)).toBe('55000')
      // A writer whose shard is gone cannot commit its input mutation.
      expect(sqlstate(dsn, `begin; alter table survival_input_epoch_shards disable trigger survival_input_epoch_shards_guard;
        delete from survival_input_epoch_shards; set constraints all immediate;
        insert into projects (slug) values ('m2-orphan'); commit;`)).toBe('55000')
      expect(one(dsn, `select count(*) from projects where slug = 'm2-orphan'`)).toBe('0')
      expect(vec()).toHaveLength(8)
    })

    it('an EXTRA, DUPLICATE or MALFORMED shard is structurally impossible (check / primary key / not null)', () => {
      const off = 'alter table survival_input_epoch_shards disable trigger survival_input_epoch_shards_guard;'
      expect(sqlstate(dsn, `begin; ${off} insert into survival_input_epoch_shards values (8, 0); rollback;`)).toBe('23514')
      expect(sqlstate(dsn, `begin; ${off} insert into survival_input_epoch_shards values (3, 0); rollback;`)).toBe('23505')
      expect(sqlstate(dsn, `begin; ${off} update survival_input_epoch_shards set epoch = -1 where shard_id = 0; rollback;`)).toBe('23514')
      expect(sqlstate(dsn, `begin; ${off} update survival_input_epoch_shards set epoch = null where shard_id = 0; rollback;`)).toBe('23502')
    })
  })

  // ── Privileges / hardening ────────────────────────────────────────────────

  describe('privileges and hardening', () => {
    const as = (role: string, sql: string) => sqlstate(dsn, `set role ${role}; ${sql}`)

    it('service_role can read the shards and the vector', () => {
      expect(as('service_role', 'select * from survival_input_epoch_shards')).toBe('')
      expect(as('service_role', 'select survival_input_epoch_vector()')).toBe('')
    })

    it('service_role cannot fabricate, delete, add or truncate epochs', () => {
      for (const sql of ['update survival_input_epoch_shards set epoch = epoch + 1 where shard_id = 0',
        'update survival_input_epoch_shards set epoch = 0', 'delete from survival_input_epoch_shards',
        'insert into survival_input_epoch_shards values (0, 9)', 'truncate survival_input_epoch_shards']) {
        expect(as('service_role', sql), sql).toBe('42501')
      }
      expect(vec()).toHaveLength(8)
    })

    it('anon and authenticated can neither read nor write nor call anything M2 ships', () => {
      for (const role of ['anon', 'authenticated']) {
        for (const sql of ['select * from survival_input_epoch_shards', 'select survival_input_epoch_vector()',
          'update survival_input_epoch_shards set epoch = epoch + 1', 'truncate survival_input_epoch_shards']) {
          expect(as(role, sql), `${role}: ${sql}`).toBe('42501')
        }
      }
    })

    it('RLS is on with zero policies; the exact grant set is SELECT to service_role', () => {
      expect(one(dsn, `select relrowsecurity from pg_class where oid = 'public.survival_input_epoch_shards'::regclass`)).toBe('t')
      expect(one(dsn, `select count(*) from pg_policies where tablename = 'survival_input_epoch_shards'`)).toBe('0')
      expect(query(dsn, `select grantee, privilege_type from information_schema.role_table_grants
        where table_name = 'survival_input_epoch_shards' and grantee in ('anon','authenticated','service_role','PUBLIC')
        order by 1, 2`)).toEqual([['service_role', 'SELECT']])
    })

    it('the machinery is SECURITY DEFINER with an empty search_path, and not callable by any client role', () => {
      for (const fn of ['survival_input_epoch_bump()', 'survival_input_epoch_shards_guard()', 'survival_input_epoch_vector()']) {
        expect(one(dsn, `select prosecdef::text || '|' || array_to_string(proconfig, ',') from pg_proc where oid = 'public.${fn}'::regprocedure`), fn)
          .toBe('true|search_path=""')
      }
      for (const role of ['anon', 'authenticated', 'service_role']) {
        expect(one(dsn, `select has_function_privilege('${role}', 'public.survival_input_epoch_bump()', 'execute')`), role).toBe('f')
        expect(one(dsn, `select has_function_privilege('${role}', 'public.survival_input_epoch_shards_guard()', 'execute')`), role).toBe('f')
      }
      expect(one(dsn, `select has_function_privilege('service_role', 'public.survival_input_epoch_vector()', 'execute')`)).toBe('t')
      expect(one(dsn, `select has_function_privilege('anon', 'public.survival_input_epoch_vector()', 'execute')`)).toBe('f')
      // A trigger function is not an API even for the owner.
      expect(sqlstate(dsn, 'select public.survival_input_epoch_bump()')).toBe('0A000')
    })

    it('even the OWNER can only advance a shard by exactly +1 — every other write is refused by the guard', () => {
      for (const sql of ['update survival_input_epoch_shards set epoch = epoch + 2 where shard_id = 0',
        'update survival_input_epoch_shards set epoch = epoch - 1 where shard_id = 1',
        'update survival_input_epoch_shards set shard_id = 9 where shard_id = 0',
        'delete from survival_input_epoch_shards where shard_id = 0',
        'insert into survival_input_epoch_shards values (0, 0)', 'truncate survival_input_epoch_shards']) {
        expect(sqlstate(dsn, sql), sql).toBe('42501')
      }
    })

    it('OWNER LIMITATION, stated honestly: the owner can disable the guard (PostgreSQL cannot bind a superuser)', () => {
      expect(sqlstate(dsn, `begin; alter table survival_input_epoch_shards disable trigger survival_input_epoch_shards_guard;
        update survival_input_epoch_shards set epoch = 0; rollback;`)).toBe('')
    })
  })

  // ── Atomicity per source ──────────────────────────────────────────────────

  describe('atomicity: every Survival authority source × INSERT / UPDATE / DELETE', () => {
    let p = ''
    let spare = ''
    beforeAll(() => { if (AVAILABLE) { p = project(); spare = project(false) } })

    it('cost_events', () => {
      expectBump(`insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p}', 'anthropic', 2, 0.2)`)
      expectBump(`update cost_events set cost_sek = cost_sek + 1 where project_id = '${p}' and reservation_id is null`)
      expectBump(`delete from cost_events where project_id = '${p}' and reservation_id is null`)
      expectRollbackClean(`insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p}', 'anthropic', 2, 0.2)`)
      expectFailedClean(`insert into cost_events (project_id, provider, cost_sek, cost_usd) values (gen_random_uuid(), 'x', 1, 0.1)`)
    })

    it('spend_reservations (direct owner DML; the M0 RPCs are proven separately)', () => {
      expectBump(`insert into spend_reservations (project_id, estimated_sek, provider) values ('${p}', 1, 'm2-direct')`)
      expectBump(`update spend_reservations set status = 'released', resolved_at = now() where provider = 'm2-direct' and status = 'open'`)
      expectBump(`delete from spend_reservations where provider = 'm2-direct'`)
      expectRollbackClean(`insert into spend_reservations (project_id, estimated_sek, provider) values ('${p}', 1, 'm2-direct')`)
      expectFailedClean(`insert into spend_reservations (project_id, estimated_sek) values (gen_random_uuid(), 1)`)
    })

    it('project_budgets', () => {
      expectBump(`insert into project_budgets (project_id, monthly_sek, daily_sek, weekly_sek) values ('${spare}', 10, 10, 10)`)
      expectBump(`update project_budgets set daily_sek = 11 where project_id = '${spare}'`)
      expectBump(`delete from project_budgets where project_id = '${spare}'`)
      expectRollbackClean(`update project_budgets set monthly_sek = 1 where project_id = '${p}'`)
      expectFailedClean(`insert into project_budgets (project_id, monthly_sek) values ('${p}', 1)`)
    })

    it('platform_config — global limits and row population bump; pause, updated_at and same-value writes do NOT', () => {
      expectBump(`update platform_config set global_daily_sek = global_daily_sek + 1 where id = 1`)
      expectBump(`update platform_config set global_weekly_sek = null where id = 1`)
      expectBump(`update platform_config set global_weekly_sek = 100000 where id = 1`)
      expectBump(`update platform_config set global_monthly_sek = global_monthly_sek - 1 where id = 1`)
      expectNoBump(`update platform_config set automation_paused = true, paused_at = now(), paused_reason = 'm2' where id = 1`)
      expectNoBump(`update platform_config set automation_paused = false, paused_at = null, paused_reason = null where id = 1`)
      expectNoBump(`update platform_config set updated_at = now(), max_daily_renders = 5 where id = 1`)
      expectNoBump(`update platform_config set global_daily_sek = global_daily_sek where id = 1`)
      expectRollbackClean(`delete from platform_config where id = 1`)
      expectRollbackClean(`insert into platform_config (id) values (2)`)
      expectRollbackClean(`update platform_config set id = 3 where id = 1`)
      expectFailedClean(`update platform_config set global_daily_sek = 1e20 where id = 1`)
    })

    it('revenue_snapshots — insert, relevant update, upsert, delete', () => {
      expectBump(`insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${p}', current_date - 2, 10)`)
      expectBump(`update revenue_snapshots set mrr_sek = 15 where project_id = '${p}'`)
      expectBump(`insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${p}', current_date - 2, 20)
                  on conflict (project_id, snapshot_date) do update set mrr_sek = excluded.mrr_sek`)
      expectBump(`delete from revenue_snapshots where project_id = '${p}'`)
      expectRollbackClean(`insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${p}', current_date, 1)`)
      expectFailedClean(`insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${legacy}', current_date, 1)`)
    })

    it('projects — population bumps; name, slug, colour, settings, mode and stop toggles do NOT', () => {
      const id = one(dsn, `select gen_random_uuid()`)
      expectBump(`insert into projects (id, slug) values ('${id}', 'm2-pop-${n}')`)
      expectNoBump(`update projects set name = 'renamed', slug = 'm2-pop-renamed-${n}', color = '#fff',
        settings = '{"a":1}', atlas_mode = 'observer', execution_paused = true, paused_reason = 'm2' where id = '${id}'`)
      const id2 = one(dsn, `select gen_random_uuid()`)
      expectBump(`update projects set id = '${id2}' where id = '${id}'`)
      expectBump(`delete from projects where id = '${id2}'`)
      expectRollbackClean(`insert into projects (slug) values ('m2-rb-${n}')`)
      expectFailedClean(`insert into projects (slug) values ((select slug from projects where id = '${legacy}'))`)
    })

    it('survival_funding_config (direct owner write; the canonical setter is proven separately)', () => {
      expectBump(`update survival_funding_config set declared_operating_capital_sek = 5 where id = 1`)
      expectBump(`update survival_funding_config set declared_operating_capital_sek = null where id = 1`)
      expectRollbackClean(`delete from survival_funding_config where id = 1`)
    })

    it('a statement that touches zero rows writes nothing and moves nothing (row-level semantics)', () => {
      expectNoBump(`update cost_events set cost_sek = 0 where false`)
      expectNoBump(`delete from revenue_snapshots where false`)
      expectNoBump(`update projects set id = id where false`)
    })
  })

  // ── TRUNCATE ──────────────────────────────────────────────────────────────

  describe('TRUNCATE — the statement-level path a row trigger alone would miss', () => {
    it.each([
      ['cost_events', 'truncate cost_events'],
      ['spend_reservations', 'truncate spend_reservations cascade'],
      ['project_budgets', 'truncate project_budgets'],
      ['platform_config', 'truncate platform_config'],
      ['revenue_snapshots', 'truncate revenue_snapshots'],
      ['survival_funding_config', 'truncate survival_funding_config'],
    ])('%s: TRUNCATE bumps inside its transaction and rolls back with it', (_t, sql) => {
      expectRollbackClean(sql)
    })

    it('projects: TRUNCATE is structurally refused (append-only audit ledgers cascade-refuse it) — and its own trigger still bumps', () => {
      // TRUNCATE projects CASCADE reaches survival_state_events, whose append-only guard refuses it
      // (production additionally has ON DELETE RESTRICT children). With that guard lifted inside a
      // rolled-back transaction, the projects TRUNCATE trigger is shown to bump on its own.
      expect(sqlstate(dsn, 'begin; truncate projects cascade; rollback;')).toBe('42501')
      expectRollbackClean(`alter table survival_state_events disable trigger user;
        alter table cost_events disable trigger survival_input_epoch_bump_truncate;
        alter table spend_reservations disable trigger survival_input_epoch_bump_truncate;
        alter table project_budgets disable trigger survival_input_epoch_bump_truncate;
        alter table revenue_snapshots disable trigger survival_input_epoch_bump_truncate;
        truncate projects cascade`, 'projects TRUNCATE (own trigger only)')
    })

    it('a COMMITTED truncate bumps exactly once even when CASCADE empties several sources', () => {
      run(dsn, ['-c', `create table m2_truncate_probe as select * from revenue_snapshots`])
      expectBump('truncate revenue_snapshots')
      run(dsn, ['-c', `insert into revenue_snapshots select * from m2_truncate_probe; drop table m2_truncate_probe`])
      const v0 = vec()
      const out = query(dsn, `begin; truncate spend_reservations cascade;
        select 'm2shard=' || (txid_current() % 8); rollback;`)
      expect(out.flat().some(l => l.startsWith('m2shard='))).toBe(true)
      expect(vec()).toEqual(v0)
    })

    it('service_role holds TRUNCATE on cost_events in production — and its truncate still bumps', () => {
      expectRollbackClean('set local role service_role; truncate cost_events')
    })
  })

  // ── FK cascades ───────────────────────────────────────────────────────────

  describe('FK cascades reach the epoch through the child tables\' own triggers', () => {
    it('deleting a project cascades to budgets, cost rows and reservations — one transaction, one +1', () => {
      const p = project()
      run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p}', 'anthropic', 1, 0.1)`])
      reserve(p, 1)
      expectBump(`delete from projects where id = '${p}'`)
      expect(one(dsn, `select (select count(*) from cost_events where project_id = '${p}')
        + (select count(*) from spend_reservations where project_id = '${p}')
        + (select count(*) from project_budgets where project_id = '${p}')`)).toBe('0')
    })

    it('ON DELETE SET NULL on revenue_snapshots bumps BY ITSELF (projects\' trigger disabled to isolate it)', () => {
      const p = project(false)
      run(dsn, ['-c', `insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${p}', current_date, 9)`])
      expectRollbackClean(`alter table projects disable trigger survival_input_epoch_bump;
        delete from projects where id = '${p}'`, 'revenue SET NULL cascade')
    })

    it('ON DELETE CASCADE on cost_events bumps BY ITSELF', () => {
      const p = project(false)
      run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p}', 'anthropic', 1, 0.1)`])
      expectRollbackClean(`alter table projects disable trigger survival_input_epoch_bump;
        delete from projects where id = '${p}'`, 'cost_events cascade')
    })
  })

  // ── Same transaction ──────────────────────────────────────────────────────

  describe('same transaction → same shard', () => {
    it('several sources in one transaction: one shard, advanced exactly once (deferred)', () => {
      const p = project()
      const { shard, d } = committed(`
        insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p}', 'anthropic', 1, 0.1);
        insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${p}', current_date, 3);
        update project_budgets set daily_sek = 999 where project_id = '${p}';
        update platform_config set global_daily_sek = global_daily_sek + 1 where id = 1;
        insert into projects (slug) values ('m2-same-${n}')`)
      expect(d).toEqual(unit(shard))
    })

    it('made immediate, every bump in the transaction reports the same shard and the vector moves once', () => {
      const p = project()
      const rows = query(dsn, `begin; set constraints all immediate;
        insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p}', 'anthropic', 1, 0.1);
        select 'a=' || (txid_current() % 8) || ':' || survival_input_epoch_vector()::text;
        update project_budgets set daily_sek = 998 where project_id = '${p}';
        select 'b=' || (txid_current() % 8) || ':' || survival_input_epoch_vector()::text;
        savepoint s; insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${p}', current_date, 4); release s;
        select 'c=' || (txid_current() % 8) || ':' || survival_input_epoch_vector()::text;
        commit;`).map(r => r.join('|'))
      const tag = (k: string) => rows.find(l => l.startsWith(`${k}=`))!.slice(2).split(':')
      expect(new Set([tag('a')[0], tag('b')[0], tag('c')[0]]).size).toBe(1)
      expect(tag('b')[1]).toBe(tag('a')[1])
      expect(tag('c')[1]).toBe(tag('a')[1])
    })

    it('a first bump inside a SUBTRANSACTION stays on the same shard (at worst +2, never a miss)', () => {
      const p = project()
      const v0 = vec()
      const rows = query(dsn, `begin; set constraints all immediate;
        savepoint s; insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p}', 'anthropic', 1, 0.1); release s;
        update project_budgets set daily_sek = 997 where project_id = '${p}';
        select 'm2shard=' || (txid_current() % 8); commit;`).map(r => r.join('|'))
      const shard = Number(rows.find(l => l.startsWith('m2shard='))!.split('=')[1])
      const d = delta(v0, vec())
      expect(d.filter((x, i) => i !== shard && x !== 0)).toEqual([])
      expect(d[shard]).toBeGreaterThanOrEqual(1)
      expect(d[shard]).toBeLessThanOrEqual(2)
    })

    it('a rolled-back SAVEPOINT that bumped leaves the outer transaction able to bump again', () => {
      const p = project()
      const { shard, d } = committed(`set constraints all immediate;
        savepoint s; insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p}', 'anthropic', 1, 0.1); rollback to s;
        update project_budgets set daily_sek = 996 where project_id = '${p}'`)
      expect(d).toEqual(unit(shard))
    })
  })

  // ── Concurrency / sharding ────────────────────────────────────────────────

  describe('concurrency and sharding (pg_stat_activity, pg_blocking_pids, pgrowlocks)', { timeout: 60_000 }, () => {
    let dl0 = 0
    beforeAll(() => { if (AVAILABLE) dl0 = deadlocks() })
    afterAll(() => { if (AVAILABLE) expect(deadlocks() - dl0, 'zero 40P01 across the concurrency cases').toBe(0) })

    const costRow = (p: string) => `insert into public.cost_events (project_id, provider, cost_sek, cost_usd) values ('${p}', 'anthropic', 1, 0.1);`

    it('writers on DIFFERENT shards hold their shard locks at the same time', async () => {
      const p = project()
      const a = writer('m2_diff_a', 2, costRow(p), { immediate: true, holdS: 8 })
      const b = writer('m2_diff_b', 5, costRow(p), { immediate: true, holdS: 8 })
      expect(await holding('m2_diff_a')).toBe(true)
      expect(await holding('m2_diff_b')).toBe(true)
      expect(shardLocks('m2_diff_a')).toEqual({ 2: 'No Key Update' })
      expect(shardLocks('m2_diff_b')).toEqual({ 5: 'No Key Update' })
      const [ra, rb] = await Promise.all([a, b])
      expect([ra.ok, rb.ok, ra.shard, rb.shard]).toEqual([true, true, 2, 5])
    })

    it('writers on the SAME shard serialize on that shard row', async () => {
      const p = project()
      const v0 = vec()
      const a = writer('m2_same_a', 3, costRow(p), { immediate: true, holdS: 8 })
      expect(await holding('m2_same_a')).toBe(true)
      const b = writer('m2_same_b', 3, costRow(p), { immediate: true })
      expect(await waitingBehind('m2_same_b')).toEqual(['m2_same_a'])
      const [ra, rb] = await Promise.all([a, b])
      expect([ra.ok, rb.ok]).toEqual([true, true])
      expect(rb.endedAt).toBeGreaterThanOrEqual(ra.endedAt)
      expect(delta(v0, vec())).toEqual(unit(3, 2))
    })

    it('DEFERRED (the default): a same-shard writer is NOT blocked mid-transaction — only at its commit', async () => {
      const p = project()
      const a = writer('m2_defer_a', 4, costRow(p), { immediate: true, holdS: 10 })
      expect(await holding('m2_defer_a')).toBe(true)
      const b = writer('m2_defer_b', 4, costRow(p), { holdS: 1 })
      // b's input mutation went through and it reached its own sleep while a still holds shard 4.
      expect(await holding('m2_defer_b')).toBe(true)
      expect(shardLocks('m2_defer_b')).toEqual({})
      // ...then b's COMMIT waits for shard 4.
      expect(await waitingBehind('m2_defer_b')).toEqual(['m2_defer_a'])
      const [ra, rb] = await Promise.all([a, b])
      expect([ra.ok, rb.ok]).toEqual([true, true])
    })

    it('REJECTED DESIGN, measured: an IMMEDIATE mid-transaction bump creates a 40P01 that M2\'s deferred bump does not', async () => {
      // A test-local table and an immediate statement-level bump on a test-local shard table:
      // the design M2 rejects. Never shipped; exists only in this throwaway database.
      run(dsn, ['-c', `
        create table m2_alt_shards (shard_id smallint primary key, epoch bigint not null);
        insert into m2_alt_shards select g, 0 from generate_series(0, 7) g;
        create table m2_alt_input (id serial primary key, v int);
        create table m2_alt_row (id int primary key, v int); insert into m2_alt_row values (1, 0);
        create function m2_alt_bump() returns trigger language plpgsql as $f$ begin
          update m2_alt_shards set epoch = epoch + 1 where shard_id = txid_current() % 8; return null; end $f$;
        create trigger m2_alt_bump after insert on m2_alt_input for each statement execute function m2_alt_bump();`])
      const dlAlt = deadlocks()
      const w1 = writer('m2_alt_w1', 1, `insert into m2_alt_input (v) values (1); perform pg_sleep(1.5); update m2_alt_row set v = v + 1 where id = 1;`)
      await sleep(400)
      expect(await holding('m2_alt_w1')).toBe(true)
      const w2 = writer('m2_alt_w2', 1, `update m2_alt_row set v = v + 1 where id = 1; insert into m2_alt_input (v) values (2);`)
      const [r1, r2] = await Promise.all([w1, w2])
      expect([r1.state, r2.state].filter(s => s === '40P01')).toHaveLength(1)
      expect(deadlocks() - dlAlt).toBe(1)

      // The same interleaving against the REAL M2 trigger: no deadlock, both commit.
      const p = project()
      const dlReal = deadlocks()
      const v0 = vec()
      const m1 = writer('m2_real_w1', 1, `${costRow(p)} perform pg_sleep(1.5);
        update public.project_budgets set daily_sek = daily_sek + 1 where project_id = '${p}';`)
      await sleep(400)
      expect(await holding('m2_real_w1')).toBe(true)
      const m2 = writer('m2_real_w2', 1, `update public.project_budgets set daily_sek = daily_sek + 1 where project_id = '${p}';
        ${costRow(p)}`)
      const [s1, s2] = await Promise.all([m1, m2])
      expect([s1.ok, s2.ok, s1.state, s2.state]).toEqual([true, true, '', ''])
      expect(deadlocks() - dlReal).toBe(0)
      expect(delta(v0, vec())).toEqual(unit(1, 2))
      run(dsn, ['-c', 'drop table m2_alt_shards, m2_alt_input, m2_alt_row; drop function m2_alt_bump()'])
      dl0 += 1 // the deliberate deadlock above is the rejected design's, not M2's
    }, 30_000)

    it('16-writer storm: every writer commits, zero 40P01, exactly +1 per transaction, distribution measured', async () => {
      const hot = [project(), project()]
      const own = Array.from({ length: 16 }, () => project())
      const v0 = vec()
      const dl = deadlocks()
      const t0 = Date.now()
      let sampledShardWaits = 0
      let sampling = true
      const sampler = (async () => {
        while (sampling) {
          sampledShardWaits = Math.max(sampledShardWaits, Number(one(dsn, `select count(*) from pg_stat_activity
            where application_name like 'm2_storm_%' and wait_event_type = 'Lock'`)))
          await sleep(25)
        }
      })()
      // Half the writers take the hot budget row FIRST, half take it LAST; every one touches
      // two or three Survival sources and holds its transaction open for 200 ms.
      const writers = own.map((p, i) => session(`m2_storm_${i}`, [`begin`,
        i % 2 === 0
          ? `update project_budgets set weekly_sek = weekly_sek + 1 where project_id = '${hot[i % 4 < 2 ? 0 : 1]}'`
          : `insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${p}', current_date, ${i})`,
        `insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p}', 'anthropic', 1, 0.1)`,
        `select pg_sleep(0.2)`,
        i % 2 === 0
          ? `insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${p}', current_date, ${i})`
          : `update project_budgets set weekly_sek = weekly_sek + 1 where project_id = '${hot[i % 4 < 2 ? 0 : 1]}'`,
        `select 'm2shard=' || (txid_current() % 8)`, `commit`]))
      const results = await Promise.all(writers)
      const totalMs = Date.now() - t0
      sampling = false
      await sampler
      expect(results.map(r => r.state)).toEqual(results.map(() => ''))
      expect(deadlocks() - dl).toBe(0)
      const d = delta(v0, vec())
      const perShard = Array.from({ length: 8 }, (_, s) => results.filter(r => r.shard === s).length)
      expect(d).toEqual(perShard)
      expect(d.reduce((a, b) => a + b, 0)).toBe(16)
      report.storm16 = { totalMs, perShard, maxConcurrentLockWaitsSampled: sampledShardWaits }
    }, 60_000)

    it('16 disjoint writers (no shared input row) coexist: only the shard row is shared, and only at commit', async () => {
      const own = Array.from({ length: 16 }, () => project())
      const v0 = vec()
      const t0 = Date.now()
      const results = await Promise.all(own.map((p, i) => session(`m2_disjoint_${i}`, [`begin`,
        `insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p}', 'anthropic', 1, 0.1)`,
        `select pg_sleep(0.5)`, `select 'm2shard=' || (txid_current() % 8)`, `commit`])))
      const totalMs = Date.now() - t0
      expect(results.every(r => r.ok)).toBe(true)
      expect(delta(v0, vec()).reduce((a, b) => a + b, 0)).toBe(16)
      // 16 × 500 ms held concurrently: a global serialization point would need ≥ 8 s.
      expect(totalMs).toBeLessThan(4_000)
      report.disjoint16 = { totalMs, perShard: Array.from({ length: 8 }, (_, s) => results.filter(r => r.shard === s).length) }
    }, 60_000)
  })

  // ── Future fence simulator ────────────────────────────────────────────────

  describe('FUTURE fence simulator (test-only) — race matrix A–D', { timeout: 60_000 }, () => {
    let dl0 = 0
    beforeAll(() => { if (AVAILABLE) dl0 = deadlocks() })
    afterAll(() => { if (AVAILABLE) expect(deadlocks() - dl0, 'zero 40P01 across the fence matrix').toBe(0) })
    const costRow = (p: string) => `insert into public.cost_events (project_id, provider, cost_sek, cost_usd) values ('${p}', 'anthropic', 1, 0.1);`

    it('the simulator locks the 8 shards in ASCENDING shard order (LockRows over a forward pkey scan)', () => {
      const plan = query(dsn, `explain (costs off) ${FENCE_LOCK_SQL}`).map(r => r.join('|')).join('\n')
      // LockRows locks rows in the order its input yields them: a forward pkey scan or an explicit
      // ascending sort on shard_id (the planner picks by table statistics). Case C below observes
      // the order on live locks.
      expect(plan).toMatch(/LockRows\n->\s+(Index Scan using survival_input_epoch_shards_pkey|Sort\nSort Key: survival_input_epoch_shards\.shard_id\n)/)
      expect(plan).not.toMatch(/Backward|DESC/)
    })

    it('Case A — a writer commits BEFORE the fence: the fence sees V ≠ current and refuses', async () => {
      const p = project()
      const V = vec()
      expectBump(costRow(p))
      const f = await fence('m2_fence_a', V, 0)
      expect([f.ok, verdict(f)]).toEqual([true, 'refuse'])
    })

    it('Case B — the fence holds all 8 FOR SHARE; a writer blocks at its epoch bump until the fence commits', async () => {
      const p = project()
      const V = vec()
      const f = fence('m2_fence_b', V, 8)
      expect(await holding('m2_fence_b')).toBe(true)
      expect(Object.keys(shardLocks('m2_fence_b')).map(Number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
      const w = writer('m2_fence_b_w', 6, costRow(p))
      expect(await waitingBehind('m2_fence_b_w')).toEqual(['m2_fence_b'])
      const [rf, rw] = await Promise.all([f, w])
      expect([rf.ok, verdict(rf), rw.ok]).toEqual([true, 'proceed', true])
      expect(rw.endedAt).toBeGreaterThanOrEqual(rf.endedAt)
      expect(delta(V, vec())).toEqual(unit(6))
    })

    it('Case C — the writer already holds its shard: the fence waits (holding only LOWER shards), then refuses', async () => {
      const p = project()
      const V = vec()
      const w = writer('m2_fence_c_w', 4, costRow(p), { immediate: true, holdS: 8 })
      expect(await holding('m2_fence_c_w')).toBe(true)
      const f = fence('m2_fence_c', V, 0)
      expect(await waitingBehind('m2_fence_c')).toEqual(['m2_fence_c_w'])
      // Ascending acquisition, observed: shares on 0..3 are held, nothing on 5..7 yet.
      expect(Object.keys(shardLocks('m2_fence_c')).map(Number)).toEqual([0, 1, 2, 3])
      const [rw, rf] = await Promise.all([w, f])
      expect([rw.ok, rf.ok, verdict(rf)]).toEqual([true, true, 'refuse'])
    })

    it('Case D — the writer rolls back: the fence proceeds with the unchanged vector', async () => {
      const p = project()
      const V = vec()
      const w = writer('m2_fence_d_w', 4, costRow(p), { immediate: true, holdS: 8, rollback: true })
      expect(await holding('m2_fence_d_w')).toBe(true)
      const f = fence('m2_fence_d', V, 0)
      expect(await blockedOnLock('m2_fence_d')).toBe(true)
      const [rw, rf] = await Promise.all([w, f])
      expect([rw.ok, rw.state]).toEqual([false, 'P0001'])
      expect([rf.ok, verdict(rf)]).toEqual([true, 'proceed'])
      expect(vec()).toEqual(V)
    })
  })

  // ── M0 cross-proof ────────────────────────────────────────────────────────

  describe('M0 cross-proof — every spend transition that changes authority moves the epoch', { timeout: 60_000 }, () => {
    let p = ''
    beforeAll(() => { if (AVAILABLE) p = project() })

    it('reserve → dispatch intent → metered settlement', () => {
      let rid = ''
      const r = authorityStep(`select reservation_id from budget_reserve('${p}'::uuid, 3::numeric, null, 'anthropic', 'messages.create')`, 'reserve')
      expect(r).toEqual({ changed: true, bumped: true })
      rid = one(dsn, `select id from spend_reservations where project_id = '${p}' order by created_at desc limit 1`)
      expect(authorityStep(`select budget_mark_dispatch_intent('${rid}'::uuid, '${TOKEN(1)}'::uuid, 'token_window')`, 'dispatch intent'))
        .toEqual({ changed: true, bumped: true })
      expect(authorityStep(`select * from budget_settle_recorded('${rid}'::uuid, '${TOKEN(1)}'::uuid, 'metered', '${metered(2)}'::jsonb)`, 'settle metered'))
        .toEqual({ changed: true, bumped: true })
    })

    it('unmetered and ambiguous settlements', () => {
      for (const [i, kind] of [[2, 'estimate_unmetered'], [3, 'estimate_ambiguous']] as const) {
        const rid = reserve(p, 2)
        run(dsn, ['-c', `select budget_mark_dispatch_intent('${rid}'::uuid, '${TOKEN(i)}'::uuid, 'token_window')`])
        expect(authorityStep(`select * from budget_settle_recorded('${rid}'::uuid, '${TOKEN(i)}'::uuid, '${kind}')`, kind))
          .toEqual({ changed: true, bumped: true })
      }
    })

    it('release and release-undispatched', () => {
      const a = reserve(p, 1)
      expect(authorityStep(`select budget_release('${a}'::uuid)`, 'release')).toEqual({ changed: true, bumped: true })
      const b = reserve(p, 1)
      run(dsn, ['-c', `select budget_mark_dispatch_intent('${b}'::uuid, '${TOKEN(9)}'::uuid, 'token_window')`])
      expect(authorityStep(`select budget_release_undispatched('${b}'::uuid, '${TOKEN(9)}'::uuid)`, 'release undispatched'))
        .toEqual({ changed: true, bumped: true })
    })

    it('refusal: an over-budget reserve that writes a refused row moves the epoch; one that writes nothing does not', () => {
      const res = authorityStep(`select allowed from budget_reserve('${p}'::uuid, 999999::numeric, null, 'anthropic', 'messages.create')`, 'refused reserve')
      expect(res.bumped).toBe(res.changed)
    })

    it('advisory override reservation', () => {
      expect(authorityStep(`select budget_open_override_reservation('${p}'::uuid, 1::numeric, 'anthropic', 'm2')`, 'override'))
        .toEqual({ changed: true, bumped: true })
    })

    it('reconciliation of an abandoned dispatched reservation', () => {
      const rid = reserve(p, 4)
      run(dsn, ['-c', `select budget_mark_dispatch_intent('${rid}'::uuid, '${TOKEN(7)}'::uuid, 'token_window')`])
      // SET CONSTRAINTS IMMEDIATE: with M2's deferred bump queued, a later ALTER TABLE in the same
      // transaction is refused ("pending trigger events") — an M2 operational effect, recorded.
      run(dsn, ['-c', `set constraints all immediate;
        alter table spend_reservations disable trigger spend_reservations_guard_transition;
        update spend_reservations set created_at = created_at - interval '3 hours', dispatched_at = dispatched_at - interval '3 hours' where id = '${rid}';
        alter table spend_reservations enable trigger spend_reservations_guard_transition;`])
      expect(authorityStep(`select budget_reconcile_dispatched(interval '1 hour', 100)`, 'reconcile'))
        .toEqual({ changed: true, bumped: true })
      expect(one(dsn, `select status from spend_reservations where id = '${rid}'`)).toBe('settled')
    })

    it('direct / ungoverned cost_events insert (the lib/cost/track.ts shape) as service_role', () => {
      expect(authorityStep(`set local role service_role;
        insert into cost_events (project_id, provider, model, operation, unit_type, units, cost_usd, cost_sek, metadata)
        values ('${p}', 'openai', 'x', 'chat', 'tokens', 10, 0.01, 0.1, '{"cost_sek_calculated":0.1}')`, 'ungoverned insert'))
        .toEqual({ changed: true, bumped: true })
    })

    it('a FAILED M0 transition moves nothing (wrong dispatch token)', () => {
      const rid = reserve(p, 1)
      run(dsn, ['-c', `select budget_mark_dispatch_intent('${rid}'::uuid, '${TOKEN(11)}'::uuid, 'token_window')`])
      const v0 = vec()
      // Whether M0 raises or returns a refusal row, a wrong token writes no authority and moves no epoch.
      sqlstate(dsn, `begin; set constraints all immediate;
        select * from budget_settle_recorded('${rid}'::uuid, '${TOKEN(12)}'::uuid, 'metered', '${metered(1)}'::jsonb); commit;`)
      expect(vec()).toEqual(v0)
      expect(one(dsn, `select status from spend_reservations where id = '${rid}'`)).toBe('open')
    })

    it('the Survival READ path (budget_headroom, budget_scope_state, coverage RPC) never moves the epoch', () => {
      expectNoBump(`select count(*) from budget_headroom(30)`)
      expectNoBump(`select count(*) from budget_scope_state('${p}'::uuid, 30)`)
      expectNoBump(`select survival_scope_is_platform_complete(array['${p}']::uuid[])`)
      expectNoBump(`select survival_input_epoch_vector()`)
    })

    it('M2 does not change M0 semantics: headroom after a settled spend is the canonical limit − spent − held', () => {
      const q = project()
      const rid = reserve(q, 5)
      run(dsn, ['-c', `select budget_mark_dispatch_intent('${rid}'::uuid, '${TOKEN(21)}'::uuid, 'token_window')`])
      run(dsn, ['-c', `select * from budget_settle_recorded('${rid}'::uuid, '${TOKEN(21)}'::uuid, 'metered', '${metered(3)}'::jsonb)`])
      expect(Number(one(dsn, `select remaining_sek from budget_scope_state('${q}'::uuid, 30) where scope = 'project_monthly'`))).toBe(997)
    })

    it('M0 throughput: 200 reserve → dispatch → settle cycles, with vs without the M2 triggers', () => {
      const q = project()
      // Measured through the notice channel (stderr), which execFileSync only exposes on failure.
      const measure = (): number => {
        const r = (() => {
          try {
            execFileSync(PSQL!, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', dsn, '-c', `do $t$ declare t0 timestamptz; r uuid; i int; begin
              t0 := clock_timestamp();
              for i in 1..200 loop
                select reservation_id into r from public.budget_reserve('${q}'::uuid, 0.01::numeric, null, 'anthropic', 'm2-bench');
                perform public.budget_mark_dispatch_intent(r, gen_random_uuid(), 'token_window');
                commit;
                perform public.budget_settle_recorded(r, (select dispatch_token from public.spend_reservations where id = r),
                  'estimate_unmetered');
                commit;
              end loop;
              raise exception 'm2bench=%', round(extract(epoch from clock_timestamp() - t0) * 1000) using errcode = 'P0001';
            end $t$;`], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000 })
            return ''
          } catch (e) { return String((e as { stderr?: unknown }).stderr ?? '') }
        })()
        return Number(/m2bench=(\d+)/.exec(r)?.[1] ?? NaN)
      }
      const withM2 = measure()
      const v0 = vec()
      run(dsn, ['-c', `alter table spend_reservations disable trigger survival_input_epoch_bump;
                       alter table cost_events disable trigger survival_input_epoch_bump;`])
      let without = NaN
      try { without = measure() } finally {
        run(dsn, ['-c', `alter table spend_reservations enable trigger survival_input_epoch_bump;
                         alter table cost_events enable trigger survival_input_epoch_bump;`])
      }
      expect(vec(), 'the disabled run moved nothing').toEqual(v0)
      const withAgain = measure()
      expect(Number.isFinite(withM2) && Number.isFinite(without) && Number.isFinite(withAgain)).toBe(true)
      report.m0Throughput200 = { withM2Ms: withM2, withoutM2Ms: without, withM2AgainMs: withAgain,
        ratio: Number((Math.min(withM2, withAgain) / without).toFixed(2)) }
      // Two committed transactions per cycle, each one shard write at commit: well under 2×.
      expect(Math.min(withM2, withAgain) / without).toBeLessThan(2)
    }, 120_000)
  })

  // ── Funding / revenue / project coverage ──────────────────────────────────

  describe('funding proof — the canonical setter moves funding and the epoch together', () => {
    it('SET', () => {
      const { shard, d } = committed(`select * from survival_set_declared_operating_capital(25000, '${ACTOR}')`)
      expect(d).toEqual(unit(shard))
      expect(one(dsn, `select declared_operating_capital_sek from survival_funding_config where id = 1`)).toBe('25000.0000')
    })
    it('CLEAR', () => {
      const { shard, d } = committed(`select * from survival_set_declared_operating_capital(null, '${ACTOR}')`)
      expect(d).toEqual(unit(shard))
      expect(one(dsn, `select declared_operating_capital_sek is null from survival_funding_config where id = 1`)).toBe('t')
    })
    it('a FAILED setter leaves funding and epoch unchanged (bad actor, NaN, overflow)', () => {
      const f0 = one(dsn, `select coalesce(declared_operating_capital_sek::text, 'null') from survival_funding_config`)
      expectFailedClean(`select * from survival_set_declared_operating_capital(1000, 'machine:cron')`)
      expectFailedClean(`select * from survival_set_declared_operating_capital('NaN'::numeric, '${ACTOR}')`)
      expectFailedClean(`select * from survival_set_declared_operating_capital(1e20, '${ACTOR}')`)
      expect(one(dsn, `select coalesce(declared_operating_capital_sek::text, 'null') from survival_funding_config`)).toBe(f0)
    })
    it('its audit event is audit-only: survival_funding_events carries no M2 trigger', () => {
      expect(one(dsn, `select count(*) from pg_trigger where tgrelid = 'public.survival_funding_events'::regclass
        and tgname like 'survival_input_epoch%'`)).toBe('0')
    })
  })

  describe('revenue proof — every mutation that can change the trend moves the epoch', () => {
    it('the trend input changes and the epoch follows (insert / update / delete / upsert / truncate)', () => {
      const p = project(false)
      expectBump(`insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${p}', current_date - 1, 100)`)
      expectBump(`insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${p}', current_date, 90)`)
      expectBump(`update revenue_snapshots set mrr_sek = 130 where project_id = '${p}' and snapshot_date = current_date`)
      expectBump(`insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${p}', current_date, 140)
                  on conflict (project_id, snapshot_date) do update set mrr_sek = excluded.mrr_sek, captured_at = now()`)
      expectBump(`delete from revenue_snapshots where project_id = '${p}' and snapshot_date = current_date - 1`)
      expectRollbackClean(`truncate revenue_snapshots`)
    })
  })

  describe('project coverage proof — platform completeness follows the population, and so does the epoch', () => {
    it('a new project flips completeness to false and moves the epoch; a rename moves neither', () => {
      const all = () => query(dsn, `select id from projects`).map(r => `'${r[0]}'`).join(',')
      const complete = (ids: string) => one(dsn, `select survival_scope_is_platform_complete(array[${ids}]::uuid[])`)
      const before = all()
      expect(complete(before)).toBe('t')
      const id = one(dsn, `select gen_random_uuid()`)
      expectBump(`insert into projects (id, slug) values ('${id}', 'm2-cov-${n}')`)
      expect(complete(before)).toBe('f')
      expectNoBump(`update projects set name = 'cosmetic', slug = 'm2-cov-renamed-${n}' where id = '${id}'`)
      expect(complete(before)).toBe('f')
      expectBump(`delete from projects where id = '${id}'`)
      expect(complete(before)).toBe('t')
    })
  })

  // ── Exact coverage, introspected ──────────────────────────────────────────

  describe('exact trigger coverage in the catalog', () => {
    it('every source has its deferred bump and its TRUNCATE bump — and nothing else carries one', () => {
      const rows = query(dsn, `select c.relname, t.tgname, t.tgdeferrable::text, t.tginitdeferred::text,
          (t.tgtype & 1)::bool::text as row_level, (t.tgtype & 4)::bool::text as ins, (t.tgtype & 8)::bool::text as del,
          (t.tgtype & 16)::bool::text as upd, (t.tgtype & 32)::bool::text as trunc, (t.tgqual is not null)::text as has_when
        from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal and t.tgfoid = 'public.survival_input_epoch_bump()'::regprocedure
        order by 1, 2`).map(r => r.join('|'))
      expect(rows).toEqual([
        'cost_events|survival_input_epoch_bump|true|true|true|true|true|true|false|false',
        'cost_events|survival_input_epoch_bump_truncate|false|false|false|false|false|false|true|false',
        'platform_config|survival_input_epoch_bump|true|true|true|true|true|false|false|false',
        'platform_config|survival_input_epoch_bump_limits|true|true|true|false|false|true|false|true',
        'platform_config|survival_input_epoch_bump_truncate|false|false|false|false|false|false|true|false',
        'project_budgets|survival_input_epoch_bump|true|true|true|true|true|true|false|false',
        'project_budgets|survival_input_epoch_bump_truncate|false|false|false|false|false|false|true|false',
        'projects|survival_input_epoch_bump|true|true|true|true|true|false|false|false',
        'projects|survival_input_epoch_bump_population|true|true|true|false|false|true|false|true',
        'projects|survival_input_epoch_bump_truncate|false|false|false|false|false|false|true|false',
        'revenue_snapshots|survival_input_epoch_bump|true|true|true|true|true|true|false|false',
        'revenue_snapshots|survival_input_epoch_bump_truncate|false|false|false|false|false|false|true|false',
        'spend_reservations|survival_input_epoch_bump|true|true|true|true|true|true|false|false',
        'spend_reservations|survival_input_epoch_bump_truncate|false|false|false|false|false|false|true|false',
        'survival_funding_config|survival_input_epoch_bump|true|true|true|true|true|true|false|false',
        'survival_funding_config|survival_input_epoch_bump_truncate|false|false|false|false|false|false|true|false',
      ])
    })

    it('no BEFORE trigger on a column-sensitive source rewrites an authority column (so WHEN sees the real change)', () => {
      // The WHEN clauses compare OLD/NEW after BEFORE triggers ran, so even a rewriting BEFORE
      // trigger could not hide a change; this records that today none exists.
      const before = query(dsn, `select c.relname, p.proname from pg_trigger t join pg_class c on c.oid = t.tgrelid
          join pg_proc p on p.oid = t.tgfoid
        where not t.tgisinternal and (t.tgtype & 2) = 2 and c.relname in ('platform_config', 'projects')`)
      for (const [, fn] of before) {
        const src = one(dsn, `select prosrc from pg_proc where proname = '${fn}'`)
        expect(src, fn).not.toMatch(/new\.(id|global_\w+)\s*:=/i)
      }
    })
  })
})
