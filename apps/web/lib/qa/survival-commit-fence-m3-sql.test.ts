/**
 * Phase 3B1B2 · M3 — commit clock + self-probing Survival fence, proven on REAL
 * PostgreSQL 17 with REAL concurrent sessions.
 *
 *   - survival_clock_invalid_at(anchor): the earliest instant an observation
 *     anchored at `anchor` may stop being valid, from the canonical semantics
 *     (Stockholm day/week/month windows, the 30-minute stale rule, the 720-hour
 *     burn window). Tested at fixed timestamps — no waiting for calendars.
 *   - survival_commit_fence(vector, anchor): self-probes, last-lock shard fence,
 *     commit-time recheck, no authority write inside a fenced transaction.
 *
 * Built from the real migration chain (cost ledger, budget gate/scopes, M0,
 * Survival history + funding, M2, M3). Every two-session case proves blocking
 * with pg_stat_activity / pg_blocking_pids / pgrowlocks, never with timing, and
 * the database's deadlock counter is asserted unchanged.
 *
 * Optional: ATLAS_SQL_TEST_URL_2PC points at a server started with
 * max_prepared_transactions > 0 for the two-phase-commit proofs (REQUIRED when
 * ATLAS_SQL_TEST_REQUIRED=1).
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
const ADMIN_URL_2PC = process.env.ATLAS_SQL_TEST_URL_2PC
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
  '20261002190000_survival_input_epoch.sql',
  '20261003120000_survival_commit_fence.sql',
].map(f => join(MIGRATIONS, f))

function dsnFor(base: string, database: string, app?: string): string {
  const url = new URL(base)
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
function failure(dsn: string, sql: string): { state: string; message: string } {
  try {
    execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-X', '-q', '-d', dsn, '-c', sql],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return { state: '', message: '' }
  } catch (e) {
    const err = String((e as { stderr?: unknown }).stderr ?? '')
    return { state: /ERROR:\s+([0-9A-Z]{5}):/.exec(err)?.[1] ?? 'unknown', message: err }
  }
}
const sqlstate = (dsn: string, sql: string) => failure(dsn, sql).state

function reachable(url: string | undefined): boolean {
  if (!PSQL || !url) return false
  try { execFileSync(PSQL, ['-X', '-q', '-d', url, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 }); return true }
  catch { return false }
}
const AVAILABLE = reachable(ADMIN_URL)
const AVAILABLE_2PC = reachable(ADMIN_URL_2PC)
if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn('[survival-commit-fence-m3-sql] SKIPPED — no reachable local Postgres. M3 was NOT proven in this run.')
}

const DB = `omnira_m3_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

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

// ── Helpers ─────────────────────────────────────────────────────────────────

const parseVec = (s: string) => s.replace(/[{}]/g, '').split(',').map(Number)
const vec = (): number[] => parseVec(one(dsn, 'select survival_input_epoch_vector()'))
const vecSql = () => `'{${vec().join(',')}}'::bigint[]`
const deadlocks = () => Number(one(dsn, `select deadlocks from pg_stat_database where datname = current_database()`))
/** A recent anchor: the fence requires anchor <= clock_timestamp(). */
const RECENT = `clock_timestamp() - interval '1 second'`
const fenceSql = (vector = 'survival_input_epoch_vector()', anchor = RECENT) =>
  `select survival_commit_fence(${vector}, ${anchor})`
const invalidAt = (anchor: string) => one(dsn, `select survival_clock_invalid_at('${anchor}'::timestamptz)`)
/** PostgreSQL timestamptz text ('2026-10-03 22:00:00.123456+02') → ISO UTC (ms). */
const iso = (s: string) => new Date(s.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString()
let P = ''

/** Remove every clock-relevant row so a test controls the deadline exactly. */
function clearClockData() {
  run(dsn, ['-c', `delete from cost_events; delete from spend_reservations;`])
}

// Sessions (as M1/M2 suites).
interface Outcome { ok: boolean; out: string; stderr: string; state: string; endedAt: number }
// Commit ORDER is read from the SERVER clock (µs since epoch), never from client process exit
// times: two psql processes' teardown order is not their commit order at ms resolution.
const SERVER_US = `select (extract(epoch from clock_timestamp()) * 1000000)::bigint`
const lastUs = (r: Outcome): bigint => BigInt(r.out.split(/\r?\n/).filter(Boolean).pop() ?? '0')
function session(app: string, statements: string[]): Promise<Outcome> {
  const args = ['-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-X', '-q', '-t', '-A', '-F', '|',
    '-d', dsnFor(ADMIN_URL, DB, app), '-c', `set lock_timeout = '20s'`, '-c', `set deadlock_timeout = '200ms'`,
    ...statements.flatMap(s => ['-c', s])]
  return new Promise(resolve => {
    const child = spawn(PSQL!, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let stderr = ''
    child.stdout.on('data', c => { out += String(c) })
    child.stderr.on('data', c => { stderr += String(c) })
    child.on('close', code => resolve({
      ok: code === 0, out: out.trim(), stderr, state: /ERROR:\s+([0-9A-Z]{5}):/.exec(stderr)?.[1] ?? '', endedAt: Date.now(),
    }))
  })
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
async function holding(app: string, timeoutMs = 30_000): Promise<boolean> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (one(dsn, `select count(*) from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep'`) === '1') return true
    await sleep(50)
  }
  return false
}
async function waitingBehind(app: string, timeoutMs = 30_000): Promise<string[]> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const names = one(dsn, `select coalesce(string_agg(a.application_name, ',' order by a.application_name), '')
      from pg_stat_activity w cross join lateral unnest(pg_blocking_pids(w.pid)) b(pid) join pg_stat_activity a on a.pid = b.pid
      where w.application_name = '${app}' and w.wait_event_type = 'Lock'`)
    if (names) return names.split(',')
    await sleep(50)
  }
  return []
}
function shardLocks(app: string): Record<number, string> {
  const pid = one(dsn, `select pid from pg_stat_activity where application_name = '${app}'`)
  if (!pid) return {}
  return Object.fromEntries(query(dsn, `select s.shard_id, array_to_string(r.modes, ',')
      from public.survival_input_epoch_shards s join pgrowlocks('public.survival_input_epoch_shards') r on r.locked_row = s.ctid
     where ${pid} = any (r.pids) order by s.shard_id`).map(r => [Number(r[0]), r[1]]))
}
const costRow = () => `insert into public.cost_events (project_id, provider, cost_sek, cost_usd) values ('${P}', 'anthropic', 0.01, 0.001);`

// ── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('M3 commit clock + self-probing Survival fence (real PostgreSQL)', { timeout: 120_000 }, () => {
  const report: Record<string, unknown> = {}

  beforeAll(() => {
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${DB}`])
    dsn = dsnFor(ADMIN_URL, DB)
    run(dsn, ['-c', FIXTURE])
    for (const m of CHAIN) run(dsn, ['-f', m])
    run(dsn, ['-c', 'create extension if not exists pgrowlocks'])
    P = one(dsn, `insert into projects (slug) values ('m3') returning id`)
    run(dsn, ['-c', `insert into project_budgets (project_id, monthly_sek, daily_sek, weekly_sek) values ('${P}', 1000, 1000, 1000);
      update platform_config set global_daily_sek = 100000, global_weekly_sek = 100000, global_monthly_sek = 100000 where id = 1`])
  }, 240_000)

  afterAll(() => {
    if (Object.keys(report).length) console.info('[M3 measurements]', JSON.stringify(report))
    if (!AVAILABLE || !dsn) return
    try { run(ADMIN_URL, ['-c', `drop database if exists ${DB} with (force)`]) } catch { /* best effort */ }
  })

  it('PostgreSQL is reachable, 17.x, and max_prepared_transactions = 0 (the canonical posture)', () => {
    if (!AVAILABLE && SQL_REQUIRED) throw new Error('SQL proof is REQUIRED but no Postgres was reachable.')
    expect(one(dsn, `select current_setting('server_version_num')::int / 10000`)).toBe('17')
    expect(one(dsn, `show max_prepared_transactions`)).toBe('0')
  })

  // ── Clock validity: fixed anchors ─────────────────────────────────────────

  describe('survival_clock_invalid_at — calendar boundaries (Europe/Stockholm, DST-correct)', () => {
    beforeAll(() => { if (AVAILABLE) clearClockData() })

    it.each([
      // [anchor (UTC), expected first invalid instant (UTC), why]
      ['2026-10-03 21:59:59.999999+00', '2026-10-03T22:00:00.000Z', 'day: 1 µs before Stockholm midnight (CEST, UTC+2)'],
      ['2026-10-03 22:00:00+00', '2026-10-04T22:00:00.000Z', 'day: AT midnight the new day has begun → next midnight'],
      ['2026-10-04 21:59:59+00', '2026-10-04T22:00:00.000Z', 'week: Sunday 23:59:59 local → Monday 00:00 (ISO week start)'],
      ['2026-10-31 22:59:59+00', '2026-10-31T23:00:00.000Z', 'month: Oct 31 23:59:59 CET → Nov 1 00:00 CET'],
      ['2026-10-24 22:30:00+00', '2026-10-25T23:00:00.000Z', 'DST end: 25-hour local day (Oct 25)'],
      ['2026-03-28 23:30:00+00', '2026-03-29T22:00:00.000Z', 'DST start: 23-hour local day (Mar 29)'],
      ['2026-12-31 22:59:59+00', '2026-12-31T23:00:00.000Z', 'year end: Dec 31 23:59:59 CET → Jan 1 00:00 CET'],
    ])('%s → %s (%s)', (anchor, expected) => {
      expect(iso(invalidAt(anchor))).toBe(expected)
    })

    it('week and month boundaries are never EARLIER than the next local midnight (the day boundary dominates)', () => {
      // Every hour across a full month: the deadline is always the next Stockholm midnight.
      const rows = query(dsn, `select a, survival_clock_invalid_at(a),
          ((date_trunc('day', a at time zone 'Europe/Stockholm') + interval '1 day') at time zone 'Europe/Stockholm')
        from generate_series('2026-10-01 00:00+00'::timestamptz, '2026-11-02 00:00+00'::timestamptz, interval '1 hour') a`)
      expect(rows.length).toBeGreaterThan(700)
      expect(rows.filter(r => r[1] !== r[2])).toEqual([])
    })

    it('the session TimeZone cannot move the deadline (explicit zone, exact intervals)', () => {
      for (const tz of ['UTC', 'Europe/Stockholm', 'America/New_York', 'Asia/Tokyo']) {
        expect(one(dsn, `set timezone = '${tz}'; select extract(epoch from survival_clock_invalid_at('2026-10-24 22:30:00+00'))`), tz)
          .toBe(one(dsn, `select extract(epoch from '2026-10-25 23:00:00+00'::timestamptz)`))
      }
    })
  })

  describe('survival_clock_invalid_at — data-driven deadlines (stale rule, 720-hour burn window)', () => {
    const A = '2026-10-03 10:00:00.123456+00'
    beforeAll(() => { if (AVAILABLE) clearClockData() })

    it('stale rule: an open UNDISPATCHED reservation created 10 min before the anchor invalidates 20 min after it', () => {
      clearClockData()
      run(dsn, ['-c', `insert into spend_reservations (project_id, estimated_sek, created_at) values ('${P}', 1, '${A}'::timestamptz - interval '10 minutes')`])
      expect(iso(invalidAt(A))).toBe(iso('2026-10-03 10:20:00.123456+00'))
    })

    it('stale rule equality: created exactly 30 min before the anchor is ALREADY stale → contributes nothing', () => {
      clearClockData()
      run(dsn, ['-c', `insert into spend_reservations (project_id, estimated_sek, created_at) values ('${P}', 1, '${A}'::timestamptz - interval '30 minutes')`])
      expect(iso(invalidAt(A))).toBe('2026-10-03T22:00:00.000Z')
    })

    it('stale rule ignores dispatched and closed reservations (they are not subject to it)', () => {
      clearClockData()
      run(dsn, ['-c', `insert into spend_reservations (project_id, estimated_sek, created_at, status, resolved_at)
          values ('${P}', 1, '${A}'::timestamptz - interval '10 minutes', 'settled', '${A}'::timestamptz)`])
      expect(iso(invalidAt(A))).toBe('2026-10-03T22:00:00.000Z')
    })

    it('burn: the oldest in-window cost row ages out exactly 720 h after it was created', () => {
      clearClockData()
      run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd, created_at) values
          ('${P}', 'x', 0.01, 0.001, '${A}'::timestamptz - interval '720 hours' + interval '90 minutes'),
          ('${P}', 'x', 0.01, 0.001, '${A}'::timestamptz - interval '700 hours')`])
      expect(iso(invalidAt(A))).toBe(iso('2026-10-03 11:30:00.123456+00'))
    })

    it('burn equality: the row AT the ms-truncated cutoff is included (as the TS reader includes it) — 1 µs older is not', () => {
      clearClockData()
      // Cutoff = date_trunc(ms, anchor) - 720h = 2026-09-03 10:00:00.123+00.
      run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd, created_at) values
          ('${P}', 'x', 0.01, 0.001, '2026-09-03 10:00:00.122999+00')`])
      expect(iso(invalidAt(A))).toBe('2026-10-03T22:00:00.000Z')
      run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd, created_at) values
          ('${P}', 'x', 0.01, 0.001, '2026-09-03 10:00:00.123+00')`])
      expect(iso(invalidAt(A))).toBe(iso('2026-10-03 10:00:00.123+00'))
    })

    it('burn cutoff equals the TypeScript reader\'s cutoff exactly (720 h, ms-truncated), across DST, in any session zone', () => {
      for (const anchor of ['2026-10-24 22:30:00.987654+00', '2026-03-28 23:30:00.000001+00', A]) {
        const ts = new Date(Date.parse(iso(anchor)) - 30 * 86_400_000).toISOString()
        for (const tz of ['UTC', 'Europe/Stockholm']) {
          expect(iso(one(dsn, `set timezone = '${tz}'; select date_trunc('milliseconds', '${anchor}'::timestamptz) - interval '720 hours'`)), `${anchor} ${tz}`)
            .toBe(ts)
        }
      }
    })

    it('the deadline is the EARLIEST of all sources', () => {
      clearClockData()
      run(dsn, ['-c', `insert into spend_reservations (project_id, estimated_sek, created_at) values ('${P}', 1, '${A}'::timestamptz - interval '25 minutes');
        insert into cost_events (project_id, provider, cost_sek, cost_usd, created_at) values ('${P}', 'x', 0.01, 0.001, '${A}'::timestamptz - interval '719 hours')`])
      expect(iso(invalidAt(A))).toBe(iso('2026-10-03 10:05:00.123456+00'))  // stale (+5 min) beats burn (+1 h) and midnight
      clearClockData()
    })
  })

  // ── Fence: A–L ────────────────────────────────────────────────────────────

  describe('the fence — concurrency matrix A–L', () => {
    let dl0 = 0
    beforeAll(() => { if (AVAILABLE) { clearClockData(); dl0 = deadlocks() } })
    afterAll(() => { if (AVAILABLE) expect(deadlocks() - dl0, 'zero 40P01 across the fence matrix').toBe(0) })

    it('A. no writer: the fence locks all 8 shards FOR SHARE, returns the deadline, and commits', async () => {
      const f = session('m3_a', ['begin', fenceSql(), 'select pg_sleep(4)', 'commit'])
      expect(await holding('m3_a')).toBe(true)
      expect(shardLocks('m3_a')).toEqual(Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map(i => [i, 'For Share'])))
      const r = await f
      expect([r.ok, r.state]).toEqual([true, ''])
    })

    it('B. a writer commits BEFORE the fence: the stale vector is refused (SV004)', () => {
      const V = vecSql()
      run(dsn, ['-c', costRow()])
      expect(sqlstate(dsn, `begin; ${fenceSql(V)}; commit;`)).toBe('SV004')
    })

    it('C1. a writer in flight (uncommitted, bump pending) when the fence starts: the fence is admitted first; the writer waits for it', async () => {
      const V = vecSql()
      const w = session('m3_c1_w', ['begin', costRow(), 'select pg_sleep(6)', 'commit', SERVER_US])
      expect(await holding('m3_c1_w')).toBe(true)
      const f = session('m3_c1_f', ['begin', fenceSql(V), 'select pg_sleep(9)', SERVER_US, 'commit'])
      expect(await holding('m3_c1_f')).toBe(true)            // admitted: the writer had not committed
      expect(await waitingBehind('m3_c1_w')).toEqual(['m3_c1_f'])  // its commit-time bump waits on the fence
      const [rf, rw] = await Promise.all([f, w])
      expect([rf.ok, rw.ok]).toEqual([true, true])
      expect(lastUs(rw) > lastUs(rf)).toBe(true)              // the writer's commit returned only after the fence committed
    })

    it('C2. a writer already holding its shard (bump done, not yet committed): the fence waits, then refuses (SV004)', async () => {
      const V = vecSql()
      const w = session('m3_c2_w', ['begin', 'set constraints all immediate', costRow(), 'select pg_sleep(4)', 'commit'])
      expect(await holding('m3_c2_w')).toBe(true)
      const f = session('m3_c2_f', ['begin', fenceSql(V), 'commit'])
      expect(await waitingBehind('m3_c2_f')).toEqual(['m3_c2_w'])
      const [rw, rf] = await Promise.all([w, f])
      expect([rw.ok, rf.state]).toEqual([true, 'SV004'])
    })

    it('D. a writer committing AFTER the fence holds its shares waits until the fence commits — and until it rolls back', async () => {
      for (const end of ['commit', 'rollback']) {
        const f = session(`m3_d_${end}`, ['begin', fenceSql(), 'select pg_sleep(4)', SERVER_US, end])
        expect(await holding(`m3_d_${end}`)).toBe(true)
        const w = session(`m3_d_w_${end}`, ['begin', costRow(), 'commit', SERVER_US])
        expect(await waitingBehind(`m3_d_w_${end}`)).toEqual([`m3_d_${end}`])
        const [rf, rw] = await Promise.all([f, w])
        expect([rf.ok, rw.ok], end).toEqual([true, true])
        expect(lastUs(rw) > lastUs(rf), end).toBe(true)
      }
    })

    it('E. the clock boundary has passed before the fence: refused (SV005)', () => {
      // Anchored yesterday: its next Stockholm midnight is already behind clock_timestamp().
      expect(sqlstate(dsn, `begin; ${fenceSql(undefined, `clock_timestamp() - interval '25 hours'`)}; commit;`)).toBe('SV005')
    })

    it('F. clock still valid: accepted, and the returned deadline is in the future and equals survival_clock_invalid_at', () => {
      const out = query(dsn, `begin; select survival_commit_fence(survival_input_epoch_vector(), a), survival_clock_invalid_at(a), clock_timestamp()
        from (select clock_timestamp() - interval '1 second' a) x; commit;`)[0]
      expect(out[0]).toBe(out[1])
      expect(Date.parse(iso(out[0]))).toBeGreaterThan(Date.parse(iso(out[2])))
    })

    it('G. malformed observed vectors are refused (SV002)', () => {
      for (const v of ['null::bigint[]', `'{}'::bigint[]`, `'{0,0,0,0,0,0,0}'::bigint[]`, `'{0,0,0,0,0,0,0,0,0}'::bigint[]`,
        `'{0,0,0,0,0,0,0,null}'::bigint[]`, `'{0,0,0,0,0,0,0,-1}'::bigint[]`, `'{{0,0,0,0},{0,0,0,0}}'::bigint[]`,
        `'[0:7]={0,0,0,0,0,0,0,0}'::bigint[]`]) {
        expect(sqlstate(dsn, `begin; ${fenceSql(v)}; commit;`), v).toBe('SV002')
      }
    })

    it('H. a missing shard is refused: the M2 vector read fails closed (55000) and the fence itself refuses (SV003)', () => {
      const missing = `alter table survival_input_epoch_shards disable trigger survival_input_epoch_shards_guard;
        delete from survival_input_epoch_shards where shard_id = 5;`
      expect(sqlstate(dsn, `begin; ${missing} ${fenceSql()}; rollback;`)).toBe('55000')
      expect(sqlstate(dsn, `begin; ${missing} ${fenceSql(vecSql())}; rollback;`)).toBe('SV003')
    })

    it('J. concurrent fences share the shards: none waits on another, all commit, no deadlock', async () => {
      // A long sleep so the six spawns overlap even under full-suite load; ONE snapshot proves
      // all six are past the fence (sleeping, holding their shares) at the same instant.
      const fs = Array.from({ length: 6 }, (_, i) => session(`m3_j_${i}`, ['begin', fenceSql(), 'select pg_sleep(10)', 'commit']))
      let together = false
      for (const until = Date.now() + 30_000; !together && Date.now() < until; await sleep(50)) {
        together = one(dsn, `select count(*) from pg_stat_activity where application_name like 'm3\\_j\\_%' and wait_event = 'PgSleep'`) === '6'
      }
      expect(together, 'all six fenced transactions inside at once').toBe(true)
      const rs = await Promise.all(fs)
      expect(rs.map(r => r.state)).toEqual(rs.map(() => ''))
    })

    it('K. 16-writer M2 storm with fences firing throughout: every writer commits, fences accept or refuse cleanly, zero 40P01', async () => {
      const dl = deadlocks()
      const t0 = Date.now()
      const writers = Array.from({ length: 16 }, (_, i) => session(`m3_k_w${i}`, ['begin', costRow(),
        `update project_budgets set daily_sek = daily_sek where project_id = '${P}'`, 'select pg_sleep(0.2)', 'commit']))
      const fences: Promise<Outcome>[] = []
      for (let i = 0; i < 8; i++) {
        // Half observe early (likely stale by the time they fence), half read the vector inside the fence statement.
        const V = i % 2 === 0 ? vecSql() : undefined
        fences.push(session(`m3_k_f${i}`, ['begin', fenceSql(V), 'select pg_sleep(0.1)', 'commit']))
        await sleep(60)
      }
      const [rw, rf] = [await Promise.all(writers), await Promise.all(fences)]
      expect(rw.map(r => r.state)).toEqual(rw.map(() => ''))
      expect(rf.every(r => r.state === '' || r.state === 'SV004')).toBe(true)
      expect(deadlocks() - dl).toBe(0)
      report.stormK = { totalMs: Date.now() - t0, fencesAccepted: rf.filter(r => r.ok).length, fencesRefusedSV004: rf.filter(r => r.state === 'SV004').length }
    }, 90_000)

    it('L. a fence that rolls back leaves no trace: no intent row, no authority change', () => {
      const before = one(dsn, `select survival_input_epoch_vector()::text || '|' || (select count(*) from cost_events) || '|' || (select count(*) from spend_reservations)`)
      const xact = one(dsn, `begin; select pg_current_xact_id(); ${fenceSql()}; rollback;`).split('|')[0]
      expect(one(dsn, `select count(*) from survival_commit_fence_intents where xact = '${xact}'::xid8`)).toBe('0')
      expect(one(dsn, `select survival_input_epoch_vector()::text || '|' || (select count(*) from cost_events) || '|' || (select count(*) from spend_reservations)`)).toBe(before)
    })
  })

  // ── Commit-time and same-transaction semantics ────────────────────────────

  describe('commit-time recheck and the same-transaction rule', () => {
    beforeAll(() => { if (AVAILABLE) clearClockData() })

    it('the clock expires AFTER the fence but BEFORE commit: refused AT COMMIT (SV005), nothing commits', () => {
      clearClockData()
      run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd, created_at)
        values ('${P}', 'clock', 0.01, 0.001, clock_timestamp() - interval '720 hours' + interval '2 seconds')`])
      const f = failure(dsn, `begin; ${fenceSql()}; select pg_sleep(3); commit;`)
      expect(f.state).toBe('SV005')
      expect(f.message).toContain('expired at commit')
      clearClockData()
    })

    it('a Survival authority write AFTER the fence aborts the transaction at commit (SV006), in every source', () => {
      const writes = [costRow(), `update project_budgets set daily_sek = daily_sek + 1 where project_id = '${P}'`,
        `insert into revenue_snapshots (project_id, snapshot_date, mrr_sek) values ('${P}', current_date + 999, 1)`,
        `update platform_config set global_daily_sek = global_daily_sek + 1 where id = 1`]
      for (const w of writes) {
        const before = vec()
        expect(sqlstate(dsn, `begin; ${fenceSql()}; ${w}; commit;`), w).toBe('SV006')
        expect(vec(), w).toEqual(before)
      }
    })

    it('a Survival authority write BEFORE the fence (deferred bump) also aborts it at commit (SV006)', () => {
      expect(sqlstate(dsn, `begin; ${costRow()} ${fenceSql()}; commit;`)).toBe('SV006')
    })

    it('a write before the fence with an IMMEDIATE bump is refused AT the fence (SV006 / stale vector)', () => {
      const s = sqlstate(dsn, `begin; set constraints survival_input_epoch_bump immediate; ${costRow()} ${fenceSql()}; commit;`)
      expect(['SV006', 'SV004', 'SV007']).toContain(s)
    })

    it('forcing the commit-time recheck IMMEDIATE before the fence is detected (SV007) — by name or ALL', () => {
      expect(sqlstate(dsn, `begin; set constraints all immediate; ${fenceSql()}; commit;`)).toBe('SV007')
      expect(sqlstate(dsn, `begin; set constraints survival_commit_fence_recheck immediate; ${fenceSql()}; commit;`)).toBe('SV007')
    })

    it('a pre-set rechecked-marker cannot fake a pass: it can only make the fence refuse', () => {
      expect(sqlstate(dsn, `begin; select set_config('omnira.survival_fence_rechecked', pg_current_xact_id()::text, true); ${fenceSql()}; commit;`)).toBe('SV007')
      expect(sqlstate(dsn, `begin; select set_config('omnira.survival_fence_rechecked', 'anything', true); ${fenceSql()}; commit;`)).toBe('')
    })

    it('the fence must run at transaction TOP LEVEL: a savepoint or an EXCEPTION block is refused (SV009)', () => {
      expect(sqlstate(dsn, `begin; savepoint s; ${fenceSql()}; release s; commit;`)).toBe('SV009')
      expect(sqlstate(dsn, `do $x$ begin begin perform survival_commit_fence(survival_input_epoch_vector(), clock_timestamp() - interval '1 second');
        exception when others then raise; end; end $x$`)).toBe('SV009')
    })

    it('one fence per transaction (a second is 23505)', () => {
      expect(sqlstate(dsn, `begin; ${fenceSql()}; ${fenceSql()}; commit;`)).toBe('23505')
    })

    it('anchor in the future or missing is refused (SV008)', () => {
      expect(sqlstate(dsn, `begin; ${fenceSql(undefined, `clock_timestamp() + interval '1 minute'`)}; commit;`)).toBe('SV008')
      expect(sqlstate(dsn, `begin; ${fenceSql(undefined, 'null')}; commit;`)).toBe('SV008')
    })

    it('a read-only transaction cannot be fenced (it cannot register the commit-time recheck)', () => {
      expect(sqlstate(dsn, `begin read only; ${fenceSql()}; commit;`)).toBe('25006')
    })

    it('REPEATABLE READ: a shard updated after the snapshot makes the fence fail closed (40001)', async () => {
      const f = session('m3_rr', ['begin isolation level repeatable read', 'select 1', 'select pg_sleep(2)', fenceSql(), 'commit'])
      expect(await holding('m3_rr')).toBe(true)
      run(dsn, ['-c', costRow()])
      const r = await f
      expect(['40001', 'SV004']).toContain(r.state)
    })

    it('committed fence intents are swept by later fences without waiting', () => {
      run(dsn, ['-c', `begin; ${fenceSql()}; commit;`])
      run(dsn, ['-c', `begin; ${fenceSql()}; commit;`])
      expect(Number(one(dsn, `select count(*) from survival_commit_fence_intents`))).toBe(1)
    })
  })

  // ── Lock inventory ────────────────────────────────────────────────────────

  describe('lock inventory: the shard rows are the fence\'s last locks', () => {
    it('relation locks held by an open fenced transaction are exactly: reads (AccessShare), its own intents table, the shards (RowShare)', async () => {
      const f = session('m3_locks', ['begin', fenceSql(), 'select pg_sleep(3)', 'commit'])
      expect(await holding('m3_locks')).toBe(true)
      const locks = query(dsn, `select c.relname || ':' || string_agg(distinct l.mode, ',' order by l.mode)
          from pg_locks l join pg_class c on c.oid = l.relation join pg_stat_activity a on a.pid = l.pid
         where a.application_name = 'm3_locks' and l.locktype = 'relation' and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
         group by c.relname order by 1`).map(r => r[0])
      report.fenceLocks = locks
      expect(locks).toEqual([
        'cost_events:AccessShareLock',
        'spend_reservations:AccessShareLock',
        // its own sweep (SELECT … FOR UPDATE SKIP LOCKED) and insert, and the top-level probe read
        'survival_commit_fence_intents:AccessShareLock,RowExclusiveLock,RowShareLock',
        'survival_input_epoch_shards:AccessShareLock,RowShareLock',
      ])
      await f
    })

    it('an open writer holding cost_events rows does NOT block the fence (its reads are MVCC); only its commit waits', async () => {
      const w = session('m3_open_w', ['begin', `update cost_events set cost_usd = cost_usd where false`, costRow(), 'select pg_sleep(3)', 'commit'])
      expect(await holding('m3_open_w')).toBe(true)
      const t = Date.now()
      expect(sqlstate(dsn, `begin; ${fenceSql()}; commit;`)).toBe('')
      expect(Date.now() - t).toBeLessThan(2_500)
      await w
    })
  })

  // ── Privileges ────────────────────────────────────────────────────────────

  describe('privileges: the fence is internal; only the read-only clock and anchor are service_role-callable', () => {
    it('no client role and not service_role can execute the fence, the recheck or the guard', () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const fn of ['survival_commit_fence(bigint[], timestamptz)', 'survival_commit_fence_recheck()', 'survival_fenced_transaction_guard()']) {
          expect(one(dsn, `select has_function_privilege('${role}', 'public.${fn}', 'execute')`), `${role} ${fn}`).toBe('f')
        }
        expect(sqlstate(dsn, `set role ${role}; ${fenceSql()}`), role).toBe('42501')
      }
    })

    it('service_role may execute ONLY the anchor and the clock deadline; anon/authenticated nothing', () => {
      for (const fn of ['survival_observation_anchor()', 'survival_clock_invalid_at(timestamptz)']) {
        expect(one(dsn, `select has_function_privilege('service_role', 'public.${fn}', 'execute')`), fn).toBe('t')
        expect(one(dsn, `select has_function_privilege('anon', 'public.${fn}', 'execute')`), fn).toBe('f')
        expect(one(dsn, `select has_function_privilege('authenticated', 'public.${fn}', 'execute')`), fn).toBe('f')
      }
    })

    it('the intents table: RLS on, zero policies, no privilege for any API role', () => {
      expect(one(dsn, `select relrowsecurity from pg_class where oid = 'public.survival_commit_fence_intents'::regclass`)).toBe('t')
      expect(one(dsn, `select count(*) from pg_policies where tablename = 'survival_commit_fence_intents'`)).toBe('0')
      expect(one(dsn, `select count(*) from information_schema.role_table_grants where table_name = 'survival_commit_fence_intents'
        and grantee in ('anon','authenticated','service_role','PUBLIC')`)).toBe('0')
    })

    it('every M3 function is SECURITY DEFINER with an empty search_path', () => {
      for (const fn of ['survival_commit_fence(bigint[], timestamptz)', 'survival_commit_fence_recheck()', 'survival_fenced_transaction_guard()',
        'survival_observation_anchor()', 'survival_clock_invalid_at(timestamptz)']) {
        expect(one(dsn, `select prosecdef::text || '|' || array_to_string(proconfig, ',') from pg_proc where oid = 'public.${fn}'::regprocedure`), fn)
          .toBe('true|search_path=""')
      }
    })

    it('the anchor returns the DB clock and the M2 vector in one row', () => {
      const [anchor, v] = query(dsn, `select anchor, epoch_vector from survival_observation_anchor()`)[0]
      expect(Math.abs(Date.parse(iso(anchor)) - Date.parse(iso(one(dsn, 'select clock_timestamp()'))))).toBeLessThan(5_000)
      expect(parseVec(v)).toEqual(vec())
    })
  })

  // ── M2 unaffected for non-fenced writers ──────────────────────────────────

  describe('M2 is unchanged for every non-fenced transaction', () => {
    it('ordinary writers still bump exactly +1 per transaction, stamped with their xid8', () => {
      const before = vec()
      const out = query(dsn, `begin; ${costRow()} update project_budgets set daily_sek = daily_sek + 1 where project_id = '${P}';
        select 'x=' || pg_current_xact_id(); commit;`).map(r => r.join('|')).find(l => l.startsWith('x='))!.slice(2)
      const shard = Number(BigInt(out) % BigInt(8))
      const d = vec().map((x, i) => x - before[i])
      expect(d).toEqual(Array.from({ length: 8 }, (_, i) => (i === shard ? 1 : 0)))
      expect(one(dsn, `select last_bump_xid from survival_input_epoch_shards where shard_id = ${shard}`)).toBe(out)
    })
  })

  // ── Performance ───────────────────────────────────────────────────────────

  describe('performance (measured, local rehearsal)', () => {
    it('fence latency: 300 sequential fenced transactions, server-side timing', () => {
      const out = failure(dsn, `do $t$ declare t0 timestamptz; ms float8[] := '{}'; i int; begin
        for i in 1..300 loop
          t0 := clock_timestamp();
          perform survival_commit_fence(survival_input_epoch_vector(), clock_timestamp() - interval '1 second');
          ms := ms || extract(epoch from clock_timestamp() - t0) * 1000;
          commit;
        end loop;
        raise exception 'm3perf=%', (select round(percentile_cont(0.5) within group (order by m)::numeric, 3) || ',' ||
          round(percentile_cont(0.95) within group (order by m)::numeric, 3) || ',' || round(max(m)::numeric, 3) from unnest(ms) m)
          using errcode = 'P0001';
      end $t$`)
      const m = /m3perf=([\d.]+),([\d.]+),([\d.]+)/.exec(out.message)
      expect(m).not.toBeNull()
      report.fenceLatencyMs = { p50: Number(m![1]), p95: Number(m![2]), max: Number(m![3]) }
      expect(Number(m![1])).toBeLessThan(20)
    })

    it('M2 writer cost with the M3 shard guard present: 300 single-write transactions', () => {
      const out = failure(dsn, `do $t$ declare t0 timestamptz := clock_timestamp(); i int; begin
        for i in 1..300 loop
          insert into public.cost_events (project_id, provider, cost_sek, cost_usd) values ('${P}', 'perf', 0.01, 0.001);
          commit;
        end loop;
        raise exception 'm3w=%', round((extract(epoch from clock_timestamp() - t0) * 1000 / 300)::numeric, 3) using errcode = 'P0001';
      end $t$`)
      report.writerPerTxMs = Number(/m3w=([\d.]+)/.exec(out.message)?.[1])
      expect(report.writerPerTxMs).toBeGreaterThan(0)
    })
  })

  // ── Two-phase commit ──────────────────────────────────────────────────────

  describe.skipIf(!AVAILABLE_2PC && !SQL_REQUIRED)('two-phase commit (server with max_prepared_transactions > 0)', { timeout: 180_000 }, () => {
    const DB2 = `omnira_m3_2pc_${process.pid}`
    let dsn2 = ''
    beforeAll(() => {
      if (!AVAILABLE_2PC) return
      run(ADMIN_URL_2PC!, ['-c', `drop database if exists ${DB2} with (force)`, '-c', `create database ${DB2}`])
      dsn2 = dsnFor(ADMIN_URL_2PC!, DB2)
      run(dsn2, ['-c', FIXTURE])
      for (const m of CHAIN) run(dsn2, ['-f', m])
    }, 240_000)
    afterAll(() => {
      if (!AVAILABLE_2PC || !dsn2) return
      try { run(ADMIN_URL_2PC!, ['-c', `drop database if exists ${DB2} with (force)`]) } catch { /* best effort */ }
    })

    it('the server really has 2PC enabled', () => {
      if (!AVAILABLE_2PC && SQL_REQUIRED) throw new Error('ATLAS_SQL_TEST_URL_2PC is REQUIRED for the 2PC proofs.')
      expect(Number(one(dsn2, `show max_prepared_transactions`))).toBeGreaterThan(0)
    })

    it('WHY it matters: deferred (commit-time) triggers fire at PREPARE, not at COMMIT PREPARED — a delayed commit is invisible to them', async () => {
      run(dsn2, ['-c', `create table m3_probe_log (fired_at timestamptz);
        create table m3_probe (id int);
        create function m3_probe_fire() returns trigger language plpgsql as $f$ begin insert into m3_probe_log values (clock_timestamp()); return null; end $f$;
        create constraint trigger m3_probe_t after insert on m3_probe deferrable initially deferred for each row execute function m3_probe_fire();`])
      run(dsn2, ['-c', `begin; insert into m3_probe values (1); prepare transaction 'm3_probe_tx';`])
      const preparedAt = Date.now()
      await sleep(2_000)
      run(dsn2, ['-c', `commit prepared 'm3_probe_tx'`])
      const firedAt = Date.parse(iso(one(dsn2, `select fired_at from m3_probe_log`)))
      expect(firedAt).toBeLessThan(preparedAt + 500)   // fired at PREPARE time, ~2 s before the commit
    })

    it('therefore the fence refuses to run at all when max_prepared_transactions != 0 (SV001)', () => {
      expect(sqlstate(dsn2, `begin; select survival_commit_fence(survival_input_epoch_vector(), clock_timestamp() - interval '1 second'); commit;`)).toBe('SV001')
    })

    it('and the commit-time recheck refuses too (a fence registered on a 0-server cannot be committed on a 2PC one)', () => {
      expect(sqlstate(dsn2, `begin; alter table survival_commit_fence_intents disable trigger survival_commit_fence_recheck;
        insert into survival_commit_fence_intents values (pg_current_xact_id(), clock_timestamp(), survival_input_epoch_vector(), 'infinity', clock_timestamp());
        alter table survival_commit_fence_intents enable trigger survival_commit_fence_recheck;
        insert into survival_commit_fence_intents values ('1'::xid8, clock_timestamp(), survival_input_epoch_vector(), 'infinity', clock_timestamp());
        commit;`)).toBe('SV001')
    })
  })
})
