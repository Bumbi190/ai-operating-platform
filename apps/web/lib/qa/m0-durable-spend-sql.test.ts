/**
 * M0 — durable spend settlement, proven against REAL PostgreSQL.
 *
 * The invariant: after a billable provider dispatch MAY have occurred, that
 * spend never disappears from budget (and therefore Survival) authority because
 * telemetry or settlement failed. Uncertainty over-counts; it never removes
 * spend.
 *
 * The database is built from the REAL migration chain production has — the
 * cost ledger, the spend gate, budget scopes, the cost-ledger privilege fix —
 * with legacy rows seeded BEFORE M0 is applied, so the upgrade itself is part
 * of what is proven. Every assertion reads `budget_scope_state`, the one
 * definition the gate, the operator surface and Survival all share.
 *
 * Skips locally without a reachable Postgres (set ATLAS_SQL_TEST_URL); REQUIRED
 * in CI.
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

function dsnFor(database: string): string {
  const url = new URL(ADMIN_URL); url.pathname = `/${database}`; return url.toString()
}

function run(dsn: string, args: string[]): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
}

function query(dsn: string, sql: string): string[][] {
  const out = execFileSync(PSQL!,
    ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-F', '|', '-d', dsn, '-c', sql],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|'))
}

/** Run a statement expected to FAIL; returns its SQLSTATE, or '' on success. */
function sqlstateOf(dsn: string, sql: string): string {
  try {
    execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-X', '-q', '-d', dsn, '-c', sql],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return ''
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '')
    return /ERROR:\s+([0-9A-Z]{5}):/.exec(stderr)?.[1] ?? 'unknown'
  }
}

const AVAILABLE = (() => {
  if (!PSQL) return false
  try {
    execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 })
    return true
  } catch { return false }
})()

const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'

if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn('[m0-durable-spend-sql] SKIPPED — no reachable local Postgres. M0 durable settlement was NOT '
    + 'proven in this run. Set ATLAS_SQL_TEST_URL to enable it.')
}

const MIGRATIONS = join(process.cwd(), 'supabase/migrations')
const CHAIN = [
  '20260602_cost_events.sql',
  '20260830_spend_budget_gate.sql',
  '20260831_budget_scopes.sql',
  '20260910120000_cost_ledger_rls_isolation.sql',
].map(f => join(MIGRATIONS, f))
const M0 = join(MIGRATIONS, '20261001160000_m0_durable_spend_settlement.sql')

// The production shapes the chain reads, reduced to what it touches. The default
// ACL reproduces production's: a new public table is fully granted to every
// client role until a migration says otherwise — which is exactly the
// spend_reservations exposure M0 closes.
const FIXTURE = `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role')  then begin create role service_role;  exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then begin create role anon;          exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then begin create role authenticated; exception when duplicate_object or unique_violation then null; end; end if;
end $$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
  $u$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $u$;
create table public.projects (
  id uuid primary key default gen_random_uuid(), slug text unique not null, owner_id uuid);
create table public.project_budgets (
  project_id uuid primary key references public.projects(id) on delete cascade,
  monthly_sek numeric(12,4) not null, updated_at timestamptz not null default now());
create table public.platform_config (
  id int primary key, automation_paused boolean not null default false,
  max_daily_renders int not null default 4, max_retry_attempts int not null default 3,
  paused_at timestamptz, paused_reason text, updated_at timestamptz not null default now());
insert into public.platform_config (id) values (1);
create table public.infra_costs (id uuid primary key default gen_random_uuid());
`

const DB_NAME = `omnira_m0_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

// ── Helpers ──────────────────────────────────────────────────────────────────

let n = 0
/** A fresh project with a 1000 SEK ceiling on every scope. Isolates each case. */
function project(): string {
  n += 1
  return query(dsn, `
    with p as (insert into projects (slug) values ('m0-${n}-${Math.random().toString(36).slice(2, 7)}') returning id)
    insert into project_budgets (project_id, monthly_sek, daily_sek, weekly_sek)
      select id, 1000, 1000, 1000 from p returning project_id`)[0][0]
}

/** Remaining project-monthly headroom: the canonical `limit - spent - held`. */
function remaining(pid: string): number {
  return Number(query(dsn,
    `select remaining_sek from budget_scope_state('${pid}'::uuid, 30) where scope = 'project_monthly'`)[0][0])
}

function reserve(pid: string, est: number, key: string | null = null): string {
  const r = query(dsn, `select allowed, reservation_id, reason from budget_reserve('${pid}'::uuid, ${est}::numeric,
    ${key ? `'${key}'` : 'null'}, 'anthropic', 'messages.create')`)[0]
  expect(r[0]).toBe('t')
  return r[1]
}

const TOKEN = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`

function mark(rid: string, token: string): string {
  return query(dsn, `select budget_mark_dispatch_intent('${rid}'::uuid, '${token}'::uuid, 'token_window')`)[0][0]
}

function meteredRows(...amounts: number[]): string {
  return JSON.stringify(amounts.map(sek => ({
    provider: 'anthropic', model: 'claude-test', unit_type: 'tokens', units: 100,
    tokens_in: 60, tokens_out: 40, cost_usd: Number((sek / 10.5).toFixed(6)), cost_sek: sek,
    metadata: { probe: true },
  })))
}

function settle(rid: string, token: string, kind: string, rows = '[]'): string[] {
  return query(dsn, `select result, settled_sek, ceiling_sek, ceiling_exceeded
    from budget_settle_recorded('${rid}'::uuid, '${token}'::uuid, '${kind}', '${rows}'::jsonb)`)[0]
}

function reservation(rid: string): Record<string, string> {
  const [r] = query(dsn, `select status, coalesce(dispatched_at::text,''), coalesce(settlement_kind,''),
      coalesce(release_basis,''), coalesce(actual_sek::text,''), coalesce(ceiling_exceeded::text,'')
    from spend_reservations where id = '${rid}'`)
  return { status: r[0], dispatched: r[1], kind: r[2], basis: r[3], actual: r[4], exceeded: r[5] }
}

function linked(rid: string): { count: number; sum: number; kinds: string } {
  const [r] = query(dsn, `select count(*), coalesce(sum(cost_sek),0), coalesce(string_agg(distinct settlement_kind, ','),'')
    from cost_events where reservation_id = '${rid}'`)
  return { count: Number(r[0]), sum: Number(r[1]), kinds: r[2] }
}

/** Age a reservation as the table owner would see it after `minutes` (test-only clock travel). */
function age(rid: string, minutes: number) {
  run(dsn, ['-c', `
    alter table spend_reservations disable trigger spend_reservations_guard_transition;
    update spend_reservations set created_at = created_at - interval '${minutes} minutes',
      dispatched_at = dispatched_at - interval '${minutes} minutes' where id = '${rid}';
    alter table spend_reservations enable trigger spend_reservations_guard_transition;`])
}

/**
 * Place a reservation's created_at/dispatched_at at a LOCAL (Europe/Stockholm)
 * instant given as a SQL expression over `now()` — equivalent to the clock
 * advancing past that boundary.
 */
function placeAt(rid: string, localExpr: string) {
  run(dsn, ['-c', `
    alter table spend_reservations disable trigger spend_reservations_guard_transition;
    update spend_reservations
       set created_at = (${localExpr}) at time zone 'Europe/Stockholm',
           dispatched_at = case when dispatched_at is null then null
                                else (${localExpr}) at time zone 'Europe/Stockholm' end
     where id = '${rid}';
    alter table spend_reservations enable trigger spend_reservations_guard_transition;`])
}

/** held and remaining for all six scopes, keyed by scope. */
function scopes(pid: string): Record<string, { held: number; remaining: number }> {
  return Object.fromEntries(query(dsn, `select scope, held_sek, remaining_sek
    from budget_scope_state('${pid}'::uuid, 30)`).map(([scope, held, rem]) =>
    [scope, { held: Number(held), remaining: Number(rem) }]))
}

const SIX = ['project_daily', 'project_weekly', 'project_monthly', 'global_daily', 'global_weekly', 'global_monthly']
const LOCAL_NOW = `now() at time zone 'Europe/Stockholm'`
const BOUNDARIES: Array<[string, string]> = [
  ['daily',   `date_trunc('day', ${LOCAL_NOW}) - interval '1 second'`],
  ['weekly',  `date_trunc('week', ${LOCAL_NOW}) - interval '1 second'`],
  ['monthly', `date_trunc('month', ${LOCAL_NOW}) - interval '1 second'`],
  ['all three, long ago', `date_trunc('month', ${LOCAL_NOW}) - interval '90 days'`],
]

function sessionAs(role: string, sql: string): string {
  return sqlstateOf(dsn, `set role ${role}; ${sql}`)
}

/** One psql session holding a transaction open for `holdMs` after `sql`. */
function background(sql: string, holdMs: number): Promise<string> {
  const body = `begin; ${sql}; select pg_sleep(${holdMs / 1000}); commit;`
  return new Promise((resolve, reject) => {
    const p = spawn(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', body],
      { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { err += d })
    p.on('close', code => resolve(code === 0 ? out.trim() : `ERROR ${err.trim()}`))
    p.on('error', reject)
  })
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('M0 durable spend settlement (real PostgreSQL)', () => {
  let legacyProject = ''
  let legacySettled = ''
  let legacyCostRows = 0

  beforeAll(() => {
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${DB_NAME}`])
    dsn = dsnFor(DB_NAME)
    run(dsn, ['-c', FIXTURE])
    for (const m of CHAIN) run(dsn, ['-f', m])
    run(dsn, ['-c', `update platform_config set global_daily_sek = 100000, global_weekly_sek = 100000,
                       global_monthly_sek = 100000 where id = 1`])

    // ── Legacy rows, written BEFORE M0 exists, exactly as production has them.
    legacyProject = project()
    legacySettled = reserve(legacyProject, 5)
    run(dsn, ['-c', `select budget_settle('${legacySettled}'::uuid, 5)`])           // pre-M0 cost-less settle
    run(dsn, ['-c', `insert into cost_events (project_id, provider, cost_sek, cost_usd)
                     values ('${legacyProject}', 'anthropic', 5, 0.47), (null, 'openai', 1, 0.09)`])
    legacyCostRows = Number(query(dsn, `select count(*) from cost_events`)[0][0])

    run(dsn, ['-f', M0])                                                             // the upgrade
  }, 180_000)

  afterAll(() => {
    if (!AVAILABLE || !dsn) return
    try { run(ADMIN_URL, ['-c', `drop database if exists ${DB_NAME} with (force)`]) } catch { /* best effort */ }
  })

  it('PostgreSQL is reachable — this suite must never pass by skipping in CI', () => {
    if (!AVAILABLE && SQL_REQUIRED) {
      throw new Error('SQL proof is REQUIRED (CI=true or ATLAS_SQL_TEST_REQUIRED=1) but no Postgres was reachable.')
    }
    expect(AVAILABLE).toBe(true)
  })

  // ── Legacy ─────────────────────────────────────────────────────────────────

  describe('legacy rows survive the upgrade unchanged', () => {
    it('pre-M0 cost rows stay valid, unlinked and counted', () => {
      expect(Number(query(dsn, `select count(*) from cost_events`)[0][0])).toBeGreaterThanOrEqual(legacyCostRows)
      expect(query(dsn, `select count(*) from cost_events where reservation_id is not null
                           and created_at < (select min(created_at) from spend_reservations where dispatched_at is not null)`)[0]?.[0] ?? '0')
        .toBe('0')
      // 1000 − 5 (the legacy cost row); the legacy settled reservation holds nothing.
      expect(remaining(legacyProject)).toBe(995)
    })

    it('a pre-M0 cost-less settlement is NOT back-filled with a fabricated link', () => {
      expect(reservation(legacySettled)).toMatchObject({ status: 'settled', kind: '', dispatched: '' })
      expect(linked(legacySettled).count).toBe(0)
    })

    it('the best-effort logger may still write legacy rows (no reservation link)', () => {
      const p = project()
      expect(sessionAs('service_role', `insert into cost_events (project_id, provider, cost_sek, cost_usd)
        values ('${p}', 'elevenlabs', 2, 0.19)`)).toBe('')
      expect(remaining(p)).toBe(998)
    })
  })

  // ── The motivating failure ────────────────────────────────────────────────

  describe('the four-step failure that motivated M0', () => {
    it('reserve → dispatch → cost persistence fails → recovery: headroom NEVER exceeds its pre-dispatch value', () => {
      const p = project()
      const before = remaining(p)                                 // 1000
      const rid = reserve(p, 40)                                  // 1. allowed
      expect(mark(rid, TOKEN(1))).toBe('t')                       // 2. provider may be charged
      expect(remaining(p)).toBe(before - 40)
      // 3. cost persistence fails — a payload the boundary refuses (NaN amount)
      expect(sqlstateOf(dsn, `select * from budget_settle_recorded('${rid}'::uuid, '${TOKEN(1)}'::uuid,
        'metered', '[{"cost_sek":"NaN","cost_usd":0}]'::jsonb)`)).toBe('22023')
      expect(reservation(rid).status).toBe('open')
      expect(linked(rid).count).toBe(0)
      expect(remaining(p)).toBe(before - 40)                      // still held
      // ...and the pre-M0 cost-less settle can no longer remove it
      expect(sqlstateOf(dsn, `select budget_settle('${rid}'::uuid, 40)`)).toBe('0A000')
      expect(remaining(p)).toBe(before - 40)
      // 4. time passes beyond the stale window, then recovery
      age(rid, 120)
      expect(remaining(p)).toBe(before - 40)                      // a dispatched reservation never goes stale
      expect(Number(query(dsn, `select budget_reconcile_dispatched(interval '1 hour', 100)`)[0][0])).toBeGreaterThanOrEqual(1)
      expect(reservation(rid)).toMatchObject({ status: 'settled', kind: 'estimate_reconciled', actual: '40.0000' })
      expect(linked(rid)).toEqual({ count: 1, sum: 40, kinds: 'estimate_reconciled' })
      expect(remaining(p)).toBe(before - 40)                      // never larger than before dispatch
    })
  })

  // ── Lifecycle cases ───────────────────────────────────────────────────────

  describe('settlement outcomes', () => {
    it('normal provider success: metered rows and the status flip are one act', () => {
      const p = project()
      const rid = reserve(p, 30)
      mark(rid, TOKEN(2))
      expect(settle(rid, TOKEN(2), 'metered', meteredRows(12))).toEqual(['settled', '12.0000', '30.0000', 'f'])
      expect(reservation(rid)).toMatchObject({ status: 'settled', kind: 'metered', exceeded: 'false' })
      expect(linked(rid)).toEqual({ count: 1, sum: 12, kinds: 'metered' })
      expect(remaining(p)).toBe(1000 - 12)
    })

    it('actual EQUAL to the estimate', () => {
      const p = project()
      const rid = reserve(p, 30); mark(rid, TOKEN(3))
      expect(settle(rid, TOKEN(3), 'metered', meteredRows(30))[3]).toBe('f')
      expect(remaining(p)).toBe(970)
    })

    it('metered ABOVE the hard ceiling (a broken bound proof) is recorded at the real figure and flagged', () => {
      const p = project()
      const rid = reserve(p, 30); mark(rid, TOKEN(4))
      expect(settle(rid, TOKEN(4), 'metered', meteredRows(45))).toEqual(['settled', '45.0000', '30.0000', 't'])
      expect(reservation(rid).exceeded).toBe('true')
      expect(remaining(p)).toBe(955)                              // the real figure, not the estimate
    })

    it('1 reservation : N metered rows settles once, summed, with no unique index needed', () => {
      const p = project()
      const rid = reserve(p, 30); mark(rid, TOKEN(5))
      expect(settle(rid, TOKEN(5), 'metered', meteredRows(4, 6))[1]).toBe('10.0000')
      expect(linked(rid)).toEqual({ count: 2, sum: 10, kinds: 'metered' })
    })

    it('ambiguous provider failure: never released, accounted at the reserved upper bound, labelled as such', () => {
      const p = project()
      const rid = reserve(p, 25); mark(rid, TOKEN(6))
      expect(settle(rid, TOKEN(6), 'estimate_ambiguous')).toEqual(['settled', '25.0000', '25.0000', 'f'])
      const [row] = query(dsn, `select unit_type, metadata->>'settlement' from cost_events where reservation_id = '${rid}'`)
      expect(row).toEqual(['requests', 'reserved_upper_bound'])
      expect(remaining(p)).toBe(975)
    })

    it('a late metered result after an estimate settlement cannot double-count', () => {
      const p = project()
      const rid = reserve(p, 25); mark(rid, TOKEN(7))
      settle(rid, TOKEN(7), 'estimate_ambiguous')
      expect(settle(rid, TOKEN(7), 'metered', meteredRows(9))[0]).toBe('already_settled')
      expect(linked(rid)).toEqual({ count: 1, sum: 25, kinds: 'estimate_ambiguous' })
      expect(remaining(p)).toBe(975)
    })

    it('successful call with no usage figure: estimate_unmetered at the upper bound', () => {
      const p = project()
      const rid = reserve(p, 8); mark(rid, TOKEN(8))
      expect(settle(rid, TOKEN(8), 'estimate_unmetered')[0]).toBe('settled')
      expect(linked(rid).kinds).toBe('estimate_unmetered')
      expect(remaining(p)).toBe(992)
    })

    it('ProviderNotDispatchedError / governance refusal after intent: release ONLY with the dispatcher token', () => {
      const p = project()
      const rid = reserve(p, 20); mark(rid, TOKEN(9))
      expect(query(dsn, `select budget_release_undispatched('${rid}'::uuid, '${TOKEN(99)}'::uuid)`)[0][0]).toBe('0')
      expect(reservation(rid).status).toBe('open')
      expect(query(dsn, `select budget_release_undispatched('${rid}'::uuid, '${TOKEN(9)}'::uuid)`)[0][0]).toBe('1')
      expect(reservation(rid)).toMatchObject({ status: 'released', basis: 'proven_not_dispatched' })
      expect(remaining(p)).toBe(1000)
    })

    it('the plain release cannot touch a reservation with dispatch intent (returns 0, keeps counting)', () => {
      const p = project()
      const rid = reserve(p, 20); mark(rid, TOKEN(10))
      expect(query(dsn, `select budget_release('${rid}'::uuid)`)[0][0]).toBe('0')
      expect(reservation(rid).status).toBe('open')
      expect(remaining(p)).toBe(980)
    })

    it('release before dispatch intent is unchanged', () => {
      const p = project()
      const rid = reserve(p, 20)
      expect(query(dsn, `select budget_release('${rid}'::uuid)`)[0][0]).toBe('1')
      expect(reservation(rid)).toMatchObject({ status: 'released', basis: 'not_dispatched' })
      expect(remaining(p)).toBe(1000)
    })

    it('crash after intent, before OR after the provider: counted until reconciled, never released', () => {
      const p = project()
      const rid = reserve(p, 33); mark(rid, TOKEN(11))
      age(rid, 600)                                              // ten hours: far beyond the stale window
      expect(remaining(p)).toBe(967)
      // too young for a 24 h reconciler: it is left alone, still counted
      query(dsn, `select budget_reconcile_dispatched()`)
      expect(reservation(rid).status).toBe('open')
      expect(remaining(p)).toBe(967)
      age(rid, 24 * 60)
      query(dsn, `select budget_reconcile_dispatched()`)
      expect(reservation(rid)).toMatchObject({ status: 'settled', kind: 'estimate_reconciled' })
      expect(remaining(p)).toBe(967)
    })

    it('settlement rollback leaves the reservation open, unlinked and counted', () => {
      const p = project()
      const rid = reserve(p, 15); mark(rid, TOKEN(12))
      run(dsn, ['-c', `begin; select * from budget_settle_recorded('${rid}'::uuid, '${TOKEN(12)}'::uuid,
        'metered', '${meteredRows(5)}'::jsonb); rollback;`])
      expect(reservation(rid).status).toBe('open')
      expect(linked(rid).count).toBe(0)
      expect(remaining(p)).toBe(985)
    })
  })

  // ── Staleness ─────────────────────────────────────────────────────────────

  describe('staleness', () => {
    it('a STALE UNDISPATCHED reservation still ages out (canonical meaning unchanged)', () => {
      const p = project()
      const rid = reserve(p, 50)
      expect(remaining(p)).toBe(950)
      age(rid, 31)
      expect(remaining(p)).toBe(1000)
    })

    it('a STALE DISPATCHED reservation keeps counting', () => {
      const p = project()
      const rid = reserve(p, 50); mark(rid, TOKEN(13))
      age(rid, 31)
      expect(remaining(p)).toBe(950)
    })

    it('replay of a key whose reservation is stale but DISPATCHED is in-flight — never released', () => {
      const p = project()
      const key = `m0-replay-${Math.random().toString(36).slice(2)}`
      const rid = reserve(p, 50, key); mark(rid, TOKEN(14))
      age(rid, 31)
      const [r] = query(dsn, `select allowed, reason from budget_reserve('${p}'::uuid, 50, '${key}', 'anthropic', 'messages.create')`)
      expect(r).toEqual(['f', 'replay_in_flight'])
      expect(reservation(rid).status).toBe('open')
      expect(remaining(p)).toBe(950)
    })

    it('replay of a stale UNDISPATCHED key is still released as before', () => {
      const p = project()
      const key = `m0-replay-u-${Math.random().toString(36).slice(2)}`
      const rid = reserve(p, 50, key)
      age(rid, 31)
      const [r] = query(dsn, `select allowed, reason from budget_reserve('${p}'::uuid, 50, '${key}', 'anthropic', 'messages.create')`)
      expect(r).toEqual(['f', 'replay_stale'])
      expect(reservation(rid)).toMatchObject({ status: 'released', basis: 'replay_stale_undispatched' })
    })
  })

  // ── Review finding 1: budget-window rollover ─────────────────────────────

  describe('window rollover (review finding 1): unsettled dispatched spend never leaves current authority', () => {
    for (const [name, at] of BOUNDARIES) {
      it(`crossing the ${name} boundary with NO settlement and NO reconciler keeps the hold in all six scopes`, () => {
        const p = project()
        const base = scopes(p)        // global scopes also hold OTHER projects' unsettled dispatches
        const rid = reserve(p, 30); mark(rid, TOKEN(60 + name.length))
        placeAt(rid, at)
        const s = scopes(p)
        for (const scope of SIX) expect(s[scope]?.held, scope).toBe(base[scope].held + 30)
        expect(s.project_monthly.remaining).toBe(970)
        expect(linked(rid).count).toBe(0)                       // no cost event exists — it is held, not spent
        expect(reservation(rid).status).toBe('open')
      })
    }

    it('an UNDISPATCHED reservation is unchanged: it leaves the window it was created in', () => {
      const p = project()
      const rid = reserve(p, 30)
      placeAt(rid, BOUNDARIES[0][1])
      const s = scopes(p)
      expect(s.project_daily.held).toBe(0)
    })

    it('a live settlement long after the boundary moves held → spent with no instant at which it counts nowhere', () => {
      const p = project()
      const rid = reserve(p, 30); mark(rid, TOKEN(70))
      placeAt(rid, BOUNDARIES[3][1])                             // dispatched three months ago
      const before = scopes(p)
      settle(rid, TOKEN(70), 'metered', meteredRows(12))       // lower than the ceiling
      const after = scopes(p)
      for (const scope of SIX) {
        expect(before[scope].held - after[scope].held, scope).toBe(30)
        expect(after[scope].remaining, scope).toBe(before[scope].remaining + 30 - 12)   // the spend lands NOW
      }
    })

    it('the reconciler after a rollover moves the ceiling from held to spent in the current window', () => {
      const p = project()
      const rid = reserve(p, 30); mark(rid, TOKEN(71))
      placeAt(rid, BOUNDARIES[3][1])
      const before = scopes(p)
      query(dsn, `select budget_reconcile_dispatched()`)
      const after = scopes(p)
      for (const scope of SIX) expect(after[scope].remaining, scope).toBe(before[scope].remaining)
      expect(linked(rid)).toEqual({ count: 1, sum: 30, kinds: 'estimate_reconciled' })
    })
  })

  // ── Review finding 2: the held amount is a hard ceiling ──────────────────

  describe('hard ceiling (review finding 2): a lost settlement can only over-count', () => {
    it('actual 45 known under a 50 SEK ceiling, settlement lost, process gone → the reconciler records 50 ≥ 45', () => {
      const p = project()
      const rid = reserve(p, 50); mark(rid, TOKEN(80))
      // the real usage (45) became known and the settlement began — then the process died
      run(dsn, ['-c', `begin; select * from budget_settle_recorded('${rid}'::uuid, '${TOKEN(80)}'::uuid,
        'metered', '${meteredRows(45)}'::jsonb); rollback;`])
      expect(reservation(rid).status).toBe('open')
      expect(remaining(p)).toBe(950)                             // held at the ceiling meanwhile
      age(rid, 25 * 60)
      query(dsn, `select budget_reconcile_dispatched()`)
      expect(linked(rid)).toEqual({ count: 1, sum: 50, kinds: 'estimate_reconciled' })
      expect(remaining(p)).toBe(950)                             // ≥ the 45 that was really known
    })

    it('Atlas TTS (tts-1): the migration seeds the canonical rate, and a 600-char reservation settles at exactly 0.0945 SEK', () => {
      const [rate, note] = query(dsn, `select value, note from cost_rates where key = 'openai_tts_1_usd_per_1k_chars'`)[0]
      expect(Number(rate)).toBe(0.015)
      expect(note).toMatch(/tts-1/)
      expect(query(dsn, `select count(*) from cost_rates where key ilike '%4o_mini_tts%' or key ilike '%4o-mini-tts%'`)[0][0]).toBe('0')
      const p = project()
      const ceiling = (600 / 1000) * 0.015 * 10.5                   // chars × canonical rate × usd_sek
      const rid = reserve(p, ceiling)
      expect(query(dsn, `select budget_mark_dispatch_intent('${rid}'::uuid, '${TOKEN(82)}'::uuid, 'fixed_units')`)[0][0]).toBe('t')
      expect(settle(rid, TOKEN(82), 'estimate_unmetered')).toEqual(['settled', '0.0945', '0.0945', 'f'])
      expect(linked(rid)).toEqual({ count: 1, sum: 0.0945, kinds: 'estimate_unmetered' })
    })

    it('dispatch intent REQUIRES a ceiling basis, records it, and never lets it change', () => {
      const p = project()
      const rid = reserve(p, 10)
      expect(sqlstateOf(dsn, `select budget_mark_dispatch_intent('${rid}'::uuid, '${TOKEN(81)}'::uuid, null)`)).toBe('22023')
      expect(sqlstateOf(dsn, `select budget_mark_dispatch_intent('${rid}'::uuid, '${TOKEN(81)}'::uuid, 'a_guess')`)).toBe('22023')
      expect(reservation(rid).dispatched).toBe('')
      expect(query(dsn, `select budget_mark_dispatch_intent('${rid}'::uuid, '${TOKEN(81)}'::uuid, 'fixed_units')`)[0][0]).toBe('t')
      expect(query(dsn, `select ceiling_basis from spend_reservations where id = '${rid}'`)[0][0]).toBe('fixed_units')
      expect(sqlstateOf(dsn, `update spend_reservations set ceiling_basis = 'token_window' where id = '${rid}'`)).toBe('55000')
      expect(sqlstateOf(dsn, `alter table spend_reservations disable trigger spend_reservations_guard_transition;
        update spend_reservations set ceiling_basis = null where id = '${rid}'`)).toBe('23514')
      run(dsn, ['-c', 'alter table spend_reservations enable trigger spend_reservations_guard_transition'])
    })
  })

  // ── Structural invariants ─────────────────────────────────────────────────

  describe('structural invariants', () => {
    it('a reservation cannot become settled without its linked spend rows (commit-time constraint)', () => {
      const p = project()
      const rid = reserve(p, 10); mark(rid, TOKEN(15))
      // Even as the table owner, bypassing every function.
      expect(sqlstateOf(dsn, `update spend_reservations set status = 'settled', actual_sek = 10 where id = '${rid}'`))
        .toBe('23514')
      expect(sqlstateOf(dsn, `begin; set constraints all immediate;
        update spend_reservations set status = 'settled', actual_sek = 10 where id = '${rid}'; commit;`)).toBe('23514')
      expect(reservation(rid).status).toBe('open')
    })

    it('settled rows must add up to actual_sek', () => {
      const p = project()
      const rid = reserve(p, 10); mark(rid, TOKEN(16))
      expect(sqlstateOf(dsn, `begin;
        insert into cost_events (project_id, provider, cost_sek, cost_usd, reservation_id, settlement_kind)
          values ('${p}', 'anthropic', 3, 0.3, '${rid}', 'metered');
        update spend_reservations set status = 'settled', actual_sek = 9 where id = '${rid}'; commit;`)).toBe('23514')
      expect(linked(rid).count).toBe(0)
    })

    it('released after dispatch intent requires the proven-not-dispatched basis', () => {
      const p = project()
      const rid = reserve(p, 10); mark(rid, TOKEN(17))
      expect(sqlstateOf(dsn, `update spend_reservations set status = 'released' where id = '${rid}'`)).toBe('23514')
      expect(sqlstateOf(dsn, `update spend_reservations set status = 'released', release_basis = 'not_dispatched'
        where id = '${rid}'`)).toBe('23514')
    })

    it('terminal states are terminal and dispatch intent is set once', () => {
      const p = project()
      const rid = reserve(p, 10); mark(rid, TOKEN(18))
      expect(mark(rid, TOKEN(18))).toBe('t')                    // idempotent for the same dispatcher
      expect(mark(rid, TOKEN(19))).toBe('f')                    // refused for any other
      expect(sqlstateOf(dsn, `update spend_reservations set dispatch_token = '${TOKEN(19)}' where id = '${rid}'`)).toBe('55000')
      settle(rid, TOKEN(18), 'estimate_unmetered')
      expect(sqlstateOf(dsn, `update spend_reservations set status = 'open' where id = '${rid}'`)).toBe('55000')
      expect(mark(rid, TOKEN(18))).toBe('f')
    })

    it('a settled reservation can never gain a second amount', () => {
      const p = project()
      const rid = reserve(p, 10); mark(rid, TOKEN(20))
      settle(rid, TOKEN(20), 'metered', meteredRows(4))
      expect(sqlstateOf(dsn, `insert into cost_events (project_id, provider, cost_sek, cost_usd, reservation_id, settlement_kind)
        values ('${p}', 'anthropic', 4, 0.4, '${rid}', 'metered')`)).toBe('55000')
      expect(linked(rid)).toEqual({ count: 1, sum: 4, kinds: 'metered' })
    })

    it('settlement needs the dispatcher token; a released reservation cannot be settled', () => {
      const p = project()
      const rid = reserve(p, 10); mark(rid, TOKEN(21))
      expect(sqlstateOf(dsn, `select * from budget_settle_recorded('${rid}'::uuid, '${TOKEN(22)}'::uuid, 'estimate_unmetered')`)).toBe('42501')
      query(dsn, `select budget_release_undispatched('${rid}'::uuid, '${TOKEN(21)}'::uuid)`)
      expect(sqlstateOf(dsn, `select * from budget_settle_recorded('${rid}'::uuid, '${TOKEN(21)}'::uuid, 'estimate_unmetered')`)).toBe('55000')
    })

    it('settlement payload shape is enforced', () => {
      const p = project()
      const rid = reserve(p, 10); mark(rid, TOKEN(23))
      const call = (kind: string, rows: string) =>
        sqlstateOf(dsn, `select * from budget_settle_recorded('${rid}'::uuid, '${TOKEN(23)}'::uuid, '${kind}', '${rows}'::jsonb)`)
      expect(call('metered', '[]')).toBe('22023')
      expect(call('estimate_ambiguous', meteredRows(1))).toBe('22023')
      expect(call('estimate_reconciled', '[]')).toBe('22023')
      expect(call('metered', '[{"cost_sek":-1,"cost_usd":0}]')).toBe('22023')
      expect(reservation(rid).status).toBe('open')
    })

    it('settlement rows are immutable and cannot be deleted directly', () => {
      const p = project()
      const rid = reserve(p, 10); mark(rid, TOKEN(24))
      settle(rid, TOKEN(24), 'metered', meteredRows(4))
      expect(sqlstateOf(dsn, `update cost_events set cost_sek = 0 where reservation_id = '${rid}'`)).toBe('55000')
      expect(sqlstateOf(dsn, `delete from cost_events where reservation_id = '${rid}'`)).toBe('55000')
    })

    it('client roles cannot write reservations or forge settlement columns', () => {
      const p = project()
      const rid = reserve(p, 10); mark(rid, TOKEN(25))
      for (const role of ['service_role', 'authenticated', 'anon']) {
        expect(sessionAs(role, `update spend_reservations set status = 'released' where id = '${rid}'`)).toBe('42501')
        expect(sessionAs(role, `insert into spend_reservations (project_id, estimated_sek) values ('${p}', 1)`)).toBe('42501')
      }
      expect(sessionAs('service_role', `insert into cost_events (project_id, provider, cost_sek, cost_usd, reservation_id, settlement_kind)
        values ('${p}', 'x', 1, 0.1, '${rid}', 'metered')`)).toBe('42501')
      expect(sessionAs('service_role', `update cost_events set reservation_id = '${rid}', settlement_kind = 'metered'
        where reservation_id is null`)).toBe('42501')
      expect(sessionAs('service_role', `select count(*) from spend_reservations`)).toBe('')
      expect(reservation(rid).status).toBe('open')
    })

    it('an advisory-override reservation is accountable like any other, and is labelled as one', () => {
      const p = project()
      const [rid] = query(dsn, `select budget_open_override_reservation('${p}'::uuid, 12, 'anthropic', 'messages.create')`)[0]
      expect(query(dsn, `select status, advisory_override from spend_reservations where id = '${rid}'`)[0]).toEqual(['open', 't'])
      expect(remaining(p)).toBe(988)                              // counted while open
      mark(rid, TOKEN(26))
      age(rid, 31)
      expect(remaining(p)).toBe(988)                              // and never stale once dispatched
      expect(settle(rid, TOKEN(26), 'metered', meteredRows(9))[0]).toBe('settled')
      expect(remaining(p)).toBe(991)
      expect(sqlstateOf(dsn, `update spend_reservations set advisory_override = false where id = '${rid}'`)).toBe('55000')
      expect(sqlstateOf(dsn, `select budget_open_override_reservation('${p}'::uuid, 'NaN'::numeric)`)).toBe('22023')
      expect(sessionAs('anon', `select budget_open_override_reservation('${p}'::uuid, 1)`)).toBe('42501')
    })

    it('the reconciler refuses an age short enough to race a live call', () => {
      expect(sqlstateOf(dsn, `select budget_reconcile_dispatched(interval '30 minutes', 10)`)).toBe('22023')
    })
  })

  // ── Concurrency (real overlapping sessions) ──────────────────────────────

  describe('concurrency', () => {
    it('reconciler vs live settlement — live holds the row: reconciler skips, no double count', async () => {
      const p = project()
      const rid = reserve(p, 30); mark(rid, TOKEN(30)); age(rid, 25 * 60)
      const live = background(`select result from budget_settle_recorded('${rid}'::uuid, '${TOKEN(30)}'::uuid,
        'metered', '${meteredRows(11)}'::jsonb)`, 1500)
      await wait(400)
      const reconciled = query(dsn, `select budget_reconcile_dispatched()`)[0][0]
      expect(reconciled).toBe('0')                                // SKIP LOCKED: the live settlement owns it
      expect(await live).toContain('settled')
      query(dsn, `select budget_reconcile_dispatched()`)
      expect(reservation(rid)).toMatchObject({ status: 'settled', kind: 'metered' })
      expect(linked(rid)).toEqual({ count: 1, sum: 11, kinds: 'metered' })
      expect(remaining(p)).toBe(989)
    })

    it('reconciler vs live settlement — reconciler holds the row: live gets already_settled, writes nothing', async () => {
      const p = project()
      const rid = reserve(p, 30); mark(rid, TOKEN(31)); age(rid, 25 * 60)
      const rec = background(`select budget_reconcile_dispatched()`, 1500)
      await wait(400)
      const t0 = Date.now()
      const [live] = query(dsn, `select result from budget_settle_recorded('${rid}'::uuid, '${TOKEN(31)}'::uuid,
        'metered', '${meteredRows(11)}'::jsonb)`)
      expect(Date.now() - t0).toBeGreaterThan(500)               // it waited for the reconciler's lock
      expect(live[0]).toBe('already_settled')
      await rec
      expect(linked(rid)).toEqual({ count: 1, sum: 30, kinds: 'estimate_reconciled' })
      expect(remaining(p)).toBe(970)
    })

    it('two reconcilers at once settle each reservation exactly once', async () => {
      const p = project()
      const rids = [reserve(p, 7), reserve(p, 9)]
      rids.forEach((r, i) => { mark(r, TOKEN(40 + i)); age(r, 25 * 60) })
      const [a, b] = await Promise.all([
        background(`select budget_reconcile_dispatched()`, 800),
        background(`select budget_reconcile_dispatched()`, 800),
      ])
      expect(a).not.toContain('ERROR'); expect(b).not.toContain('ERROR')
      for (const r of rids) expect(linked(r).count).toBe(1)
      expect(remaining(p)).toBe(1000 - 7 - 9)
    })

    it('two live settlements of one reservation: exactly one writes', async () => {
      const p = project()
      const rid = reserve(p, 30); mark(rid, TOKEN(32))
      const first = background(`select result from budget_settle_recorded('${rid}'::uuid, '${TOKEN(32)}'::uuid,
        'metered', '${meteredRows(12)}'::jsonb)`, 1000)
      await wait(300)
      const [second] = query(dsn, `select result from budget_settle_recorded('${rid}'::uuid, '${TOKEN(32)}'::uuid,
        'estimate_ambiguous', '[]'::jsonb)`)
      expect(await first).toContain('settled')
      expect(second[0]).toBe('already_settled')
      expect(linked(rid)).toEqual({ count: 1, sum: 12, kinds: 'metered' })
    })

    it('a settlement that rolls back after another session waited on it leaves exactly one settlement', async () => {
      const p = project()
      const rid = reserve(p, 30); mark(rid, TOKEN(33))
      const doomed = new Promise<string>((resolve) => {
        const body = `begin; select * from budget_settle_recorded('${rid}'::uuid, '${TOKEN(33)}'::uuid, 'metered',
          '${meteredRows(5)}'::jsonb); select pg_sleep(1); rollback;`
        const s = spawn(PSQL!, ['-X', '-q', '-t', '-A', '-d', dsn, '-c', body], { stdio: ['ignore', 'pipe', 'pipe'] })
        s.on('close', () => resolve('done'))
      })
      await wait(300)
      const [r] = query(dsn, `select result from budget_settle_recorded('${rid}'::uuid, '${TOKEN(33)}'::uuid,
        'estimate_ambiguous', '[]'::jsonb)`)
      await doomed
      expect(r[0]).toBe('settled')
      expect(linked(rid)).toEqual({ count: 1, sum: 30, kinds: 'estimate_ambiguous' })
    })
  })
})
