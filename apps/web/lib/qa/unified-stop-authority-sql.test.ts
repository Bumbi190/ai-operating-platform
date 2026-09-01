/**
 * G3A — canonical unified stop authority, proven against REAL PostgreSQL.
 *
 * ── WHY THIS SUITE EXECUTES SQL INSTEAD OF READING IT ───────────────────────
 * G2 shipped a migration that passed every source-reading test and then FAILED
 * in production with 42P13, because the test harness built a greenfield database
 * where the function it replaced had never existed. Reading the migration proved
 * the text was right; nothing proved the UPGRADE was possible.
 *
 * So this suite applies `20260830_execution_stop_safety.sql` IN FULL first — the
 * migration that creates `set_project_execution_paused` — and only then applies
 * G3A on top. The state this exercises is the state production is actually in.
 * P1–P3 exist specifically to keep that honest.
 *
 * It also proves the properties that no amount of source reading can establish:
 * that the ledger cannot be rewritten (P10–P12), that a failed audit write
 * prevents the state change rather than being lost beside it (P18), and that two
 * concurrent operators produce one transition rather than two (P19).
 *
 * Follows the harness of `budget-scopes-sql.test.ts`: SKIPS loudly with no local
 * Postgres, and FAILS instead of skipping wherever proof is required (CI=true or
 * ATLAS_SQL_TEST_REQUIRED=1). A green run that skipped this proves nothing about
 * the kill switch.
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

function one(dsn: string, sql: string): string {
  const rows = query(dsn, sql)
  return rows.length ? rows[0].join('|') : ''
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * One pause attempt inside its own transaction, held open for `holdMs` so a
 * second caller genuinely overlaps it. Separate PROCESS, therefore a separate
 * backend and a separate transaction — which is the whole point.
 */
function concurrentPause(reason: string, holdMs: number): Promise<string> {
  const call = `public.stop_set_platform_automation(true, '${ACTOR}', '${reason}')`
  const sql = holdMs > 0
    ? `begin; select changed::text from ${call}; select pg_sleep(${holdMs / 1000}); commit;`
    : `begin; select changed::text from ${call}; commit;`
  return new Promise((resolve, reject) => {
    const p = spawn(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', sql],
      { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', d => { out += d })
    // NB: `::text` on a boolean yields 'true'/'false', not psql's display 't'/'f'.
    p.on('close', () => resolve(
      out.split('\n').map(l => l.trim()).filter(l => l === 'true' || l === 'false')[0] ?? ''))
    p.on('error', reject)
  })
}

/** Runs SQL expected to fail; returns the error text (or '' if it wrongly succeeded). */
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
    execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'],
      { stdio: 'pipe', timeout: 10_000 })
    return true
  } catch { return false }
})()

const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'

if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn(
    '[unified-stop-authority-sql] SKIPPED — no reachable local Postgres. The G3A ' +
    'stop authority (append-only ledger, atomic audit, upgrade path) was NOT ' +
    'proven in this run. Set ATLAS_SQL_TEST_URL to enable it.',
  )
}

const DB_NAME = `omnira_g3a_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

/**
 * Production-shaped subset: exactly the tables the predecessor migration's four
 * functions touch, in their PRE-G3A shape. `set_project_execution_paused` must
 * be creatable here, or P2 (its retirement) would be proving nothing.
 */
const FIXTURE = `
create extension if not exists pgcrypto;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  execution_paused boolean not null default false,
  paused_at timestamptz,
  paused_reason text);

create table public.platform_config (
  id int primary key default 1,
  automation_paused boolean not null default false,
  max_daily_renders int not null default 4,
  max_retry_attempts int not null default 3,
  paused_at timestamptz,
  paused_reason text,
  updated_at timestamptz not null default now());

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  status text not null default 'pending',
  attempts int not null default 0,
  max_attempts int not null default 3,
  cancel_requested boolean not null default false,
  claim_id uuid,
  claimed_at timestamptz, started_at timestamptz, lease_until timestamptz,
  created_at timestamptz not null default now());

create table public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  status text not null default 'active',
  current_state text not null default 'start',
  wake_at timestamptz);

create table public.atlas_authorizations (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null,
  project_id uuid,
  event_type text not null,
  target_type text, target_id text,
  expires_at timestamptz);

-- Roles are cluster-wide, not per-database, so a previous suite's role survives
-- this database being dropped. Creating it unconditionally would make the whole
-- fixture fail on the second run of the day.
do $do$ begin
  if not exists (select 1 from pg_roles where rolname='service_role')
    then create role service_role; end if;
end $do$;

insert into public.platform_config (id) values (1);
insert into public.projects (id, slug) values
  ('11111111-1111-1111-1111-111111111111', 'alpha'),
  ('22222222-2222-2222-2222-222222222222', 'beta');
`

const P_ALPHA = '11111111-1111-1111-1111-111111111111'
const P_BETA  = '22222222-2222-2222-2222-222222222222'
const ACTOR   = 'user:00000000-0000-0000-0000-0000000000aa'

const d = AVAILABLE ? describe : describe.skip

beforeAll(() => {
  if (!AVAILABLE) {
    if (SQL_REQUIRED) {
      throw new Error(
        '[unified-stop-authority-sql] Postgres REQUIRED but unreachable. The G3A ' +
        'stop authority cannot be proven; failing rather than skipping.')
    }
    return
  }
  run(ADMIN_URL, ['-c', `create database "${DB_NAME}"`])
  dsn = dsnFor(DB_NAME)
  run(dsn, ['-c', FIXTURE])
  // THE UPGRADE PATH: predecessor first, in full, then G3A on top.
  run(dsn, ['-f', join(process.cwd(), 'supabase/migrations/20260830_execution_stop_safety.sql')])
})

afterAll(() => {
  if (!AVAILABLE || !dsn) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DB_NAME}" with (force)`]) } catch { /* best effort */ }
})

const G3A = () => join(process.cwd(), 'supabase/migrations/20260831_unified_stop_authority.sql')

// ── A. The upgrade path itself ──────────────────────────────────────────────

d('P1–P3 · upgrade path', () => {
  it('P1 · the predecessor really did create the function G3A retires', () => {
    // If this ever goes to 0, P2 below becomes a tautology and the retirement
    // is unproven — exactly the greenfield trap that let 42P13 reach production.
    expect(one(dsn, `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.proname='set_project_execution_paused'`)).toBe('1')
  })

  it('P2 · G3A applies cleanly on top of it', () => {
    expect(() => run(dsn, ['-f', G3A()])).not.toThrow()
    expect(one(dsn, `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.proname='set_project_execution_paused'`)).toBe('0')
  })

  it('P3 · the drop did not cascade into the execution path', () => {
    // The migration uses no CASCADE. These three enforce the pause predicate in
    // SQL; losing any of them silently would disable the kill switch.
    for (const fn of ['claim_runs', 'request_run_cancel', 'workflow_rearm']) {
      expect(one(dsn, `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='${fn}'`)).toBe('1')
    }
  })
})

// ── B. Transitions and idempotency ──────────────────────────────────────────

d('P4–P9 · transitions are recorded, repeats are not', () => {
  it('P4 · global pause flips the boolean and writes exactly one PAUSED event', () => {
    const r = one(dsn, `select changed, previous_paused, new_paused, event_id is not null
                          from public.stop_set_platform_automation(true, '${ACTOR}', 'incident 42')`)
    expect(r).toBe('t|f|t|t')
    expect(one(dsn, `select automation_paused, paused_reason from public.platform_config where id=1`))
      .toBe('t|incident 42')
    expect(one(dsn, `select count(*), max(event), max(actor), max(reason) from public.stop_events
                     where scope_type='PLATFORM_AUTOMATION'`)).toBe(`1|PAUSED|${ACTOR}|incident 42`)
  })

  it('P5 · repeating the command is idempotent and writes NO second row', () => {
    // Transition history, not command history. A ledger that records button
    // presses answers the wrong question during an incident.
    const r = one(dsn, `select changed, event_id is null
                          from public.stop_set_platform_automation(true, '${ACTOR}', 'again')`)
    expect(r).toBe('f|t')
    expect(one(dsn, `select count(*) from public.stop_events where scope_type='PLATFORM_AUTOMATION'`)).toBe('1')
    // ...and the no-op did not overwrite the original reason.
    expect(one(dsn, `select paused_reason from public.platform_config where id=1`)).toBe('incident 42')
  })

  it('P6 · resume records RESUMED and clears the pause provenance', () => {
    expect(one(dsn, `select changed, previous_paused, new_paused
                       from public.stop_set_platform_automation(false, '${ACTOR}', null)`)).toBe('t|t|f')
    expect(one(dsn, `select automation_paused, paused_at is null, paused_reason is null
                       from public.platform_config where id=1`)).toBe('f|t|t')
    expect(one(dsn, `select count(*) from public.stop_events
                     where scope_type='PLATFORM_AUTOMATION' and event='RESUMED'`)).toBe('1')
  })

  it('P7 · project pause is scoped to one project and recorded against it', () => {
    expect(one(dsn, `select changed from public.stop_set_project_execution(
                       '${P_ALPHA}'::uuid, true, '${ACTOR}', 'runaway loop')`)).toBe('t')
    expect(one(dsn, `select execution_paused, paused_reason from public.projects where id='${P_ALPHA}'`))
      .toBe('t|runaway loop')
    expect(one(dsn, `select count(*), max(scope_id::text) from public.stop_events
                     where scope_type='PROJECT_EXECUTION'`)).toBe(`1|${P_ALPHA}`)
  })

  it('P8 · pausing one project never touches another', () => {
    expect(one(dsn, `select execution_paused, paused_at is null from public.projects where id='${P_BETA}'`))
      .toBe('f|t')
  })

  it('P9 · project repeats are idempotent too', () => {
    expect(one(dsn, `select changed, event_id is null from public.stop_set_project_execution(
                       '${P_ALPHA}'::uuid, true, '${ACTOR}', 'again')`)).toBe('f|t')
    expect(one(dsn, `select count(*) from public.stop_events where scope_type='PROJECT_EXECUTION'`)).toBe('1')
  })
})

// ── C. The ledger cannot be rewritten ───────────────────────────────────────

d('P10–P12 · append-only is enforced, not merely intended', () => {
  it('P10 · UPDATE is refused', () => {
    const err = expectFailure(dsn, `update public.stop_events set actor='someone else'`)
    expect(err).toMatch(/append-only/)
    expect(one(dsn, `select count(*) from public.stop_events where actor='someone else'`)).toBe('0')
  })

  it('P11 · DELETE is refused', () => {
    const before = one(dsn, `select count(*) from public.stop_events`)
    expect(expectFailure(dsn, `delete from public.stop_events`)).toMatch(/append-only/)
    expect(one(dsn, `select count(*) from public.stop_events`)).toBe(before)
  })

  it('P12 · TRUNCATE is refused', () => {
    // TRUNCATE bypasses row-level triggers entirely; without its own statement
    // trigger the whole ledger could be erased in one statement.
    const before = one(dsn, `select count(*) from public.stop_events`)
    expect(expectFailure(dsn, `truncate public.stop_events`)).toMatch(/append-only/)
    expect(one(dsn, `select count(*) from public.stop_events`)).toBe(before)
  })
})

// ── D. The ledger cannot hold a lie ─────────────────────────────────────────

d('P13–P16 · the schema rejects incoherent rows', () => {
  const ins = (cols: string, vals: string) =>
    `insert into public.stop_events (${cols}) values (${vals})`

  it('P13 · a no-op "transition" cannot be inserted', () => {
    expect(expectFailure(dsn, ins(
      'scope_type, scope_id, event, previous_paused, new_paused, actor',
      `'PLATFORM_AUTOMATION', null, 'PAUSED', true, true, '${ACTOR}'`)))
      .toMatch(/stop_events_is_a_transition/)
  })

  it('P14 · the event name cannot disagree with the state it records', () => {
    expect(expectFailure(dsn, ins(
      'scope_type, scope_id, event, previous_paused, new_paused, actor',
      `'PLATFORM_AUTOMATION', null, 'PAUSED', true, false, '${ACTOR}'`)))
      .toMatch(/stop_events_event_matches_state/)
  })

  it('P15 · scope_id presence must match scope_type, both ways', () => {
    expect(expectFailure(dsn, ins(
      'scope_type, scope_id, event, previous_paused, new_paused, actor',
      `'PLATFORM_AUTOMATION', '${P_ALPHA}'::uuid, 'PAUSED', false, true, '${ACTOR}'`)))
      .toMatch(/stop_events_scope_id_matches_type/)
    expect(expectFailure(dsn, ins(
      'scope_type, scope_id, event, previous_paused, new_paused, actor',
      `'PROJECT_EXECUTION', null, 'PAUSED', false, true, '${ACTOR}'`)))
      .toMatch(/stop_events_scope_id_matches_type/)
  })

  it('P16 · an anonymous transition is rejected at both layers', () => {
    // Schema: a blank actor cannot be stored at all.
    expect(expectFailure(dsn, ins(
      'scope_type, scope_id, event, previous_paused, new_paused, actor',
      `'PLATFORM_AUTOMATION', null, 'PAUSED', false, true, '   '`)))
      .toMatch(/stop_events_actor_present/)
    // Function: it refuses before touching the boolean, so a nameless caller
    // cannot pause the platform and merely fail to be recorded.
    expect(expectFailure(dsn, `select public.stop_set_platform_automation(true, '  ', null)`))
      .toMatch(/p_actor is required/)
    expect(one(dsn, `select automation_paused from public.platform_config where id=1`)).toBe('f')
  })
})

// ── E. Resolution, atomicity, concurrency ───────────────────────────────────

d('P17–P20 · the properties source-reading cannot establish', () => {
  it('P17 · stop_state composes both scopes and never guesses', () => {
    // alpha is paused (P7), global is clear (P6).
    expect(one(dsn, `select global_paused, project_requested, project_found, project_paused
                       from public.stop_state('${P_ALPHA}'::uuid)`)).toBe('f|t|t|t')
    expect(one(dsn, `select global_paused, project_found, project_paused
                       from public.stop_state('${P_BETA}'::uuid)`)).toBe('f|t|f')
    // An unknown project is NULL — "I do not know" — never false. Coalescing it
    // would hand autonomous work a green light derived from a failed lookup.
    expect(one(dsn, `select project_found, project_paused is null
                       from public.stop_state('33333333-3333-3333-3333-333333333333'::uuid)`)).toBe('f|t')
    // No project asked about: still exactly one row, project side null.
    expect(one(dsn, `select project_requested, project_paused is null from public.stop_state(null)`))
      .toBe('f|t')
  })

  it('P18 · a failed audit write PREVENTS the state change', () => {
    // The property that makes this an authority rather than a log: the boolean
    // and its evidence share one transaction. A TS update followed by a separate
    // insert would leave the flag moved and the ledger silent.
    run(dsn, ['-c', `create function public.g3a_block_audit() returns trigger
                     language plpgsql as $fn$ begin
                       raise exception 'audit unavailable'; end $fn$;
                     create trigger g3a_block before insert on public.stop_events
                       for each row execute function public.g3a_block_audit();`])
    const before = one(dsn, `select execution_paused from public.projects where id='${P_BETA}'`)
    expect(before).toBe('f')
    expect(expectFailure(dsn, `select public.stop_set_project_execution(
      '${P_BETA}'::uuid, true, '${ACTOR}', 'should not persist')`)).toMatch(/audit unavailable/)
    expect(one(dsn, `select execution_paused, paused_reason is null
                       from public.projects where id='${P_BETA}'`)).toBe('f|t')
    run(dsn, ['-c', `drop trigger g3a_block on public.stop_events; drop function public.g3a_block_audit();`])
  })

  it('P19 · two genuinely overlapping operators produce ONE transition', async () => {
    // REAL overlapping transactions in separate processes. A single-statement
    // CTE would NOT prove this: both branches would share one transaction, where
    // the row lock is re-entrant and the second call sees the first's write for
    // free. That would test snapshot visibility and claim to have tested
    // concurrency.
    //
    // Here the second session starts while the first still holds the lock. With
    // FOR UPDATE it blocks, then re-reads and finds the state already changed:
    // one 't', one 'f', one ledger row. Without it, both read false, both write,
    // and the ledger claims the same change happened twice.
    run(dsn, ['-c', `select public.stop_set_platform_automation(false, '${ACTOR}', null)`])
    const before = Number(one(dsn, `select count(*) from public.stop_events
                                    where scope_type='PLATFORM_AUTOMATION'`))

    const first = concurrentPause('race-a', 1500)
    await wait(400)                       // let the first transaction take the lock
    const second = await concurrentPause('race-b', 0)
    const firstResult = await first

    expect([firstResult, second].sort()).toEqual(['false', 'true'])
    expect(Number(one(dsn, `select count(*) from public.stop_events
                            where scope_type='PLATFORM_AUTOMATION'`)) - before).toBe(1)
  }, 60_000)

  it('P20 · a missing platform_config row fails loudly instead of allowing', () => {
    // Silently treating "no config" as "not paused" is how a kill switch becomes
    // a no-op. The read model must also not invent a row.
    // NOT a temporary table: every psql call here is a separate process, and a
    // temp table would vanish before the restore below could see it.
    run(dsn, ['-c', `create table g3a_saved as select * from public.platform_config;
                     delete from public.platform_config where id=1;`])
    expect(expectFailure(dsn, `select public.stop_set_platform_automation(true, '${ACTOR}', null)`))
      .toMatch(/platform_config row 1 is missing/)
    expect(one(dsn, `select count(*) from public.stop_state(null)`)).toBe('0')
    run(dsn, ['-c', `insert into public.platform_config select * from g3a_saved;
                     drop table g3a_saved;`])
  })
})

// ── F. Privileges ───────────────────────────────────────────────────────────

d('P21 · the authority is service_role-only', () => {
  it('no anon/authenticated grant survives on any G3A function', () => {
    for (const [fn, args] of [
      ['stop_set_platform_automation', 'boolean, text, text'],
      ['stop_set_project_execution', 'uuid, boolean, text, text'],
      ['stop_state', 'uuid'],
    ] as const) {
      const acl = one(dsn, `select coalesce(array_to_string(p.proacl::text[],' '),'')
                              from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                             where n.nspname='public' and p.proname='${fn}'
                               and pg_get_function_identity_arguments(p.oid)=
                                   (select pg_get_function_identity_arguments(oid) from pg_proc
                                     where proname='${fn}' limit 1)`)
      expect(acl).not.toMatch(/\banon=/)
      expect(acl).not.toMatch(/\bauthenticated=/)
      expect(acl).toMatch(/service_role=X/)
      expect(args.length).toBeGreaterThan(0)
    }
  })

  it('the ledger itself is not readable by anon or authenticated', () => {
    const acl = one(dsn, `select coalesce(array_to_string(relacl::text[],' '),'')
                            from pg_class where relname='stop_events'
                              and relnamespace='public'::regnamespace`)
    expect(acl).not.toMatch(/\banon=/)
    expect(acl).not.toMatch(/\bauthenticated=/)
    expect(one(dsn, `select relrowsecurity from pg_class where relname='stop_events'
                       and relnamespace='public'::regnamespace`)).toBe('t')
  })
})
