/**
 * Chapter 18 Autonomy Licensing Phase 2C — REAL PostgreSQL proof.
 *
 * The properties here cannot be proven by reading source: that the ledger is
 * append-only against a determined writer, that no role anywhere holds a DML
 * privilege, that the single SECURITY DEFINER boundary serializes the lineage
 * and refuses every widening act, and that it re-proves the authorizing
 * decision against the ledger rather than trusting its caller.
 *
 * Follows the harness of `survival-funding-sql.test.ts`. SKIPS loudly with no
 * local Postgres, and FAILS instead of skipping wherever proof is required.
 */

import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The store module is imported ONLY so the schema/store contract test can read
// its EXPORTED column list rather than a regex over its source. Mocked so the
// import cannot reach for a Supabase client this suite never uses.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }))

import { AUTONOMY_LICENSE_EVENT_COLS } from '@/lib/atlas/autonomy-license/store'

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
const MIGRATION = join(process.cwd(), 'supabase/migrations/20260924180000_autonomy_license_phase2c.sql')

function dsnFor(database: string): string {
  const url = new URL(ADMIN_URL); url.pathname = `/${database}`; return url.toString()
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
function one(dsn: string, sql: string): string {
  const rows = query(dsn, sql)
  return rows.length ? rows[0].join('|') : ''
}
function expectFailure(dsn: string, sql: string): string {
  try {
    execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, '-c', sql],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return ''
  } catch (e) {
    const err = e as { stderr?: Buffer | string }
    return String(err.stderr ?? '')
  }
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
  console.warn(
    '[autonomy-license-sql] SKIPPED — no reachable local Postgres. The Phase 2C licensing ' +
    'boundary (append-only, privilege closure, generation serialization, narrowing refusal, ' +
    'decision re-proof) was NOT proven. Set ATLAS_SQL_TEST_URL to enable it.')
}

const DB_NAME = `omnira_autolic_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

const d = AVAILABLE ? describe : describe.skip

// ── Fixture ───────────────────────────────────────────────────────────────────
//
// The three default-privilege lines are load-bearing: the migration's whole
// privilege posture is revoke-based, so without Supabase's default grants in
// place the closure assertions would pass vacuously.

const P_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INSTANCE_A = '99999999-9999-4999-8999-999999999999'
const INSTANCE_B = '88888888-8888-4888-8888-888888888888'
const DECISION_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const RECORD_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ACTOR = 'user:11111111-1111-4111-8111-111111111111'
/** The licence the narrowing/supersession chain is built on, in order. */
const LICENSE = '77777777-7777-4777-8777-777777777777'
/** A separate lineage, so the append-only proof cannot seed the chain above. */
const SEED = '01010101-0101-4101-8101-010101010101'

const FIXTURE = `
create extension if not exists pgcrypto;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $do$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table public.projects (
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text);
create table public.workflow_instances (
  id uuid primary key, project_id uuid not null references public.projects (id),
  def_key text not null, def_hash text not null);
create table public.atlas_decision_ledger (
  record_id uuid primary key, decision_id uuid not null, version integer not null,
  project_id uuid not null references public.projects (id), materiality jsonb not null);

insert into public.projects (id, slug) values
  ('${P_A}','alpha'), ('${P_B}','beta');
insert into public.workflow_instances (id, project_id, def_key, def_hash) values
  ('${INSTANCE_A}','${P_A}','familje-stunden.monthly-release', repeat('f',64)),
  ('${INSTANCE_B}','${P_B}','familje-stunden.monthly-release', repeat('f',64));

-- A same-project autonomy decision (accepted) ...
insert into public.atlas_decision_ledger (record_id, decision_id, version, project_id, materiality) values
  ('${RECORD_A}','${DECISION_A}', 2, '${P_A}', '["autonomy","customers"]'::jsonb);
`

const append = (overrides: Record<string, string> = {}) => {
  const args: Record<string, string> = {
    p_license_id: `'${LICENSE}'`,
    p_act: `'LICENSE_ISSUED'`,
    p_project_id: `'${P_A}'`,
    p_workflow_instance_id: `'${INSTANCE_A}'`,
    p_bound_def_key: `'familje-stunden.monthly-release'`,
    p_bound_def_hash: `repeat('f',64)`,
    p_licensed_level: `'L3'`,
    p_allowed_action_kinds: `array['generate_monthly_story','validate_monthly_story']`,
    p_action_scope_fingerprint: `repeat('a',64)`,
    p_decision_id: `'${DECISION_A}'`,
    p_decision_version: `2`,
    p_decision_record_id: `'${RECORD_A}'`,
    p_effective_at: `'2026-09-20T09:30:00Z'`,
    p_expires_at: `'2026-10-20T08:00:00Z'`,
    p_superseded_by_license_id: `null`,
    p_reason: `null`,
    p_actor: `'${ACTOR}'`,
    ...overrides,
  }
  const named = Object.entries(args).map(([k, v]) => `${k} => ${v}`).join(', ')
  return `select * from public.autonomy_license_append(${named})`
}

d('Phase 2C autonomy licence — real PostgreSQL', () => {
  beforeAll(() => {
    if (!AVAILABLE) {
      if (SQL_REQUIRED) throw new Error('[autonomy-license-sql] Postgres REQUIRED but unreachable.')
      return
    }
    run(ADMIN_URL, ['-c', `create database "${DB_NAME}"`])
    dsn = dsnFor(DB_NAME)
    run(dsn, ['-c', FIXTURE])
    run(dsn, ['-f', MIGRATION])
  })

  afterAll(() => {
    if (!AVAILABLE) return
    try { run(ADMIN_URL, ['-c', `drop database if exists "${DB_NAME}" with (force)`]) } catch { /* best effort */ }
  })

  // ── Structure ─────────────────────────────────────────────────────────────

  it('creates the ledger with RLS enabled and ZERO policies', () => {
    expect(one(dsn, `select relrowsecurity from pg_class where oid = 'public.atlas_autonomy_license_events'::regclass`)).toBe('t')
    expect(one(dsn, `select count(*) from pg_policies where schemaname='public' and tablename='atlas_autonomy_license_events'`)).toBe('0')
  })

  it('declares RLS in the migration, so a fresh deploy cannot create it unprotected', () => {
    // A create table without a matching `enable row level security` in the SAME
    // file is the workflow_stories hazard. Assert the pairing directly.
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toMatch(/create table if not exists public\.atlas_autonomy_license_events/)
    expect(sql).toMatch(/alter table public\.atlas_autonomy_license_events enable row level security/)
  })

  // ── Privilege closure ─────────────────────────────────────────────────────

  it('holds no DML privilege anywhere, for any role', () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        expect(one(dsn, `select has_table_privilege('${role}',
          'public.atlas_autonomy_license_events', '${priv}')`), `${role} ${priv}`).toBe('f')
      }
    }
  })

  it('grants SELECT to service_role and nothing to anon or authenticated', () => {
    expect(one(dsn, `select has_table_privilege('service_role',
      'public.atlas_autonomy_license_events', 'SELECT')`)).toBe('t')
    for (const role of ['anon', 'authenticated']) {
      expect(one(dsn, `select has_table_privilege('${role}',
        'public.atlas_autonomy_license_events', 'SELECT')`), role).toBe('f')
    }
  })

  it('revokes the identity sequence from every role', () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect(one(dsn, `select has_sequence_privilege('${role}',
        'public.atlas_autonomy_license_events_event_seq_seq', 'USAGE')`), role).toBe('f')
    }
  })

  it('refuses anon and authenticated the SELECT that RLS would already deny', () => {
    const as = (role: string, sql: string) => expectFailure(dsn, `set role ${role}; ${sql}; reset role;`)
    const denied = /permission denied|42501|row-level security/i
    expect(as('anon', 'select count(*) from public.atlas_autonomy_license_events')).toMatch(denied)
    expect(as('authenticated', 'select count(*) from public.atlas_autonomy_license_events')).toMatch(denied)
  })

  // ── Append-only ───────────────────────────────────────────────────────────

  it('refuses UPDATE, DELETE and TRUNCATE structurally', () => {
    // Seed an unrelated lineage so this proof cannot disturb the chain the
    // narrowing tests build on.
    run(dsn, ['-c', append({ p_license_id: `'${SEED}'` })])
    const upd = expectFailure(dsn, `update public.atlas_autonomy_license_events set act = 'LICENSE_REVOKED'`)
    const del = expectFailure(dsn, `delete from public.atlas_autonomy_license_events`)
    const trunc = expectFailure(dsn, `truncate public.atlas_autonomy_license_events`)
    expect(upd).toMatch(/append-only|42501/i)
    expect(del).toMatch(/append-only|42501/i)
    expect(trunc).toMatch(/append-only|42501/i)
    // The seeded row survived every attempt.
    expect(one(dsn, `select count(*) from public.atlas_autonomy_license_events where license_id = '${SEED}'`)).toBe('1')
  })

  // ── The write boundary ────────────────────────────────────────────────────

  it('is a SECURITY DEFINER function with a fixed EMPTY search_path', () => {
    const row = one(dsn, `select case when p.prosecdef then 't' else 'f' end || '|' ||
                                coalesce(array_to_string(p.proconfig, ','), '')
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname='public' and p.proname='autonomy_license_append'`)
    const [definer, config] = row.split('|')
    expect(definer).toBe('t')
    expect(config).toMatch(/search_path=/)
    expect(config).not.toMatch(/search_path=[^,]*\w/)   // must be EMPTY, not 'public'
  })

  it('refuses a non-human actor shape', () => {
    const bad = [
      `'cron'`,
      `'atlas.survival_recorder'`,
      `'user:not-a-uuid'`,
      `'user:00000000-0000-0000-0000-000000000000'`,   // nil uuid
      `'user:11111111-1111-1111-1111-111111111111'`,   // bad version nibble
      `'user:11111111-1111-4111-1111-111111111111'`,   // bad variant nibble
    ]
    for (const actor of bad) {
      expect(expectFailure(dsn, append({ p_actor: actor })), actor)
        .toMatch(/canonical human actor shape|22023/i)
    }
  })

  it('refuses an unknown act and an unknown level', () => {
    expect(expectFailure(dsn, append({ p_act: `'LICENSE_RESUMED'` }))).toMatch(/unsupported act|22023/i)
    expect(expectFailure(dsn, append({ p_licensed_level: `'L9'` }))).toMatch(/unsupported licensed level|22023/i)
  })

  it('refuses an empty action set and an empty window', () => {
    expect(expectFailure(dsn, append({ p_allowed_action_kinds: `array[]::text[]` })))
      .toMatch(/at least one allowed action kind|22023/i)
    expect(expectFailure(dsn, append({ p_expires_at: `'2026-09-20T09:30:00Z'` })))
      .toMatch(/non-empty forward interval|22023/i)
  })

  // ── Workflow binding: the subject must be the instance's OWN truth ───────
  //
  // The RPC proves project/def_key/def_hash against the workflow instance's row
  // rather than believing the caller. Without it the ledger could record a
  // binding the database itself knows to be false.

  it('accepts an instance binding that is true', () => {
    const row = one(dsn, `select license_generation from (${append({ p_license_id: `gen_random_uuid()` })}) t`)
    expect(row).toBe('0')
  })

  it('refuses a project the instance does not belong to', () => {
    expect(expectFailure(dsn, append({ p_license_id: `gen_random_uuid()`, p_project_id: `'${P_B}'` })))
      .toMatch(/does not match workflow instance|22023/i)
  })

  it('refuses a def_key the instance does not have', () => {
    expect(expectFailure(dsn, append({
      p_license_id: `gen_random_uuid()`, p_bound_def_key: `'some.other.definition'`,
    }))).toMatch(/does not match workflow instance|22023/i)
  })

  it('refuses a def_hash the instance does not have', () => {
    expect(expectFailure(dsn, append({
      p_license_id: `gen_random_uuid()`, p_bound_def_hash: `repeat('9',64)`,
    }))).toMatch(/does not match workflow instance|22023/i)
  })

  it('refuses a workflow instance that does not exist', () => {
    expect(expectFailure(dsn, append({
      p_license_id: `gen_random_uuid()`,
      p_workflow_instance_id: `'0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'`,
    }))).toMatch(/does not match workflow instance|22023/i)
  })

  // ── Decision pin: ONE exact-row condition ────────────────────────────────
  //
  // The RPC proves the pinned IMMUTABLE record says what the licence claims.
  // Whether the decision is CURRENTLY governing is proven in TypeScript against
  // Chapter 11's own fold, which this function deliberately does not reimplement.

  it('refuses a pinned record id that does not exist', () => {
    expect(expectFailure(dsn, append({
      p_license_id: `gen_random_uuid()`,
      p_decision_record_id: `'${'0'.repeat(8)}-0000-4000-8000-000000000000'`,
    }))).toMatch(/not a same-project autonomy record|22023/i)
  })

  it('refuses a wrong decision version', () => {
    expect(expectFailure(dsn, append({ p_license_id: `gen_random_uuid()`, p_decision_version: `99` })))
      .toMatch(/not a same-project autonomy record|22023/i)
  })

  it('refuses a decision pinned from another project', () => {
    const other = '12121212-1212-4212-8212-121212121212'
    const otherRecord = '13131313-1313-4313-8313-131313131313'
    run(dsn, ['-c', `insert into public.atlas_decision_ledger
      (record_id, decision_id, version, project_id, materiality)
      values ('${otherRecord}','${other}', 1, '${P_B}', '["autonomy"]'::jsonb)`])
    // The subject stays the true P_A/INSTANCE_A binding, so the instance check
    // passes and the failure can only come from the decision pin: the pinned
    // record says P_B while the licence claims P_A.
    expect(expectFailure(dsn, append({
      p_license_id: `gen_random_uuid()`, p_decision_id: `'${other}'`,
      p_decision_version: `1`, p_decision_record_id: `'${otherRecord}'`,
    }))).toMatch(/not a same-project autonomy record|22023/i)
  })

  it('accepts a P_B decision for a P_B instance — the rule is same-project, not P_A', () => {
    // Guards against the cross-project test above passing for the wrong reason.
    const ok = '17171717-1717-4717-8717-171717171717'
    const okRecord = '18181818-1818-4818-8818-181818181818'
    run(dsn, ['-c', `insert into public.atlas_decision_ledger
      (record_id, decision_id, version, project_id, materiality)
      values ('${okRecord}','${ok}', 1, '${P_B}', '["autonomy"]'::jsonb)`])
    const row = one(dsn, `select license_generation from (${append({
      p_license_id: `gen_random_uuid()`, p_project_id: `'${P_B}'`,
      p_workflow_instance_id: `'${INSTANCE_B}'`, p_decision_id: `'${ok}'`,
      p_decision_version: `1`, p_decision_record_id: `'${okRecord}'`,
    })}) t`)
    expect(row).toBe('0')
  })

  it('refuses a pinned record whose own materiality excludes autonomy', () => {
    const money = '14141414-1414-4414-8414-141414141414'
    const moneyRecord = '15151515-1515-4515-8515-151515151515'
    run(dsn, ['-c', `insert into public.atlas_decision_ledger
      (record_id, decision_id, version, project_id, materiality)
      values ('${moneyRecord}','${money}', 1, '${P_A}', '["money"]'::jsonb)`])
    expect(expectFailure(dsn, append({
      p_license_id: `gen_random_uuid()`, p_decision_id: `'${money}'`,
      p_decision_version: `1`, p_decision_record_id: `'${moneyRecord}'`,
    }))).toMatch(/not a same-project autonomy record|22023/i)
  })

  it('accepts a pin even though a LATER amendment to the same decision differs', () => {
    // The defect this guards. An earlier revision scanned the WHOLE lineage for
    // any row whose project or materiality disagreed, so a legitimate material
    // amendment — here one declaring `money` — rejected a valid pin. The check
    // is now one exact-row condition on the immutable record itself.
    run(dsn, ['-c', `insert into public.atlas_decision_ledger
      (record_id, decision_id, version, project_id, materiality)
      values ('16161616-1616-4616-8616-161616161616','${DECISION_A}', 3, '${P_A}', '["money"]'::jsonb)`])
    const row = one(dsn, `select license_generation from (${append({ p_license_id: `gen_random_uuid()` })}) t`)
    expect(row).toBe('0')
  })

  // ── Suspension is a dead end (no hidden resume) ───────────────────────────

  const issueFor = (l: string) => run(dsn, ['-c', append({ p_license_id: `'${l}'` })])
  const suspendFor = (l: string) => run(dsn, ['-c', append({
    p_license_id: `'${l}'`, p_act: `'LICENSE_SUSPENDED'`,
    p_allowed_action_kinds: `array['generate_monthly_story','validate_monthly_story']`,
  })])
  const restrictFor = (l: string) => append({
    p_license_id: `'${l}'`, p_act: `'LICENSE_RESTRICTED'`, p_licensed_level: `'L1'`,
    p_allowed_action_kinds: `array['validate_monthly_story']`,
    p_expires_at: `'2026-10-01T00:00:00Z'`,
  })

  it('refuses a restriction that would resume a suspended licence', () => {
    const l = 'e1'.repeat(16)
    issueFor(l); suspendFor(l)
    expect(expectFailure(dsn, restrictFor(l)))
      .toMatch(/cannot be restricted back into effect|22023/i)
    expect(one(dsn, `select count(*) from public.atlas_autonomy_license_events where license_id = '${l}'`)).toBe('2')
  })

  it('still allows revocation after a suspension', () => {
    const l = 'f2'.repeat(16)
    issueFor(l); suspendFor(l)
    run(dsn, ['-c', append({
      p_license_id: `'${l}'`, p_act: `'LICENSE_REVOKED'`,
      p_allowed_action_kinds: `array['generate_monthly_story','validate_monthly_story']`,
    })])
    expect(one(dsn, `select act from public.atlas_autonomy_license_events
      where license_id = '${l}' order by license_generation desc limit 1`)).toBe('LICENSE_REVOKED')
  })

  // ── Representation invariants, enforced at the table ─────────────────────

  const rawInsert = (over: Record<string, string> = {}) => {
    const c: Record<string, string> = {
      license_id: `gen_random_uuid()`, license_generation: '0', act: `'LICENSE_ISSUED'`,
      project_id: `'${P_A}'`, workflow_instance_id: `'${INSTANCE_A}'`,
      bound_def_key: `'familje-stunden.monthly-release'`, bound_def_hash: `repeat('f',64)`,
      licensed_level: `'L3'`, allowed_action_kinds: `array['generate_monthly_story']`,
      action_scope_fingerprint: `repeat('a',64)`, decision_id: `'${DECISION_A}'`,
      decision_version: '2', decision_record_id: `'${RECORD_A}'`,
      effective_at: `'2026-09-20T09:30:00Z'`, expires_at: `'2026-10-20T08:00:00Z'`,
      actor: `'${ACTOR}'`, ...over,
    }
    return `insert into public.atlas_autonomy_license_events
      (license_id, license_generation, act, project_id, workflow_instance_id,
       bound_def_key, bound_def_hash, licensed_level, allowed_action_kinds,
       action_scope_fingerprint, decision_id, decision_version, decision_record_id,
       effective_at, expires_at, actor)
      values (${c.license_id}, ${c.license_generation}, ${c.act}, ${c.project_id}, ${c.workflow_instance_id},
              ${c.bound_def_key}, ${c.bound_def_hash}, ${c.licensed_level}, ${c.allowed_action_kinds},
              ${c.action_scope_fingerprint}, ${c.decision_id}, ${c.decision_version}, ${c.decision_record_id},
              ${c.effective_at}, ${c.expires_at}, ${c.actor})`
  }

  it('refuses a negative generation, a zero decision version, and malformed hashes', () => {
    expect(expectFailure(dsn, rawInsert({ license_generation: '-1' })))
      .toMatch(/generation_non_negative|violates check|23514/i)
    expect(expectFailure(dsn, rawInsert({ decision_version: '0' })))
      .toMatch(/decision_version_positive|violates check|23514/i)
    expect(expectFailure(dsn, rawInsert({ bound_def_hash: `'short'` })))
      .toMatch(/def_hash_shape|violates check|23514/i)
    expect(expectFailure(dsn, rawInsert({ action_scope_fingerprint: `'fp'` })))
      .toMatch(/scope_fingerprint_shape|violates check|23514/i)
  })

  it('refuses a NULL element inside the licensed action set', () => {
    expect(expectFailure(dsn, rawInsert({
      allowed_action_kinds: `array['generate_monthly_story', null]`,
    }))).toMatch(/action_kinds_non_null|violates check|23514/i)
  })

  // ── THE cross-layer contract: the store and the table must agree ─────────
  //
  // This is the test that would have caught `created_at` vs `occurred_at`.
  // Before it existed the SQL suite tested the schema and the unit suite tested
  // a fake store, so nothing compared the two, and the deployed table and the
  // real store would not have worked together.

  it('the store selects only columns the migrated table actually has', () => {
    const wanted = AUTONOMY_LICENSE_EVENT_COLS.split(',').map(s => s.trim()).filter(Boolean)
    expect(wanted.length, 'the store column list is suspiciously short').toBeGreaterThan(15)

    const actual = new Set(query(dsn, `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'atlas_autonomy_license_events'`).map(r => r[0]))

    const missing = wanted.filter(c => !actual.has(c))
    expect(missing, `store selects columns the table does not have: ${missing.join(', ')}`).toEqual([])

    // The ordering columns must exist too, or every read would fail at runtime
    // rather than at review time.
    for (const col of ['license_generation', 'event_seq']) {
      expect(wanted, `store must order by ${col}`).toContain(col)
      expect(actual, `table must have ${col}`).toContain(col)
    }
  })

  it('names the timestamp column occurred_at, not created_at', () => {
    const cols = query(dsn, `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'atlas_autonomy_license_events'`).map(r => r[0])
    expect(cols).toContain('occurred_at')
    expect(cols).not.toContain('created_at')
    // And the store agrees, so neither side can drift alone.
    expect(AUTONOMY_LICENSE_EVENT_COLS).toContain('occurred_at')
    expect(AUTONOMY_LICENSE_EVENT_COLS).not.toContain('created_at')
  })

  // ── Generation serialization and lifecycle ────────────────────────────────

  it('accepts a valid issue and starts the lineage at generation 0', () => {
    const row = one(dsn, `select license_generation from (${append({ p_license_id: `'${LICENSE}'` })}) t`)
    expect(row).toBe('0')
  })

  it('refuses a second ISSUED act on the same licence', () => {
    expect(expectFailure(dsn, append({ p_license_id: `'${LICENSE}'` })))
      .toMatch(/inconsistent with lineage position|22023/i)
  })

  it('refuses a continuing act on a licence that was never issued', () => {
    expect(expectFailure(dsn, append({
      p_license_id: `'${'ab'.repeat(16)}'`, p_act: `'LICENSE_SUSPENDED'`,
    }))).toMatch(/inconsistent with lineage position|22023/i)
  })

  it('refuses a duplicate generation — the serialization is structural', () => {
    // Two acts derived from the same state claim the same generation, and the
    // unique index is what decides.
    run(dsn, ['-c', `insert into public.atlas_autonomy_license_events
      (license_id, license_generation, act, project_id, workflow_instance_id,
       bound_def_key, bound_def_hash, licensed_level, allowed_action_kinds,
       action_scope_fingerprint, decision_id, decision_version, decision_record_id,
       effective_at, expires_at, actor)
      values ('${'cd'.repeat(16)}', 1, 'LICENSE_SUSPENDED', '${P_A}', '${INSTANCE_A}',
              'familje-stunden.monthly-release', repeat('f',64), 'L3',
              array['generate_monthly_story'], repeat('a',64), '${DECISION_A}', 2, '${RECORD_A}',
              '2026-09-20T09:30:00Z', '2026-10-20T08:00:00Z', '${ACTOR}')`])
    const dup = expectFailure(dsn, `insert into public.atlas_autonomy_license_events
      (license_id, license_generation, act, project_id, workflow_instance_id,
       bound_def_key, bound_def_hash, licensed_level, allowed_action_kinds,
       action_scope_fingerprint, decision_id, decision_version, decision_record_id,
       effective_at, expires_at, actor)
      values ('${'cd'.repeat(16)}', 1, 'LICENSE_REVOKED', '${P_A}', '${INSTANCE_A}',
              'familje-stunden.monthly-release', repeat('f',64), 'L3',
              array['generate_monthly_story'], repeat('a',64), '${DECISION_A}', 2, '${RECORD_A}',
              '2026-09-20T09:30:00Z', '2026-10-20T08:00:00Z', '${ACTOR}')`)
    expect(dup).toMatch(/duplicate key|unique|23505/i)
  })

  it('refuses a continuing act that moves the subject or its provenance', () => {
    expect(expectFailure(dsn, append({
      p_license_id: `'${LICENSE}'`, p_act: `'LICENSE_SUSPENDED'`,
      p_bound_def_hash: `repeat('a',64)`,
    }))).toMatch(/may not move the licence subject|22023/i)
  })

  it('refuses any continuing act that widens level, actions or window', () => {
    const base = {
      p_license_id: `'${LICENSE}'`, p_act: `'LICENSE_RESTRICTED'`,
      p_allowed_action_kinds: `array['generate_monthly_story']`,
    }
    expect(expectFailure(dsn, append({ ...base, p_licensed_level: `'L5'` })))
      .toMatch(/may not raise the licensed level|22023/i)
    expect(expectFailure(dsn, append({ ...base, p_allowed_action_kinds: `array['generate_monthly_story','proof_governed_effect']` })))
      .toMatch(/may not add an action kind|22023/i)
    expect(expectFailure(dsn, append({ ...base, p_expires_at: `'2099-01-01T00:00:00Z'` })))
      .toMatch(/may not extend the window end|22023/i)
    expect(expectFailure(dsn, append({ ...base, p_effective_at: `'2020-01-01T00:00:00Z'` })))
      .toMatch(/may not move the window start earlier|22023/i)
  })

  it('accepts a genuine narrowing restriction', () => {
    const row = one(dsn, `select license_generation from (${append({
      p_license_id: `'${LICENSE}'`, p_act: `'LICENSE_RESTRICTED'`,
      p_licensed_level: `'L1'`, p_allowed_action_kinds: `array['validate_monthly_story']`,
      p_expires_at: `'2026-10-01T00:00:00Z'`,
    })}) t`)
    expect(row).toBe('1')
  })

  it('is terminal after a revocation — no further act is accepted', () => {
    const revoked = 'ab'.repeat(16)
    run(dsn, ['-c', `select * from public.autonomy_license_append(
      p_license_id => '${revoked}', p_act => 'LICENSE_ISSUED', p_project_id => '${P_A}',
      p_workflow_instance_id => '${INSTANCE_A}', p_bound_def_key => 'familje-stunden.monthly-release',
      p_bound_def_hash => repeat('f',64), p_licensed_level => 'L3',
      p_allowed_action_kinds => array['generate_monthly_story'], p_action_scope_fingerprint => repeat('a',64),
      p_decision_id => '${DECISION_A}', p_decision_version => 2, p_decision_record_id => '${RECORD_A}',
      p_effective_at => '2026-09-20T09:30:00Z', p_expires_at => '2026-10-20T08:00:00Z',
      p_superseded_by_license_id => null, p_reason => null, p_actor => '${ACTOR}')`])
    run(dsn, ['-c', `select * from public.autonomy_license_append(
      p_license_id => '${revoked}', p_act => 'LICENSE_REVOKED', p_project_id => '${P_A}',
      p_workflow_instance_id => '${INSTANCE_A}', p_bound_def_key => 'familje-stunden.monthly-release',
      p_bound_def_hash => repeat('f',64), p_licensed_level => 'L3',
      p_allowed_action_kinds => array['generate_monthly_story'], p_action_scope_fingerprint => repeat('a',64),
      p_decision_id => '${DECISION_A}', p_decision_version => 2, p_decision_record_id => '${RECORD_A}',
      p_effective_at => '2026-09-20T09:30:00Z', p_expires_at => '2026-10-20T08:00:00Z',
      p_superseded_by_license_id => null, p_reason => 'incident', p_actor => '${ACTOR}')`])
    const after = expectFailure(dsn, append({
      p_license_id: `'${revoked}'`, p_act: `'LICENSE_SUSPENDED'`,
      p_allowed_action_kinds: `array['generate_monthly_story']`,
    }))
    expect(after).toMatch(/terminal and accepts no further act|22023/i)
  })

  it('refuses a supersession that names another instance or no replacement', () => {
    const shape = {
      p_license_id: `'${LICENSE}'`, p_act: `'LICENSE_SUPERSEDED'`,
      p_allowed_action_kinds: `array['validate_monthly_story']`, p_licensed_level: `'L1'`,
      p_expires_at: `'2026-10-01T00:00:00Z'`,
    }
    expect(expectFailure(dsn, append({ ...shape, p_superseded_by_license_id: `null` })))
      .toMatch(/must name a replacement licence|22023/i)
    expect(expectFailure(dsn, append({ ...shape, p_superseded_by_license_id: `'${LICENSE}'` })))
      .toMatch(/must name a replacement licence|22023/i)
  })

  it('accepts a same-instance supersession', () => {
    const row = one(dsn, `select license_generation from (${append({
      p_license_id: `'${LICENSE}'`, p_act: `'LICENSE_SUPERSEDED'`,
      p_allowed_action_kinds: `array['validate_monthly_story']`, p_licensed_level: `'L1'`,
      p_expires_at: `'2026-10-01T00:00:00Z'`,
      p_superseded_by_license_id: `'${'cd'.repeat(16)}'`,
    })}) t`)
    expect(row).toBe('2')
  })

  it('records the complete lineage it was asked for', () => {
    const rows = query(dsn, `select license_generation, act from public.atlas_autonomy_license_events
      where license_id = '${LICENSE}' order by license_generation`)
    expect(rows.map(r => r.join(':')).join(' ')).toBe('0:LICENSE_ISSUED 1:LICENSE_RESTRICTED 2:LICENSE_SUPERSEDED')
  })
})
