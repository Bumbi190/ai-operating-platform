/**
 * Phase 3B1B2 · M1 — authority serialization primitives, proven on REAL
 * PostgreSQL with REAL concurrent sessions.
 *
 *   A. `atlas_decision_lineage_heads`: one lockable head per Decision Ledger
 *      lineage, moved by the database in the same transaction as every
 *      lifecycle-advancing act. A future bind holding it FOR SHARE defers a
 *      competing lifecycle writer's commit; a writer that got there first makes
 *      the bind wait and then read the NEW head.
 *   B. `autonomy_license_append` locks the workflow instance FIRST — so a fresh
 *      LICENSE_ISSUED (no licence rows to lock) still serializes.
 *
 * Built from the REAL migration chain: the Decision Ledger (Chapter 11), the
 * Phase 2C licence ledger, and M1. Only `projects` and `workflow_instances` are
 * fixtures, reduced to the columns these migrations read.
 *
 * Every two-session case proves the waiting side is GENUINELY blocked on a lock
 * (pg_stat_activity.wait_event_type = 'Lock', by application_name) rather than
 * inferring it from timing. Sessions run with `lock_timeout` and PostgreSQL's
 * own deadlock detector, so an accidental deadlock fails fast instead of hanging.
 *
 * The bind SIMULATOR creates no run: it only takes the future M4 lock order
 * (instance FOR UPDATE → decision head FOR SHARE → licence read) and reports
 * what it saw.
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
const MIGRATIONS = join(process.cwd(), 'supabase/migrations')
const DECISION_LEDGER = join(MIGRATIONS, '20260819_atlas_decision_ledger.sql')
const LICENCE = join(MIGRATIONS, '20260924180000_autonomy_license_phase2c.sql')
const M1 = join(MIGRATIONS, '20261002140000_autonomy_authority_serialization.sql')

function dsnFor(database: string, app?: string): string {
  const url = new URL(ADMIN_URL)
  url.pathname = `/${database}`
  if (app) url.searchParams.set('application_name', app)
  return url.toString()
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
const one = (dsn: string, sql: string) => (query(dsn, sql)[0] ?? []).join('|')
/** SQLSTATE of a statement expected to fail ('' if it succeeded). */
function sqlstate(dsn: string, sql: string): string {
  try {
    execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-X', '-q', '-d', dsn, '-c', sql],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return ''
  } catch (e) {
    return /ERROR:\s+([0-9A-Z]{5}):/.exec(String((e as { stderr?: unknown }).stderr ?? ''))?.[1] ?? 'unknown'
  }
}

interface Outcome { ok: boolean; out: string; stderr: string; state: string; endedAt: number }
/** One statement batch in its OWN session, genuinely concurrent with others. */
function session(app: string, sql: string): Promise<Outcome> {
  const body = `set lock_timeout = '15s'; set deadlock_timeout = '200ms'; ${sql}`
  return new Promise(resolve => {
    const child = spawn(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-X', '-q', '-t', '-A', '-F', '|',
      '-d', dsnFor(DB, app), '-c', body], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let stderr = ''
    child.stdout.on('data', c => { out += String(c) })
    child.stderr.on('data', c => { stderr += String(c) })
    child.on('close', code => resolve({
      ok: code === 0, out: out.trim(), stderr,
      state: /ERROR:\s+([0-9A-Z]{5}):/.exec(stderr)?.[1] ?? '', endedAt: Date.now(),
    }))
  })
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Resolves once the session named `app` is waiting on a heavyweight lock. */
async function blockedOnLock(app: string, timeoutMs = 8_000): Promise<boolean> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const n = one(dsn, `select count(*) from pg_stat_activity where application_name = '${app}' and wait_event_type = 'Lock'`)
    if (n === '1') return true
    await sleep(100)
  }
  return false
}

/** Resolves once the session named `app` exists and is inside pg_sleep (holding its locks). */
async function holding(app: string, timeoutMs = 8_000): Promise<boolean> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const n = one(dsn, `select count(*) from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep'`)
    if (n === '1') return true
    await sleep(50)
  }
  return false
}

/**
 * Relations the session named `app` holds ANY lock on while it waits. A licence
 * writer blocked at the instance lock FIRST holds none on the licence or Decision
 * tables; one blocked only at the foreign key's implicit FOR KEY SHARE (at insert
 * time) has already read — and locked — both.
 */
function lockedRelations(app: string): string[] {
  return query(dsn, `select distinct l.relation::regclass::text from pg_locks l
    join pg_stat_activity a on a.pid = l.pid
   where a.application_name = '${app}' and l.relation is not null and l.granted
     and l.relation::regclass::text in ('atlas_autonomy_license_events', 'atlas_decision_ledger')
   order by 1`).map(r => r[0])
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
  console.warn('[authority-serialization-m1-sql] SKIPPED — no reachable local Postgres. M1 serialization was NOT proven.')
}

const tag = `${process.pid}_${Math.random().toString(36).slice(2, 7)}`
const DB = `omnira_m1_${tag}`
let dsn = ''
const scratch: string[] = []

// ── Fixture ──────────────────────────────────────────────────────────────────

const P_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INST_A = '99999999-9999-4999-8999-999999999999'
const INST_B = '88888888-8888-4888-8888-888888888888'
const ACTOR = 'user:11111111-1111-4111-8111-111111111111'
const PRINCIPAL = '11111111-1111-4111-8111-111111111111'
const DEF_KEY = 'familje-stunden.monthly-release'

const FIXTURE = `
create extension if not exists pgcrypto;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then begin create role service_role; exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then begin create role anon; exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then begin create role authenticated; exception when duplicate_object or unique_violation then null; end; end if;
end $do$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table public.projects (id uuid primary key default gen_random_uuid(), slug text unique not null, name text);
create table public.workflow_instances (
  id uuid primary key, project_id uuid not null references public.projects (id),
  def_key text not null, def_hash text not null, current_state text not null default 'planning');
insert into public.projects (id, slug) values ('${P_A}','alpha'), ('${P_B}','beta');
insert into public.workflow_instances (id, project_id, def_key, def_hash) values
  ('${INST_A}','${P_A}','${DEF_KEY}', repeat('f',64)),
  ('${INST_B}','${P_B}','${DEF_KEY}', repeat('f',64));
`

const uuid = (n: number, prefix = 'c') =>
  `${prefix.repeat(8)}-0000-4000-8000-${String(n).padStart(12, '0')}`

/** One Decision Ledger act, exactly the columns the ledger requires. */
function act(decision: string, type: string, generation: number, opts: { record?: string; project?: string; version?: number; autonomy?: boolean } = {}) {
  const record = opts.record ?? uuid(Math.floor(Math.random() * 1e11), 'e')
  return `insert into public.atlas_decision_ledger
    (record_id, decision_id, record_type, project_id, principal_id, title, statement, materiality, version, lifecycle_generation)
    values ('${record}', '${decision}', '${type}', '${opts.project ?? P_A}', '${PRINCIPAL}', 'Title', 'Statement',
            '${opts.autonomy === false ? '["customers"]' : '["autonomy"]'}'::jsonb, ${opts.version ?? 1}, ${generation})`
}

function head(decision: string): Record<string, string> | null {
  const rows = query(dsn, `select head_record_id, head_generation, head_record_type, head_version, project_id
    from public.atlas_decision_lineage_heads where decision_id = '${decision}'`)
  if (!rows.length) return null
  const [r, g, t, v, p] = rows[0]
  return { record: r, generation: g, type: t, version: v, project: p }
}

/** An approved autonomy decision: drafted(0) → proposed(1) → approved(2). Returns the approval record id. */
function approvedDecision(decision: string, project = P_A): string {
  const approval = uuid(Math.floor(Math.random() * 1e11), 'f')
  run(dsn, ['-c', `${act(decision, 'drafted', 0, { project })}; ${act(decision, 'proposed', 1, { project })};
    ${act(decision, 'approved', 2, { project, record: approval, version: 1 })};`])
  return approval
}

function licenceCall(o: {
  licence: string; generation: number; act: string; instance?: string; project?: string;
  decision: string; record: string; level?: string; kinds?: string; from?: string; to?: string; supersededBy?: string
}): string {
  return `select license_generation from public.autonomy_license_append(
    p_license_id => '${o.licence}', p_expected_generation => ${o.generation}, p_act => '${o.act}',
    p_project_id => '${o.project ?? P_A}', p_workflow_instance_id => '${o.instance ?? INST_A}',
    p_bound_def_key => '${DEF_KEY}', p_bound_def_hash => repeat('f',64),
    p_licensed_level => '${o.level ?? 'L3'}',
    p_allowed_action_kinds => ${o.kinds ?? `array['generate_monthly_story','validate_monthly_story']`},
    p_action_scope_fingerprint => repeat('a',64),
    p_decision_id => '${o.decision}', p_decision_version => 1, p_decision_record_id => '${o.record}',
    p_effective_at => '${o.from ?? '2026-10-01T00:00:00Z'}', p_expires_at => '${o.to ?? '2026-12-01T00:00:00Z'}',
    p_superseded_by_license_id => ${o.supersededBy ? `'${o.supersededBy}'` : 'null'},
    p_reason => null, p_actor => '${ACTOR}')`
}

/** The FUTURE M4 lock order, minus the run: instance → decision head → licence read. */
function bindSimulator(instance: string, decision: string, holdSeconds: number): string {
  return `begin;
    select 'instance', id from public.workflow_instances where id = '${instance}' for update;
    select 'head', head_generation, head_record_type from public.atlas_decision_lineage_heads
      where decision_id = '${decision}' for share;
    select 'licences', count(*) from public.atlas_autonomy_license_events where workflow_instance_id = '${instance}';
    select pg_sleep(${holdSeconds});
    select 'head_after', head_generation from public.atlas_decision_lineage_heads where decision_id = '${decision}';
    commit;`
}

const d = AVAILABLE ? describe : describe.skip

d('Phase 3B1B2 M1 — authority serialization (real PostgreSQL, real concurrent sessions)', () => {
  beforeAll(() => {
    if (!AVAILABLE) {
      if (SQL_REQUIRED) throw new Error('[authority-serialization-m1-sql] Postgres REQUIRED but unreachable.')
      return
    }
    run(ADMIN_URL, ['-c', `create database "${DB}"`])
    dsn = dsnFor(DB)
    run(dsn, ['-c', FIXTURE])
    run(dsn, ['-f', DECISION_LEDGER])
    run(dsn, ['-f', LICENCE])
    run(dsn, ['-1', '-f', M1])
  }, 120_000)

  afterAll(() => {
    if (!AVAILABLE) return
    for (const db of [DB, ...scratch]) {
      try { run(ADMIN_URL, ['-c', `drop database if exists "${db}" with (force)`]) } catch { /* best effort */ }
    }
  })

  it('PostgreSQL is reachable — this suite must never pass by skipping in CI', () => {
    expect(AVAILABLE).toBe(true)
    expect(one(dsn, `select current_setting('server_version_num')::int >= 170000`)).toBe('t')
  })

  // ── Migration over existing history ───────────────────────────────────────

  describe('M1-A migration over existing Decision Ledger history', () => {
    /** A fresh database with the pre-M1 chain and `seed` applied; returns the outcome of applying M1. */
    function migrateOver(seed: string): { db: string; dsn: string; state: string } {
      const db = `omnira_m1b_${tag}_${scratch.length}`
      scratch.push(db)
      run(ADMIN_URL, ['-c', `create database "${db}"`])
      const local = dsnFor(db)
      run(local, ['-c', FIXTURE])
      run(local, ['-f', DECISION_LEDGER])
      run(local, ['-f', LICENCE])
      if (seed) run(local, ['-c', seed])
      let state = ''
      try { run(local, ['-1', '-v', 'VERBOSITY=verbose', '-f', M1]) } catch (e) {
        state = /ERROR:\s+([0-9A-Z]{5}):/.exec(String((e as { stderr?: unknown }).stderr ?? ''))?.[1] ?? 'unknown'
      }
      return { db, dsn: local, state }
    }

    it('applies on an EMPTY ledger and creates no heads', () => {
      const { dsn: local, state } = migrateOver('')
      expect(state).toBe('')
      expect(one(local, 'select count(*) from public.atlas_decision_lineage_heads')).toBe('0')
    })

    it('backfills seeded valid lineages deterministically from canonical fields, without touching the ledger', () => {
      const D1 = uuid(1, 'd'); const D2 = uuid(2, 'd'); const D3 = uuid(3, 'd'); const D4 = uuid(4, 'd')
      const seed = [
        // D1: drafted → proposed → approved, then annotations AFTER the approval.
        act(D1, 'drafted', 0, { record: uuid(11) }), act(D1, 'proposed', 1, { record: uuid(12) }),
        act(D1, 'approved', 2, { record: uuid(13), version: 1 }),
        act(D1, 'outcome_observed', 3, { record: uuid(14) }), act(D1, 'reviewed', 3, { record: uuid(15) }),
        // D2: a longer lineage ending in an amendment (version 2).
        act(D2, 'proposed', 0, { record: uuid(21) }), act(D2, 'approved', 1, { record: uuid(22) }),
        act(D2, 'amended', 2, { record: uuid(23), version: 2 }),
        // D3: a single draft in project B.
        act(D3, 'drafted', 0, { record: uuid(31), project: P_B }),
        // D4: annotation-only — no lifecycle history, so no head.
        act(D4, 'reviewed', 0, { record: uuid(41) }),
      ].join(';\n') + ';'
      const { dsn: local, state } = migrateOver(seed)
      expect(state).toBe('')
      const heads = query(local, `select decision_id, head_record_id, head_generation, head_record_type, head_version, project_id
        from public.atlas_decision_lineage_heads order by decision_id`)
      expect(heads).toEqual([
        [D1, uuid(13), '2', 'approved', '1', P_A],
        [D2, uuid(23), '2', 'amended', '2', P_A],
        [D3, uuid(31), '0', 'drafted', '1', P_B],
      ])
      expect(one(local, 'select count(*) from public.atlas_decision_ledger')).toBe('10')   // nothing rewritten
    })

    it('also applies statement-by-statement (no surrounding transaction) and backfills the same heads', () => {
      const db = `omnira_m1c_${tag}`
      scratch.push(db)
      run(ADMIN_URL, ['-c', `create database "${db}"`])
      const local = dsnFor(db)
      run(local, ['-c', FIXTURE])
      run(local, ['-f', DECISION_LEDGER])
      run(local, ['-f', LICENCE])
      const D = uuid(8, 'd')
      run(local, ['-c', `${act(D, 'drafted', 0, { record: uuid(81) })}; ${act(D, 'proposed', 1, { record: uuid(82) })};`])
      run(local, ['-f', M1])                                          // autocommit: no -1
      expect(one(local, `select head_record_id, head_generation from public.atlas_decision_lineage_heads where decision_id = '${D}'`))
        .toBe(`${uuid(82)}|1`)
      run(local, ['-c', act(D, 'approved', 2, { record: uuid(83) })])
      expect(one(local, `select head_record_id from public.atlas_decision_lineage_heads where decision_id = '${D}'`)).toBe(uuid(83))
    })

    it('FAILS CLOSED on non-contiguous lifecycle generations — and leaves nothing behind', () => {
      const D = uuid(5, 'd')
      const { dsn: local, state } = migrateOver(`${act(D, 'drafted', 0)}; ${act(D, 'approved', 2)};`)
      expect(state).toBe('23514')
      expect(one(local, `select to_regclass('public.atlas_decision_lineage_heads') is null`)).toBe('t')
      expect(one(local, `select count(*) from pg_trigger where tgname = 'atlas_decision_lineage_head_advance'`)).toBe('0')
    })

    it('FAILS CLOSED on a lineage that does not start at generation 0', () => {
      const D = uuid(6, 'd')
      const { state } = migrateOver(`${act(D, 'proposed', 1)};`)
      expect(state).toBe('23514')
    })

    it('FAILS CLOSED on a lineage that names more than one project', () => {
      const D = uuid(7, 'd')
      const { state } = migrateOver(`${act(D, 'drafted', 0)}; ${act(D, 'proposed', 1, { project: P_B })};`)
      expect(state).toBe('23514')
    })
  })

  // ── Head maintenance ──────────────────────────────────────────────────────

  describe('M1-A head maintenance by the database', () => {
    it('every lifecycle-advancing act moves the head; record id, generation, type and version are copied verbatim', () => {
      const D = uuid(100, 'd')
      const types = ['drafted', 'proposed', 'approved', 'deferred', 'proposed', 'approved', 'amended', 'superseded']
      // A lineage need not be semantically valid for the HEAD — Chapter 11 validity is
      // the TypeScript boundary's job. The head only tracks the lifecycle sequence.
      types.forEach((t, g) => {
        const record = uuid(1000 + g)
        run(dsn, ['-c', act(D, t, g, { record, version: g + 1 })])
        expect(head(D)).toEqual({ record, generation: String(g), type: t, version: String(g + 1), project: P_A })
      })
    })

    it.each(['rejected', 'reversed', 'completed'])('the closing act "%s" moves the head too', (type) => {
      const D = uuid(Math.floor(Math.random() * 1e9), 'd')
      approvedDecision(D)
      run(dsn, ['-c', act(D, type, 3)])
      expect(head(D)?.type).toBe(type)
      expect(head(D)?.generation).toBe('3')
    })

    it('annotations (outcome_observed, reviewed) do NOT move the head', () => {
      const D = uuid(200, 'd')
      const approval = approvedDecision(D)
      const before = head(D)
      run(dsn, ['-c', `${act(D, 'outcome_observed', 3)}; ${act(D, 'reviewed', 3)}; ${act(D, 'reviewed', 3)};`])
      expect(head(D)).toEqual(before)
      expect(head(D)?.record).toBe(approval)
    })

    it('a lifecycle act that is not exactly head + 1 is refused (23514) and nothing is written', () => {
      const D = uuid(300, 'd')
      approvedDecision(D)
      expect(sqlstate(dsn, act(D, 'reversed', 5))).toBe('23514')
      expect(one(dsn, `select count(*) from public.atlas_decision_ledger where decision_id = '${D}'`)).toBe('3')
      expect(head(D)?.generation).toBe('2')
    })

    it('a first act at generation > 0 is refused (23514)', () => {
      expect(sqlstate(dsn, act(uuid(301, 'd'), 'drafted', 1))).toBe('23514')
    })

    it('a lifecycle act moving the lineage to another project is refused (23514)', () => {
      const D = uuid(302, 'd')
      approvedDecision(D)
      expect(sqlstate(dsn, act(D, 'amended', 3, { project: P_B }))).toBe('23514')
    })

    it('the existing optimistic-concurrency contract is unchanged: a second act at the same generation is 23505', () => {
      const D = uuid(303, 'd')
      approvedDecision(D)
      expect(sqlstate(dsn, act(D, 'amended', 2))).toBe('23505')
    })

    it('rollback rolls back the ledger row AND the head together', () => {
      const D = uuid(304, 'd')
      approvedDecision(D)
      const before = head(D)
      run(dsn, ['-c', `begin; ${act(D, 'reversed', 3)}; rollback;`])
      expect(head(D)).toEqual(before)
      expect(one(dsn, `select count(*) from public.atlas_decision_ledger where decision_id = '${D}'`)).toBe('3')
    })

    it('a service_role ledger insert (today\'s only writer path) moves the head', () => {
      const D = uuid(305, 'd')
      run(dsn, ['-c', `set role service_role; ${act(D, 'drafted', 0, { record: uuid(3051) })};`])
      expect(head(D)?.record).toBe(uuid(3051))
    })
  })

  // ── Hardening ─────────────────────────────────────────────────────────────

  describe('M1-A head hardening', () => {
    const D = uuid(400, 'd')
    beforeAll(() => { if (AVAILABLE) approvedDecision(D) })

    it.each(['anon', 'authenticated', 'service_role'])('%s cannot INSERT, UPDATE, DELETE or TRUNCATE a head', (role) => {
      expect(sqlstate(dsn, `set role ${role}; insert into public.atlas_decision_lineage_heads values
        ('${uuid(401, 'd')}', '${P_A}', '${uuid(401)}', 0, 'drafted', 1)`)).toBe('42501')
      expect(sqlstate(dsn, `set role ${role}; update public.atlas_decision_lineage_heads set head_generation = 9`)).toBe('42501')
      expect(sqlstate(dsn, `set role ${role}; delete from public.atlas_decision_lineage_heads`)).toBe('42501')
      expect(sqlstate(dsn, `set role ${role}; truncate public.atlas_decision_lineage_heads`)).toBe('42501')
    })

    it('anon and authenticated cannot even read heads; service_role can (for a future SECURITY DEFINER bind)', () => {
      expect(sqlstate(dsn, `set role anon; select * from public.atlas_decision_lineage_heads`)).toBe('42501')
      expect(sqlstate(dsn, `set role authenticated; select * from public.atlas_decision_lineage_heads`)).toBe('42501')
      expect(sqlstate(dsn, `set role service_role; select * from public.atlas_decision_lineage_heads`)).toBe('')
    })

    it('even the owner cannot move a head backwards, sideways, or delete it (guard trigger)', () => {
      expect(sqlstate(dsn, `update public.atlas_decision_lineage_heads set head_generation = 0 where decision_id = '${D}'`)).toBe('42501')
      expect(sqlstate(dsn, `update public.atlas_decision_lineage_heads set project_id = '${P_B}' where decision_id = '${D}'`)).toBe('42501')
      expect(sqlstate(dsn, `delete from public.atlas_decision_lineage_heads where decision_id = '${D}'`)).toBe('42501')
      expect(sqlstate(dsn, `truncate public.atlas_decision_lineage_heads`)).toBe('42501')
    })

    it('incidentally, the Decision Ledger can no longer be TRUNCATEd (its pre-existing service_role TRUNCATE grant is inert)', () => {
      // The head's FK makes a plain TRUNCATE impossible; CASCADE reaches the head,
      // where service_role holds no privilege and the owner meets the no-truncate guard.
      expect(sqlstate(dsn, `set role service_role; truncate public.atlas_decision_ledger`)).toBe('0A000')
      expect(sqlstate(dsn, `set role service_role; truncate public.atlas_decision_ledger cascade`)).toBe('42501')
      expect(sqlstate(dsn, `truncate public.atlas_decision_ledger cascade`)).toBe('42501')
      expect(Number(one(dsn, 'select count(*) from public.atlas_decision_ledger'))).toBeGreaterThan(0)
    })

    it('trigger functions are machinery: no client role may execute them', () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const fn of ['atlas_decision_lineage_head_advance()', 'atlas_decision_lineage_heads_guard()']) {
          expect(one(dsn, `select has_function_privilege('${role}', 'public.${fn}', 'execute')`)).toBe('f')
        }
      }
    })

    it('SECURITY DEFINER machinery pins its search_path; RLS is on with zero policies', () => {
      expect(one(dsn, `select prosecdef, proconfig[1] from pg_proc where proname = 'atlas_decision_lineage_head_advance'`))
        .toBe('t|search_path=""')
      expect(one(dsn, `select prosecdef, proconfig[1] from pg_proc where proname = 'autonomy_license_append'`))
        .toBe('t|search_path=""')
      expect(one(dsn, `select relrowsecurity, (select count(*) from pg_policy where polrelid = c.oid)
        from pg_class c where oid = 'public.atlas_decision_lineage_heads'::regclass`)).toBe('t|0')
    })
  })

  // ── Decision head: two-session races ──────────────────────────────────────

  describe('M1-A lock contract — two real sessions', () => {
    it('A: bind-simulator holds the head FOR SHARE → a reversal BLOCKS → bind commits → reversal commits with its head', async () => {
      const D = uuid(500, 'd')
      approvedDecision(D)
      const bind = session(`m1_bind_a_${tag}`, bindSimulator(INST_A, D, 2))
      expect(await holding(`m1_bind_a_${tag}`)).toBe(true)
      const writer = session(`m1_writer_a_${tag}`, act(D, 'reversed', 3, { record: uuid(5003) }))
      expect(await blockedOnLock(`m1_writer_a_${tag}`)).toBe(true)        // genuinely waiting on the head
      expect(head(D)?.generation).toBe('2')                                  // nothing committed meanwhile
      const [b, w] = await Promise.all([bind, writer])
      expect(b.ok).toBe(true)
      expect(b.out).toContain('head|2|approved')
      expect(b.out).toContain('head_after|2')                               // stable for the whole bind
      expect(w.ok).toBe(true)
      expect(w.endedAt).toBeGreaterThanOrEqual(b.endedAt)
      expect(head(D)).toMatchObject({ record: uuid(5003), generation: '3', type: 'reversed' })
    }, 30_000)

    it('B: the writer moves the head first → the bind-simulator WAITS → then reads the NEW head, never the stale one', async () => {
      const D = uuid(501, 'd')
      approvedDecision(D)
      const writer = session(`m1_writer_b_${tag}`,
        `begin; ${act(D, 'amended', 3, { record: uuid(5013), version: 2 })}; select pg_sleep(2); commit;`)
      expect(await holding(`m1_writer_b_${tag}`)).toBe(true)
      const bind = session(`m1_bind_b_${tag}`, bindSimulator(INST_A, D, 0))
      expect(await blockedOnLock(`m1_bind_b_${tag}`)).toBe(true)
      const [w, b] = await Promise.all([writer, bind])
      expect(w.ok).toBe(true)
      expect(b.ok).toBe(true)
      expect(b.out).toContain('head|3|amended')                              // the NEW head
      expect(b.out).not.toContain('head|2|')
    }, 30_000)

    it('an annotation is NOT blocked by a bind holding the head (it never touches the head)', async () => {
      const D = uuid(502, 'd')
      approvedDecision(D)
      const bind = session(`m1_bind_n_${tag}`, bindSimulator(INST_A, D, 2))
      expect(await holding(`m1_bind_n_${tag}`)).toBe(true)
      const note = await session(`m1_note_${tag}`, act(D, 'reviewed', 3))
      expect(note.ok).toBe(true)
      const b = await bind
      expect(note.endedAt).toBeLessThan(b.endedAt)                           // finished while the bind still held
    }, 30_000)

    it('a writer blocked by a bind and then ROLLED BACK leaves neither its row nor a moved head', async () => {
      const D = uuid(503, 'd')
      approvedDecision(D)
      const bind = session(`m1_bind_r_${tag}`, bindSimulator(INST_A, D, 1.5))
      expect(await holding(`m1_bind_r_${tag}`)).toBe(true)
      const writer = session(`m1_writer_r_${tag}`, `begin; ${act(D, 'reversed', 3)}; rollback;`)
      expect(await blockedOnLock(`m1_writer_r_${tag}`)).toBe(true)
      await Promise.all([bind, writer])
      expect(head(D)?.generation).toBe('2')
      expect(one(dsn, `select count(*) from public.atlas_decision_ledger where decision_id = '${D}'`)).toBe('3')
    }, 30_000)
  })

  // ── Licence writer serialization ──────────────────────────────────────────

  describe('M1-B licence writer locks the workflow instance first', () => {
    const DEC = uuid(600, 'd')
    let REC = ''
    beforeAll(() => { if (AVAILABLE) REC = approvedDecision(DEC) })
    const L = (n: number) => uuid(n, '7')

    it('the whole Phase 2C act lifecycle still works: issue → restrict → suspend → revoke, with a supersession lineage', () => {
      expect(one(dsn, licenceCall({ licence: L(1), generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC }))).toBe('0')
      expect(one(dsn, licenceCall({ licence: L(1), generation: 1, act: 'LICENSE_RESTRICTED', decision: DEC, record: REC,
        level: 'L2', kinds: `array['validate_monthly_story']` }))).toBe('1')
      expect(one(dsn, licenceCall({ licence: L(1), generation: 2, act: 'LICENSE_SUSPENDED', decision: DEC, record: REC,
        level: 'L2', kinds: `array['validate_monthly_story']` }))).toBe('2')
      expect(one(dsn, licenceCall({ licence: L(1), generation: 3, act: 'LICENSE_REVOKED', decision: DEC, record: REC,
        level: 'L2', kinds: `array['validate_monthly_story']` }))).toBe('3')
      expect(one(dsn, licenceCall({ licence: L(2), generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC }))).toBe('0')
      expect(one(dsn, licenceCall({ licence: L(3), generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC }))).toBe('0')
      expect(one(dsn, licenceCall({ licence: L(2), generation: 1, act: 'LICENSE_SUPERSEDED', decision: DEC, record: REC,
        supersededBy: L(3) }))).toBe('1')
    })

    it('existing semantics are preserved: stale generation 40001; widening, terminal and wrong-subject acts 22023', () => {
      expect(sqlstate(dsn, licenceCall({ licence: L(3), generation: 0, act: 'LICENSE_RESTRICTED', decision: DEC, record: REC }))).toBe('40001')
      expect(sqlstate(dsn, licenceCall({ licence: L(3), generation: 1, act: 'LICENSE_RESTRICTED', decision: DEC, record: REC,
        level: 'L4' }))).toBe('22023')
      expect(sqlstate(dsn, licenceCall({ licence: L(1), generation: 4, act: 'LICENSE_RESTRICTED', decision: DEC, record: REC,
        level: 'L1', kinds: `array['validate_monthly_story']` }))).toBe('22023')            // terminal
      // Wrong instance for an EXISTING licence: refused (the named instance being lockable grants nothing).
      expect(sqlstate(dsn, licenceCall({ licence: L(3), generation: 1, act: 'LICENSE_RESTRICTED', decision: DEC, record: REC,
        instance: INST_B, project: P_B }))).toBe('22023')
      // Fresh issue naming a subject the instance does not have.
      expect(sqlstate(dsn, licenceCall({ licence: L(9), generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC,
        instance: INST_B }))).toBe('22023')
      // A nonexistent instance: nothing to lock, refused by the unchanged subject check.
      expect(sqlstate(dsn, licenceCall({ licence: L(10), generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC,
        instance: uuid(1, '5') }))).toBe('22023')
    })

    it('1. bind-simulator holds the instance → a FRESH LICENSE_ISSUED (zero licence rows) WAITS', async () => {
      const bind = session(`m1_bind_1_${tag}`, bindSimulator(INST_A, DEC, 2))
      expect(await holding(`m1_bind_1_${tag}`)).toBe(true)
      const issue = session(`m1_issue_1_${tag}`, licenceCall({ licence: L(11), generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC }))
      expect(await blockedOnLock(`m1_issue_1_${tag}`)).toBe(true)
      // Blocked at the instance BEFORE any licence or Decision access — not merely at the FK.
      expect(lockedRelations(`m1_issue_1_${tag}`)).toEqual([])
      expect(one(dsn, `select count(*) from public.atlas_autonomy_license_events where license_id = '${L(11)}'`)).toBe('0')
      const [b, i] = await Promise.all([bind, issue])
      expect(b.ok && i.ok).toBe(true)
      expect(b.out).not.toContain(L(11))
      expect(i.endedAt).toBeGreaterThanOrEqual(b.endedAt)
    }, 30_000)

    it('2. a fresh LICENSE_ISSUED holds the instance → the bind-simulator WAITS, then sees the licence', async () => {
      const issue = session(`m1_issue_2_${tag}`, `begin; ${licenceCall({ licence: L(12), generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC })}; select pg_sleep(2); commit;`)
      expect(await holding(`m1_issue_2_${tag}`)).toBe(true)
      const before = one(dsn, `select count(*) from public.atlas_autonomy_license_events where workflow_instance_id = '${INST_A}'`)
      const bind = session(`m1_bind_2_${tag}`, bindSimulator(INST_A, DEC, 0))
      expect(await blockedOnLock(`m1_bind_2_${tag}`)).toBe(true)
      const [i, b] = await Promise.all([issue, bind])
      expect(i.ok && b.ok).toBe(true)
      expect(b.out).toContain(`licences|${Number(before) + 1}`)                // the committed licence, not the stale count
    }, 30_000)

    it.each([
      ['3. a RESTRICTION', 'LICENSE_RESTRICTED', { level: 'L2' }],
      ['4. a REVOCATION', 'LICENSE_REVOKED', {}],
    ] as const)('%s waits while the bind-simulator holds the instance', async (_label, actName, extra) => {
      const licence = L(actName === 'LICENSE_RESTRICTED' ? 13 : 14)
      run(dsn, ['-c', licenceCall({ licence, generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC })])
      const app = `m1_bind_${actName}_${tag}`.toLowerCase()
      const bind = session(app, bindSimulator(INST_A, DEC, 2))
      expect(await holding(app)).toBe(true)
      const writer = session(`${app}_w`, licenceCall({ licence, generation: 1, act: actName, decision: DEC, record: REC, ...extra }))
      expect(await blockedOnLock(`${app}_w`)).toBe(true)
      expect(lockedRelations(`${app}_w`)).toEqual([])                     // instance first, lineage untouched
      const [b, w] = await Promise.all([bind, writer])
      expect(b.ok && w.ok).toBe(true)
      expect(w.endedAt).toBeGreaterThanOrEqual(b.endedAt)
    }, 30_000)

    it('5. two DIFFERENT licence ids for the SAME instance serialize (the second issue waits for the first)', async () => {
      const first = session(`m1_same_1_${tag}`, `begin; ${licenceCall({ licence: L(15), generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC })}; select pg_sleep(2); commit;`)
      expect(await holding(`m1_same_1_${tag}`)).toBe(true)
      const second = session(`m1_same_2_${tag}`, licenceCall({ licence: L(16), generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC }))
      expect(await blockedOnLock(`m1_same_2_${tag}`)).toBe(true)
      expect(lockedRelations(`m1_same_2_${tag}`)).toEqual([])
      const [a, b] = await Promise.all([first, second])
      expect(a.ok && b.ok).toBe(true)
      expect(b.endedAt).toBeGreaterThanOrEqual(a.endedAt)
    }, 30_000)

    it('6. licence writes for DIFFERENT instances do not serialize each other', async () => {
      const DEC_B = uuid(601, 'd')
      const REC_B = approvedDecision(DEC_B, P_B)
      const first = session(`m1_diff_1_${tag}`, `begin; ${licenceCall({ licence: L(17), generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC })}; select pg_sleep(2); commit;`)
      expect(await holding(`m1_diff_1_${tag}`)).toBe(true)
      const other = await session(`m1_diff_2_${tag}`, licenceCall({ licence: L(18), generation: 0, act: 'LICENSE_ISSUED',
        instance: INST_B, project: P_B, decision: DEC_B, record: REC_B }))
      const a = await first
      expect(other.ok && a.ok).toBe(true)
      expect(other.endedAt).toBeLessThan(a.endedAt)                          // finished while A still held INST_A
    }, 30_000)

    it('7. two humans on the same licence state: the second, released by the first, is still refused 40001 (nothing written)', async () => {
      const licence = L(19)
      run(dsn, ['-c', licenceCall({ licence, generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC })])
      const a = session(`m1_stale_a_${tag}`, `begin; ${licenceCall({ licence, generation: 1, act: 'LICENSE_RESTRICTED', decision: DEC, record: REC, level: 'L2' })}; select pg_sleep(1.5); commit;`)
      expect(await holding(`m1_stale_a_${tag}`)).toBe(true)
      const b = session(`m1_stale_b_${tag}`, licenceCall({ licence, generation: 1, act: 'LICENSE_RESTRICTED', decision: DEC, record: REC, level: 'L1' }))
      expect(await blockedOnLock(`m1_stale_b_${tag}`)).toBe(true)
      expect(lockedRelations(`m1_stale_b_${tag}`)).toEqual([])
      const [ra, rb] = await Promise.all([a, b])
      expect(ra.ok).toBe(true)
      expect(rb.state).toBe('40001')
      expect(one(dsn, `select count(*) from public.atlas_autonomy_license_events where license_id = '${licence}'`)).toBe('2')
    }, 30_000)
  })

  // ── Cross-proof: the future M4 order against every writer ────────────────

  describe('cross-proof: future bind order vs licence and Decision writers — no deadlock', () => {
    it('8. a mixed storm (binds, issues, restrictions, revocations, Decision acts) completes with zero deadlocks', async () => {
      const DEC = uuid(700, 'd')
      const REC = approvedDecision(DEC)
      const licences = [0, 1, 2].map(i => uuid(7000 + i, '6'))
      for (const l of licences) run(dsn, ['-c', licenceCall({ licence: l, generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC })])
      const ops: Promise<Outcome>[] = []
      for (let i = 0; i < 4; i += 1) ops.push(session(`m1_storm_bind_${i}_${tag}`, bindSimulator(INST_A, DEC, 0.3)))
      ops.push(session(`m1_storm_issue_${tag}`, licenceCall({ licence: uuid(7010, '6'), generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC })))
      ops.push(session(`m1_storm_restrict_${tag}`, licenceCall({ licence: licences[0], generation: 1, act: 'LICENSE_RESTRICTED', decision: DEC, record: REC, level: 'L2' })))
      ops.push(session(`m1_storm_revoke_${tag}`, licenceCall({ licence: licences[1], generation: 1, act: 'LICENSE_REVOKED', decision: DEC, record: REC })))
      ops.push(session(`m1_storm_decision_${tag}`, act(DEC, 'amended', 3, { version: 2 })))
      ops.push(session(`m1_storm_note_${tag}`, act(DEC, 'reviewed', 3)))
      const results = await Promise.all(ops)
      expect(results.map(r => r.state).filter(s => s === '40P01'), 'deadlocks').toEqual([])
      expect(results.filter(r => !r.ok).map(r => r.stderr)).toEqual([])
      expect(head(DEC)?.type).toBe('amended')
    }, 60_000)

    it('9. bind order vs a Decision reversal racing a licence restriction on the same instance: both orders, no deadlock', async () => {
      for (const order of ['writer-first', 'bind-first'] as const) {
        const DEC = uuid(order === 'writer-first' ? 710 : 711, 'd')
        const REC = approvedDecision(DEC)
        const licence = uuid(order === 'writer-first' ? 7110 : 7111, '6')
        run(dsn, ['-c', licenceCall({ licence, generation: 0, act: 'LICENSE_ISSUED', decision: DEC, record: REC })])
        const writers = () => [
          session(`m1_x_rev_${order}_${tag}`, `begin; ${act(DEC, 'reversed', 3)}; select pg_sleep(0.5); commit;`),
          session(`m1_x_res_${order}_${tag}`, licenceCall({ licence, generation: 1, act: 'LICENSE_RESTRICTED', decision: DEC, record: REC, level: 'L2' })),
        ]
        const ops: Promise<Outcome>[] = []
        if (order === 'writer-first') { ops.push(...writers()); await sleep(150) }
        ops.push(session(`m1_x_bind_${order}_${tag}`, bindSimulator(INST_A, DEC, 0.5)))
        if (order === 'bind-first') { await sleep(150); ops.push(...writers()) }
        const results = await Promise.all(ops)
        expect(results.map(r => r.state), order).not.toContain('40P01')
        expect(results.filter(r => !r.ok).map(r => r.stderr), order).toEqual([])
        expect(head(DEC)?.type, order).toBe('reversed')
      }
    }, 60_000)

    it('the bind-simulator creates nothing: no ledger, licence or head rows appear from it', () => {
      const before = one(dsn, `select (select count(*) from public.atlas_decision_ledger) || ':' ||
        (select count(*) from public.atlas_autonomy_license_events) || ':' || (select count(*) from public.atlas_decision_lineage_heads)`)
      run(dsn, ['-c', bindSimulator(INST_A, uuid(600, 'd'), 0)])
      expect(one(dsn, `select (select count(*) from public.atlas_decision_ledger) || ':' ||
        (select count(*) from public.atlas_autonomy_license_events) || ':' || (select count(*) from public.atlas_decision_lineage_heads)`)).toBe(before)
    })
  })
})
