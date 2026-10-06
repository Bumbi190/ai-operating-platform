/**
 * Phase 3B1B2 · M4-A — the licensed-bind AUTHORITY SUBSTRATE, on REAL PostgreSQL 17.
 *
 *   1. Decision Ledger append boundary — service_role loses direct INSERT; the
 *      SECURITY DEFINER boundary enforces mutation INTEGRITY (not Chapter 11).
 *   2. Licence-issuance / current-Decision race — REPRODUCED on the M1-only
 *      schema, then CLOSED: an ISSUED act whose pinned head moved is refused
 *      (40001), and a concurrent lifecycle writer waits behind the issuance.
 *   3. Lock order — instance → decision head → licence rows, under a storm of
 *      licence writers, Decision writers and bind-shaped readers: zero 40P01.
 *   4. Commit-time authority deadline — registration refuses outside top level
 *      (LB001), when the recheck was forced IMMEDIATE (LB002), and when the
 *      deadline passed (LB003) — at registration AND at COMMIT.
 *   5. Survival v1 threshold status — mixed-version recording.
 *   6. Privileges — every M4-A primitive is internal.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { join } from 'node:path'

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
const BASE_CHAIN = [
  '20260602_cost_events.sql', '20260602_project_budgets.sql', '20260819_atlas_decision_ledger.sql',
  '20260830_spend_budget_gate.sql', '20260831_budget_scopes.sql', '20260910120000_cost_ledger_rls_isolation.sql',
  '20261001160000_m0_durable_spend_settlement.sql', '20260923120000_survival_state_events.sql',
  '20260924120000_survival_funding_phase2b.sql', '20260924180000_autonomy_license_phase2c.sql',
  '20261002140000_autonomy_authority_serialization.sql', '20261002190000_survival_input_epoch.sql',
  '20261003120000_survival_commit_fence.sql',
]
const M4A_CHAIN = ['20261004090000_survival_threshold_status_canonical.sql', '20261004100000_m4a_licensed_authority_substrate.sql']

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
/** SQLSTATE of a failing statement batch, or '' on success. */
function sqlstate(dsn: string, sql: string): string {
  try { run(dsn, ['-v', 'VERBOSITY=verbose', '-c', sql]); return '' }
  catch (e) { return /ERROR:\s+([0-9A-Z]{5}):/.exec(String((e as { stderr?: unknown }).stderr))?.[1] ?? '?' }
}
function reachable(): boolean {
  if (!PSQL) return false
  try { execFileSync(PSQL, ['-X', '-q', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 }); return true }
  catch { return false }
}
const AVAILABLE = reachable()
const DB = `omnira_m4a_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const DB_PRE = `${DB}_pre`
let dsn = ''
let dsnPre = ''

interface Outcome { ok: boolean; out: string; stderr: string; state: string; endedAt: number }
function session(db: string, app: string, statements: string[]): Promise<Outcome> {
  const args = ['-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-X', '-q', '-t', '-A', '-F', '|',
    '-d', dsnFor(db, app), '-c', `set lock_timeout = '20s'`, '-c', `set deadlock_timeout = '200ms'`,
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
async function holding(db: string, app: string, timeoutMs = 30_000): Promise<boolean> {
  for (const until = Date.now() + timeoutMs; Date.now() < until; await sleep(50)) {
    if (one(dsnFor(db), `select count(*) from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep'`) === '1') return true
  }
  return false
}
async function waitingBehind(db: string, app: string, timeoutMs = 30_000): Promise<string[]> {
  for (const until = Date.now() + timeoutMs; Date.now() < until; await sleep(50)) {
    const names = one(dsnFor(db), `select coalesce(string_agg(a.application_name, ',' order by a.application_name), '')
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
insert into public.projects (id, slug, owner_id) values ('${P0}','p0','${PRINCIPAL}'), ('${P1}','p1','${PRINCIPAL}');
`

/** A two-act approved decision (proposed → approved), inserted by the owner role. */
function approvedDecision(db: string, project = P0): { decision: string; proposal: string; approval: string } {
  const decision = id('d0000000'), proposal = id('d1000000'), approval = id('d2000000')
  run(dsnFor(db), ['-c', `insert into public.atlas_decision_ledger (record_id, decision_id, record_type, occurred_at, project_id, principal_id, title, statement, materiality, version, lifecycle_generation)
      values ('${proposal}', '${decision}', 'proposed', now() - interval '2 days', '${project}', '${PRINCIPAL}', 't', 's', '["autonomy"]', 1, 0);
    insert into public.atlas_decision_ledger (record_id, decision_id, record_type, occurred_at, project_id, principal_id, title, statement, materiality, authority, effective_at, version, lifecycle_generation)
      values ('${approval}', '${decision}', 'approved', now() - interval '1 day', '${project}', '${PRINCIPAL}', 't', 's', '["autonomy"]', '{"authorizationId":"a1"}', now() - interval '1 day', 1, 1);`])
  return { decision, proposal, approval }
}
function instance(db: string, project = P0): string {
  const inst = id('99999999')
  run(dsnFor(db), ['-c', `insert into public.workflow_instances (id, def_key, def_hash, project_id) values ('${inst}', '${V1_DEF}', '${HASH}', '${project}')`])
  return inst
}
/** The canonical licence writer, called exactly as the application calls it. */
const issueSql = (inst: string, d: { decision: string; approval: string }, licence = id('1ccccccc')) =>
  `select license_generation from public.autonomy_license_append('${licence}', 0, 'LICENSE_ISSUED', '${P0}', '${inst}', '${V1_DEF}', '${HASH}', 'L3',
    array['proof_governed_effect'], '${FP}', '${d.decision}', 1, '${d.approval}', now() - interval '1 hour', now() + interval '30 days', null, null, '${ACTOR}')`
/** A lifecycle writer through the M4-A append boundary (reversal of the approval). */
const reverseSql = (d: { decision: string }) =>
  `select record_type from public.atlas_decision_ledger_append('${id('d3000000')}', '${d.decision}', 'reversed', clock_timestamp(), '${P0}', '${PRINCIPAL}',
    't', 's', null, null, '["autonomy"]', null, null, null, null, null, null, null, null, null, null, null, 1, null, null, 'undo', 2)`
const reverseSqlPre = (d: { decision: string }) =>
  `insert into public.atlas_decision_ledger (record_id, decision_id, record_type, occurred_at, project_id, principal_id, title, statement, materiality, version, reason, lifecycle_generation)
     values ('${id('d3000000')}', '${d.decision}', 'reversed', now(), '${P0}', '${PRINCIPAL}', 't', 's', '["autonomy"]', 1, 'undo', 2)`

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('M4-A licensed-bind authority substrate (real PostgreSQL)', { timeout: 300_000 }, () => {
  beforeAll(() => {
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${DB_PRE}`])
    dsnPre = dsnFor(DB_PRE)
    run(dsnPre, ['-c', FIXTURE])
    for (const m of BASE_CHAIN) run(dsnPre, ['-f', join(MIGRATIONS, m)])
    run(ADMIN_URL, ['-c', `create database ${DB} template ${DB_PRE}`])
    dsn = dsnFor(DB)
    for (const m of M4A_CHAIN) run(dsn, ['-f', join(MIGRATIONS, m)])
  }, 600_000)

  afterAll(() => {
    if (!AVAILABLE) return
    for (const d of [DB, DB_PRE]) { try { run(ADMIN_URL, ['-c', `drop database if exists ${d} with (force)`]) } catch { /* best effort */ } }
  })

  it('PostgreSQL is reachable — this suite must never pass by skipping in CI', () => {
    if (!AVAILABLE && SQL_REQUIRED) throw new Error('SQL proof is REQUIRED but no Postgres was reachable.')
    expect(one(dsn, 'show max_prepared_transactions')).toBe('0')
  })

  // ── 1. Decision Ledger append boundary ────────────────────────────────────
  describe('Decision Ledger: direct service_role INSERT is closed; the append boundary enforces integrity', () => {
    const appendArgs = (o: Partial<Record<string, string>> = {}) => {
      const a: Record<string, string> = {
        record_id: `'${id('d4000000')}'`, decision_id: `'${id('d5000000')}'`, record_type: `'proposed'`,
        occurred_at: 'clock_timestamp()', project_id: `'${P0}'`, principal_id: `'${PRINCIPAL}'`, title: `'t'`, statement: `'s'`,
        recommendation: 'null', rationale: 'null', materiality: `'["autonomy"]'`, authority: 'null', evidence: 'null', snapshot: 'null',
        alternatives: 'null', confidence: 'null', expected_impact: 'null', effective_at: 'null', expires_at: 'null', review: 'null',
        reversal_conditions: 'null', superseded_by: 'null', version: '1', outcome: 'null', review_note: 'null', reason: 'null',
        lifecycle_generation: '0', ...o,
      }
      return `select record_type from public.atlas_decision_ledger_append(${Object.values(a).join(', ')})`
    }
    const asService = (sql: string) => `set role service_role; ${sql}`

    it('service_role can SELECT but can no longer INSERT, UPDATE, DELETE or TRUNCATE the ledger', () => {
      expect(one(dsn, `select has_table_privilege('service_role','atlas_decision_ledger','SELECT')`)).toBe('t')
      for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        expect(one(dsn, `select has_table_privilege('service_role','atlas_decision_ledger','${p}')`), p).toBe('f')
      }
      expect(sqlstate(dsn, asService(`insert into public.atlas_decision_ledger (decision_id, record_type, project_id, principal_id, title, statement, materiality)
        values (gen_random_uuid(), 'proposed', '${P0}', '${PRINCIPAL}', 't', 's', '["autonomy"]')`))).toBe('42501')
      // …and on the M1-only schema it still could: the debt this migration closes.
      expect(one(dsnPre, `select has_table_privilege('service_role','atlas_decision_ledger','INSERT')`)).toBe('t')
    })

    it('service_role appends through the boundary; the M1 head moves in the same transaction', () => {
      const decision = id('d6000000')
      expect(one(dsn, asService(appendArgs({ decision_id: `'${decision}'` })))).toBe('proposed')
      expect(one(dsn, `select head_generation || ':' || head_record_type from atlas_decision_lineage_heads where decision_id = '${decision}'`)).toBe('0:proposed')
      expect(one(dsn, asService(appendArgs({ decision_id: `'${decision}'`, record_type: `'approved'`, lifecycle_generation: '1',
        authority: `'{"authorizationId":"a1"}'`, effective_at: `now()` })))).toBe('approved')
    })

    it.each([
      ['a lineage that starts with an approval', { record_type: `'approved'`, authority: `'{"authorizationId":"a"}'`, effective_at: 'now()' }, '22023'],
      ['a future-dated act', { occurred_at: `clock_timestamp() + interval '1 hour'` }, '22023'],
      ['an infinite occurred_at', { occurred_at: `'infinity'` }, '22023'],
      ['a missing required field', { principal_id: 'null' }, '22023'],
    ])('a first act is refused: %s', (_n, o, state) => {
      expect(sqlstate(dsn, asService(appendArgs(o as Record<string, string>)))).toBe(state)
    })

    it('continuing acts are refused when they would break the lineage representation', () => {
      const decision = id('d7000000')
      run(dsn, ['-c', asService(appendArgs({ decision_id: `'${decision}'` }))])
      const base = { decision_id: `'${decision}'` }
      expect(sqlstate(dsn, asService(appendArgs({ ...base, project_id: `'${P1}'`, record_type: `'reviewed'`, lifecycle_generation: '1' })))).toBe('22023')
      expect(sqlstate(dsn, asService(appendArgs({ ...base, occurred_at: `clock_timestamp() - interval '1 hour'`, record_type: `'reviewed'`, lifecycle_generation: '1' })))).toBe('22023')
      expect(sqlstate(dsn, asService(appendArgs({ ...base, record_type: `'approved'`, lifecycle_generation: '5', authority: `'{"authorizationId":"a"}'`, effective_at: 'now()' })))).toBe('40001')
      expect(sqlstate(dsn, asService(appendArgs({ ...base, record_type: `'approved'`, lifecycle_generation: '1' })))).toBe('22023')
      expect(sqlstate(dsn, asService(appendArgs({ ...base, record_type: `'approved'`, lifecycle_generation: '1', authority: `'{"authorizationId":""}'`, effective_at: 'now()' })))).toBe('22023')
      expect(sqlstate(dsn, asService(appendArgs({ ...base, record_type: `'outcome_observed'`, lifecycle_generation: '1' })))).toBe('22023')
      expect(sqlstate(dsn, asService(appendArgs({ ...base, record_type: `'superseded'`, lifecycle_generation: '1' })))).toBe('22023')
      expect(sqlstate(dsn, asService(appendArgs({ ...base, record_type: `'reversed'`, lifecycle_generation: '1', reason: `'  '` })))).toBe('22023')
      // An annotation with the right generation is integrity-valid (semantics stay TypeScript's).
      expect(one(dsn, asService(appendArgs({ ...base, record_type: `'reviewed'`, lifecycle_generation: '1' })))).toBe('reviewed')
    })

    it('no client role can execute the boundary', () => {
      for (const r of ['anon', 'authenticated']) {
        expect(one(dsn, `select has_function_privilege('${r}', 'public.atlas_decision_ledger_append(uuid, uuid, text, timestamptz, uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, timestamptz, timestamptz, jsonb, jsonb, uuid, integer, jsonb, text, text, integer)', 'execute')`), r).toBe('f')
      }
    })
  })

  // ── 2. Licence-issuance / current-Decision race ───────────────────────────
  describe('licence issuance serializes on the CURRENT Decision', () => {
    it('REPRODUCED on the M1-only schema: an ISSUED act commits against a decision reversed after the issuer read it', () => {
      const d = approvedDecision(DB_PRE)
      const inst = instance(DB_PRE)
      // The issuer has proven "governing" in TypeScript and pinned the approval…
      // …then a reversal commits before the append runs.
      run(dsnPre, ['-c', reverseSqlPre(d)])
      expect(one(dsnPre, issueSql(inst, d))).toBe('0')          // the stale issuance is ACCEPTED: the race is real
    })

    it('CLOSED: the same stale issuance is refused (40001) and nothing is written', () => {
      const d = approvedDecision(DB)
      const inst = instance(DB)
      run(dsn, ['-c', `set role service_role; ${reverseSql(d)}`])
      expect(sqlstate(dsn, issueSql(inst, d))).toBe('40001')
      expect(one(dsn, `select count(*) from atlas_autonomy_license_events where workflow_instance_id = '${inst}'`)).toBe('0')
    })

    it('a current issuance succeeds, and a reversal that arrives meanwhile WAITS behind it (head FOR SHARE)', async () => {
      const d = approvedDecision(DB)
      const inst = instance(DB)
      const issuer = session(DB, 'm4a_issue', ['begin', issueSql(inst, d), 'select pg_sleep(4)', 'commit'])
      expect(await holding(DB, 'm4a_issue')).toBe(true)
      const reverser = session(DB, 'm4a_reverse', ['set role service_role', reverseSql(d)])
      expect(await waitingBehind(DB, 'm4a_reverse')).toEqual(['m4a_issue'])
      const [ri, rr] = await Promise.all([issuer, reverser])
      expect([ri.ok, rr.ok]).toEqual([true, true])                 // serialized, not refused
      expect(rr.endedAt).toBeGreaterThanOrEqual(ri.endedAt - 50)
    })

    it('continuing acts are NOT blocked by Decision changes: a licence can always be revoked', () => {
      const d = approvedDecision(DB)
      const inst = instance(DB)
      const licence = id('1ddddddd')
      run(dsn, ['-c', issueSql(inst, d, licence)])
      run(dsn, ['-c', `set role service_role; ${reverseSql(d)}`])
      expect(one(dsn, `select act from public.autonomy_license_append('${licence}', 1, 'LICENSE_REVOKED', '${P0}', '${inst}', '${V1_DEF}', '${HASH}', 'L3',
        array['proof_governed_effect'], '${FP}', '${d.decision}', 1, '${d.approval}',
        (select effective_at from atlas_autonomy_license_events where license_id = '${licence}'),
        (select expires_at from atlas_autonomy_license_events where license_id = '${licence}'), null, 'stop', '${ACTOR}')`)).toBe('LICENSE_REVOKED')
    })
  })

  // ── 3. Lock order under contention ────────────────────────────────────────
  it('licence writers, Decision writers and bind-shaped readers in a storm: zero 40P01', async () => {
    const dl0 = Number(one(dsn, `select deadlocks from pg_stat_database where datname = current_database()`))
    const sessions: Promise<Outcome>[] = []
    for (let i = 0; i < 6; i += 1) {
      const d = approvedDecision(DB)
      const inst = instance(DB)
      // Bind-shaped reader: instance FOR UPDATE → decision head FOR SHARE → licence read.
      sessions.push(session(DB, `m4a_bind_${i}`, ['begin',
        `select 1 from workflow_instances where id = '${inst}' for update`,
        `select 1 from atlas_decision_lineage_heads where decision_id = '${d.decision}' for share`,
        `select count(*) from atlas_autonomy_license_events where workflow_instance_id = '${inst}'`,
        'select pg_sleep(0.5)', 'commit']))
      sessions.push(session(DB, `m4a_lic_${i}`, ['begin', issueSql(inst, d), 'select pg_sleep(0.3)', 'commit']))
      sessions.push(session(DB, `m4a_dec_${i}`, ['set role service_role', `select 1 from public.atlas_decision_ledger_append('${id('d8000000')}', '${d.decision}', 'reviewed', clock_timestamp(), '${P0}', '${PRINCIPAL}',
        't', 's', null, null, '["autonomy"]', null, null, null, null, null, null, null, null, null, null, null, 1, null, 'note', null, 2)`]))
    }
    const results = await Promise.all(sessions)
    expect(results.filter(r => r.state === '40P01')).toEqual([])
    expect(Number(one(dsn, `select deadlocks from pg_stat_database where datname = current_database()`)) - dl0).toBe(0)
    // Every outcome is a success or a clean stale-observation refusal — never a hang or a deadlock.
    for (const r of results) expect(['', '40001']).toContain(r.state)
  })

  // ── 4. Commit-time authority deadline ─────────────────────────────────────
  describe('commit-time authority deadline (Decision / licence expiry)', () => {
    const reg = (expr: string) => `select public.licensed_bind_register_authority_deadline(${expr})`

    it('an already-passed deadline is refused at registration (LB003)', () => {
      expect(sqlstate(dsn, `begin; ${reg(`clock_timestamp() - interval '1 second'`)}; commit;`)).toBe('LB003')
    })

    it('a deadline that passes AFTER registration but BEFORE commit is refused AT COMMIT (LB003) — nothing commits', () => {
      const before = one(dsn, 'select count(*) from licensed_bind_authority_intents')
      expect(sqlstate(dsn, `begin; ${reg(`clock_timestamp() + interval '1500 milliseconds'`)}; select pg_sleep(2); commit;`)).toBe('LB003')
      expect(one(dsn, 'select count(*) from licensed_bind_authority_intents')).toBe(before)
    })

    it('a live deadline commits; the next registration sweeps the committed intent', () => {
      run(dsn, ['-c', `begin; ${reg(`clock_timestamp() + interval '60 seconds'`)}; commit;`])
      run(dsn, ['-c', `begin; ${reg(`clock_timestamp() + interval '60 seconds'`)}; commit;`])
      expect(one(dsn, 'select count(*) from licensed_bind_authority_intents')).toBe('1')
    })

    it('must run at transaction TOP LEVEL: a savepoint or an EXCEPTION block is refused (LB001)', () => {
      expect(sqlstate(dsn, `begin; savepoint s; ${reg(`clock_timestamp() + interval '60 seconds'`)}; release s; commit;`)).toBe('LB001')
      expect(sqlstate(dsn, `do $x$ begin begin perform public.licensed_bind_register_authority_deadline(clock_timestamp() + interval '60 seconds');
        exception when division_by_zero then null; end; end $x$;`)).toBe('LB001')
    })

    it('forcing the commit-time recheck IMMEDIATE is detected (LB002) — by name or ALL', () => {
      expect(sqlstate(dsn, `begin; set constraints public.licensed_bind_authority_recheck immediate; ${reg(`clock_timestamp() + interval '60 seconds'`)}; commit;`)).toBe('LB002')
      expect(sqlstate(dsn, `begin; set constraints all immediate; ${reg(`clock_timestamp() + interval '60 seconds'`)}; commit;`)).toBe('LB002')
    })

    it('the recheck is DEFERRABLE INITIALLY DEFERRED and the intents table is DB_INTERNAL', () => {
      expect(one(dsn, `select tgdeferrable || ':' || tginitdeferred from pg_trigger where tgname = 'licensed_bind_authority_recheck'`)).toBe('true:true')
      expect(one(dsn, `select relrowsecurity || ':' || coalesce(relacl::text, 'default') from pg_class where oid = 'public.licensed_bind_authority_intents'::regclass`))
        .toBe('true:{postgres=arwdDxtm/postgres}')
      expect(one(dsn, `select count(*) from pg_policies where tablename = 'licensed_bind_authority_intents'`)).toBe('0')
    })
  })

  // ── 5. Survival v1 threshold status — mixed-version recording ─────────────
  it('threshold status: provisional (old app) and canonical (new app) both record on v2; canonical-v1 and arbitrary strings are refused', () => {
    const rec = (status: string, version: number, coverage: string) => sqlstate(dsn, `set role service_role; select public.survival_record_observation('${P1}'::uuid, '${['NORMAL', 'CONSERVE'][seq++ % 2]}',
      '{}'::text[], '{}'::text[], null, null, null, null, 'UNDECLARED', null, null, null, false, ${status}, ${version}, ${coverage}, clock_timestamp())`)
    expect(rec(`'provisional'`, 2, `'PLATFORM_COMPLETE'`)).toBe('')
    expect(rec(`'canonical'`, 2, `'PLATFORM_COMPLETE'`)).toBe('')
    expect(rec(`'canonical'`, 1, 'null')).toBe('22023')
    expect(rec(`'approved'`, 2, `'PLATFORM_COMPLETE'`)).toBe('22023')
    expect(rec('null', 2, `'PLATFORM_COMPLETE'`)).toBe('22023')
    // On the pre-migration schema the new app's label is refused — why the migration must apply first.
    expect(sqlstate(dsnPre, `set role service_role; select public.survival_record_observation('${P1}'::uuid, 'NORMAL',
      '{}'::text[], '{}'::text[], null, null, null, null, 'UNDECLARED', null, null, null, false, 'canonical', 2, 'PLATFORM_COMPLETE', clock_timestamp())`)).toBe('22023')
    // The table CHECK pins the same pairing for any privileged writer.
    expect(one(dsn, `select pg_get_constraintdef(oid) from pg_constraint where conname = 'survival_events_policy_identity_valid'`))
      .toMatch(/threshold_status = 'provisional'[\s\S]*threshold_status = ANY \(ARRAY\['provisional'::text, 'canonical'::text\]\)/)
  })

  // ── 6. Privileges ─────────────────────────────────────────────────────────
  it('every M4-A predicate and deadline primitive is INTERNAL: no API role may execute it; all SECURITY DEFINER with empty search_path', () => {
    const fns = [
      'licensed_bind_v1_supported()', 'licensed_bind_v1_decision_proof(uuid, uuid, integer, uuid, timestamptz)',
      'licensed_bind_v1_licence_proof(uuid, text, timestamptz)', 'licensed_bind_v1_survival_proof(timestamptz)',
      'licensed_bind_authority_recheck()', 'licensed_bind_register_authority_deadline(timestamptz)',
    ]
    for (const f of fns) {
      for (const r of ['anon', 'authenticated', 'service_role']) {
        expect(one(dsn, `select has_function_privilege('${r}', 'public.${f}', 'execute')`), `${r} ${f}`).toBe('f')
      }
    }
    expect(query(dsn, `select proname || ':' || prosecdef || ':' || coalesce(array_to_string(proconfig, ';'), '') from pg_proc
      where pronamespace = 'public'::regnamespace and proname in ('licensed_bind_v1_decision_proof', 'licensed_bind_v1_licence_proof',
      'licensed_bind_v1_survival_proof', 'licensed_bind_authority_recheck', 'licensed_bind_register_authority_deadline', 'atlas_decision_ledger_append')
      order by 1`).map(r => r[0])).toEqual([
      'atlas_decision_ledger_append:true:search_path=""', 'licensed_bind_authority_recheck:true:search_path=""',
      'licensed_bind_register_authority_deadline:true:search_path=""', 'licensed_bind_v1_decision_proof:true:search_path=""',
      'licensed_bind_v1_licence_proof:true:search_path=""', 'licensed_bind_v1_survival_proof:true:search_path=""',
    ])
    for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      for (const r of ['anon', 'authenticated', 'service_role']) {
        expect(one(dsn, `select has_table_privilege('${r}', 'public.licensed_bind_authority_intents', '${p}')`), `${r} ${p}`).toBe('f')
      }
    }
  })

  it('M4-A creates no bind, run, provenance or scheduler: there is still no licensed bind function at all', () => {
    expect(one(dsn, `select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname ilike '%licensed%bind%' and proname not like 'licensed_bind_v1_%' and proname not like 'licensed_bind_%authority%'`)).toBe('0')
    expect(one(dsn, `select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prosrc ilike '%survival_commit_fence(%' and proname <> 'survival_commit_fence'`)).toBe('0')
  })
})
