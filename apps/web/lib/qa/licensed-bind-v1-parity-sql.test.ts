/**
 * Phase 3B1B2 · M4-A — ONE-WAY PARITY of the V1 conservative admission predicates
 * against the CANONICAL TypeScript semantics, on REAL PostgreSQL 17.
 *
 * Owner ruling (Option B+): the database predicates are deliberately INCOMPLETE
 * SAFE SUBSETS. For every generated state:
 *
 *        DB predicate ALLOWS   =>   canonical TypeScript ALLOWS        (MUST hold)
 *        TypeScript ALLOWS but the DB refuses                           (acceptable)
 *
 * The TypeScript side is the REAL code, unmodified, reading the REAL rows:
 *   • Decision  — createDecisionLedgerStore().lineage() → isDecisionGoverning()
 *   • Licence   — resolveAutonomyLicense() → admitAutonomyAction(ceiling L6)
 *                 (effective, kind in scope, licensed level >= L3)
 *   • Survival  — readSurvivalSnapshot(platform) → survivalCeiling() >= L3
 * Every row the TypeScript code sees is exactly what PostgreSQL returned for the
 * equivalent PostgREST query, JSON-encoded the way PostgREST encodes it.
 *
 * Each matrix is generated in bulk, evaluated once in SQL, and once through the
 * canonical code. The suite also requires FALSE REFUSALS to exist (TS allows,
 * DB refuses) — proof that the predicates are a conservative subset rather than
 * an accidental second implementation of the same semantics.
 */

import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const boundary = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (!boundary.client) throw new Error('no admin client installed for this case')
    return boundary.client
  },
}))

import { isDecisionGoverning } from '@/lib/atlas/decision-ledger/derive'
import { createDecisionLedgerStore } from '@/lib/atlas/decision-ledger/store'
import { resolveAutonomyLicense } from '@/lib/atlas/autonomy-license/resolve'
import { admitAutonomyAction } from '@/lib/atlas/autonomy-runtime/admission'
import { readSurvivalSnapshot } from '@/lib/atlas/survival/snapshot'
import { compareLevels } from '@/lib/atlas/autonomy-license/levels'
import { fingerprintFor } from '@/lib/atlas/autonomy-license/scope'

// ── Real PostgreSQL ─────────────────────────────────────────────────────────

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
export const PARITY_CHAIN = [
  '20260602_cost_events.sql',
  '20260602_project_budgets.sql',
  '20260819_atlas_decision_ledger.sql',
  '20260830_spend_budget_gate.sql',
  '20260831_budget_scopes.sql',
  '20260910120000_cost_ledger_rls_isolation.sql',
  '20261001160000_m0_durable_spend_settlement.sql',
  '20260923120000_survival_state_events.sql',
  '20260924120000_survival_funding_phase2b.sql',
  '20260924180000_autonomy_license_phase2c.sql',
  '20261002140000_autonomy_authority_serialization.sql',
  '20261002190000_survival_input_epoch.sql',
  '20261003120000_survival_commit_fence.sql',
  '20261004090000_survival_threshold_status_canonical.sql',
  '20261004100000_m4a_licensed_authority_substrate.sql',
]
// Mutation testing substitutes a mutated copy of the M4-A migration (absolute path).
const CHAIN = PARITY_CHAIN.map(f => (process.env.M4_PARITY_MIGRATION_OVERRIDE && f.startsWith('20261004100000')
  ? process.env.M4_PARITY_MIGRATION_OVERRIDE : join(MIGRATIONS, f)))

function dsnFor(database: string): string {
  const url = new URL(ADMIN_URL); url.pathname = `/${database}`; return url.toString()
}
function run(dsn: string, args: string[], allowErrors = false): string {
  return execFileSync(PSQL!, ['-v', `ON_ERROR_STOP=${allowErrors ? 0 : 1}`, '-X', '-q', '-d', dsn, ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 600_000, maxBuffer: 512 * 1024 * 1024 })
}
/** A large script goes through STDIN: the command line has a length limit. */
function runScript(dsn: string, script: string): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, '-f', '-'],
    { input: script, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 600_000, maxBuffer: 512 * 1024 * 1024 })
}
function json<T>(dsn: string, sql: string): T {
  const out = execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-f', '-'],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 600_000, maxBuffer: 512 * 1024 * 1024 })
  return JSON.parse(out.trim()) as T
}
function reachable(): boolean {
  if (!PSQL) return false
  try { execFileSync(PSQL, ['-X', '-q', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 }); return true }
  catch { return false }
}
const AVAILABLE = reachable()
const DB = `omnira_m4par_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''
const DB_S = `${DB}_s`
let dsnS = ''

const P = ['a1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222',
  'a3333333-3333-4333-8333-333333333333', 'a4444444-4444-4444-8444-444444444444']
const PRINCIPAL = '11111111-1111-4111-8111-111111111111'
const ACTOR = `user:${PRINCIPAL}`
const V1_DEF = 'omnira.execution-proof'
const V1_KIND = 'proof_governed_effect'
const DEF_HASH = 'e'.repeat(64)

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
create or replace function auth.uid() returns uuid language sql stable as
  $u$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $u$;
create table public.projects (
  id uuid primary key default gen_random_uuid(), owner_id uuid, name text, slug text unique not null,
  color text, settings jsonb, created_at timestamptz not null default now(), atlas_mode text,
  execution_paused boolean not null default false, paused_at timestamptz, paused_reason text);
create table public.platform_config (
  id int primary key, automation_paused boolean not null default false,
  max_daily_renders int not null default 4, max_retry_attempts int not null default 3,
  paused_at timestamptz, paused_reason text, updated_at timestamptz not null default now());
insert into public.platform_config (id) values (1);
create table public.infra_costs (id uuid primary key default gen_random_uuid());
create table public.revenue_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  snapshot_date date not null, captured_at timestamptz not null default now(),
  active_subscribers int, new_subscribers int, trialing int, churned_this_month int,
  mrr_sek numeric, revenue_month_sek numeric, currency text, raw jsonb,
  unique (project_id, snapshot_date));
alter table public.revenue_snapshots enable row level security;
create table public.workflow_instances (
  id uuid primary key, def_id uuid, def_key text not null, def_version int not null default 1,
  def_hash text not null, project_id uuid not null references public.projects(id),
  instance_key text, current_state text not null default 'effect', status text not null default 'active',
  wake_at timestamptz, last_tick_at timestamptz, last_tick_outcome text,
  created_at timestamptz not null default now(), closed_at timestamptz);
insert into public.projects (id, slug, owner_id) values
  ('${P[0]}','p0','${PRINCIPAL}'), ('${P[1]}','p1','${PRINCIPAL}'), ('${P[2]}','p2','${PRINCIPAL}'), ('${P[3]}','p3','${PRINCIPAL}');
`

// ── A client that serves exactly the rows PostgreSQL returned ──────────────

type Rows = Record<string, unknown>[]
function tableClient(tables: Record<string, Rows>, rpc: Record<string, unknown> = {}) {
  class Q {
    private rows: Rows
    constructor(private table: string) {
      if (!(table in tables)) throw new Error(`parity client: unexpected table ${table}`)
      this.rows = tables[table]
    }
    select() { return this }
    eq(col: string, v: unknown) { this.rows = this.rows.filter(r => String(r[col]) === String(v)); return this }
    in(col: string, vals: unknown[]) { const s = new Set(vals.map(String)); this.rows = this.rows.filter(r => s.has(String(r[col]))); return this }
    not(col: string, op: string, v: unknown) {
      if (op !== 'is' || v !== null) throw new Error('parity client: unsupported not()')
      this.rows = this.rows.filter(r => r[col] !== null && r[col] !== undefined); return this
    }
    gte() { return this }      // the served rows were already cut in SQL at the canonical cutoff
    order() { return this }    // canonical readers re-sort; DB order is never their authority
    limit() { return this }
    async maybeSingle() { return { data: this.rows[0] ?? null, error: null } }
    async single() { return { data: this.rows[0] ?? null, error: this.rows.length ? null : { message: 'no row' } } }
    then<T>(ok: (v: { data: unknown; error: unknown }) => T, bad?: (e: unknown) => T) {
      return Promise.resolve({ data: this.rows, error: null }).then(ok, bad)
    }
  }
  return {
    from: (t: string) => new Q(t),
    rpc: async (name: string) => {
      if (!(name in rpc)) throw new Error(`parity client: unexpected rpc ${name}`)
      return { data: rpc[name], error: null }
    },
  }
}

// ── Deterministic generator ─────────────────────────────────────────────────

let seed = 0x5eed1234
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
/**
 * Biased generation: every dimension starts at a value inside the V1 subset;
 * then k random dimensions (k drawn from {0,0,1,1,2,3}) are flipped to a random
 * value from their full domain. Dense near the subset's boundary, which is
 * exactly where a one-way violation would live.
 */
function flipped<T extends Record<string, readonly unknown[]>>(domains: T): { [K in keyof T]: T[K][number] } {
  const keys = Object.keys(domains) as (keyof T)[]
  const out = Object.fromEntries(keys.map(k => [k, domains[k][0]])) as { [K in keyof T]: T[K][number] }
  const k = pick([0, 0, 1, 1, 2, 3] as const)
  for (let i = 0; i < k; i += 1) {
    const key = pick(keys)
    out[key] = pick(domains[key]) as T[typeof key][number]
  }
  return out
}
let uuidSeq = 1
const uuid = (tag: string) => {
  let h = 0x811c9dc5
  for (const ch of tag) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
  return `${h.toString(16).padStart(8, '0')}-0000-4000-8000-${String(uuidSeq++).padStart(12, '0')}`
}
const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`)
/** A TIMESTAMPTZ SQL expression relative to the anchor, with µs precision. */
const at = (anchor: string, offsetMicros: number | 'infinity' | '-infinity' | 'y1999' | null): string => {
  if (offsetMicros === null) return 'null'
  if (offsetMicros === 'infinity' || offsetMicros === '-infinity') return `'${offsetMicros}'::timestamptz`
  if (offsetMicros === 'y1999') return `'1999-06-01T00:00:00Z'::timestamptz`
  return `(${q(anchor)}::timestamptz + interval '${offsetMicros} microseconds')`
}
const MS = 1000, SEC = 1_000_000, DAY = 86_400 * SEC

/** p_at with sub-millisecond noise; TypeScript evaluates at its millisecond truncation. */
const P_AT = '2026-10-04T12:00:00.000437Z'
const TS_AT = new Date(Date.parse('2026-10-04T12:00:00.000Z')).toISOString()

// ── Result bookkeeping ──────────────────────────────────────────────────────

interface Outcome { kase: string; db: boolean; dbReason: string; ts: boolean; tsReason: string }
function summarise(name: string, outcomes: Outcome[]) {
  const violations = outcomes.filter(o => o.db && !o.ts)
  const falseRefusals = outcomes.filter(o => !o.db && o.ts)
  const bothAllow = outcomes.filter(o => o.db && o.ts)
  console.log(`[${name}] cases=${outcomes.length} db_allow=${outcomes.filter(o => o.db).length} ts_allow=${outcomes.filter(o => o.ts).length}`
    + ` both_allow=${bothAllow.length} DB_ALLOW&&TS_REFUSE=${violations.length} TS_ALLOW&&DB_REFUSE=${falseRefusals.length}`)
  const reasons = new Map<string, number>()
  for (const o of falseRefusals) reasons.set(o.dbReason, (reasons.get(o.dbReason) ?? 0) + 1)
  console.log(`[${name}] intentional false-refusal reasons: ${JSON.stringify(Object.fromEntries(reasons))}`)
  return { violations, falseRefusals, bothAllow }
}

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('M4-A one-way parity: DB_ALLOW => canonical TypeScript ALLOW (real PostgreSQL)', { timeout: 1_800_000 }, () => {
  beforeAll(() => {
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${DB}`])
    dsn = dsnFor(DB)
    run(dsn, ['-c', FIXTURE])
    for (const m of CHAIN) run(dsn, ['-f', m])
    // The Survival matrix varies the platform population, so it runs on its own
    // pristine clone: the other matrices' rows must not pin projects via FKs.
    run(ADMIN_URL, ['-c', `create database ${DB_S} template ${DB}`])
    dsnS = dsnFor(DB_S)
  }, 600_000)

  afterAll(() => {
    boundary.client = null
    vi.useRealTimers()
    if (!AVAILABLE || !dsn) return
    try { run(ADMIN_URL, ['-c', `drop database if exists ${DB} with (force)`]) } catch { /* best effort */ }
    try { run(ADMIN_URL, ['-c', `drop database if exists ${DB_S} with (force)`]) } catch { /* best effort */ }
  })

  it('PostgreSQL is reachable — this suite must never pass by skipping in CI', () => {
    if (!AVAILABLE && SQL_REQUIRED) throw new Error('SQL proof is REQUIRED but no Postgres was reachable.')
    expect(fingerprintFor([V1_KIND], V1_DEF)).toBe(json<string>(dsn, `select to_json(scope_fingerprint) from licensed_bind_v1_supported()`))
  })

  // ═══ Decision ════════════════════════════════════════════════════════════
  interface DecisionCase { id: string; decision: string; pinRecord: string; pinVersion: number; project: string; sql: string[] }

  function decisionCase(n: number, anchor: string): DecisionCase {
    const decision = uuid('dd' + (n % 97))
    const project = P[0]
    const g0 = uuid('d0'), g1 = uuid('d1'), extra = uuid('dx')
    const d = flipped({
      g0Type: ['proposed', 'drafted', 'approved', 'reviewed'],
      g1Type: ['approved', 'rejected', 'deferred', 'amended'],
      extraKind: ['none', 'reviewed', 'outcome_ok', 'outcome_missing', 'amended', 'reversed', 'superseded', 'completed', 'foreign_project'],
      authority: ['ok', 'null', 'no_id', 'empty_id', 'numeric_id'],
      eff: [-DAY, -SEC, -2 * MS, -MS - 1, -MS, -MS + 1, -500, 0, 300, MS, DAY, 'infinity', '-infinity', 'y1999', null],
      exp: [null, DAY, 10 * SEC, 2 * MS, MS, 600, 563, 562, 0, -500, -MS, -DAY, 'infinity'],
      order: [-10 * SEC, -MS, -1, 0, 1, MS],
      pinWhich: ['g1', 'g0', 'other'],
      pinVersionDelta: [0, 1],
      pinProjectOther: [false, true],
    } as const)
    const { g0Type, g1Type, extraKind, authority, eff, exp, order, pinWhich, pinVersionDelta } = d
    const pinProject = d.pinProjectOther ? P[1] : project
    const g1At = -DAY + Math.floor(rnd() * 1000) * 7

    const auth = authority === 'null' ? 'null'
      : authority === 'no_id' ? `'{"basis":"founder_owner"}'::jsonb`
      : authority === 'empty_id' ? `'{"basis":"founder_owner","authorizationId":""}'::jsonb`
      : authority === 'numeric_id' ? `'{"basis":"founder_owner","authorizationId":7}'::jsonb`
      : `'{"basis":"founder_owner","authorizationId":"auth-1","principalId":"${PRINCIPAL}","actionKind":"decision.approve","boundVersionHash":"h","authorityActAt":"2026-10-03T00:00:00Z"}'::jsonb`
    const row = (rec: string, type: string, gen: number, occurred: string, extraCols: Partial<Record<string, string>> = {}, proj = project) =>
      `insert into public.atlas_decision_ledger (record_id, decision_id, record_type, occurred_at, project_id, principal_id, title, statement,
         materiality, authority, effective_at, expires_at, version, outcome, reason, superseded_by, lifecycle_generation) values (
         '${rec}', '${decision}', '${type}', ${occurred}, '${proj}', '${PRINCIPAL}', 't', 's', '["autonomy"]'::jsonb,
         ${extraCols.authority ?? 'null'}, ${extraCols.effective ?? 'null'}, ${extraCols.expires ?? 'null'},
         ${extraCols.version ?? '1'}, ${extraCols.outcome ?? 'null'}, ${extraCols.reason ?? 'null'}, ${extraCols.superseded ?? 'null'}, ${gen});`
    const sql: string[] = []
    sql.push(row(g0, g0Type, g0Type === 'reviewed' ? 0 : 0, at(anchor, g1At + order)))
    const g1Extra = { authority: g1Type === 'approved' || g1Type === 'amended' ? auth : 'null', effective: at(anchor, eff), expires: at(anchor, exp),
      version: g1Type === 'amended' ? '2' : '1', reason: g1Type === 'amended' ? q('r') : 'null' }
    sql.push(row(g1, g1Type, 1, at(anchor, g1At), g1Extra))
    const after = at(anchor, g1At + 5 * SEC)
    if (extraKind === 'reviewed') sql.push(row(extra, 'reviewed', 2, after))
    if (extraKind === 'outcome_ok') sql.push(row(extra, 'outcome_observed', 2, after, { outcome: `'{"status":"on_track","summary":"s","observedAt":"2026-10-04T00:00:00Z","evidence":[]}'::jsonb` }))
    if (extraKind === 'outcome_missing') sql.push(row(extra, 'outcome_observed', 2, after))
    if (extraKind === 'amended') sql.push(row(extra, 'amended', 2, after, { version: '2', reason: q('change'), authority: auth, effective: at(anchor, -DAY) }))
    if (extraKind === 'reversed') sql.push(row(extra, 'reversed', 2, after, { reason: q('undo') }))
    if (extraKind === 'superseded') sql.push(row(extra, 'superseded', 2, after, { superseded: q(uuid('ss')) }))
    if (extraKind === 'completed') sql.push(row(extra, 'completed', 2, after))
    if (extraKind === 'foreign_project') sql.push(row(extra, 'reviewed', 2, after, {}, P[1]))
    const pinRecord = pinWhich === 'g1' ? g1 : pinWhich === 'g0' ? g0 : uuid('zz')
    return { id: `d${n}:${g0Type}/${g1Type}/${extraKind}/${authority}/eff${eff}/exp${exp}/ord${order}/pin${pinWhich}+${pinVersionDelta}/${pinProject === project ? 'same' : 'other'}`,
      decision, pinRecord, pinVersion: 1 + pinVersionDelta, project: pinProject, sql }
  }

  it('Decision: DB_ALLOW => isDecisionGoverning() — zero counterexamples over the generated matrix', async () => {
    const N = Number(process.env.M4_PARITY_DECISION_CASES ?? 3000)
    const cases = Array.from({ length: N }, (_, n) => decisionCase(n, P_AT))
    // Each case in its own sub-transaction so an append the head trigger refuses
    // (an impossible state) only drops that case's offending row.
    const script = cases.map(c => c.sql.map(s => `do $c$ begin ${s.replace(/;$/, '')}; exception when others then null; end $c$;`).join('\n')).join('\n')
    runScript(dsn, script)
    const db = json<{ i: number; admissible: boolean; reason: string }[]>(dsn, `select coalesce(json_agg(json_build_object('i', c.i, 'admissible', d.admissible, 'reason', d.reason) order by c.i), '[]')
      from (values ${cases.map((c, i) => `(${i}, '${c.decision}'::uuid, '${c.pinRecord}'::uuid, ${c.pinVersion}, '${c.project}'::uuid)`).join(',')}) c(i, d, r, v, p)
      cross join lateral licensed_bind_v1_decision_proof(c.d, c.r, c.v, c.p, '${P_AT}'::timestamptz) d`)
    const ledger = json<Rows>(dsn, `select coalesce(json_agg(l), '[]') from atlas_decision_ledger l`)
    boundary.client = tableClient({ atlas_decision_ledger: ledger })
    const store = createDecisionLedgerStore()
    const outcomes: Outcome[] = []
    for (const [i, c] of cases.entries()) {
      const lineage = await store.lineage(c.decision)
      // The canonical question the licence resolver asks: the decision governs, and
      // its recorded project is the instance's project.
      const tsGoverning = lineage.length > 0 && (lineage[0] as { projectId: string }).projectId === c.project
        && isDecisionGoverning(lineage, { at: TS_AT }).governing
      outcomes.push({ kase: c.id, db: db[i].admissible, dbReason: db[i].reason, ts: tsGoverning, tsReason: isDecisionGoverning(lineage, { at: TS_AT }).reason })
    }
    const { violations, falseRefusals, bothAllow } = summarise('decision', outcomes)
    expect(violations.map(v => v.kase)).toEqual([])
    expect(bothAllow.length).toBeGreaterThan(20)            // the subset is not empty
    expect(falseRefusals.length).toBeGreaterThan(20)        // …and is strictly narrower than the fold
  })

  // ═══ Licence ═════════════════════════════════════════════════════════════
  it('Licence: DB_ALLOW => resolveAutonomyLicense() effective, kind in scope, level >= L3 — zero counterexamples', async () => {
    const N = Number(process.env.M4_PARITY_LICENCE_CASES ?? 1500)
    const V1_FP = fingerprintFor([V1_KIND], V1_DEF)
    const OTHER_FP = fingerprintFor([V1_KIND, 'observe_release_gate'], V1_DEF)
    const cases: { id: string; inst: string; sql: string[] }[] = []
    for (let n = 0; n < N; n += 1) {
      const inst = uuid('ii' + n)
      const project = P[n % 2]
      const decision = uuid('ld'), g0 = uuid('l0'), g1 = uuid('l1'), annot = uuid('la')
      const f = flipped({
        decisionShape: ['good', 'annotated', 'expired', 'future', 'other_project', 'amended'],
        instDefKey: [V1_DEF, 'familje-stunden.monthly-release'],
        instHashOther: [false, true],
        lineages: [1, 2],
        acts: [['LICENSE_ISSUED'], ['LICENSE_ISSUED', 'LICENSE_RESTRICTED'], ['LICENSE_ISSUED', 'LICENSE_SUSPENDED'],
          ['LICENSE_ISSUED', 'LICENSE_REVOKED'], ['LICENSE_RESTRICTED']],
        kinds: [[V1_KIND], [V1_KIND, 'observe_release_gate'], ['observe_release_gate']],
        fpWrong: [false, true],
        level: ['L3', 'L4', 'L6', 'L0', 'L2'],
        eff: [-DAY, -2 * MS, -MS - 1, -MS, -MS + 1, -500, 0, 400, DAY],
        exp: [30 * DAY, 2 * MS, MS, 600, 563, 562, 0, -MS],
        defKeyOther: [false, true],
        // The licence's bound hash may disagree with its instance's (definition drift).
        licHashOther: [false, true],
      } as const)
      const decisionShape = f.decisionShape
      const instDefKey = f.instDefKey
      const instHash = f.instHashOther ? 'f'.repeat(64) : DEF_HASH
      const sql: string[] = []
      sql.push(`insert into public.workflow_instances (id, def_key, def_hash, project_id) values ('${inst}', '${instDefKey}', '${instHash}', '${project}');`)
      const dproj = decisionShape === 'other_project' ? P[(n + 1) % 2] : project
      const dexp = decisionShape === 'expired' ? at(P_AT, -SEC) : pick(['null', at(P_AT, 30 * DAY)])
      const deff = decisionShape === 'future' ? at(P_AT, DAY) : at(P_AT, -2 * DAY)
      const d = (rec: string, type: string, gen: number, occ: number, extra = '') =>
        `insert into public.atlas_decision_ledger (record_id, decision_id, record_type, occurred_at, project_id, principal_id, title, statement,
           materiality, authority, effective_at, expires_at, version, lifecycle_generation${extra ? ', reason' : ''}) values ('${rec}', '${decision}', '${type}', ${at(P_AT, occ)}, '${dproj}', '${PRINCIPAL}', 't', 's',
           '["autonomy"]'::jsonb, '{"authorizationId":"a1"}'::jsonb, ${deff}, ${dexp}, ${type === 'amended' ? 2 : 1}, ${gen}${extra ? `, ${q(extra)}` : ''});`
      sql.push(d(g0, 'proposed', 0, -3 * DAY))
      sql.push(d(g1, 'approved', 1, -2 * DAY))
      let pinRecord = g1, pinVersion = 1
      if (decisionShape === 'annotated') sql.push(d(annot, 'reviewed', 2, -DAY))
      if (decisionShape === 'amended') { sql.push(d(annot, 'amended', 2, -DAY, 'change')); pinRecord = annot; pinVersion = 2 }

      const lineages = f.lineages
      for (let l = 0; l < lineages; l += 1) {
        const lic = uuid('lc')
        const acts = f.acts
        const kinds = f.kinds
        // Independent of the kind set: a V1 fingerprint on a WIDER set is exactly the
        // drift the canonical scope check must catch.
        const fp = f.fpWrong ? OTHER_FP : V1_FP
        const level = f.level
        const eff = f.eff
        const exp = f.exp
        const defKey = f.defKeyOther ? 'other.def' : instDefKey
        acts.forEach((act, g) => {
          const lv = act === 'LICENSE_RESTRICTED' ? 'L3' : level
          sql.push(`insert into public.atlas_autonomy_license_events (license_id, license_generation, act, project_id, workflow_instance_id,
             bound_def_key, bound_def_hash, licensed_level, allowed_action_kinds, action_scope_fingerprint, decision_id, decision_version,
             decision_record_id, effective_at, expires_at, superseded_by_license_id, reason, actor) values ('${lic}', ${g}, '${act}', '${project}', '${inst}',
             '${defKey}', '${f.licHashOther ? 'b'.repeat(64) : instHash}', '${lv}', array[${kinds.map(k => q(k)).join(',')}]::text[], '${fp}', '${decision}', ${pinVersion}, '${pinRecord}',
             ${at(P_AT, eff)}, ${at(P_AT, typeof exp === 'number' ? Math.max(exp, eff + 1) : 0)}, null, ${act === 'LICENSE_ISSUED' ? 'null' : q('r')}, '${ACTOR}');`)
        })
      }
      cases.push({ id: `l${n}:${decisionShape}/${lineages}lin/${instDefKey}/${instHash === DEF_HASH ? 'hash' : 'otherhash'}`, inst, sql })
    }
    const script = cases.map(c => c.sql.map(s => `do $c$ begin ${s.replace(/;$/, '')}; exception when others then null; end $c$;`).join('\n')).join('\n')
    runScript(dsn, script)
    const db = json<{ i: number; admissible: boolean; reason: string }[]>(dsn, `select coalesce(json_agg(json_build_object('i', c.i, 'admissible', l.admissible, 'reason', l.reason) order by c.i), '[]')
      from (values ${cases.map((c, i) => `(${i}, '${c.inst}'::uuid)`).join(',')}) c(i, inst)
      cross join lateral licensed_bind_v1_licence_proof(c.inst, '${V1_KIND}', '${P_AT}'::timestamptz) l`)
    boundary.client = tableClient({
      workflow_instances: json<Rows>(dsn, `select coalesce(json_agg(w), '[]') from workflow_instances w`),
      atlas_autonomy_license_events: json<Rows>(dsn, `select coalesce(json_agg(e), '[]') from atlas_autonomy_license_events e`),
      atlas_decision_ledger: json<Rows>(dsn, `select coalesce(json_agg(l), '[]') from atlas_decision_ledger l`),
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(TS_AT))
    const outcomes: Outcome[] = []
    try {
      for (const [i, c] of cases.entries()) {
        const licence = await resolveAutonomyLicense(c.inst)
        const admission = admitAutonomyAction({ actionKind: V1_KIND, licence, survivalCeiling: 'L6' })
        const ts = licence.effective && licence.allowedActionKinds.includes(V1_KIND)
          && compareLevels(licence.resolvedLevel, 'L3') >= 0 && admission.allowed
        outcomes.push({ kase: c.id, db: db[i].admissible, dbReason: db[i].reason, ts, tsReason: `${licence.reason}/${admission.reason}` })
      }
    } finally {
      vi.useRealTimers()
    }
    const { violations, falseRefusals, bothAllow } = summarise('licence', outcomes)
    expect(violations.map(v => v.kase)).toEqual([])
    expect(bothAllow.length).toBeGreaterThan(10)
    expect(falseRefusals.length).toBeGreaterThan(5)
  })

  // ═══ Survival ════════════════════════════════════════════════════════════
  it('Survival: DB_ALLOW => survivalCeiling(deriveSurvivalState(platform)) >= L3 — zero counterexamples', async () => {
    const N = Number(process.env.M4_PARITY_SURVIVAL_CASES ?? 500)
    const outcomes: Outcome[] = []
    for (let n = 0; n < N; n += 1) {
      const f = flipped({
        projects: [4, 1, 0],
        // Today's spend against a daily limit of 100 on project 0: the remaining
        // fraction is (100 - spend) / 100, straddling the canonical 0.10 and the
        // V1 margin 0.11.
        spendToday: [1, 50, 65, 66, 88, 89, 89.5, 90, 90.5, 95, 100, 120],
        otherScopes: ['large', 'tight', 'zero_limit'],
        funding: ['null', 'missing', '1000000', '5000', '500', '300', '100', '20', '10.5', '1', '0', '-5', 'NaN', 'missing'],
        // With funding 300: burn 3000/30 = 100 per day → 3 days; 4000 → 2.25 days; 2500 → 3.6 days.
        burnSpend: [0, 30, 300, 1500, 2500, 3000, 4000, 4500, 9000, 30000],
        burnAge: ['3 days', '719 hours 59 minutes', '720 hours 30 seconds', '40 days'],
        pending: [0, 5, 50],
      } as const)
      const projects = f.projects
      const sql: string[] = ['begin;']
      if (projects < 4) sql.push(`delete from public.projects where id not in (${P.slice(0, projects).map(p => `'${p}'`).join(',') || 'null'});`)
      const big = 100000
      for (const [i, p] of P.slice(0, projects).entries()) {
        const daily = i === 0 ? 100 : f.otherScopes === 'large' ? big : f.otherScopes === 'tight' ? 20 : 0
        sql.push(`insert into public.project_budgets (project_id, monthly_sek, daily_sek, weekly_sek) values ('${p}', ${big}, ${daily}, ${big})
          on conflict (project_id) do update set monthly_sek = excluded.monthly_sek, daily_sek = excluded.daily_sek, weekly_sek = excluded.weekly_sek;`)
      }
      sql.push(`update public.platform_config set global_daily_sek = ${big}, global_weekly_sek = ${big}, global_monthly_sek = ${big * 10} where id = 1;`)
      if (projects > 0) {
        if (f.spendToday > 0) sql.push(`insert into public.cost_events (project_id, provider, cost_sek, cost_usd, created_at) values ('${P[0]}', 'anthropic', ${f.spendToday}, 0, now());`)
        if (f.otherScopes === 'tight' && projects > 1) sql.push(`insert into public.cost_events (project_id, provider, cost_sek, cost_usd, created_at) values ('${P[1]}', 'anthropic', 17.9, 0, now());`)
        if (f.burnSpend > 0) sql.push(`insert into public.cost_events (project_id, provider, cost_sek, cost_usd, created_at) values ('${P[projects - 1]}', 'anthropic', ${f.burnSpend}, 0, now() - interval '${f.burnAge}');`)
      }
      const funding = f.funding
      if (funding === 'missing') sql.push(`delete from public.survival_funding_config;`)
      else sql.push(`update public.survival_funding_config set declared_operating_capital_sek = ${funding === 'NaN' ? `'NaN'::numeric` : funding} where id = 1;`)
      if (projects > 0 && f.pending > 0) {
        // A dispatched, unsettled reservation: counted in burn at its estimate.
        sql.push(`select public.budget_mark_dispatch_intent(r.reservation_id, gen_random_uuid(), 'token_window') from public.budget_reserve('${P[0]}'::uuid, ${f.pending}::numeric, null, 'anthropic', 'parity') r where r.allowed;`)
      }
      sql.push(`select clock_timestamp() as p_at \\gset`)
      sql.push(`select 'PARITYJSON:' || (json_build_object(
        'p_at', :'p_at',
        'db', (select row_to_json(s) from licensed_bind_v1_survival_proof(:'p_at'::timestamptz) s),
        'projects', (select coalesce(json_agg(json_build_object('id', id, 'owner_id', owner_id)), '[]') from public.projects),
        'headroom', (select coalesce(json_agg(h), '[]') from public.budget_headroom(30) h),
        'funding', (select coalesce(json_agg(c), '[]') from public.survival_funding_config c where c.id = 1),
        'pending', (select coalesce(json_agg(json_build_object('estimated_sek', r.estimated_sek, 'status', r.status, 'dispatched_at', r.dispatched_at, 'project_id', r.project_id)), '[]')
                      from public.spend_reservations r where r.status = 'open' and r.dispatched_at is not null),
        'complete', public.survival_scope_is_platform_complete(array(select id from public.projects)),
        'costs_all', (select coalesce(json_agg(json_build_object('cost_sek', c.cost_sek, 'project_id', c.project_id, 'created_at', c.created_at)), '[]') from public.cost_events c)
      ))::jsonb::text;`)
      sql.push('rollback;')
      const out = execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsnS, '-f', '-'], { input: sql.join('\n'), encoding: 'utf8', timeout: 120_000 })
      const r = JSON.parse(out.split('\n').find(l => l.startsWith('PARITYJSON:'))!.slice('PARITYJSON:'.length)) as {
        p_at: string; db: { admissible: boolean; reason: string }; projects: Rows; headroom: Rows; funding: Rows; pending: Rows; complete: boolean; costs_all: Rows
      }
      // TypeScript evaluates at the millisecond truncation of the same instant, with
      // its own cutoff: exactly the rows `.gte('created_at', cutoff)` would return.
      const tsAt = new Date(Date.parse(r.p_at.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'))).toISOString()
      const cutoff = Date.parse(tsAt) - 30 * 86_400_000
      const ids = r.projects.map(p => String(p.id))
      const costRows = r.costs_all.filter(c => ids.includes(String(c.project_id))
        && Date.parse(String(c.created_at)) >= cutoff)        // µs → ms: see the strict check below
      // Exactness guard for the cutoff: a row within the same millisecond as the
      // cutoff would be judged differently by Date.parse; none is generated.
      expect(r.costs_all.every(c => Math.abs(Date.parse(String(c.created_at)) - cutoff) > 2)).toBe(true)
      boundary.client = null
      const client = tableClient({
        cost_events: costRows, spend_reservations: r.pending,
        revenue_snapshots: [], survival_funding_config: r.funding, platform_config: [{ id: 1, automation_paused: false }],
      }, { budget_headroom: r.headroom, survival_scope_is_platform_complete: r.complete })
      let ts = false, tsReason = ''
      if (ids.length > 0) {                                  // the platform adapter refuses an empty platform (L0)
        const obs = await readSurvivalSnapshot(ids, { db: client, now: tsAt })
        ts = compareLevels(obs.ceiling, 'L3') >= 0
        tsReason = `${obs.snapshot.state}/${obs.ceiling}`
      } else {
        tsReason = 'empty_platform/L0'
      }
      outcomes.push({ kase: `s${n}:${JSON.stringify(f)}`, db: r.db.admissible, dbReason: r.db.reason, ts, tsReason })
    }
    const { violations, falseRefusals, bothAllow } = summarise('survival', outcomes)
    expect(violations.map(v => `${v.kase} db=${v.dbReason} ts=${v.tsReason}`)).toEqual([])
    expect(bothAllow.length).toBeGreaterThan(10)
    expect(falseRefusals.length).toBeGreaterThan(5)
  })
})
