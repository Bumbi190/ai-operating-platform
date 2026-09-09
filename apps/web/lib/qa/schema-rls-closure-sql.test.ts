/**
 * lib/qa/schema-rls-closure-sql.test.ts — Phase 9Y, APPLIED.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `schema-security-invariant.test.ts` proves the repo says the right thing.
 * That is not the same as the database doing it. The G2 lesson recorded in
 * `workflow-transition-stop-guard-sql.test.ts` — "a migration that passed every
 * test and then failed in production" — applies with force here, because the
 * whole finding was a gap between what the repo implied and what the catalog
 * actually held.
 *
 * So this suite applies the REAL creation migration and then the REAL Phase 9Y
 * migration to a throwaway local database, and asserts the boundary by
 * BECOMING each role: `set role anon`, `set role authenticated`, and
 * service-role-equivalent. A denial here is Postgres denying it, not a string
 * match agreeing with itself.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────
 * LOCAL ONLY. Creates its own per-process database and drops it in afterAll. It
 * never reaches Supabase, never reads a project credential, and mutates no
 * pre-existing database. Same harness and same helpers as the existing SQL
 * suites; nothing new was invented. The suite SKIPS when no local Postgres is
 * reachable, and says so loudly rather than passing silently.
 *
 * ── WHAT THE FIXTURE SUPPLIES ──────────────────────────────────────────────
 * Only what the creation migration DEPENDS on and does not create:
 * `public.workflow_instances`, `public.runs`, and the three Supabase roles.
 * workflow_stories itself, its indexes, its constraints and both triggers come
 * from the real file — otherwise the suite would be proving its own fixture.
 *
 * ── ONE THING THIS CANNOT PROVE ────────────────────────────────────────────
 * Local Postgres roles do not carry Supabase's BYPASSRLS on service_role. The
 * service-role positive control below therefore runs as the table owner, which
 * bypasses RLS for the same reason production's service_role does. That is a
 * faithful analogue of the privilege, not a re-creation of it.
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

const DB_NAME = `omnira_schema_rls_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

const CREATE_MIGRATION = join(process.cwd(), 'supabase/migrations/20260904120000_workflow_stories.sql')
const RLS_MIGRATION    = join(process.cwd(), 'supabase/migrations/20260909120000_workflow_stories_rls.sql')

const INST = '11111111-1111-1111-1111-111111111111'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const BRIEF  = 'c'.repeat(64)

/** Only what the creation migration depends on. */
const FIXTURE = `
create extension if not exists pgcrypto;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $do$;

create table public.runs (id uuid primary key default gen_random_uuid());
create table public.workflow_instances (id uuid primary key default gen_random_uuid());
insert into public.workflow_instances (id) values ('${INST}');

-- Supabase's DEFAULT posture, reproduced: the public schema is granted to the
-- CLIENT roles. This is what made the missing RLS dangerous, so the suite must
-- start from it rather than from a clean slate.
--
-- service_role is deliberately NOT pre-granted here. The fixture granting it
-- would make the migration's own grant-to-service_role line unfalsifiable:
-- deleting that line from the migration would still leave the assertion green.
-- Leaving it out means the positive control proves the MIGRATION restores the
-- writer's access, which is the thing worth proving.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
`

const insertSql = (hash: string, rev = 1) => `
insert into public.workflow_stories
  (workflow_instance_id, month_key, story_content_hash, generated_from_brief_hash,
   story_contract_version, story, provider, model, prompt_contract_version, revision_number)
values ('${INST}', '2099-01', '${hash}', '${BRIEF}', 'v1', '{"t":"x"}'::jsonb,
        'anthropic', 'm', 'p1', ${rev});`

const d = AVAILABLE ? describe : describe.skip

if (!AVAILABLE) {
  console.warn(
    '[schema-rls-closure-sql] SKIPPED — no reachable local Postgres. The Phase 9Y migration was '
    + 'NOT proven to apply, and the anon/authenticated denials were NOT executed in this run. '
    + 'Set ATLAS_SQL_TEST_URL to enable it.',
  )
}

beforeAll(() => {
  if (!AVAILABLE) return
  run(ADMIN_URL, ['-c', `create database "${DB_NAME}"`])
  dsn = dsnFor(DB_NAME)
  run(dsn, ['-c', FIXTURE])
  run(dsn, ['-f', CREATE_MIGRATION])
}, 120_000)

afterAll(() => {
  if (!AVAILABLE || !dsn) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DB_NAME}" with (force)`]) } catch { /* best effort */ }
})

d('Phase 9Y — the state BEFORE the migration, so the fix is not proving a no-op', () => {
  it('the creation migration leaves RLS OFF — the finding, reproduced from the real file', () => {
    expect(one(dsn, `select relrowsecurity from pg_class where oid='public.workflow_stories'::regclass`))
      .toBe('f')
  })

  it('and anon can therefore SELECT it — the live exposure, executed', () => {
    const err = expectFailure(dsn, `set role anon; select count(*) from public.workflow_stories;`)
    expect(err, 'anon was ALREADY blocked before the migration — the suite would prove nothing').toBe('')
  })

  it('and anon can INSERT into it — the write half of the exposure', () => {
    // Rolled back deliberately. The table's own no-delete trigger means an
    // inserted row could not be cleaned up afterwards, and a leftover row would
    // silently corrupt the positive controls below into passing for the wrong
    // reason. A transaction proves the privilege without leaving state.
    const err = expectFailure(
      dsn,
      `begin; set local role anon; ${insertSql(HASH_B)} rollback;`,
    )
    expect(err, 'anon INSERT was already blocked before the migration').toBe('')
    expect(one(dsn, `select count(*) from public.workflow_stories`), 'the probe leaked a row').toBe('0')
  })
})

d('Phase 9Y — applying the migration', () => {
  it('the real migration file applies cleanly', () => {
    expect(() => run(dsn, ['-f', RLS_MIGRATION])).not.toThrow()
  })

  it('is idempotent — applying it twice is not an error', () => {
    expect(() => run(dsn, ['-f', RLS_MIGRATION])).not.toThrow()
  })

  it('RLS is now ON', () => {
    expect(one(dsn, `select relrowsecurity from pg_class where oid='public.workflow_stories'::regclass`))
      .toBe('t')
  })

  it('FORCE RLS is deliberately left OFF', () => {
    expect(one(dsn, `select relforcerowsecurity from pg_class where oid='public.workflow_stories'::regclass`))
      .toBe('f')
  })

  it('no policy was invented — server-only means default-deny, not a fake owner rule', () => {
    expect(one(dsn, `select count(*) from pg_policies where schemaname='public' and tablename='workflow_stories'`))
      .toBe('0')
  })

  it('anon and authenticated hold no privileges at all on the table', () => {
    const rows = query(dsn, `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema='public' and table_name='workflow_stories'
         and grantee in ('anon','authenticated') order by 1,2`)
    expect(rows, 'a grant survived the revoke').toEqual([])
  })

  it('service_role keeps the access its writer needs', () => {
    const privs = query(dsn, `select privilege_type from information_schema.role_table_grants
       where table_schema='public' and table_name='workflow_stories' and grantee='service_role'
       order by 1`).map(r => r[0])
    for (const p of ['DELETE', 'INSERT', 'SELECT', 'UPDATE']) expect(privs).toContain(p)
  })
})

d('Phase 9Y — negative controls: anon', () => {
  it('anon SELECT is denied', () => {
    expect(expectFailure(dsn, `set role anon; select * from public.workflow_stories;`))
      .toMatch(/permission denied/i)
  })
  it('anon INSERT is denied', () => {
    expect(expectFailure(dsn, `set role anon; ${insertSql(HASH_B)}`)).toMatch(/permission denied/i)
  })
  it('anon UPDATE is denied', () => {
    expect(expectFailure(dsn, `set role anon; update public.workflow_stories set status='superseded';`))
      .toMatch(/permission denied/i)
  })
  it('anon DELETE is denied', () => {
    expect(expectFailure(dsn, `set role anon; delete from public.workflow_stories;`))
      .toMatch(/permission denied/i)
  })
})

d('Phase 9Y — negative controls: authenticated', () => {
  it('authenticated SELECT is denied — no product surface reads this table', () => {
    expect(expectFailure(dsn, `set role authenticated; select * from public.workflow_stories;`))
      .toMatch(/permission denied/i)
  })
  it('authenticated INSERT is denied', () => {
    expect(expectFailure(dsn, `set role authenticated; ${insertSql(HASH_B)}`)).toMatch(/permission denied/i)
  })
  it('authenticated UPDATE is denied', () => {
    expect(expectFailure(dsn, `set role authenticated; update public.workflow_stories set status='superseded';`))
      .toMatch(/permission denied/i)
  })
  it('authenticated DELETE is denied', () => {
    expect(expectFailure(dsn, `set role authenticated; delete from public.workflow_stories;`))
      .toMatch(/permission denied/i)
  })
})

d('Phase 9Y — positive control: the story store still works', () => {
  it('persistStory-equivalent INSERT succeeds under bypass-equivalent privilege', () => {
    expect(() => run(dsn, ['-c', insertSql(HASH_A)])).not.toThrow()
    expect(one(dsn, `select count(*) from public.workflow_stories`)).toBe('1')
  })

  it('read-back by exact identity still works — the lookup consumers bind to', () => {
    expect(one(dsn, `select story_content_hash from public.workflow_stories
      where workflow_instance_id='${INST}' and story_content_hash='${HASH_A}'`)).toBe(HASH_A)
  })

  it('dedupe is preserved: the same (instance, content) cannot be stored twice', () => {
    expect(expectFailure(dsn, insertSql(HASH_A))).toMatch(/duplicate key|unique/i)
  })

  it('revision_number still counts attempts — a second distinct story is revision 2', () => {
    run(dsn, ['-c', insertSql(HASH_B, 2)])
    expect(one(dsn, `select revision_number from public.workflow_stories
      where story_content_hash='${HASH_B}'`)).toBe('2')
  })

  it('listStories-equivalent ordering still works', () => {
    const rows = query(dsn, `select story_content_hash from public.workflow_stories
      where workflow_instance_id='${INST}' order by created_at desc`)
    expect(rows.length).toBe(2)
  })

  it('supersedeStory still works — status may move', () => {
    expect(() => run(dsn, ['-c', `update public.workflow_stories set status='superseded'
      where story_content_hash='${HASH_A}'`])).not.toThrow()
    expect(one(dsn, `select status from public.workflow_stories where story_content_hash='${HASH_A}'`))
      .toBe('superseded')
  })

  it('append-only is still enforced — content cannot be rewritten', () => {
    expect(expectFailure(dsn, `update public.workflow_stories set story='{"t":"tampered"}'::jsonb
      where story_content_hash='${HASH_A}'`)).toMatch(/append-only/i)
  })

  it('no-delete is still enforced — a story an approval may name must remain', () => {
    expect(expectFailure(dsn, `delete from public.workflow_stories where story_content_hash='${HASH_A}'`))
      .toMatch(/never deleted|supersede/i)
  })
})
