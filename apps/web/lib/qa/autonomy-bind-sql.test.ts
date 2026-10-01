/**
 * Phase 3B1B — REAL PostgreSQL proof for the atomic bind.
 *
 * What only a real database can prove:
 *
 *   1. ATOMICITY. An admitted bind creates the run AND its bind provenance, or
 *      neither — including when the SECOND write fails after the first one
 *      succeeded inside the function.
 *   2. REFUSAL WRITES NOTHING. Every refused representation and subject swap
 *      leaves zero runs and zero bind rows. A LICENSED bind is refused
 *      structurally, whatever licence state exists.
 *   3. CONCURRENCY. The chosen invariant: the bind commit depends on NO mutable
 *      authority input. Two-session proofs run the REAL Phase 2C licence writer
 *      (issue of a competing lineage, revocation) and a Decision Ledger reversal
 *      INSIDE an open bind transaction: none of them is blocked, none changes
 *      what the bind may commit, and the committed provenance stays truthful.
 *      (The review that chose this invariant showed a licensed bind could NOT
 *      be serialized against those acts — a competing lineage and a reversal
 *      both committed inside an open licensed bind.)
 *   4. IDEMPOTENCY. The existing action-identity index still yields exactly one
 *      run per identity, and a duplicate leaves no orphaned provenance.
 *   5. PRIVILEGE CLOSURE. Server-only, and the 3B1A writer still refuses bind.
 *
 * Applies the REAL Phase 2C licence migration, the REAL run-binding migrations,
 * the REAL 3B1A trace migration and the REAL 3B1B migration onto a minimal
 * fixture. SKIPS loudly with no Postgres; FAILS when CI=true or
 * ATLAS_SQL_TEST_REQUIRED=1.
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
  '20260924180000_autonomy_license_phase2c.sql',
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
function runAsync(dsn: string, sql: string): Promise<{ ok: boolean; stderr: string; start: number; end: number }> {
  const start = Date.now()
  return new Promise(done => {
    const child = spawn(PSQL!, psqlArgs(dsn, ['-c', sql]), { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', c => { stderr += String(c) })
    child.on('error', e => done({ ok: false, stderr: String(e), start, end: Date.now() }))
    child.on('close', code => done({ ok: code === 0, stderr, start, end: Date.now() }))
  })
}
const sqlstateIn = (stderr: string) => stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1] ?? ''
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

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
    'refusal-writes-nothing, concurrency, idempotency and privilege closure were NOT proven. ' +
    'Set ATLAS_SQL_TEST_URL to enable it.')
}
const d = AVAILABLE || SQL_REQUIRED ? describe : describe.skip

const DB_NAME = `omnira_3b1b_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

// ── Fixture ───────────────────────────────────────────────────────────────────

const P_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INST_A = '99999999-9999-4999-8999-999999999999'
const INST_B = '88888888-8888-4888-8888-888888888888'
const DEF_KEY = 'omnira.probe-validation'
const DEF_HASH_A = 'a'.repeat(64)
const DEF_HASH_B = 'b'.repeat(64)
const DECISION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const RECORD = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const LIC_A = '77777777-7777-4777-8777-777777777777'
const ACTOR = 'user:00000000-0000-4000-8000-000000000001'
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
-- Shaped like the real Decision Ledger for the columns the licence writer reads.
create table public.atlas_decision_ledger (
  record_id uuid primary key, decision_id uuid not null, version integer not null,
  project_id uuid not null references public.projects (id), materiality jsonb not null,
  record_type text);
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

insert into public.projects (id, slug, name) values ('${P_A}','alpha','Alpha'), ('${P_B}','beta','Beta');
insert into public.workflow_instances (id, project_id, def_key, def_hash, current_state) values
  ('${INST_A}','${P_A}','${DEF_KEY}','${DEF_HASH_A}','probe'),
  ('${INST_B}','${P_B}','${DEF_KEY}','${DEF_HASH_B}','probe');
insert into public.atlas_decision_ledger values
  ('${RECORD}','${DECISION}',1,'${P_A}','["autonomy"]'::jsonb,'approved');
`

/** The REAL Phase 2C licence writer. */
const licenceAct = (licenceId: string, act: string, expectedGeneration: number, expiresIn = '30 days') =>
  `select * from public.autonomy_license_append(p_license_id => '${licenceId}',
    p_expected_generation => ${expectedGeneration}, p_act => '${act}', p_project_id => '${P_A}',
    p_workflow_instance_id => '${INST_A}', p_bound_def_key => '${DEF_KEY}', p_bound_def_hash => '${DEF_HASH_A}',
    p_licensed_level => 'L3', p_allowed_action_kinds => array['proof_governed_effect'],
    p_action_scope_fingerprint => '${DEF_HASH_A}', p_decision_id => '${DECISION}', p_decision_version => 1,
    p_decision_record_id => '${RECORD}', p_effective_at => now() - interval '1 hour',
    p_expires_at => now() + interval '${expiresIn}', p_superseded_by_license_id => null,
    p_reason => null, p_actor => '${ACTOR}')`

// ── Helpers ───────────────────────────────────────────────────────────────────

let seq = 0
const hex64 = (seed: string) => createHash('sha256').update(seed).digest('hex')
const lit = (v: string | number | null) =>
  v === null ? 'NULL' : typeof v === 'number' ? String(v) : v.startsWith('$sql:') ? v.slice(5) : `'${v}'`

type Args = Record<string, string | number | null>

function exemptArgs(over: Args = {}): Args {
  seq += 1
  return {
    p_project_id: P_A, p_workflow_instance_id: INST_A, p_workflow_def_hash: DEF_HASH_A,
    p_workflow_from_state: 'probe', p_action_kind: 'probe_anonymous_protected_access',
    p_action_class: 'READ_ONLY', p_policy_class: 'non_destructive', p_max_attempts: 3,
    p_target_version_hash: hex64(`t${seq}`), p_authorization_id: null,
    p_idempotency_key: hex64(`k${seq}-${DB_NAME}`), p_attempt_group: '$sql:gen_random_uuid()',
    p_policy_mode: 'license_exempt_observation', p_policy_reason: 'canonical_read_only_observation',
    p_reason: 'exempt_observation', p_required_level: 'L0',
    ...over,
  }
}

/** What a licensed bind WOULD send: refused structurally in Phase 3B1B. */
const licensedArgs = (over: Args = {}) => exemptArgs({
  p_action_kind: 'proof_governed_effect', p_action_class: 'FINANCIAL',
  p_policy_class: 'approval_required', p_max_attempts: 1, p_authorization_id: AUTH,
  p_policy_mode: 'licensed', p_policy_reason: null, p_reason: 'allowed', p_required_level: 'L3',
  ...over,
})

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

function expectRefusedAndNothingWritten(a: Args, sqlstate: string) {
  const before = counts()
  expect(bind(a)).toBe(sqlstate)
  expect(counts(), 'a refused bind must create neither a run nor a bind trace').toEqual(before)
  expect(runsWithKey(a.p_idempotency_key)).toBe(0)
}

/** The bind row for a run, as the reader sees it. */
const bindRowFor = (key: string | number | null) => one(dsn, `select d.policy_mode, d.reason, d.required_level,
    d.license_id is null, d.license_generation is null, d.survival_state is null, d.survival_ceiling is null,
    d.effective_level is null, d.bounded_by is null, d.claim_id is null
  from public.runs r join public.run_autonomy_decisions d on d.run_id = r.id and d.boundary = 'bind'
  where r.idempotency_key = ${lit(key)}`)
const BARE_EXEMPT_ROW = 'license_exempt_observation|exempt_observation|L0|t|t|t|t|t|t|t'

beforeAll(() => {
  if (!AVAILABLE) return
  execFileSync(PSQL!, ['-X', '-q', '-d', ADMIN_URL, '-c', `create database ${DB_NAME}`], { stdio: 'pipe', timeout: 60_000 })
  dsn = dsnFor(DB_NAME)
  execFileSync(PSQL!, psqlArgs(dsn, ['-f', '/dev/stdin']),
    { input: FIXTURE, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
  for (const m of MIGRATIONS) {
    execFileSync(PSQL!, psqlArgs(dsn, ['-f', m]), { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
  }
  // An EFFECTIVE licence for instance A exists, through the real writer — so
  // every licensed refusal below is a refusal DESPITE available authority.
  query(dsn, licenceAct(LIC_A, 'LICENSE_ISSUED', 0))
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
  it('licence-exempt: one run, one truthful bare bind row bound to it', () => {
    const a = exemptArgs()
    const before = counts()
    expect(bind(a)).toBe('')
    expect(counts()).toEqual({ runs: before.runs + 1, binds: before.binds + 1 })
    expect(one(dsn, `select project_id, action_kind, action_class, status, authorization_id is null
      from public.runs where idempotency_key = '${a.p_idempotency_key}'`))
      .toBe(`${P_A}|probe_anonymous_protected_access|READ_ONLY|pending|t`)
    expect(bindRowFor(a.p_idempotency_key)).toBe(BARE_EXEMPT_ROW)
  })

  it('the function returns the new run id and the bind event id as a pair', () => {
    const [runId, eventId] = one(dsn, `set role service_role; ${callSql(exemptArgs())}`).split('|')
    expect(one(dsn, `select count(*) from public.run_autonomy_decisions
      where event_id='${eventId}' and run_id='${runId}' and boundary='bind'`)).toBe('1')
  })
})

// ── 2 · Refusal writes NOTHING ────────────────────────────────────────────────

d('every refused bind creates neither a run nor a trace', () => {
  it('a LICENSED bind is refused structurally — even with an effective licence in the ledger', () => {
    expect(one(dsn, `select count(*) from public.atlas_autonomy_license_events where license_id = '${LIC_A}'`)).toBe('1')
    expectRefusedAndNothingWritten(licensedArgs(), '22023')
  })

  it('no refused admission reason can be persisted', () => {
    for (const reason of ['licence_not_effective', 'action_not_in_licence_scope',
      'effective_level_below_required', 'allowed']) {
      expectRefusedAndNothingWritten(licensedArgs({ p_reason: reason }), '22023')
    }
    expectRefusedAndNothingWritten(exemptArgs({ p_policy_mode: 'unsupported', p_reason: 'unsupported_action',
      p_policy_reason: 'v1_scope_incomplete', p_required_level: null }), '22023')
  })

  it('impossible mode/reason pairs are refused', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_reason: 'allowed' }), '22023')
    expectRefusedAndNothingWritten(exemptArgs({ p_policy_mode: null }), '22023')
  })

  it('a non-READ_ONLY action cannot borrow the observation exemption', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_action_kind: 'proof_governed_effect',
      p_action_class: 'FINANCIAL', p_max_attempts: 1, p_authorization_id: AUTH }), '22023')
  })
})

// ── 3 · Identity cannot be smuggled ───────────────────────────────────────────

d('identity substitution is refused before anything is written', () => {
  it('project: a run cannot be bound to a project its instance does not belong to', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_project_id: P_B }), '22023')
  })

  it('workflow instance: an unknown instance is refused', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_workflow_instance_id: '12121212-1212-4212-8212-121212121212' }), 'P0002')
  })

  it('workflow definition: a def_hash the instance is not pinned to is refused', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_workflow_def_hash: 'c'.repeat(64) }), '22023')
    // Instance B's definition with instance A's identity.
    expectRefusedAndNothingWritten(exemptArgs({ p_workflow_def_hash: DEF_HASH_B }), '22023')
  })

  it('ActionKind/class: one kind parameter feeds both the run and the trace; a mismatched class is refused', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_action_class: 'MATERIAL_WRITE' }), '22023')
  })

  it('from_state must be the instance\'s current state (binding trigger) — and no trace survives', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_workflow_from_state: 'some_other_state' }), '23001')
  })
})

// ── 4 · Concurrency: authority acts racing an OPEN bind ──────────────────────

d('two-session: no concurrent authority act can narrow what an open bind commits', () => {
  /**
   * Holds a bind transaction OPEN for `holdMs` after the RPC returned, so a
   * second session acts strictly between the bind's checks and its commit —
   * the exact window the review found unserialized for licensed binds.
   */
  const openBind = (a: Args, holdMs = 2500) =>
    runAsync(dsn, `begin; set local role service_role; ${callSql(a)} select pg_sleep(${holdMs / 1000}); commit;`)

  it('a COMPETING licence lineage issued by the real writer inside the window changes nothing the bind relies on', async () => {
    const a = exemptArgs()
    const bindTx = openBind(a)
    await sleep(900)
    const issue = runAsync(dsn, licenceAct('78787878-7878-4878-8878-787878787878', 'LICENSE_ISSUED', 0))
    const [b, i] = await Promise.all([bindTx, issue])
    expect(i.ok, i.stderr).toBe(true)
    expect(b.ok, b.stderr).toBe(true)
    expect(i.end, 'the licence writer is NOT blocked by an exempt bind').toBeLessThan(b.end)
    // Two live lineages now exist (the resolver would say ambiguous_licenses) —
    // and the committed bind row is still TRUE: it never claimed a licence.
    expect(bindRowFor(a.p_idempotency_key)).toBe(BARE_EXEMPT_ROW)
  })

  it('a licence REVOCATION inside the window changes nothing the bind relies on', async () => {
    const a = exemptArgs()
    const bindTx = openBind(a)
    await sleep(900)
    const revoke = runAsync(dsn, licenceAct(LIC_A, 'LICENSE_REVOKED', 1, '29 days'))
    const [b, r] = await Promise.all([bindTx, revoke])
    expect(r.ok, r.stderr).toBe(true)
    expect(b.ok, b.stderr).toBe(true)
    expect(r.end).toBeLessThan(b.end)
    expect(bindRowFor(a.p_idempotency_key)).toBe(BARE_EXEMPT_ROW)
  })

  it('a Decision Ledger REVERSAL inside the window changes nothing the bind relies on', async () => {
    const a = exemptArgs()
    const bindTx = openBind(a)
    await sleep(900)
    const reversal = runAsync(dsn, `insert into public.atlas_decision_ledger
      values (gen_random_uuid(), '${DECISION}', 2, '${P_A}', '["autonomy"]'::jsonb, 'reversed')`)
    const [b, r] = await Promise.all([bindTx, reversal])
    expect(r.ok, r.stderr).toBe(true)
    expect(b.ok, b.stderr).toBe(true)
    expect(r.end).toBeLessThan(b.end)
    expect(bindRowFor(a.p_idempotency_key)).toBe(BARE_EXEMPT_ROW)
  })

  it('a LICENSED bind racing a licence act is refused either way — before and after', async () => {
    const before = counts()
    const [l1, issue, l2] = await Promise.all([
      runAsync(dsn, `set role service_role; ${callSql(licensedArgs())}`),
      runAsync(dsn, licenceAct('79797979-7979-4979-8979-797979797979', 'LICENSE_ISSUED', 0)),
      sleep(200).then(() => runAsync(dsn, `set role service_role; ${callSql(licensedArgs())}`)),
    ])
    expect(issue.ok, issue.stderr).toBe(true)
    for (const r of [l1, l2]) {
      expect(r.ok).toBe(false)
      expect(sqlstateIn(r.stderr)).toBe('22023')
    }
    expect(counts()).toEqual(before)
  })
})

// ── 5 · Transaction failure leaves nothing behind ────────────────────────────

d('a failure of EITHER write rolls back BOTH', () => {
  it('trace persistence failure (after the run insert succeeded) leaves NO run', () => {
    // Every RPC precheck passes and the run INSERT succeeds; the bind-row INSERT
    // then violates the 3B1A exempt matrix (required_level must be L0 → 23514).
    const a = exemptArgs({ p_required_level: 'L3' })
    const before = counts()
    expect(bind(a)).toBe('23514')
    expect(counts()).toEqual(before)
    expect(runsWithKey(a.p_idempotency_key)).toBe(0)
  })

  it('run persistence failure leaves NO bind provenance', () => {
    // A malformed target hash violates runs_target_version_hash_sha256 on the
    // run INSERT — the first write — so nothing at all may remain.
    const a = exemptArgs({ p_target_version_hash: 'not-a-sha256' })
    const before = counts()
    expect(bind(a)).toBe('23514')
    expect(counts()).toEqual(before)
  })
})

// ── 6 · Idempotency ───────────────────────────────────────────────────────────

d('idempotency — one durable run per identity, and no orphaned provenance', () => {
  it('a retry with the same identity is the existing duplicate (23505) and writes nothing', () => {
    const a = exemptArgs()
    expect(bind(a)).toBe('')
    const after = counts()
    expect(bind(a)).toBe('23505')
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
    const runId = one(dsn, `set role service_role; ${callSql(exemptArgs())}`).split('|')[0]
    expect(sqlstateOf(dsn, `insert into public.run_autonomy_decisions (run_id, boundary, policy_mode, policy_reason, reason, required_level)
      values ('${runId}', 'bind', 'license_exempt_observation', 'canonical_read_only_observation', 'exempt_observation', 'L0')`)).toBe('23505')
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
    text, text, text, text)`

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
