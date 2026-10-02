/**
 * Phase 3B1B2 · M2 — a Survival observation bound to its epoch vector, proven
 * on REAL PostgreSQL 17 against the REAL `readSurvivalSnapshot()`.
 *
 * `observeSurvivalStable()` reads V_before, the multi-statement snapshot, then
 * V_after, and accepts only V_before == V_after. These cases commit a Survival
 * authority writer from a SEPARATE session at every gap between the snapshot's
 * statements and prove each one is caught; that a stable read, a rolled-back
 * writer and a non-authority write are accepted; and that a change committed
 * after V_after is caught by the future-fence model.
 *
 * The snapshot runs through a minimal psql-backed client that implements only
 * the query-builder calls `snapshot.ts` and `funding.ts` make, executed AS
 * service_role (the production role). A hook fires before every database read,
 * which is where the interfering writer commits. The client pins the exact read
 * sequence first, so a reordering of the snapshot is noticed, not absorbed.
 */

import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => { throw new Error('the stable observation must use the injected client') },
}))

import { observeSurvivalStable, SURVIVAL_EPOCH_SHARDS } from '@/lib/atlas/survival/stable-observation'

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
  console.warn('[survival-stable-observation-m2-sql] SKIPPED — no reachable local Postgres. Set ATLAS_SQL_TEST_URL.')
}

const DB = `omnira_m2obs_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
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
      const out = execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsnFor(DB, 'm2_observer'),
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
      return name === 'budget_headroom'
        ? exec(`rpc:${name}`, `select coalesce(json_agg(r), '[]'::json) from public.${name}(${a}) r`)
        : exec(`rpc:${name}`, `select to_json(public.${name}(${a}))`)
    },
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const vec = (): number[] => one(dsn, 'select survival_input_epoch_vector()').replace(/[{}]/g, '').split(',').map(Number)
const allProjects = (): string[] => query(dsn, 'select id from projects order by id').map(r => r[0])
const AS_OF = '2026-10-02T12:00:00.000Z'

/** Commit `sql` from a SEPARATE session the first time `label` is about to be read (occurrence `nth`). */
function interfereAt(label: string, sql: string, nth = 1): { hook: Hook; fired: () => boolean; labels: string[] } {
  let seen = 0
  let fired = false
  const labels: string[] = []
  return {
    labels,
    fired: () => fired,
    hook: (l: string) => {
      labels.push(l)
      if (l === label && ++seen === nth && !fired) {
        fired = true
        run(dsnFor(DB, 'm2_writer'), ['-c', sql])
      }
    },
  }
}

/** The future commit fence, simulated: lock all 8 FOR SHARE ascending and compare. */
function fenceVerdict(observed: readonly number[]): string {
  return one(dsn, `begin; select case when (with l as (select shard_id, epoch from public.survival_input_epoch_shards
      order by shard_id for share) select array_agg(epoch order by shard_id) from l) = '{${observed.join(',')}}'::bigint[]
    then 'proceed' else 'refuse' end; commit;`)
}

const READ_SEQUENCE = [
  'rpc:survival_input_epoch_vector',          // V_before
  'rpc:budget_headroom',                      // headroom
  'from:cost_events',                         // burn (recorded)
  'from:spend_reservations',                  // burn (pending dispatched)
  'from:revenue_snapshots',                   // revenue trend
  'from:survival_funding_config',             // funding
  'rpc:survival_scope_is_platform_complete',  // runway coverage
  'from:platform_config',                     // operating pause (presentation)
  'rpc:survival_input_epoch_vector',          // V_after
]

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('M2 stable Survival observation (real PostgreSQL, real readSurvivalSnapshot)', { timeout: 120_000 }, () => {
  let p1 = ''
  let p2 = ''

  beforeAll(() => {
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${DB}`])
    dsn = dsnFor(DB)
    run(dsn, ['-c', FIXTURE])
    for (const m of CHAIN) run(dsn, ['-f', m])
    run(dsn, ['-c', `update platform_config set global_daily_sek = 100000, global_weekly_sek = 100000, global_monthly_sek = 100000 where id = 1`])
    p1 = one(dsn, `insert into projects (slug) values ('obs-1') returning id`)
    p2 = one(dsn, `insert into projects (slug) values ('obs-2') returning id`)
    run(dsn, ['-c', `insert into project_budgets (project_id, monthly_sek, daily_sek, weekly_sek)
                     values ('${p1}', 1000, 1000, 1000), ('${p2}', 1000, 1000, 1000)`])
    run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p1}', 'anthropic', 5, 0.5)`])
    run(dsn, ['-c', `insert into revenue_snapshots (project_id, snapshot_date, mrr_sek)
                     values ('${p1}', current_date - 1, 100), ('${p1}', current_date, 120)`])
    run(dsn, ['-c', `select * from survival_set_declared_operating_capital(50000, 'user:11111111-1111-4111-8111-111111111111')`])
  }, 240_000)

  afterAll(() => {
    if (!AVAILABLE || !dsn) return
    try { run(ADMIN_URL, ['-c', `drop database if exists ${DB} with (force)`]) } catch { /* best effort */ }
  })

  it('PostgreSQL is reachable — this suite must never pass by skipping in CI', () => {
    if (!AVAILABLE && SQL_REQUIRED) throw new Error('SQL proof is REQUIRED but no Postgres was reachable.')
    expect(SURVIVAL_EPOCH_SHARDS).toBe(8)
  })

  it('NO authority mutation during the read → STABLE, carrying V_after and the fixed asOf; the read order is pinned', async () => {
    const labels: string[] = []
    const r = await observeSurvivalStable(allProjects(), { db: pgClient(l => { labels.push(l) }), now: AS_OF, maxAttempts: 1 })
    expect(labels).toEqual(READ_SEQUENCE)
    expect(r.kind).toBe('STABLE')
    if (r.kind !== 'STABLE') return
    expect(r.asOf).toBe(AS_OF)
    expect(r.observation.snapshot.asOf).toBe(AS_OF)
    expect(r.observedEpochVector).toEqual(vec())
    expect(r.attempts).toBe(1)
    // The snapshot really read the database: the readings are established.
    expect(r.observation.snapshot.fundingState).toBe('KNOWN')
    expect(r.observation.snapshot.runwayCoverage).toBe('PLATFORM_COMPLETE')
  })

  // The six gaps of the multi-statement snapshot (and the internal burn gap).
  const GAPS: Array<[string, string, number, () => string]> = [
    ['1. between V_before and the first source read', 'rpc:budget_headroom', 1,
      () => `insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p1}', 'anthropic', 1, 0.1)`],
    ['2. between headroom and burn', 'from:cost_events', 1,
      () => `update project_budgets set daily_sek = daily_sek - 1 where project_id = '${p1}'`],
    ['2b. between recorded burn and pending burn', 'from:spend_reservations', 1,
      () => `select budget_reserve('${p2}'::uuid, 1::numeric, null, 'anthropic', 'obs')`],
    ['3. between burn and revenue', 'from:revenue_snapshots', 1,
      () => `update revenue_snapshots set mrr_sek = mrr_sek + 1 where project_id = '${p1}' and snapshot_date = current_date`],
    ['4. between revenue and funding', 'from:survival_funding_config', 1,
      // A NEW value each time: re-declaring the current value is a no-op that writes nothing
      // (and therefore, correctly, moves no epoch).
      () => `select * from survival_set_declared_operating_capital(${40000 + Math.floor(Math.random() * 9000)}, 'user:11111111-1111-4111-8111-111111111111')`],
    ['5. between funding and runway coverage', 'rpc:survival_scope_is_platform_complete', 1,
      () => `insert into projects (slug) values ('obs-late-${Math.random().toString(36).slice(2, 7)}')`],
    ['6. after the final source read, before V_after', 'rpc:survival_input_epoch_vector', 2,
      () => `update platform_config set global_weekly_sek = global_weekly_sek - 1 where id = 1`],
  ]

  it.each(GAPS)('%s: a committed writer makes V_before ≠ V_after → UNSTABLE, never accepted', async (_name, label, nth, sql) => {
    const before = vec()
    const i = interfereAt(label, sql(), nth)
    const r = await observeSurvivalStable(allProjects(), { db: pgClient(i.hook), now: AS_OF, maxAttempts: 1 })
    expect(i.fired()).toBe(true)
    expect(vec()).not.toEqual(before)
    expect(r).toEqual({ kind: 'UNSTABLE', asOf: AS_OF, reason: 'survival_inputs_changed_during_observation', attempts: 1 })
  })

  it.each(GAPS)('%s: with a retry budget the next attempt is STABLE, at the SAME asOf', async (_name, label, nth, sql) => {
    const i = interfereAt(label, sql(), nth)
    const r = await observeSurvivalStable(allProjects(), { db: pgClient(i.hook), now: AS_OF, maxAttempts: 2 })
    expect(i.fired()).toBe(true)
    expect(r.kind).toBe('STABLE')
    if (r.kind !== 'STABLE') return
    expect(r.attempts).toBe(2)
    expect(r.asOf).toBe(AS_OF)
    expect(r.observedEpochVector).toEqual(vec())
  })

  it('a ROLLED-BACK writer at every gap does not invalidate the observation', async () => {
    for (const [name, label, nth, sql] of GAPS) {
      const i = interfereAt(label, `begin; ${sql()}; rollback;`, nth)
      const r = await observeSurvivalStable(allProjects(), { db: pgClient(i.hook), now: AS_OF, maxAttempts: 1 })
      expect(i.fired(), name).toBe(true)
      expect(r.kind, name).toBe('STABLE')
    }
  })

  it('a NON-authority write during the read (pause toggle, project rename) does not invalidate it', async () => {
    const i = interfereAt('from:revenue_snapshots',
      `update platform_config set automation_paused = not automation_paused where id = 1;
       update projects set name = 'renamed-during-read' where id = '${p2}'`)
    const r = await observeSurvivalStable(allProjects(), { db: pgClient(i.hook), now: AS_OF, maxAttempts: 1 })
    expect(i.fired()).toBe(true)
    expect(r.kind).toBe('STABLE')
  })

  it('a change committed AFTER V_after is caught later by the future-fence model', async () => {
    const r = await observeSurvivalStable(allProjects(), { db: pgClient(() => {}), now: AS_OF, maxAttempts: 1 })
    expect(r.kind).toBe('STABLE')
    if (r.kind !== 'STABLE') return
    expect(fenceVerdict(r.observedEpochVector)).toBe('proceed')
    run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p1}', 'anthropic', 1, 0.1)`])
    expect(fenceVerdict(r.observedEpochVector)).toBe('refuse')
  })

  it('an unreadable vector is a refusal, never a silent pass (anon cannot read it)', async () => {
    const r = await observeSurvivalStable(allProjects(), { db: pgClient(() => {}, 'anon'), now: AS_OF, maxAttempts: 3 })
    expect(r).toEqual({ kind: 'UNSTABLE', asOf: AS_OF, reason: 'survival_epoch_unavailable', attempts: 1 })
  })

  it('the retry budget is bounded: a writer at EVERY attempt exhausts it and refuses', async () => {
    let n = 0
    const hook: Hook = l => {
      if (l === 'from:cost_events') {
        n += 1
        run(dsnFor(DB, 'm2_writer'), ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd) values ('${p1}', 'anthropic', 1, 0.1)`])
      }
    }
    const r = await observeSurvivalStable(allProjects(), { db: pgClient(hook), now: AS_OF, maxAttempts: 99 })
    expect(r).toEqual({ kind: 'UNSTABLE', asOf: AS_OF, reason: 'survival_inputs_changed_during_observation', attempts: 5 })
    expect(n).toBe(5)
  })
})
