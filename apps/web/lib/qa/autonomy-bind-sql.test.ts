/**
 * Phase 3B1B — REAL PostgreSQL proof for the atomic bind.
 *
 * What only a real database can prove:
 *
 *   1. ATOMICITY. An admitted bind creates the run AND its bind provenance, or
 *      neither — including when the SECOND write fails after the first one
 *      succeeded inside the function.
 *   2. REFUSAL WRITES NOTHING. Every refused representation, subject swap and
 *      stale licence leaves zero runs and zero bind rows.
 *   3. CONCURRENCY. A licence act racing the bind either blocks behind it or is
 *      seen by it; a bind can never commit on a ledger view that has moved.
 *   4. IDEMPOTENCY. The existing action-identity index still yields exactly one
 *      run per identity, and a duplicate leaves no orphaned provenance.
 *   5. PRIVILEGE CLOSURE. Server-only, and the 3B1A writer still refuses bind.
 *
 * Applies the REAL run-binding migrations, the REAL 3B1A trace migration and the
 * REAL 3B1B migration onto a minimal fixture. Follows the harness of
 * `autonomy-trace-sql.test.ts`: SKIPS loudly with no Postgres, FAILS instead
 * when CI=true or ATLAS_SQL_TEST_REQUIRED=1.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
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
const MIGRATIONS = [
  '20260830_workflow_action_binding.sql',
  '20260830_readonly_action_authorization.sql',
  '20260925120000_autonomy_trace_decisions.sql',
  '20260926120000_autonomy_bind_atomic.sql',
].map(f => join(process.cwd(), 'supabase/migrations', f))

function dsnFor(database: string): string {
  const url = new URL(ADMIN_URL); url.pathname = `/${database}`; return url.toString()
}
function psqlArgs(dsn: string, extra: string[]): string[] {
  return ['-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-X', '-q', '-d', dsn, ...extra]
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
    const m = String((e as { stderr?: string }).stderr ?? '').match(/ERROR:\s+([0-9A-Z]{5}):/)
    return m ? m[1] : 'NO-SQLSTATE'
  }
}
/** A statement in its OWN psql process, so two are genuinely in flight at once. */
function runAsync(dsn: string, sql: string): Promise<{ ok: boolean; stderr: string; ms: number }> {
  const t0 = Date.now()
  return new Promise(done => {
    const child = spawn(PSQL!, psqlArgs(dsn, ['-c', sql]), { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', c => { stderr += String(c) })
    child.on('error', e => done({ ok: false, stderr: String(e), ms: Date.now() - t0 }))
    child.on('close', code => done({ ok: code === 0, stderr, ms: Date.now() - t0 }))
  })
}
const sqlstateIn = (stderr: string) => stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1] ?? ''

const AVAILABLE = (() => {
  if (!PSQL) return false
  try {
    execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 })
    return true
  } catch { return false }
})()
const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'
if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn('[autonomy-bind-sql] SKIPPED — no reachable local Postgres. Phase 3B1B atomicity, ' +
    'refusal-writes-nothing, licence concurrency, idempotency and privilege closure were NOT ' +
    'proven. Set ATLAS_SQL_TEST_URL to enable it.')
}
const d = AVAILABLE || SQL_REQUIRED ? describe : describe.skip

const DB_NAME = `omnira_3b1b_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

// ── Fixture ───────────────────────────────────────────────────────────────────

const P_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INST_A = '99999999-9999-4999-8999-999999999999'
const INST_B = '88888888-8888-4888-8888-888888888888'
const DEF_HASH_A = 'a'.repeat(64)
const DEF_HASH_B = 'b'.repeat(64)
const LIC_A = '77777777-7777-4777-8777-777777777777'        // instance A, gen 0 + gen 1 (head)
const LIC_OTHER = '02020202-0202-4202-8202-020202020202'    // instance B / project B
const LIC_WRONG_DEF = '03030303-0303-4303-8303-030303030303' // instance C, bound to another def
const LIC_EXPIRED = '04040404-0404-4404-8404-040404040404'   // instance D, expired
const INST_C = '66666666-6666-4666-8666-666666666666'
const INST_D = '55555555-5555-4555-8555-555555555555'
const AUTH = 'abababab-abab-4bab-8bab-abababababab'

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

create table public.projects (
  id uuid primary key, slug text unique not null, name text,
  execution_paused boolean not null default false);
create table public.workflow_instances (
  id uuid primary key, project_id uuid not null references public.projects (id),
  def_key text not null, def_hash text not null, current_state text not null,
  status text not null default 'active');
-- The pre-binding shape of runs; the REAL binding migrations add the rest.
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  status text not null default 'pending',
  kind text, input jsonb, context jsonb,
  max_attempts integer not null default 3, attempts integer not null default 0,
  policy_class text, claim_id uuid, claimed_at timestamptz, started_at timestamptz,
  lease_until timestamptz, cancel_requested boolean not null default false,
  created_at timestamptz not null default now());
-- Shaped like the real Phase 2C ledger: every column the bind writer reads.
create table public.atlas_autonomy_license_events (
  event_id uuid primary key default gen_random_uuid(),
  event_seq bigint generated always as identity unique,
  license_id uuid not null,
  license_generation integer not null check (license_generation >= 0),
  act text not null,
  project_id uuid not null,
  workflow_instance_id uuid not null,
  bound_def_key text not null,
  bound_def_hash text not null,
  licensed_level text not null check (licensed_level in ('L0','L1','L2','L3','L4','L5','L6')),
  allowed_action_kinds text[] not null,
  action_scope_fingerprint text not null,
  effective_at timestamptz not null,
  expires_at timestamptz not null);
create unique index atlas_autonomy_license_events_generation_idx
  on public.atlas_autonomy_license_events (license_id, license_generation);

insert into public.projects (id, slug, name) values ('${P_A}','alpha','Alpha'), ('${P_B}','beta','Beta');
insert into public.workflow_instances (id, project_id, def_key, def_hash, current_state) values
  ('${INST_A}','${P_A}','omnira.probe-validation','${DEF_HASH_A}','probe'),
  ('${INST_B}','${P_B}','omnira.probe-validation','${DEF_HASH_B}','probe'),
  ('${INST_C}','${P_A}','omnira.probe-validation','${DEF_HASH_A}','probe'),
  ('${INST_D}','${P_A}','omnira.probe-validation','${DEF_HASH_A}','probe');

insert into public.atlas_autonomy_license_events
  (license_id, license_generation, act, project_id, workflow_instance_id, bound_def_key, bound_def_hash,
   licensed_level, allowed_action_kinds, action_scope_fingerprint, effective_at, expires_at) values
  ('${LIC_A}', 0, 'LICENSE_ISSUED', '${P_A}','${INST_A}','omnira.probe-validation','${DEF_HASH_A}',
   'L4', array['proof_governed_effect','observe_release_gate'], 'fp0', now() - interval '1 day', now() + interval '30 days'),
  ('${LIC_A}', 1, 'LICENSE_RESTRICTED', '${P_A}','${INST_A}','omnira.probe-validation','${DEF_HASH_A}',
   'L3', array['proof_governed_effect'], 'fp1', now() - interval '1 day', now() + interval '30 days'),
  ('${LIC_OTHER}', 0, 'LICENSE_ISSUED', '${P_B}','${INST_B}','omnira.probe-validation','${DEF_HASH_B}',
   'L3', array['proof_governed_effect'], 'fpo', now() - interval '1 day', now() + interval '30 days'),
  ('${LIC_WRONG_DEF}', 0, 'LICENSE_ISSUED', '${P_A}','${INST_C}','some.other-definition','${DEF_HASH_A}',
   'L3', array['proof_governed_effect'], 'fpw', now() - interval '1 day', now() + interval '30 days'),
  ('${LIC_EXPIRED}', 0, 'LICENSE_ISSUED', '${P_A}','${INST_D}','omnira.probe-validation','${DEF_HASH_A}',
   'L3', array['proof_governed_effect'], 'fpe', now() - interval '30 days', now() - interval '1 minute');
`

// ── Helpers ───────────────────────────────────────────────────────────────────

let seq = 0
const hex64 = (seed: string) => createHash('sha256').update(seed).digest('hex')
const lit = (v: string | number | null) =>
  v === null ? 'NULL' : typeof v === 'number' ? String(v) : v.startsWith('$sql:') ? v.slice(5) : `'${v}'`

/** Highest licence event_seq for an instance — what the resolver would report. */
const watermark = (inst: string) =>
  Number(one(dsn, `select max(event_seq) from public.atlas_autonomy_license_events where workflow_instance_id='${inst}'`))
const headSeq = () => Number(one(dsn, 'select max(event_seq) from public.atlas_autonomy_license_events'))

type Args = Record<string, string | number | null>

function exemptArgs(over: Args = {}): Args {
  seq += 1
  return {
    p_project_id: P_A, p_workflow_instance_id: INST_A, p_workflow_def_hash: DEF_HASH_A,
    p_workflow_from_state: 'probe', p_action_kind: 'probe_anonymous_protected_access',
    p_action_class: 'READ_ONLY', p_policy_class: 'non_destructive', p_max_attempts: 3,
    p_target_version_hash: hex64(`t${seq}`), p_authorization_id: null,
    p_idempotency_key: hex64(`k${seq}`), p_attempt_group: '$sql:gen_random_uuid()',
    p_policy_mode: 'license_exempt_observation', p_policy_reason: 'canonical_read_only_observation',
    p_reason: 'exempt_observation', p_license_id: null, p_license_generation: null,
    p_license_reason: null, p_required_level: 'L0', p_effective_level: null,
    p_survival_state: null, p_survival_ceiling: null, p_survival_reason: null, p_bounded_by: null,
    p_license_resolved_at: null, p_survival_as_of: null, p_license_watermark: null,
    ...over,
  }
}

function licensedArgs(over: Args = {}): Args {
  return exemptArgs({
    p_action_kind: 'proof_governed_effect', p_action_class: 'FINANCIAL',
    p_policy_class: 'approval_required', p_max_attempts: 1, p_authorization_id: AUTH,
    p_policy_mode: 'licensed', p_policy_reason: null, p_reason: 'allowed',
    p_license_id: LIC_A, p_license_generation: 1, p_license_reason: 'active',
    p_required_level: 'L3', p_effective_level: 'L3',
    p_survival_state: 'NORMAL', p_survival_ceiling: 'L4', p_survival_reason: null,
    p_bounded_by: 'licence', p_license_resolved_at: '$sql:now()', p_survival_as_of: '$sql:now()',
    p_license_watermark: watermark(INST_A),
    ...over,
  })
}

const callSql = (a: Args) =>
  `select * from public.bind_workflow_action_run(${Object.entries(a).map(([k, v]) => `${k} := ${lit(v)}`).join(', ')});`

/** Call as service_role. Returns the SQLSTATE, or '' on success. */
const bind = (a: Args) => sqlstateOf(dsn, `set role service_role; ${callSql(a)}`)

const counts = () => {
  const [runs, binds] = one(dsn, `select (select count(*) from public.runs),
    (select count(*) from public.run_autonomy_decisions where boundary = 'bind')`).split('|').map(Number)
  return { runs, binds }
}
const runsWithKey = (k: string | number | null) =>
  Number(one(dsn, `select count(*) from public.runs where idempotency_key = ${lit(k)}`))

/** Every refused call must leave the database exactly as it was. */
function expectRefusedAndNothingWritten(a: Args, sqlstate: string) {
  const before = counts()
  expect(bind(a)).toBe(sqlstate)
  expect(counts(), 'a refused bind must create neither a run nor a bind trace').toEqual(before)
  expect(runsWithKey(a.p_idempotency_key)).toBe(0)
}

beforeAll(() => {
  if (!AVAILABLE) return
  execFileSync(PSQL!, ['-X', '-q', '-d', ADMIN_URL, '-c', `create database ${DB_NAME}`], { stdio: 'pipe', timeout: 60_000 })
  dsn = dsnFor(DB_NAME)
  execFileSync(PSQL!, psqlArgs(dsn, ['-f', '/dev/stdin']),
    { input: FIXTURE, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
  for (const m of MIGRATIONS) {
    execFileSync(PSQL!, psqlArgs(dsn, ['-f', m]), { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
  }
}, 180_000)

afterAll(() => {
  if (!AVAILABLE) return
  try {
    execFileSync(PSQL!, ['-X', '-q', '-d', ADMIN_URL, '-c', `drop database if exists ${DB_NAME} with (force)`],
      { stdio: 'pipe', timeout: 60_000 })
  } catch { /* disposable */ }
})

// ── 1 · Admitted binds: run + provenance, together ───────────────────────────

d('an admitted bind creates the run AND its bind provenance in one transaction', () => {
  it('licence-exempt: one run, one truthful bind row bound to it — no licence, no Survival', () => {
    const a = exemptArgs()
    const before = counts()
    expect(bind(a)).toBe('')
    expect(counts()).toEqual({ runs: before.runs + 1, binds: before.binds + 1 })
    const row = one(dsn, `select r.project_id, r.action_kind, r.action_class, r.status, r.authorization_id is null,
        d.boundary, d.claim_id is null, d.policy_mode, d.reason, d.required_level,
        d.license_id is null, d.survival_state is null, d.effective_level is null
      from public.runs r join public.run_autonomy_decisions d on d.run_id = r.id
      where r.idempotency_key = '${a.p_idempotency_key}'`)
    expect(row).toBe(`${P_A}|probe_anonymous_protected_access|READ_ONLY|pending|t|bind|t|license_exempt_observation|exempt_observation|L0|t|t|t`)
  })

  it('licensed: pins the exact head licence event; run + bind row commit together', () => {
    const a = licensedArgs()
    const before = counts()
    expect(bind(a)).toBe('')
    expect(counts()).toEqual({ runs: before.runs + 1, binds: before.binds + 1 })
    const row = one(dsn, `select r.action_kind, r.action_class, r.authorization_id, d.policy_mode, d.reason,
        d.license_id, d.license_generation, d.license_reason, d.required_level, d.effective_level,
        d.survival_state, d.survival_ceiling, d.bounded_by
      from public.runs r join public.run_autonomy_decisions d on d.run_id = r.id
      where r.idempotency_key = '${a.p_idempotency_key}'`)
    expect(row).toBe(`proof_governed_effect|FINANCIAL|${AUTH}|licensed|allowed|${LIC_A}|1|active|L3|L3|NORMAL|L4|licence`)
  })

  it('the function returns the new run id and the bind event id as a pair', () => {
    const a = exemptArgs()
    const ret = one(dsn, `set role service_role; ${callSql(a)}`)
    const [runId, eventId] = ret.split('|')
    expect(one(dsn, `select count(*) from public.run_autonomy_decisions where event_id='${eventId}' and run_id='${runId}' and boundary='bind'`)).toBe('1')
  })

  it('accepts the survival-unavailable shape for an admitted decision whose requirement it meets', () => {
    // Representational completeness only: today's only licensed kind needs L3,
    // which a fail-closed L0 can never meet — the TS core refuses that earlier.
    const a = licensedArgs({ p_required_level: 'L0', p_effective_level: 'L0',
      p_survival_state: null, p_survival_ceiling: null, p_survival_as_of: null,
      p_survival_reason: 'population_unavailable', p_bounded_by: 'survival_unavailable' })
    expect(bind(a)).toBe('')
  })
})

// ── 2 · Refusal writes NOTHING ────────────────────────────────────────────────

d('every refused bind creates neither a run nor a trace', () => {
  it('a REFUSED admission reason cannot be persisted at bind', () => {
    for (const reason of ['licence_not_effective', 'action_not_in_licence_scope', 'effective_level_below_required']) {
      expectRefusedAndNothingWritten(licensedArgs({ p_reason: reason }), '22023')
    }
  })

  it('an unsupported action cannot be bound', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_policy_mode: 'unsupported', p_reason: 'unsupported_action',
      p_policy_reason: 'v1_scope_incomplete', p_required_level: null }), '22023')
  })

  it('impossible mode/reason pairs are refused', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_reason: 'allowed' }), '22023')
    expectRefusedAndNothingWritten(licensedArgs({ p_reason: 'exempt_observation' }), '22023')
    expectRefusedAndNothingWritten(exemptArgs({ p_policy_mode: null }), '22023')
  })

  it('a non-READ_ONLY action cannot borrow the observation exemption', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_action_kind: 'proof_governed_effect',
      p_action_class: 'FINANCIAL', p_max_attempts: 1, p_authorization_id: AUTH }), '22023')
  })

  it('an exempt bind may not reference a licence', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_license_id: LIC_A, p_license_generation: 1 }), '22023')
    expectRefusedAndNothingWritten(exemptArgs({ p_license_watermark: watermark(INST_A) }), '22023')
  })

  it('a licensed bind must pin the licence event AND the watermark', () => {
    expectRefusedAndNothingWritten(licensedArgs({ p_license_id: null, p_license_generation: null }), '22023')
    expectRefusedAndNothingWritten(licensedArgs({ p_license_watermark: null }), '22023')
  })

  it('effective level below required cannot be recorded as allowed', () => {
    expectRefusedAndNothingWritten(licensedArgs({ p_effective_level: 'L2' }), '22023')
  })
})

// ── 3 · Identity and scope cannot be smuggled ─────────────────────────────────

d('identity / scope substitution is refused before anything is written', () => {
  it('project: a run cannot be bound to a project its instance does not belong to', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_project_id: P_B }), '22023')
    expectRefusedAndNothingWritten(licensedArgs({ p_project_id: P_B }), '22023')
  })

  it('workflow instance: unknown instance refused; another instance\'s licence refused', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_workflow_instance_id: '12121212-1212-4212-8212-121212121212' }), 'P0002')
    // Instance A's watermark, instance B's licence: cross-subject linkage.
    expectRefusedAndNothingWritten(licensedArgs({ p_license_id: LIC_OTHER, p_license_generation: 0 }), '22023')
  })

  it('workflow definition: def_hash mismatch refused; licence bound to another definition refused', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_workflow_def_hash: 'c'.repeat(64) }), '22023')
    expectRefusedAndNothingWritten(licensedArgs({ p_workflow_instance_id: INST_C,
      p_license_id: LIC_WRONG_DEF, p_license_generation: 0, p_license_watermark: watermark(INST_C) }), '22023')
  })

  it('ActionKind: a kind outside the pinned licence scope is refused', () => {
    // Generation 0 allowed observe_release_gate; the HEAD (gen 1) narrowed it away.
    expectRefusedAndNothingWritten(licensedArgs({ p_action_kind: 'observe_release_gate',
      p_action_class: 'READ_ONLY', p_authorization_id: null, p_max_attempts: 3 }), '22023')
  })

  it('licence subject: a non-head generation of the right lineage is refused', () => {
    expectRefusedAndNothingWritten(licensedArgs({ p_license_generation: 0 }), '40001')
  })

  it('licence event that does not exist is refused', () => {
    expectRefusedAndNothingWritten(licensedArgs({ p_license_generation: 7 }), 'P0002')
  })

  it('the run\'s from_state must be the instance\'s current state (binding trigger) — and no trace survives', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_workflow_from_state: 'some_other_state' }), '23001')
  })
})

// ── 4 · Licence authority changing around the bind ───────────────────────────

d('licence TOCTOU — the bind never commits on a ledger view that has moved', () => {
  it('expired at bind time (DB clock) → refused, nothing written', () => {
    expectRefusedAndNothingWritten(licensedArgs({ p_workflow_instance_id: INST_D,
      p_license_id: LIC_EXPIRED, p_license_generation: 0, p_license_watermark: watermark(INST_D) }), '40001')
  })

  it('a stale or future-dated resolution is refused', () => {
    expectRefusedAndNothingWritten(licensedArgs({ p_license_resolved_at: "$sql:now() - interval '5 minutes'" }), '40001')
    expectRefusedAndNothingWritten(licensedArgs({ p_license_resolved_at: "$sql:now() + interval '5 minutes'" }), '40001')
    expectRefusedAndNothingWritten(licensedArgs({ p_license_resolved_at: null }), '40001')
  })

  it('an event committed after resolution (watermark moved) → refused, nothing written', () => {
    const stale = watermark(INST_A)
    // A new lineage issued for the same instance after the resolver read it.
    query(dsn, `insert into public.atlas_autonomy_license_events
      (license_id, license_generation, act, project_id, workflow_instance_id, bound_def_key, bound_def_hash,
       licensed_level, allowed_action_kinds, action_scope_fingerprint, effective_at, expires_at)
      values (gen_random_uuid(), 0, 'LICENSE_ISSUED', '${P_A}', '${INST_A}', 'omnira.probe-validation',
       '${DEF_HASH_A}', 'L6', array['proof_governed_effect'], 'fpn', now(), now() + interval '1 day')`)
    expect(headSeq()).toBeGreaterThan(stale)
    expectRefusedAndNothingWritten(licensedArgs({ p_license_watermark: stale }), '40001')
  })

  it('a CONCURRENT licence act holding the lineage lock blocks the bind, which then refuses', async () => {
    const stale = watermark(INST_A)
    const a = licensedArgs({ p_license_watermark: stale })
    const before = counts()
    // The licence writer's own discipline: FOR UPDATE on the lineage, then append.
    const licenceAct = runAsync(dsn, `begin;
      select 1 from public.atlas_autonomy_license_events where license_id = '${LIC_A}' for update;
      select pg_sleep(1.5);
      insert into public.atlas_autonomy_license_events
        (license_id, license_generation, act, project_id, workflow_instance_id, bound_def_key, bound_def_hash,
         licensed_level, allowed_action_kinds, action_scope_fingerprint, effective_at, expires_at)
        select license_id, (select max(license_generation) + 1 from public.atlas_autonomy_license_events where license_id = '${LIC_A}'),
          'LICENSE_SUSPENDED', project_id, workflow_instance_id, bound_def_key, bound_def_hash, 'L3',
          array['proof_governed_effect'], 'fps', effective_at, expires_at
        from public.atlas_autonomy_license_events where license_id = '${LIC_A}' and license_generation = 1;
      commit;`)
    await new Promise(r => setTimeout(r, 300))           // let the licence act take its lock first
    const bindCall = runAsync(dsn, `set role service_role; ${callSql(a)}`)
    const [lic, b] = await Promise.all([licenceAct, bindCall])
    expect(lic.ok, lic.stderr).toBe(true)
    expect(b.ok).toBe(false)
    expect(sqlstateIn(b.stderr)).toBe('40001')
    expect(b.ms, 'the bind must have WAITED on the licence act, not raced past it').toBeGreaterThan(800)
    expect(counts()).toEqual(before)
  })
})

// ── 5 · Transaction failure leaves nothing behind ────────────────────────────

d('a failure of EITHER write rolls back BOTH', () => {
  it('trace persistence failure (after the run insert succeeded) leaves NO run', () => {
    // An exempt bind carrying a Survival field: every RPC precheck passes, the
    // run INSERT succeeds, and the bind-row INSERT then violates the 3B1A exempt
    // matrix (23514). The run must not survive.
    const a = exemptArgs({ p_survival_state: 'NORMAL' })
    const before = counts()
    expect(bind(a)).toBe('23514')
    expect(counts()).toEqual(before)
    expect(runsWithKey(a.p_idempotency_key)).toBe(0)
  })

  it('run persistence failure leaves NO bind provenance', () => {
    // A malformed target hash violates runs_target_version_hash_sha256 on the
    // run INSERT — the first write — so the bind row is never reached and
    // nothing at all may remain. (Independent of licence state, which the
    // concurrency proof above has deliberately moved.)
    const a = exemptArgs({ p_target_version_hash: 'not-a-sha256' })
    const before = counts()
    expect(bind(a)).toBe('23514')
    expect(counts()).toEqual(before)
    expect(runsWithKey(a.p_idempotency_key)).toBe(0)
  })
})

// ── 6 · Idempotency ───────────────────────────────────────────────────────────

d('idempotency — one durable run per identity, and no orphaned provenance', () => {
  it('a retry with the same identity is the existing duplicate (23505) and writes nothing', () => {
    const a = exemptArgs()
    expect(bind(a)).toBe('')
    const after = counts()
    expect(bind({ ...a, p_attempt_group: '$sql:gen_random_uuid()' })).toBe('23505')
    expect(counts()).toEqual(after)
    expect(runsWithKey(a.p_idempotency_key)).toBe(1)
  })

  it('CONCURRENT attempts with one identity → exactly one run and exactly one bind row', async () => {
    const a = exemptArgs()
    const before = counts()
    const results = await Promise.all([1, 2, 3, 4].map(() => runAsync(dsn, `set role service_role; ${callSql(a)}`)))
    expect(results.filter(r => r.ok)).toHaveLength(1)
    for (const r of results.filter(x => !x.ok)) expect(sqlstateIn(r.stderr)).toBe('23505')
    expect(counts()).toEqual({ runs: before.runs + 1, binds: before.binds + 1 })
    expect(runsWithKey(a.p_idempotency_key)).toBe(1)
  })

  it('a terminal run frees the identity exactly as before 3B1B — each run keeps ONE bind row', () => {
    const a = exemptArgs()
    expect(bind(a)).toBe('')
    query(dsn, `update public.runs set status = 'cancelled' where idempotency_key = '${a.p_idempotency_key}'`)
    expect(bind(a)).toBe('')
    expect(one(dsn, `select count(*), count(distinct d.run_id) from public.run_autonomy_decisions d
      join public.runs r on r.id = d.run_id where r.idempotency_key = '${a.p_idempotency_key}' and d.boundary = 'bind'`)).toBe('2|2')
  })

  it('bind is exactly-once per run; repeated readiness observations stay legitimate', () => {
    const a = exemptArgs()
    const runId = one(dsn, `set role service_role; ${callSql(a)}`).split('|')[0]
    // A second bind row for the same run — even by a privileged direct insert.
    expect(sqlstateOf(dsn, `insert into public.run_autonomy_decisions (run_id, boundary, policy_mode, policy_reason, reason, required_level)
      values ('${runId}', 'bind', 'license_exempt_observation', 'canonical_read_only_observation', 'exempt_observation', 'L0')`)).toBe('23505')
    // Readiness is NOT constrained: claim the run and record it twice through the 3B1A writer.
    query(dsn, `update public.runs set claim_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' where id = '${runId}'`)
    const readiness = `set role service_role; select public.record_run_autonomy_decision(
      p_run_id := '${runId}', p_claim_id := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', p_boundary := 'readiness',
      p_policy_mode := 'license_exempt_observation', p_policy_reason := 'canonical_read_only_observation',
      p_reason := 'exempt_observation', p_license_id := NULL, p_license_generation := NULL, p_license_reason := NULL,
      p_required_level := 'L0', p_effective_level := NULL, p_survival_state := NULL, p_survival_ceiling := NULL,
      p_survival_reason := NULL, p_bounded_by := NULL, p_license_resolved_at := NULL, p_survival_as_of := NULL);`
    expect(sqlstateOf(dsn, readiness)).toBe('')
    expect(sqlstateOf(dsn, readiness)).toBe('')
  })
})

// ── 7 · 3B1A protections remain ───────────────────────────────────────────────

d('3B1A protections remain', () => {
  it('the generic writer still REFUSES boundary = bind', () => {
    const runId = one(dsn, 'select id from public.runs where workflow_instance_id is not null limit 1')
    expect(sqlstateOf(dsn, `set role service_role; select public.record_run_autonomy_decision(
      p_run_id := '${runId}', p_claim_id := NULL, p_boundary := 'bind',
      p_policy_mode := 'license_exempt_observation', p_policy_reason := 'canonical_read_only_observation',
      p_reason := 'exempt_observation', p_license_id := NULL, p_license_generation := NULL, p_license_reason := NULL,
      p_required_level := 'L0', p_effective_level := NULL, p_survival_state := NULL, p_survival_ceiling := NULL,
      p_survival_reason := NULL, p_bounded_by := NULL, p_license_resolved_at := NULL, p_survival_as_of := NULL);`)).toBe('22023')
  })

  it('the ledger stays append-only — a bind row cannot be updated or deleted', () => {
    expect(sqlstateOf(dsn, `update public.run_autonomy_decisions set reason = 'allowed' where boundary = 'bind'`)).toBe('42501')
    expect(sqlstateOf(dsn, `delete from public.run_autonomy_decisions where boundary = 'bind'`)).toBe('42501')
  })

  it('a bound run carrying provenance cannot be deleted (RESTRICT)', () => {
    const runId = one(dsn, `select run_id from public.run_autonomy_decisions where boundary = 'bind' limit 1`)
    expect(sqlstateOf(dsn, `delete from public.runs where id = '${runId}'`)).toBe('23503')
  })
})

// ── 8 · Privilege closure ─────────────────────────────────────────────────────

d('the atomic writer is server-only', () => {
  const SIG = `public.bind_workflow_action_run(uuid, uuid, text, text, text, text, text, integer, text, uuid, text, uuid,
    text, text, text, uuid, integer, text, text, text, text, text, text, text, timestamptz, timestamptz, bigint)`

  it('anon and authenticated cannot execute it; service_role can', () => {
    expect(one(dsn, `select has_function_privilege('anon', '${SIG}', 'execute'),
      has_function_privilege('authenticated', '${SIG}', 'execute'),
      has_function_privilege('service_role', '${SIG}', 'execute')`)).toBe('f|f|t')
    for (const role of ['anon', 'authenticated']) {
      const before = counts()
      expect(sqlstateOf(dsn, `set role ${role}; ${callSql(exemptArgs())}`)).toBe('42501')
      expect(counts()).toEqual(before)
    }
  })

  it('is SECURITY DEFINER with a fixed empty search_path, and has exactly one overload', () => {
    expect(one(dsn, `select prosecdef, array_to_string(proconfig, ',') from pg_proc where proname = 'bind_workflow_action_run'`))
      .toBe('t|search_path=""')
    expect(one(dsn, `select count(*) from pg_proc where proname = 'bind_workflow_action_run'`)).toBe('1')
  })

  it('service_role still cannot write the ledger directly — the RPC is the only path', () => {
    const runId = one(dsn, 'select id from public.runs where workflow_instance_id is not null limit 1')
    expect(sqlstateOf(dsn, `set role service_role; insert into public.run_autonomy_decisions
      (run_id, boundary, policy_mode, policy_reason, reason, required_level)
      values ('${runId}', 'readiness', 'license_exempt_observation', 'canonical_read_only_observation', 'exempt_observation', 'L0')`)).toBe('42501')
  })
})
