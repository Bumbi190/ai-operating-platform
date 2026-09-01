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

-- Roles are cluster-wide, not per-database, so a previous suite's role survives
-- this database being dropped. Creating them unconditionally would make the
-- whole fixture fail on the second run of the day.
do $do$ begin
  if not exists (select 1 from pg_roles where rolname='service_role')
    then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='anon')
    then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated')
    then create role authenticated; end if;
end $do$;

-- REPRODUCE PRODUCTION'S DEFAULT ACL. This is the whole reason the privilege
-- proofs below are worth running. Supabase ships pg_default_acl granting
-- arwdDxtm on new public tables to anon, authenticated AND service_role, so a
-- table gets full write access the moment it is created, with no GRANT written
-- anywhere. Verified in production; spend_reservations.relacl shows exactly
-- this shape.
--
-- Without these two lines the fixture would be a greenfield database where
-- service_role starts with NOTHING, the revoke would be a no-op, and P22 would
-- "prove" a property the migration never actually established — the same
-- greenfield trap that let G2's 42P13 reach production.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- Tables are created BELOW this point, so they inherit the default ACL the
-- same way production tables do.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  -- A harmless, production-shaped non-stop column, so "unrelated writes still
  -- work" can be proven rather than asserted.
  name text,
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

// ── F2. The ledger's table privileges (HARDENING 1) ─────────────────────────

d('P22 · service_role may READ the ledger and may not WRITE it directly', () => {
  // WHY THIS IS LOAD-BEARING. The application talks to Postgres as service_role,
  // which has rolbypassrls=true in production — so RLS on this table is not a
  // defence against the application itself. And Supabase's default ACL hands
  // every new public table full `arwdDxtm` to service_role at CREATE time.
  //
  // If the migration stays silent about service_role, the append-only triggers
  // still refuse UPDATE/DELETE/TRUNCATE, but a direct INSERT succeeds — and a
  // ledger whose own subject can fabricate rows is not audit provenance. These
  // proofs run as the real role, not as the owner.

  const asServiceRole = (sql: string) =>
    expectFailure(dsn, `set local role service_role; ${sql}`)
  const okAsServiceRole = (sql: string) =>
    run(dsn, ['-c', `begin; set local role service_role; ${sql}; commit;`])

  it('the default ACL really did grant service_role write access at CREATE time', () => {
    // GUARDS THE GUARD: if the fixture stops reproducing production's default
    // ACL, every proof below becomes vacuous — service_role would start with
    // nothing and the revoke would be testing itself.
    //
    // The privilege letters are deliberately matched as a version-independent
    // prefix: PostgreSQL 17 (production) adds `m` for MAINTAIN, so production
    // reads `arwdDxtm` while a PG16 host reads `arwdDxt`. Pinning the exact
    // string would make this suite fail on the wrong Postgres for a reason that
    // has nothing to do with the property being proven.
    expect(one(dsn, `select defaclacl::text from pg_default_acl
                      where defaclnamespace = 'public'::regnamespace limit 1`))
      .toMatch(/service_role=arwdDxt/)
    // And the write bits really were inherited by this very table before the
    // migration revoked them — the ledger row proving the hazard was real.
    expect(one(dsn, `select count(*) from pg_default_acl d
                      where d.defaclnamespace = 'public'::regnamespace
                        and d.defaclacl::text like '%service_role=arwdDxt%'`)).toBe('1')
  })

  it('SELECT succeeds', () => {
    const out = run(dsn, ['-t', '-A', '-c',
      `begin; set local role service_role; select count(*) from public.stop_events; commit;`])
    expect(out.trim().split('\n').some(l => /^\d+$/.test(l.trim()))).toBe(true)
    expect(one(dsn, `select has_table_privilege('service_role','public.stop_events','SELECT')`))
      .toBe('t')
  })

  it('direct INSERT is DENIED — the ledger cannot be fabricated', () => {
    const before = one(dsn, `select count(*) from public.stop_events`)
    expect(asServiceRole(`insert into public.stop_events
      (scope_type, scope_id, event, previous_paused, new_paused, actor)
      values ('PLATFORM_AUTOMATION', null, 'PAUSED', false, true, 'user:forged')`))
      .toMatch(/permission denied/i)
    expect(one(dsn, `select count(*) from public.stop_events`)).toBe(before)
    expect(one(dsn, `select has_table_privilege('service_role','public.stop_events','INSERT')`))
      .toBe('f')
  })

  it('direct UPDATE, DELETE and TRUNCATE are DENIED at the privilege layer', () => {
    // Denied by PRIVILEGE, not merely by the append-only trigger — two
    // independent barriers, so losing either one alone is not sufficient.
    expect(asServiceRole(`update public.stop_events set actor='x'`)).toMatch(/permission denied/i)
    expect(asServiceRole(`delete from public.stop_events`)).toMatch(/permission denied/i)
    expect(asServiceRole(`truncate public.stop_events`)).toMatch(/permission denied|must be owner/i)
    for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      expect(one(dsn, `select has_table_privilege('service_role','public.stop_events','${priv}')`),
        `service_role must not hold ${priv}`).toBe('f')
    }
  })

  it('anon and authenticated hold NOTHING at all', () => {
    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        expect(one(dsn, `select has_table_privilege('${role}','public.stop_events','${priv}')`),
          `${role} must not hold ${priv}`).toBe('f')
      }
    }
  })

  it('the SECURITY DEFINER setters STILL append when invoked as service_role', () => {
    // The other half of the invariant. Removing write privileges must close the
    // direct path without closing the audited one — otherwise the migration is
    // secure and broken.
    const before = Number(one(dsn, `select count(*) from public.stop_events`))
    const paused = one(dsn, `select automation_paused from public.platform_config where id=1`) === 't'
    okAsServiceRole(`select public.stop_set_platform_automation(${!paused}, '${ACTOR}', 'via definer')`)
    expect(Number(one(dsn, `select count(*) from public.stop_events`))).toBe(before + 1)
    expect(one(dsn, `select actor, reason from public.stop_events
                     order by created_at desc limit 1`)).toBe(`${ACTOR}|via definer`)
    // ...and the same for the project scope.
    okAsServiceRole(`select public.stop_set_project_execution('${P_BETA}'::uuid, true, '${ACTOR}', 'definer proj')`)
    expect(Number(one(dsn, `select count(*) from public.stop_events`))).toBe(before + 2)
  })

  it('stop_state is still callable as service_role', () => {
    const out = run(dsn, ['-t', '-A', '-c',
      `begin; set local role service_role; select global_paused from public.stop_state(null); commit;`])
    expect(out).toMatch(/[tf]/)
  })
})

// ── F3. The stop-state write guard (FINAL DB AUTHORITY) ─────────────────────

d('P23 · service_role cannot write stop state directly, but the setters can', () => {
  // THE LAST BYPASS. service_role holds direct UPDATE on both tables in
  // production and has rolbypassrls, so neither privileges nor RLS stop it
  // writing the booleans behind the setters' back. These prove the trigger does.

  const asServiceRole = (sql: string) =>
    expectFailure(dsn, `set local role service_role; ${sql}`)
  const okAsServiceRole = (sql: string) =>
    run(dsn, ['-c', `begin; set local role service_role; ${sql}; commit;`])

  it('P23a · the guard functions are SECURITY INVOKER — the load-bearing property', () => {
    // A SECURITY DEFINER guard would run as ITS owner and therefore see the
    // trusted identity even for a direct service_role UPDATE, silently
    // authorising the exact bypass it exists to close.
    for (const fn of ['stop_guard_platform_config', 'stop_guard_projects']) {
      expect(one(dsn, `select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                        where n.nspname='public' and p.proname='${fn}'`),
        `${fn} MUST NOT be SECURITY DEFINER`).toBe('f')
      expect(one(dsn, `select coalesce(array_to_string(proconfig,','),'') from pg_proc p
                        join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='${fn}'`))
        .toContain('search_path=')
    }
  })

  it('P23b · the identities the guard depends on are pinned', () => {
    // If table owner and setter owner ever drift apart, the guard stops
    // authorising the setters — or worse, starts authorising something else.
    // Fail loudly rather than silently disabling the kill switch.
    const owner = one(dsn, `select pg_get_userbyid(relowner) from pg_class
                             where relname='platform_config' and relnamespace='public'::regnamespace`)
    expect(owner).not.toBe('')
    expect(one(dsn, `select pg_get_userbyid(relowner) from pg_class
                      where relname='projects' and relnamespace='public'::regnamespace`)).toBe(owner)
    for (const fn of ['stop_set_platform_automation', 'stop_set_project_execution']) {
      expect(one(dsn, `select pg_get_userbyid(proowner)||'/'||prosecdef from pg_proc p
                        join pg_namespace n on n.oid=p.pronamespace
                       where n.nspname='public' and p.proname='${fn}'`),
        `${fn} must be SECURITY DEFINER owned by the table owner`).toBe(`${owner}/true`)
    }
  })

  it('P23c · PostgreSQL really does swap current_user inside SECURITY DEFINER', () => {
    // The guard's entire premise, proven rather than documented. A temporary
    // probe owned by the same trusted role as the real setters.
    run(dsn, ['-c', `create function public.g3a_probe_current_user()
                     returns text language sql security definer set search_path to ''
                     as $fn$ select current_user::text $fn$;`])
    const inside = run(dsn, ['-t', '-A', '-c',
      `begin; set local role service_role; select public.g3a_probe_current_user(); commit;`])
      .trim().split('\n').filter(Boolean).pop() ?? ''
    const outside = run(dsn, ['-t', '-A', '-c',
      `begin; set local role service_role; select current_user::text; commit;`])
      .trim().split('\n').filter(Boolean).pop() ?? ''
    const owner = one(dsn, `select pg_get_userbyid(relowner) from pg_class
                             where relname='platform_config' and relnamespace='public'::regnamespace`)
    expect(outside).toBe('service_role')       // direct execution
    expect(inside).toBe(owner)                 // inside SECURITY DEFINER
    expect(inside).not.toBe(outside)           // the distinction the guard reads
    // Not a production object.
    run(dsn, ['-c', `drop function public.g3a_probe_current_user();`])
    expect(one(dsn, `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='public' and p.proname='g3a_probe_current_user'`)).toBe('0')
  })

  it('P23d · direct PLATFORM stop writes are refused, whole bundle', () => {
    const before = one(dsn, `select automation_paused, paused_at, paused_reason
                               from public.platform_config where id=1`)
    for (const [label, sql] of [
      ['automation_paused', `update public.platform_config set automation_paused = not automation_paused where id=1`],
      ['paused_at',         `update public.platform_config set paused_at = now() where id=1`],
      ['paused_reason',     `update public.platform_config set paused_reason = 'forged' where id=1`],
    ] as const) {
      expect(asServiceRole(sql), `${label} must be refused`)
        .toMatch(/stop_set_platform_automation|permission denied/i)
    }
    // Nothing moved.
    expect(one(dsn, `select automation_paused, paused_at, paused_reason
                       from public.platform_config where id=1`)).toBe(before)
  })

  it('P23e · direct PROJECT stop writes are refused, whole bundle', () => {
    const before = one(dsn, `select execution_paused, paused_at, paused_reason
                               from public.projects where id='${P_ALPHA}'`)
    for (const [label, sql] of [
      ['execution_paused', `update public.projects set execution_paused = not execution_paused where id='${P_ALPHA}'`],
      ['paused_at',        `update public.projects set paused_at = now() where id='${P_ALPHA}'`],
      ['paused_reason',    `update public.projects set paused_reason = 'forged' where id='${P_ALPHA}'`],
    ] as const) {
      expect(asServiceRole(sql), `${label} must be refused`)
        .toMatch(/stop_set_project_execution|permission denied/i)
    }
    expect(one(dsn, `select execution_paused, paused_at, paused_reason
                       from public.projects where id='${P_ALPHA}'`)).toBe(before)
  })

  it('P23f · UNRELATED writes still work — this is why the guard is surgical', () => {
    // A blanket REVOKE would have broken these. Both table families keep an
    // ordinary writable column.
    okAsServiceRole(`update public.platform_config set updated_at = now() where id=1`)
    okAsServiceRole(`update public.projects set name = 'renamed' where id='${P_BETA}'`)
    expect(one(dsn, `select name from public.projects where id='${P_BETA}'`)).toBe('renamed')
    // ...and a no-op that MENTIONS a protected column is harmless, because the
    // guard reasons on IS DISTINCT FROM rather than on the SET clause.
    okAsServiceRole(`update public.platform_config
                       set paused_reason = paused_reason, updated_at = now() where id=1`)
  })

  it('P23g · the canonical setters still succeed as service_role, atomically', () => {
    // The other half: closing the direct path must not close the audited one.
    const before = Number(one(dsn, `select count(*) from public.stop_events`))
    const wasPaused = one(dsn, `select automation_paused from public.platform_config where id=1`) === 't'
    okAsServiceRole(`select public.stop_set_platform_automation(${!wasPaused}, '${ACTOR}', 'guarded path')`)
    expect(one(dsn, `select automation_paused from public.platform_config where id=1`))
      .toBe(wasPaused ? 'f' : 't')
    // Boolean AND provenance moved, and exactly one ledger row appeared.
    expect(Number(one(dsn, `select count(*) from public.stop_events`))).toBe(before + 1)
    expect(one(dsn, `select scope_type, actor, reason from public.stop_events
                     order by created_at desc limit 1`)).toBe(`PLATFORM_AUTOMATION|${ACTOR}|guarded path`)

    const pWas = one(dsn, `select execution_paused from public.projects where id='${P_ALPHA}'`) === 't'
    okAsServiceRole(`select public.stop_set_project_execution('${P_ALPHA}'::uuid, ${!pWas}, '${ACTOR}', 'guarded proj')`)
    expect(Number(one(dsn, `select count(*) from public.stop_events`))).toBe(before + 2)
    expect(one(dsn, `select scope_type, scope_id::text from public.stop_events
                     order by created_at desc limit 1`)).toBe(`PROJECT_EXECUTION|${P_ALPHA}`)
  })

  it('P23h · a project cannot be CREATED already stopped, but normal creation works', () => {
    // Normal creation relies entirely on column defaults — verified against the
    // only application INSERT, which sets no stop column.
    okAsServiceRole(`insert into public.projects (id, slug, name)
                     values ('44444444-4444-4444-4444-444444444444', 'gamma', 'Gamma')`)
    expect(one(dsn, `select execution_paused, paused_at is null from public.projects
                      where slug='gamma'`)).toBe('f|t')
    // Arriving at "paused" with no transition row would make the ledger describe
    // a system that never stopped while a project sat stopped.
    expect(asServiceRole(`insert into public.projects (slug, name, execution_paused)
                          values ('delta', 'Delta', true)`)).toMatch(/already stopped/i)
    expect(asServiceRole(`insert into public.projects (slug, name, paused_reason)
                          values ('epsilon', 'Epsilon', 'forged')`)).toMatch(/already stopped/i)
    expect(one(dsn, `select count(*) from public.projects where slug in ('delta','epsilon')`)).toBe('0')
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
