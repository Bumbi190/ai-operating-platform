/**
 * G2 — atomic budget scopes and replay safety, proven against REAL PostgreSQL.
 *
 * ── WHY THIS SUITE EXECUTES SQL INSTEAD OF READING IT ───────────────────────
 * The Governance audit found that every existing governance suite verified the
 * migration by regex-matching its TEXT — 209 tests in 753 ms, no database. Those
 * tests would pass unchanged against a database where the function had never
 * been applied. That is adequate for "the source says the right thing" and
 * worthless for "concurrent callers cannot both spend the same headroom", which
 * is the only property that makes a reservation a reservation.
 *
 * So this suite builds the schema, applies the real migration, and runs the real
 * function — including two genuinely concurrent transactions, which is the one
 * thing no amount of source reading can establish.
 *
 * Follows the harness of `atlas-memory-recall-sql.test.ts`: it SKIPS loudly with
 * no local Postgres, and FAILS instead of skipping wherever proof is required
 * (CI=true, or ATLAS_SQL_TEST_REQUIRED=1) — a green run that skipped this proves
 * nothing about the budget gate.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

const AVAILABLE = (() => {
  if (!PSQL) return false
  try {
    execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'],
      { stdio: 'pipe', timeout: 10_000 })
    return true
  } catch { return false }
})()

const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'

if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn(
    '[budget-scopes-sql] SKIPPED — no reachable local Postgres. The ATOMICITY of ' +
    'the G2 budget gate was NOT proven in this run. Set ATLAS_SQL_TEST_URL to enable it.',
  )
}

const DB_NAME = `omnira_g2_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

/** Production-shaped subset: exactly the tables the budget functions touch. */
const FIXTURE = `
create extension if not exists pgcrypto;
create table public.projects (
  id uuid primary key default gen_random_uuid(), slug text unique not null);
create table public.project_budgets (
  project_id uuid primary key references public.projects(id) on delete cascade,
  monthly_sek numeric(12,4) not null,
  updated_at timestamptz not null default now());
create table public.platform_config (
  id int primary key, automation_paused boolean not null default false,
  max_daily_renders int not null default 4, max_retry_attempts int not null default 3,
  paused_at timestamptz, paused_reason text, updated_at timestamptz not null default now());
insert into public.platform_config (id) values (1);
create table public.cost_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  provider text,
  cost_sek numeric(12,4) not null default 0,
  cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now());
create table public.spend_reservations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  estimated_sek numeric(12,4) not null check (estimated_sek >= 0),
  actual_sek numeric(12,4),
  status text not null default 'open' check (status in ('open','settled','released')),
  provider text, operation text, idempotency_key text unique,
  created_at timestamptz not null default now(), resolved_at timestamptz);
do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
`

/** settle/release are unchanged by G2 — taken from the migration that owns them. */
function settleReleaseSql(): string {
  const src = readFileSync(join(process.cwd(), 'supabase/migrations/20260830_spend_budget_gate.sql'), 'utf8')
  return src.slice(src.indexOf('-- 3) Settle:'), src.indexOf('-- 5) Read-only headroom'))
}

const G2_SQL = () =>
  readFileSync(join(process.cwd(), 'supabase/migrations/20260831_budget_scopes.sql'), 'utf8')

/** One reservation attempt. Returns [allowed, reason, bindingScope]. */
function reserve(project: string, est: string, key?: string,
                 provider = 'testprov', operation = 'testop'): [string, string, string] {
  const k = key ? `'${key}'` : 'null'
  const r = query(dsn,
    `select allowed::text, reason, coalesce(binding_scope,'-')
       from budget_reserve('${project}'::uuid, ${est}::numeric, ${k}, '${provider}', '${operation}')`)[0]
  return [r[0], r[1], r[2]]
}

function projectId(slug: string): string {
  return query(dsn, `select id from projects where slug='${slug}'`)[0][0]
}

function reset() {
  run(dsn, ['-c', 'delete from spend_reservations; delete from cost_events;'])
}

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('G2 budget scopes (real SQL)', () => {
  beforeAll(() => {
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${DB_NAME}`])
    dsn = dsnFor(DB_NAME)
    run(dsn, ['-c', FIXTURE])
    run(dsn, ['-c', settleReleaseSql()])
    run(dsn, ['-f', join(process.cwd(), 'supabase/migrations/20260831_budget_scopes.sql')])
    run(dsn, ['-c', `
      insert into projects (slug) values ('alpha'), ('beta'), ('nobudget');
      insert into project_budgets (project_id, monthly_sek, daily_sek, weekly_sek)
        select id, 700, 100, 400 from projects where slug='alpha';
      insert into project_budgets (project_id, monthly_sek)
        select id, 700 from projects where slug='beta';
    `])
  }, 120_000)

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

  // ── Scope enforcement ──────────────────────────────────────────────────────

  describe('every configured scope can refuse, and names itself', () => {
    it('allows inside every ceiling, and reports the tightest as binding', () => {
      reset()
      const [allowed, reason, scope] = reserve(projectId('alpha'), '10')
      expect([allowed, reason]).toEqual(['true', 'ok'])
      expect(scope).toBe('project_daily')      // 100 < 400 < 700, and < global 150
    })

    it('project_daily refuses without falling through to weekly or monthly', () => {
      reset()
      expect(reserve(projectId('alpha'), '100')[0]).toBe('true')
      const [allowed, reason, scope] = reserve(projectId('alpha'), '1')
      expect([allowed, reason, scope]).toEqual(['false', 'budget_exceeded', 'project_daily'])
    })

    it('project_weekly refuses while daily still has room', () => {
      reset()
      run(dsn, ['-c', `update project_budgets set daily_sek=200, weekly_sek=120
                        where project_id=(select id from projects where slug='alpha')`])
      run(dsn, ['-c', `insert into cost_events (project_id, cost_sek)
                        select id, 110 from projects where slug='alpha'`])
      // daily has 90 left, weekly has 10
      const [allowed, , scope] = reserve(projectId('alpha'), '50')
      expect(allowed).toBe('false')
      expect(scope).toBe('project_weekly')
      // and something inside BOTH is allowed
      expect(reserve(projectId('alpha'), '8')[0]).toBe('true')
      run(dsn, ['-c', `update project_budgets set daily_sek=100, weekly_sek=400
                        where project_id=(select id from projects where slug='alpha')`])
    })

    it('project_monthly refuses when day and week are generous', () => {
      reset()
      run(dsn, ['-c', `update project_budgets set daily_sek=null, weekly_sek=null, monthly_sek=40
                        where project_id=(select id from projects where slug='beta')`])
      const [allowed, , scope] = reserve(projectId('beta'), '50')
      expect([allowed, scope]).toEqual(['false', 'project_monthly'])
      run(dsn, ['-c', `update project_budgets set monthly_sek=700
                        where project_id=(select id from projects where slug='beta')`])
    })

    it('global_daily refuses a project that is inside its own ceiling', () => {
      reset()
      // beta has no daily ceiling of its own; only the platform one (150) applies
      const [allowed, , scope] = reserve(projectId('beta'), '160')
      expect([allowed, scope]).toEqual(['false', 'global_daily'])
    })

    it('global_monthly is enforced across ALL projects, not per project', () => {
      reset()
      run(dsn, ['-c', `update platform_config set global_monthly_sek=100,
                        global_daily_sek=100000, global_weekly_sek=100000 where id=1`])
      run(dsn, ['-c', `insert into cost_events (project_id, cost_sek)
                        select id, 95 from projects where slug='alpha'`])
      // beta has spent nothing, but the PLATFORM has 5 left
      const [allowed, , scope] = reserve(projectId('beta'), '10')
      expect([allowed, scope]).toEqual(['false', 'global_monthly'])
      run(dsn, ['-c', `update platform_config set global_daily_sek=150,
                        global_weekly_sek=600, global_monthly_sek=1500 where id=1`])
    })
  })

  // ── Fail closed ────────────────────────────────────────────────────────────

  describe('absence never means permission', () => {
    it('a project with no budget row is refused', () => {
      reset()
      expect(reserve(projectId('nobudget'), '1').slice(0, 2)).toEqual(['false', 'no_budget_configured'])
    })

    it('an unknown project id is refused', () => {
      expect(reserve('00000000-0000-0000-0000-000000000000', '1').slice(0, 2))
        .toEqual(['false', 'no_budget_configured'])
    })

    it('an absent platform ceiling is refused, not treated as unlimited', () => {
      reset()
      run(dsn, ['-c', 'update platform_config set global_daily_sek=null where id=1'])
      expect(reserve(projectId('alpha'), '1').slice(0, 2))
        .toEqual(['false', 'no_global_budget_configured'])
      run(dsn, ['-c', 'update platform_config set global_daily_sek=150 where id=1'])
    })

    it.each(['\'NaN\'', '\'Infinity\'', '\'-Infinity\'', '-1', 'null'])(
      'a malformed estimate (%s) is refused before anything is reserved', (est) => {
        reset()
        expect(reserve(projectId('alpha'), est).slice(0, 2)).toEqual(['false', 'invalid_estimate'])
        expect(query(dsn, 'select count(*) from spend_reservations')[0][0]).toBe('0')
      })

    it('a zero estimate is valid and must NOT be refused', () => {
      reset()
      expect(reserve(projectId('alpha'), '0')[0]).toBe('true')
    })

    it('an estimate exactly equal to the remaining headroom is allowed', () => {
      reset()
      expect(reserve(projectId('alpha'), '40')[0]).toBe('true')   // daily 100 → 60 left
      expect(reserve(projectId('alpha'), '60')[0]).toBe('true')   // exactly 60
      expect(reserve(projectId('alpha'), '0.0001')[0]).toBe('false')
    })
  })

  // ── F-106 ──────────────────────────────────────────────────────────────────

  describe('replay state machine (audit F-106)', () => {
    it('ONE RESERVATION, ONE LIVE DISPATCH — a fresh open replay is REFUSED', () => {
      // A reservation holds a fixed amount of headroom. Handing it to a second
      // caller would authorise two provider calls against it: an under-
      // reservation and a ceiling bypass. Budget idempotency is not
      // provider-dispatch idempotency.
      reset()
      expect(reserve(projectId('alpha'), '30', 'k-open').slice(0, 2)).toEqual(['true', 'ok'])
      expect(reserve(projectId('alpha'), '30', 'k-open').slice(0, 2)).toEqual(['false', 'replay_in_flight'])
      // still exactly one reservation, holding exactly once
      expect(query(dsn, `select count(*), coalesce(sum(estimated_sek),0)::text
                           from spend_reservations where idempotency_key='k-open'`)[0])
        .toEqual(['1', '30.0000'])
    })

    it('TWO CONCURRENT callers on one key: at most ONE is authorised', () => {
      reset()
      // Sequential here proves the verdict; the overlapping-transaction proof is
      // in the concurrency suite below.
      const a = reserve(projectId('alpha'), '30', 'k-conc')
      const b = reserve(projectId('alpha'), '30', 'k-conc')
      expect([a[0], b[0]].filter(v => v === 'true')).toHaveLength(1)
    })

    // ── Identity binding ─────────────────────────────────────────────────────

    it('same key + DIFFERENT project is refused', () => {
      reset()
      expect(reserve(projectId('alpha'), '10', 'k-id')[0]).toBe('true')
      expect(reserve(projectId('beta'), '10', 'k-id').slice(0, 2))
        .toEqual(['false', 'replay_identity_mismatch'])
    })

    it('same key + DIFFERENT provider is refused', () => {
      reset()
      expect(reserve(projectId('alpha'), '10', 'k-prov', 'elevenlabs', 'op')[0]).toBe('true')
      expect(reserve(projectId('alpha'), '10', 'k-prov', 'ideogram', 'op').slice(0, 2))
        .toEqual(['false', 'replay_identity_mismatch'])
    })

    it('same key + DIFFERENT operation is refused', () => {
      reset()
      expect(reserve(projectId('alpha'), '10', 'k-op', 'p', 'generateVoiceover')[0]).toBe('true')
      expect(reserve(projectId('alpha'), '10', 'k-op', 'p', 'generateSoundEffect').slice(0, 2))
        .toEqual(['false', 'replay_identity_mismatch'])
    })

    it('same key + LARGER estimate is refused — never under-reserved', () => {
      // The bypass: mint a cheap reservation, then present the same key for a
      // dearer operation and have the small reservation authorise it.
      reset()
      expect(reserve(projectId('alpha'), '5', 'k-grow')[0]).toBe('true')
      expect(reserve(projectId('alpha'), '50', 'k-grow').slice(0, 2))
        .toEqual(['false', 'replay_identity_mismatch'])
    })

    it('same key + SMALLER estimate is deterministic: refused as in_flight, never allowed', () => {
      // Identity permits it (the reservation covers the request), so the verdict
      // is decided by the dispatch rule — which refuses a live reservation.
      reset()
      expect(reserve(projectId('alpha'), '50', 'k-shrink-est')[0]).toBe('true')
      expect(reserve(projectId('alpha'), '5', 'k-shrink-est').slice(0, 2))
        .toEqual(['false', 'replay_in_flight'])
    })

    it('a STALE open reservation is re-decided against TODAY\'s budget, not waved through', () => {
      // It stopped counting toward headroom when it aged out, so replaying it as
      // allowed would spend against a check made over 30 minutes ago — what a
      // cron re-running tomorrow with the same subject would hit.
      reset()
      run(dsn, ['-c', `insert into spend_reservations
                        (project_id, estimated_sek, created_at, status, idempotency_key)
                        select id, 10, now() - interval '90 minutes', 'open', 'k-stale'
                        from projects where slug='alpha'`])
      run(dsn, ['-c', `update spend_reservations set provider='testprov', operation='testop'
                        where idempotency_key='k-stale'`])
      // budget is free → refreshed and allowed, still ONE reservation
      expect(reserve(projectId('alpha'), '10', 'k-stale').slice(0, 2)).toEqual(['true', 'replay_open'])
      expect(query(dsn, `select count(*) from spend_reservations
                           where idempotency_key='k-stale'`)[0][0]).toBe('1')
      // and it holds headroom again rather than staying invisible
      expect(Number(query(dsn, `select held_sek from budget_scope_state('${projectId('alpha')}'::uuid)
                                  where scope='project_daily'`)[0][0])).toBe(10)
    })

    it('a STALE replay with a LARGER estimate cannot under-reserve', () => {
      reset()
      run(dsn, ['-c', `insert into spend_reservations
                        (project_id, estimated_sek, created_at, status, idempotency_key,
                         provider, operation)
                        select id, 5, now() - interval '90 minutes', 'open', 'k-stale-big',
                               'testprov', 'testop'
                        from projects where slug='alpha'`])
      // The stale reservation holds 5; the new request wants 50.
      expect(reserve(projectId('alpha'), '50', 'k-stale-big').slice(0, 2))
        .toEqual(['false', 'replay_identity_mismatch'])
    })

    it('a STALE open reservation is REFUSED when the budget has since gone', () => {
      reset()
      run(dsn, ['-c', `insert into spend_reservations
                        (project_id, estimated_sek, created_at, status, idempotency_key)
                        select id, 10, now() - interval '90 minutes', 'open', 'k-stale2'
                        from projects where slug='alpha'`])
      run(dsn, ['-c', `update spend_reservations set provider='testprov', operation='testop'
                        where idempotency_key='k-stale2'`])
      run(dsn, ['-c', `insert into cost_events (project_id, cost_sek)
                        select id, 99 from projects where slug='alpha'`])
      const [allowed, reason, scope] = reserve(projectId('alpha'), '10', 'k-stale2')
      expect([allowed, reason, scope]).toEqual(['false', 'budget_exceeded', 'project_daily'])
      // released, so it can never silently hold headroom again
      expect(query(dsn, `select status from spend_reservations
                           where idempotency_key='k-stale2'`)[0][0]).toBe('released')
    })

    it('different subjects do NOT collide into one reservation', () => {
      reset()
      expect(reserve(projectId('alpha'), '5', 'k-a')[0]).toBe('true')
      expect(reserve(projectId('alpha'), '5', 'k-b')[0]).toBe('true')
      expect(query(dsn, `select count(*) from spend_reservations where status='open'`)[0][0]).toBe('2')
    })
  })

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  describe('reservations move headroom', () => {
    it('an open reservation consumes headroom; release restores it exactly', () => {
      reset()
      const before = query(dsn, `select remaining_sek from budget_scope_state('${projectId('alpha')}'::uuid)
                                  where scope='project_daily'`)[0][0]
      expect(reserve(projectId('alpha'), '25')[0]).toBe('true')
      const during = query(dsn, `select remaining_sek from budget_scope_state('${projectId('alpha')}'::uuid)
                                  where scope='project_daily'`)[0][0]
      expect(Number(before) - Number(during)).toBe(25)
      run(dsn, ['-c', `select budget_release((select id from spend_reservations
                        where status='open' limit 1))`])
      const after = query(dsn, `select remaining_sek from budget_scope_state('${projectId('alpha')}'::uuid)
                                 where scope='project_daily'`)[0][0]
      expect(after).toBe(before)
    })

    it('a refusal records the attempt as released, never as open', () => {
      reset()
      reserve(projectId('alpha'), '99999')
      expect(query(dsn, `select status from spend_reservations`)[0][0]).toBe('released')
    })
  })

  // ── Windows ────────────────────────────────────────────────────────────────

  describe('windows are bounded at BOTH edges (Europe/Stockholm)', () => {
    it('a future-dated cost event does not consume today\'s ceiling', () => {
      reset()
      run(dsn, ['-c', `insert into cost_events (project_id, cost_sek, created_at)
                        select id, 90, now() + interval '2 days' from projects where slug='alpha'`])
      const daily = query(dsn, `select spent_sek from budget_scope_state('${projectId('alpha')}'::uuid)
                                 where scope='project_daily'`)[0][0]
      expect(Number(daily)).toBe(0)
    })

    it('a cost event from last month does not consume this month', () => {
      reset()
      run(dsn, ['-c', `insert into cost_events (project_id, cost_sek, created_at)
                        select id, 500, now() - interval '45 days' from projects where slug='alpha'`])
      const monthly = query(dsn, `select spent_sek from budget_scope_state('${projectId('alpha')}'::uuid)
                                   where scope='project_monthly'`)[0][0]
      expect(Number(monthly)).toBe(0)
    })

    it('the ledger REFUSES a negative cost row outright (layer 1)', () => {
      reset()
      expect(() => run(dsn, ['-c', `insert into cost_events (project_id, cost_sek)
                                     select id, -500 from projects where slug='alpha'`]))
        .toThrow(/cost_events_cost_nonneg/)
    })

    it('and even without the constraint, a refund cannot mint headroom (layer 2)', () => {
      // Defence in depth: `greatest(cost_sek, 0)` holds the GROSS-spend policy
      // even if the constraint were ever dropped or bypassed by a superuser.
      reset()
      run(dsn, ['-c', 'alter table cost_events drop constraint cost_events_cost_nonneg'])
      try {
        run(dsn, ['-c', `insert into cost_events (project_id, cost_sek)
                          select id, -500 from projects where slug='alpha'`])
        const remaining = query(dsn, `select remaining_sek from budget_scope_state('${projectId('alpha')}'::uuid)
                                       where scope='project_daily'`)[0][0]
        expect(Number(remaining)).toBe(100)                  // the limit, not 600
        expect(reserve(projectId('alpha'), '200').slice(0, 2)).toEqual(['false', 'budget_exceeded'])
      } finally {
        reset()
        run(dsn, ['-c', `alter table cost_events add constraint cost_events_cost_nonneg
                          check (cost_sek >= 0 and cost_usd >= 0)`])
      }
    })

    it('THE REVIEW SCENARIO: +90 real spend, -500 refund, ceiling 100 → +100 REFUSED', () => {
      // Under a NET ceiling this would compute 100 - (90-500) = 510 remaining and
      // authorise another 100, billing 190 gross against a 100 limit.
      reset()
      run(dsn, ['-c', 'alter table cost_events drop constraint cost_events_cost_nonneg'])
      try {
        run(dsn, ['-c', `insert into cost_events (project_id, cost_sek)
                          select id, 90 from projects where slug='alpha'`])
        run(dsn, ['-c', `insert into cost_events (project_id, cost_sek)
                          select id, -500 from projects where slug='alpha'`])
        const st = query(dsn, `select spent_sek, remaining_sek from budget_scope_state('${projectId('alpha')}'::uuid)
                                where scope='project_daily'`)[0]
        expect(Number(st[0])).toBe(90)                       // gross, not net -410
        expect(Number(st[1])).toBe(10)
        expect(reserve(projectId('alpha'), '100').slice(0, 2)).toEqual(['false', 'budget_exceeded'])
        expect(reserve(projectId('alpha'), '10')[0]).toBe('true')
      } finally {
        reset()
        run(dsn, ['-c', `alter table cost_events add constraint cost_events_cost_nonneg
                          check (cost_sek >= 0 and cost_usd >= 0)`])
      }
    })

    it('a stale open reservation stops holding headroom', () => {
      reset()
      run(dsn, ['-c', `insert into spend_reservations (project_id, estimated_sek, created_at, status)
                        select id, 90, now() - interval '90 minutes', 'open' from projects where slug='alpha'`])
      const held = query(dsn, `select held_sek from budget_scope_state('${projectId('alpha')}'::uuid, 30)
                                where scope='project_daily'`)[0][0]
      expect(Number(held)).toBe(0)
    })
  })

  // ── F-204 ──────────────────────────────────────────────────────────────────

  describe('read and enforcement cannot disagree (audit F-204)', () => {
    it('budget_headroom and budget_reserve report the same binding scope and figure', () => {
      reset()
      run(dsn, ['-c', `insert into cost_events (project_id, cost_sek)
                        select id, 60 from projects where slug='alpha'`])
      const read = query(dsn, `select scope, remaining_sek from budget_headroom()
                                where slug='alpha' order by remaining_sek asc limit 1`)[0]
      const enf = query(dsn, `select coalesce(binding_scope,'-'), coalesce(headroom_sek::text,'-')
                                from budget_reserve('${projectId('alpha')}'::uuid, 99999::numeric)`)[0]
      expect(enf[0]).toBe(read[0])
      expect(Number(enf[1])).toBe(Number(read[1]))
    })
  })
})

// ── Concurrency ──────────────────────────────────────────────────────────────
//
// The property the whole reservation design exists for, and the one that source
// inspection cannot establish: two callers must not both fit into the same
// headroom. Each case runs two OVERLAPPING transactions — the first holds its
// advisory locks across a sleep, so the second genuinely contends for them.

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('G2 concurrency (real overlapping transactions)', () => {
  const CDB = `omnira_g2c_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
  let cdsn = ''

  beforeAll(() => {
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${CDB}`])
    cdsn = dsnFor(CDB)
    run(cdsn, ['-c', FIXTURE])
    run(cdsn, ['-c', settleReleaseSql()])
    run(cdsn, ['-f', join(process.cwd(), 'supabase/migrations/20260831_budget_scopes.sql')])
    run(cdsn, ['-c', `
      insert into projects (slug) values ('p1'), ('p2');
      insert into project_budgets (project_id, monthly_sek, daily_sek)
        select id, 700, 100 from projects where slug in ('p1','p2');
    `])
  }, 120_000)

  afterAll(() => {
    if (!AVAILABLE || !cdsn) return
    try { run(ADMIN_URL, ['-c', `drop database if exists ${CDB} with (force)`]) } catch { /* best effort */ }
  })

  /** Run one reservation inside a transaction that holds its locks for `holdMs`. */
  function concurrentReserve(project: string, est: number, holdMs: number, key?: string): Promise<string> {
    const k = key ? `'${key}'` : 'null'
    const call = `budget_reserve('${project}'::uuid, ${est}::numeric, ${k}, 'prov', 'op')`
    const sql = holdMs > 0
      ? `begin; select allowed::text || '|' || reason || '|' || coalesce(binding_scope,'-')
           from ${call};
         select pg_sleep(${holdMs / 1000}); commit;`
      : `begin; select allowed::text || '|' || reason || '|' || coalesce(binding_scope,'-')
           from ${call}; commit;`
    return new Promise((resolve, reject) => {
      const p = spawn(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', cdsn, '-c', sql],
        { stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      p.stdout.on('data', d => { out += d })
      p.on('close', () => {
        const line = out.split('\n').map(l => l.trim()).filter(l => l.includes('|'))[0] ?? ''
        resolve(line)
      })
      p.on('error', reject)
    })
  }

  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

  it('SAME project: two overlapping reservations cannot both fit one ceiling', async () => {
    run(cdsn, ['-c', 'delete from spend_reservations; delete from cost_events;'])
    const p1 = query(cdsn, `select id from projects where slug='p1'`)[0][0]
    // daily ceiling 100; each asks 60, so exactly one may pass
    const first = concurrentReserve(p1, 60, 1500)
    await wait(400)
    const second = await concurrentReserve(p1, 60, 0)
    const firstResult = await first

    const verdicts = [firstResult.split('|')[0], second.split('|')[0]].sort()
    expect(verdicts).toEqual(['false', 'true'])
    expect(second.split('|')[2]).toBe('project_daily')

    const held = query(cdsn, `select coalesce(sum(estimated_sek),0)::text
                                from spend_reservations where status='open'`)[0][0]
    expect(Number(held)).toBe(60)
  }, 60_000)

  it('ONE KEY, two overlapping callers: at most ONE dispatch is authorised', async () => {
    // The blocker this closes: a 30 SEK reservation must never authorise two
    // concurrent 30 SEK provider calls while only 30 SEK of headroom is held.
    run(cdsn, ['-c', 'delete from spend_reservations; delete from cost_events;'])
    const p1 = query(cdsn, `select id from projects where slug='p1'`)[0][0]

    const first = concurrentReserve(p1, 30, 1500, 'k-dispatch')
    await wait(400)
    const second = await concurrentReserve(p1, 30, 0, 'k-dispatch')
    const firstResult = await first

    const verdicts = [firstResult.split('|')[0], second.split('|')[0]].sort()
    expect(verdicts).toEqual(['false', 'true'])          // exactly one authorised
    expect(second.split('|')[1]).toBe('replay_in_flight')

    // and one reservation, holding 30 once — not 60 against a 30 hold
    expect(query(cdsn, `select count(*), coalesce(sum(estimated_sek),0)::text
                          from spend_reservations where idempotency_key='k-dispatch'`)[0])
      .toEqual(['1', '30.0000'])
  }, 60_000)

  it('DIFFERENT projects: the global ceiling still cannot be exceeded', async () => {
    run(cdsn, ['-c', `delete from spend_reservations; delete from cost_events;
                      update platform_config set global_daily_sek=100 where id=1;`])
    const p1 = query(cdsn, `select id from projects where slug='p1'`)[0][0]
    const p2 = query(cdsn, `select id from projects where slug='p2'`)[0][0]
    // Each fits its OWN daily ceiling (100). Together they exceed the global 100.
    const first = concurrentReserve(p1, 60, 1500)
    await wait(400)
    const second = await concurrentReserve(p2, 60, 0)
    const firstResult = await first

    const verdicts = [firstResult.split('|')[0], second.split('|')[0]].sort()
    expect(verdicts).toEqual(['false', 'true'])
    expect(second.split('|')[2]).toBe('global_daily')

    const held = query(cdsn, `select coalesce(sum(estimated_sek),0)::text
                                from spend_reservations where status='open'`)[0][0]
    expect(Number(held)).toBeLessThanOrEqual(100)
    run(cdsn, ['-c', 'update platform_config set global_daily_sek=150 where id=1'])
  }, 60_000)
})
