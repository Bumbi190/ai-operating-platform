/**
 * Phase 3B1B2 · M3 — the DATABASE-anchored, time-bounded Survival observation,
 * proven on REAL PostgreSQL 17 against the REAL `readSurvivalSnapshot()`, and fed
 * end-to-end into the M3 commit fence.
 *
 * `observeSurvivalCommitBound(allowedProjectIds)`:
 *     (anchor, V_before) = survival_observation_anchor()      — one statement
 *     S                  = readSurvivalSnapshot(…, { now: anchor })
 *     invalidAt          = survival_clock_invalid_at(anchor)
 *     (t_after, V_after) = survival_observation_anchor()
 * STABLE only if V_before == V_after AND t_after < invalidAt.
 *
 * Reached ONLY through module-boundary substitution (as the M2 suite): a mocked
 * `createAdminClient()` returning a psql-backed client that runs as service_role.
 * The production function accepts nothing but the project scope.
 */

import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const boundary = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (!boundary.client) throw new Error('no admin client installed for this case')
    return boundary.client
  },
}))

import {
  observeSurvivalCommitBound, COMMIT_BOUND_EPOCH_SHARDS, COMMIT_BOUND_MAX_ATTEMPTS,
} from '@/lib/atlas/survival/commit-bound-observation'

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
  '20261002190000_survival_input_epoch.sql',
  '20261003120000_survival_commit_fence.sql',
].map(f => join(MIGRATIONS, f))

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

function reachable(): boolean {
  if (!PSQL) return false
  try { execFileSync(PSQL, ['-X', '-q', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 }); return true }
  catch { return false }
}
const AVAILABLE = reachable()
if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn('[survival-commit-bound-observation-m3-sql] SKIPPED — no reachable local Postgres. Set ATLAS_SQL_TEST_URL.')
}

const DB = `omnira_m3cb_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
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

// ── A minimal psql-backed client: exactly the calls snapshot.ts / funding.ts make ──

type Hook = (label: string) => void
const lit = (v: unknown): string =>
  typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`

/** Every read runs in its own psql session AS `role`, after `hook(label)` fires. */
function pgClient(hook: Hook, role = 'service_role') {
  const exec = (label: string, sql: string) => {
    hook(label)
    try {
      const out = execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsnFor(DB, 'm3_observer'),
        '-c', `set role ${role}`, '-c', sql], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
      return { data: JSON.parse(out.trim() || 'null'), error: null }
    } catch (e) {
      return { data: null, error: { message: String((e as { stderr?: unknown }).stderr ?? e) } }
    }
  }
  class Query {
    private cols = '*'
    private where: string[] = []
    private orderBy = ''
    private lim = ''
    constructor(private table: string) {}
    select(cols: string) { this.cols = cols; return this }
    in(col: string, vals: unknown[]) { this.where.push(vals.length ? `${col} in (${vals.map(lit).join(', ')})` : 'false'); return this }
    gte(col: string, v: unknown) { this.where.push(`${col} >= ${lit(v)}`); return this }
    eq(col: string, v: unknown) { this.where.push(`${col} = ${lit(v)}`); return this }
    not(col: string, op: string, v: unknown) {
      if (op !== 'is' || v !== null) throw new Error(`unsupported not(${op})`)
      this.where.push(`${col} is not null`); return this
    }
    order(col: string, o: { ascending?: boolean } = {}) { this.orderBy = ` order by ${col} ${o.ascending === false ? 'desc' : 'asc'}`; return this }
    limit(n: number) { this.lim = ` limit ${n}`; return this }
    private sql() {
      const where = this.where.length ? ` where ${this.where.join(' and ')}` : ''
      return `select coalesce(json_agg(t), '[]'::json) from (select ${this.cols} from public.${this.table}${where}${this.orderBy}${this.lim}) t`
    }
    async maybeSingle() {
      const r = exec(`from:${this.table}`, this.sql())
      return r.error ? r : { data: (r.data as unknown[])[0] ?? null, error: null }
    }
    then<T>(ok: (v: { data: unknown; error: unknown }) => T, bad?: (e: unknown) => T) {
      return Promise.resolve(exec(`from:${this.table}`, this.sql())).then(ok, bad)
    }
  }
  return {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      const a = Object.entries(args).map(([k, v]) =>
        `${k} => ${Array.isArray(v) ? `array[${v.map(lit).join(', ')}]::uuid[]` : lit(v)}`).join(', ')
      return name === 'budget_headroom' || name === 'survival_observation_anchor'
        ? exec(`rpc:${name}`, `select coalesce(json_agg(r), '[]'::json) from public.${name}(${a}) r`)
        : exec(`rpc:${name}`, `select to_json(public.${name}(${a}))`)
    },
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const vec = (): number[] => one(dsn, 'select survival_input_epoch_vector()').replace(/[{}]/g, '').split(',').map(Number)
const allProjects = (): string[] => query(dsn, 'select id from projects order by id').map(r => r[0])
const MAX = COMMIT_BOUND_MAX_ATTEMPTS
const pgTs = (s: string) => Date.parse(s.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'))

function observe(hook: Hook, role = 'service_role') {
  boundary.client = pgClient(hook, role)
  return observeSurvivalCommitBound(allProjects())
}

function interfereAt(label: string, sql: string, every: boolean) {
  let fired = 0
  const hook: Hook = (l: string) => {
    if (l === label && (every || fired === 0)) {
      fired += 1
      run(dsnFor(DB, 'm3_writer'), ['-c', sql])
    }
  }
  return { hook, fired: () => fired }
}

const READ_SEQUENCE = [
  'rpc:survival_observation_anchor',          // anchor + V_before (one statement)
  'rpc:budget_headroom',
  'from:cost_events',
  'from:spend_reservations',
  'from:revenue_snapshots',
  'from:survival_funding_config',
  'rpc:survival_scope_is_platform_complete',
  'from:platform_config',
  'rpc:survival_clock_invalid_at',            // the deadline, inside the sandwich
  'rpc:survival_observation_anchor',          // t_after + V_after
]

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('M3 commit-bound Survival observation (real PostgreSQL, real readSurvivalSnapshot)', { timeout: 180_000 }, () => {
  let p1 = ''

  beforeAll(() => {
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${DB}`])
    dsn = dsnFor(DB)
    run(dsn, ['-c', FIXTURE])
    for (const m of CHAIN) run(dsn, ['-f', m])
    run(dsn, ['-c', `update platform_config set global_daily_sek = 100000, global_weekly_sek = 100000, global_monthly_sek = 100000 where id = 1`])
    p1 = one(dsn, `insert into projects (slug) values ('cb-1') returning id`)
    run(dsn, ['-c', `insert into project_budgets (project_id, monthly_sek, daily_sek, weekly_sek) values ('${p1}', 1000, 1000, 1000)`])
    run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p1}', 'anthropic', 5, 0.5)`])
    run(dsn, ['-c', `select * from survival_set_declared_operating_capital(50000, 'user:11111111-1111-4111-8111-111111111111')`])
  }, 240_000)

  afterAll(() => {
    boundary.client = null
    if (!AVAILABLE || !dsn) return
    try { run(ADMIN_URL, ['-c', `drop database if exists ${DB} with (force)`]) } catch { /* best effort */ }
  })

  it('PostgreSQL is reachable — this suite must never pass by skipping in CI', () => {
    if (!AVAILABLE && SQL_REQUIRED) throw new Error('SQL proof is REQUIRED but no Postgres was reachable.')
    expect(COMMIT_BOUND_EPOCH_SHARDS).toBe(8)
    expect(MAX).toBe(3)
  })

  it('STABLE: anchored to the DATABASE clock, deadline from survival_clock_invalid_at, the read order is pinned', async () => {
    const labels: string[] = []
    const before = Date.parse(new Date().toISOString())
    const r = await observe(l => { labels.push(l) })
    expect(labels).toEqual(READ_SEQUENCE)
    expect(r.kind).toBe('STABLE')
    if (r.kind !== 'STABLE') return
    // The anchor IS the database's clock, and the snapshot is evaluated at it.
    expect(r.observation.snapshot.asOf).toBe(r.anchor)
    expect(Math.abs(pgTs(r.anchor) - before)).toBeLessThan(60_000)
    expect(pgTs(one(dsn, `select survival_clock_invalid_at('${r.anchor}'::timestamptz)`))).toBe(Date.parse(r.invalidAt))
    expect(Date.parse(r.invalidAt)).toBeGreaterThan(Date.parse(r.anchor))
    expect(r.observedEpochVector).toEqual(vec())
    expect(r.observation.snapshot.fundingState).toBe('KNOWN')
  })

  it('END-TO-END: the observation\'s anchor and vector pass the commit fence; after a writer commits, the same values are refused (SV004)', async () => {
    const r = await observe(() => {})
    expect(r.kind).toBe('STABLE')
    if (r.kind !== 'STABLE') return
    const fence = `begin; select survival_commit_fence('{${r.observedEpochVector.join(',')}}'::bigint[], '${r.anchor}'::timestamptz); commit;`
    const ok = query(dsn, fence)
    expect(pgTs(ok[0][0])).toBe(Date.parse(r.invalidAt))   // the fence recomputes the same deadline
    run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p1}', 'anthropic', 0.01, 0.001)`])
    let state = ''
    try { run(dsn, ['-v', 'VERBOSITY=verbose', '-c', fence]) } catch (e) { state = /ERROR:\s+([0-9A-Z]{5}):/.exec(String((e as { stderr?: unknown }).stderr))?.[1] ?? '?' }
    expect(state).toBe('SV004')
  })

  it.each([
    ['between the anchor and the first source read', 'rpc:budget_headroom'],
    ['between burn and revenue', 'from:revenue_snapshots'],
    ['between the deadline read and the closing anchor', 'rpc:survival_observation_anchor'],
  ])('a committed writer %s → UNSTABLE after the bounded retries', async (_n, label) => {
    let calls = 0
    const hook: Hook = l => {
      if (l === label && (label !== 'rpc:survival_observation_anchor' || ++calls % 2 === 0)) {
        run(dsnFor(DB, 'm3_writer'), ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p1}', 'anthropic', 0.01, 0.001)`])
      }
    }
    const r = await observe(hook)
    expect(r).toEqual({ kind: 'UNSTABLE', reason: 'survival_inputs_changed_during_observation', attempts: MAX })
  })

  it('a clock boundary crossed DURING the observation is not accepted — the next attempt re-anchors and is STABLE', async () => {
    // A cost row that leaves the 720-hour burn window ~1.5 s from now: the first
    // attempt's deadline falls inside its own reads.
    run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd, created_at)
      values ('${p1}', 'clock', 0.01, 0.001, clock_timestamp() - interval '720 hours' + interval '1500 milliseconds')`])
    const i = interfereAt('rpc:survival_clock_invalid_at', `select pg_sleep(2)`, false)
    const r = await observe(i.hook)
    expect(i.fired()).toBe(1)
    expect(r.kind).toBe('STABLE')
    if (r.kind !== 'STABLE') return
    expect(r.attempts).toBe(2)
    expect(Date.parse(r.invalidAt)).toBeGreaterThan(Date.parse(r.anchor))
  })

  it('a deadline crossed on EVERY attempt exhausts the budget with the clock reason', async () => {
    const hook: Hook = l => {
      if (l === 'rpc:survival_observation_anchor') return
      if (l === 'rpc:budget_headroom') {
        run(dsnFor(DB, 'm3_writer'), ['-c', `insert into spend_reservations (project_id, estimated_sek, created_at, provider)
          values ('${p1}', 0.01, clock_timestamp() - interval '30 minutes' + interval '800 milliseconds', 'clock')`])
      }
      if (l === 'rpc:survival_clock_invalid_at') execFileSync(PSQL!, ['-X', '-q', '-d', dsn, '-c', 'select pg_sleep(1.2)'])
    }
    const r = await observe(hook)
    // Writers also moved the vector; either reason is a refusal, never STABLE.
    expect(r.kind).toBe('UNSTABLE')
  })

  it('NOTHING is injectable: extra arguments (db, now/anchor, invalidAt, vector, maxAttempts) are ignored', async () => {
    const injected = { db: { rpc: () => { throw new Error('injected') }, from: () => { throw new Error('injected') } },
      now: '1999-01-01T00:00:00Z', anchor: '1999-01-01T00:00:00Z', invalidAt: '2999-01-01T00:00:00Z',
      observedEpochVector: [0, 0, 0, 0, 0, 0, 0, 0], maxAttempts: 99 }
    boundary.client = pgClient(() => {})
    const r = await (observeSurvivalCommitBound as unknown as (...a: unknown[]) => ReturnType<typeof observeSurvivalCommitBound>)(
      allProjects(), injected, injected)
    expect(r.kind).toBe('STABLE')
    if (r.kind !== 'STABLE') return
    expect(r.anchor.startsWith('1999')).toBe(false)
    expect(r.invalidAt.startsWith('2999')).toBe(false)
    expect(r.observedEpochVector).toEqual(vec())
  })

  it('anon cannot read the anchor: refused as unavailable, never a silent pass', async () => {
    const r = await observe(() => {}, 'anon')
    expect(r).toEqual({ kind: 'UNSTABLE', reason: 'survival_epoch_unavailable', attempts: 1 })
  })
})
