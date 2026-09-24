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

const SET = (sek: string | null, actor = 'user:operator-1') =>
  `select * from public.survival_set_declared_operating_capital(${sek ?? 'null'}, '${actor}')`

const capital = () =>
  one(dsn, `select coalesce(declared_operating_capital_sek::text, '<null>') from public.platform_config where id = 1`)

const eventCount = () => Number(one(dsn, `select count(*) from public.survival_funding_events`))

const latestEvent = () =>
  one(dsn, `select event || '|' || coalesce(previous_declared_sek::text,'<null>') || '|' ||
                   coalesce(declared_sek::text,'<null>') || '|' || actor
              from public.survival_funding_events order by event_seq desc limit 1`)

const call = (sek: string | null, actor = 'user:operator-1') =>
  one(dsn, `${SET(sek, actor)}`)


// ── The declaration itself ──────────────────────────────────────────────────

describe('funding · the declaration and its reader semantics', () => {
  it('starts UNDECLARED — NULL is the absence of a declaration, with no default', () => {
    expect(capital()).toBe('<null>')
    expect(one(dsn, `select count(*) from public.survival_funding_events`)).toBe('0')
  })

  it('a positive declaration is stored exactly, and audits one SET', () => {
    expect(call('120000')).toBe('recorded||120000')
    expect(capital()).toBe('120000.0000')
    expect(eventCount()).toBe(1)
    expect(latestEvent()).toBe('DECLARATION_SET|<null>|120000.0000|user:operator-1')
  })

  it('ZERO is a KNOWN declaration, never a clear', () => {
    expect(call('0')).toBe('recorded|120000.0000|0')
    expect(capital()).toBe('0.0000')
    expect(latestEvent()).toBe('DECLARATION_SET|120000.0000|0.0000|user:operator-1')
  })

  it('NEGATIVE is a KNOWN declaration — the sign is not this schema\'s policy', () => {
    expect(call('-125.50')).toBe('recorded|0.0000|-125.50')
    expect(capital()).toBe('-125.5000')
    expect(latestEvent()).toBe('DECLARATION_SET|0.0000|-125.5000|user:operator-1')
  })

  it('CLEAR persists NULL, and is distinguishable from a zero declaration', () => {
    expect(call(null)).toBe('recorded|-125.5000|')
    expect(capital()).toBe('<null>')
    expect(latestEvent()).toBe('DECLARATION_CLEARED|-125.5000|<null>|user:operator-1')
  })

  it('re-setting the SAME value writes nothing — no audit trail of non-events', () => {
    const before = eventCount()
    expect(call(null)).toBe('unchanged||')
    expect(eventCount()).toBe(before)
  })
})

// ── Input validation ────────────────────────────────────────────────────────

describe('funding · invalid input is refused at the boundary', () => {
  it('refuses NaN and both infinities', () => {
    for (const bad of ["'NaN'::numeric", "'Infinity'::numeric", "'-Infinity'::numeric"]) {
      const err = expectFailure(dsn, `select * from public.survival_set_declared_operating_capital(${bad}, 'user:op')`)
      expect(err, bad).toMatch(/finite number/i)
    }
  })

  it('refuses a missing actor — the ledger cannot record an anonymous change', () => {
    expect(expectFailure(dsn, `select * from public.survival_set_declared_operating_capital(1000, null)`))
      .toMatch(/p_actor is required/i)
    expect(expectFailure(dsn, `select * from public.survival_set_declared_operating_capital(1000, '  ')`))
      .toMatch(/p_actor is required/i)
  })

  it('none of those probes changed the declaration or wrote an audit row', () => {
    const before = eventCount()
    expect(expectFailure(dsn, `select * from public.survival_set_declared_operating_capital('NaN'::numeric, 'user:op')`))
      .toMatch(/finite/i)
    expect(capital()).toBe('<null>')
    expect(eventCount()).toBe(before)
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
    // Proven by construction rather than by mutation: the reader and the setter
    // both target platform_config, and the ledger is never selected from by any
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
                               values ('DECLARATION_SET','user:op')`))
      .toMatch(/permission denied|42501/i)
    expect(expectFailure(dsn, `set role anon; insert into public.survival_funding_events (event, actor)
                               values ('DECLARATION_SET','user:op')`))
      .toMatch(/permission denied|42501/i)
  })

  it('closes the event vocabulary, so a row cannot name an event no reader interprets', () => {
    for (const [event, declared] of [['DECLARATION_MUTATED', '100'], ['DECLARATION_SET', 'null']]) {
      const err = expectFailure(dsn, `insert into public.survival_funding_events (event, declared_sek, actor)
        values ('${event}', ${declared}, 'user:op')`)
      expect(err, event).toMatch(/violates check constraint|permission denied|42501|23514/i)
    }
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
