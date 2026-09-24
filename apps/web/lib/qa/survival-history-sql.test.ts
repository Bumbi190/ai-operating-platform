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
/** Phase 2B alters objects Phase 2A created, so the deployed state is BOTH. */
const MIGRATION_2B = join(process.cwd(), 'supabase/migrations/20260924120000_survival_funding_phase2b.sql')

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
/** Kept EMPTY: direct-INSERT constraint probes need a project with no history,
 *  or the guard refuses the probe before the CHECK under test is reached. */
const P_C = '66666666-6666-6666-6666-666666666666'
/** Dedicated to the funding-biconditional probes, whose whole point is that the
 *  state CHANGES — an unchanged observation short-circuits before any CHECK. */
const P_D = '77777777-7777-7777-7777-777777777777'
/** Dedicated to negative (overspent) headroom evidence. */
const P_E = '88888888-8888-8888-8888-888888888888'
/**
 * Dedicated to the coverage/runway coherence probes: the refused probe must
 * leave a stream untouched, and the accepted probe must not perturb another.
 *
 * Their slugs are purpose-named rather than another Greek letter on purpose.
 * `slug` is UNIQUE, and the concurrency suite inserts its own project with
 * `on conflict do nothing` — so a slug collision here would silently prevent
 * THAT fixture from being created and fail four unrelated tests (which is
 * exactly what happened when these first used the slug 'gamma').
 */
const P_F = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const P_G = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
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
  ('${P_S}', 'sigma'),
  ('${P_C}', 'chi'),
  ('${P_D}', 'delta'),
  ('${P_E}', 'epsilon'),
  ('${P_F}', 'coverage-refused'),
  ('${P_G}', 'coverage-accepted');
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
  run(dsn, ['-f', MIGRATION_2B])
})

afterAll(() => {
  if (!AVAILABLE) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DB_NAME}" with (force)`]) } catch { /* best effort */ }
})

// ── Helpers ─────────────────────────────────────────────────────────────────

interface Observe {
  project?: string
  to: string
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
  /** Runway coverage. Undefined = PLATFORM_COMPLETE (the v2 default for tests). */
  coverage?: string | null
  occurredAt?: string
}

/**
 * The RPC call as SQL text, with production-shaped defaults.
 *
 * There are deliberately NO arguments here for the autonomy ceiling, the actor
 * or the provenance. They are not parameters any more: the boundary derives all
 * three, and a helper that could still pass them would let a test assert a shape
 * the function cannot have.
 */
function rpc(o: Observe): string {
  const arr = (xs: string[]) => (xs.length ? `array[${xs.map(x => `'${x}'`).join(',')}]::text[]` : `array[]::text[]`)
  const args = [
    `'${o.project ?? P_A}'`,
    `'${o.to}'`,
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
    String(o.version ?? 2),
    o.coverage === undefined ? `'PLATFORM_COMPLETE'` : (o.coverage === null ? 'null' : `'${o.coverage}'`),
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
  // The argument list must track the function exactly. has_function_privilege
  // resolves by signature, and a stale list resolves to a function that does not
  // exist — which PostgreSQL reports as an ERROR, not as "false", so a mismatch
  // fails loudly rather than quietly proving nothing.
  const SIG = `public.survival_record_observation(
    uuid, text, text[], text[], text, numeric, numeric, numeric,
    text, numeric, numeric, numeric, boolean, text, integer, text, timestamptz)`
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

  it('has no autonomy, actor or provenance parameter at all', () => {
    // The strongest form of each claim: there is nothing to forge. The ceiling
    // is a function of the state and the identity is the recorder's own, so
    // neither is expressible by a caller — not merely refused after the fact.
    const args = one(dsn, `select pg_get_function_arguments(p.oid)
                           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and p.proname = 'survival_record_observation'`)
    for (const forbidden of ['p_autonomy_level', 'p_actor_principal', 'p_provenance']) {
      expect(args, `still accepts ${forbidden}`).not.toContain(forbidden)
    }
    expect(args).toContain('p_to_state')
    expect(args).toContain('p_derivation_version')
    expect(args).toContain('p_threshold_status')
  })

  it('refuses a human or arbitrary actor, even on a direct INSERT', () => {
    // A survival observation is not a human authority act. If a caller could
    // record `owner`, the ledger would assert that a person decided something.
    // The closed vocabulary makes that a database refusal, not a convention —
    // and the RPC no longer takes the value, so only a privileged direct INSERT
    // can even attempt it.
    expect(one(dsn, `select pg_get_constraintdef(oid) from pg_constraint
                     where conname = 'survival_events_actor_machine_identity'`))
      .toContain('atlas.survival_recorder')
    expect(one(dsn, `select pg_get_constraintdef(oid) from pg_constraint
                     where conname = 'survival_events_provenance_machine_identity'`))
      .toContain('atlas.survival.observation.v1')
    const insertAsOwner = (actor: string, provenance: string) =>
      `insert into public.survival_state_events
        (project_id, event_type, to_state, autonomy_level, funding_state,
         threshold_status, derivation_version, actor_principal, provenance, occurred_at)
       values ('${P_C}','BASELINE_OBSERVED','NORMAL','L6','UNDECLARED',
               'provisional',1,'${actor}','${provenance}', now())`
    for (const actor of ['owner', 'atlas', 'service_role', 'someone@example.com']) {
      const err = expectFailure(dsn, insertAsOwner(actor, 'atlas.survival.observation.v1'))
      expect(err, actor).toMatch(/actor_machine_identity|violates check constraint|23514/i)
    }
    for (const provenance of ['owner said so', 'manual_privileged', '']) {
      const err = expectFailure(dsn, insertAsOwner('atlas.survival_recorder', provenance))
      expect(err, `provenance ${JSON.stringify(provenance)}`)
        .toMatch(/provenance_machine_identity|violates check constraint|23514/i)
    }
    expect(count(P_S)).toBe(0)
  })

  it('the RPC writes the canonical machine identity, whatever the observer', () => {
    expect(call({ project: P_S, to: 'CRITICAL' })).toBe('baseline_recorded')
    const row = query(dsn, `select actor_principal, provenance, autonomy_level
                              from public.survival_state_events where project_id='${P_S}'`)[0]
    expect(row[0]).toBe('atlas.survival_recorder')
    expect(row[1]).toBe('atlas.survival.observation.v1')
    // …and the ceiling is the DERIVED one for the state, not a caller's L1.
    expect(row[2]).toBe('L1')
  })

  it('refuses an impossible state/ceiling pair on a direct INSERT', () => {
    // The RPC cannot produce this — it derives the ceiling. This is the second
    // line, for a privileged writer: `HIBERNATE + L6` would be evidence of a
    // condition that both said "observe only" and claimed full autonomy.
    const err = expectFailure(dsn, `insert into public.survival_state_events
      (project_id, event_type, to_state, autonomy_level, funding_state,
       threshold_status, derivation_version, actor_principal, provenance, occurred_at)
      values ('${P_C}','BASELINE_OBSERVED','HIBERNATE','L6','UNDECLARED',
              'provisional',1,'atlas.survival_recorder','atlas.survival.observation.v1', now())`)
    expect(err).toMatch(/autonomy_matches_state|violates check constraint|23514/i)
    expect(count(P_C)).toBe(0)
  })

  it('refuses a policy identity no derivation implements', () => {
    // `version 999 + canonical` names a policy nobody wrote. Recording it would
    // be indistinguishable, later, from a genuine row.
    for (const [version, status] of [['999', 'canonical'], ['2', 'provisional'], ['1', 'canonical'], ['0', 'provisional']]) {
      const err = expectFailure(dsn, `insert into public.survival_state_events
        (project_id, event_type, to_state, autonomy_level, funding_state,
         threshold_status, derivation_version, actor_principal, provenance, occurred_at)
        values ('${P_C}','BASELINE_OBSERVED','NORMAL','L6','UNDECLARED',
                '${status}',${version},'atlas.survival_recorder','atlas.survival.observation.v1', now())`)
      expect(err, `v${version}/${status}`)
        .toMatch(/policy_identity_valid|violates check constraint|23514/i)
    }
    // The RPC fails closed on the same skew, BEFORE touching the table, so a v2
    // application against this schema errors loudly instead of mislabelling.
    for (const [version, status] of [[999, 'canonical'], [3, 'provisional'], [2, 'canonical'], [0, 'provisional']] as Array<[number, string]>) {
      const err = expectFailure(dsn, `select * from ${rpc({ project: P_B, to: 'CONSERVE', version, threshold: status })}`)
      expect(err, `rpc v${version}/${status}`)
        .toMatch(/unsupported derivation version|unsupported threshold status/i)
    }
    // P_C stays empty throughout: every probe above was refused, so none of them
    // left a row behind to make the next probe's guard fire first.
    expect(count(P_C)).toBe(0)
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

  it('a real anon session is refused, and the boundary is reachable as itself', () => {
    // has_*_privilege is a catalog reading. These are live sessions, so the
    // refusal is observed rather than inferred — and the call is built from the
    // same helper the passing tests use, so it cannot drift out of sync with the
    // real signature and accidentally prove "no such function" instead.
    const before = count(P_B)
    const asAnon = expectFailure(dsn, `set role anon; select * from ${rpc({ project: P_B, to: 'CONSERVE' })}`)
    expect(asAnon).toMatch(/permission denied|42501/i)
    expect(count(P_B)).toBe(before)
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

  it('closes the event, state, ceiling, funding and policy-identity vocabularies', () => {
    const definitions = constraintDefinitions()
    const has = (constraint: string, ...members: string[]) => {
      const def = definitions.get(constraint)
      expect(def, constraint).toBeDefined()
      for (const m of members) expect(def, `${constraint} missing ${m}`).toContain(m)
    }
    has('survival_events_event_type_valid', 'BASELINE_OBSERVED', 'STATE_TRANSITION_OBSERVED')
    has('survival_events_to_state_valid', 'EXPAND', 'NORMAL', 'CONSERVE', 'CRITICAL', 'HIBERNATE')
    has('survival_events_from_state_valid', 'HIBERNATE')
    // The ceiling is tied to the state, not merely drawn from L0–L6.
    has('survival_events_autonomy_matches_state',
        "to_state = 'EXPAND'", "autonomy_level = 'L6'",
        "to_state = 'CONSERVE'", "autonomy_level = 'L3'",
        "to_state = 'HIBERNATE'", "autonomy_level = 'L0'")
    has('survival_events_funding_state_valid', 'KNOWN', 'UNDECLARED', 'UNAVAILABLE')
    // The policy identity is the PAIRING, not two independent ranges — and as of
    // v2 it pairs the version with the coverage that version requires: a v1 row
    // predates the concept (null coverage), a v2 row must state it.
    has('survival_events_policy_identity_valid', 'derivation_version = 1', 'derivation_version = 2',
        "threshold_status = 'provisional'", 'runway_coverage IS NULL', 'runway_coverage IS NOT NULL')
    has('survival_events_runway_coverage_valid', 'PLATFORM_COMPLETE', 'PARTIAL_SCOPE')
    has('survival_events_reasons_valid', 'funding_undeclared', 'funding_unavailable', 'funding_depleted')
    has('survival_events_gaps_valid', 'runway_unknown', 'infrastructure_cost_untracked',
        'runway_scope_incomplete')
    // BOTH directions of the funding implication, asserted on the rendered
    // definition: the positive form proves the amount is required, the negative
    // form proves it is forbidden elsewhere. One without the other is the gap
    // this constraint was widened to close.
    has('survival_events_declared_funding_matches_state', "funding_state = 'KNOWN'", 'IS NOT NULL')
    // The magnitudes constraint covers limit, burn and runway — NOT remaining
    // headroom, which is legitimately negative on an overspent scope.
    has('survival_events_non_negative_magnitudes', 'binding_limit_sek', 'burn_sek_per_day', 'runway_days')
    const magnitudes = definitions.get('survival_events_non_negative_magnitudes') ?? ''
    expect(magnitudes, 'remaining headroom must NOT be constrained non-negative')
      .not.toContain('binding_remaining_sek')
    has('survival_events_shape', 'BASELINE_OBSERVED')
    has('survival_events_actor_machine_identity', 'atlas.survival_recorder')
    has('survival_events_provenance_machine_identity', 'atlas.survival.observation.v1')
    // The weaker standalone checks are GONE, not merely joined by stronger ones:
    // a `>= 1` range beside the exact pairing would be a claim that is not true.
    expect(definitions.has('survival_events_derivation_version_valid')).toBe(false)
    expect(definitions.has('survival_events_autonomy_level_valid')).toBe(false)
    expect(definitions.has('survival_events_provenance_present')).toBe(false)
  })

  it('seeds a project with history so the CHECKs, not the guard, are under test', () => {
    expect(call({ project: P_B, to: 'NORMAL' })).toBe('baseline_recorded')
    expect(latest(P_B)).toBe('<null>->NORMAL')
  })

  it('refuses a value outside each closed set, by CHECK', () => {
    // from_state is derived correctly and to_state differs from the recorded
    // state, so the guard is satisfied and the CHECK is what refuses. The state
    // CHANGE matters: an unchanged observation returns 'unchanged' before any
    // CHECK runs, so a probe against the current state would prove nothing.
    //
    // `threshold_status` is deliberately NOT in this list. The boundary refuses
    // a policy identity it does not implement before the table is reached, so
    // its CHECK is proven by direct INSERT below instead.
    const probes: Array<[string, string]> = [
      ['funding_state', rpc({ project: P_B, to: 'CONSERVE', funding: 'MAYBE' })],
      ['reasons', rpc({ project: P_B, to: 'CONSERVE', reasons: ['vibes_are_bad'] })],
      ['gaps', rpc({ project: P_B, to: 'CONSERVE', gaps: ['unknown_thing'] })],
      ['binding_scope', rpc({ project: P_B, to: 'CONSERVE', scope: 'galaxy_monthly' })],
    ]
    for (const [column, sql] of probes) {
      expect(expectFailure(dsn, `select * from ${sql}`), column).toMatch(/violates check constraint|check/i)
    }
    expect(count(P_B)).toBe(1)
  })

  it('refuses an unsupported to_state at the boundary, before anything is written', () => {
    // The ceiling is derived from the state, so the boundary must reject a state
    // it has no mapping for. This fails in the function, not by CHECK — which is
    // the point: the row never reaches the table.
    const err = expectFailure(dsn, `select * from ${rpc({ project: P_B, to: 'DORMANT' })}`)
    expect(err).toMatch(/unsupported to_state/i)
    expect(count(P_B)).toBe(1)
  })

  it('the declared amount is biconditional with KNOWN — all four cases', () => {
    // Its own stream, and every probe targets a state DIFFERENT from the current
    // one. That is not incidental: an unchanged observation returns 'unchanged'
    // before the row reaches any CHECK, so a probe against the current state
    // would pass the constraint trivially and prove nothing.
    const P = P_D
    // 1. KNOWN + a figure is the real thing, and is accepted.
    expect(call({ project: P, to: 'NORMAL', funding: 'KNOWN', declared: '120000' })).toBe('baseline_recorded')
    // 2. KNOWN + no figure is REFUSED. This is the direction that was missing:
    //    without it a row could say "we were told the capital" while carrying no
    //    capital, which a reader cannot tell from a reading that was lost.
    expect(expectFailure(dsn, `select * from ${rpc({ project: P, to: 'CONSERVE', funding: 'KNOWN', declared: null })}`))
      .toMatch(/survival_events_declared_funding_matches_state|violates check/i)
    // 3. UNDECLARED / UNAVAILABLE + a figure is a manufactured number.
    for (const funding of ['UNDECLARED', 'UNAVAILABLE']) {
      expect(expectFailure(dsn, `select * from ${rpc({ project: P, to: 'CONSERVE', funding, declared: '5000' })}`), funding)
        .toMatch(/survival_events_declared_funding_matches_state|violates check/i)
    }
    // 4. UNDECLARED / UNAVAILABLE with no figure is the honest absence.
    expect(call({ project: P, to: 'CONSERVE', funding: 'UNDECLARED', declared: null })).toBe('transition_recorded')
    expect(call({ project: P, to: 'NORMAL', funding: 'UNAVAILABLE', declared: null })).toBe('transition_recorded')
    // Zero is a FIGURE, not an absence: KNOWN at zero is accepted, and the
    // constraint constrains presence rather than sign.
    expect(call({ project: P, to: 'CRITICAL', funding: 'KNOWN', declared: '0' })).toBe('transition_recorded')
    // Four writes: the baseline plus three accepted transitions. Every refused
    // probe above wrote nothing.
    expect(count(P)).toBe(4)
  })

  it('ACCEPTS negative remaining headroom — an overspent scope is valid evidence', () => {
    // Canonical `budget_scope_state()` computes `least(limit, limit - spent - held)`,
    // so a genuinely overspent scope reports NEGATIVE remaining headroom, and
    // `deriveSurvivalState()` reads `remainingSek <= 0` as `headroom_exhausted`
    // → HIBERNATE. Refusing the negative value would have made the recorder fail
    // at exactly the moment Atlas was overspent — losing the evidence precisely
    // when it matters most.
    const P = P_E
    expect(call({ project: P, to: 'HIBERNATE', remaining: '-125.50', reasons: ['headroom_exhausted'] }))
      .toBe('baseline_recorded')

    const [stored, exact, isZero, level] = query(dsn, `select binding_remaining_sek::text,
             (binding_remaining_sek = -125.50)::text,
             (binding_remaining_sek = 0)::text,
             autonomy_level
        from public.survival_state_events where project_id = '${P}'`)[0]

    // 2. Round-trips exactly — same value AND same scale.
    expect(stored).toBe('-125.50')
    expect(exact).toBe('true')
    // 3. NOT clamped to zero. A clamp would rewrite the measurement into a
    //    different fact: "-125.50" would become "nothing left" instead of
    //    "125.50 beyond the ceiling".
    expect(isZero).toBe('false')
    // 4. The ceiling is the DB's derived one for HIBERNATE, not a caller's.
    expect(level).toBe('L0')

    // 5. Retry is a no-op: the boundary short-circuits and writes nothing.
    expect(call({ project: P, to: 'HIBERNATE', remaining: '-125.50', reasons: ['headroom_exhausted'] }))
      .toBe('unchanged')
    expect(count(P)).toBe(1)
  })

  it('refuses a negative limit, burn rate or runway', () => {
    // The three that ARE magnitudes. Again a state change, so the row reaches
    // the CHECK under test rather than short-circuiting as 'unchanged'.
    const before = count(P_B)
    for (const [column, o] of [
      ['binding_limit_sek', { limit: '-1' }],
      ['burn_sek_per_day', { burn: '-1' }],
      ['runway_days', { runway: '-1' }],
    ] as Array<[string, Partial<Observe>]>) {
      expect(expectFailure(dsn, `select * from ${rpc({ project: P_B, to: 'CRITICAL', ...o })}`), column)
        .toMatch(/survival_events_non_negative_magnitudes|violates check/i)
    }
    expect(count(P_B)).toBe(before)
    // …and the same constraint still ACCEPTS a negative remaining on the very
    // same call shape, so the refusal above is specific to magnitudes.
    expect(call({ project: P_B, to: 'CRITICAL', remaining: '-42.25' })).toBe('transition_recorded')
    expect(one(dsn, `select binding_remaining_sek::text from public.survival_state_events
                      where project_id='${P_B}' order by event_seq desc limit 1`)).toBe('-42.25')
  })

  it('refuses an unknown event type, which can only arrive by direct INSERT', () => {
    // The boundary itself can only write the two canonical types, so the only way
    // to reach the CHECK is a direct write — and the guard refuses that first.
    const before = count(P_B)
    const err = expectFailure(dsn,
      `insert into public.survival_state_events
       (project_id, event_type, from_state, to_state, autonomy_level, funding_state,
        threshold_status, derivation_version, actor_principal, provenance, occurred_at)
       values ('${P_B}','SURVIVAL_DRIFTED','NORMAL','CONSERVE','L3','UNDECLARED',
               'provisional',1,'x','y', now())`)
    expect(err).toMatch(/survival history|cannot open a second baseline/)
    // Relative, not absolute: this stream is written by earlier tests, and an
    // absolute count here would break whenever they legitimately add a row.
    expect(count(P_B)).toBe(before)
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
      project: P_R, to: 'CONSERVE',
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
    expect(call({ project: P_R, to: 'CRITICAL', funding: 'UNAVAILABLE',
                  reasons: ['funding_unavailable'], gaps: ['funding_unavailable'] }))
      .toBe('transition_recorded')
    expect(one(dsn, `select funding_state from public.survival_state_events
                     where project_id='${P_R}' order by event_seq desc limit 1`)).toBe('UNAVAILABLE')
    // …and it is a different token from the baseline's.
    expect(one(dsn, `select count(distinct funding_state) from public.survival_state_events
                     where project_id='${P_R}'`)).toBe('2')
  })

  it('stores declared funding when KNOWN, and only then', () => {
    expect(call({ project: P_R, to: 'NORMAL', funding: 'KNOWN', declared: '120000',
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
    expect(call({ project: P_R, to: 'CONSERVE', funding: 'UNDECLARED',
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
    expect(call({ project: P_R, to: 'CRITICAL', occurredAt: `timestamptz '2026-09-01 00:00:00+00'` }))
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
      concurrentObserve({ project: G, to: 'CRITICAL' }, 700),
      concurrentObserve({ project: G, to: 'CRITICAL' }, 0),
    ])
    expect(count(G)).toBe(before + 1)
    expect(latest(G)).toBe('CONSERVE->CRITICAL')
    expect([a, b].sort()).toEqual(['transition_recorded', 'unchanged'])
  })

  it('a retry of the same observation is idempotent', () => {
    const G = '33333333-3333-3333-3333-333333333333'
    const before = count(G)
    for (let i = 0; i < 5; i++) expect(call({ project: G, to: 'CRITICAL' })).toBe('unchanged')
    expect(count(G)).toBe(before)
  })
})

// ── Recording disturbs nothing ──────────────────────────────────────────────

describe('survival history · recording changes neither spend nor the stop', () => {
  it('leaves the automation pause and the spend ledger untouched', () => {
    const pausedBefore = one(dsn, `select automation_paused from public.platform_config where id=1`)
    const spendBefore = one(dsn, `select count(*) from public.spend_reservations`)
    const G = '33333333-3333-3333-3333-333333333333'

    expect(call({ project: G, to: 'HIBERNATE' })).toBe('transition_recorded')
    expect(call({ project: G, to: 'NORMAL' })).toBe('transition_recorded')

    expect(one(dsn, `select automation_paused from public.platform_config where id=1`)).toBe(pausedBefore)
    expect(one(dsn, `select count(*) from public.spend_reservations`)).toBe(spendBefore)
    expect(one(dsn, `select execution_paused from public.projects where id='${G}'`)).toBe('f')
  })
})

// ── The coverage rule is a property of the ledger, not of its caller ────────

d('survival history · a partial scope can never carry a positive runway', () => {
  // `derive.ts` withholds the figure. This proves the TABLE refuses one, so the
  // rule holds even against a direct RPC call that assembles its own arguments —
  // which is the only thing that makes it a property of the ledger rather than a
  // convention the current implementation happens to follow.
  const rowOf = (project: string) =>
    one(dsn, `select coalesce(runway_coverage, '<null>') || '|' || coalesce(runway_days::text, '<null>')
                from public.survival_state_events where project_id = '${project}'
               order by event_seq desc limit 1`)

  it('REFUSES a partial scope with a positive runway, writing nothing', () => {
    const err = expectFailure(dsn, `select result from ${rpc({
      project: P_F, to: 'NORMAL', funding: 'KNOWN', declared: '120000',
      runway: '14457.8313', coverage: 'PARTIAL_SCOPE',
    })}`)
    expect(err).toMatch(/survival_events_coverage_runway_valid/)
    // The boundary is one transaction, so a refused row leaves the stream exactly
    // as it was: no event, and no half-written observation.
    expect(count(P_F)).toBe(0)
  })

  it('ACCEPTS the truthful shape: a partial scope with NO runway', () => {
    expect(call({ project: P_G, to: 'CRITICAL', funding: 'KNOWN', declared: '120000',
                  runway: null, coverage: 'PARTIAL_SCOPE',
                  gaps: ['runway_scope_incomplete'] })).toBe('baseline_recorded')
    expect(rowOf(P_G)).toBe('PARTIAL_SCOPE|<null>')
  })

  it('ACCEPTS runway 0 on a partial scope — depletion is not a scope claim', () => {
    // The depleted branch runs BEFORE the coverage check, and "there is nothing
    // to spend" does not become less true by looking at less of the platform. A
    // constraint written as "partial implies null" would have refused this
    // legitimate row, which is why the bound is `> 0` and not `is not null`.
    expect(call({ project: P_G, to: 'HIBERNATE', funding: 'KNOWN', declared: '0',
                  runway: '0', coverage: 'PARTIAL_SCOPE' })).toBe('transition_recorded')
  })

  it('still ACCEPTS a positive runway when the scope is complete', () => {
    expect(call({ project: P_G, to: 'NORMAL', funding: 'KNOWN', declared: '120000',
                  runway: '14457.8313', coverage: 'PLATFORM_COMPLETE' }))
      .toBe('transition_recorded')
  })

  it('refuses a v2 row stating no coverage, and a v1 row stating one', () => {
    // The policy identity is a PAIRING: the version decides whether coverage is
    // required or forbidden, so neither can be recorded on its own. This is what
    // stops a v1 row from being back-filled with a coverage fact that v1 never
    // observed.
    expect(expectFailure(dsn, `select result from ${rpc({
      project: P_F, to: 'NORMAL', version: 2, coverage: null,
    })}`)).toMatch(/p_runway_coverage/)
    expect(expectFailure(dsn, `select result from ${rpc({
      project: P_F, to: 'NORMAL', version: 1, coverage: 'PLATFORM_COMPLETE',
    })}`)).toMatch(/survival_events_policy_identity_valid/)
    expect(count(P_F)).toBe(0)
  })
})
