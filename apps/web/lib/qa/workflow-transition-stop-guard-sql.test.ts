/**
 * G3B — workflow transitions are stop-atomic. F-107 / G3-F-002, closed and
 * proven against REAL PostgreSQL with REAL concurrent sessions.
 *
 * ── THE RACE ───────────────────────────────────────────────────────────────
 *   T1  the application reads the stop state and sees "clear"
 *   T2  an operator pauses, and that pause COMMITS
 *   T3  the now-stale caller invokes workflow_append_transition(...)
 *
 * Before G3B, T3 succeeded: the authoritative SQL that writes
 * workflow_transitions and advances current_state consulted neither stop
 * authority. Every check lived in TypeScript one round trip earlier — which is
 * exactly the window.
 *
 * ── WHY THESE TESTS USE SEPARATE PROCESSES ─────────────────────────────────
 * Row locks live until COMMIT or ROLLBACK. A single transaction, a CTE, or two
 * sequential calls cannot demonstrate a lock conflict: the lock would be
 * re-entrant and the second caller would see the first's uncommitted work for
 * free. Every race below runs in its own psql process, so the blocking is real
 * and is MEASURED (elapsed wall time), not assumed.
 *
 * ── WHY THE FIXTURE REBUILDS THE PREDECESSOR CHAIN ─────────────────────────
 * G2 shipped a migration that passed every test and then failed in production,
 * because the harness had built a greenfield database. So this suite applies the
 * ACTUAL historical migrations in order — instance core, then the gate
 * authorization replacement, then G3A — and asserts the pre-G3B function really
 * lacks the pause reads before proving G3B adds them. If that assertion ever
 * goes green against a simplified stand-in, the upgrade proof is worthless.
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
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
}
function query(dsn: string, sql: string): string[][] {
  const out = execFileSync(PSQL!,
    ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-F', '|', '-d', dsn, '-c', sql],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|'))
}
const one = (dsn: string, sql: string) => { const r = query(dsn, sql); return r.length ? r[0].join('|') : '' }

function expectFailure(dsn: string, sql: string): string {
  try {
    execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, '-c', sql],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return ''
  } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? '') }
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
    '[workflow-transition-stop-guard-sql] SKIPPED — no reachable local Postgres. F-107 ' +
    '(a transition committing after a committed pause) was NOT proven in this run. ' +
    'Set ATLAS_SQL_TEST_URL to enable it.',
  )
}

const DB_NAME = `omnira_g3b_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

const PROJ  = '11111111-1111-1111-1111-111111111111'
const PROJ2 = '22222222-2222-2222-2222-222222222222'
const INST  = '33333333-3333-3333-3333-333333333333'
const ACTOR = 'user:00000000-0000-0000-0000-0000000000aa'

/**
 * Only what the historical migrations do NOT create themselves: the three tables
 * they reference. Everything else — workflow_defs/instances/transitions/evidence
 * and the function under test — comes from the real migration files.
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

-- TEST-ONLY. Never created by a migration and never present in production: it
-- exists so a DO block can hand real exception diagnostics back as data.
create table public.g3b_probe_result (
  id serial primary key,
  sqlstate_code text not null,
  msg text not null default '');

insert into public.platform_config (id) values (1);
insert into public.projects (id, slug, name) values
  ('${PROJ}',  'alpha', 'Alpha'),
  ('${PROJ2}', 'beta',  'Beta');
`

const MIG = (f: string) => join(process.cwd(), 'supabase/migrations', f)
const CORE   = '20260829_workflow_instance_core.sql'
const GATE   = '20260829_workflow_gate_authorization.sql'
const G3A    = '20260831_unified_stop_authority.sql'
const G3B    = '20260901110134_workflow_transition_stop_guard.sql'

/**
 * A three-state definition matching the REAL workflow_defs schema: `def_key`,
 * a 64-hex `def_hash`, no status column. `planning` is human-gated.
 */
const DEF_ID = '44444444-4444-4444-4444-444444444444'
const DEF_HASH = 'a'.repeat(64)
const SEED_DEF = `
insert into public.workflow_defs (id, def_key, version, def_hash, spec)
values (
  '${DEF_ID}', 'g3b-probe', 1, '${DEF_HASH}',
  '{"states":[
      {"id":"planning","next_state":"review","human_gate":{"required":true}},
      {"id":"review","next_state":"done"},
      {"id":"done","next_state":null}
   ]}'::jsonb);
`


/**
 * Body predicates evaluated IN SQL.
 *
 * `prosrc` is multi-line and the psql helper splits output on newlines, so
 * pulling a function body into JavaScript yields only its first line. Asking
 * Postgres for `position(... in prosrc)` keeps the whole body intact and returns
 * a scalar, which is what these structural checks actually need.
 */

/**
 * The EXACT SQLSTATE PostgreSQL raised, taken from real exception diagnostics.
 *
 * Message text is not evidence of an error class. A mutation that swapped
 * `restrict_violation` for `insufficient_privilege` while keeping the wording
 * would leave every message-based assertion green — and would silently collapse
 * "execution stopped" and "authorization denied" into one machine-readable
 * class, which is precisely the distinction G3B was built to keep.
 *
 * So this catches the exception inside a DO block, reads RETURNED_SQLSTATE via
 * GET STACKED DIAGNOSTICS, and stores it as data. The handler's INSERT runs in
 * the outer transaction after the failed subtransaction rolls back, so the probe
 * records the failure without persisting whatever the statement half-did.
 *
 * Nothing here ships: the scratch table is fixture-only and no helper function
 * is added to the schema under test.
 */
function sqlstateOf(sql: string): { code: string; msg: string } {
  run(dsn, ['-c', `
    do $probe$
    declare v_state text; v_msg text;
    begin
      begin
        perform ${sql.replace(/^\s*select\s+/i, '')};
        insert into public.g3b_probe_result (sqlstate_code, msg) values ('00000', 'no error');
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
        insert into public.g3b_probe_result (sqlstate_code, msg) values (v_state, v_msg);
      end;
    end $probe$;`])
  const row = query(dsn, `select sqlstate_code, msg from public.g3b_probe_result order by id desc limit 1`)[0]
  return { code: row?.[0] ?? '', msg: row?.slice(1).join('|') ?? '' }
}

const sqlLit = (t: string) => t.replace(/'/g, "''")
const bodyPos = (fn: string, needle: string) =>
  Number(one(dsn, `select position('${sqlLit(needle)}' in p.prosrc)
                     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname='${fn}'`))
const bodyHas = (fn: string, needle: string) => bodyPos(fn, needle) > 0

let preG3bBody = ''
let preG3bOwner = ''

const d = AVAILABLE ? describe : describe.skip

beforeAll(() => {
  if (!AVAILABLE) {
    if (SQL_REQUIRED) throw new Error(
      '[workflow-transition-stop-guard-sql] Postgres REQUIRED but unreachable. F-107 cannot be ' +
      'proven; failing rather than skipping.')
    return
  }
  run(ADMIN_URL, ['-c', `create database "${DB_NAME}"`])
  dsn = dsnFor(DB_NAME)
  run(dsn, ['-c', FIXTURE])
  // THE REAL PREDECESSOR CHAIN, in historical order.
  run(dsn, ['-f', MIG(CORE)])
  run(dsn, ['-f', MIG(GATE)])
  run(dsn, ['-f', MIG(G3A)])
  run(dsn, ['-c', SEED_DEF])
  preG3bOwner = one(dsn, `select pg_get_userbyid(p.proowner) from pg_proc p
                            join pg_namespace n on n.oid=p.pronamespace
                           where n.nspname='public' and p.proname='workflow_append_transition'`)
  preG3bBody = one(dsn, `select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='workflow_append_transition'`)
}, 180_000)

afterAll(() => {
  if (!AVAILABLE || !dsn) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DB_NAME}" with (force)`]) } catch { /* best effort */ }
})

/**
 * A FRESH instance per test.
 *
 * `workflow_transitions` is append-only and `workflow_instances.current_state`
 * is projection-guarded — by design, and correctly so. That means a test cannot
 * "reset" by deleting history or by rewriting a state, which is exactly the
 * discipline the production tables enforce. So every test gets its own instance,
 * inserted at the state it needs (the projection guard is BEFORE UPDATE, so an
 * INSERT may set any starting state), and every count is scoped to that
 * instance rather than to the whole table.
 */
let instanceSeq = 0
function newInstance(currentState = 'review'): string {
  instanceSeq += 1
  const id = `aaaaaaaa-0000-4000-8000-${String(instanceSeq).padStart(12, '0')}`
  run(dsn, ['-c', `insert into public.workflow_instances
    (id, def_id, def_key, def_version, def_hash, project_id, instance_key, current_state, status)
    values ('${id}', '${DEF_ID}', 'g3b-probe', 1, '${DEF_HASH}', '${PROJ}',
            'inst-${instanceSeq}', '${currentState}', 'active')`])
  return id
}
function newInstanceIn(projectId: string, currentState = 'review'): string {
  instanceSeq += 1
  const id = `bbbbbbbb-0000-4000-8000-${String(instanceSeq).padStart(12, '0')}`
  run(dsn, ['-c', `insert into public.workflow_instances
    (id, def_id, def_key, def_version, def_hash, project_id, instance_key, current_state, status)
    values ('${id}', '${DEF_ID}', 'g3b-probe', 1, '${DEF_HASH}', '${projectId}',
            'inst-${instanceSeq}', '${currentState}', 'active')`])
  return id
}

/** Both scopes cleared through the CANONICAL setters, never a direct write. */
function clearStops() {
  run(dsn, ['-c', `
    select public.stop_set_platform_automation(false, '${ACTOR}', null);
    select public.stop_set_project_execution('${PROJ}'::uuid, false, '${ACTOR}', null);
  `])
}

const append = (id: string, from = 'review', to = 'done', auth: string | null = null) =>
  `select public.workflow_append_transition('${id}'::uuid, '${from}', '${to}', 'g3b probe', '${ACTOR}', null, ${auth ? `'${auth}'::uuid` : 'null'})`

const transitionsFor = (id: string) =>
  Number(one(dsn, `select count(*) from public.workflow_transitions where instance_id='${id}'`))
const stateOf = (id: string) =>
  one(dsn, `select current_state, status from public.workflow_instances where id='${id}'`)

// ── A. The upgrade path ─────────────────────────────────────────────────────

d('G1–G5 · predecessor chain, then G3B', () => {
  it('G1 · the PRE-G3B function is the real one: gate + CAS, and NO pause reads', () => {
    // If this ever passes against a simplified stand-in, every proof below is
    // meaningless. It asserts the historical migration's actual body.
    const F = 'workflow_append_transition'
    expect(bodyHas(F, 'atlas_authorizations'), 'gate authorization').toBe(true)
    expect(bodyHas(F, 'insufficient_privilege')).toBe(true)
    expect(bodyHas(F, 'serialization_failure'), 'instance CAS').toBe(true)
    expect(bodyHas(F, 'workflow_instances where id = p_instance_id for update')).toBe(true)
    // F-107, stated as a fact about the deployed predecessor.
    expect(bodyHas(F, 'automation_paused'), 'predecessor must NOT read the global flag').toBe(false)
    expect(bodyHas(F, 'execution_paused'), 'predecessor must NOT read the project flag').toBe(false)
  })

  it('G2 · with the PREDECESSOR, a transition succeeds while PAUSED — F-107 reproduced', () => {
    clearStops()
    const id = newInstance('review')
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}'::uuid, true, '${ACTOR}', 'repro')`])
    expect(one(dsn, `select execution_paused from public.projects where id='${PROJ}'`)).toBe('t')
    // The predecessor appends anyway. This is the bug, demonstrated, not asserted.
    run(dsn, ['-c', append(id)])
    expect(transitionsFor(id)).toBe(1)
    expect(stateOf(id)).toBe('done|complete')
    clearStops()
  })

  it('G3 · G3B applies cleanly as CREATE OR REPLACE (no drop, no cascade)', () => {
    expect(() => run(dsn, ['-f', MIG(G3B)])).not.toThrow()
    expect(one(dsn, `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='public' and p.proname='workflow_append_transition'`)).toBe('1')
  })

  it('G4 · signature, return type, security and ACL are unchanged', () => {
    expect(one(dsn, `select pg_get_function_identity_arguments(p.oid)
                       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='public' and p.proname='workflow_append_transition'`))
      .toBe('p_instance_id uuid, p_from_state text, p_to_state text, p_reason text, p_actor text, p_evidence_ref uuid, p_authorization_id uuid')
    expect(one(dsn, `select p.prorettype::regtype::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='public' and p.proname='workflow_append_transition'`))
      .toBe('workflow_transitions')
    expect(one(dsn, `select p.prosecdef::text||'|'||coalesce(array_to_string(p.proconfig,','),'')
                       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='public' and p.proname='workflow_append_transition'`))
      .toBe('true|search_path=\"\"')
    const acl = one(dsn, `select coalesce(array_to_string(p.proacl::text[],' '),'')
                            from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                           where n.nspname='public' and p.proname='workflow_append_transition'`)
    expect(acl).toMatch(/service_role=X/)
    expect(acl).not.toMatch(/\banon=/)
    expect(acl).not.toMatch(/\bauthenticated=/)
  })

  it('G4b · OWNER is preserved by CREATE OR REPLACE', () => {
    // Predecessor-relative: the owner captured BEFORE G3B must be the owner
    // after it. CREATE OR REPLACE does not change ownership, and the migration
    // contains no ALTER OWNER — this proves that rather than assuming it.
    const after = one(dsn, `select pg_get_userbyid(p.proowner) from pg_proc p
                              join pg_namespace n on n.oid=p.pronamespace
                             where n.nspname='public' and p.proname='workflow_append_transition'`)
    expect(preG3bOwner).not.toBe('')
    expect(after, 'CREATE OR REPLACE must not change ownership').toBe(preG3bOwner)
    // The SECURITY DEFINER setters must share that owner, or the guard's
    // trusted-identity comparison would break.
    for (const fn of ['stop_set_platform_automation', 'stop_set_project_execution']) {
      expect(one(dsn, `select pg_get_userbyid(p.proowner) from pg_proc p
                         join pg_namespace n on n.oid=p.pronamespace
                        where n.nspname='public' and p.proname='${fn}'`)).toBe(after)
    }
    // In production this owner is `postgres`; the fixture's owner is whoever
    // created the database, so the invariant that matters is SAMENESS.
    expect(one(dsn, `select pg_get_userbyid(relowner) from pg_class
                      where relname='workflow_instances' and relnamespace='public'::regnamespace`))
      .toBe(after)
  })

  it('G5 · the gate + CAS survive, and the LOCKED stop reads are now present', () => {
    const F = 'workflow_append_transition'
    expect(bodyHas(F, 'atlas_authorizations'), 'gate preserved').toBe(true)
    expect(bodyHas(F, 'insufficient_privilege')).toBe(true)
    expect(bodyHas(F, 'serialization_failure'), 'CAS preserved').toBe(true)
    expect(bodyHas(F, 'workflow_instances where id = p_instance_id for update')).toBe(true)
    // Added, and LOCKED — an unlocked read would not close the race.
    expect(bodyHas(F, 'platform_config pc where pc.id = 1 for share')).toBe(true)
    expect(bodyHas(F, 'projects p where p.id = i.project_id for share')).toBe(true)
    // And NOT via the read model, which takes no locks.
    expect(bodyHas(F, 'stop_state('), 'must not delegate to the lock-free read model').toBe(false)
  })
})

// ── B. The stop matrix ──────────────────────────────────────────────────────

d('G6 · stop matrix', () => {
  const setGlobal = (v: boolean) =>
    run(dsn, ['-c', `select public.stop_set_platform_automation(${v}, '${ACTOR}', 'matrix')`])
  const setProject = (v: boolean) =>
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}'::uuid, ${v}, '${ACTOR}', 'matrix')`])

  it('clear + clear → the transition succeeds', () => {
    clearStops(); const id = newInstance()
    run(dsn, ['-c', append(id)])
    expect(transitionsFor(id)).toBe(1)
    expect(stateOf(id)).toBe('done|complete')
  })

  it('GLOBAL paused + project clear → refused', () => {
    clearStops(); const id = newInstance(); setGlobal(true)
    expect(expectFailure(dsn, append(id))).toMatch(/GLOBAL execution is stopped/)
    expect(transitionsFor(id)).toBe(0)
    expect(stateOf(id)).toBe('review|active')
    clearStops()
  })

  it('global clear + PROJECT paused → refused', () => {
    clearStops(); const id = newInstance(); setProject(true)
    expect(expectFailure(dsn, append(id))).toMatch(/PROJECT execution is stopped/)
    expect(transitionsFor(id)).toBe(0)
    expect(stateOf(id)).toBe('review|active')
    clearStops()
  })

  it('both paused → refused, naming GLOBAL as the broader authority', () => {
    clearStops(); const id = newInstance(); setGlobal(true); setProject(true)
    const err = expectFailure(dsn, append(id))
    expect(err).toMatch(/GLOBAL execution is stopped/)
    expect(err).not.toMatch(/PROJECT execution is stopped/)
    expect(transitionsFor(id)).toBe(0)
    clearStops()
  })

  it('global resumed while project stays paused → STILL refused', () => {
    // Resuming one scope never resumes the other.
    clearStops(); const id = newInstance(); setGlobal(true); setProject(true)
    setGlobal(false)
    expect(expectFailure(dsn, append(id))).toMatch(/PROJECT execution is stopped/)
    expect(transitionsFor(id)).toBe(0)
    clearStops()
  })

  it('project resumed while global stays paused → STILL refused', () => {
    clearStops(); const id = newInstance(); setGlobal(true); setProject(true)
    setProject(false)
    expect(expectFailure(dsn, append(id))).toMatch(/GLOBAL execution is stopped/)
    expect(transitionsFor(id)).toBe(0)
    clearStops()
  })

  it('both resumed → ordinary transition semantics return', () => {
    clearStops(); const id = newInstance(); setGlobal(true); setProject(true)
    setGlobal(false); setProject(false)
    run(dsn, ['-c', append(id)])
    expect(transitionsFor(id)).toBe(1)
    expect(stateOf(id)).toBe('done|complete')
  })

  it('a refusal is not itself a stop event and moves no boolean', () => {
    clearStops(); const id = newInstance(); setProject(true)
    const before = one(dsn, `select count(*) from public.stop_events`)
    expectFailure(dsn, append(id))
    expect(one(dsn, `select count(*) from public.stop_events`)).toBe(before)
    expect(one(dsn, `select execution_paused from public.projects where id='${PROJ}'`)).toBe('t')
    expect(one(dsn, `select automation_paused from public.platform_config where id=1`)).toBe('f')
    clearStops()
  })

  it('the refusal SQLSTATE is restrict_violation, distinct from authorization', () => {
    clearStops(); const id = newInstance(); setProject(true)
    const err = expectFailure(dsn, append(id))
    expect(err).toMatch(/execution is stopped/)
    expect(err).not.toMatch(/insufficient_privilege/)
    clearStops()
  })

  it('another project is unaffected by this project being stopped', () => {
    clearStops(); setProject(true)
    const other = newInstanceIn(PROJ2)
    run(dsn, ['-c', append(other)])
    expect(transitionsFor(other)).toBe(1)
    clearStops()
  })
})

// ── C. Authorization is preserved, and stop outranks it ─────────────────────

d('G7 · a human authorization does not override a stop', () => {
  const AUTH = '66666666-6666-6666-6666-666666666666'
  /** Fresh gated instance plus a live authorization aimed at it. */
  function gatedAndAuthorized(): string {
    clearStops()
    run(dsn, ['-c', `delete from public.atlas_authorizations where authorization_id='${AUTH}'`])
    const id = newInstance('planning')
    run(dsn, ['-c', `insert into public.atlas_authorizations
      (authorization_id, project_id, event_type, target_type, target_id, expires_at)
      values ('${AUTH}', '${PROJ}', 'granted', 'workflow_gate',
              '${id}:planning', now() + interval '1 hour')`])
    return id
  }
  const gated = (id: string) => append(id, 'planning', 'review', AUTH)

  it('the gate still works normally when nothing is stopped', () => {
    const id = gatedAndAuthorized()
    run(dsn, ['-c', gated(id)])
    expect(transitionsFor(id)).toBe(1)
  })

  it('valid authorization + GLOBAL pause → refused BY STOP, not by the gate', () => {
    const id = gatedAndAuthorized()
    run(dsn, ['-c', `select public.stop_set_platform_automation(true, '${ACTOR}', 'g7')`])
    const err = expectFailure(dsn, gated(id))
    expect(err).toMatch(/GLOBAL execution is stopped/)
    expect(err).not.toMatch(/authorization/)
    expect(transitionsFor(id)).toBe(0)
    clearStops()
  })

  it('valid authorization + PROJECT pause → refused BY STOP', () => {
    const id = gatedAndAuthorized()
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}'::uuid, true, '${ACTOR}', 'g7')`])
    expect(expectFailure(dsn, gated(id))).toMatch(/PROJECT execution is stopped/)
    expect(transitionsFor(id)).toBe(0)
    clearStops()
  })

  it('a BACKWARD transition needing no gate is still refused while paused', () => {
    // Pause freezes. Stepping backwards is still workflow progress, and avoiding
    // the gate must not become a way around the stop.
    clearStops()
    const id = newInstance('review')
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}'::uuid, true, '${ACTOR}', 'g7')`])
    expect(expectFailure(dsn, append(id, 'review', 'planning')))
      .toMatch(/PROJECT execution is stopped/)
    expect(transitionsFor(id)).toBe(0)
    clearStops()
  })

  it('RESUME grants no authority — an EXPIRED authorization still fails after resume', () => {
    const id = gatedAndAuthorized()
    run(dsn, ['-c', `update public.atlas_authorizations
                       set expires_at = now() - interval '1 hour' where authorization_id='${AUTH}'`])
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}'::uuid, true, '${ACTOR}', 'g7')`])
    expect(expectFailure(dsn, gated(id))).toMatch(/PROJECT execution is stopped/)
    clearStops()
    // Resumed — and the ORIGINAL authorization failure surfaces, unchanged.
    expect(expectFailure(dsn, gated(id))).toMatch(/carries no live grant/)
    expect(transitionsFor(id)).toBe(0)
  })

  it('RESUME does not revive a REVOKED authorization either', () => {
    const id = gatedAndAuthorized()
    run(dsn, ['-c', `insert into public.atlas_authorizations
      (authorization_id, project_id, event_type) values ('${AUTH}', '${PROJ}', 'revoked')`])
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}'::uuid, true, '${ACTOR}', 'g7')`])
    expectFailure(dsn, gated(id))
    clearStops()
    expect(expectFailure(dsn, gated(id))).toMatch(/revoked|denied|superseded|expired/)
    expect(transitionsFor(id)).toBe(0)
  })

  it('the instance CAS is untouched — a stale from_state still fails as before', () => {
    clearStops()
    const id = newInstance('review')
    expect(expectFailure(dsn, append(id, 'planning', 'review')))
      .toMatch(/stale transition/)
    expect(transitionsFor(id)).toBe(0)
  })
})

// ── D. Fail-closed ──────────────────────────────────────────────────────────

d('G8 · missing stop authority refuses, never defaults to clear', () => {
  it('a missing platform_config row refuses the transition', () => {
    clearStops(); const id = newInstance()
    run(dsn, ['-c', `create table g3b_saved_cfg as select * from public.platform_config;
                     delete from public.platform_config where id=1;`])
    expect(expectFailure(dsn, append(id))).toMatch(/platform stop authority unavailable/)
    expect(transitionsFor(id)).toBe(0)
    run(dsn, ['-c', `insert into public.platform_config select * from g3b_saved_cfg; drop table g3b_saved_cfg;`])
  })

  it('an unresolvable project stop authority refuses the transition', () => {
    // Production has an FK making this structurally impossible; the defensive
    // branch stays anyway, proven in a narrowly controlled fixture rather than by
    // weakening the schema. The FK is dropped only for this one instance and
    // restored immediately.
    clearStops()
    run(dsn, ['-c', `alter table public.workflow_instances drop constraint workflow_instances_project_id_fkey`])
    instanceSeq += 1
    const id = 'cccccccc-0000-4000-8000-000000000001'
    run(dsn, ['-c', `insert into public.workflow_instances
      (id, def_id, def_key, def_version, def_hash, project_id, instance_key, current_state, status)
      values ('${id}', '${DEF_ID}', 'g3b-probe', 1, '${DEF_HASH}',
              '99999999-9999-9999-9999-999999999999', 'orphan-1', 'review', 'active')`])
    expect(expectFailure(dsn, append(id))).toMatch(/project stop authority unavailable/)
    expect(transitionsFor(id)).toBe(0)
    run(dsn, ['-c', `delete from public.workflow_instances where id='${id}';
      alter table public.workflow_instances
        add constraint workflow_instances_project_id_fkey
        foreign key (project_id) references public.projects(id) on delete restrict`])
  })
})

// ── E. THE RACES — separate sessions, measured blocking ─────────────────────

d('G9 · F-107 linearization, proven with real concurrent sessions', () => {
  const HOLD = 1500

  it('RACE A · project pause wins → the append BLOCKS, then REFUSES', async () => {
    clearStops(); const id = newInstance()
    const pauser = session(dsn, `begin;
      select public.stop_set_project_execution('${PROJ}'::uuid, true, '${ACTOR}', 'race-a');
      select pg_sleep(${HOLD / 1000}); commit;`)
    await wait(400)                                   // let A take the lock
    const appender = await session(dsn, append(id))
    const pauseRes = await pauser

    // It BLOCKED: it could not have returned before A released at ~1.5s.
    expect(appender.ms).toBeGreaterThan(HOLD - 700)
    // ...and then observed the COMMITTED pause and refused.
    expect(appender.err).toMatch(/PROJECT execution is stopped/)
    expect(pauseRes.err).toBe('')
    expect(transitionsFor(id)).toBe(0)
    expect(stateOf(id)).toBe('review|active')         // F-107 would have advanced it
    clearStops()
  }, 60_000)

  it('RACE B · global pause wins → the append BLOCKS, then REFUSES', async () => {
    clearStops(); const id = newInstance()
    const pauser = session(dsn, `begin;
      select public.stop_set_platform_automation(true, '${ACTOR}', 'race-b');
      select pg_sleep(${HOLD / 1000}); commit;`)
    await wait(400)
    const appender = await session(dsn, append(id))
    await pauser

    expect(appender.ms).toBeGreaterThan(HOLD - 700)
    expect(appender.err).toMatch(/GLOBAL execution is stopped/)
    expect(transitionsFor(id)).toBe(0)
    expect(stateOf(id)).toBe('review|active')
    clearStops()
  }, 60_000)

  it('RACE C · transition wins → the PROJECT PAUSE waits, then both persist', async () => {
    // The opposite ordering, which must also be correct and deadlock-free. The
    // transition linearized BEFORE the stop, so an advanced-and-paused final
    // state is the right answer, not a violation.
    clearStops(); const id = newInstance()
    const appender = session(dsn, `begin; ${append(id)};
      select pg_sleep(${HOLD / 1000}); commit;`)
    await wait(400)
    const pauser = await session(dsn,
      `select public.stop_set_project_execution('${PROJ}'::uuid, true, '${ACTOR}', 'race-c')`)
    const appendRes = await appender

    expect(pauser.ms).toBeGreaterThan(HOLD - 700)     // the pause WAITED
    expect(appendRes.err).toBe('')
    expect(pauser.err).toBe('')
    expect(transitionsFor(id)).toBe(1)                 // transition persisted
    expect(stateOf(id)).toBe('done|complete')
    expect(one(dsn, `select execution_paused from public.projects where id='${PROJ}'`)).toBe('t')
    expect(appendRes.err + pauser.err).not.toMatch(/deadlock/i)
    clearStops()
  }, 60_000)

  it('RACE C-global · a GLOBAL pause also waits behind an in-flight transition', async () => {
    clearStops(); const id = newInstance()
    const appender = session(dsn, `begin; ${append(id)};
      select pg_sleep(${HOLD / 1000}); commit;`)
    await wait(400)
    const pauser = await session(dsn,
      `select public.stop_set_platform_automation(true, '${ACTOR}', 'race-c-global')`)
    const appendRes = await appender

    expect(pauser.ms).toBeGreaterThan(HOLD - 700)
    expect(appendRes.err).toBe('')
    expect(pauser.err).toBe('')
    expect(transitionsFor(id)).toBe(1)
    expect(one(dsn, `select automation_paused from public.platform_config where id=1`)).toBe('t')
    expect(appendRes.err + pauser.err).not.toMatch(/deadlock/i)
    clearStops()
  }, 60_000)

  it('F-107 LITERAL · a stale application read is irrelevant; SQL is final', () => {
    // T1 read clear → T2 pause COMMITS → T3 append without re-reading.
    clearStops(); const id = newInstance()
    expect(one(dsn, `select execution_paused from public.projects where id='${PROJ}'`)).toBe('f')  // T1
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}'::uuid, true, '${ACTOR}', 'f107')`])
    expect(one(dsn, `select execution_paused from public.projects where id='${PROJ}'`)).toBe('t')  // T2
    // T3: the caller still believes T1. The database refuses regardless.
    expect(expectFailure(dsn, append(id))).toMatch(/PROJECT execution is stopped/)
    expect(transitionsFor(id)).toBe(0)
    expect(stateOf(id)).toBe('review|active')
    clearStops()
  })

  it('no committed transition may follow a committed stop — repeated', async () => {
    for (let i = 0; i < 3; i++) {
      clearStops(); const id = newInstance()
      const pauser = session(dsn, `begin;
        select public.stop_set_project_execution('${PROJ}'::uuid, true, '${ACTOR}', 'loop${i}');
        select pg_sleep(0.8); commit;`)
      await wait(250)
      const appender = await session(dsn, append(id))
      await pauser
      expect(appender.err, `iteration ${i}`).toMatch(/PROJECT execution is stopped/)
      expect(transitionsFor(id), `iteration ${i}`).toBe(0)
    }
    clearStops()
  }, 90_000)
})

// ── F. Lock-order regression ────────────────────────────────────────────────

d('G10 · lock order cannot silently reverse', () => {
  it('the stop setters do NOT lock workflow_instances', () => {
    // A setter that locked an instance before its own stop row would create the
    // reverse edge and make a deadlock cycle possible.
    for (const fn of ['stop_set_platform_automation', 'stop_set_project_execution']) {
      expect(bodyHas(fn, 'workflow_instances'), `${fn} must not touch workflow_instances`)
        .toBe(false)
    }
  })

  it('the append locks the INSTANCE before either stop row', () => {
    const F = 'workflow_append_transition'
    const inst = bodyPos(F, 'workflow_instances where id = p_instance_id for update')
    const plat = bodyPos(F, 'platform_config pc where pc.id = 1 for share')
    const proj = bodyPos(F, 'projects p where p.id = i.project_id for share')
    expect(inst).toBeGreaterThan(0)
    expect(plat).toBeGreaterThan(inst)
    expect(proj).toBeGreaterThan(plat)     // instance → platform → project
  })

  it('the barrier sits after the CAS and before any gate work', () => {
    const F = 'workflow_append_transition'
    const cas  = bodyPos(F, 'stale transition')
    const plat = bodyPos(F, 'platform_config pc where pc.id = 1 for share')
    const gate = bodyPos(F, 'atlas_authorizations')
    expect(cas).toBeGreaterThan(0)
    expect(plat).toBeGreaterThan(cas)      // existing fencing untouched
    expect(gate).toBeGreaterThan(plat)     // a stopped scope costs no gate work
  })

  it('no bypass parameter exists', () => {
    const args = one(dsn, `select pg_get_function_identity_arguments(p.oid)
                             from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and p.proname='workflow_append_transition'`)
    for (const bad of ['context', 'force', 'ignore', 'bypass', 'override']) {
      expect(args.toLowerCase(), `signature must not accept ${bad}`).not.toContain(bad)
    }
    expect(bodyHas('workflow_append_transition', 'current_setting')).toBe(false)
    expect(bodyHas('workflow_append_transition', 'set_config')).toBe(false)
  })
})

// ── G. The SQLSTATE contract, from real diagnostics ─────────────────────────

d('G11 · exact SQLSTATE per failure domain', () => {
  const setGlobal = (v: boolean) =>
    run(dsn, ['-c', `select public.stop_set_platform_automation(${v}, '${ACTOR}', 'sqlstate')`])
  const setProject = (v: boolean) =>
    run(dsn, ['-c', `select public.stop_set_project_execution('${PROJ}'::uuid, ${v}, '${ACTOR}', 'sqlstate')`])

  it('GLOBAL stop → 23001 restrict_violation', () => {
    clearStops(); const id = newInstance(); setGlobal(true)
    const r = sqlstateOf(append(id))
    expect(r.code).toBe('23001')                       // restrict_violation
    expect(r.msg).toMatch(/GLOBAL execution is stopped/)   // secondary, semantic
    clearStops()
  })

  it('PROJECT stop → 23001 restrict_violation', () => {
    clearStops(); const id = newInstance(); setProject(true)
    const r = sqlstateOf(append(id))
    expect(r.code).toBe('23001')
    expect(r.msg).toMatch(/PROJECT execution is stopped/)
    clearStops()
  })

  it('AUTHORIZATION failure → 42501 insufficient_privilege, scopes clear', () => {
    // The domain that must stay DISTINCT from a stop. If a mutation swapped the
    // stop code for this one, the two failure classes would collapse into one.
    clearStops()
    const id = newInstance('planning')                 // gated state, no authorization
    const r = sqlstateOf(append(id, 'planning', 'review'))
    expect(r.code).toBe('42501')                       // insufficient_privilege
    expect(r.code).not.toBe('23001')
    expect(r.msg).toMatch(/human gate|authorization/)
  })

  it('the two domains really are different codes', () => {
    // Stated as its own assertion because this IS the contract: a caller can
    // tell "stopped" from "not authorized" without reading prose.
    clearStops()
    const gatedId = newInstance('planning')
    const authCode = sqlstateOf(append(gatedId, 'planning', 'review')).code
    const stopId = newInstance()
    setProject(true)
    const stopCode = sqlstateOf(append(stopId)).code
    clearStops()
    expect(authCode).toBe('42501')
    expect(stopCode).toBe('23001')
    expect(stopCode).not.toBe(authCode)
  })

  it('stale CAS → 40001 serialization_failure, unchanged by G3B', () => {
    clearStops()
    const id = newInstance('review')
    const r = sqlstateOf(append(id, 'planning', 'review'))
    expect(r.code).toBe('40001')                       // serialization_failure
    expect(r.msg).toMatch(/stale transition/)
  })

  it('missing PLATFORM stop authority → P0002', () => {
    clearStops(); const id = newInstance()
    run(dsn, ['-c', `create table g3b_cfg_bak as select * from public.platform_config;
                     delete from public.platform_config where id=1;`])
    const r = sqlstateOf(append(id))
    expect(r.code).toBe('P0002')                       // no_data_found
    expect(r.msg).toMatch(/platform stop authority unavailable/)
    run(dsn, ['-c', `insert into public.platform_config select * from g3b_cfg_bak; drop table g3b_cfg_bak;`])
  })

  it('missing PROJECT stop authority → P0002', () => {
    clearStops()
    run(dsn, ['-c', `alter table public.workflow_instances drop constraint workflow_instances_project_id_fkey`])
    const id = 'dddddddd-0000-4000-8000-000000000001'
    run(dsn, ['-c', `insert into public.workflow_instances
      (id, def_id, def_key, def_version, def_hash, project_id, instance_key, current_state, status)
      values ('${id}', '${DEF_ID}', 'g3b-probe', 1, '${DEF_HASH}',
              '99999999-9999-9999-9999-999999999999', 'orphan-sqlstate', 'review', 'active')`])
    const r = sqlstateOf(append(id))
    expect(r.code).toBe('P0002')
    expect(r.msg).toMatch(/project stop authority unavailable/)
    run(dsn, ['-c', `delete from public.workflow_instances where id='${id}';
      alter table public.workflow_instances
        add constraint workflow_instances_project_id_fkey
        foreign key (project_id) references public.projects(id) on delete restrict`])
  })

  it('a SUCCESSFUL transition reports no error at all', () => {
    // Guards the guard: if sqlstateOf() silently swallowed everything it would
    // report 00000 for the failures above too.
    clearStops(); const id = newInstance()
    const r = sqlstateOf(append(id))
    expect(r.code).toBe('00000')
    expect(transitionsFor(id)).toBe(1)
  })
})
