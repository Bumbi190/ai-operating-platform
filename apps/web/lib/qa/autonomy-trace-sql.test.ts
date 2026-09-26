/**
 * Phase 3B1A — REAL PostgreSQL proof for the autonomy decision trace.
 *
 * These properties CANNOT be proven by reading source, and three of them were
 * the specific reason the first architecture draft was rejected:
 *
 *   1. NULL TOTALITY. PostgreSQL rejects a CHECK only when it is FALSE, so a
 *      nullable `col = 'x'` inside a required branch evaluates to UNKNOWN on
 *      NULL and SILENTLY PASSES. Five matrices in the first draft had exactly
 *      that defect. Every malformed row below is a formerly-UNKNOWN path, and
 *      must now raise 23514.
 *   2. CLAIM FENCING IS A LOCK. A read-then-write fence has a race; the proof
 *      has to show a concurrent claim rotation actually BLOCKS.
 *   3. PRIVILEGE CLOSURE. The table is server-only and the RPC is the only
 *      write path.
 *
 * Follows the harness of `autonomy-license-sql.test.ts`. SKIPS loudly with no
 * local Postgres, and FAILS instead of skipping wherever proof is required.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { RUN_AUTONOMY_DECISION_COLS } from '@/lib/atlas/autonomy-runtime/trace'

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
const MIGRATION = join(process.cwd(), 'supabase/migrations/20260925120000_autonomy_trace_decisions.sql')

function dsnFor(database: string): string {
  const url = new URL(ADMIN_URL); url.pathname = `/${database}`; return url.toString()
}

/** VERBOSITY=verbose so the SQLSTATE is actually in the output. */
function psqlArgs(dsn: string, extra: string[]): string[] {
  return ['-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-X', '-q', '-d', dsn, ...extra]
}
function run(dsn: string, args: string[]): string {
  return execFileSync(PSQL!, psqlArgs(dsn, args),
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
}
function query(dsn: string, sql: string): string[][] {
  const out = execFileSync(PSQL!, psqlArgs(dsn, ['-t', '-A', '-F', '|', '-c', sql]),
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|'))
}
function one(dsn: string, sql: string): string {
  const rows = query(dsn, sql)
  return rows.length ? rows[0].join('|') : ''
}
/** Run a statement expected to FAIL; returns the SQLSTATE, or '' on success. */
function sqlstateOf(dsn: string, sql: string): string {
  try {
    execFileSync(PSQL!, psqlArgs(dsn, ['-c', sql]),
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return ''
  } catch (e) {
    const err = e as { stderr?: Buffer | string }
    const m = String(err.stderr ?? '').match(/ERROR:\s+([0-9A-Z]{5}):/)
    return m ? m[1] : 'NO-SQLSTATE'
  }
}
/**
 * Run a statement in its OWN psql process so two statements can genuinely be in
 * flight at once. `execFileSync` blocks, and the concurrency proof is worthless
 * if the HARNESS serializes the two acts rather than the database.
 */
function runAsync(dsn: string, sql: string): Promise<{ ok: boolean; stderr: string }> {
  return new Promise(resolveOutcome => {
    const child = spawn(PSQL!, psqlArgs(dsn, ['-c', sql]),
      { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', c => { stderr += String(c) })
    child.on('error', e => resolveOutcome({ ok: false, stderr: String(e) }))
    child.on('close', code => resolveOutcome({ ok: code === 0, stderr }))
  })
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
    '[autonomy-trace-sql] SKIPPED — no reachable local Postgres. The Phase 3B1A trace ' +
    'substrate (NULL totality of every representation matrix, claim-fence locking, ' +
    'privilege closure, append-only) was NOT proven. Set ATLAS_SQL_TEST_URL to enable it.')
}

const DB_NAME = `omnira_3b1a_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

const d = AVAILABLE ? describe : describe.skip

// ── Fixture ───────────────────────────────────────────────────────────────────
//
// The default-privilege lines are load-bearing: the migration's privilege
// posture is revoke-based, so without Supabase's default grants in place the
// closure assertions would pass vacuously.

const P_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INSTANCE_A = '99999999-9999-4999-8999-999999999999'
const INSTANCE_B = '88888888-8888-4888-8888-888888888888'
const RUN_A = '11111111-1111-4111-8111-111111111111'
const RUN_PLAIN = '22222222-2222-4222-8222-222222222222'
const CLAIM_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CLAIM_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const CLAIM_NEW = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const LICENSE_A = '77777777-7777-4777-8777-777777777777'
const LICENSE_B = '01010101-0101-4101-8101-010101010101'
/** In a DIFFERENT project — used to prove cross-subject linkage is impossible. */
const LICENSE_OTHER_PROJECT = '02020202-0202-4202-8202-020202020202'

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

create table public.projects (
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text);
create table public.workflow_instances (
  id uuid primary key, project_id uuid not null references public.projects (id),
  def_key text not null, def_hash text not null);
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  workflow_instance_id uuid references public.workflow_instances (id),
  status text not null default 'pending',
  claim_id uuid,
  action_kind text,
  action_class text,
  created_at timestamptz not null default now());
-- The FK target, shaped like the real Phase 2C ledger (only the columns the
-- composite FK and the writer's cross-subject proof actually read).
create table public.atlas_autonomy_license_events (
  event_id uuid primary key default gen_random_uuid(),
  event_seq bigint generated always as identity unique,
  license_id uuid not null,
  license_generation integer not null check (license_generation >= 0),
  project_id uuid not null,
  workflow_instance_id uuid not null,
  licensed_level text not null check (licensed_level in ('L0','L1','L2','L3','L4','L5','L6')),
  allowed_action_kinds text[] not null,
  action_scope_fingerprint text not null);
create unique index atlas_autonomy_license_events_generation_idx
  on public.atlas_autonomy_license_events (license_id, license_generation);

insert into public.projects (id, slug, name) values
  ('${P_A}','alpha','Alpha'), ('${P_B}','beta','Beta');
insert into public.workflow_instances (id, project_id, def_key, def_hash) values
  ('${INSTANCE_A}','${P_A}','fs.monthly','hash-a'),
  ('${INSTANCE_B}','${P_B}','fs.monthly','hash-b');
-- A bound workflow action, claimed, with a FINANCIAL action kind.
insert into public.runs (id, project_id, workflow_instance_id, status, claim_id, action_kind, action_class) values
  ('${RUN_A}','${P_A}','${INSTANCE_A}','running','${CLAIM_A}','proof_governed_effect','FINANCIAL');
-- A PLAIN run: no workflow binding, so it has no autonomy subject.
insert into public.runs (id, project_id, workflow_instance_id, status, claim_id, action_kind, action_class) values
  ('${RUN_PLAIN}','${P_A}',NULL,'running','${CLAIM_A}',NULL,NULL);

-- Generation 0 is the ISSUANCE and must be referenceable.
insert into public.atlas_autonomy_license_events
  (license_id, license_generation, project_id, workflow_instance_id, licensed_level, allowed_action_kinds, action_scope_fingerprint) values
  ('${LICENSE_A}', 0, '${P_A}','${INSTANCE_A}','L3', array['proof_governed_effect'], 'fp-a0'),
  ('${LICENSE_B}', 0, '${P_A}','${INSTANCE_A}','L3', array['proof_governed_effect'], 'fp-b0'),
  ('${LICENSE_OTHER_PROJECT}', 0, '${P_B}','${INSTANCE_B}','L3', array['proof_governed_effect'], 'fp-other');
`

const T = 'public.run_autonomy_decisions'

/** Insert one autonomy row directly (bypassing the RPC) and report the SQLSTATE. */
function insertRow(cols: string, vals: string): string {
  return sqlstateOf(dsn,
    `insert into ${T} (run_id, boundary, claim_id, ${cols}) values ('${RUN_A}','pre_dispatch','${CLAIM_A}', ${vals});`)
}

const ALL_COLS = 'policy_mode, policy_reason, reason, license_id, license_generation, ' +
  'license_reason, required_level, effective_level, survival_state, survival_ceiling, ' +
  'survival_reason, bounded_by, license_resolved_at, survival_as_of'

// One valid value list per shape, so each malformed case below is exactly ONE
// field away from a row the schema accepts.
const V = {
  exempt: `'license_exempt_observation','canonical_read_only_observation','exempt_observation',NULL,NULL,NULL,'L0',NULL,NULL,NULL,NULL,NULL,NULL,NULL`,
  unsupported: `'unsupported','v1_scope_incomplete','unsupported_action',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL`,
  notEffective: `'licensed',NULL,'licence_not_effective',NULL,NULL,'expired','L3',NULL,NULL,NULL,NULL,NULL,'2026-09-26T00:00:00Z',NULL`,
  allowed: `'licensed',NULL,'allowed','${LICENSE_A}',0,'active','L3','L3','NORMAL','L6',NULL,'licence','2026-09-26T00:00:00Z','2026-09-26T00:00:00Z'`,
  outOfScope: `'licensed',NULL,'action_not_in_licence_scope','${LICENSE_A}',0,'active','L3',NULL,NULL,NULL,NULL,NULL,'2026-09-26T00:00:00Z',NULL`,
  survivalUnavailable: `'licensed',NULL,'effective_level_below_required','${LICENSE_A}',0,'active','L3','L0',NULL,NULL,'population_unavailable','survival_unavailable','2026-09-26T00:00:00Z',NULL`,
}

/** Call the writer RPC as service_role. Returns the SQLSTATE, or '' on success. */
function callWriter(args: string): string {
  return sqlstateOf(dsn,
    `set role service_role; select public.record_run_autonomy_decision(${args});`)
}

const A = `p_run_id := '${RUN_A}', p_claim_id := '${CLAIM_A}'`
const LIC = `p_license_id := '${LICENSE_A}', p_license_generation := 0`

beforeAll(() => {
  if (!AVAILABLE) return
  execFileSync(PSQL!, ['-X', '-q', '-d', ADMIN_URL, '-c', `create database ${DB_NAME}`],
    { stdio: 'pipe', timeout: 60_000 })
  dsn = dsnFor(DB_NAME)
  execFileSync(PSQL!, psqlArgs(dsn, ['-f', '/dev/stdin']),
    { input: FIXTURE, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
  execFileSync(PSQL!, psqlArgs(dsn, ['-f', MIGRATION]),
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
}, 120_000)

afterAll(() => {
  if (!AVAILABLE) return
  try {
    execFileSync(PSQL!, ['-X', '-q', '-d', ADMIN_URL, '-c', `drop database if exists ${DB_NAME}`],
      { stdio: 'pipe', timeout: 60_000 })
  } catch { /* the scratch database is disposable */ }
})

// ── Schema shape ─────────────────────────────────────────────────────────────

d('the trace table exists with exactly the reviewed columns', () => {
  it('column set is exactly the exported contract list, in order', () => {
    const rows = query(dsn, `select column_name from information_schema.columns
      where table_schema='public' and table_name='run_autonomy_decisions' order by ordinal_position;`)
    expect(rows.map(r => r[0])).toEqual([...RUN_AUTONOMY_DECISION_COLS])
    expect(rows).toHaveLength(20)
  })

  it('carries NO duplicated or verdict column', () => {
    const names = query(dsn, `select column_name from information_schema.columns
      where table_schema='public' and table_name='run_autonomy_decisions';`).map(r => r[0])
    for (const forbidden of ['project_id', 'workflow_instance_id', 'action_kind',
      'licensed_level', 'decision_id', 'decision_version', 'decision_record_id', 'verdict']) {
      expect(names, `forbidden duplicated column "${forbidden}"`).not.toContain(forbidden)
    }
  })

  it('RLS is on with ZERO policies', () => {
    expect(one(dsn, `select relrowsecurity from pg_class where oid='public.run_autonomy_decisions'::regclass;`)).toBe('t')
    expect(one(dsn, `select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
      where c.relname='run_autonomy_decisions';`)).toBe('0')
  })
})

// ── §26 · malformed-row matrix ───────────────────────────────────────────────
//
// Every case here mutates exactly ONE field of a row the schema accepts. Each
// must raise check_violation. The table is append-only, so "mutate" is a
// different INSERT rather than an UPDATE — the CHECKs are what is under test.

d('§26 · malformed rows are rejected by REAL CHECK semantics (SQLSTATE 23514)', () => {
  it('accepts each valid shape (the controls — without these the rejects prove nothing)', () => {
    expect(insertRow(ALL_COLS, V.exempt)).toBe('')
    expect(insertRow(ALL_COLS, V.unsupported)).toBe('')
    expect(insertRow(ALL_COLS, V.notEffective)).toBe('')
    expect(insertRow(ALL_COLS, V.allowed)).toBe('')
    expect(insertRow(ALL_COLS, V.outOfScope)).toBe('')
    expect(insertRow(ALL_COLS, V.survivalUnavailable)).toBe('')
  })

  it('EXEMPT: policy_reason NULL is REJECTED (was UNKNOWN → passed)', () => {
    expect(insertRow(ALL_COLS,
      `'license_exempt_observation',NULL,'exempt_observation',NULL,NULL,NULL,'L0',NULL,NULL,NULL,NULL,NULL,NULL,NULL`)).toBe('23514')
  })
  it('EXEMPT: required_level NULL is REJECTED (was UNKNOWN → passed)', () => {
    expect(insertRow(ALL_COLS,
      `'license_exempt_observation','canonical_read_only_observation','exempt_observation',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL`)).toBe('23514')
  })
  it('EXEMPT: a Survival field is REJECTED (never read on the exempt path)', () => {
    expect(insertRow(ALL_COLS,
      `'license_exempt_observation','canonical_read_only_observation','exempt_observation',NULL,NULL,NULL,'L0',NULL,'NORMAL',NULL,NULL,NULL,NULL,NULL`)).toBe('23514')
  })

  it('UNSUPPORTED: policy_reason NULL is REJECTED (was UNKNOWN → passed)', () => {
    expect(insertRow(ALL_COLS,
      `'unsupported',NULL,'unsupported_action',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL`)).toBe('23514')
  })
  it('UNSUPPORTED: required_level non-NULL is REJECTED (no level compensates)', () => {
    expect(insertRow(ALL_COLS,
      `'unsupported','v1_scope_incomplete','unsupported_action',NULL,NULL,NULL,'L3',NULL,NULL,NULL,NULL,NULL,NULL,NULL`)).toBe('23514')
  })
  it('UNSUPPORTED: licence identity is REJECTED', () => {
    expect(insertRow(ALL_COLS,
      `'unsupported','v1_scope_incomplete','unsupported_action','${LICENSE_A}',0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL`)).toBe('23514')
  })

  it('LICENSED: required_level NULL is REJECTED', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'licence_not_effective',NULL,NULL,'expired',NULL,NULL,NULL,NULL,NULL,NULL,'2026-09-26T00:00:00Z',NULL`)).toBe('23514')
  })
  it('LICENSED: license_resolved_at NULL is REJECTED', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'licence_not_effective',NULL,NULL,'expired','L3',NULL,NULL,NULL,NULL,NULL,NULL,NULL`)).toBe('23514')
  })
  it('LICENSED: license_reason NULL is REJECTED (was UNKNOWN → passed)', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'licence_not_effective',NULL,NULL,NULL,'L3',NULL,NULL,NULL,NULL,NULL,'2026-09-26T00:00:00Z',NULL`)).toBe('23514')
  })

  it('ACTIVE: `allowed` with license_id NULL is REJECTED (was UNKNOWN → passed)', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'allowed',NULL,NULL,'active','L3','L3','NORMAL','L6',NULL,'licence','2026-09-26T00:00:00Z','2026-09-26T00:00:00Z'`)).toBe('23514')
  })
  it('ACTIVE: out-of-scope refusal with generation NULL is REJECTED (identity is a pair)', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'action_not_in_licence_scope','${LICENSE_A}',NULL,'active','L3',NULL,NULL,NULL,NULL,NULL,'2026-09-26T00:00:00Z',NULL`)).toBe('23514')
  })

  it('SURVIVAL OBSERVED: effective_level NULL is REJECTED (was UNKNOWN → passed)', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'allowed','${LICENSE_A}',0,'active','L3',NULL,'NORMAL','L6',NULL,'licence','2026-09-26T00:00:00Z','2026-09-26T00:00:00Z'`)).toBe('23514')
  })
  it('SURVIVAL OBSERVED: bounded_by NULL is REJECTED (was UNKNOWN → passed)', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'allowed','${LICENSE_A}',0,'active','L3','L3','NORMAL','L6',NULL,NULL,'2026-09-26T00:00:00Z','2026-09-26T00:00:00Z'`)).toBe('23514')
  })
  it('SURVIVAL OBSERVED: survival_as_of NULL is REJECTED (was UNKNOWN → passed)', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'allowed','${LICENSE_A}',0,'active','L3','L3','NORMAL','L6',NULL,'licence','2026-09-26T00:00:00Z',NULL`)).toBe('23514')
  })

  it('SURVIVAL UNAVAILABLE: survival_reason NULL is REJECTED (was UNKNOWN → passed)', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'effective_level_below_required','${LICENSE_A}',0,'active','L3','L0',NULL,NULL,NULL,'survival_unavailable','2026-09-26T00:00:00Z',NULL`)).toBe('23514')
  })
  it('SURVIVAL UNAVAILABLE: bounded_by NULL is REJECTED (was UNKNOWN → passed)', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'effective_level_below_required','${LICENSE_A}',0,'active','L3','L0',NULL,NULL,'population_unavailable',NULL,'2026-09-26T00:00:00Z',NULL`)).toBe('23514')
  })
  it('SURVIVAL UNAVAILABLE: effective_level NULL is REJECTED (was UNKNOWN → passed)', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'effective_level_below_required','${LICENSE_A}',0,'active','L3',NULL,NULL,NULL,'population_unavailable','survival_unavailable','2026-09-26T00:00:00Z',NULL`)).toBe('23514')
  })
  it('SURVIVAL UNAVAILABLE: effective_level L1 is REJECTED (fail-closed is exactly L0)', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'effective_level_below_required','${LICENSE_A}',0,'active','L3','L1',NULL,NULL,'population_unavailable','survival_unavailable','2026-09-26T00:00:00Z',NULL`)).toBe('23514')
  })

  it('CLAIM MATRIX: a claimed boundary without a claim is REJECTED', () => {
    expect(sqlstateOf(dsn, `insert into ${T} (run_id, boundary, claim_id, ${ALL_COLS})
      values ('${RUN_A}','pre_dispatch',NULL, ${V.exempt});`)).toBe('23514')
  })
})

// ── §1–§3 · the mode → reason relation ───────────────────────────────────────
//
// The table made `license_exempt_observation → exempt_observation` and
// `unsupported → unsupported_action` structural, but left `licensed`
// unconstrained — so `licensed + unsupported_action` satisfied every per-mode
// matrix and was ACCEPTED. These cases are the fix, and the first two are the
// exact rows that were swallowed before it.

d('§3 · the mode → reason relation is structural', () => {
  it('VALID pairs are accepted', () => {
    expect(insertRow(ALL_COLS, V.exempt)).toBe('')
    expect(insertRow(ALL_COLS, V.unsupported)).toBe('')
    expect(insertRow(ALL_COLS, V.notEffective)).toBe('')
    expect(insertRow(ALL_COLS, V.outOfScope)).toBe('')
    expect(insertRow(ALL_COLS, V.allowed)).toBe('')
    expect(insertRow(ALL_COLS, V.survivalUnavailable)).toBe('')
  })

  it('licensed + unsupported_action is REJECTED (previously ACCEPTED)', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'unsupported_action','${LICENSE_A}',0,'active','L3',NULL,NULL,NULL,NULL,NULL,'2026-09-26T00:00:00Z',NULL`)).toBe('23514')
  })

  it('licensed + exempt_observation is REJECTED (previously ACCEPTED)', () => {
    expect(insertRow(ALL_COLS,
      `'licensed',NULL,'exempt_observation','${LICENSE_A}',0,'active','L3',NULL,NULL,NULL,NULL,NULL,'2026-09-26T00:00:00Z',NULL`)).toBe('23514')
  })

  it('unsupported + allowed is REJECTED', () => {
    expect(insertRow(ALL_COLS,
      `'unsupported','v1_scope_incomplete','allowed',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL`)).toBe('23514')
  })

  it('license_exempt_observation + allowed is REJECTED', () => {
    expect(insertRow(ALL_COLS,
      `'license_exempt_observation','canonical_read_only_observation','allowed',NULL,NULL,NULL,'L0',NULL,NULL,NULL,NULL,NULL,NULL,NULL`)).toBe('23514')
  })

  it('the exempt mode cannot borrow a refusal reason', () => {
    expect(insertRow(ALL_COLS,
      `'license_exempt_observation','canonical_read_only_observation','licence_not_effective',NULL,NULL,NULL,'L0',NULL,NULL,NULL,NULL,NULL,NULL,NULL`)).toBe('23514')
  })

  it('the unsupported mode cannot borrow a licensed reason', () => {
    expect(insertRow(ALL_COLS,
      `'unsupported','v1_scope_incomplete','effective_level_below_required',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL`)).toBe('23514')
  })
})

// ── §19/§27 · append-only and privileges ─────────────────────────────────────

d('§19/§20 · append-only and the privilege closure', () => {
  it('UPDATE, DELETE and TRUNCATE are all refused', () => {
    expect(sqlstateOf(dsn, `update ${T} set reason='allowed';`)).toBe('42501')
    expect(sqlstateOf(dsn, `delete from ${T};`)).toBe('42501')
    expect(sqlstateOf(dsn, `truncate ${T};`)).toBe('42501')
  })

  it('service_role may SELECT but NOT insert directly', () => {
    expect(sqlstateOf(dsn, `set role service_role; select count(*) from ${T};`)).toBe('')
    expect(sqlstateOf(dsn, `set role service_role; insert into ${T}
      (run_id,boundary,claim_id,policy_mode,policy_reason,reason,required_level)
      values ('${RUN_A}','pre_dispatch','${CLAIM_A}','license_exempt_observation',
              'canonical_read_only_observation','exempt_observation','L0');`)).toBe('42501')
  })

  it('anon and authenticated can neither read nor execute the writer', () => {
    for (const role of ['anon', 'authenticated']) {
      expect(sqlstateOf(dsn, `set role ${role}; select count(*) from ${T};`), role).toBe('42501')
      expect(sqlstateOf(dsn, `set role ${role}; select public.record_run_autonomy_decision(
        '${RUN_A}','${CLAIM_A}','readiness','license_exempt_observation',
        'canonical_read_only_observation','exempt_observation',
        NULL,NULL,NULL,'L0',NULL,NULL,NULL,NULL,NULL,NULL,NULL);`), role).toBe('42501')
    }
  })

  it('no role may touch the identity sequence directly', () => {
    expect(sqlstateOf(dsn, `set role service_role; select nextval('public.run_autonomy_decisions_event_seq_seq');`)).toBe('42501')
  })
})

// ── §6 · foreign keys ────────────────────────────────────────────────────────

d('§6 · referential integrity', () => {
  it('run FK is RESTRICT — a traced run cannot be deleted', () => {
    expect(sqlstateOf(dsn, `delete from public.runs where id='${RUN_A}';`)).toBe('23503')
  })

  it('the COMPOSITE licence FK rejects a nonexistent generation', () => {
    expect(sqlstateOf(dsn, `insert into ${T} (run_id,boundary,claim_id,policy_mode,reason,
      license_id,license_generation,license_reason,required_level,license_resolved_at)
      values ('${RUN_A}','pre_dispatch','${CLAIM_A}','licensed','licence_not_effective',
              '${LICENSE_A}',999,'expired','L3',now());`)).toBe('23503')
  })

  it('generation 0 — the issuance — is referenceable', () => {
    expect(one(dsn, `select count(*) from public.atlas_autonomy_license_events
      where license_id='${LICENSE_A}' and license_generation=0;`)).toBe('1')
  })
})

// ── §21/§31 · the writer ─────────────────────────────────────────────────────

d('§21/§31 · the claimed-boundary writer', () => {
  it('REFUSES boundary=bind — bind provenance must be atomic with the run (3B1B)', () => {
    expect(callWriter(
      `${A}, p_boundary := 'bind', p_policy_mode := 'licensed', p_policy_reason := NULL,
       p_reason := 'allowed', ${LIC}, p_license_reason := 'active', p_required_level := 'L3',
       p_effective_level := 'L3', p_survival_state := 'NORMAL', p_survival_ceiling := 'L6',
       p_survival_reason := NULL, p_bounded_by := 'licence',
       p_license_resolved_at := now(), p_survival_as_of := now()`)).toBe('22023')
  })

  it('rejects an unknown run, and a run that is not a workflow action', () => {
    const args = `p_claim_id := '${CLAIM_A}', p_boundary := 'readiness',
      p_policy_mode := 'license_exempt_observation',
      p_policy_reason := 'canonical_read_only_observation', p_reason := 'exempt_observation',
      p_license_id := NULL, p_license_generation := NULL, p_license_reason := NULL,
      p_required_level := 'L0', p_effective_level := NULL, p_survival_state := NULL,
      p_survival_ceiling := NULL, p_survival_reason := NULL, p_bounded_by := NULL,
      p_license_resolved_at := NULL, p_survival_as_of := NULL`
    expect(callWriter(`p_run_id := '00000000-0000-4000-8000-000000000000', ${args}`)).toBe('P0002')
    expect(callWriter(`p_run_id := '${RUN_PLAIN}', ${args}`)).toBe('22023')
  })

  it('fences the claim: wrong claim and NULL claim are both refused', () => {
    const tail = `p_boundary := 'readiness', p_policy_mode := 'license_exempt_observation',
      p_policy_reason := 'canonical_read_only_observation', p_reason := 'exempt_observation',
      p_license_id := NULL, p_license_generation := NULL, p_license_reason := NULL,
      p_required_level := 'L0', p_effective_level := NULL, p_survival_state := NULL,
      p_survival_ceiling := NULL, p_survival_reason := NULL, p_bounded_by := NULL,
      p_license_resolved_at := NULL, p_survival_as_of := NULL`
    expect(callWriter(`p_run_id := '${RUN_A}', p_claim_id := '${CLAIM_B}', ${tail}`)).toBe('22023')
    expect(callWriter(`p_run_id := '${RUN_A}', p_claim_id := NULL, ${tail}`)).toBe('22023')
  })

  it('refuses a licence event belonging to ANOTHER project (cross-subject linkage)', () => {
    expect(callWriter(
      `${A}, p_boundary := 'pre_dispatch', p_policy_mode := 'licensed', p_policy_reason := NULL,
       p_reason := 'allowed', p_license_id := '${LICENSE_OTHER_PROJECT}', p_license_generation := 0,
       p_license_reason := 'active', p_required_level := 'L3', p_effective_level := 'L3',
       p_survival_state := 'NORMAL', p_survival_ceiling := 'L6', p_survival_reason := NULL,
       p_bounded_by := 'licence', p_license_resolved_at := now(), p_survival_as_of := now()`)).toBe('22023')
  })

  it('MEMBERSHIP IS REASON-SENSITIVE, both directions', () => {
    // `action_not_in_licence_scope` while the kind IS in scope — must refuse.
    expect(callWriter(
      `${A}, p_boundary := 'pre_dispatch', p_policy_mode := 'licensed', p_policy_reason := NULL,
       p_reason := 'action_not_in_licence_scope', ${LIC}, p_license_reason := 'active',
       p_required_level := 'L3', p_effective_level := NULL, p_survival_state := NULL,
       p_survival_ceiling := NULL, p_survival_reason := NULL, p_bounded_by := NULL,
       p_license_resolved_at := now(), p_survival_as_of := NULL`)).toBe('22023')
  })

  it('does NOT consult scope for `licence_not_effective` — identity may be absent', () => {
    // The pipeline stopped at effectiveness, so evaluating scope here would
    // evaluate a step the runtime never reached.
    expect(callWriter(
      `${A}, p_boundary := 'readiness', p_policy_mode := 'licensed', p_policy_reason := NULL,
       p_reason := 'licence_not_effective', p_license_id := NULL, p_license_generation := NULL,
       p_license_reason := 'no_license', p_required_level := 'L3', p_effective_level := NULL,
       p_survival_state := NULL, p_survival_ceiling := NULL, p_survival_reason := NULL,
       p_bounded_by := NULL, p_license_resolved_at := now(), p_survival_as_of := NULL`)).toBe('')
  })

  it('§4 · REFUSES an impossible mode/reason pair, and appends NOTHING', () => {
    // The claim fence is deliberately VALID here, so a refusal can only come
    // from the new mode/reason validation — not from an earlier boundary.
    const before = one(dsn, `select count(*) from ${T};`)

    const mismatchA = callWriter(
      `${A}, p_boundary := 'pre_dispatch', p_policy_mode := 'licensed', p_policy_reason := NULL,
       p_reason := 'unsupported_action', ${LIC}, p_license_reason := 'active',
       p_required_level := 'L3', p_effective_level := NULL, p_survival_state := NULL,
       p_survival_ceiling := NULL, p_survival_reason := NULL, p_bounded_by := NULL,
       p_license_resolved_at := now(), p_survival_as_of := NULL`)
    expect(mismatchA, 'licensed + unsupported_action').toBe('22023')

    const mismatchB = callWriter(
      `${A}, p_boundary := 'pre_dispatch', p_policy_mode := 'licensed', p_policy_reason := NULL,
       p_reason := 'exempt_observation', ${LIC}, p_license_reason := 'active',
       p_required_level := 'L3', p_effective_level := NULL, p_survival_state := NULL,
       p_survival_ceiling := NULL, p_survival_reason := NULL, p_bounded_by := NULL,
       p_license_resolved_at := now(), p_survival_as_of := NULL`)
    expect(mismatchB, 'licensed + exempt_observation').toBe('22023')

    // The exempt mode cannot borrow a refusal reason either.
    expect(callWriter(
      `${A}, p_boundary := 'readiness', p_policy_mode := 'license_exempt_observation',
       p_policy_reason := 'canonical_read_only_observation', p_reason := 'licence_not_effective',
       p_license_id := NULL, p_license_generation := NULL, p_license_reason := NULL,
       p_required_level := 'L0', p_effective_level := NULL, p_survival_state := NULL,
       p_survival_ceiling := NULL, p_survival_reason := NULL, p_bounded_by := NULL,
       p_license_resolved_at := NULL, p_survival_as_of := NULL`)).toBe('22023')

    expect(one(dsn, `select count(*) from ${T};`),
      'an impossible representation must not be appended').toBe(before)
  })

  it('§7 · the new validation is not "reject every licensed reason"', () => {
    // A valid licensed reason MUST still be accepted, or the check above would
    // be satisfied by a writer that refuses the whole mode.
    const before = Number(one(dsn, `select count(*) from ${T};`))
    // `expired`, not `active` — an ineffective licence with an `active` reason
    // is itself contradictory, and `licensed_not_effective` would reject it for
    // a reason that has nothing to do with the matrix under test.
    expect(callWriter(
      `${A}, p_boundary := 'pre_dispatch', p_policy_mode := 'licensed', p_policy_reason := NULL,
       p_reason := 'licence_not_effective', ${LIC}, p_license_reason := 'expired',
       p_required_level := 'L3', p_effective_level := NULL, p_survival_state := NULL,
       p_survival_ceiling := NULL, p_survival_reason := NULL, p_bounded_by := NULL,
       p_license_resolved_at := now(), p_survival_as_of := NULL`)).toBe('')
    expect(Number(one(dsn, `select count(*) from ${T};`))).toBe(before + 1)
  })

  it('appends a valid exempt and a valid licensed decision', () => {
    expect(callWriter(
      `${A}, p_boundary := 'readiness', p_policy_mode := 'license_exempt_observation',
       p_policy_reason := 'canonical_read_only_observation', p_reason := 'exempt_observation',
       p_license_id := NULL, p_license_generation := NULL, p_license_reason := NULL,
       p_required_level := 'L0', p_effective_level := NULL, p_survival_state := NULL,
       p_survival_ceiling := NULL, p_survival_reason := NULL, p_bounded_by := NULL,
       p_license_resolved_at := NULL, p_survival_as_of := NULL`)).toBe('')
    expect(callWriter(
      `${A}, p_boundary := 'pre_dispatch', p_policy_mode := 'licensed', p_policy_reason := NULL,
       p_reason := 'allowed', ${LIC}, p_license_reason := 'active', p_required_level := 'L3',
       p_effective_level := 'L3', p_survival_state := 'NORMAL', p_survival_ceiling := 'L6',
       p_survival_reason := NULL, p_bounded_by := 'licence',
       p_license_resolved_at := now(), p_survival_as_of := now()`)).toBe('')
  })

  it('repeated boundary events are ALLOWED — no uniqueness on (run_id, boundary)', () => {
    const before = Number(one(dsn, `select count(*) from ${T} where run_id='${RUN_A}' and boundary='pre_dispatch';`))
    expect(callWriter(
      `${A}, p_boundary := 'pre_dispatch', p_policy_mode := 'licensed', p_policy_reason := NULL,
       p_reason := 'allowed', ${LIC}, p_license_reason := 'active', p_required_level := 'L3',
       p_effective_level := 'L3', p_survival_state := 'NORMAL', p_survival_ceiling := 'L6',
       p_survival_reason := NULL, p_bounded_by := 'licence',
       p_license_resolved_at := now(), p_survival_as_of := now()`)).toBe('')
    expect(Number(one(dsn, `select count(*) from ${T} where run_id='${RUN_A}' and boundary='pre_dispatch';`)))
      .toBe(before + 1)
  })
})

// ── §22/§23 · the claim fence is a LOCK ──────────────────────────────────────

d('§22/§23 · claim fencing is a row lock, not a read-then-write race', () => {
  it('a concurrent claim rotation BLOCKS until the writer commits, and the appended row carries the LOCKED claim', async () => {
    execFileSync(PSQL!, psqlArgs(dsn, ['-c',
      `update public.runs set claim_id='${CLAIM_A}', status='running' where id='${RUN_A}';`]),
      { stdio: 'pipe', timeout: 30_000 })

    // Session A holds the run row lock inside the writer, then sleeps before
    // committing, so B has a real window to try to interleave.
    const a = runAsync(dsn, `
      begin;
      select public.record_run_autonomy_decision(
        '${RUN_A}','${CLAIM_A}','readiness','license_exempt_observation',
        'canonical_read_only_observation','exempt_observation',
        NULL,NULL,NULL,'L0',NULL,NULL,NULL,NULL,NULL,NULL,NULL);
      select pg_sleep(3);
      commit;`)

    await new Promise(r => setTimeout(r, 700))
    const started = Date.now()
    const b = await runAsync(dsn, `update public.runs set claim_id='${CLAIM_NEW}' where id='${RUN_A}';`)
    const elapsedMs = Date.now() - started
    await a

    expect(b.ok).toBe(true)
    // If B were not blocked it would return in ~tens of ms. The width of the
    // margin is what makes this a proof rather than a coincidence.
    expect(elapsedMs, `rotation returned in ${elapsedMs}ms — the fence is NOT a lock`)
      .toBeGreaterThan(1500)

    // …and the decision A appended references the claim A LOCKED, not the one B
    // installed afterwards.
    expect(one(dsn, `select claim_id from ${T} where run_id='${RUN_A}'
      order by event_seq desc limit 1;`)).toBe(CLAIM_A)
    expect(one(dsn, `select claim_id from public.runs where id='${RUN_A}';`)).toBe(CLAIM_NEW)
  }, 60_000)

  it('the writer refuses once the claim has rotated away from the caller', () => {
    expect(callWriter(
      `${A}, p_boundary := 'readiness', p_policy_mode := 'license_exempt_observation',
       p_policy_reason := 'canonical_read_only_observation', p_reason := 'exempt_observation',
       p_license_id := NULL, p_license_generation := NULL, p_license_reason := NULL,
       p_required_level := 'L0', p_effective_level := NULL, p_survival_state := NULL,
       p_survival_ceiling := NULL, p_survival_reason := NULL, p_bounded_by := NULL,
       p_license_resolved_at := NULL, p_survival_as_of := NULL`)).toBe('22023')
  })
})
