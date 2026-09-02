/**
 * G3C-2A — execution ADMISSION is stop-atomic. Proven against REAL PostgreSQL
 * with REAL concurrent sessions.
 *
 * ── THE RACE ───────────────────────────────────────────────────────────────
 *   T1  claim_runs' candidate query reads projects.execution_paused and sees clear
 *   T2  an operator pauses that project, and the pause COMMITS
 *   T3  the same statement's UPDATE moves the run to 'running'
 *
 * Before this migration T3 succeeded. The predicate was an unlocked read, so
 * nothing ordered it against the pause — and `platform_config.automation_paused`
 * was never consulted at all, so the global switch did not reach run admission.
 *
 * ── WHY SEPARATE PROCESSES ─────────────────────────────────────────────────
 * Row locks live until COMMIT. One transaction, a CTE, or two sequential calls
 * cannot demonstrate a lock conflict — the lock is re-entrant and the second
 * caller sees the first's uncommitted work for free. Every race below runs in its
 * own psql process, and the blocking is MEASURED in wall time, not assumed.
 *
 * ── WHY THE PREDECESSOR IS MATERIALISED ────────────────────────────────────
 * G2 shipped a migration that passed every test and then failed in production,
 * because the harness had built a greenfield database. So the suite installs the
 * ACTUAL predecessor bodies — copied from the deployed pg_proc source — and
 * proves the forbidden interleaving really happens against them, before proving
 * the migration makes it impossible. A green upgrade proof against a simplified
 * stand-in is worth nothing.
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
const dsnFor = (db: string) => { const u = new URL(ADMIN_URL); u.pathname = `/${db}`; return u.toString() }

function run(dsn: string, args: string[]): string {
  try {
    return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, ...args],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000 })
  } catch (e) {
    // execFileSync's default message is just the command line, which hides the
    // one thing worth reading. Surface what Postgres actually said.
    throw new Error(`psql failed: ${String((e as { stderr?: Buffer }).stderr ?? '').trim()}`)
  }
}
function query(dsn: string, sql: string): string[][] {
  let out: string
  try {
    out = execFileSync(PSQL!,
      ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-F', '|', '-d', dsn, '-c', sql],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
  } catch (e) {
    throw new Error(`psql failed: ${String((e as { stderr?: Buffer }).stderr ?? '').trim()}`)
  }
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|'))
}
const one = (dsn: string, sql: string) => { const r = query(dsn, sql); return r.length ? r[0].join('|') : '' }

/**
 * Returns the SQLSTATE, or '' when the statement succeeded.
 *
 * Asked of PostgreSQL through GET STACKED DIAGNOSTICS rather than scraped from
 * psql's stderr. An earlier version parsed the text and matched `RAISE` out of
 * the CONTEXT line as a five-character code, reporting a confident, wrong
 * SQLSTATE for every policy failure. Message wording and LOCATION text are not
 * a contract; the code is.
 */
function sqlstateOf(dsn: string, sql: string): string {
  return one(dsn, `select public.g3c2a_probe_exec($probe$${sql}$probe$)`)
}

/** Runs SQL in its OWN process; resolves with output, error text and elapsed ms. */
function session(dsn: string, sql: string): Promise<{ out: string; err: string; ms: number }> {
  const t0 = Date.now()
  return new Promise((resolve, reject) => {
    const p = spawn(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', sql],
      { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { err += d })
    p.on('close', () => resolve({ out, err, ms: Date.now() - t0 }))
    p.on('error', reject)
  })
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

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
    '[stop-atomic-admission-sql] SKIPPED — no reachable local Postgres. The admission ' +
    'races (a claim committing after a committed pause) were NOT proven in this run. ' +
    'Set ATLAS_SQL_TEST_URL to enable them.',
  )
}

const DB_NAME = `omnira_g3c2a_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

const PROJ  = '11111111-1111-1111-1111-111111111111'
const PROJ2 = '22222222-2222-2222-2222-222222222222'
const DEF_ID = '44444444-4444-4444-4444-444444444444'
const ACTOR = 'user:00000000-0000-0000-0000-0000000000aa'

const MIG = (f: string) => join(process.cwd(), 'supabase/migrations', f)
const CORE = '20260829_workflow_instance_core.sql'
const GATE = '20260829_workflow_gate_authorization.sql'
// Adds last_tick_at/last_tick_outcome and the scheduler surfaces
// (schedule_wake / clear_wake / record_tick) that the control proofs exercise.
const SCHED = '20260829_workflow_scheduled_continuation.sql'
const SCHEDPAUSE = '20260829_workflow_scheduler_project_pause.sql'
const G3A  = '20260831_unified_stop_authority.sql'
const G3B  = '20260901110134_workflow_transition_stop_guard.sql'
const G3C2A = '20260902081500_stop_atomic_execution_admission.sql'

/**
 * Tables the historical migrations reference but do not create, plus `runs`,
 * whose columns mirror production for everything claim_runs reads or writes.
 */
const FIXTURE = `
create extension if not exists pgcrypto;

do $do$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $do$;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
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

create table public.atlas_authorizations (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null,
  project_id uuid,
  event_type text not null,
  target_type text, target_id text,
  expires_at timestamptz);

-- Mirrors production for every column claim_runs touches.
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  claimed_at timestamptz,
  lease_until timestamptz,
  attempts int not null default 0,
  max_attempts int not null default 3,
  claim_id uuid,
  cancel_requested boolean not null default false);

-- Cron scaffolding. The scheduler migration ends by registering pg_cron jobs,
-- which needs schemas this fixture has no use for: the concurrency proofs call
-- the functions directly and never go near a schedule. Stubbed rather than
-- editing a historical migration, which must stay byte-identical to what
-- production applied.
create schema if not exists cron;
create table if not exists cron.job (jobid serial primary key, jobname text);
create or replace function cron.schedule(text, text, text) returns bigint
  language sql as $stub$ select 0::bigint $stub$;
create schema if not exists omnira_cron;
create or replace function omnira_cron.call_vercel(text) returns void
  language sql as $stub$ select $stub$;

-- TEST-ONLY. Never created by a migration and never present in production: it
-- exists so the harness can read an exact SQLSTATE back as data instead of
-- parsing human-readable error text.
create or replace function public.g3c2a_probe_exec(p_sql text) returns text
language plpgsql as $probefn$
declare v_state text;
begin
  execute p_sql;
  return '';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
  return v_state;
end $probefn$;

insert into public.platform_config (id) values (1);
insert into public.projects (id, slug, name) values
  ('${PROJ}',  'alpha', 'Alpha'),
  ('${PROJ2}', 'beta',  'Beta');
`

/**
 * The PREDECESSOR bodies, copied from the deployed pg_proc source. These are what
 * production runs today; the races below must succeed against them, or the
 * upgrade proof means nothing.
 */
const PREDECESSOR = `
create or replace function public.claim_runs(p_limit integer, p_lease_seconds integer default 320)
returns setof public.runs language plpgsql security definer set search_path to '' as $pred$
begin
  return query
  update public.runs r set
    status      = 'running',
    claimed_at  = now(),
    started_at  = coalesce(r.started_at, now()),
    lease_until = now() + make_interval(secs => p_lease_seconds),
    attempts    = r.attempts + 1,
    claim_id    = gen_random_uuid()
  where r.id in (
    select ru.id from public.runs ru
    where ru.status = 'pending'
      and ru.attempts < ru.max_attempts
      and not exists (
        select 1 from public.projects p
        where p.id = ru.project_id and p.execution_paused = true
      )
    order by ru.created_at
    for update skip locked
    limit p_limit
  )
  returning r.*;
end $pred$;

create or replace function public.workflow_rearm(p_instance_id uuid, p_authorization_id uuid)
returns integer language plpgsql security definer set search_path to '' as $pred$
declare inst public.workflow_instances; granted_n int; closed_n int; n int;
begin
  select * into inst from public.workflow_instances where id = p_instance_id;
  if not found or inst.status <> 'active' then return 0; end if;
  if exists (select 1 from public.projects p
             where p.id = inst.project_id and p.execution_paused = true) then
    return 0;
  end if;
  select
    count(*) filter (where a.event_type = 'granted' and a.expires_at is not null
      and a.expires_at > now() and a.target_type = 'workflow_gate'
      and a.target_id = p_instance_id::text || ':' || inst.current_state
      and a.project_id = inst.project_id),
    count(*) filter (where a.event_type in ('denied','revoked','superseded','expired'))
  into granted_n, closed_n
  from public.atlas_authorizations a where a.authorization_id = p_authorization_id;
  if granted_n = 0 or closed_n > 0 then return 0; end if;
  update public.workflow_instances w set
    wake_at = least(coalesce(w.wake_at, 'infinity'::timestamptz), now())
  where w.id = p_instance_id;
  get diagnostics n = row_count; return n;
end $pred$;

create or replace function public.workflow_claim_due(p_limit integer default 20, p_visibility_seconds integer default 300)
returns setof public.workflow_instances language plpgsql security definer set search_path to '' as $pred$
begin
  return query
  update public.workflow_instances w set
    wake_at      = now() + make_interval(secs => p_visibility_seconds),
    last_tick_at = now()
  where w.id in (
    select d.id from public.workflow_instances d
    where d.status = 'active'
      and d.wake_at is not null
      and d.wake_at <= now()
      and not exists (
        select 1 from public.projects p
        where p.id = d.project_id and p.execution_paused = true
      )
    order by d.wake_at
    for update skip locked
    limit p_limit
  )
  returning w.*;
end $pred$;
`

const DEF_SPEC = JSON.stringify({
  states: [
    { id: 'draft', next_state: 'planning' },
    { id: 'planning', next_state: 'done', human_gate: { required: true } },
    { id: 'done', next_state: null },
  ],
})

const maybe = AVAILABLE ? describe : describe.skip

/** Available to the predecessor block, which runs before the later helper. */
function seedInstancePre(project: string, key: string): string {
  run(dsn, ['-c', `insert into public.workflow_instances
    (def_id, def_key, def_version, def_hash, project_id, instance_key, current_state, status, wake_at)
    values ('${DEF_ID}','fs',1,repeat('a',64),'${project}','${key}','draft','active',
            now() - interval '1 minute')`])
  return one(dsn, `select id from public.workflow_instances where instance_key='${key}'`)
}

beforeAll(() => {
  if (!AVAILABLE) {
    if (SQL_REQUIRED) throw new Error('ATLAS_SQL_TEST_REQUIRED=1 but no reachable Postgres')
    return
  }
  execFileSync(PSQL!, ['-X', '-q', '-d', ADMIN_URL, '-c', `create database "${DB_NAME}"`], { stdio: 'pipe' })
  dsn = dsnFor(DB_NAME)
  run(dsn, ['-c', FIXTURE])
  for (const f of [CORE, GATE, SCHED, SCHEDPAUSE, G3A, G3B]) run(dsn, ['-f', MIG(f)])
  run(dsn, ['-c', PREDECESSOR])
  run(dsn, ['-c', `insert into public.workflow_defs (id, def_key, version, def_hash, spec)
    values ('${DEF_ID}', 'fs', 1, repeat('a', 64), '${DEF_SPEC}'::jsonb)`])
}, 180_000)

afterAll(() => {
  if (!AVAILABLE || !dsn) return
  try {
    execFileSync(PSQL!, ['-X', '-q', '-d', ADMIN_URL,
      '-c', `select pg_terminate_backend(pid) from pg_stat_activity where datname='${DB_NAME}'`],
      { stdio: 'pipe' })
    execFileSync(PSQL!, ['-X', '-q', '-d', ADMIN_URL, '-c', `drop database if exists "${DB_NAME}"`],
      { stdio: 'pipe' })
  } catch { /* best effort */ }
})

/** Resets the world between races. */
function reset() {
  // workflow_transitions is append-only (G3B) and so is stop_events (G3A). Those
  // guards are correct and are exactly what production needs; a FIXTURE still has
  // to be able to start from nothing. The suspension is explicit, scoped to the
  // teardown, and re-enabled in the same statement — the alternative, inventing
  // per-test key namespaces everywhere, would make the races harder to read
  // without making them safer.
  run(dsn, ['-c', `
    alter table public.workflow_transitions disable trigger user;
    alter table public.workflow_evidence disable trigger user;
    delete from public.runs;
    delete from public.workflow_transitions;
    delete from public.workflow_evidence;
    delete from public.workflow_instances;
    delete from public.atlas_authorizations;
    alter table public.workflow_evidence enable trigger user;
    alter table public.workflow_transitions enable trigger user;
    update public.projects set execution_paused = false, paused_at = null, paused_reason = null;
    update public.platform_config set automation_paused = false, paused_at = null, paused_reason = null where id = 1;
    -- stop_events is deliberately NOT cleared: G3A makes it append-only, and a
    -- reset able to erase the stop ledger would be a worse bug than any this
    -- suite tests for.
  `])
}
/**
 * The fixture reset suspends the append-only triggers so it can start from
 * nothing. That suspension is legitimate ONLY during teardown: a race observed
 * while the canonical guards are disabled proves nothing about production, even
 * if every lock assertion passes. Every race calls this first.
 */
function assertGuardsEnabled() {
  const disabled = query(dsn, `
    select c.relname, t.tgname from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal and t.tgenabled = 'D'`)
  expect(disabled, 'a race run with canonical guards disabled is not a proof')
    .toEqual([])
}

/** Polls until `sql` returns 't'. Deterministic replacement for a bare sleep. */
async function until(sql: string, what: string, timeoutMs = 15_000): Promise<number> {
  const t0 = Date.now()
  for (;;) {
    if (one(dsn, sql) === 't') return Date.now() - t0
    if (Date.now() - t0 > timeoutMs) throw new Error(`never observed: ${what}`)
    await wait(25)
  }
}

/**
 * True once the holder transaction has finished its admission work and parked in
 * pg_sleep — i.e. it demonstrably acquired its locks BEFORE the competitor is
 * released. Ordering established by observation, not by hoping the scheduler
 * cooperated with a setTimeout.
 */
const HOLDER_READY = `select exists(select 1 from pg_stat_activity
  where datname = current_database() and pid <> pg_backend_pid()
    and state = 'active' and wait_event = 'PgSleep')`

/** True once some backend is genuinely blocked on a lock. */
const blockedOn = (needle: string) => `select exists(select 1 from pg_stat_activity
  where datname = current_database() and pid <> pg_backend_pid()
    and wait_event_type = 'Lock' and query ilike '%${needle}%')`

const seedRun = (project: string, id?: string) =>
  run(dsn, ['-c', `insert into public.runs (${id ? 'id, ' : ''}project_id, status)
    values (${id ? `'${id}', ` : ''}'${project}', 'pending')`])
const pendingCount = () => Number(one(dsn, `select count(*) from public.runs where status='pending'`))
const runningCount = () => Number(one(dsn, `select count(*) from public.runs where status='running'`))

// ══ PREDECESSOR: the bug is real ═══════════════════════════════════════════

maybe('the predecessor really does admit after a committed stop', () => {
  /**
   * Two defects, proven separately because they have different shapes.
   *
   * The GLOBAL one needs no race at all: the deployed claim_runs contains no
   * reference to automation_paused, so the platform kill switch simply never
   * reached run admission. A committed global pause and a claim are not even in
   * conflict — there is nothing to order.
   *
   * The PROJECT one is a genuine stale read. Its window under READ COMMITTED is
   * real but sub-statement — between the candidate subquery's unlocked predicate
   * and the UPDATE's write — and therefore not deterministically schedulable from
   * outside. REPEATABLE READ makes the same staleness deterministic: the caller
   * holds a snapshot taken before the pause, which is exactly the condition the
   * unlocked predicate cannot defend against. What both share, and what the
   * migration fixes, is that the decision is not taken under a lock.
   */
  it('P1 — a committed GLOBAL pause does not stop the predecessor at all', () => {
    reset(); seedRun(PROJ)
    run(dsn, ['-c', `select public.stop_set_platform_automation(true, '${ACTOR}', 'p1')`])

    const claimed = Number(one(dsn, `select count(*) from public.claim_runs(10, 300)`))
    expect(claimed, 'the kill switch never reached run admission — this is the bug').toBe(1)
    expect(runningCount()).toBe(1)
  }, 60_000)

  it('P2 — a stale snapshot admits despite a committed PROJECT pause', async () => {
    reset(); seedRun(PROJ)

    // A takes its snapshot BEFORE the pause, then claims after it commits.
    const a = session(dsn, `
      begin isolation level repeatable read;
      select count(*) from public.projects where execution_paused;
      select pg_sleep(1.5);
      select count(*) from public.claim_runs(10, 300);
      commit;`)

    await wait(300)
    const b = await session(dsn,
      `select changed from public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'p2')`)
    expect(b.err, 'the predecessor takes no authority lock, so nothing conflicts').toBe('')

    await a
    expect(runningCount(),
      'predecessor admitted a run whose project was already paused — the stale read').toBe(1)
    expect(one(dsn, `select execution_paused from public.projects where id='${PROJ}'`)).toBe('t')
  }, 60_000)

  it('P3 — workflow_claim_due has the same global blind spot', () => {
    reset(); seedInstancePre(PROJ, 'p3')
    run(dsn, ['-c', `select public.stop_set_platform_automation(true, '${ACTOR}', 'p3')`])
    expect(Number(one(dsn, `select count(*) from public.workflow_claim_due(20, 300)`)),
      'the scheduler claim ignored the kill switch too').toBe(1)
  }, 60_000)

  it('P4 — workflow_instantiate creates executable state while fully stopped', () => {
    reset()
    run(dsn, ['-c', `select public.stop_set_platform_automation(true, '${ACTOR}', 'p4')`])
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'p4')`])

    expect(sqlstateOf(dsn,
      `select id from public.workflow_instantiate('${DEF_ID}','${PROJ}','p4','draft','${ACTOR}','t')`),
      'neither authority is consulted, so it simply succeeds').toBe('')
    expect(Number(one(dsn, `select count(*) from public.workflow_instances`))).toBe(1)
    expect(Number(one(dsn, `select count(*) from public.workflow_transitions`)),
      'including a committed execution-bearing opening transition').toBe(1)
  }, 60_000)
})

// ══ INSTALL THE MIGRATION ══════════════════════════════════════════════════

maybe('the G3C-2A migration installs cleanly', () => {
  it('applies and preserves every function contract', () => {
    const before = query(dsn, `
      select p.proname, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
             p.prosecdef::text, array_to_string(p.proconfig,','), pg_get_userbyid(p.proowner)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
        ('claim_runs','workflow_claim_due','workflow_instantiate','workflow_rearm')
      order by p.proname`)

    run(dsn, ['-f', MIG(G3C2A)])

    const after = query(dsn, `
      select p.proname, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
             p.prosecdef::text, array_to_string(p.proconfig,','), pg_get_userbyid(p.proowner)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
        ('claim_runs','workflow_claim_due','workflow_instantiate','workflow_rearm')
      order by p.proname`)

    // Identity, defaults, result type, SECURITY DEFINER, search_path and owner
    // are all unchanged. Only the bodies move.
    expect(after, 'no signature, default, security attribute or owner may change')
      .toEqual(before)
  }, 120_000)

  it('the replaced bodies really do consult both authorities now', () => {
    // Asked of SQL rather than pulled into JS: prosrc is multi-line, and the
    // row-splitting helper hands back only its first line ("declare"), which
    // every toContain would then fail for entirely the wrong reason.
    const has = (fn: string, needle: string) =>
      one(dsn, `select prosrc ilike '%${needle}%' from pg_proc p
                join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.proname='${fn}'`)

    for (const fn of ['claim_runs', 'workflow_claim_due', 'workflow_instantiate']) {
      expect(has(fn, 'platform_config'), `${fn} must read the platform authority`).toBe('t')
      expect(has(fn, 'for share'), `${fn} must LOCK it, not merely read it`).toBe('t')
      expect(has(fn, 'execution_paused'), `${fn} must read the project authority`).toBe('t')
    }
    expect(has('workflow_rearm', 'for share'),
      'rearm locks the project rule it already had').toBe('t')
    expect(has('workflow_rearm', 'automation_paused'),
      'rearm is control, not execution — no global rule was added').toBe('f')
  })
})

// ══ claim_runs ═════════════════════════════════════════════════════════════

maybe('claim_runs · admission is stop-atomic', () => {
  it('R1 — project pause commits FIRST → zero claims for that project', async () => {
    reset(); seedRun(PROJ)
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'r1')`])

    const claimed = Number(one(dsn, `select count(*) from public.claim_runs(10, 300)`))
    expect(claimed).toBe(0)
    expect(runningCount()).toBe(0)
    expect(pendingCount(), 'the run stays queued for after the resume').toBe(1)
  }, 60_000)

  it('R2 — global pause commits FIRST → zero claims, and NOT an exception', async () => {
    reset(); seedRun(PROJ)
    run(dsn, ['-c', `select public.stop_set_platform_automation(true, '${ACTOR}', 'r2')`])

    // Zero rows, no error: "idle" is the worker API's normal shape, and turning a
    // routine pause into an exception would light up drain alerting every tick.
    const state = sqlstateOf(dsn, `select count(*) from public.claim_runs(10, 300)`)
    expect(state, 'a paused platform is not a claim failure').toBe('')
    expect(runningCount()).toBe(0)
  }, 60_000)

  it('R3 — claim wins first → the PROJECT pause BLOCKS and linearizes after', async () => {
    reset(); seedRun(PROJ); assertGuardsEnabled()

    const a = session(dsn, `begin;
      select count(*) from public.claim_runs(10, 300);
      select pg_sleep(3);
      commit;`)
    // Ordering established by OBSERVATION: the claim has finished its work and
    // parked, so it demonstrably holds its locks before the pause is released.
    await until(HOLDER_READY, 'the claim to acquire its locks')

    const b = session(dsn,
      `select changed from public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'r3')`)
    const blockedAfter = await until(blockedOn('stop_set_project_execution'),
      'the pause to block on the project authority')

    const bres = await b
    await a
    expect(bres.err).toBe('')
    expect(blockedAfter, 'the pause was observed genuinely waiting on a lock')
      .toBeGreaterThanOrEqual(0)
    expect(bres.ms, 'and it could not commit until the claim released').toBeGreaterThan(1000)
    expect(runningCount(), 'the claim linearized BEFORE the stop, which is correct').toBe(1)
  }, 60_000)

  it('R4 — claim wins first → the GLOBAL pause BLOCKS and linearizes after', async () => {
    reset(); seedRun(PROJ); assertGuardsEnabled()

    const a = session(dsn, `begin;
      select count(*) from public.claim_runs(10, 300);
      select pg_sleep(3);
      commit;`)
    await until(HOLDER_READY, 'the claim to acquire its locks')

    const b = session(dsn,
      `select changed from public.stop_set_platform_automation(true, '${ACTOR}', 'r4')`)
    await until(blockedOn('stop_set_platform_automation'),
      'the global pause to block on platform_config')

    const bres = await b
    await a
    expect(bres.err).toBe('')
    expect(bres.ms, 'the global pause must wait behind the claim').toBeGreaterThan(1000)
    expect(runningCount()).toBe(1)
  }, 60_000)

  it('R5b — pause wins first → the claim BLOCKS, then observes it and admits nothing', async () => {
    reset(); seedRun(PROJ); assertGuardsEnabled()

    const a = session(dsn, `begin;
      select public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'r5b');
      select pg_sleep(3);
      commit;`)
    await until(HOLDER_READY, 'the pause to acquire the project authority')

    const b = session(dsn, `select count(*) from public.claim_runs(10, 300)`)
    await until(blockedOn('claim_runs'), 'the claim to block on the pause')

    const bres = await b
    await a
    expect(bres.err).toBe('')
    expect(bres.ms, 'the claim waited on the pause it would then obey').toBeGreaterThan(1000)
    expect(bres.out.trim(), 'and admitted nothing').toBe('0')
    expect(runningCount(),
      'the forbidden interleaving — pause commits, claim commits on stale state — is gone').toBe(0)
  }, 60_000)

  it('R6 — a mixed batch claims the clear project and refuses only the paused one', async () => {
    reset(); seedRun(PROJ); seedRun(PROJ2)
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'r6')`])

    const claimed = Number(one(dsn, `select count(*) from public.claim_runs(10, 300)`))
    expect(claimed, 'one project paused must not freeze the other').toBe(1)
    expect(one(dsn, `select project_id from public.runs where status='running'`)).toBe(PROJ2)
    expect(one(dsn, `select project_id from public.runs where status='pending'`)).toBe(PROJ)
  }, 60_000)

  it('R7 — two concurrent workers: SKIP LOCKED still divides the queue, no double claim', async () => {
    reset()
    for (let i = 0; i < 6; i++) seedRun(PROJ)

    const [w1, w2] = await Promise.all([
      session(dsn, `select id from public.claim_runs(3, 300)`),
      session(dsn, `select id from public.claim_runs(3, 300)`),
    ])
    const ids1 = w1.out.split('\n').map(s => s.trim()).filter(Boolean)
    const ids2 = w2.out.split('\n').map(s => s.trim()).filter(Boolean)

    expect(w1.err).toBe(''); expect(w2.err).toBe('')
    expect(ids1.filter(i => ids2.includes(i)), 'no run may be claimed twice').toEqual([])
    expect(runningCount()).toBe(ids1.length + ids2.length)
  }, 60_000)

  it('R8 — fencing preserved: a fresh claim_id, attempts incremented, lease set', async () => {
    reset(); seedRun(PROJ)
    run(dsn, ['-c', `select count(*) from public.claim_runs(10, 300)`])

    const row = query(dsn, `select claim_id is not null, attempts,
      lease_until is not null, started_at is not null, claimed_at is not null
      from public.runs`)[0]
    expect(row, 'PR9a fencing must not regress while fixing stop authority')
      .toEqual(['t', '1', 't', 't', 't'])
  }, 60_000)

  it('a missing platform authority row FAILS CLOSED', async () => {
    reset(); seedRun(PROJ)
    run(dsn, ['-c', `alter table public.platform_config disable trigger all;
                     delete from public.platform_config where id = 1`])
    const state = sqlstateOf(dsn, `select count(*) from public.claim_runs(10, 300)`)
    run(dsn, ['-c', `insert into public.platform_config (id) values (1);
                     alter table public.platform_config enable trigger all`])

    expect(state, 'an unreadable kill switch is not permission').toBe('P0002')
    expect(runningCount()).toBe(0)
  }, 60_000)
})

// ══ workflow_claim_due ═════════════════════════════════════════════════════

function seedInstance(project: string, key: string, due = true): string {
  run(dsn, ['-c', `insert into public.workflow_instances
    (def_id, def_key, def_version, def_hash, project_id, instance_key, current_state, status, wake_at)
    values ('${DEF_ID}','fs',1,repeat('a',64),'${project}','${key}','draft','active',
            ${due ? `now() - interval '1 minute'` : 'null'})`])
  return one(dsn, `select id from public.workflow_instances where instance_key='${key}'`)
}
const claimedDue = () => Number(one(dsn, `select count(*) from public.workflow_claim_due(20, 300)`))

maybe('workflow_claim_due · scheduler admission is stop-atomic', () => {
  it('W1 — project pause first → that project claims zero', () => {
    reset(); seedInstance(PROJ, 'w1')
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'w1')`])
    expect(claimedDue()).toBe(0)
  }, 60_000)

  it('W2 — global pause first → zero, and not an exception', () => {
    reset(); seedInstance(PROJ, 'w2')
    run(dsn, ['-c', `select public.stop_set_platform_automation(true, '${ACTOR}', 'w2')`])
    expect(sqlstateOf(dsn, `select count(*) from public.workflow_claim_due(20, 300)`),
      'scheduler idle is not scheduler failure').toBe('')
  }, 60_000)

  it('W3 — claim wins first → the project pause BLOCKS', async () => {
    reset(); seedInstance(PROJ, 'w3'); assertGuardsEnabled()
    const a = session(dsn, `begin;
      select count(*) from public.workflow_claim_due(20, 300);
      select pg_sleep(3); commit;`)
    await until(HOLDER_READY, 'the scheduler claim to acquire its locks')

    const b = session(dsn,
      `select changed from public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'w3')`)
    await until(blockedOn('stop_set_project_execution'), 'the pause to block')

    const bres = await b
    await a
    expect(bres.err).toBe('')
    expect(bres.ms).toBeGreaterThan(1000)
  }, 60_000)

  it('W4 — claim wins first → the global pause BLOCKS', async () => {
    reset(); seedInstance(PROJ, 'w4'); assertGuardsEnabled()
    const a = session(dsn, `begin;
      select count(*) from public.workflow_claim_due(20, 300);
      select pg_sleep(3); commit;`)
    await until(HOLDER_READY, 'the scheduler claim to acquire its locks')

    const b = session(dsn,
      `select changed from public.stop_set_platform_automation(true, '${ACTOR}', 'w4')`)
    await until(blockedOn('stop_set_platform_automation'), 'the global pause to block')

    const bres = await b
    await a
    expect(bres.err).toBe('')
    expect(bres.ms).toBeGreaterThan(1000)
  }, 60_000)

  it('W5 — append_transition and claim_due on the same instance: NO deadlock', async () => {
    // Both take instance → platform → project. Reversing either would close a
    // cycle through a pause setter queued between two SHARE holders.
    reset()
    const inst = seedInstance(PROJ, 'w5')

    const results = await Promise.all([
      session(dsn, `begin;
        select id from public.workflow_append_transition('${inst}','draft','planning','w5','${ACTOR}');
        select pg_sleep(0.6); commit;`),
      session(dsn, `begin;
        select count(*) from public.workflow_claim_due(20, 300);
        select pg_sleep(0.6); commit;`),
      session(dsn, `begin;
        select count(*) from public.workflow_claim_due(20, 300);
        select pg_sleep(0.6); commit;`),
    ])
    for (const r of results) {
      expect(r.err, 'no deadlock may occur between the canonical paths')
        .not.toMatch(/deadlock detected/i)
    }
    expect(Number(one(dsn, `select count(*) from pg_stat_database where deadlocks > 0 and datname='${DB_NAME}'`)))
      .toBe(0)
  }, 90_000)

  it('W6 — two scheduler workers do not claim the same instance twice', async () => {
    reset()
    for (let i = 0; i < 4; i++) seedInstance(PROJ, `w6-${i}`)
    const [a, b] = await Promise.all([
      session(dsn, `select id from public.workflow_claim_due(2, 300)`),
      session(dsn, `select id from public.workflow_claim_due(2, 300)`),
    ])
    const ids1 = a.out.split('\n').map(s => s.trim()).filter(Boolean)
    const ids2 = b.out.split('\n').map(s => s.trim()).filter(Boolean)
    expect(ids1.filter(i => ids2.includes(i))).toEqual([])
  }, 60_000)
})

// ══ workflow_instantiate ═══════════════════════════════════════════════════

const instantiate = (project: string, key: string) =>
  `select id from public.workflow_instantiate('${DEF_ID}','${project}','${key}','draft','${ACTOR}','t')`

maybe('workflow_instantiate · new executable state is admission', () => {
  it('I1 — global pause already committed → refused, zero state created', () => {
    reset()
    run(dsn, ['-c', `select public.stop_set_platform_automation(true, '${ACTOR}', 'i1')`])

    expect(sqlstateOf(dsn, instantiate(PROJ, 'i1')),
      'a stop is restrict_violation, never insufficient_privilege').toBe('23001')
    expect(Number(one(dsn, `select count(*) from public.workflow_instances`))).toBe(0)
    expect(Number(one(dsn, `select count(*) from public.workflow_transitions`)),
      'the opening transition must not exist either').toBe(0)
  }, 60_000)

  it('I2 — project pause already committed → refused, zero state created', () => {
    reset()
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'i2')`])
    expect(sqlstateOf(dsn, instantiate(PROJ, 'i2'))).toBe('23001')
    expect(Number(one(dsn, `select count(*) from public.workflow_instances`))).toBe(0)
  }, 60_000)

  it('I3 — instantiate wins first → the pause BLOCKS and linearizes after', async () => {
    reset(); assertGuardsEnabled()
    const a = session(dsn, `begin; ${instantiate(PROJ, 'i3')}; select pg_sleep(3); commit;`)
    await until(HOLDER_READY, 'instantiate to acquire platform and project SHARE')

    const b = session(dsn,
      `select changed from public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'i3')`)
    await until(blockedOn('stop_set_project_execution'), 'the pause to block')

    const bres = await b
    await a
    expect(bres.err).toBe('')
    expect(bres.ms).toBeGreaterThan(1000)
    expect(Number(one(dsn, `select count(*) from public.workflow_instances`))).toBe(1)
    expect(Number(one(dsn, `select count(*) from public.workflow_transitions`))).toBe(1)
  }, 60_000)

  it('I4 — pause wins first → instantiate BLOCKS, then creates nothing', async () => {
    reset(); assertGuardsEnabled()
    const a = session(dsn, `begin;
      select public.stop_set_platform_automation(true, '${ACTOR}', 'i4');
      select pg_sleep(3); commit;`)
    await until(HOLDER_READY, 'the global pause to acquire platform_config')

    const b = session(dsn, instantiate(PROJ, 'i4'))
    await until(blockedOn('workflow_instantiate'), 'instantiate to block on the authority')

    const bres = await b
    await a
    expect(bres.ms, 'instantiate waited on the authority it would then obey').toBeGreaterThan(1000)
    expect(bres.err, 'and refused').toMatch(/GLOBAL execution is stopped/)
    expect(Number(one(dsn, `select count(*) from public.workflow_instances`))).toBe(0)
  }, 60_000)

  it('I5 — missing platform authority FAILS CLOSED', () => {
    reset()
    run(dsn, ['-c', `alter table public.platform_config disable trigger all;
                     delete from public.platform_config where id = 1`])
    const state = sqlstateOf(dsn, instantiate(PROJ, 'i5'))
    run(dsn, ['-c', `insert into public.platform_config (id) values (1);
                     alter table public.platform_config enable trigger all`])
    expect(state).toBe('P0002')
    expect(Number(one(dsn, `select count(*) from public.workflow_instances`))).toBe(0)
  }, 60_000)

  it('clear → instantiate still works exactly as before', () => {
    reset()
    expect(sqlstateOf(dsn, instantiate(PROJ, 'ok'))).toBe('')
    expect(Number(one(dsn, `select count(*) from public.workflow_instances`))).toBe(1)
    expect(Number(one(dsn, `select count(*) from public.workflow_transitions`))).toBe(1)
  }, 60_000)

  it('an unknown definition keeps its existing SQLSTATE, not the stop code', () => {
    reset()
    expect(sqlstateOf(dsn,
      `select id from public.workflow_instantiate('${DEF_ID.replace(/4/g, '9')}','${PROJ}','x','draft','${ACTOR}','t')`))
      .toBe('23503')
  }, 60_000)
})

// ══ workflow_rearm ═════════════════════════════════════════════════════════

maybe('workflow_rearm · still CONTROL, now race-safe on its existing rule', () => {
  const AUTH = '55555555-5555-5555-5555-555555555555'
  function grant(instance: string, state: string, project: string) {
    run(dsn, ['-c', `insert into public.atlas_authorizations
      (authorization_id, project_id, event_type, target_type, target_id, expires_at)
      values ('${AUTH}','${project}','granted','workflow_gate','${instance}:${state}', now() + interval '1 hour')`])
  }
  const rearm = () => Number(one(dsn, `select public.workflow_rearm(
    (select id from public.workflow_instances limit 1), '${AUTH}')`))

  it('a live grant on a clear project still re-arms', () => {
    reset()
    const inst = seedInstance(PROJ, 'ra', false)
    grant(inst, 'draft', PROJ)
    expect(rearm()).toBe(1)
    expect(one(dsn, `select wake_at is not null from public.workflow_instances`)).toBe('t')
  }, 60_000)

  it('a paused project refuses, and leaves wake_at untouched', () => {
    reset()
    const inst = seedInstance(PROJ, 'rb', false)
    grant(inst, 'draft', PROJ)
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'rb')`])
    expect(rearm()).toBe(0)
    expect(one(dsn, `select wake_at is null from public.workflow_instances`),
      'a refused re-arm must not move the wake').toBe('t')
  }, 60_000)

  it('an inactive instance refuses', () => {
    reset()
    const inst = seedInstance(PROJ, 'rc', false)
    grant(inst, 'draft', PROJ)
    // status and closed_at are a pair the schema enforces; setting only the
    // status violates workflow_instances_closed_check.
    run(dsn, ['-c', `update public.workflow_instances
                     set status='complete', closed_at = now()`])
    expect(rearm()).toBe(0)
  }, 60_000)

  it('a closed grant refuses — resume never mints authority', () => {
    reset()
    const inst = seedInstance(PROJ, 'rd', false)
    grant(inst, 'draft', PROJ)
    run(dsn, ['-c', `insert into public.atlas_authorizations
      (authorization_id, project_id, event_type) values ('${AUTH}','${PROJ}','revoked')`])
    expect(rearm()).toBe(0)
  }, 60_000)

  it('the project rule is now atomic: a pause winning first is observed', async () => {
    reset()
    const inst = seedInstance(PROJ, 're', false)
    grant(inst, 'draft', PROJ)

    assertGuardsEnabled()
    const a = session(dsn, `begin;
      select public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 're');
      select pg_sleep(3); commit;`)
    await until(HOLDER_READY, 'the pause to acquire the project authority')

    const b = session(dsn, `select public.workflow_rearm('${inst}', '${AUTH}')`)
    await until(blockedOn('workflow_rearm'), 'rearm to block on the project authority')

    const bres = await b
    await a
    expect(bres.ms, 'rearm waited on the project authority').toBeGreaterThan(1000)
    expect(bres.out.trim()).toBe('0')
  }, 60_000)

  it('rearm gained NO global rule — its body never reads automation_paused', () => {
    // A deliberate non-change. Re-arm moves wake_at; it creates no run, appends no
    // transition and calls nothing external. Admission happens later, in
    // workflow_claim_due, which is now authoritative.
    const src = one(dsn, `select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='workflow_rearm'`)
    expect(src).not.toContain('automation_paused')
  })

  it('a globally paused platform still allows re-arm, but claim_due admits nothing', () => {
    reset()
    const inst = seedInstance(PROJ, 'rf', false)
    grant(inst, 'draft', PROJ)
    run(dsn, ['-c', `select public.stop_set_platform_automation(true, '${ACTOR}', 'rf')`])

    expect(rearm(), 'control may still prepare future work').toBe(1)
    expect(claimedDue(), 'but nothing may be admitted while stopped').toBe(0)
  }, 60_000)
})

// ══ CONTROL SURFACES MUST KEEP WORKING ═════════════════════════════════════

maybe('control surfaces survive the kill switch', () => {
  it('schedule_wake, clear_wake and record_tick all work while GLOBALLY paused', () => {
    reset()
    const inst = seedInstance(PROJ, 'cs', false)
    run(dsn, ['-c', `select public.stop_set_platform_automation(true, '${ACTOR}', 'cs')`])

    expect(sqlstateOf(dsn,
      `select id from public.workflow_schedule_wake('${inst}', now() + interval '1 hour', '${ACTOR}', 'cs')`),
      'an operator must be able to plan the resume').toBe('')
    expect(sqlstateOf(dsn, `select public.workflow_record_tick('${inst}', 'blocked', '{}'::jsonb, null)`),
      'already-running work must be able to record that it stopped').toBe('')
    expect(sqlstateOf(dsn, `select id from public.workflow_clear_wake('${inst}', '${ACTOR}', 'cs')`),
      'the kill switch must not prevent cleanup').toBe('')

    // …and the load-bearing gate still refuses.
    run(dsn, ['-c', `update public.workflow_instances set wake_at = now() - interval '1 minute'`])
    expect(claimedDue(), 'control proceeds; execution does not').toBe(0)
  }, 60_000)

  it('the same holds under a PROJECT pause', () => {
    reset()
    const inst = seedInstance(PROJ, 'cs2', false)
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'cs2')`])
    expect(sqlstateOf(dsn,
      `select id from public.workflow_schedule_wake('${inst}', now() - interval '1 minute', '${ACTOR}', 'cs2')`)).toBe('')
    expect(sqlstateOf(dsn, `select public.workflow_record_tick('${inst}', 'blocked', '{}'::jsonb, now() - interval '1 minute')`)).toBe('')
    expect(claimedDue()).toBe(0)
  }, 60_000)

  it('queueing a pending run stays possible while paused; only the CLAIM refuses', () => {
    // Run creation is control-plane state. A stop must not stop an operator from
    // staging work for after the resume — it must stop that work executing.
    reset()
    run(dsn, ['-c', `select public.stop_set_platform_automation(true, '${ACTOR}', 'q')`])
    expect(sqlstateOf(dsn,
      `insert into public.runs (project_id, status) values ('${PROJ}', 'pending')`),
      'queueing is not execution').toBe('')
    expect(Number(one(dsn, `select count(*) from public.claim_runs(10, 300)`))).toBe(0)

    run(dsn, ['-c', `select public.stop_set_platform_automation(false, '${ACTOR}', 'resume')`])
    expect(Number(one(dsn, `select count(*) from public.claim_runs(10, 300)`)),
      'and after the resume the queued work becomes eligible again').toBe(1)
  }, 60_000)
})

// ══ STARVATION, ORDERING, THROUGHPUT, FENCING ══════════════════════════════

maybe('claim_runs · a paused project cannot starve clear work', () => {
  /**
   * The authoritative project filter runs AFTER the candidate rows are locked, so
   * a project paused mid-admission occupies a batch slot it is then refused. The
   * question is whether that can repeat forever and hide unrelated work. It
   * cannot: the early (non-authoritative) predicate excludes the now-committed
   * pause from every later batch, so the slot is wasted at most once.
   */
  it('a pause landing mid-admission never hides unrelated work', async () => {
    reset(); assertGuardsEnabled()
    seedRun(PROJ); seedRun(PROJ);  seedRun(PROJ2)   // two paused-to-be, one clear

    // Batch of one takes the oldest candidate and holds its locks.
    const a = session(dsn, `begin;
      select count(*) from public.claim_runs(1, 300);
      select pg_sleep(3); commit;`)
    await until(HOLDER_READY, 'the claim to hold its candidate')
    const b = session(dsn,
      `select changed from public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'starve')`)
    await b; await a

    // Whoever won that round, the invariant is the same afterwards: the clear
    // project's work is immediately reachable, and no FURTHER work is admitted
    // for the project that is now paused.
    const claimed = Number(one(dsn, `select count(*) from public.claim_runs(10, 300)`))
    expect(claimed, 'exactly the clear project’s run, nothing else').toBe(1)
    expect(Number(one(dsn, `select count(*) from public.runs
      where status='running' and project_id='${PROJ2}'`)),
      'the clear project was never hidden behind the paused one').toBe(1)
    expect(Number(one(dsn, `select count(*) from public.runs
      where status='pending' and project_id='${PROJ}'`)),
      'the paused project keeps its remaining work queued for after the resume').toBe(1)
  }, 90_000)

  it('repeated calls never re-admit the paused project, and never block the clear one', () => {
    reset()
    for (let i = 0; i < 3; i++) { seedRun(PROJ); seedRun(PROJ2) }
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}', true, '${ACTOR}', 'rep')`])

    for (let round = 0; round < 3; round++) {
      run(dsn, ['-c', `select count(*) from public.claim_runs(10, 300)`])
    }
    expect(Number(one(dsn, `select count(*) from public.runs
      where status='running' and project_id='${PROJ2}'`)), 'all clear work drained').toBe(3)
    expect(Number(one(dsn, `select count(*) from public.runs
      where status='running' and project_id='${PROJ}'`)), 'no paused work admitted, ever').toBe(0)
  }, 90_000)
})

maybe('deterministic multi-project lock ordering is structural, not assumed', () => {
  /**
   * `where id = any(...) for share` leaves acquisition order to the planner. Two
   * claimers holding overlapping batches could then queue on each other in
   * opposite directions. Both batch paths must order by a total key explicitly.
   */
  it.each(['claim_runs', 'workflow_claim_due'])(
    '%s locks candidate projects in explicit id order', fn => {
      const body = one(dsn, `select regexp_replace(prosrc, '\\s+', ' ', 'g') from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='${fn}'`)
      expect(body, `${fn} must sort the candidate project ids before locking`)
        .toMatch(/array_agg\(u order by u\) from unnest\(v_projects\) u/)
      expect(body, `${fn} must lock them one at a time, under that order`)
        .toMatch(/foreach v_pid in array/)
      expect(body, `${fn} must not bulk-lock and hope the planner sorts`)
        .not.toMatch(/where p\.id = any\(v_projects\)[^;]*for share/)
    })
})

maybe('the canonical lock ORDER is structural', () => {
  /**
   * WORK first, AUTHORITY second. Reversing it is what closes a cycle against
   * G3B: append_transition holds an instance and wants platform SHARE; a claim
   * holding platform and wanting that instance completes the ring as soon as a
   * pause setter queues for platform FOR UPDATE between the two SHARE holders.
   * The order is a safety property, so it is pinned rather than trusted.
   */
  const flat = (fn: string) => one(dsn, `select regexp_replace(prosrc, '\\s+', ' ', 'g')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='${fn}'`)

  it('claim_runs locks RUN rows before it reads the platform authority', () => {
    const b = flat('claim_runs')
    const work = b.indexOf('for update skip locked')
    const authority = b.indexOf('platform_config')
    expect(work, 'candidate runs are locked').toBeGreaterThan(-1)
    expect(authority, 'the platform authority is consulted').toBeGreaterThan(-1)
    expect(work, 'run -> platform -> project, never the reverse').toBeLessThan(authority)
  })

  it('workflow_claim_due locks INSTANCE rows before it reads the platform authority', () => {
    const b = flat('workflow_claim_due')
    const work = b.indexOf('for update skip locked')
    const authority = b.indexOf('platform_config')
    expect(work).toBeGreaterThan(-1)
    expect(authority).toBeGreaterThan(-1)
    expect(work, 'instance -> platform -> project, matching G3B exactly')
      .toBeLessThan(authority)
  })

  it('workflow_instantiate takes authority BEFORE the first execution-bearing insert', () => {
    // The one path that legitimately locks platform first — safe only because
    // the instance it inserts does not exist yet and is invisible until commit.
    const b = flat('workflow_instantiate')
    const authority = b.indexOf('platform_config')
    const insert = b.indexOf('insert into public.workflow_instances')
    expect(authority).toBeGreaterThan(-1)
    expect(insert).toBeGreaterThan(-1)
    expect(authority, 'the barrier must dominate the insert it guards')
      .toBeLessThan(insert)
  })

  it('workflow_rearm locks the instance before the project', () => {
    const b = flat('workflow_rearm')
    const inst = b.indexOf('for update')
    const proj = b.indexOf('for share')
    expect(inst).toBeGreaterThan(-1)
    expect(proj).toBeGreaterThan(-1)
    expect(inst, 'instance -> project, a prefix of G3B’s order').toBeLessThan(proj)
  })
})

maybe('two workers overlap without serialising, duplicating or deadlocking', () => {
  it('repeated rounds: SHARE readers coexist, SKIP LOCKED distributes, no duplicates', async () => {
    const deadlocksBefore = Number(one(dsn,
      `select deadlocks from pg_stat_database where datname = current_database()`))

    for (let round = 0; round < 5; round++) {
      reset()
      for (let i = 0; i < 6; i++) seedRun(PROJ)
      const [w1, w2] = await Promise.all([
        session(dsn, `select id from public.claim_runs(3, 300)`),
        session(dsn, `select id from public.claim_runs(3, 300)`),
      ])
      const ids1 = w1.out.split('\n').map(x => x.trim()).filter(Boolean)
      const ids2 = w2.out.split('\n').map(x => x.trim()).filter(Boolean)

      expect(w1.err, `round ${round}`).toBe('')
      expect(w2.err, `round ${round}`).toBe('')
      expect(ids1.filter(i => ids2.includes(i)), `round ${round}: no duplicate claim`).toEqual([])
      expect(ids1.length + ids2.length,
        `round ${round}: both workers got work — platform SHARE does not serialise readers`).toBe(6)
    }

    const deadlocksAfter = Number(one(dsn,
      `select deadlocks from pg_stat_database where datname = current_database()`))
    expect(deadlocksAfter - deadlocksBefore, 'deadlocks across all rounds').toBe(0)
  }, 180_000)

  it('scheduler workers likewise', async () => {
    for (let round = 0; round < 3; round++) {
      reset()
      for (let i = 0; i < 4; i++) seedInstance(PROJ, `tw-${round}-${i}`)
      const [a, b] = await Promise.all([
        session(dsn, `select id from public.workflow_claim_due(2, 300)`),
        session(dsn, `select id from public.workflow_claim_due(2, 300)`),
      ])
      const ids1 = a.out.split('\n').map(x => x.trim()).filter(Boolean)
      const ids2 = b.out.split('\n').map(x => x.trim()).filter(Boolean)
      expect(ids1.filter(i => ids2.includes(i)), `round ${round}`).toEqual([])
      expect(ids1.length + ids2.length, `round ${round}`).toBe(4)
    }
  }, 180_000)
})

maybe('PR9a fencing stays load-bearing', () => {
  it('a re-claim mints a NEW claim_id, so the previous token no longer matches', () => {
    // The governance fix must not weaken the token that stops a zombie executor
    // writing to a run someone else now owns.
    reset(); seedRun(PROJ)
    run(dsn, ['-c', `select count(*) from public.claim_runs(10, 300)`])
    const first = one(dsn, `select claim_id from public.runs`)
    expect(first).not.toBe('')

    // The reaper's shape: return the run to pending and drop its token.
    run(dsn, ['-c', `update public.runs set status='pending', claim_id=null`])
    run(dsn, ['-c', `select count(*) from public.claim_runs(10, 300)`])
    const second = one(dsn, `select claim_id from public.runs`)

    expect(second, 'a fresh token per claim').not.toBe(first)
    // A fenced write carrying the stale token must match nothing.
    const stale = one(dsn, `with u as (
      update public.runs set status='done' where claim_id = '${first}' returning 1)
      select count(*) from u`)
    expect(stale, 'the stale claim_id fences the zombie writer out').toBe('0')
    expect(one(dsn, `select status from public.runs`)).toBe('running')
  }, 60_000)

  it('attempts, lease and started_at survive the rewrite', () => {
    reset(); seedRun(PROJ)
    run(dsn, ['-c', `select count(*) from public.claim_runs(10, 77)`])
    const row = query(dsn, `select attempts, lease_until > now() + interval '60 seconds',
      started_at is not null from public.runs`)[0]
    expect(row, 'the lease honours p_lease_seconds, not a resurrected default')
      .toEqual(['1', 't', 't'])
  }, 60_000)
})

maybe('missing authority fails closed everywhere', () => {
  it('workflow_claim_due refuses when platform_config is unreadable', () => {
    reset(); seedInstance(PROJ, 'ma')
    run(dsn, ['-c', `delete from public.platform_config where id = 1`])
    const state = sqlstateOf(dsn, `select count(*) from public.workflow_claim_due(20, 300)`)
    run(dsn, ['-c', `insert into public.platform_config (id) values (1)`])

    expect(state, 'an unreadable kill switch is not permission').toBe('P0002')
    expect(one(dsn, `select last_tick_at is null from public.workflow_instances`),
      'and nothing was claimed').toBe('t')
  }, 60_000)
})
