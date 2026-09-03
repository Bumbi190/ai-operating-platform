/**
 * lib/qa/media-job-lifecycle-sql.test.ts — the Phase 4 migration, APPLIED.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Everything else about the media job lifecycle is proven against an in-memory
 * store. That is right for the lifecycle logic and useless for the SQL: a
 * migration that has never been run is a file, not a schema. The G2 lesson —
 * "a migration that passed every test and then failed in production, because
 * the harness had built a greenfield database" — is why the real file is run.
 *
 * What this suite proves is the half the TypeScript CANNOT see: that the guard
 * trigger genuinely refuses, that UNKNOWN genuinely cannot be cleared without
 * evidence, that the ledger genuinely is append-only, and that `brief_hash`
 * genuinely is NOT unique.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────
 * LOCAL ONLY. Creates its own database, named per-process, and drops it in
 * `afterAll`. It never reaches Supabase, never reads a project credential, and
 * mutates no pre-existing database. Same construction and same helpers as the
 * existing SQL suites; nothing new was invented for it.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
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
const dsnFor = (db: string) => { const u = new URL(ADMIN_URL); u.pathname = `/${db}`; return u.toString() }

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
const one = (dsn: string, sql: string) => { const r = query(dsn, sql); return r.length ? r[0].join('|') : '' }

/** Runs SQL expected to FAIL; returns stderr so the reason can be asserted. */
function expectFailure(dsn: string, sql: string): string {
  try {
    execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, '-c', sql],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return ''
  } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? '') }
}

const AVAILABLE = (() => {
  if (!PSQL) return false
  try {
    execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 })
    return true
  } catch { return false }
})()

const DB_NAME = `omnira_media_job_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

const MIGRATION = join(process.cwd(), 'supabase/migrations/20260903062550_media_job_lifecycle.sql')
const REPAIRS   = join(process.cwd(), 'supabase/migrations/20260903070644_media_job_lifecycle_repairs.sql')

const PROJ  = '11111111-1111-1111-1111-111111111111'
const PROJ2 = '22222222-2222-2222-2222-222222222222'
const ASSET = '44444444-4444-4444-4444-444444444444'
const H     = 'a'.repeat(64)

/**
 * Only the migration's dependencies. Nothing the migration itself creates.
 *
 * `projects` and `assets` are stand-ins with just the columns the migration
 * references — if this fixture created `media_jobs`, the suite would be proving
 * itself rather than the migration.
 */
const FIXTURE = `
create extension if not exists pgcrypto;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $do$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table public.projects (id uuid primary key, owner_id uuid);
create table public.assets   (id uuid primary key);
insert into public.projects(id, owner_id) values ('${PROJ}', gen_random_uuid()), ('${PROJ2}', gen_random_uuid());
insert into public.assets(id) values ('${ASSET}');
`

const job = (id: string, extra = '') =>
  `insert into public.media_jobs(id,project_id,provider,model,brief_hash${extra ? ',' + extra.split('=')[0] : ''}) `
  + `values ('${id}','${PROJ}','muapi','flux-dev','${H}'${extra ? ',' + extra.split('=')[1] : ''});`

const J1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const J2 = 'aaaaaaaa-0000-4000-8000-000000000002'

describe.skipIf(!AVAILABLE)('media_job_lifecycle migration — applied against a real postgres', () => {
  beforeAll(() => {
    run(ADMIN_URL, ['-c', `create database ${DB_NAME}`])
    dsn = dsnFor(DB_NAME)
    run(dsn, ['-c', FIXTURE])
    run(dsn, ['-f', MIGRATION])          // ← the REAL migration files, in order
    run(dsn, ['-f', REPAIRS])
  }, 120_000)

  afterAll(() => {
    if (!dsn) return
    try { run(ADMIN_URL, ['-c', `drop database if exists ${DB_NAME} with (force)`]) } catch { /* best effort */ }
  })

  // ── structure ────────────────────────────────────────────────────────────

  it('creates both tables and nothing else', () => {
    expect(one(dsn, `select count(*) from information_schema.tables
                     where table_schema='public' and table_name in ('media_jobs','media_job_reconciliations')`)).toBe('2')
    expect(one(dsn, `select count(*) from information_schema.columns
                     where table_schema='public' and table_name='media_jobs'`)).toBe('18')
  })

  it('enables RLS with SELECT-only policies — no user write path exists', () => {
    expect(one(dsn, `select bool_and(relrowsecurity) from pg_class
                     where relname in ('media_jobs','media_job_reconciliations')`)).toBe('t')
    // Every policy is SELECT. An owner who could UPDATE could clear an UNKNOWN.
    expect(one(dsn, `select coalesce(string_agg(distinct cmd,','),'none') from pg_policies
                     where schemaname='public' and tablename like 'media_job%'`)).toBe('SELECT')
    expect(one(dsn, `select count(*) from pg_policies
                     where schemaname='public' and tablename like 'media_job%' and cmd <> 'SELECT'`)).toBe('0')
  })

  // ── the invariants TypeScript cannot see ─────────────────────────────────

  it('refuses an unknown lifecycle state', () => {
    // A row with a bogus state also trips `dispatch_timestamp_present`, and
    // Postgres reports whichever CHECK it evaluates first. Assert the state is
    // REJECTED rather than which guard got there first — pinning the order
    // would make this test about Postgres's evaluation order, not the schema.
    const err = expectFailure(dsn,
      `insert into public.media_jobs(id,project_id,provider,model,brief_hash,state,dispatch_started_at)
       values (gen_random_uuid(),'${PROJ}','muapi','m','${H}','NOT_A_STATE',now())`)
    expect(err).toMatch(/media_jobs_state_vocabulary/)
  })

  it('ALLOWS a duplicate brief_hash — the same brief may legitimately run twice', () => {
    run(dsn, ['-c', job(J1)])
    run(dsn, ['-c', job(J2)])
    expect(one(dsn, `select count(*) from public.media_jobs where brief_hash='${H}'`)).toBe('2')
  })

  it('requires reconciliation whenever a job is UNKNOWN', () => {
    run(dsn, ['-c', `update public.media_jobs set state='DISPATCHING',dispatch_started_at=now(),version=2 where id='${J1}'`])
    expect(expectFailure(dsn,
      `update public.media_jobs set state='UNKNOWN',terminal_at=now(),reconciliation_required=false,version=3 where id='${J1}'`))
      .toMatch(/media_jobs_ambiguous_requires_reconciliation/)
  })

  it('requires every update to advance the version — a no-op CAS is refused', () => {
    expect(expectFailure(dsn, `update public.media_jobs set state='QUEUED' where id='${J1}'`))
      .toMatch(/must advance version/)
  })

  it('refuses a rewind across the dispatch boundary', () => {
    expect(expectFailure(dsn, `update public.media_jobs set state='PENDING_DISPATCH',version=3 where id='${J1}'`))
      .toMatch(/cannot rewind/)
  })

  it('UNKNOWN may not be resolved without recorded evidence', () => {
    run(dsn, ['-c', `update public.media_jobs set state='UNKNOWN',terminal_at=now(),
                     reconciliation_required=true,dispatch_observation='response_lost',version=3 where id='${J1}'`])
    expect(expectFailure(dsn, `update public.media_jobs set state='SUCCEEDED',version=4 where id='${J1}'`))
      .toMatch(/only be resolved by a recorded reconciliation/)
  })

  it('a STILL_UNKNOWN row is NOT evidence; a confirmed one is', () => {
    run(dsn, ['-c', `insert into public.media_job_reconciliations
      (media_job_id,project_id,provider,remote_operation_id,result,blocker,observed_at)
      values ('${J1}','${PROJ}','muapi',null,'STILL_UNKNOWN','no_remote_identity',now())`])
    expect(expectFailure(dsn, `update public.media_jobs set state='SUCCEEDED',version=4 where id='${J1}'`))
      .toMatch(/only be resolved by a recorded reconciliation/)

    run(dsn, ['-c', `insert into public.media_job_reconciliations
      (media_job_id,project_id,provider,remote_operation_id,result,observed_at)
      values ('${J1}','${PROJ}','muapi',null,'CONFIRMED_SUCCEEDED',now())`])
    run(dsn, ['-c', `update public.media_jobs set state='SUCCEEDED',reconciliation_required=false,version=4 where id='${J1}'`])
    expect(one(dsn, `select state from public.media_jobs where id='${J1}'`)).toBe('SUCCEEDED')
  })

  it('the ledger is append-only', () => {
    expect(expectFailure(dsn, `update public.media_job_reconciliations set result='CONFIRMED_FAILED'`))
      .toMatch(/append-only/)
    expect(expectFailure(dsn, `delete from public.media_job_reconciliations`)).toMatch(/append-only/)
  })

  it('a reconciliation must be about the job it names', () => {
    expect(expectFailure(dsn, `insert into public.media_job_reconciliations
      (media_job_id,project_id,provider,remote_operation_id,result,observed_at)
      values ('${J1}','${PROJ2}','muapi',null,'CONFIRMED_FAILED',now())`))
      .toMatch(/identity does not match/)
  })

  it('an inconclusive answer must carry a blocker, a conclusive one must not', () => {
    expect(expectFailure(dsn, `insert into public.media_job_reconciliations
      (media_job_id,project_id,provider,result,observed_at)
      values ('${J1}','${PROJ}','muapi','STILL_UNKNOWN',now())`)).toMatch(/blocker_agrees/)
  })

  it('refuses a path-traversal shaped remote operation id', () => {
    expect(expectFailure(dsn,
      `update public.media_jobs set remote_operation_id='../../etc/passwd',version=2 where id='${J2}'`))
      .toMatch(/media_jobs_remote_id_shape/)
  })

  it('the remote operation id is write-once, and unique per provider', () => {
    run(dsn, ['-c', `update public.media_jobs set state='DISPATCHING',dispatch_started_at=now(),
                     remote_operation_id='req_abc',version=2 where id='${J2}'`])
    expect(expectFailure(dsn, `update public.media_jobs set remote_operation_id='req_other',version=3 where id='${J2}'`))
      .toMatch(/write-once/)
    // A second job may not claim the same remote operation.
    const J3 = 'aaaaaaaa-0000-4000-8000-000000000003'
    run(dsn, ['-c', job(J3)])
    expect(expectFailure(dsn, `update public.media_jobs set state='DISPATCHING',dispatch_started_at=now(),
                               remote_operation_id='req_abc',version=2 where id='${J3}'`))
      .toMatch(/media_jobs_remote_operation_uniq/)
  })

  it('SUCCEEDED WITHOUT an asset is legal — that is provider-success + admission-failure', () => {
    run(dsn, ['-c', `update public.media_jobs set state='QUEUED',version=3 where id='${J2}'`])
    run(dsn, ['-c', `update public.media_jobs set state='SUCCEEDED',terminal_at=now(),version=4 where id='${J2}'`])
    expect(one(dsn, `select state||'|'||coalesce(asset_id::text,'NULL') from public.media_jobs where id='${J2}'`))
      .toBe('SUCCEEDED|NULL')
  })

  it('an asset may only be bound to a SUCCEEDED job, and only once', () => {
    const J4 = 'aaaaaaaa-0000-4000-8000-000000000004'
    run(dsn, ['-c', job(J4)])
    expect(expectFailure(dsn, `update public.media_jobs set asset_id='${ASSET}',version=2 where id='${J4}'`))
      .toMatch(/media_jobs_asset_requires_success/)

    run(dsn, ['-c', `update public.media_jobs set asset_id='${ASSET}',version=5 where id='${J2}'`])
    expect(one(dsn, `select asset_id from public.media_jobs where id='${J2}'`)).toBe(ASSET)
    expect(expectFailure(dsn, `update public.media_jobs set asset_id=gen_random_uuid(),version=6 where id='${J2}'`))
      .toMatch(/asset binding is write-once/)
  })

  /**
   * ── THE REVISION 1 EXPLOIT REGRESSION — DO NOT DELETE ────────────────────
   *
   * The first draft of the forward migration detected the FK cascade purely by
   * the SHAPE of the change: asset_id going NULL with version and state
   * unchanged. That is EXACTLY what the statement below looks like, so any
   * application SQL could have taken the exemption and cleared an asset
   * binding at will.
   *
   * Revision 2 requires two further signals that application SQL cannot
   * produce — `pg_trigger_depth() > 1` and the referenced asset already gone
   * from this snapshot. This test is the shape of the closed hole, kept
   * permanently so a future "simplification" of the guard cannot reopen it.
   */
  it('F4-01 REGRESSION — the Revision 1 exploit shape stays rejected', () => {
    // No version bump: the precise statement Revision 1 would have allowed.
    expect(expectFailure(dsn, `update public.media_jobs set asset_id=null where id='${J2}'`))
      .toMatch(/must advance version|write-once/)
    // With a version bump, so only the write-once rule stands between it and success.
    expect(expectFailure(dsn, `update public.media_jobs set asset_id=null, version=6 where id='${J2}'`))
      .toMatch(/asset binding is write-once/)
    // Untouched by either refusal.
    expect(one(dsn, `select coalesce(asset_id::text,'NULL') from public.media_jobs where id='${J2}'`)).toBe(ASSET)
  })

  it('F4-01 CORRECTED — the asset FK ON DELETE SET NULL now succeeds', () => {
    const before = one(dsn, `select version from public.media_jobs where id='${J2}'`)
    run(dsn, ['-c', `delete from public.assets where id='${ASSET}'`])
    // The cascade clears the binding and does NOT advance version — it is a
    // referential action, not a lifecycle transition.
    expect(one(dsn, `select state||'|'||coalesce(asset_id::text,'NULL')||'|'||version
                     from public.media_jobs where id='${J2}'`)).toBe(`SUCCEEDED|NULL|${before}`)
  })


  // ── F4-03 · atomic reconciliation ────────────────────────────────────────

  it('F4-03 — the atomic RPC exists, is DEFINER, pins search_path, and is service-role only', () => {
    expect(one(dsn, `select case when prosecdef then 'DEFINER' else 'INVOKER' end
                     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.proname='media_job_record_reconciliation'`)).toBe('DEFINER')
    expect(one(dsn, `select array_to_string(proconfig,',') from pg_proc p
                     join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.proname='media_job_record_reconciliation'`))
      .toMatch(/search_path=""/)
    // No PUBLIC/anon/authenticated grant. An owner who could call this could
    // manufacture the evidence that clears their own UNKNOWN.
    const acl = one(dsn, `select coalesce(array_to_string(proacl::text[],' '),'DEFAULT') from pg_proc p
                          join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='media_job_record_reconciliation'`)
    expect(acl).not.toMatch(/(^|\s)=X\//)      // PUBLIC
    expect(acl).not.toMatch(/\banon=/)
    expect(acl).not.toMatch(/\bauthenticated=/)
    expect(acl).toMatch(/service_role=X/)
  })

  it('F4-03 — a legal reconciliation records evidence and moves the job, atomically', () => {
    const U = 'dddddddd-0000-4000-8000-00000000000d'
    run(dsn, ['-c', `insert into public.media_jobs(id,project_id,provider,model,brief_hash)
                     values ('${U}','${PROJ}','muapi','flux-dev','${H}')`])
    run(dsn, ['-c', `update public.media_jobs set state='DISPATCHING',dispatch_started_at=now(),version=2 where id='${U}'`])
    run(dsn, ['-c', `update public.media_jobs set state='UNKNOWN',terminal_at=now(),
                     reconciliation_required=true,dispatch_observation='response_lost',version=3 where id='${U}'`])

    const out = one(dsn, `select (r).state||'|'||(r).version||'|'||(r).reconciliation_required from (
      select public.media_job_record_reconciliation(
        '${U}',3,'CONFIRMED_SUCCEEDED',null,'{}'::jsonb,now(),'SUCCEEDED') as r) x`)
    expect(out).toBe('SUCCEEDED|4|false')
    expect(one(dsn, `select count(*) from public.media_job_reconciliations where media_job_id='${U}'`)).toBe('1')
  })

  it('F4-03 — a stale CAS raises and leaves NO ledger row behind', () => {
    const S = 'eeeeeeee-0000-4000-8000-00000000000e'
    run(dsn, ['-c', `insert into public.media_jobs(id,project_id,provider,model,brief_hash)
                     values ('${S}','${PROJ}','muapi','flux-dev','${H}')`])
    run(dsn, ['-c', `update public.media_jobs set state='DISPATCHING',dispatch_started_at=now(),version=2 where id='${S}'`])
    run(dsn, ['-c', `update public.media_jobs set state='UNKNOWN',terminal_at=now(),
                     reconciliation_required=true,version=3 where id='${S}'`])

    const err = expectFailure(dsn, `select public.media_job_record_reconciliation(
      '${S}',99,'CONFIRMED_SUCCEEDED',null,'{}'::jsonb,now(),'SUCCEEDED')`)
    expect(err).toMatch(/version conflict/)
    // THE POINT: an evidence row must never outlive the transition it claims to
    // justify. PL/pgSQL runs inside the caller's transaction, so the RAISE
    // undoes the INSERT with it.
    expect(one(dsn, `select count(*) from public.media_job_reconciliations where media_job_id='${S}'`)).toBe('0')
    expect(one(dsn, `select state from public.media_jobs where id='${S}'`)).toBe('UNKNOWN')
  })

  it('F4-03 — STILL_UNKNOWN records evidence, moves nothing, and does not bump version', () => {
    const N = 'ffffffff-0000-4000-8000-00000000000f'
    run(dsn, ['-c', `insert into public.media_jobs(id,project_id,provider,model,brief_hash)
                     values ('${N}','${PROJ}','muapi','flux-dev','${H}')`])
    run(dsn, ['-c', `update public.media_jobs set state='DISPATCHING',dispatch_started_at=now(),version=2 where id='${N}'`])
    run(dsn, ['-c', `update public.media_jobs set state='UNKNOWN',terminal_at=now(),
                     reconciliation_required=true,version=3 where id='${N}'`])
    run(dsn, ['-c', `select public.media_job_record_reconciliation(
      '${N}',3,'STILL_UNKNOWN','no_remote_identity','{}'::jsonb,now(),null)`])
    // An observation is not a state change.
    expect(one(dsn, `select state||'|'||version||'|'||reconciliation_required
                     from public.media_jobs where id='${N}'`)).toBe('UNKNOWN|3|true')
    expect(one(dsn, `select count(*) from public.media_job_reconciliations where media_job_id='${N}'`)).toBe('1')
  })

  it('F4-03 — a missing job is refused distinctly from a stale version', () => {
    expect(expectFailure(dsn, `select public.media_job_record_reconciliation(
      '00000000-0000-4000-8000-000000000000',1,'CONFIRMED_FAILED',null,'{}'::jsonb,now(),'FAILED')`))
      .toMatch(/no such media job/)
  })

  /**
   * ── REGRESSION-SENSITIVE SCHEMA INVARIANT (Task 13 contract) ─────────────
   *
   * The FK-cascade exemptions in `media_jobs_guard` and
   * `reject_media_reconciliation_mutation` are validated by TWO signals, and
   * neither is sufficient alone:
   *
   *   1. `pg_trigger_depth() > 1` — a mechanism fact. A referential action
   *      always runs nested inside the statement that triggered it.
   *   2. the referenced parent row is already gone from this snapshot — a
   *      semantic fact that application SQL cannot arrange without first
   *      performing the very cascade it is trying to imitate.
   *
   * `pg_trigger_depth()` IS NOT A REUSABLE SECURITY PRIMITIVE and must not be
   * generalised into an application abstraction. It is accepted here only as
   * part of the multi-signal condition proven by this suite.
   *
   * THIS SUITE MUST BE RE-RUN IF ANY OF THESE CHANGE:
   *   • a trigger is added to, or reordered on, `public.media_jobs`
   *   • the `media_jobs.asset_id` FK action changes
   *   • asset deletion semantics change
   *   • reconciliation cascade semantics change
   *
   * A new trigger on `media_jobs` would raise the depth for ORDINARY writes,
   * which is exactly why signal 2 exists and why neither may be dropped.
   */
  it('the cascade exemptions require BOTH signals, not depth alone', () => {
    // Asserted with SQL predicates rather than by fetching the definition: the
    // psql helper collapses multi-line output, and a truncated body would make
    // this test pass for the wrong reason.
    const has = (fn: string, needle: string) =>
      one(dsn, `select pg_get_functiondef(p.oid) like '%' || $q$${needle}$q$ || '%'
                from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.proname='${fn}'`)

    // Signal 1 — mechanism: a referential action always runs nested.
    expect(has('media_jobs_guard', 'pg_trigger_depth() > 1')).toBe('t')
    // Signal 2 — semantics: the referenced parent is already gone.
    expect(has('media_jobs_guard', 'not exists (select 1 from public.assets')).toBe('t')

    expect(has('reject_media_reconciliation_mutation', 'pg_trigger_depth() > 1')).toBe('t')
    expect(has('reject_media_reconciliation_mutation', 'not exists (select 1 from public.media_jobs')).toBe('t')
    // UPDATE has no exemption at all — nothing legitimate edits a recorded fact.
    expect(has('reject_media_reconciliation_mutation', "tg_op = 'DELETE'")).toBe('t')
  })

  it('F4-02 CORRECTED — a parent job delete cascades its ledger rows', () => {
    // The ledger still refuses a DIRECT delete (asserted above); only the
    // cascade that removes the parent may take rows with it.
    expect(Number(one(dsn, `select count(*) from public.media_job_reconciliations where media_job_id='${J1}'`)))
      .toBeGreaterThan(0)
    run(dsn, ['-c', `delete from public.media_jobs where id='${J1}'`])
    expect(one(dsn, `select count(*) from public.media_job_reconciliations where media_job_id='${J1}'`)).toBe('0')
  })

  it('F4-02 CORRECTED — project deletion cascades through jobs and ledger', () => {
    run(dsn, ['-c', `delete from public.projects where id='${PROJ}'`])
    expect(one(dsn, `select count(*) from public.media_jobs`)).toBe('0')
    expect(one(dsn, `select count(*) from public.media_job_reconciliations`)).toBe('0')
  })
})
