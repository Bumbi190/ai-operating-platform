/**
 * Phase 2A — survival transition history, proven against REAL PostgreSQL.
 *
 * ── WHY THIS SUITE EXECUTES SQL INSTEAD OF READING IT ───────────────────────
 * Four of this phase's non-negotiables cannot be established by reading the
 * migration text:
 *
 *   * that the ledger cannot be REWRITTEN — an UPDATE/DELETE/TRUNCATE refusing is
 *     a property of the deployed triggers, not of a grep;
 *   * that `from_state` cannot be chosen by the caller — a trigger that re-derives
 *     the predecessor from the ledger is the only thing that proves it;
 *   * that two CONCURRENT observers produce one transition rather than two — which
 *     needs two real backends and a real lock;
 *   * that recording history moves NEITHER spend nor the automation pause — which
 *     needs the neighbours present to be checked.
 *
 * Follows the harness of `unified-stop-authority-sql.test.ts`: SKIPS loudly with
 * no local Postgres, and FAILS instead of skipping wherever proof is required
 * (CI=true or ATLAS_SQL_TEST_REQUIRED=1). A green run that skipped this proves
 * nothing about the ledger.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
const MIGRATION = join(process.cwd(), 'supabase/migrations/20260923120000_survival_state_events.sql')

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

/** Runs SQL expected to fail; returns the error text (or '' if it wrongly succeeded). */
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
    execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'],
      { stdio: 'pipe', timeout: 10_000 })
    return true
  } catch { return false }
})()

const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'

if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn(
    '[survival-history-sql] SKIPPED — no reachable local Postgres. The Phase 2A ' +
    'survival ledger (append-only enforcement, chain integrity, concurrency) was ' +
    'NOT proven in this run. Set ATLAS_SQL_TEST_URL to enable it.',
  )
}

const DB_NAME = `omnira_surv_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

const P_A = '11111111-1111-1111-1111-111111111111'
const P_B = '22222222-2222-2222-2222-222222222222'
const P_R = '44444444-4444-4444-4444-444444444444'
/** Dedicated to the actor-identity proofs, which must not perturb another stream. */
const P_S = '55555555-5555-5555-5555-555555555555'
const MISSING = '99999999-9999-9999-9999-999999999999'

const FIXTURE = `
create extension if not exists pgcrypto;

do $do$ begin
  if not exists (select 1 from pg_roles where rolname='service_role')
    then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='anon')
    then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated')
    then create role authenticated; end if;
end $do$;

-- REPRODUCE PRODUCTION'S DEFAULT ACL. Without this the fixture is greenfield,
-- service_role starts with nothing, and the revoke would be a no-op — the same
-- trap that let a migration pass every source-reading test and fail in production.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
-- Functions too. PostgreSQL grants EXECUTE on new functions to PUBLIC by
-- default, so a greenfield fixture would already look "revoked" for anon and
-- authenticated and the revoke would prove nothing. Reproducing the default ACL
-- is what makes the privilege assertions below load-bearing.
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text,
  execution_paused boolean not null default false,
  paused_at timestamptz,
  paused_reason text);

-- Neighbours that must NOT move when history is recorded.
create table public.platform_config (
  id int primary key default 1,
  automation_paused boolean not null default false);
create table public.spend_reservations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  estimated_sek numeric not null default 0);

insert into public.platform_config (id, automation_paused) values (1, false);
insert into public.projects (id, slug) values
  ('${P_A}', 'alpha'),
  ('${P_B}', 'beta'),
  ('${P_R}', 'rho'),
  ('${P_S}', 'sigma');
`

const d = AVAILABLE ? describe : describe.skip

beforeAll(() => {
  if (!AVAILABLE) {
    if (SQL_REQUIRED) {
      throw new Error(
        '[survival-history-sql] Postgres REQUIRED but unreachable. The Phase 2A ' +
        'survival ledger cannot be proven; failing rather than skipping.')
    }
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

// ── Helpers ─────────────────────────────────────────────────────────────────

interface Observe {
  project?: string
  to: string
  level?: string
  reasons?: string[]
  gaps?: string[]
  scope?: string | null
  limit?: string | null
  remaining?: string | null
  burn?: string | null
  funding?: string
  declared?: string | null
  runway?: string | null
  trend?: string | null
  paused?: boolean
  threshold?: string
  version?: number
  actor?: string
  provenance?: string
  occurredAt?: string
}

/** The RPC call as SQL text, with production-shaped defaults. */
function rpc(o: Observe): string {
  const arr = (xs: string[]) => (xs.length ? `array[${xs.map(x => `'${x}'`).join(',')}]::text[]` : `array[]::text[]`)
  const args = [
    `'${o.project ?? P_A}'`,
    `'${o.to}'`,
    `'${o.level ?? 'L3'}'`,
    arr(o.reasons ?? ['headroom_healthy']),
    arr(o.gaps ?? []),
    o.scope === undefined ? `'global_monthly'` : (o.scope === null ? 'null' : `'${o.scope}'`),
    o.limit === undefined ? '1500' : (o.limit === null ? 'null' : o.limit),
    o.remaining === undefined ? '1301.53' : (o.remaining === null ? 'null' : o.remaining),
    o.burn === undefined ? '8.3' : (o.burn === null ? 'null' : o.burn),
    `'${o.funding ?? 'UNDECLARED'}'`,
    o.declared === undefined || o.declared === null ? 'null' : o.declared,
    o.runway === undefined || o.runway === null ? 'null' : o.runway,
    o.trend === undefined ? 'null' : (o.trend === null ? 'null' : o.trend),
    o.paused === undefined ? 'false' : String(o.paused),
    `'${o.threshold ?? 'provisional'}'`,
    String(o.version ?? 1),
    `'${o.actor ?? 'atlas.survival_recorder'}'`,
    `'${o.provenance ?? 'atlas.survival.observation.v1'}'`,
    o.occurredAt ?? 'now()',
  ]
  return `public.survival_record_observation(${args.join(', ')})`
}

const call = (o: Observe) => one(dsn, `select result from ${rpc(o)}`)
const count = (project = P_A) =>
  Number(one(dsn, `select count(*) from public.survival_state_events where project_id = '${project}'`))
const latest = (project = P_A) =>
  one(dsn, `select coalesce(from_state, '<null>') || '->' || to_state
              from public.survival_state_events
             where project_id = '${project}' order by event_seq desc limit 1`)

/** One observation in its own process and transaction, held open so a second
 *  caller genuinely overlaps it. A separate backend is the whole point. */
function concurrentObserve(o: Observe, holdMs: number): Promise<string> {
  const sql = holdMs > 0
    ? `begin; select result from ${rpc(o)}; select pg_sleep(${(holdMs / 1000).toFixed(3)}); commit;`
    : `begin; select result from ${rpc(o)}; commit;`
  return new Promise((resolve, reject) => {
    const p = spawn(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', sql],
      { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', d2 => { out += d2 })
    p.on('close', () => resolve(
      out.split('\n').map(l => l.trim())
        .find(l => l === 'baseline_recorded' || l === 'transition_recorded' || l === 'unchanged') ?? ''))
    p.on('error', reject)
  })
}

// ── Contract ────────────────────────────────────────────────────────────────

describe('survival history · contract', () => {
  it('creates exactly one table, and grants write to nobody', () => {
    expect(one(dsn, `select count(*) from information_schema.tables
                     where table_schema='public' and table_name='survival_state_events'`)).toBe('1')
    // SELECT yes, INSERT no — the only writer is the SECURITY DEFINER function.
    expect(one(dsn, `select has_table_privilege('service_role','public.survival_state_events','SELECT')`)).toBe('t')
    expect(one(dsn, `select has_table_privilege('service_role','public.survival_state_events','INSERT')`)).toBe('f')
    expect(one(dsn, `select has_table_privilege('service_role','public.survival_state_events','UPDATE')`)).toBe('f')
    expect(one(dsn, `select has_table_privilege('service_role','public.survival_state_events','DELETE')`)).toBe('f')
    expect(one(dsn, `select has_table_privilege('anon','public.survival_state_events','INSERT')`)).toBe('f')
  })

  it('denies INSERT to every role while letting the boundary INSERT', () => {
    const err = expectFailure(dsn,
      `set role service_role; insert into public.survival_state_events
       (project_id, event_type, to_state, autonomy_level, funding_state,
        threshold_status, derivation_version, actor_principal, provenance, occurred_at)
       values ('${P_B}','BASELINE_OBSERVED','NORMAL','L6','UNDECLARED','provisional',1,'x','y', now())`)
    expect(err).toMatch(/permission denied|42501/i)
    expect(count(P_B)).toBe(0)
  })
})

// ── The boundary is the only writer, and it is hardened ─────────────────────

describe('survival history · the recording boundary is hardened', () => {
  const SIG = `public.survival_record_observation(
    uuid, text, text, text[], text[], text, numeric, numeric, numeric,
    text, numeric, numeric, numeric, boolean, text, integer, text, text, timestamptz)`
  const fn = (privilege: string, role: string) =>
    one(dsn, `select has_function_privilege('${role}', '${SIG}', '${privilege}')`)

  it('is SECURITY DEFINER with an empty, fixed search_path', () => {
    // DEFINER is required: the caller holds SELECT only, so an INVOKER function
    // could not insert. The empty search_path removes the search-path hijack
    // surface a DEFINER function otherwise opens — every reference inside must
    // then be schema-qualified, which the ordering test below also asserts.
    const row = one(dsn, `select case when p.prosecdef then 't' else 'f' end || '|' || coalesce(array_to_string(p.proconfig, ','), '')
                          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'survival_record_observation'`)
    const [definer, config] = row.split('|')
    expect(definer).toBe('t')
    expect(config).toMatch(/search_path=/)
    expect(config).not.toMatch(/search_path=[^,]*\w/)   // empty, not a schema list
  })

  it('PUBLIC, anon and authenticated cannot execute it', () => {
    // PUBLIC is a pseudo-role, so it is proven from the ACL: the PUBLIC entry is
    // the one with an empty grantee, spelled `=X/<owner>`. Its presence is what
    // PostgreSQL grants new functions by default, and it is what the revoke must
    // have removed. anon/authenticated are real roles and are asked directly.
    const acl = one(dsn, `select coalesce(array_to_string(p.proacl, ','), '<null>')
                          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'survival_record_observation'`)
    expect(acl).not.toBe('<null>')                 // a null ACL means the default, i.e. PUBLIC EXECUTE
    expect(acl).not.toMatch(/(^|,)=X\//)           // no empty-grantee (PUBLIC) entry
    for (const role of ['anon', 'authenticated']) {
      expect(fn('EXECUTE', role), role).toBe('f')
    }
  })

  it('service_role holds EXECUTE and nothing broader', () => {
    // EXECUTE is the only grantable privilege on a function. The owner's own
    // entry is EXPECTED — revoking PUBLIC's default materialises the ACL and
    // writes the owner's implicit rights into it — so the claim is about the
    // grantee set: every non-owner entry must be the service_role EXECUTE grant,
    // and there must be exactly one of them.
    const [acl, owner] = one(dsn, `select coalesce(array_to_string(p.proacl, ','), '<null>') || '~' || pg_get_userbyid(p.proowner)
                          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'survival_record_observation'`).split('~')
    expect(fn('EXECUTE', 'service_role')).toBe('t')
    const nonOwner = acl.split(',').filter(e => e && !e.startsWith(`${owner}=`))
    expect(nonOwner).toHaveLength(1)
    expect(nonOwner[0]).toMatch(/^service_role=X\//)
  })

  it('refuses a human or arbitrary actor, even on a direct RPC call', () => {
    // A survival observation is not a human authority act. If a caller could
    // record `owner`, the ledger would assert that a person decided something.
    // The closed vocabulary makes that a database refusal, not a convention.
    expect(one(dsn, `select pg_get_constraintdef(oid) from pg_constraint
                     where conname = 'survival_events_actor_machine_identity'`))
      .toContain('atlas.survival_recorder')
    for (const actor of ['owner', 'atlas', 'service_role', 'someone@example.com']) {
      const err = expectFailure(dsn, `select * from ${rpc({ project: P_S, to: 'CRITICAL', actor })}`)
      expect(err, actor).toMatch(/actor_machine_identity|violates check constraint|23514/i)
    }
    expect(one(dsn, `select count(*)::text from public.survival_state_events where project_id='${P_S}'`)).toBe('0')
    // …and the canonical machine identity still records.
    expect(call({ project: P_S, to: 'CRITICAL' })).toBe('baseline_recorded')
  })

  it('service_role cannot write the table or the sequence directly', () => {
    for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      expect(one(dsn, `select has_table_privilege('service_role','public.survival_state_events','${privilege}')`), privilege).toBe('f')
    }
    // The identity sequence carries its own ACL: `revoke ... on table` does not
    // reach it. An unrevoked sequence let anon/authenticated/service_role keep
    // rwU, so USAGE (nextval) and UPDATE (setval) were both reachable.
    const seq = `'public.survival_state_events_event_seq_seq'::regclass`
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const privilege of ['USAGE', 'SELECT', 'UPDATE']) {
        expect(one(dsn, `select has_sequence_privilege('${role}', ${seq}, '${privilege}')`), `${role}.${privilege}`).toBe('f')
      }
    }
  })

  it('a real anon/authenticated session is refused, and service_role is not', () => {
    // has_*_privilege is a catalog reading. These are live sessions, so the
    // refusal is observed rather than inferred.
    const asAnon = expectFailure(dsn, `set role anon; select * from public.survival_record_observation(
      '${P_B}', 'NORMAL', 'L6', array[]::text[], array[]::text[], 'global_monthly',
      1500, 1301.53, 8.3, 'UNDECLARED', null, null, null, false,
      'provisional', 1, 'atlas.survival_recorder', 'atlas.survival.observation.v1', now())`)
    expect(asAnon).toMatch(/permission denied|42501/i)
    expect(one(dsn, `select coalesce(count(*),0)::text from public.survival_state_events where project_id='${P_B}'`)).toBe('0')
  })

  it('takes no from_state argument at all, and locks before it derives', () => {
    // The strongest form of "the caller cannot choose its predecessor": the
    // parameter does not exist, so there is nothing to forge. A caller with
    // direct INSERT is still refused by the guard trigger (tested above).
    const sql = readFileSync(MIGRATION, 'utf8')
    const body = sql.slice(sql.indexOf('function public.survival_record_observation'))
    const signature = body.slice(0, body.indexOf(') returns table'))
    expect(signature).not.toMatch(/p_from_state|from_state/)
    // Lock BEFORE deriving, so two concurrent callers serialise on the project
    // row rather than both reading the same predecessor.
    const lockAt = body.indexOf('for update')
    const deriveAt = body.indexOf('from public.survival_state_events')
    expect(lockAt).toBeGreaterThan(-1)
    expect(deriveAt).toBeGreaterThan(-1)
    expect(lockAt).toBeLessThan(deriveAt)
  })
})

// ── Transitions ─────────────────────────────────────────────────────────────

describe('survival history · records transitions, not polling noise', () => {
  it('records exactly one baseline for the first observation', () => {
    expect(call({ to: 'CONSERVE' })).toBe('baseline_recorded')
    expect(count()).toBe(1)
    expect(one(dsn, `select coalesce(from_state,'<null>') from public.survival_state_events where project_id='${P_A}'`)).toBe('<null>')
    expect(latest()).toBe('<null>->CONSERVE')
  })

  it('records nothing when the same state is observed again', () => {
    expect(call({ to: 'CONSERVE' })).toBe('unchanged')
    expect(call({ to: 'CONSERVE' })).toBe('unchanged')
    expect(count()).toBe(1)
  })

  it('records exactly one transition when the state really changes', () => {
    expect(call({ to: 'CRITICAL' })).toBe('transition_recorded')
    expect(count()).toBe(2)
    expect(latest()).toBe('CONSERVE->CRITICAL')
  })

  it('keeps event_seq as the chain order and goes back to NORMAL', () => {
    expect(call({ to: 'NORMAL' })).toBe('transition_recorded')
    expect(count()).toBe(3)
    expect(latest()).toBe('CRITICAL->NORMAL')
    expect(one(dsn, `select string_agg(to_state, '>' order by event_seq)
                     from public.survival_state_events where project_id='${P_A}'`))
      .toBe('CONSERVE>CRITICAL>NORMAL')
  })

  it('answers `unchanged` for a no-op rather than inserting', () => {
    expect(call({ to: 'NORMAL' })).toBe('unchanged')
    expect(count()).toBe(3)
  })
})

// ── The predecessor belongs to the ledger ───────────────────────────────────

describe('survival history · from_state is never the caller’s', () => {
  it('refuses a direct INSERT whose from_state does not follow the ledger', () => {
    const err = expectFailure(dsn,
      `insert into public.survival_state_events
       (project_id, event_type, from_state, to_state, autonomy_level, funding_state,
        threshold_status, derivation_version, actor_principal, provenance, occurred_at)
       values ('${P_A}','STATE_TRANSITION_OBSERVED','HIBERNATE','EXPAND','L6','UNDECLARED',
               'provisional',1,'x','y', now())`)
    expect(err).toMatch(/does not follow the recorded state/)
    expect(count()).toBe(3)
  })

  it('refuses a second baseline for a project that already has history', () => {
    const err = expectFailure(dsn,
      `insert into public.survival_state_events
       (project_id, event_type, from_state, to_state, autonomy_level, funding_state,
        threshold_status, derivation_version, actor_principal, provenance, occurred_at)
       values ('${P_A}','BASELINE_OBSERVED',null,'NORMAL','L6','UNDECLARED',
               'provisional',1,'x','y', now())`)
    expect(err).toMatch(/cannot open a second baseline|first event for a project must be BASELINE/)
    expect(count()).toBe(3)
  })

  it('refuses a transition that does not change the state', () => {
    const err = expectFailure(dsn,
      `insert into public.survival_state_events
       (project_id, event_type, from_state, to_state, autonomy_level, funding_state,
        threshold_status, derivation_version, actor_principal, provenance, occurred_at)
       values ('${P_A}','STATE_TRANSITION_OBSERVED','NORMAL','NORMAL','L6','UNDECLARED',
               'provisional',1,'x','y', now())`)
    expect(err).toMatch(/must change the state|survival_events_shape/)
  })
})

// ── Immutability ────────────────────────────────────────────────────────────

describe('survival history · append-only, enforced by the database', () => {
  it('refuses UPDATE', () => {
    const err = expectFailure(dsn, `update public.survival_state_events set to_state = 'EXPAND' where project_id='${P_A}'`)
    expect(err).toMatch(/append-only|42501/i)
    expect(count()).toBe(3)
  })

  it('refuses DELETE', () => {
    const err = expectFailure(dsn, `delete from public.survival_state_events where project_id='${P_A}'`)
    expect(err).toMatch(/append-only|42501/i)
    expect(count()).toBe(3)
  })

  it('refuses TRUNCATE', () => {
    const err = expectFailure(dsn, `truncate public.survival_state_events`)
    expect(err).toMatch(/append-only|42501/i)
    expect(count()).toBe(3)
  })
})

// ── Vocabulary ──────────────────────────────────────────────────────────────

describe('survival history · closed vocabularies', () => {
  // Read INSIDE the test, never at collection time: the database the constraint
  // lives in does not exist until beforeAll has run.
  const constraintDefinitions = () =>
    new Map<string, string>(
      query(dsn, `select conname, pg_get_constraintdef(oid) from pg_constraint
                  where conrelid = 'public.survival_state_events'::regclass`)
        .map(r => [r[0], r[1]] as [string, string]),
    )

  it('closes the event, state, ceiling, funding and threshold vocabularies', () => {
    const definitions = constraintDefinitions()
    const has = (constraint: string, ...members: string[]) => {
      const def = definitions.get(constraint)
      expect(def, constraint).toBeDefined()
      for (const m of members) expect(def, `${constraint} missing ${m}`).toContain(m)
    }
    has('survival_events_event_type_valid', 'BASELINE_OBSERVED', 'STATE_TRANSITION_OBSERVED')
    has('survival_events_to_state_valid', 'EXPAND', 'NORMAL', 'CONSERVE', 'CRITICAL', 'HIBERNATE')
    has('survival_events_from_state_valid', 'HIBERNATE')
    has('survival_events_autonomy_level_valid', 'L0', 'L6')
    has('survival_events_funding_state_valid', 'KNOWN', 'UNDECLARED', 'UNAVAILABLE')
    has('survival_events_threshold_status_valid', 'provisional', 'canonical')
    has('survival_events_reasons_valid', 'funding_undeclared', 'funding_unavailable', 'funding_depleted')
    has('survival_events_gaps_valid', 'runway_unknown', 'infrastructure_cost_untracked')
    has('survival_events_declared_funding_matches_state', "funding_state = 'KNOWN'")
    has('survival_events_amounts_non_negative', 'binding_remaining_sek')
    has('survival_events_shape', 'BASELINE_OBSERVED')
  })

  it('seeds a project with history so the CHECKs, not the guard, are under test', () => {
    expect(call({ project: P_B, to: 'NORMAL', level: 'L6' })).toBe('baseline_recorded')
    expect(latest(P_B)).toBe('<null>->NORMAL')
  })

  it('refuses a value outside each closed set, by CHECK', () => {
    // from_state is derived correctly and to_state differs from the recorded
    // state, so the guard is satisfied and the CHECK is what refuses.
    const probes: Array<[string, string]> = [
      ['to_state', rpc({ project: P_B, to: 'DORMANT' })],
      ['autonomy_level', rpc({ project: P_B, to: 'CONSERVE', level: 'L9' })],
      ['funding_state', rpc({ project: P_B, to: 'CONSERVE', funding: 'MAYBE' })],
      ['threshold_status', rpc({ project: P_B, to: 'CONSERVE', threshold: 'draft' })],
      ['reasons', rpc({ project: P_B, to: 'CONSERVE', reasons: ['vibes_are_bad'] })],
      ['gaps', rpc({ project: P_B, to: 'CONSERVE', gaps: ['unknown_thing'] })],
      ['binding_scope', rpc({ project: P_B, to: 'CONSERVE', scope: 'galaxy_monthly' })],
    ]
    for (const [column, sql] of probes) {
      expect(expectFailure(dsn, `select * from ${sql}`), column).toMatch(/violates check constraint|check/i)
    }
    expect(count(P_B)).toBe(1)
  })

  it('refuses a declared funding amount unless funding is KNOWN, and a negative amount', () => {
    for (const funding of ['UNDECLARED', 'UNAVAILABLE']) {
      const err = expectFailure(dsn, `select * from ${rpc({ project: P_B, to: 'CONSERVE', funding, declared: '5000' })}`)
      expect(err, funding).toMatch(/survival_events_declared_funding_matches_state|violates check/i)
    }
    expect(expectFailure(dsn, `select * from ${rpc({ project: P_B, to: 'CONSERVE', remaining: '-5' })}`))
      .toMatch(/survival_events_amounts_non_negative|violates check/i)
    expect(count(P_B)).toBe(1)
  })

  it('refuses an unknown event type, which can only arrive by direct INSERT', () => {
    // The boundary itself can only write the two canonical types, so the only way
    // to reach the CHECK is a direct write — and the guard refuses that first.
    const err = expectFailure(dsn,
      `insert into public.survival_state_events
       (project_id, event_type, from_state, to_state, autonomy_level, funding_state,
        threshold_status, derivation_version, actor_principal, provenance, occurred_at)
       values ('${P_B}','SURVIVAL_DRIFTED','NORMAL','CONSERVE','L3','UNDECLARED',
               'provisional',1,'x','y', now())`)
    expect(err).toMatch(/survival history|cannot open a second baseline/)
    expect(count(P_B)).toBe(1)
  })

  it('refuses an unknown project, fail-closed', () => {
    const err = expectFailure(dsn, `select * from ${rpc({ to: 'NORMAL', project: MISSING })}`)
    expect(err).toMatch(/does not exist/)
    expect(count(MISSING)).toBe(0)
  })
})

// ── Round trip ──────────────────────────────────────────────────────────────

describe('survival history · the observation survives the round trip', () => {
  it('preserves reasons, gaps, ceiling, funding and the distinct funding states', () => {
    // P_R is dedicated to this block, so the first observation is a baseline
    // regardless of what the blocks above did to P_A or P_B.
    expect(call({
      project: P_R, to: 'CONSERVE', level: 'L3',
      reasons: ['headroom_healthy', 'funding_undeclared'],
      gaps: ['funding_undeclared', 'runway_unknown'],
      funding: 'UNDECLARED', scope: 'global_monthly', remaining: '1301.53', limit: '1500',
    })).toBe('baseline_recorded')

    const row = query(dsn, `select autonomy_level, funding_state, reasons::text, gaps::text,
                                   binding_scope, binding_remaining_sek, declared_funding_sek
                            from public.survival_state_events where project_id='${P_R}'`)[0]
    expect(row[0]).toBe('L3')
    expect(row[1]).toBe('UNDECLARED')
    expect(row[2]).toContain('funding_undeclared')
    expect(row[3]).toContain('runway_unknown')
    expect(row[4]).toBe('global_monthly')
    expect(row[5]).toBe('1301.53')
    expect(row[6]).toBe('')  // NULL declared funding — not zero.
  })

  it('keeps UNAVAILABLE distinct from UNDECLARED', () => {
    expect(call({ project: P_R, to: 'CRITICAL', level: 'L1', funding: 'UNAVAILABLE',
                  reasons: ['funding_unavailable'], gaps: ['funding_unavailable'] }))
      .toBe('transition_recorded')
    expect(one(dsn, `select funding_state from public.survival_state_events
                     where project_id='${P_R}' order by event_seq desc limit 1`)).toBe('UNAVAILABLE')
    // …and it is a different token from the baseline's.
    expect(one(dsn, `select count(distinct funding_state) from public.survival_state_events
                     where project_id='${P_R}'`)).toBe('2')
  })

  it('stores declared funding when KNOWN, and only then', () => {
    expect(call({ project: P_R, to: 'NORMAL', level: 'L6', funding: 'KNOWN', declared: '120000',
                  runway: '1445.78', trend: '12' })).toBe('transition_recorded')
    const row = query(dsn, `select funding_state, declared_funding_sek, runway_days, revenue_trend_sek
                            from public.survival_state_events
                            where project_id='${P_R}' order by event_seq desc limit 1`)[0]
    expect(row[0]).toBe('KNOWN')
    expect(row[1]).toBe('120000')
    expect(row[2]).toBe('1445.78')
    expect(row[3]).toBe('12')
  })

  it('keeps MRR a SIGNAL — it never becomes runway, and runway stays unknown without funding', () => {
    // A loud revenue trend with undeclared funding.
    expect(call({ project: P_R, to: 'CONSERVE', level: 'L3', funding: 'UNDECLARED',
                  trend: '999999',
                  reasons: ['funding_undeclared'], gaps: ['runway_unknown'] }))
      .toBe('transition_recorded')
    const row = query(dsn, `select revenue_trend_sek, runway_days, declared_funding_sek
                            from public.survival_state_events
                            where project_id='${P_R}' order by event_seq desc limit 1`)[0]
    expect(row[0]).toBe('999999')   // recorded as the signal it is
    expect(row[1]).toBe('')         // NOT converted into runway
    expect(row[2]).toBe('')         // NOT converted into cash

    // There is no cash/runway column that could hold an MRR-derived figure.
    const cols = query(dsn, `select column_name from information_schema.columns
                             where table_schema='public' and table_name='survival_state_events'`)
      .flat().join(' ')
    for (const forbidden of ['cash', 'mrr', 'balance', 'available_funds']) {
      expect(cols, forbidden).not.toContain(forbidden)
    }
  })

  it('records the observation instant separately from the write instant', () => {
    expect(call({ project: P_R, to: 'CRITICAL', level: 'L1', occurredAt: `timestamptz '2026-09-01 00:00:00+00'` }))
      .toBe('transition_recorded')
    const row = query(dsn, `select occurred_at::date::text, (recorded_at > occurred_at)::text
                            from public.survival_state_events
                            where project_id='${P_R}' order by event_seq desc limit 1`)[0]
    expect(row[0]).toBe('2026-09-01')
    expect(row[1]).toBe('true')
  })

  it('refuses an occurred_at in the future', () => {
    const err = expectFailure(dsn,
      `select * from ${rpc({ project: P_R, to: 'NORMAL', occurredAt: `timestamptz '2099-01-01 00:00:00+00'` })}`)
    expect(err).toMatch(/may not be in the future/)
  })
})

// ── Concurrency ─────────────────────────────────────────────────────────────

describe('survival history · concurrency cannot duplicate a logical transition', () => {
  it('two concurrent FIRST observations produce ONE baseline', async () => {
    const before = count(P_B)
    // Reset P_B to no history by using a fresh project for this proof.
    one(dsn, `insert into public.projects (id, slug) values
              ('33333333-3333-3333-3333-333333333333','gamma') on conflict do nothing`)
    const G = '33333333-3333-3333-3333-333333333333'

    const [a, b] = await Promise.all([
      concurrentObserve({ project: G, to: 'CONSERVE' }, 700),
      concurrentObserve({ project: G, to: 'CONSERVE' }, 0),
    ])
    expect(count(G)).toBe(1)
    expect([a, b].sort()).toEqual(['baseline_recorded', 'unchanged'])
    expect(count(P_B)).toBe(before)
  })

  it('two concurrent observers of the SAME change produce ONE transition', async () => {
    const G = '33333333-3333-3333-3333-333333333333'
    const before = count(G)
    expect(latest(G)).toBe('<null>->CONSERVE')

    const [a, b] = await Promise.all([
      concurrentObserve({ project: G, to: 'CRITICAL', level: 'L1' }, 700),
      concurrentObserve({ project: G, to: 'CRITICAL', level: 'L1' }, 0),
    ])
    expect(count(G)).toBe(before + 1)
    expect(latest(G)).toBe('CONSERVE->CRITICAL')
    expect([a, b].sort()).toEqual(['transition_recorded', 'unchanged'])
  })

  it('a retry of the same observation is idempotent', () => {
    const G = '33333333-3333-3333-3333-333333333333'
    const before = count(G)
    for (let i = 0; i < 5; i++) expect(call({ project: G, to: 'CRITICAL', level: 'L1' })).toBe('unchanged')
    expect(count(G)).toBe(before)
  })
})

// ── Recording disturbs nothing ──────────────────────────────────────────────

describe('survival history · recording changes neither spend nor the stop', () => {
  it('leaves the automation pause and the spend ledger untouched', () => {
    const pausedBefore = one(dsn, `select automation_paused from public.platform_config where id=1`)
    const spendBefore = one(dsn, `select count(*) from public.spend_reservations`)
    const G = '33333333-3333-3333-3333-333333333333'

    expect(call({ project: G, to: 'HIBERNATE', level: 'L0' })).toBe('transition_recorded')
    expect(call({ project: G, to: 'NORMAL', level: 'L6' })).toBe('transition_recorded')

    expect(one(dsn, `select automation_paused from public.platform_config where id=1`)).toBe(pausedBefore)
    expect(one(dsn, `select count(*) from public.spend_reservations`)).toBe(spendBefore)
    expect(one(dsn, `select execution_paused from public.projects where id='${G}'`)).toBe('f')
  })
})
