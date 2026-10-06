/**
 * Phase 3B1B2 · M4-B — the single-statement LICENSED bind, on REAL PostgreSQL 17.
 *
 * The concurrency/refusal matrix of the M4 specification (§18 A–R), against the
 * real migration chain (M0 … M3, M4-A, M4-B) and real concurrent sessions:
 *
 *   A  valid licence + current Decision + healthy Survival → one run + V1 provenance
 *   B  no licence → refuse, no run          C/M licence below L3 → refuse (Survival cannot raise it)
 *   D  revoked / expired licence → refuse   E  Decision reversed before the bind → refuse
 *   F  Decision writer vs an open bind → serialized both ways, never a stale accept
 *   G  licence writer vs an open bind → serialized both ways, never a stale accept
 *   H  Survival input commits before the fence → SV004
 *   I  Survival writer after the fence → waits until the bind commits
 *   J  authority deadline passes before COMMIT → LB003 at commit
 *   K  same-transaction Survival mutation → SV006
 *   L  Survival below the V1 margin → refuse even with an L6 licence
 *   N  malformed / mismatched input → fail closed
 *   O  concurrent binds on one instance → serialized; one identity wins
 *   P  storm of binds + Decision + licence + Survival writers → zero 40P01
 *   Q  rollback at any point → no run and no provenance
 *   R  the exempt bind is unchanged
 * plus: privileges, the V1 provenance matrix, and no Decision/licence write after a bind.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { computeExecutionAuthorizationTarget } from '@/lib/workflows/effect/execution-authorization'

function findPsql(): string | null {
  for (const c of [process.env.ATLAS_SQL_TEST_PSQL, 'psql', '/usr/bin/psql'].filter(Boolean) as string[]) {
    try { execFileSync(c, ['--version'], { stdio: 'pipe' }); return c } catch { /* next */ }
  }
  return null
}
const PSQL = findPsql()
const ADMIN_URL = process.env.ATLAS_SQL_TEST_URL ?? `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/postgres`
const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'
const MIGRATIONS = join(process.cwd(), 'supabase/migrations')
/** Apply order. The bind/trace chain sits where it sits in production: after 2C, before M1. */
const CHAIN = [
  '20260602_cost_events.sql', '20260602_project_budgets.sql', '20260819_atlas_decision_ledger.sql',
  '20260819_atlas_authorizations.sql',
  '20260830_spend_budget_gate.sql', '20260831_budget_scopes.sql', '20260910120000_cost_ledger_rls_isolation.sql',
  '20261001160000_m0_durable_spend_settlement.sql', '20260923120000_survival_state_events.sql',
  '20260924120000_survival_funding_phase2b.sql', '20260924180000_autonomy_license_phase2c.sql',
  '20260830_workflow_action_binding.sql', '20260830_readonly_action_authorization.sql',
  '20260925120000_autonomy_trace_decisions.sql', '20260926120000_autonomy_bind_atomic.sql',
  '20261002140000_autonomy_authority_serialization.sql', '20261002190000_survival_input_epoch.sql',
  '20261003120000_survival_commit_fence.sql',
  '20261004090000_survival_threshold_status_canonical.sql', '20261004100000_m4a_licensed_authority_substrate.sql',
  '20261004110000_m4b_licensed_bind.sql',
]

function dsnFor(database: string, app?: string): string {
  const url = new URL(ADMIN_URL); url.pathname = `/${database}`
  if (app) url.searchParams.set('application_name', app)
  return url.toString()
}
function run(dsn: string, args: string[]): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 300_000 })
}
function query(dsn: string, sql: string): string[][] {
  const out = execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-F', '|', '-d', dsn, '-c', sql],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000 })
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|'))
}
const one = (dsn: string, sql: string) => (query(dsn, sql)[0] ?? []).join('|')
/** SQLSTATE (and message) of a failing batch, or '' on success. */
function failure(dsn: string, sql: string): { state: string; message: string } {
  try { run(dsn, ['-v', 'VERBOSITY=verbose', '-c', sql]); return { state: '', message: '' } }
  catch (e) {
    const err = String((e as { stderr?: unknown }).stderr)
    return { state: /ERROR:\s+([0-9A-Z]{5}):/.exec(err)?.[1] ?? '?', message: err }
  }
}
function reachable(): boolean {
  if (!PSQL) return false
  try { execFileSync(PSQL, ['-X', '-q', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 }); return true }
  catch { return false }
}
const AVAILABLE = reachable()
const DB = `omnira_m4b_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

interface Outcome { ok: boolean; out: string; stderr: string; state: string; endedAt: number }
function session(app: string, statements: string[]): Promise<Outcome> {
  const args = ['-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-X', '-q', '-t', '-A', '-F', '|',
    '-d', dsnFor(DB, app), '-c', `set lock_timeout = '30s'`, '-c', `set deadlock_timeout = '200ms'`,
    ...statements.flatMap(s => ['-c', s])]
  return new Promise(resolve => {
    const child = spawn(PSQL!, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', stderr = ''
    child.stdout.on('data', c => { out += String(c) })
    child.stderr.on('data', c => { stderr += String(c) })
    child.on('close', code => resolve({ ok: code === 0, out: out.trim(), stderr,
      state: /ERROR:\s+([0-9A-Z]{5}):/.exec(stderr)?.[1] ?? '', endedAt: Date.now() }))
  })
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
async function sleeping(app: string, timeoutMs = 30_000): Promise<boolean> {
  for (const until = Date.now() + timeoutMs; Date.now() < until; await sleep(50)) {
    if (one(dsnFor(DB), `select count(*) from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep'`) === '1') return true
  }
  return false
}
async function waitingBehind(app: string, timeoutMs = 30_000): Promise<string[]> {
  for (const until = Date.now() + timeoutMs; Date.now() < until; await sleep(50)) {
    const names = one(dsnFor(DB), `select coalesce(string_agg(a.application_name, ',' order by a.application_name), '')
      from pg_stat_activity w cross join lateral unnest(pg_blocking_pids(w.pid)) b(pid) join pg_stat_activity a on a.pid = b.pid
      where w.application_name = '${app}' and w.wait_event_type = 'Lock'`)
    if (names) return names.split(',')
  }
  return []
}

const P0 = 'a1111111-1111-4111-8111-111111111111'
const P1 = 'a2222222-2222-4222-8222-222222222222'
const PRINCIPAL = '11111111-1111-4111-8111-111111111111'
const ACTOR = `user:${PRINCIPAL}`
const V1_DEF = 'omnira.execution-proof'
const HASH = 'e'.repeat(64)
const FP = 'c2f8cc24bc5cca84100be20283148f970393a4385e89b1c3d0617822ccb9875a'
let seq = 1
const id = (prefix: string) => `${prefix}-0000-4000-8000-${String(seq++).padStart(12, '0')}`
const hex64 = (seed: string) => createHash('sha256').update(`${seed}:${DB}`).digest('hex')

const FIXTURE = `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role')  then begin create role service_role;  exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then begin create role anon;          exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then begin create role authenticated; exception when duplicate_object or unique_violation then null; end; end if;
end $$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $u$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $u$;
grant usage on schema auth to anon, authenticated, service_role;
create table public.projects (id uuid primary key default gen_random_uuid(), owner_id uuid, name text, slug text unique not null,
  color text, settings jsonb, created_at timestamptz not null default now(), atlas_mode text,
  execution_paused boolean not null default false, paused_at timestamptz, paused_reason text);
create table public.platform_config (id int primary key, automation_paused boolean not null default false,
  max_daily_renders int not null default 4, max_retry_attempts int not null default 3,
  paused_at timestamptz, paused_reason text, updated_at timestamptz not null default now());
insert into public.platform_config (id) values (1);
create table public.infra_costs (id uuid primary key default gen_random_uuid());
create table public.revenue_snapshots (id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null, snapshot_date date not null,
  captured_at timestamptz not null default now(), active_subscribers int, new_subscribers int, trialing int,
  churned_this_month int, mrr_sek numeric, revenue_month_sek numeric, currency text, raw jsonb, unique (project_id, snapshot_date));
create table public.workflow_instances (id uuid primary key, def_id uuid, def_key text not null, def_version int not null default 1,
  def_hash text not null, project_id uuid not null references public.projects(id), instance_key text,
  current_state text not null default 'effect', status text not null default 'active', wake_at timestamptz,
  last_tick_at timestamptz, last_tick_outcome text, created_at timestamptz not null default now(), closed_at timestamptz);
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  status text not null default 'pending',
  kind text, input jsonb, context jsonb,
  max_attempts integer not null default 3, attempts integer not null default 0,
  policy_class text, claim_id uuid, claimed_at timestamptz, started_at timestamptz,
  lease_until timestamptz, cancel_requested boolean not null default false,
  created_at timestamptz not null default now());
insert into public.projects (id, slug, owner_id) values ('${P0}','p0','${PRINCIPAL}'), ('${P1}','p1','${PRINCIPAL}');
`
/** Healthy, ample budgets for the whole platform; funding stays UNDECLARED (CONSERVE floor, >= L3). */
const HEALTHY = `insert into public.project_budgets (project_id, monthly_sek, daily_sek, weekly_sek)
  values ('${P0}', 100000, 10000, 50000), ('${P1}', 100000, 10000, 50000)`

interface Decision { decision: string; proposal: string; approval: string }
/** A two-act approved decision (proposed → approved) — the V1 Decision subset. */
function approvedDecision(project = P0): Decision {
  const decision = id('d0000000'), proposal = id('d1000000'), approval = id('d2000000')
  run(dsn, ['-c', `insert into public.atlas_decision_ledger (record_id, decision_id, record_type, occurred_at, project_id, principal_id, title, statement, materiality, version, lifecycle_generation)
      values ('${proposal}', '${decision}', 'proposed', now() - interval '2 days', '${project}', '${PRINCIPAL}', 't', 's', '["autonomy"]', 1, 0);
    insert into public.atlas_decision_ledger (record_id, decision_id, record_type, occurred_at, project_id, principal_id, title, statement, materiality, authority, effective_at, version, lifecycle_generation)
      values ('${approval}', '${decision}', 'approved', now() - interval '1 day', '${project}', '${PRINCIPAL}', 't', 's', '["autonomy"]', '{"authorizationId":"a1"}', now() - interval '1 day', 1, 1);`])
  return { decision, proposal, approval }
}
function instance(project = P0, state = 'effect', defKey = V1_DEF): string {
  const inst = id('99999999')
  run(dsn, ['-c', `insert into public.workflow_instances (id, def_key, def_hash, project_id, current_state) values ('${inst}', '${defKey}', '${HASH}', '${project}', '${state}')`])
  return inst
}
const issueSql = (inst: string, d: Decision, o: { level?: string; expires?: string; licence?: string } = {}) =>
  `select license_generation from public.autonomy_license_append('${o.licence ?? id('1ccccccc')}', 0, 'LICENSE_ISSUED', '${P0}', '${inst}', '${V1_DEF}', '${HASH}', '${o.level ?? 'L3'}',
    array['proof_governed_effect'], '${FP}', '${d.decision}', 1, '${d.approval}', now() - interval '1 hour', ${o.expires ?? `now() + interval '30 days'`}, null, null, '${ACTOR}')`
/** A licensed instance: approved Decision + one ISSUED licence. */
function licensed(o: { level?: string; expires?: string } = {}): { inst: string; d: Decision; licence: string } {
  const inst = instance(), d = approvedDecision(), licence = id('1ccccccc')
  run(dsn, ['-c', issueSql(inst, d, { ...o, licence })])
  return { inst, d, licence }
}
const revokeSql = (inst: string, d: Decision, licence: string) =>
  `select license_generation from public.autonomy_license_append('${licence}', 1, 'LICENSE_REVOKED', '${P0}', '${inst}', '${V1_DEF}', '${HASH}', 'L3',
    array['proof_governed_effect'], '${FP}', '${d.decision}', 1, '${d.approval}',
    (select effective_at from public.atlas_autonomy_license_events where license_id = '${licence}' and license_generation = 0),
    (select expires_at from public.atlas_autonomy_license_events where license_id = '${licence}' and license_generation = 0),
    null, 'stop', '${ACTOR}')`
const reverseSql = (d: Decision) =>
  `select record_type from public.atlas_decision_ledger_append('${id('d3000000')}', '${d.decision}', 'reversed', clock_timestamp(), '${P0}', '${PRINCIPAL}',
    't', 's', null, null, '["autonomy"]', null, null, null, null, null, null, null, null, null, null, null, 1, null, null, 'undo', 2)`
/** A human `workflow.action.execute` authorization chain, written as the canonical store writes it. */
interface AuthOpts {
  target: string; group: string; project?: string; inst: string; kind?: string; state?: string; cls?: string
  defVersion?: number; defHash?: string; defKey?: string; actionKind?: string; targetType?: string
  events?: string[]; grantedAgo?: string; expires?: string; requestAfterGrant?: boolean
}
function authorize(o: AuthOpts): string {
  const auth = id('a0000000')
  const t = computeExecutionAuthorizationTarget({
    instanceId: o.inst, defKey: o.defKey ?? V1_DEF, defVersion: o.defVersion ?? 1, defHash: o.defHash ?? HASH,
    state: o.state ?? 'effect', actionKind: o.kind ?? 'proof_governed_effect', actionClass: (o.cls ?? 'FINANCIAL') as never,
    targetVersionHash: o.target, attemptGroup: o.group,
  })
  const row = (type: string, at: string, extra = '') =>
    `insert into public.atlas_authorizations (event_id, authorization_id, event_type, occurred_at, project_id, principal_id,
       action_kind, target_type, target_id, target_version_hash, expires_at, superseded_by)
     values ('${id('e0000000')}', '${auth}', '${type}', ${at}, '${o.project ?? P0}', '${PRINCIPAL}',
       '${o.actionKind ?? 'workflow.action.execute'}', '${o.targetType ?? t.targetType}', '${t.targetId}', '${t.versionHash}',
       ${type.startsWith('granted') ? (o.expires ?? `now() + interval '7 days'`) : 'null'}, ${extra || 'null'});`
  const granted = `now() - interval '${o.grantedAgo ?? '1 hour'}'`
  const requested = o.requestAfterGrant ? `now() - interval '1 minute'` : `now() - interval '2 hours'`
  const sql = [row('requested', requested)]
  for (const e of o.events ?? ['granted']) {
    sql.push(row(e, e === 'granted' || e === 'granted_with_conditions' || e === 'denied' ? granted : `now() - interval '30 minutes'`,
      e === 'superseded' ? `'${id('a1000000')}'` : ''))
  }
  run(dsn, ['-c', sql.join('\n')])
  return auth
}
/** The bind exactly as service_role calls it. Unless `auth` is given, a matching human grant is created. */
function bindSql(inst: string, o: { kind?: string; state?: string; hash?: string; key?: string; auth?: string | null;
  target?: string; group?: string } = {}): string {
  const key = o.key ?? hex64(`k${seq++}`)
  const target = o.target ?? hex64(`t${seq++}`)
  const group = o.group ?? id('a9000000')
  const auth = o.auth === undefined ? authorize({ inst, target, group }) : o.auth
  return `select bound_run_id || ',' || bind_event_id from public.bind_licensed_workflow_action_run_v1(
    '${inst}', '${o.kind ?? 'proof_governed_effect'}', '${o.hash ?? HASH}', '${o.state ?? 'effect'}',
    '${target}', '${key}', '${group}', ${auth === null ? 'null' : `'${auth}'`})`
}
const asService = (sql: string) => `set role service_role; ${sql}`
const runsFor = (inst: string) => Number(one(dsn, `select count(*) from public.runs where workflow_instance_id = '${inst}'`))
const provenanceFor = (inst: string) => Number(one(dsn, `select count(*) from public.run_autonomy_decisions d join public.runs r on r.id = d.run_id where r.workflow_instance_id = '${inst}'`))

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('M4-B single-statement licensed bind (real PostgreSQL)', { timeout: 600_000 }, () => {
  beforeAll(() => {
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${DB}`])
    dsn = dsnFor(DB)
    run(dsn, ['-c', FIXTURE])
    for (const m of CHAIN) run(dsn, ['-f', join(MIGRATIONS, m)])
    run(dsn, ['-c', HEALTHY])
  }, 900_000)

  afterAll(() => {
    if (!AVAILABLE) return
    try { run(ADMIN_URL, ['-c', `drop database if exists ${DB} with (force)`]) } catch { /* best effort */ }
  })

  it('PostgreSQL is reachable — this suite must never pass by skipping in CI', () => {
    if (!AVAILABLE && SQL_REQUIRED) throw new Error('SQL proof is REQUIRED but no Postgres was reachable.')
    expect(one(dsn, 'show max_prepared_transactions')).toBe('0')
  })

  // ── A ─────────────────────────────────────────────────────────────────────
  it('A. licence + current Decision + healthy Survival → exactly one run and its V1 conservative-proof provenance', () => {
    const { inst, d, licence } = licensed()
    const out = one(dsn, asService(bindSql(inst)))
    expect(out).toMatch(/^[0-9a-f-]{36},[0-9a-f-]{36}$/)
    const [runId] = out.split(',')
    expect(one(dsn, `select project_id || '|' || action_class || '|' || policy_class || '|' || max_attempts || '|' || workflow_from_state
      from public.runs where id = '${runId}'`)).toBe(`${P0}|FINANCIAL|approval_required|1|effect`)
    expect(one(dsn, `select boundary || '|' || policy_mode || '|' || reason || '|' || required_level || '|' || admission_basis
      || '|' || license_id || '|' || license_generation || '|' || decision_id || '|' || decision_record_id || '|' || decision_head_generation
      || '|' || decision_proof || '|' || licence_proof || '|' || survival_proof || '|' || proven_min_level
      || '|' || array_length(survival_epoch_vector, 1) || '|' || (authority_valid_until > survival_anchor) || '|' || (survival_valid_until > survival_anchor)
      from public.run_autonomy_decisions where run_id = '${runId}'`))
      .toBe(`bind|licensed|allowed|L3|db_conservative_proof_v1|${licence}|0|${d.decision}|${d.approval}|1`
        + `|v1_two_act_approval_in_force|v1_single_issued_licence_in_force|v1_headroom_margin_funding_undeclared|L3|8|true|true`)
    // Nothing claimed that the database did not derive.
    expect(one(dsn, `select coalesce(survival_state,'∅') || coalesce(survival_ceiling,'∅') || coalesce(effective_level,'∅')
      || coalesce(license_reason,'∅') || coalesce(bounded_by,'∅') || coalesce(survival_as_of::text,'∅') || coalesce(license_resolved_at::text,'∅')
      from public.run_autonomy_decisions where run_id = '${runId}'`)).toBe('∅∅∅∅∅∅∅')
  })

  // ── B / C / M / D / E / L / N ─────────────────────────────────────────────
  it('B. no licence → LB010 no_license, no run, no provenance', () => {
    const inst = instance()
    const f = failure(dsn, asService(bindSql(inst)))
    expect(f.state).toBe('LB010')
    expect(f.message).toMatch(/no_license/)
    expect(runsFor(inst)).toBe(0)
  })

  it('C/M. a licence below the required L3 is refused — healthy Survival cannot raise it', () => {
    const { inst } = licensed({ level: 'L2' })
    const f = failure(dsn, asService(bindSql(inst)))
    expect([f.state, /licensed_level_below_required/.test(f.message)]).toEqual(['LB010', true])
    expect(runsFor(inst)).toBe(0)
  })

  it('D. a revoked licence is refused (history outside the V1 subset)', () => {
    const { inst, d, licence } = licensed()
    run(dsn, ['-c', revokeSql(inst, d, licence)])
    const f = failure(dsn, asService(bindSql(inst)))
    expect([f.state, /licence_history_outside_v1_subset/.test(f.message)]).toEqual(['LB010', true])
    expect(runsFor(inst)).toBe(0)
  })

  it('D. an expired licence is refused', async () => {
    const { inst } = licensed({ expires: `now() + interval '1500 milliseconds'` })
    await sleep(2_000)
    const f = failure(dsn, asService(bindSql(inst)))
    expect([f.state, /licence_expired/.test(f.message)]).toEqual(['LB010', true])
    expect(runsFor(inst)).toBe(0)
  })

  it('E. the Decision reversed after issuance → CURRENT truth wins: refused', () => {
    const { inst, d } = licensed()
    run(dsn, ['-c', reverseSql(d)])
    const f = failure(dsn, asService(bindSql(inst)))
    expect([f.state, /decision:/.test(f.message)]).toEqual(['LB010', true])
    expect(runsFor(inst)).toBe(0)
  })

  it('L. Survival below the V1 margin → refused even with an L6 licence', () => {
    const { inst } = licensed({ level: 'L6' })
    const cost = id('c0000000')
    run(dsn, ['-c', `insert into public.cost_events (id, project_id, provider, cost_sek, cost_usd, created_at) values ('${cost}', '${P1}', 'anthropic', 9500, 0, now())`])
    try {
      const f = failure(dsn, asService(bindSql(inst)))
      expect([f.state, /headroom_below_v1_margin/.test(f.message)]).toEqual(['LB010', true])
      expect(runsFor(inst)).toBe(0)
    } finally {
      run(dsn, ['-c', `delete from public.cost_events where id = '${cost}'`])
    }
  })

  it('N. malformed or mismatched input fails closed', () => {
    const { inst } = licensed()
    expect(failure(dsn, asService(bindSql(inst, { auth: null }))).state).toBe('22023')
    expect(failure(dsn, asService(bindSql(inst, { hash: 'f'.repeat(64) }))).state).toBe('22023')
    expect(failure(dsn, asService(bindSql(inst, { state: 'planning' }))).state).toBe('22023')
    expect(failure(dsn, asService(bindSql(inst, { kind: 'generate_monthly_story' }))).state).toBe('LB010')
    expect(failure(dsn, asService(bindSql(inst, { kind: 'probe_anonymous_protected_access' }))).state).toBe('LB010')
    expect(failure(dsn, asService(bindSql(id('99999999')))).state).toBe('P0002')
    // A FULLY LICENSED instance of the V1 definition, moved to a state that is not
    // the placement: only the placement check can refuse it (its licence is valid).
    const { inst: elsewhere } = licensed()
    run(dsn, ['-c', `update public.workflow_instances set current_state = 'proof' where id = '${elsewhere}'`])
    const f = failure(dsn, asService(bindSql(elsewhere, { state: 'proof' })))
    expect([f.state, /outside the M4 V1 supported set/.test(f.message)]).toEqual(['LB010', true])
    expect(runsFor(inst) + runsFor(elsewhere)).toBe(0)
  })

  // ── F / G: serialization with the authority writers ───────────────────────
  it('F1. a Decision reversal racing an OPEN bind waits for it, then commits after it — the bind committed on valid authority', async () => {
    const { inst, d } = licensed()
    const bind = session('m4b_f1_bind', ['begin', asService(bindSql(inst)), 'select pg_sleep(2)', 'commit'])
    expect(await sleeping('m4b_f1_bind')).toBe(true)
    const writer = session('m4b_f1_dec', [reverseSql(d)])
    expect(await waitingBehind('m4b_f1_dec')).toContain('m4b_f1_bind')
    const [b, w] = await Promise.all([bind, writer])
    expect([b.ok, w.ok]).toEqual([true, true])
    expect(w.endedAt).toBeGreaterThanOrEqual(b.endedAt)
    expect(runsFor(inst)).toBe(1)
  })

  it('F2. a bind racing an OPEN Decision reversal waits for it, then sees the CURRENT head and refuses', async () => {
    const { inst, d } = licensed()
    const writer = session('m4b_f2_dec', ['begin', reverseSql(d), 'select pg_sleep(2)', 'commit'])
    expect(await sleeping('m4b_f2_dec')).toBe(true)
    const bind = session('m4b_f2_bind', [asService(bindSql(inst))])
    expect(await waitingBehind('m4b_f2_bind')).toContain('m4b_f2_dec')
    const [w, b] = await Promise.all([writer, bind])
    expect(w.ok).toBe(true)
    expect([b.ok, b.state]).toEqual([false, 'LB010'])
    expect(runsFor(inst)).toBe(0)
  })

  it('G1. a licence revocation racing an OPEN bind waits for it (instance lock), then commits after it', async () => {
    const { inst, d, licence } = licensed()
    const bind = session('m4b_g1_bind', ['begin', asService(bindSql(inst)), 'select pg_sleep(2)', 'commit'])
    expect(await sleeping('m4b_g1_bind')).toBe(true)
    const writer = session('m4b_g1_lic', [revokeSql(inst, d, licence)])
    expect(await waitingBehind('m4b_g1_lic')).toContain('m4b_g1_bind')
    const [b, w] = await Promise.all([bind, writer])
    expect([b.ok, w.ok]).toEqual([true, true])
    expect(w.endedAt).toBeGreaterThanOrEqual(b.endedAt)
  })

  it('G2. a bind racing an OPEN licence revocation waits for it, then refuses on the CURRENT licence', async () => {
    const { inst, d, licence } = licensed()
    const writer = session('m4b_g2_lic', ['begin', revokeSql(inst, d, licence), 'select pg_sleep(2)', 'commit'])
    expect(await sleeping('m4b_g2_lic')).toBe(true)
    const bind = session('m4b_g2_bind', [asService(bindSql(inst))])
    expect(await waitingBehind('m4b_g2_bind')).toContain('m4b_g2_lic')
    const [w, b] = await Promise.all([writer, bind])
    expect(w.ok).toBe(true)
    expect([b.ok, b.state]).toEqual([false, 'LB010'])
    expect(runsFor(inst)).toBe(0)
  })

  it('G3. a licence ISSUED concurrently for the same instance cannot slip in: the bind waits and then refuses two events', async () => {
    const { inst, d } = licensed()
    const writer = session('m4b_g3_lic', ['begin', issueSql(inst, d), 'select pg_sleep(2)', 'commit'])
    expect(await sleeping('m4b_g3_lic')).toBe(true)
    const bind = session('m4b_g3_bind', [asService(bindSql(inst))])
    const [w, b] = await Promise.all([writer, bind])
    expect(w.ok).toBe(true)
    expect([b.ok, b.state]).toEqual([false, 'LB010'])
    expect(runsFor(inst)).toBe(0)
  })

  // ── H / I / K: Survival ───────────────────────────────────────────────────
  it('H. a Survival input committing between the anchor and the fence → SV004, nothing written', async () => {
    const { inst } = licensed()
    // Stall the bind AFTER it has read its anchor: a third session holds the instance row.
    const holder = session('m4b_h_hold', ['begin', `select 1 from public.workflow_instances where id = '${inst}' for update`,
      'select pg_sleep(2)', 'commit'])
    expect(await sleeping('m4b_h_hold')).toBe(true)
    const bind = session('m4b_h_bind', [asService(bindSql(inst))])
    expect(await waitingBehind('m4b_h_bind')).toContain('m4b_h_hold')
    // While the bind waits, a Survival input commits.
    run(dsn, ['-c', `insert into public.cost_events (project_id, provider, cost_sek, cost_usd, created_at) values ('${P1}', 'anthropic', 1, 0, now())`])
    const [h, b] = await Promise.all([holder, bind])
    expect(h.ok).toBe(true)
    expect([b.ok, b.state]).toEqual([false, 'SV004'])
    expect(runsFor(inst)).toBe(0)
  })

  it('I. a Survival writer after the fence waits until the bind commits', async () => {
    const { inst } = licensed()
    const bind = session('m4b_i_bind', ['begin', asService(bindSql(inst)), 'select pg_sleep(2)', 'commit'])
    expect(await sleeping('m4b_i_bind')).toBe(true)
    const writer = session('m4b_i_srv', [`insert into public.cost_events (project_id, provider, cost_sek, cost_usd, created_at) values ('${P1}', 'anthropic', 1, 0, now())`])
    expect(await waitingBehind('m4b_i_srv')).toContain('m4b_i_bind')
    const [b, w] = await Promise.all([bind, writer])
    expect([b.ok, w.ok]).toEqual([true, true])
    expect(w.endedAt).toBeGreaterThanOrEqual(b.endedAt)
  })

  it('K. Survival authority mutated earlier in the same transaction → SV006', () => {
    const { inst } = licensed()
    const f = failure(dsn, `begin; insert into public.cost_events (project_id, provider, cost_sek, cost_usd, created_at) values ('${P1}', 'anthropic', 1, 0, now()); ${asService(bindSql(inst))}; commit;`)
    expect(f.state).toBe('SV006')
    expect(runsFor(inst)).toBe(0)
  })

  // ── J: the authority deadline ─────────────────────────────────────────────
  it('J. the licence expiry passes before COMMIT → LB003 at commit, nothing persists', async () => {
    const { inst } = licensed({ expires: `now() + interval '2500 milliseconds'` })
    const b = await session('m4b_j_bind', ['begin', asService(bindSql(inst)), 'select pg_sleep(3)', 'commit'])
    expect([b.ok, b.state]).toEqual([false, 'LB003'])
    expect(runsFor(inst)).toBe(0)
  })

  // ── O / P / Q / R ─────────────────────────────────────────────────────────
  it('O. concurrent binds on one instance serialize; the same action identity is admitted once', async () => {
    const { inst } = licensed()
    const key = hex64('same-identity')
    const outcomes = await Promise.all([1, 2, 3].map(i => session(`m4b_o_${i}`, [asService(bindSql(inst, { key }))])))
    expect(outcomes.filter(o => o.ok)).toHaveLength(1)
    expect(outcomes.filter(o => !o.ok).map(o => o.state)).toEqual(['23505', '23505'])
    expect([runsFor(inst), provenanceFor(inst)]).toEqual([1, 1])
  })

  it('P. a storm of binds, Decision writers, licence writers and Survival writers: zero 40P01', async () => {
    const lots = [0, 1, 2, 3].map(() => licensed())
    const work: Promise<Outcome>[] = []
    lots.forEach((l, i) => {
      work.push(session(`m4b_p_b${i}a`, [asService(bindSql(l.inst))]))
      work.push(session(`m4b_p_b${i}b`, [asService(bindSql(l.inst))]))
      if (i % 2 === 0) work.push(session(`m4b_p_d${i}`, [reverseSql(l.d)]))
      else work.push(session(`m4b_p_l${i}`, [revokeSql(l.inst, l.d, l.licence)]))
      work.push(session(`m4b_p_s${i}`, [`insert into public.cost_events (project_id, provider, cost_sek, cost_usd, created_at) values ('${P1}', 'anthropic', 0.01, 0, now())`]))
    })
    const outcomes = await Promise.all(work)
    expect(outcomes.filter(o => o.state === '40P01')).toEqual([])
    // Every failure is a fail-closed refusal or a serialization veto, never an unexpected error.
    for (const o of outcomes.filter(x => !x.ok)) expect(['LB010', 'SV004', '40001']).toContain(o.state)
  })

  it('Q. rollback after a successful bind statement leaves no run and no provenance', () => {
    const { inst } = licensed()
    run(dsn, ['-c', `begin; ${asService(bindSql(inst))}; rollback;`])
    expect([runsFor(inst), provenanceFor(inst)]).toEqual([0, 0])
  })

  it('R. the exempt bind is unchanged: it still binds its own placements with 3B1A provenance (admission_basis NULL)', () => {
    const inst = instance(P0, 'probe', 'omnira.probe-validation')
    const out = one(dsn, asService(`select bound_run_id from public.bind_workflow_action_run('${P0}', '${inst}', '${HASH}', 'probe',
      'probe_anonymous_protected_access', '${hex64('rt')}', '${hex64('rk')}', gen_random_uuid())`))
    expect(one(dsn, `select policy_mode || '|' || reason || '|' || coalesce(admission_basis, '∅') from public.run_autonomy_decisions where run_id = '${out}'`))
      .toBe('license_exempt_observation|exempt_observation|∅')
    // …and it still refuses the licensed kind.
    const { inst: lic } = licensed()
    expect(failure(dsn, asService(`select * from public.bind_workflow_action_run('${P0}', '${lic}', '${HASH}', 'effect',
      'proof_governed_effect', '${hex64('rt2')}', '${hex64('rk2')}', gen_random_uuid())`)).state).toBe('22023')
  })

  // ── Hardening ─────────────────────────────────────────────────────────────
  it('privileges: only service_role may execute the licensed bind; anon and authenticated may not', () => {
    const { inst } = licensed()
    for (const role of ['anon', 'authenticated']) {
      expect(failure(dsn, `set role ${role}; ${bindSql(inst)}`).state).toBe('42501')
    }
    expect(one(dsn, `select has_function_privilege('service_role', 'public.bind_licensed_workflow_action_run_v1(uuid,text,text,text,text,text,uuid,uuid)', 'execute')`)).toBe('t')
    expect(one(dsn, `select has_function_privilege('public', 'public.bind_licensed_workflow_action_run_v1(uuid,text,text,text,text,text,uuid,uuid)', 'execute')`)).toBe('f')
  })

  it('no Decision or licence act may be written in the same transaction AFTER a licensed bind', () => {
    const a = licensed()
    expect(failure(dsn, `begin; ${asService(bindSql(a.inst))}; reset role; ${reverseSql(a.d)}; commit;`).state).toBe('LB004')
    const b = licensed()
    expect(failure(dsn, `begin; ${asService(bindSql(b.inst))}; reset role; ${revokeSql(b.inst, b.d, b.licence)}; commit;`).state).toBe('LB004')
    expect(runsFor(a.inst) + runsFor(b.inst)).toBe(0)
  })

  it('the V1 provenance matrix refuses a fabricated full-state claim and a stray proof column', () => {
    const { inst } = licensed()
    const source = one(dsn, asService(bindSql(inst))).split(',')[0]
    // A fresh UNBOUND run to hang test rows on (a legacy run needs no bind row).
    const target = one(dsn, `insert into public.runs (project_id) values ('${P0}') returning id`)
    const cols = `boundary, policy_mode, reason, required_level, license_id, license_generation, admission_basis, decision_id,
      decision_record_id, decision_version, decision_head_generation, decision_proof, licence_proof, survival_proof, survival_anchor,
      survival_epoch_vector, survival_valid_until, authority_valid_until, proven_min_level,
      authorization_id, authorization_request_event_id, authorization_grant_event_id, authorization_granted_by,
      authorization_proof, authorization_valid_until`
    const copyWith = (extraCol: string, extraVal: string) =>
      `insert into public.run_autonomy_decisions (run_id, ${cols}${extraCol ? `, ${extraCol}` : ''})
       select '${target}', ${cols}${extraCol ? `, ${extraVal}` : ''} from public.run_autonomy_decisions where run_id = '${source}'`
    // Control: the exact V1 row is representable (inside a rolled-back transaction).
    expect(failure(dsn, `begin; ${copyWith('', '')}; rollback;`).state).toBe('')
    // A V1 row claiming a Survival state / an exact level / a resolver verdict the database never derived.
    expect(failure(dsn, copyWith('survival_state', `'CONSERVE'`)).state).toBe('23514')
    expect(failure(dsn, copyWith('effective_level', `'L3'`)).state).toBe('23514')
    expect(failure(dsn, copyWith('license_reason', `'active'`)).state).toBe('23514')
    // A 3B1A row carrying a stray proof column.
    expect(failure(dsn, `insert into public.run_autonomy_decisions (run_id, boundary, policy_mode, policy_reason, reason, required_level, decision_proof)
      values ('${target}', 'bind', 'license_exempt_observation', 'canonical_read_only_observation', 'exempt_observation', 'L0', 'v1_two_act_approval_in_force')`).state).toBe('23514')
  })

  // ── Human execution authorization (M4 authority closure) ───────────────────
  describe('human execution authorization: the caller id is a SELECTOR, never authority', () => {
    /** A fully licensed instance plus the identity a bind will use. */
    const subject = () => {
      const l = licensed()
      return { ...l, target: hex64(`at${seq++}`), group: id('a8000000'), key: hex64(`ak${seq++}`) }
    }
    type Subject = ReturnType<typeof subject>
    const bindWith = (s: Subject, auth: string | null) =>
      asService(bindSql(s.inst, { auth, target: s.target, group: s.group, key: s.key }))
    const refused = (s: Subject, f: { state: string; message: string }, reason: RegExp) => {
      expect([f.state, reason.test(f.message)], f.message.slice(0, 300)).toEqual(['LB010', true])
      expect([runsFor(s.inst), provenanceFor(s.inst)]).toEqual([0, 0])
    }
    const revokeOf = (auth: string) => `insert into public.atlas_authorizations (authorization_id, event_type, project_id, principal_id, action_kind,
      target_type, target_id, target_version_hash) select authorization_id, 'revoked', project_id, principal_id, action_kind, target_type, target_id,
      target_version_hash from public.atlas_authorizations where authorization_id = '${auth}' and event_type = 'requested'`

    it('POSITIVE: a simple human grant + V1 licence + current Decision + Survival → ONE run, ONE provenance naming the grant', () => {
      const s = subject()
      const auth = authorize({ inst: s.inst, target: s.target, group: s.group })
      const [runId] = one(dsn, bindWith(s, auth)).split(',')
      expect([runsFor(s.inst), provenanceFor(s.inst)]).toEqual([1, 1])
      const grant = one(dsn, `select event_id || '|' || principal_id || '|' || date_trunc('milliseconds', expires_at)
        from public.atlas_authorizations where authorization_id = '${auth}' and event_type = 'granted'`).split('|')
      expect(one(dsn, `select authorization_id || '|' || authorization_grant_event_id || '|' || authorization_granted_by
        || '|' || authorization_proof || '|' || (authorization_valid_until = '${grant[2]}'::timestamptz)
        || '|' || (authority_valid_until <= authorization_valid_until)
        from public.run_autonomy_decisions where run_id = '${runId}'`))
        .toBe(`${auth}|${grant[0]}|${grant[1]}|v1_single_unconditioned_execution_grant_in_force|true|true`)
      expect(one(dsn, `select authorization_id from public.runs where id = '${runId}'`)).toBe(auth)
    })

    it('A. a random authorization UUID is refused', () => {
      const s = subject(); refused(s, failure(dsn, bindWith(s, id('ffffffff'))), /authorization_unknown/)
    })
    it('B. a missing authorization is refused (22023), nothing written', () => {
      const s = subject()
      expect(failure(dsn, bindWith(s, null)).state).toBe('22023')
      expect(runsFor(s.inst)).toBe(0)
    })
    it('C. a real grant from ANOTHER project is refused', () => {
      const s = subject()
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, project: P1 }))), /authorization_project_mismatch/)
    })
    it('D. a real grant for ANOTHER workflow instance is refused', () => {
      const s = subject(); const other = instance()
      refused(s, failure(dsn, bindWith(s, authorize({ inst: other, target: s.target, group: s.group }))), /authorization_target_mismatch/)
    })
    it('E. a real grant for ANOTHER action (kind, class, or a gate-advance grant) is refused', () => {
      const s = subject()
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, kind: 'generate_monthly_story' }))), /authorization_target_mismatch/)
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, cls: 'MATERIAL_WRITE' }))), /authorization_target_mismatch/)
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, actionKind: 'workflow.gate.advance' }))), /authorization_action_mismatch/)
    })
    it('F. a real grant for ANOTHER target hash (or definition version / state) is refused', () => {
      const s = subject()
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: hex64('other-target'), group: s.group }))), /authorization_target_mismatch/)
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, defVersion: 2 }))), /authorization_target_mismatch/)
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, state: 'proof' }))), /authorization_target_mismatch/)
    })
    it('G. a real grant for ANOTHER attempt group is refused', () => {
      const s = subject()
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: id('a7000000') }))), /authorization_target_mismatch/)
    })
    it('H. an expired grant is refused', async () => {
      const s = subject()
      const auth = authorize({ inst: s.inst, target: s.target, group: s.group, expires: `now() + interval '1200 milliseconds'` })
      await sleep(1_600)
      refused(s, failure(dsn, bindWith(s, auth)), /authorization_expired/)
    })
    it('I. a revoked grant is refused', () => {
      const s = subject()
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, events: ['granted', 'revoked'] }))), /authorization_history_outside_v1_subset/)
    })
    it('J. a superseded grant (and an explicitly expired one) is refused', () => {
      const s = subject()
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, events: ['granted', 'superseded'] }))), /authorization_history_outside_v1_subset/)
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, events: ['granted', 'expired'] }))), /authorization_history_outside_v1_subset/)
    })
    it('K. malformed / non-grant lineages are refused: pending, denied, conditional, request-after-grant, future grant', () => {
      const s = subject()
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, events: [] }))), /authorization_history_outside_v1_subset/)
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, events: ['denied'] }))), /authorization_not_an_unconditioned_grant/)
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, events: ['granted_with_conditions'] }))), /authorization_not_an_unconditioned_grant/)
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, requestAfterGrant: true }))), /authorization_time_outside_v1_subset/)
      refused(s, failure(dsn, bindWith(s, authorize({ inst: s.inst, target: s.target, group: s.group, grantedAgo: '-1 hour', expires: `now() + interval '2 days'` }))), /authorization_grant_not_yet_in_force/)
    })

    it('L1. a REVOKE racing an OPEN bind waits for it (authorization head), then commits after it', async () => {
      const s = subject(); const auth = authorize({ inst: s.inst, target: s.target, group: s.group })
      const bind = session('m4b_l1_bind', ['begin', bindWith(s, auth), 'select pg_sleep(2)', 'commit'])
      expect(await sleeping('m4b_l1_bind')).toBe(true)
      const revoke = session('m4b_l1_rev', [revokeOf(auth)])
      expect(await waitingBehind('m4b_l1_rev')).toContain('m4b_l1_bind')
      const [b, r] = await Promise.all([bind, revoke])
      expect([b.ok, r.ok]).toEqual([true, true])
      expect(r.endedAt).toBeGreaterThanOrEqual(b.endedAt)
      expect(runsFor(s.inst)).toBe(1)
    })

    it('L2. a bind racing an OPEN revoke waits for it, then sees the revoke and refuses', async () => {
      const s = subject(); const auth = authorize({ inst: s.inst, target: s.target, group: s.group })
      const revoke = session('m4b_l2_rev', ['begin', revokeOf(auth), 'select pg_sleep(2)', 'commit'])
      expect(await sleeping('m4b_l2_rev')).toBe(true)
      const bind = session('m4b_l2_bind', [bindWith(s, auth)])
      expect(await waitingBehind('m4b_l2_bind')).toContain('m4b_l2_rev')
      const [r, b] = await Promise.all([revoke, bind])
      expect(r.ok).toBe(true)
      expect([b.ok, b.state]).toEqual([false, 'LB010'])
      expect(runsFor(s.inst)).toBe(0)
    })

    it('the grant expiry passing before COMMIT → LB003 at commit (the authorization joins the authority deadline)', async () => {
      const s = subject()
      const auth = authorize({ inst: s.inst, target: s.target, group: s.group, expires: `now() + interval '2500 milliseconds'` })
      const b = await session('m4b_auth_j', ['begin', bindWith(s, auth), 'select pg_sleep(3)', 'commit'])
      expect([b.ok, b.state]).toEqual([false, 'LB003'])
      expect(runsFor(s.inst)).toBe(0)
    })

    it('LB004: no authorization act may be written in the transaction AFTER a licensed bind', () => {
      const s = subject(); const auth = authorize({ inst: s.inst, target: s.target, group: s.group })
      expect(failure(dsn, `begin; ${bindWith(s, auth)}; reset role; ${revokeOf(auth)}; commit;`).state).toBe('LB004')
      expect(runsFor(s.inst)).toBe(0)
    })

    it('every OTHER authority input still refuses independently, even with a valid human grant', () => {
      const a = subject(); run(dsn, ['-c', revokeSql(a.inst, a.d, a.licence)])
      refused(a, failure(dsn, bindWith(a, authorize({ inst: a.inst, target: a.target, group: a.group }))), /licence_history_outside_v1_subset/)
      const b = subject(); run(dsn, ['-c', reverseSql(b.d)])
      refused(b, failure(dsn, bindWith(b, authorize({ inst: b.inst, target: b.target, group: b.group }))), /decision:/)
      const c = subject(); const cost = id('c1000000')
      run(dsn, ['-c', `insert into public.cost_events (id, project_id, provider, cost_sek, cost_usd, created_at) values ('${cost}', '${P1}', 'anthropic', 9500, 0, now())`])
      try { refused(c, failure(dsn, bindWith(c, authorize({ inst: c.inst, target: c.target, group: c.group }))), /headroom_below_v1_margin/) }
      finally { run(dsn, ['-c', `delete from public.cost_events where id = '${cost}'`]) }
    })

    it('the authorization head is maintained by the ledger trigger and is DB_INTERNAL', () => {
      const s = subject(); const auth = authorize({ inst: s.inst, target: s.target, group: s.group, events: ['granted', 'revoked'] })
      expect(one(dsn, `select event_count || '|' || (last_event_id = (select event_id from public.atlas_authorizations
        where authorization_id = '${auth}' and event_type = 'revoked')) from public.atlas_authorization_heads where authorization_id = '${auth}'`)).toBe('3|true')
      expect(failure(dsn, `update public.atlas_authorization_heads set event_count = 2 where authorization_id = '${auth}'`).state).toBe('42501')
      expect(failure(dsn, `delete from public.atlas_authorization_heads where authorization_id = '${auth}'`).state).toBe('42501')
      for (const role of ['anon', 'authenticated', 'service_role']) {
        expect(one(dsn, `select has_table_privilege('${role}', 'public.atlas_authorization_heads', 'select')`), role).toBe('f')
        expect(one(dsn, `select has_function_privilege('${role}', 'public.licensed_bind_v1_authorization_proof(uuid,uuid,uuid,text,integer,text,text,text,text,text,uuid,timestamptz)', 'execute')`), role).toBe('f')
      }
    })
  })
})
