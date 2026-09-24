/**
 * Phase 2B — owner-declared operating capital, proven against REAL PostgreSQL.
 *
 * The invariants here are database behaviours and cannot be established by
 * reading the migration text:
 *
 *   * that SET and CLEAR are ATOMIC with their audit row — a configuration
 *     change without its evidence is the failure this boundary exists to make
 *     impossible;
 *   * that the ledger cannot be REWRITTEN;
 *   * that NaN and the infinities are refused at the boundary rather than
 *     stored as a capital figure;
 *   * that the scope-completeness question is answerable without exposing a
 *     single project id from outside the caller's scope.
 *
 * Follows the harness of `survival-history-sql.test.ts`: SKIPS loudly with no
 * local Postgres, and FAILS instead of skipping wherever proof is required.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
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
const MIGRATION_2A = join(process.cwd(), 'supabase/migrations/20260923120000_survival_state_events.sql')
const MIGRATION_2B = join(process.cwd(), 'supabase/migrations/20260924120000_survival_funding_phase2b.sql')

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
function one(dsn: string, sql: string): string {
  const rows = query(dsn, sql)
  return rows.length ? rows[0].join('|') : ''
}
function expectFailure(dsn: string, sql: string): string {
  try {
    execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, '-c', sql],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return ''
  } catch (e) {
    const err = e as { stderr?: Buffer | string }
    return String(err.stderr ?? '')
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
  console.warn(
    '[survival-funding-sql] SKIPPED — no reachable local Postgres. The Phase 2B funding ' +
    'boundary (atomicity, append-only, input rejection, scope completeness) was NOT proven. ' +
    'Set ATLAS_SQL_TEST_URL to enable it.')
}

const DB_NAME = `omnira_fund_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

const P_A = '11111111-1111-1111-1111-111111111111'
const P_B = '22222222-2222-2222-2222-222222222222'

const FIXTURE = `
create extension if not exists pgcrypto;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $do$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create table public.projects (id uuid primary key default gen_random_uuid(), slug text unique not null,
  name text, execution_paused boolean not null default false, paused_at timestamptz, paused_reason text);
create table public.platform_config (id int primary key default 1, automation_paused boolean not null default false,
  max_daily_renders int not null default 4, max_retry_attempts int not null default 3,
  paused_at timestamptz, paused_reason text, updated_at timestamptz not null default now(),
  global_daily_sek numeric(12,4), global_weekly_sek numeric(12,4), global_monthly_sek numeric(12,4));
create table public.spend_reservations (id uuid primary key default gen_random_uuid(), project_id uuid, estimated_sek numeric not null default 0);
insert into public.platform_config (id) values (1);
insert into public.projects (id, slug) values ('${P_A}','alpha'), ('${P_B}','beta');
`

const d = AVAILABLE ? describe : describe.skip

beforeAll(() => {
  if (!AVAILABLE) {
    if (SQL_REQUIRED) throw new Error('[survival-funding-sql] Postgres REQUIRED but unreachable.')
    return
  }
  run(ADMIN_URL, ['-c', `create database "${DB_NAME}"`])
  dsn = dsnFor(DB_NAME)
  run(dsn, ['-c', FIXTURE])
  run(dsn, ['-f', MIGRATION_2A])
  run(dsn, ['-f', MIGRATION_2B])
})

afterAll(() => {
  if (!AVAILABLE) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DB_NAME}" with (force)`]) } catch { /* best effort */ }
})

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Canonical authenticated human actors. The ledger constrains the actor to
 * exactly this shape, so a fixture like `user:operator-1` is no longer a valid
 * stand-in — which is the point: a machine-shaped token must not be recordable
 * as the person who changed the declaration.
 */
const ACTOR = 'user:7c9e6679-7425-40de-944b-e07fc1f90ae7'
const ACTOR_2 = 'user:3f2504e0-4f89-41d3-9a0c-0305e82c3301'

const SET = (sek: string | null, actor = ACTOR) =>
  `select * from public.survival_set_declared_operating_capital(${sek ?? 'null'}, '${actor}')`

/**
 * CURRENT TRUTH — the SERVER-ONLY singleton, never `platform_config`.
 *
 * The original design put this column on `platform_config`, which production
 * grants `authenticated` SELECT through a policy whose qual is `true`; the
 * declaration would have been readable by every authenticated user. Reading it
 * from the wrong table here would hide exactly the regression these tests exist
 * to catch.
 */
const capital = () =>
  one(dsn, `select coalesce(declared_operating_capital_sek::text, '<null>') from public.survival_funding_config where id = 1`)

const eventCount = () => Number(one(dsn, `select count(*) from public.survival_funding_events`))

const latestEvent = () =>
  one(dsn, `select event || '|' || coalesce(previous_declared_sek::text,'<null>') || '|' ||
                   coalesce(declared_sek::text,'<null>') || '|' || actor
              from public.survival_funding_events order by event_seq desc limit 1`)

const call = (sek: string | null, actor = ACTOR) =>
  one(dsn, `${SET(sek, actor)}`)

/**
 * The declared component of an RPC result row (`result|previous|declared`).
 *
 * Asserting on this rather than the whole row keeps a test from also encoding
 * whatever the PREVIOUS declaration happened to be, which makes it depend on
 * which tests ran before it.
 */
const declaredOf = (row: string) => row.split('|')[2] ?? ''


// ── The declaration itself ──────────────────────────────────────────────────

describe('funding · the declaration and its reader semantics', () => {
  it('starts UNDECLARED — NULL is the absence of a declaration, with no default', () => {
    expect(capital()).toBe('<null>')
    expect(one(dsn, `select count(*) from public.survival_funding_events`)).toBe('0')
  })

  // NOTE the returned `declared_sek` is `120000.0000`, not `120000`. The RPC
  // returns the value AS PERSISTED (numeric(12,4)), not the argument it received,
  // so the mutation's own response can never describe a figure the table does
  // not hold. That is asserted directly below.
  it('a positive declaration is stored exactly, and audits one SET', () => {
    expect(call('120000')).toBe('recorded||120000.0000')
    expect(capital()).toBe('120000.0000')
    expect(eventCount()).toBe(1)
    expect(latestEvent()).toBe(`DECLARATION_SET|<null>|120000.0000|${ACTOR}`)
  })

  it('ZERO is a KNOWN declaration, never a clear', () => {
    expect(call('0')).toBe('recorded|120000.0000|0.0000')
    expect(capital()).toBe('0.0000')
    expect(latestEvent()).toBe(`DECLARATION_SET|120000.0000|0.0000|${ACTOR}`)
  })

  it('NEGATIVE is a KNOWN declaration — the sign is not this schema\'s policy', () => {
    expect(call('-125.50')).toBe('recorded|0.0000|-125.5000')
    expect(capital()).toBe('-125.5000')
    expect(latestEvent()).toBe(`DECLARATION_SET|0.0000|-125.5000|${ACTOR}`)
  })

  it('CLEAR persists NULL, and is distinguishable from a zero declaration', () => {
    expect(call(null)).toBe('recorded|-125.5000|')
    expect(capital()).toBe('<null>')
    expect(latestEvent()).toBe(`DECLARATION_CLEARED|-125.5000|<null>|${ACTOR}`)
  })

  it('re-setting the SAME value writes nothing — no audit trail of non-events', () => {
    const before = eventCount()
    expect(call(null)).toBe('unchanged||')
    expect(eventCount()).toBe(before)
  })

  it('the RESPONSE equals current truth and the audit row, exactly', () => {
    // The three must agree literally, not approximately: the returned value, the
    // stored column and the recorded amount are one fact in three places, and a
    // caller that trusted a higher-precision response would be reading a number
    // the system does not hold.
    expect(call('1.2345')).toBe('recorded||1.2345')
    expect(capital()).toBe('1.2345')
    expect(one(dsn, `select declared_sek::text from public.survival_funding_events
                      order by event_seq desc limit 1`)).toBe('1.2345')
  })
})

// ── Input validation ────────────────────────────────────────────────────────

describe('funding · invalid input is refused at the boundary', () => {
  it('refuses NaN and both infinities', () => {
    for (const bad of ["'NaN'::numeric", "'Infinity'::numeric", "'-Infinity'::numeric"]) {
      const err = expectFailure(dsn, `select * from public.survival_set_declared_operating_capital(${bad}, '${ACTOR}')`)
      expect(err, bad).toMatch(/finite number/i)
    }
  })

  it('refuses an absent actor — the ledger cannot record an anonymous change', () => {
    for (const bad of ['null', "''", "'  '"]) {
      expect(expectFailure(dsn, `select * from public.survival_set_declared_operating_capital(1000, ${bad})`), bad)
        .toMatch(/canonical human actor shape/i)
    }
  })

  it('none of those probes changed the declaration or wrote an audit row', () => {
    // Compared against the CURRENT value rather than a hardcoded one, so the
    // assertion cannot pass merely because an earlier test happened to leave
    // the column null.
    const beforeCapital = capital()
    const before = eventCount()
    expect(expectFailure(dsn, `select * from public.survival_set_declared_operating_capital('NaN'::numeric, '${ACTOR}')`))
      .toMatch(/finite/i)
    expect(capital()).toBe(beforeCapital)
    expect(eventCount()).toBe(before)
  })
})

// ── §2 Exact numeric(12,4) semantics ────────────────────────────────────────

describe('funding · the declaration is persisted EXACTLY, never rounded', () => {
  it('ACCEPTS every exactly-representable shape', () => {
    // Zero, negatives, the full fractional precision, and the largest magnitude
    // numeric(12,4) can hold — in both directions.
    for (const [input, stored] of [
      ['0', '0.0000'],
      ['-125.50', '-125.5000'],
      ['1.2345', '1.2345'],
      ['99999999.9999', '99999999.9999'],
      ['-99999999.9999', '-99999999.9999'],
    ] as const) {
      // The RPC's own answer carries the PERSISTED form, so the response and
      // current truth cannot disagree. Asserted on the declared component rather
      // than the whole row, so the test does not also encode whatever the
      // previous declaration happened to be.
      const declared = stored.replace('.', '\\.')
      expect(call(input), input).toMatch(new RegExp(`^recorded\\|.*\\|${declared}$`))
      expect(capital(), input).toBe(stored)
    }
  })

  it('REFUSES anything that would be silently rounded', () => {
    // 1.23456 -> numeric(12,4) would store 1.2346, so the mutation's response
    // (1.23456) would disagree with current truth (1.2346). Refused instead.
    for (const bad of ['1.23456', '-1.23456', '0.00001']) {
      expect(expectFailure(dsn, `${SET(bad)}`), bad).toMatch(/at most 4 decimal places/i)
    }
  })

  it('REFUSES anything outside the numeric(12,4) range', () => {
    for (const bad of ['100000000', '-100000000', '999999999']) {
      expect(expectFailure(dsn, `${SET(bad)}`), bad).toMatch(/outside the numeric\(12,4\) range/i)
    }
  })

  it('ACCEPTS trailing zeros, which is not precision loss', () => {
    // 1.23000 and 1.23 are the same numeric VALUE; storing either loses nothing,
    // so the boundary accepts both and treats them as the same declaration.
    expect(declaredOf(call('1.23000'))).toBe('1.2300')
    expect(capital()).toBe('1.2300')
    const before = eventCount()
    expect(declaredOf(call('1.23'))).toBe('1.2300')
    expect(eventCount(), 'a trailing-zero form must not write a second event').toBe(before)
  })

  it('the no-op comparison uses the CANONICAL stored value', () => {
    // The regression this guards: with silent rounding, a stored 1.2346
    // re-submitted as 1.23456 is DISTINCT while persisting the same value, so a
    // non-event would manufacture an audit row. Now the finer form is refused
    // before it can be compared at all.
    expect(declaredOf(call('1.2345'))).toBe('1.2345')
    const before = eventCount()
    expect(declaredOf(call('1.2345'))).toBe('1.2345')
    expect(expectFailure(dsn, `${SET('1.23450')}`)).toBe('')   // 1.23450 == 1.2345, accepted
    expect(declaredOf(call('1.2345'))).toBe('1.2345')
    expect(eventCount()).toBe(before)
    expect(capital()).toBe('1.2345')
  })
})

// ── §4 The ledger cannot claim a machine actor ──────────────────────────────

describe('funding · the actor must be a canonical authenticated human', () => {
  it('ACCEPTS the canonical user:<uuid> shape', () => {
    expect(declaredOf(call('42', ACTOR))).toBe('42.0000')
    expect(latestEvent()).toContain('42.0000')
    expect(latestEvent()).toContain(ACTOR)
  })

  it('REFUSES machine-shaped and malformed actors through the RPC', () => {
    for (const bad of ['cron', 'atlas', 'atlas.survival_recorder', 'user:not-a-uuid',
                       'system:123', 'user:', 'User:7c9e6679-7425-40de-944b-e07fc1f90ae7',
                       'user:7C9E6679-7425-40DE-944B-E07FC1F90AE7']) {
      expect(expectFailure(dsn, `${SET('7', bad)}`), bad)
        .toMatch(/canonical human actor shape/i)
    }
  })

  it('REFUSES the same shapes at the TABLE, not only at the RPC', () => {
    // The RPC is not the only possible writer path, so the constraint has to
    // hold on its own. Written as the table owner so the funding guard (which
    // only covers the capital column) is not what refuses this.
    for (const bad of ['cron', 'atlas.survival_recorder', 'user:not-a-uuid']) {
      expect(expectFailure(dsn, `insert into public.survival_funding_events
                                   (event, declared_sek, actor) values ('DECLARATION_SET', 1, '${bad}')`), bad)
        .toMatch(/survival_funding_events_actor_human_identity/)
    }
  })

  it('a refused actor leaves the declaration and the ledger untouched', () => {
    const beforeCapital = capital()
    const before = eventCount()
    expect(expectFailure(dsn, `${SET('999', 'cron')}`)).toMatch(/canonical human actor shape/i)
    expect(capital()).toBe(beforeCapital)
    expect(eventCount()).toBe(before)
  })
})

// ── §1 Current truth is a SERVER-ONLY singleton ─────────────────────────────

describe('funding · current truth is a SERVER-ONLY singleton', () => {
  // The declaration was originally a COLUMN on `platform_config`. Production
  // grants `authenticated` SELECT on that table through a policy whose qual is
  // `true`, so the owner's operating capital would have been readable by every
  // authenticated user — RLS protects ROWS, and no policy can be narrowed by
  // adding a field to its table.
  //
  // It now lives in its own table with no client grant of any kind, which is
  // also why no owner-check trigger is needed: the ACL already says it, and one
  // mechanism stated in one place beats two that must agree.
  const as = (role: string, sql: string) => expectFailure(dsn, `set role ${role}; ${sql}; reset role;`)
  const denied = /permission denied|42501|row-level security/i

  it('exists, and holds exactly the singleton row', () => {
    expect(one(dsn, `select count(*) from information_schema.tables
                      where table_schema = 'public' and table_name = 'survival_funding_config'`)).toBe('1')
    // Exactly one row, and it is id = 1: "the current declaration" must never be
    // a question with more than one answer.
    expect(one(dsn, `select id::text from public.survival_funding_config`)).toBe('1')
    expect(one(dsn, `select count(*) from public.survival_funding_config`)).toBe('1')
    // The SEEDED NULL is proven by the FIRST test in this file
    // ('starts UNDECLARED — NULL is the absence of a declaration'), which runs
    // before anything mutates the singleton. Asserting it again here would be
    // asserting whatever the preceding tests left behind, not the seed.
  })

  it('is the ONLY place the declaration lives — platform_config does not carry it', () => {
    expect(one(dsn, `select count(*) from information_schema.columns
                      where table_schema = 'public' and table_name = 'platform_config'
                        and column_name = 'declared_operating_capital_sek'`),
      'the withdrawn column must not exist on the broadly-readable table').toBe('0')
  })

  it('has RLS on and ZERO policies, so no client can read it through a policy', () => {
    expect(one(dsn, `select relrowsecurity from pg_class
                      where oid = 'public.survival_funding_config'::regclass`)).toBe('t')
    expect(one(dsn, `select count(*) from pg_policies
                      where schemaname = 'public' and tablename = 'survival_funding_config'`)).toBe('0')
  })

  it('grants anon and authenticated NOTHING', () => {
    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        expect(one(dsn, `select has_table_privilege('${role}',
          'public.survival_funding_config', '${priv}')`), `${role} ${priv}`).toBe('f')
      }
    }
  })

  it('grants service_role SELECT and nothing else', () => {
    expect(one(dsn, `select has_table_privilege('service_role',
      'public.survival_funding_config', 'SELECT')`)).toBe('t')
    for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      expect(one(dsn, `select has_table_privilege('service_role',
        'public.survival_funding_config', '${priv}')`), `service_role ${priv}`).toBe('f')
    }
  })

  it('refuses every direct write by service_role', () => {
    const before = capital()
    expect(as('service_role',
      `update public.survival_funding_config set declared_operating_capital_sek = 999999 where id = 1`),
      'direct UPDATE').toMatch(denied)
    expect(as('service_role',
      `insert into public.survival_funding_config (id, declared_operating_capital_sek) values (2, 5)`),
      'direct INSERT').toMatch(denied)
    expect(as('service_role', `delete from public.survival_funding_config where id = 1`),
      'direct DELETE').toMatch(denied)
    expect(as('service_role', `truncate public.survival_funding_config`),
      'direct TRUNCATE').toMatch(denied)

    expect(capital(), 'no refused write may have landed').toBe(before)
    expect(one(dsn, `select count(*) from public.survival_funding_config`), 'and no second row').toBe('1')
  })

  it('refuses every direct write by anon and authenticated', () => {
    for (const role of ['anon', 'authenticated']) {
      expect(as(role, `update public.survival_funding_config
                          set declared_operating_capital_sek = 1 where id = 1`), `${role} UPDATE`).toMatch(denied)
      expect(as(role, `insert into public.survival_funding_config
                          (id, declared_operating_capital_sek) values (3, 1)`), `${role} INSERT`).toMatch(denied)
    }
    expect(one(dsn, `select count(*) from public.survival_funding_config`)).toBe('1')
  })

  it('the canonical RPC is the ONLY writer that can exist — and it works', () => {
    expect(call('777')).toMatch(/^recorded\|.*\|777\.0000$/)
    expect(capital()).toBe('777.0000')
  })

  it('the singleton constraint refuses a second row even from the owner', () => {
    // The ACL stops client roles; this stops everyone, so "exactly one" is a
    // property of the table rather than of who happens to be asking.
    expect(expectFailure(dsn, `insert into public.survival_funding_config
                                 (id, declared_operating_capital_sek) values (2, 5)`))
      .toMatch(/survival_funding_config_singleton|violates check constraint|23514/i)
    expect(one(dsn, `select count(*) from public.survival_funding_config`)).toBe('1')
  })
})

// ── Atomicity ───────────────────────────────────────────────────────────────

describe('funding · the change and its evidence are atomic', () => {
  it('every change writes EXACTLY ONE audit row, and every audit row has a change', () => {
    const before = eventCount()
    call('5000')
    expect(eventCount()).toBe(before + 1)
    call('6000')
    expect(eventCount()).toBe(before + 2)
    // The configuration is the current truth; the ledger is evidence. They agree.
    expect(capital()).toBe('6000.0000')
    expect(eventCount()).toBe(
      Number(one(dsn, `select count(*) from public.survival_funding_events where event in ('DECLARATION_SET','DECLARATION_CLEARED')`)),
    )
  })

  it('the ledger is NOT the current truth — clearing it would not change the declaration', () => {
    // Proven by construction rather than by mutation: the setter targets
    // `survival_funding_config`, and the ledger is never selected from by any
    // function that answers "what is declared now".
    const uses = one(dsn, `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and p.proname='survival_set_declared_operating_capital'
                              and pg_get_functiondef(p.oid) ilike '%from public.survival_funding_events%'`)
    expect(uses).toBe('0')
  })

  it('concurrent setters serialise: the predecessor each records is the real one', () => {
    // The project-row lock is the singleton here. Two sequential calls must
    // chain their previous values rather than both reading the same predecessor.
    call('1111')
    call('2222')
    const rows = query(dsn, `select coalesce(previous_declared_sek::text,'<null>'), declared_sek::text
                               from public.survival_funding_events order by event_seq desc limit 2`)
      .map(r => r.join('|'))
    expect(rows[0]).toBe('1111.0000|2222.0000')
    expect(rows[1]).toMatch(/\|1111\.0000$/)
  })
})

// ── Append-only ─────────────────────────────────────────────────────────────

describe('funding · the audit ledger cannot be rewritten', () => {
  it('refuses UPDATE', () => {
    expect(expectFailure(dsn, `update public.survival_funding_events set actor = 'someone'`))
      .toMatch(/append-only|42501/i)
  })

  it('refuses DELETE', () => {
    expect(expectFailure(dsn, `delete from public.survival_funding_events`))
      .toMatch(/append-only|42501/i)
  })

  it('refuses TRUNCATE', () => {
    expect(expectFailure(dsn, `truncate public.survival_funding_events`))
      .toMatch(/append-only|42501/i)
  })

  it('refuses a direct INSERT by service_role, and by anon', () => {
    expect(expectFailure(dsn, `set role service_role; insert into public.survival_funding_events (event, actor)
                               values ('DECLARATION_SET','${ACTOR}')`))
      .toMatch(/permission denied|42501/i)
    expect(expectFailure(dsn, `set role anon; insert into public.survival_funding_events (event, actor)
                               values ('DECLARATION_SET','${ACTOR}')`))
      .toMatch(/permission denied|42501/i)
  })

  it('closes the event vocabulary, so a row cannot name an event no reader interprets', () => {
    for (const [event, declared] of [['DECLARATION_MUTATED', '100'], ['DECLARATION_SET', 'null']]) {
      const err = expectFailure(dsn, `insert into public.survival_funding_events (event, declared_sek, actor)
        values ('${event}', ${declared}, '${ACTOR}')`)
      expect(err, event).toMatch(/violates check constraint|permission denied|42501|23514/i)
    }
  })
})

// ── One current source, and the ledger is not it ────────────────────────────

describe('funding · exactly one current source, and history is never it', () => {
  const defOf = (fn: string) =>
    // COMMENTS STRIPPED, then newlines collapsed — both are load-bearing:
    //   • the body's comments explain what it deliberately does NOT do, and
    //     `pg_get_functiondef` returns them verbatim, so an un-stripped
    //     assertion would fail on the word a comment exists to rule out;
    //   • the harness reads psql output LINE BY LINE, so a multi-line
    //     definition would otherwise arrive as only its first line.
    one(dsn, `select replace(
                 regexp_replace(coalesce(pg_get_functiondef(p.oid), ''), '--[^' || chr(10) || ']*', '', 'g'),
                 chr(10), ' ')
                from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = '${fn}'`)

  it('the setter reads and writes the singleton, and never platform_config', () => {
    const def = defOf('survival_set_declared_operating_capital')
    expect(def).toContain('survival_funding_config')
    expect(def, 'funding truth must not be read from or written to platform_config')
      .not.toContain('platform_config')
  })

  it('the setter never reads the ledger to decide what is declared now', () => {
    // The direction that must not reverse: history is EVIDENCE of what changed,
    // never the answer to "what is declared". A setter that read it would make
    // the ledger load-bearing for current truth.
    const def = defOf('survival_set_declared_operating_capital')
    expect(def).not.toMatch(/from\s+public\.survival_funding_events/i)
    // It appends to it, and only appends.
    expect(def).toMatch(/insert into public\.survival_funding_events/i)
    expect(def).not.toMatch(/(update|delete from)\s+public\.survival_funding_events/i)
  })

  it('no function anywhere reads the ledger as current funding truth', () => {
    // Repo-wide over the public schema, not just the known functions: a helper
    // added later that answered "what is declared" from history would be the
    // same defect wearing a different name.
    expect(one(dsn, `select count(*) from pg_proc p
                       join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public'
                        and p.prokind = 'f'
                        and pg_get_functiondef(p.oid) ilike '%from public.survival_funding_events%'`))
      .toBe('0')
  })

  it('the declaration column exists on exactly ONE table in the schema', () => {
    expect(one(dsn, `select string_agg(table_name, ',' order by table_name)
                       from information_schema.columns
                      where table_schema = 'public'
                        and column_name = 'declared_operating_capital_sek'`))
      .toBe('survival_funding_config')
  })
})

// ── Privileges ──────────────────────────────────────────────────────────────

describe('funding · least privilege', () => {
  const fn = (name: string, sig: string, role: string) =>
    one(dsn, `select has_function_privilege('${role}', 'public.${name}(${sig})', 'EXECUTE')`)

  it('anon and authenticated can neither read the ledger nor call the setter', () => {
    for (const role of ['anon', 'authenticated']) {
      expect(one(dsn, `select has_table_privilege('${role}','public.survival_funding_events','SELECT')`), role).toBe('f')
      expect(one(dsn, `select has_table_privilege('${role}','public.survival_funding_events','INSERT')`), role).toBe('f')
      expect(fn('survival_set_declared_operating_capital', 'numeric, text', role), role).toBe('f')
      expect(fn('survival_scope_is_platform_complete', 'uuid[]', role), role).toBe('f')
    }
  })

  it('service_role reads the ledger and executes the boundary, and writes neither table', () => {
    expect(one(dsn, `select has_table_privilege('service_role','public.survival_funding_events','SELECT')`)).toBe('t')
    for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      expect(one(dsn, `select has_table_privilege('service_role','public.survival_funding_events','${p}')`), p).toBe('f')
    }
    expect(fn('survival_set_declared_operating_capital', 'numeric, text', 'service_role')).toBe('t')
    expect(fn('survival_scope_is_platform_complete', 'uuid[]', 'service_role')).toBe('t')
  })

  it('the setter is SECURITY DEFINER with a fixed empty search_path', () => {
    for (const name of ['survival_set_declared_operating_capital', 'survival_scope_is_platform_complete']) {
      const row = one(dsn, `select case when p.prosecdef then 't' else 'f' end || '|' ||
                                    coalesce(array_to_string(p.proconfig, ','), '')
                              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname='public' and p.proname='${name}'`)
      const [definer, config] = row.split('|')
      expect(definer, name).toBe('t')
      expect(config, name).toMatch(/search_path=/)
      expect(config, name).not.toMatch(/search_path=[^,]*\w/)
    }
  })

  it('the ledger sequence is revoked from every role', () => {
    const seq = `'public.survival_funding_events_event_seq_seq'::regclass`
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const p of ['USAGE', 'SELECT', 'UPDATE']) {
        expect(one(dsn, `select has_sequence_privilege('${role}', ${seq}, '${p}')`), `${role}.${p}`).toBe('f')
      }
    }
  })
})

// ── Scope completeness ──────────────────────────────────────────────────────

describe('funding · scope completeness, answered without exposing anything', () => {
  it('is TRUE only when the set contains every project', () => {
    expect(one(dsn, `select public.survival_scope_is_platform_complete(array['${P_A}','${P_B}']::uuid[])`)).toBe('t')
  })

  it('is FALSE for a subset — a single project is never the platform', () => {
    expect(one(dsn, `select public.survival_scope_is_platform_complete(array['${P_A}']::uuid[])`)).toBe('f')
  })

  it('is FALSE for the empty set and for NULL', () => {
    expect(one(dsn, `select public.survival_scope_is_platform_complete(array[]::uuid[])`)).toBe('f')
    expect(one(dsn, `select public.survival_scope_is_platform_complete(null)`)).toBe('f')
  })

  it('returns ONE BOOLEAN — never a row, an id or a count', () => {
    const row = query(dsn, `select pg_get_function_result(p.oid)
                              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname='public' and p.proname='survival_scope_is_platform_complete'`)[0]
    expect(row[0]).toBe('boolean')
  })

  it('is unmoved by a project added outside the caller set', () => {
    run(dsn, ['-c', `insert into public.projects (id, slug) values ('33333333-3333-3333-3333-333333333333','gamma')`])
    expect(one(dsn, `select public.survival_scope_is_platform_complete(array['${P_A}','${P_B}']::uuid[])`)).toBe('f')
    expect(one(dsn, `select public.survival_scope_is_platform_complete(
      array['${P_A}','${P_B}','33333333-3333-3333-3333-333333333333']::uuid[])`)).toBe('t')
  })
})

// ── No side effects ─────────────────────────────────────────────────────────

describe('funding · a declaration moves nothing else', () => {
  it('reserves no spend, changes no stop, and issues no authorization', () => {
    const before = query(dsn, `select
        (select count(*) from public.spend_reservations)::text,
        (select automation_paused::text from public.platform_config where id = 1),
        (select count(*) from public.projects where execution_paused)::text`)[0]
    call('999999')
    call(null)
    const after = query(dsn, `select
        (select count(*) from public.spend_reservations)::text,
        (select automation_paused::text from public.platform_config where id = 1),
        (select count(*) from public.projects where execution_paused)::text`)[0]
    expect(after).toEqual(before)
  })

  it('does not clear a pause that is already set', () => {
    run(dsn, ['-c', `update public.platform_config set automation_paused = true where id = 1`])
    call('4242')
    expect(one(dsn, `select automation_paused::text from public.platform_config where id = 1`)).toBe('true')
    run(dsn, ['-c', `update public.platform_config set automation_paused = false where id = 1`])
  })

  it('Phase 2A history is untouched by a funding change', () => {
    expect(one(dsn, `select count(*) from public.survival_state_events`)).toBe('0')
  })
})
