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

import { ACTION_REGISTRY } from '@/lib/workflows/action-registry'
import { LICENCE_EXEMPT_OBSERVATION_KINDS } from '@/lib/atlas/autonomy-runtime/policy'

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
/** omnira.execution-proof @ effect — the canonical placement of the licensed kind. */
const INST_EFFECT = '44444444-4444-4444-8444-444444444444'
const TRACE_FAULT_HASH = 'f'.repeat(64)
/** The authenticated user who owns project A under runs_owner. */
const OWNER_A = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a'
/** A workflow-bound run that existed BEFORE 3B1B (seeded pre-migration, no provenance). */
const HISTORICAL_RUN = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b'

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

-- Supabase's auth.uid(), reduced to what the runs_owner policy reads.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
  $u$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $u$;
grant usage on schema auth to anon, authenticated, service_role;
create table public.projects (
  id uuid primary key, slug text unique not null, name text,
  execution_paused boolean not null default false, owner_id uuid);
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
-- The production runs_owner shape: an authenticated user may write runs only in
-- projects they own.
alter table public.runs enable row level security;
create policy runs_owner on public.runs for all to authenticated
  using (project_id in (select id from public.projects where owner_id = auth.uid()))
  with check (project_id in (select id from public.projects where owner_id = auth.uid()));

insert into public.projects (id, slug, name, owner_id) values
  ('${P_A}','alpha','Alpha','${OWNER_A}'), ('${P_B}','beta','Beta', NULL);
insert into public.workflow_instances (id, project_id, def_key, def_hash, current_state) values
  ('${INST_A}','${P_A}','${DEF_KEY}','${DEF_HASH_A}','probe'),
  ('${INST_B}','${P_B}','${DEF_KEY}','${DEF_HASH_B}','probe'),
  ('${INST_EFFECT}','${P_A}','omnira.execution-proof','${DEF_HASH_A}','effect');
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

/** The ONLY parameters the RPC has: identity. Nothing a caller could classify with. */
function exemptArgs(over: Args = {}): Args {
  seq += 1
  return {
    p_project_id: P_A, p_workflow_instance_id: INST_A, p_workflow_def_hash: DEF_HASH_A,
    p_workflow_from_state: 'probe', p_action_kind: 'probe_anonymous_protected_access',
    p_target_version_hash: hex64(`t${seq}`),
    p_idempotency_key: hex64(`k${seq}-${DB_NAME}`), p_attempt_group: '$sql:gen_random_uuid()',
    ...over,
  }
}

/** A licensed kind at its OWN canonical placement: refused structurally in Phase 3B1B. */
const licensedArgs = (over: Args = {}) => exemptArgs({
  p_workflow_instance_id: INST_EFFECT, p_workflow_from_state: 'effect',
  p_action_kind: 'proof_governed_effect', ...over,
})

/** The instance fixture seeded at a (def_key, state) placement. */
const instanceAt = (defKey: string, state: string) =>
  one(dsn, `select id from public.workflow_instances where def_key = '${defKey}' and current_state = '${state}' limit 1`)

type Placement = { readonly def_key: string; readonly state: string }
const placementsOf = (kind: string): readonly Placement[] =>
  (ACTION_REGISTRY as Record<string, { placements: readonly Placement[] }>)[kind]?.placements ?? []

/** Every reviewed exempt placement, from the CANONICAL TypeScript sources. */
const EXEMPT_PLACEMENTS = LICENCE_EXEMPT_OBSERVATION_KINDS.flatMap(kind =>
  placementsOf(kind).map(p => ({ kind: kind as string, defKey: p.def_key, state: p.state })))
/** Every (def_key, state) any registered action is placed at. */
const ALL_PLACEMENTS: Placement[] = [...new Map(Object.keys(ACTION_REGISTRY).flatMap(placementsOf)
  .map(p => [`${p.def_key}|${p.state}`, p] as const)).values()]

/**
 * Try EVERY (kind × placement) through the real RPC as service_role in ONE
 * transaction, each attempt in its own subtransaction, and ROLL BACK at the end.
 * Returns `kind|def_key|state` → '' (bound) or the SQLSTATE, plus how many runs
 * and bind rows each attempt left behind INSIDE its own subtransaction.
 */
function bindMatrix(kinds: readonly string[]): Map<string, { sqlstate: string; runs: number; binds: number }> {
  const kindArr = `array[${kinds.map(k => `'${k}'`).join(',')}]::text[]`
  const plArr = `array[${ALL_PLACEMENTS.map(p => `'${p.def_key}|${p.state}'`).join(',')}]::text[]`
  const out = execFileSync(PSQL!, psqlArgs(dsn, ['-t', '-A', '-F', '|', '-f', '/dev/stdin']), {
    input: `begin;
create temp table zz_matrix (k text, d text, s text, st text, runs int, binds int) on commit drop;
grant all on zz_matrix to service_role;
set local role service_role;
do $m$
declare k text; pl text; v_inst uuid; v_before_r int; v_before_b int; v_r int; v_b int; i int := 0;
begin
  foreach k in array ${kindArr} loop
    foreach pl in array ${plArr} loop
      i := i + 1;
      select id into v_inst from public.workflow_instances
        where def_key = split_part(pl, '|', 1) and current_state = split_part(pl, '|', 2) limit 1;
      begin
        select count(*) into v_before_r from public.runs;
        select count(*) into v_before_b from public.run_autonomy_decisions where boundary = 'bind';
        perform * from public.bind_workflow_action_run(
          p_project_id := '${P_A}', p_workflow_instance_id := v_inst, p_workflow_def_hash := '${DEF_HASH_A}',
          p_workflow_from_state := split_part(pl, '|', 2), p_action_kind := k,
          p_target_version_hash := encode(sha256(convert_to('mt' || i, 'UTF8')), 'hex'),
          p_idempotency_key := encode(sha256(convert_to('mk' || i || '${DB_NAME}', 'UTF8')), 'hex'),
          p_attempt_group := gen_random_uuid());
        select count(*) - v_before_r into v_r from public.runs;
        select count(*) - v_before_b into v_b from public.run_autonomy_decisions where boundary = 'bind';
        insert into zz_matrix values (k, split_part(pl, '|', 1), split_part(pl, '|', 2), '', v_r, v_b);
      exception when others then
        -- the subtransaction rolled back: re-measure to PROVE nothing survived it
        insert into zz_matrix values (k, split_part(pl, '|', 1), split_part(pl, '|', 2), sqlstate,
          (select count(*) from public.runs) - v_before_r,
          (select count(*) from public.run_autonomy_decisions where boundary = 'bind') - v_before_b);
      end;
    end loop;
  end loop;
end $m$;
select k, d, s, st, runs, binds from zz_matrix;
rollback;`,
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000,
  })
  const m = new Map<string, { sqlstate: string; runs: number; binds: number }>()
  for (const line of out.split('\n').map(l => l.trim()).filter(l => l.split('|').length === 6)) {
    const [k, d, s, st, r, b] = line.split('|')
    m.set(`${k}|${d}|${s}`, { sqlstate: st, runs: Number(r), binds: Number(b) })
  }
  expect(m.size, 'every kind × placement must have been attempted').toBe(kinds.length * ALL_PLACEMENTS.length)
  return m
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
    if (m.endsWith('20260926120000_autonomy_bind_atomic.sql')) {
      // HISTORY: a workflow-bound run created BEFORE 3B1B, with no provenance —
      // exactly what production holds today. The migration must leave it alone.
      query(dsn, `insert into public.runs (id, project_id, status, kind, input, context, max_attempts, policy_class,
        workflow_instance_id, workflow_def_hash, workflow_from_state, action_kind, action_class,
        target_version_hash, authorization_id, idempotency_key, attempt_group, authorized_at)
        values ('${HISTORICAL_RUN}', '${P_A}', 'done', 'workflow.action:probe_anonymous_protected_access', '{}', '{}',
          5, 'non_destructive', '${INST_A}', '${DEF_HASH_A}', 'probe', 'probe_anonymous_protected_access',
          'READ_ONLY', '${hex64('historical-t')}', NULL, '${hex64('historical-k')}', gen_random_uuid(), now())`)
    }
    execFileSync(PSQL!, psqlArgs(dsn, ['-f', m]), { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
  }
  // An EFFECTIVE licence for instance A exists, through the real writer — so
  // every licensed refusal below is a refusal DESPITE available authority.
  query(dsn, licenceAct(LIC_A, 'LICENSE_ISSUED', 0))
  // One instance at EVERY canonical registry placement, so each exempt kind can
  // be tried at its own placement and at every placement that is not its own.
  for (const p of ALL_PLACEMENTS) {
    query(dsn, `insert into public.workflow_instances (id, project_id, def_key, def_hash, current_state)
      select gen_random_uuid(), '${P_A}', '${p.def_key}', '${DEF_HASH_A}', '${p.state}'
      where not exists (select 1 from public.workflow_instances where def_key = '${p.def_key}' and current_state = '${p.state}')`)
  }
  // TEST-ONLY fault injection: make the bind-row INSERT fail for one sentinel
  // target hash, AFTER the run INSERT inside the RPC has already succeeded.
  query(dsn, `create function public.zz_fail_bind_row() returns trigger language plpgsql as $f$
    begin
      if exists (select 1 from public.runs where id = new.run_id and target_version_hash = '${TRACE_FAULT_HASH}') then
        raise exception 'injected bind-row failure' using errcode = 'XX001';
      end if;
      return new;
    end $f$;
    create trigger zz_fail_bind_row before insert on public.run_autonomy_decisions
      for each row execute function public.zz_fail_bind_row();`)
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
  it('a LICENSED bind is refused structurally — at its own canonical placement, with an effective licence present', () => {
    expect(one(dsn, `select count(*) from public.atlas_autonomy_license_events where license_id = '${LIC_A}'`)).toBe('1')
    expectRefusedAndNothingWritten(licensedArgs(), '22023')
  })

  it('the RPC has NO classification parameter a caller could forge', () => {
    // The spoof shape of the earlier revision — p_action_class / provenance —
    // does not exist any more: PostgreSQL refuses the call itself.
    for (const forged of [{ p_action_class: 'READ_ONLY' }, { p_policy_mode: 'license_exempt_observation' },
      { p_reason: 'exempt_observation' }, { p_required_level: 'L0' }, { p_max_attempts: 5 },
      { p_authorization_id: null }, { p_policy_class: 'non_destructive' }] as Args[]) {
      expectRefusedAndNothingWritten(exemptArgs(forged), '42883')
    }
  })
})

// ── 2b · Direct service-role SPOOFS (reproduced against the earlier revision) ─

d('licence-exempt BY CONSTRUCTION — direct service-role spoofs bind nothing', () => {
  it('SPOOF 1: a dangerous non-exempt kind (upload_protected_artifacts) at its own placement → refused, 0/0', () => {
    const inst = instanceAt('familje-stunden.monthly-release', 'protected_upload')
    expectRefusedAndNothingWritten(exemptArgs({ p_workflow_instance_id: inst,
      p_workflow_from_state: 'protected_upload', p_action_kind: 'upload_protected_artifacts' }), '22023')
  })

  it('SPOOF 2: an unknown / invented kind → refused, 0/0', () => {
    for (const kind of ['totally_invented_kind', 'observe_anything', 'PROBE_ANONYMOUS_PROTECTED_ACCESS', '']) {
      expectRefusedAndNothingWritten(exemptArgs({ p_action_kind: kind }), '22023')
    }
  })

  it('SPOOF 3: a real exempt kind in a definition/state it is not placed in → refused, 0/0', () => {
    const inst = instanceAt('familje-stunden.monthly-release', 'protected_upload')
    expectRefusedAndNothingWritten(exemptArgs({ p_workflow_instance_id: inst,
      p_workflow_from_state: 'protected_upload', p_action_kind: 'observe_vercel_production_ready' }), '22023')
  })

  it('every non-exempt registered kind (and an invented one) is refused at EVERY placement, including its own — 0/0 each', () => {
    const nonExempt = [...Object.keys(ACTION_REGISTRY)
      .filter(k => !(LICENCE_EXEMPT_OBSERVATION_KINDS as readonly string[]).includes(k)), 'totally_invented_kind']
    expect(nonExempt.length).toBeGreaterThan(1)
    for (const [cell, r] of bindMatrix(nonExempt)) {
      expect(r.sqlstate, cell).toBe('22023')
      expect([r.runs, r.binds], cell).toEqual([0, 0])
    }
  })

  it('every reviewed exempt kind binds at each of its canonical placements — and NOWHERE else', () => {
    const m = bindMatrix(LICENCE_EXEMPT_OBSERVATION_KINDS)
    for (const kind of LICENCE_EXEMPT_OBSERVATION_KINDS) {
      for (const p of ALL_PLACEMENTS) {
        const cell = `${kind}|${p.def_key}|${p.state}`
        const placed = EXEMPT_PLACEMENTS.some(e => e.kind === kind && e.defKey === p.def_key && e.state === p.state)
        const r = m.get(cell)!
        if (placed) {
          expect(r.sqlstate, cell).toBe('')
          expect([r.runs, r.binds], `${cell}: run + bind row together`).toEqual([1, 1])
        } else {
          expect(r.sqlstate, cell).toBe('22023')
          expect([r.runs, r.binds], cell).toEqual([0, 0])
        }
      }
    }
  })

  it('a bound exempt run carries the FIXED READ_ONLY values and the bare exempt row', () => {
    const inst = instanceAt('familje-stunden.monthly-release', 'frontend_deploy')
    const a = exemptArgs({ p_workflow_instance_id: inst, p_workflow_from_state: 'frontend_deploy',
      p_action_kind: 'observe_vercel_production_ready' })
    expect(bind(a)).toBe('')
    expect(one(dsn, `select action_class, policy_class, max_attempts, authorization_id is null, workflow_from_state
      from public.runs where idempotency_key = '${a.p_idempotency_key}'`)).toBe('READ_ONLY|non_destructive|5|t|frontend_deploy')
    expect(bindRowFor(a.p_idempotency_key)).toBe(BARE_EXEMPT_ROW)
  })

  it('the set of kinds the DATABASE will bind is never wider than the reviewed TypeScript exempt set', () => {
    const all = [...Object.keys(ACTION_REGISTRY), 'totally_invented_kind']
    const admitted = new Set([...bindMatrix(all)].filter(([, r]) => r.sqlstate === '').map(([c]) => c.split('|')[0]))
    expect([...admitted].sort()).toEqual([...LICENCE_EXEMPT_OBSERVATION_KINDS].sort())
    // …and per placement, exactly the canonical exempt placements.
    const cells = new Set([...bindMatrix(all)].filter(([, r]) => r.sqlstate === '').map(([c]) => c))
    expect([...cells].sort()).toEqual(EXEMPT_PLACEMENTS.map(e => `${e.kind}|${e.defKey}|${e.state}`).sort())
  })

  it('a stale from_state is refused before anything is written', () => {
    expectRefusedAndNothingWritten(exemptArgs({ p_workflow_from_state: 'some_other_state' }), '22023')
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

  it('ActionKind: one kind parameter feeds both the run and the placement proof — a kind placed elsewhere is refused', () => {
    // compute_release_instant is exempt, but placed at familje-stunden/planning, not omnira.probe-validation/probe.
    expectRefusedAndNothingWritten(exemptArgs({ p_action_kind: 'compute_release_instant' }), '22023')
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
    // Every RPC precheck passes and the run INSERT succeeds; a TEST-ONLY trigger
    // then fails the bind-row INSERT (XX001). The run must not survive.
    const a = exemptArgs({ p_target_version_hash: TRACE_FAULT_HASH })
    const before = counts()
    expect(bind(a)).toBe('XX001')
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

// ── 6b · STRUCTURAL: a NEW bound run commits only WITH its bind provenance ────

d('structural invariant — a new workflow-bound run cannot commit without its bind provenance', () => {
  /** A fully valid READ_ONLY workflow binding, written DIRECTLY (bypassing the RPC). */
  const boundInsert = (seed: string, projectId = P_A, instanceId = INST_A) =>
    `insert into public.runs (project_id, status, kind, input, context, max_attempts, policy_class,
      workflow_instance_id, workflow_def_hash, workflow_from_state, action_kind, action_class,
      target_version_hash, authorization_id, idempotency_key, attempt_group, authorized_at)
     values ('${projectId}', 'pending', 'workflow.action:probe_anonymous_protected_access', '{}', '{}', 5,
      'non_destructive', '${instanceId}', '${DEF_HASH_A}', 'probe', 'probe_anonymous_protected_access',
      'READ_ONLY', '${hex64(`direct-t-${seed}`)}', NULL, '${hex64(`direct-k-${seed}-${DB_NAME}`)}',
      gen_random_uuid(), now())`
  const unboundInsert = (projectId = P_A) =>
    `insert into public.runs (project_id, status, kind, input, context) values ('${projectId}', 'pending', 'legacy.kind', '{}', '{}')`
  const asOwner = `set role authenticated; set request.jwt.claim.sub = '${OWNER_A}';`
  const boundRuns = () => Number(one(dsn, `select count(*) from public.runs where workflow_instance_id is not null`))
  const unboundRuns = () => Number(one(dsn, `select count(*) from public.runs where workflow_instance_id is null`))

  it('control: the direct bound row is otherwise VALID — accepted inside the transaction, refused at COMMIT', () => {
    // Inside the transaction the INSERT succeeds (binding guard, RLS and every
    // CHECK pass) and a later statement still runs; the refusal is the DEFERRED
    // provenance check at COMMIT.
    let stdout = ''
    let stderr = ''
    try {
      stdout = execFileSync(PSQL!, psqlArgs(dsn, ['-t', '-A', '-c',
        `set role service_role; begin; ${boundInsert('ctl')}; select 'row-accepted-in-txn'; commit;`]),
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e) {
      stdout = String((e as { stdout?: string }).stdout ?? '')
      stderr = String((e as { stderr?: string }).stderr ?? '')
    }
    expect(stdout).toContain('row-accepted-in-txn')
    expect(sqlstateIn(stderr)).toBe('23000')
    expect(stderr).toMatch(/no bind autonomy provenance/)
  })

  it('a direct service_role bound INSERT cannot commit — 0 rows', () => {
    const before = boundRuns()
    expect(sqlstateOf(dsn, `set role service_role; ${boundInsert('svc')}`)).toBe('23000')
    expect(boundRuns()).toBe(before)
  })

  it('service_role cannot rescue it by writing the bind row itself — the ledger is not writable', () => {
    const before = { b: boundRuns(), c: counts() }
    expect(sqlstateOf(dsn, `set role service_role; begin; ${boundInsert('rescue')};
      insert into public.run_autonomy_decisions (run_id, boundary, policy_mode, policy_reason, reason, required_level)
        select id, 'bind', 'license_exempt_observation', 'canonical_read_only_observation', 'exempt_observation', 'L0'
        from public.runs where idempotency_key = '${hex64(`direct-k-rescue-${DB_NAME}`)}';
      commit;`)).toBe('42501')
    expect(boundRuns()).toBe(before.b)
    expect(counts()).toEqual(before.c)
  })

  it('an authenticated PROJECT OWNER bound INSERT (allowed by runs_owner RLS) cannot commit — 0 rows', () => {
    const before = boundRuns()
    expect(sqlstateOf(dsn, `${asOwner} ${boundInsert('owner')}`)).toBe('23000')
    expect(boundRuns()).toBe(before)
  })

  it('control: RLS still refuses a non-owner — the trigger adds a veto, it replaces nothing', () => {
    expect(sqlstateOf(dsn, `${asOwner} ${unboundInsert(P_B)}`)).toBe('42501')
  })

  it('ordinary UNBOUND / legacy run inserts are unaffected — service_role and authenticated owner both commit', () => {
    const before = unboundRuns()
    expect(sqlstateOf(dsn, `set role service_role; ${unboundInsert()}`)).toBe('')
    expect(sqlstateOf(dsn, `${asOwner} ${unboundInsert()}`)).toBe('')
    expect(unboundRuns()).toBe(before + 2)
    // …and updating one is unaffected too (the trigger is INSERT-only).
    expect(sqlstateOf(dsn, `set role service_role; update public.runs set status = 'done'
      where workflow_instance_id is null and kind = 'legacy.kind'`)).toBe('')
  })

  it('an unbound run cannot be turned into a bound one by UPDATE (binding columns are immutable)', () => {
    query(dsn, unboundInsert())
    expect(sqlstateOf(dsn, `set role service_role; update public.runs set workflow_instance_id = '${INST_A}'
      where id = (select id from public.runs where workflow_instance_id is null limit 1)`)).toBe('23001')
  })

  it('HISTORY is untouched: the pre-3B1B bound run still exists, has NO fabricated provenance, and stays updatable', () => {
    expect(one(dsn, `select count(*) from public.runs where id = '${HISTORICAL_RUN}'`)).toBe('1')
    expect(one(dsn, `select count(*) from public.run_autonomy_decisions where run_id = '${HISTORICAL_RUN}'`)).toBe('0')
    expect(sqlstateOf(dsn, `set role service_role; update public.runs set status = 'cancelled' where id = '${HISTORICAL_RUN}'`)).toBe('')
    expect(one(dsn, `select count(*) from public.run_autonomy_decisions where run_id = '${HISTORICAL_RUN}'`)).toBe('0')
  })

  it('the sanctioned RPC still commits run + bind row atomically under the deferred check', () => {
    const a = exemptArgs()
    const before = counts()
    expect(bind(a)).toBe('')
    expect(counts()).toEqual({ runs: before.runs + 1, binds: before.binds + 1 })
  })

  it('forcing the check IMMEDIATE only makes it stricter: the RPC then fails and writes NOTHING', () => {
    const a = exemptArgs()
    const before = counts()
    expect(sqlstateOf(dsn, `set role service_role; begin; set constraints all immediate; ${callSql(a)} commit;`)).toBe('23000')
    expect(counts()).toEqual(before)
  })

  it('the check is trigger machinery: no role can execute it; it is a deferred constraint trigger', () => {
    const sig = 'public.runs_require_bind_provenance()'
    expect(one(dsn, `select has_function_privilege('anon', '${sig}', 'execute'),
      has_function_privilege('authenticated', '${sig}', 'execute'),
      has_function_privilege('service_role', '${sig}', 'execute')`)).toBe('f|f|f')
    expect(one(dsn, `select prosecdef, array_to_string(proconfig, ',') from pg_proc where proname = 'runs_require_bind_provenance'`))
      .toBe('t|search_path=""')
    expect(one(dsn, `select tgdeferrable, tginitdeferred, tgconstraint <> 0 from pg_trigger
      where tgname = 'runs_require_bind_provenance_trg'`)).toBe('t|t|t')
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
  const SIG = 'public.bind_workflow_action_run(uuid, uuid, text, text, text, text, text, uuid)'

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
