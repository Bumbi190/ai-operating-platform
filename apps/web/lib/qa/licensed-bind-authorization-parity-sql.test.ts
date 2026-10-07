/**
 * Phase 3B1B2 · M4 — ONE-WAY parity for the human execution authorization proof.
 *
 *     DB_AUTH_ALLOW  =>  assertExecutionAuthorized(...) ALLOWS        (converse NOT claimed)
 *
 * For every generated chain, `licensed_bind_v1_authorization_proof` is evaluated
 * on REAL PostgreSQL for a bind identity (instance row + kind + class + the run's
 * target hash + attempt group), and the canonical TypeScript check —
 * assertExecutionAuthorized → isAuthorizationEffective → isEffectiveNow, over
 * computeExecutionAuthorizationTarget — is run against the exact rows PostgreSQL
 * returned, at the same instant. A case where the database ALLOWS and TypeScript
 * REFUSES is an architecture failure. The suite also requires both-allow cases
 * (the subset is not empty) and TS-allow / DB-refuse cases (it is strictly
 * narrower: e.g. definition keys outside the canonical-JSON domain).
 *
 * Project access: isAuthorizationEffective first filters by the CALLING USER's
 * project access (resolveProjectAccess). That is a caller-identity filter, not
 * authorization semantics; it is granted for the instance's project here, so
 * the oracle is the authorization semantics themselves.
 */

import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const boundary = vi.hoisted(() => ({ client: null as unknown, allowed: [] as string[] }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (!boundary.client) throw new Error('no admin client installed for this case')
    return boundary.client
  },
}))
vi.mock('@/lib/auth/project-access', () => ({
  resolveProjectAccess: async () => ({ ok: true, userId: 'parity', allowedProjectIds: boundary.allowed }),
}))

import { assertExecutionAuthorized } from '@/lib/workflows/effect/execution-authorization-runtime'
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
  process.env.M4_AUTH_PARITY_MIGRATION_OVERRIDE ?? '20261004110000_m4b_licensed_bind.sql',
]

function dsnFor(database: string): string {
  const url = new URL(ADMIN_URL); url.pathname = `/${database}`; return url.toString()
}
function run(dsn: string, args: string[], input?: string): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, ...args],
    { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], timeout: 600_000 })
}
function reachable(): boolean {
  if (!PSQL) return false
  try { execFileSync(PSQL, ['-X', '-q', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 }); return true }
  catch { return false }
}
const AVAILABLE = reachable()
const DB = `omnira_m4auth_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

const P = ['a1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222']
const PRINCIPAL = '11111111-1111-4111-8111-111111111111'
const V1_DEF = 'omnira.execution-proof'
const KIND = 'proof_governed_effect'
const HASH = 'e'.repeat(64)

const FIXTURE = `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role')  then begin create role service_role;  exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then begin create role anon;          exception when duplicate_object or unique_violation then null; end; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then begin create role authenticated; exception when duplicate_object or unique_violation then null; end; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $u$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $u$;
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
create table public.runs (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects (id),
  status text not null default 'pending', kind text, input jsonb, context jsonb, max_attempts integer not null default 3,
  attempts integer not null default 0, policy_class text, claim_id uuid, claimed_at timestamptz, started_at timestamptz,
  lease_until timestamptz, cancel_requested boolean not null default false, created_at timestamptz not null default now());
insert into public.projects (id, slug, owner_id) values ('${P[0]}','p0','${PRINCIPAL}'), ('${P[1]}','p1','${PRINCIPAL}');
`

// ── A client that serves exactly the rows PostgreSQL returned ──────────────
type Rows = Record<string, unknown>[]
function tableClient(tables: Record<string, Rows>) {
  class Q {
    private rows: Rows
    constructor(table: string) {
      if (!(table in tables)) throw new Error(`parity client: unexpected table ${table}`)
      this.rows = tables[table]
    }
    select() { return this }
    eq(col: string, v: unknown) { this.rows = this.rows.filter(r => String(r[col]) === String(v)); return this }
    order() { return this }      // the canonical fold re-sorts; DB order is never its authority
    limit() { return this }
    then<T>(ok: (v: { data: unknown; error: unknown }) => T, bad?: (e: unknown) => T) {
      return Promise.resolve({ data: this.rows, error: null }).then(ok, bad)
    }
  }
  return { from: (t: string) => new Q(t) }
}

// ── Deterministic, boundary-biased generator ────────────────────────────────
let seed = 0x0a17a17a
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
function flipped<T extends Record<string, readonly unknown[]>>(domains: T): { [K in keyof T]: T[K][number] } {
  const keys = Object.keys(domains) as (keyof T)[]
  const out = Object.fromEntries(keys.map(k => [k, domains[k][0]])) as { [K in keyof T]: T[K][number] }
  const k = pick([0, 0, 1, 1, 2, 3] as const)
  for (let i = 0; i < k; i += 1) { const key = pick(keys); out[key] = pick(domains[key]) as T[typeof key][number] }
  return out
}
let seq = 1
const uid = (tag: string) => {
  let h = 0x811c9dc5
  for (const ch of tag) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
  return `${h.toString(16).padStart(8, '0')}-0000-4000-8000-${String(seq++).padStart(12, '0')}`
}
const hex = (s: string) => createHash('sha256').update(s).digest('hex')
const MS = 1000
const at = (anchor: string, us: number | 'null' | 'infinity') =>
  us === 'null' ? 'null' : us === 'infinity' ? `'infinity'::timestamptz` : `('${anchor}'::timestamptz + interval '${us} microseconds')`

const DOMAINS = {
  // Who created the grant: the authenticated human boundary, or a raw service_role row.
  origin: ['human', 'forged'],
  // Chain shape after the request. The V1 subset is exactly ['granted'].
  events: [['granted'], [], ['denied'], ['granted_with_conditions'], ['granted', 'revoked'], ['granted', 'superseded'],
    ['granted', 'expired'], ['denied', 'revoked']] as readonly string[][],
  project: ['same', 'other', 'other_on_request'],
  actionKind: ['workflow.action.execute', 'workflow.gate.advance', 'workflow.action.execute ', 'workflow_action_execute'],
  targetType: ['workflow_execution', 'workflow_action', 'workflow_gate'],
  // Which component of the PINNED target differs from the bind identity.
  pinDrift: ['none', 'instance', 'state', 'kind', 'class', 'target_hash', 'attempt_group', 'def_version', 'def_hash', 'def_key', 'target_id_only'],
  // The INSTANCE's definition key: inside / outside the canonical-JSON domain.
  defKey: [V1_DEF, 'omnira execution-proof', 'omnira."proof"', 'omnira.prööf', 'Omnira.Execution_Proof:2'],
  defVersion: [1, 0, 7, 1000000000],
  // Times, relative to the anchor (µs).
  requestAt: [-7_200_000_000, -3_600_000_000, -3_600_000_000 + 400, -3_600_000_000 + 1500, -1_000_000],
  grantAt: [-3_600_000_000, -2 * MS, -1 * MS, -999, -500, 0, 1_000_000],
  expiresAt: [7 * 86_400_000_000, 2 * MS, 1 * MS, 500, 0, -1 * MS, -3_600_000_000, 'null', 'infinity'] as readonly (number | 'null' | 'infinity')[],
} as const

interface Outcome { kase: number; db: boolean; dbReason: string; ts: boolean; tsReason: string; origin: 'human' | 'forged'; attested: number; attestationId: string | null }

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('M4 human authorization: DB_AUTH_ALLOW => assertExecutionAuthorized ALLOWS (real PostgreSQL)', { timeout: 1_800_000 }, () => {
  beforeAll(() => {
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${DB}`])
    dsn = dsnFor(DB)
    run(dsn, ['-f', '-'], FIXTURE)
    for (const m of CHAIN) run(dsn, ['-f', m.includes(':') || m.startsWith('/') ? m : join(MIGRATIONS, m)])
  }, 900_000)

  afterAll(() => {
    vi.useRealTimers()
    if (!AVAILABLE) return
    try { run(ADMIN_URL, ['-c', `drop database if exists ${DB} with (force)`]) } catch { /* best effort */ }
  })

  it('PostgreSQL is reachable — this suite must never pass by skipping in CI', () => {
    if (!AVAILABLE && SQL_REQUIRED) throw new Error('SQL proof is REQUIRED but no Postgres was reachable.')
    expect(dsn).not.toBe('')
  })

  it('the SQL target hash IS computeExecutionAuthorizationTarget() over the canonical-JSON domain', () => {
    // Direct parity of the hash rebuild, independent of the proof's other clauses.
    for (let n = 0; n < 50; n += 1) {
      const inst = uid('i'), group = uid('g'), target = hex(`h${n}`)
      const defKey = pick([V1_DEF, 'a.b-c_d:e', 'X']), state = pick(['effect', 'proof', 's_1']), version = pick([0, 1, 42, 999999999])
      const t = computeExecutionAuthorizationTarget({ instanceId: inst, defKey, defVersion: version, defHash: HASH, state,
        actionKind: KIND, actionClass: 'FINANCIAL', targetVersionHash: target, attemptGroup: group })
      const payload = `'{"action_class":"FINANCIAL","action_kind":"${KIND}","attempt_group":"${group}","def_hash":"${HASH}","def_key":"${defKey}","def_version":${version},"instance_id":"${inst}","kind":"workflow.action.execute","schema":1,"state":"${state}","target_version_hash":"${target}"}'`
      expect(run(dsn, ['-c', `select encode(sha256(convert_to(${payload}, 'UTF8')), 'hex')`]).trim()).toBe(t.versionHash)
      expect(`${inst}:${state}:${KIND}:${group}`).toBe(t.targetId)
    }
  })

  it('DB_AUTH_ALLOW => assertExecutionAuthorized() ALLOWS, and only human-attested grants are ever admitted — zero counterexamples', async () => {
    const N = Number(process.env.M4_AUTH_PARITY_CASES ?? 1200)
    const outcomes: Outcome[] = []
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      for (let n = 0; n < N; n += 1) {
        const f = flipped(DOMAINS)
        const anchor = run(dsn, ['-c', `select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`]).trim()
        const inst = uid('inst'), group = uid('grp'), target = hex(`target-${n}`), auth = uid('auth')
        const project = P[0]
        const id = { instanceId: inst, defKey: f.defKey, defVersion: f.defVersion, defHash: HASH, state: 'effect',
          actionKind: KIND, actionClass: 'FINANCIAL' as const, targetVersionHash: target, attemptGroup: group }
        // The pinned target: the bind identity, with at most one component drifted.
        const pinned: Omit<typeof id, 'defVersion' | 'defKey'> & { defVersion: number; defKey: string } = { ...id }
        switch (f.pinDrift) {
          case 'instance': pinned.instanceId = uid('other-inst'); break
          case 'state': pinned.state = 'proof'; break
          case 'kind': pinned.actionKind = 'generate_monthly_story'; break
          case 'class': (pinned as { actionClass: string }).actionClass = 'MATERIAL_WRITE'; break
          case 'target_hash': pinned.targetVersionHash = hex(`other-${n}`); break
          case 'attempt_group': pinned.attemptGroup = uid('other-grp'); break
          case 'def_version': pinned.defVersion = f.defVersion + 1; break
          case 'def_hash': pinned.defHash = 'd'.repeat(64); break
          case 'def_key': pinned.defKey = `${f.defKey}x`; break
        }
        const t = computeExecutionAuthorizationTarget(pinned)
        const targetId = f.pinDrift === 'target_id_only' ? `${t.targetId}x` : t.targetId
        const row = (type: string, occurred: string, opts: { project?: string; expires?: string; superseded?: string } = {}) =>
          `insert into public.atlas_authorizations (event_id, authorization_id, event_type, occurred_at, project_id, principal_id,
             action_kind, target_type, target_id, target_version_hash, expires_at, superseded_by)
           values ('${uid('ev')}', '${auth}', '${type}', ${occurred}, '${opts.project ?? project}', '${PRINCIPAL}',
             '${f.actionKind}', '${f.targetType}', '${targetId.replace(/'/g, "''")}', '${t.versionHash}', ${opts.expires ?? 'null'}, ${opts.superseded ?? 'null'});`
        // ORIGIN: 'human' grants are created by the REAL authenticated boundary
        // (auth.uid() = the project owner); 'forged' grants are raw ledger rows, as
        // a service_role holder could write them. Only the former may ever be
        // M4-admissible. For a human grant the evaluation instant is placed
        // relative to the grant's own (database-chosen) time.
        const human = f.origin === 'human' && f.events[0] === 'granted'
        const sql = [
          'begin;',
          `insert into public.workflow_instances (id, def_key, def_version, def_hash, project_id, current_state)
             values ('${inst}', '${f.defKey.replace(/'/g, "''")}', ${f.defVersion}, '${HASH}', '${project}', 'effect');`,
          row('requested', at(anchor, f.requestAt), { project: f.project === 'other_on_request' ? P[1] : project }),
        ]
        if (human) {
          const expires = typeof f.expiresAt === 'number'
            ? `pg_catalog.clock_timestamp() + interval '${-f.grantAt + f.expiresAt} microseconds'` : f.expiresAt === 'null' ? 'null' : `'infinity'::timestamptz`
          sql.push(`set local role authenticated; set local request.jwt.claim.sub = '${PRINCIPAL}'; set local request.jwt.claim.role = 'authenticated';`,
            `select 1 from public.atlas_grant_m4_execution_authorization('${auth}', ${expires});`, 'reset role;')
        }
        for (const e of human ? f.events.slice(1) : f.events) {
          const decision = e === 'granted' || e === 'granted_with_conditions' || e === 'denied'
          sql.push(row(e, human ? 'pg_catalog.clock_timestamp()' : decision ? at(anchor, f.grantAt) : at(anchor, f.grantAt + 1000),
            { project: f.project === 'other' ? P[1] : project,
              expires: e.startsWith('granted') ? at(anchor, f.expiresAt) : undefined,
              superseded: e === 'superseded' ? `'${uid('succ')}'` : undefined }))
        }
        const evalAt = human
          ? `(select g.occurred_at - interval '${f.grantAt} microseconds' from public.atlas_authorizations g
               where g.authorization_id = '${auth}' and g.event_type = 'granted')`
          : `'${anchor}'::timestamptz`
        sql.push(`select 'PARITYJSON:' || json_build_object(
          'at', to_char(${evalAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'db', (select row_to_json(p) from public.licensed_bind_v1_authorization_proof('${auth}', '${project}', '${inst}',
                   '${f.defKey.replace(/'/g, "''")}', ${f.defVersion}, '${HASH}', 'effect', '${KIND}', 'FINANCIAL', '${target}', '${group}',
                   ${evalAt}) p),
          'attested', (select count(*) from public.atlas_authorization_human_grants h where h.authorization_id = '${auth}'),
          'rows', (select coalesce(json_agg(a), '[]') from public.atlas_authorizations a where a.authorization_id = '${auth}'))::jsonb::text;`)
        sql.push('commit;')
        let out: string
        try { out = run(dsn, ['-f', '-'], sql.join('\n')) }
        catch (e) {
          // A chain the ledger's own constraints — or the human boundary — refuse
          // never exists; it is not a case.
          const msg = String((e as { stderr?: unknown }).stderr)
          if (/violates (check|unique|foreign key) constraint|invalid input syntax|human execution grant:/.test(msg)) { run(dsn, ['-c', 'select 1']); continue }
          throw e
        }
        const line = out.split('\n').find(l => l.startsWith('PARITYJSON:'))!
        const r = JSON.parse(line.slice('PARITYJSON:'.length)) as {
          at: string; attested: number; db: { admissible: boolean; reason: string; attestation_id: string | null }; rows: Rows }
        boundary.client = tableClient({ atlas_authorizations: r.rows })
        boundary.allowed = [project]
        vi.setSystemTime(new Date(Date.parse(r.at)))
        let ts = false, tsReason = ''
        try {
          const v = await assertExecutionAuthorized({ ...id, projectId: project, authorizationId: auth })
          ts = v.valid; tsReason = v.reason
        } catch (e) { ts = false; tsReason = `threw: ${(e as Error).message}` }
        outcomes.push({ kase: n, db: r.db.admissible, dbReason: r.db.reason, ts, tsReason,
          origin: human ? 'human' : 'forged', attested: r.attested, attestationId: r.db.attestation_id })
      }
    } finally {
      vi.useRealTimers()
    }
    const violations = outcomes.filter(o => o.db && !o.ts)
    const falseRefusals = outcomes.filter(o => !o.db && o.ts)
    const bothAllow = outcomes.filter(o => o.db && o.ts)
    const reasons: Record<string, number> = {}
    for (const o of falseRefusals) reasons[o.dbReason] = (reasons[o.dbReason] ?? 0) + 1
    console.log(`[authorization] cases=${outcomes.length} db_allow=${outcomes.filter(o => o.db).length} ts_allow=${outcomes.filter(o => o.ts).length}`
      + ` both_allow=${bothAllow.length} DB_ALLOW&&TS_REFUSE=${violations.length} TS_ALLOW&&DB_REFUSE=${falseRefusals.length}`)
    console.log(`[authorization] intentional false-refusal reasons: ${JSON.stringify(reasons)}`)
    expect(violations.map(v => `${v.kase} db=${v.dbReason} ts=${v.tsReason}`)).toEqual([])
    // HUMAN ORIGIN: every DB_ALLOW is a human grant from the authenticated boundary,
    // carrying its attestation; a raw service_role grant NEVER satisfies the proof.
    const allowed = outcomes.filter(o => o.db)
    console.log(`[authorization] human-origin: db_allow=${allowed.length} human=${allowed.filter(o => o.origin === 'human').length}`
      + ` forged_admitted=${allowed.filter(o => o.origin !== 'human').length} forged_cases=${outcomes.filter(o => o.origin === 'forged').length}`)
    expect(allowed.filter(o => o.origin !== 'human' || o.attested !== 1 || !o.attestationId).map(o => o.kase)).toEqual([])
    expect(outcomes.filter(o => o.origin === 'forged').length).toBeGreaterThan(50)
    expect(bothAllow.length).toBeGreaterThan(20)
    expect(falseRefusals.length).toBeGreaterThan(5)
  })
})
