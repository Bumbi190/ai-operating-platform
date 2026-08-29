/**
 * Atlas Memory M4 — Foundation Slice 1, BOUNDARY B: recall isolation, proven in SQL.
 *
 * The JS defensive belt (assembleMemoryPack) is already proven in
 * atlas-memory-recall.test.ts. A mocked JS test cannot prove the SQL boundary,
 * and the isolation guarantee lives in BOTH layers — so this file replays the
 * REAL migration files verbatim into a throwaway local Postgres database and
 * calls public.atlas_recall for real.
 *
 * It also pins the service-role contract that the emit wrapper depends on:
 * neither wrapper is reachable by anon/authenticated, and the `atlas` schema is
 * not readable by them either (it is never exposed to PostgREST).
 *
 * HARNESS (safe by construction):
 *   • Creates its OWN database (atlas_mem_boundary_<pid>_<rand>) and drops it
 *     afterwards. It never reads or writes an existing database or any
 *     production data.
 *   • Applies the real files from supabase/migrations — no hand-copied SQL, so
 *     the test cannot drift from what ships.
 *   • Skips (loudly) for a local developer with no Postgres/psql available, but
 *     FAILS instead of skipping wherever SQL proof is required — CI=true, or
 *     ATLAS_SQL_TEST_REQUIRED=1 locally. A green run that skipped this suite
 *     would prove nothing, so CI must never be able to reach one.
 *     Override the target with ATLAS_SQL_TEST_URL (a superuser DSN able to
 *     CREATE DATABASE) and the binary with ATLAS_SQL_TEST_PSQL.
 *
 * The Supabase-shaped prerequisites the atlas migrations assume (the
 * service_role/anon/authenticated roles, auth.uid(), public.projects) are
 * bootstrapped minimally below — everything under test is the shipped SQL.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MIGRATIONS_DIR = path.join(WEB_ROOT, 'supabase/migrations')

/** The shipped files that build the Memory read path, in dependency order. */
const MIGRATIONS = [
  '20260616120000_atlas_schema_init.sql',
  '20260616120100_atlas_memory_events.sql',
  '20260616120200_atlas_memories.sql',
  '20260616120300_atlas_memory_rls.sql',
  '20260617130100_atlas_salience_fn.sql',
  '20260617130000_atlas_record_event_fn.sql',
  '20260617150000_atlas_recall_fn.sql',
  '20260617150200_atlas_recall_pin_focus_ranking.sql',
]

const PROJECT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

// ── Harness discovery ────────────────────────────────────────────────────────

function findPsql(): string | null {
  const candidates = [
    process.env.ATLAS_SQL_TEST_PSQL,
    'psql',
    '/opt/homebrew/opt/libpq/bin/psql',
    '/usr/local/opt/libpq/bin/psql',
    '/usr/bin/psql',
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    try {
      execFileSync(c, ['--version'], { stdio: 'pipe' })
      return c
    } catch { /* try next */ }
  }
  return null
}

const PSQL = findPsql()
const ADMIN_URL =
  process.env.ATLAS_SQL_TEST_URL ??
  `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/postgres`

function dsnFor(database: string): string {
  const url = new URL(ADMIN_URL)
  url.pathname = `/${database}`
  return url.toString()
}

function run(dsn: string, args: string[], input?: string): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, ...args], {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60_000,
  })
}

/** Run SQL and return rows as `|`-separated field arrays (no header, no padding). */
function query(dsn: string, sql: string): string[][] {
  const out = execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-F', '|', '-d', dsn, '-c', sql], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60_000,
  })
  return out.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split('|'))
}

const AVAILABLE = (() => {
  if (!PSQL) return false
  try {
    execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], {
      stdio: 'pipe',
      timeout: 10_000,
    })
    return true
  } catch {
    return false
  }
})()

/**
 * Where SQL proof is REQUIRED, an unreachable database must FAIL rather than
 * skip — a green run that skipped this suite proves nothing. CI sets CI=true;
 * ATLAS_SQL_TEST_REQUIRED=1 forces the same locally. A developer without
 * Postgres still gets a loud skip.
 */
const SQL_REQUIRED = process.env.CI === 'true' || process.env.ATLAS_SQL_TEST_REQUIRED === '1'

if (!AVAILABLE && !SQL_REQUIRED) {
  console.warn(
    '[atlas-memory-recall-sql] SKIPPED — no reachable local Postgres. ' +
      'The SQL half of the recall isolation boundary was NOT proven in this run. ' +
      'Set ATLAS_SQL_TEST_URL (superuser DSN) / ATLAS_SQL_TEST_PSQL to enable it.',
  )
}

const DB_NAME = `atlas_mem_boundary_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''

// ── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(!AVAILABLE && !SQL_REQUIRED)('BOUNDARY B — public.atlas_recall project isolation (real SQL)', () => {
  beforeAll(() => {
    // When the database is unreachable but required, let the reachability test
    // below report it cleanly instead of failing every test via a hook error.
    if (!AVAILABLE) return
    run(ADMIN_URL, ['-c', `create database ${DB_NAME}`])
    dsn = dsnFor(DB_NAME)

    // Supabase-shaped prerequisites the shipped migrations assume.
    run(dsn, [], `
      do $$ begin
        if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role  nologin; end if;
        if not exists (select 1 from pg_roles where rolname='anon')          then create role anon          nologin; end if;
        if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      end $$;
      create schema if not exists auth;
      create or replace function auth.uid() returns uuid language sql stable
        as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
      create table if not exists public.projects (
        id uuid primary key default gen_random_uuid(),
        owner_id uuid
      );
    `)

    for (const file of MIGRATIONS) {
      const full = path.join(MIGRATIONS_DIR, file)
      if (!fs.existsSync(full)) throw new Error(`migration missing: ${file}`)
      run(dsn, ['-f', full])
    }

    // Fixtures: one memory + one episodic event in each of project A, project B,
    // world and org scope, so every branch of the scope filter is exercised.
    run(dsn, [], `
      insert into public.projects (id, owner_id) values
        ('${PROJECT_A}', '11111111-1111-4111-8111-111111111111'),
        ('${PROJECT_B}', '22222222-2222-4222-8222-222222222222');

      insert into atlas.memories (scope, memory_class, project_id, entity_kind, entity_id, mem_key, summary) values
        ('project','procedural','${PROJECT_A}','output_type','article','k','MEM_A'),
        ('project','procedural','${PROJECT_B}','output_type','article','k','MEM_B'),
        ('world',  'decision',  null,          'output_type','article','k','MEM_WORLD'),
        ('org',    'procedural',null,          'output_type','article','korg','MEM_ORG');

      insert into atlas.memory_events (scope, event_type, project_id, entity_kind, entity_id, content, source) values
        ('project','outcome','${PROJECT_A}','run','r1','EVT_A','drain'),
        ('project','outcome','${PROJECT_B}','run','r2','EVT_B','drain'),
        ('world',  'outcome',null,          'run','r3','EVT_WORLD','drain'),
        ('org',    'outcome',null,          'run','r4','EVT_ORG','drain');
    `)
  }, 120_000)

  afterAll(() => {
    if (!dsn) return
    try {
      run(ADMIN_URL, ['-c', `drop database if exists ${DB_NAME} with (force)`])
    } catch {
      // Best effort; the database is namespaced and disposable either way.
    }
  }, 60_000)

  /** Summaries returned by atlas_recall for the given allowed-project list. */
  function recall(projectIds: string[]): string[] {
    const arr = projectIds.length ? `array['${projectIds.join("','")}']::uuid[]` : `array[]::uuid[]`
    return query(dsn, `select summary from public.atlas_recall(${arr}) order by summary`)
      .map((r) => r[0])
  }

  it('PostgreSQL is reachable — this suite must never pass by skipping in CI', () => {
    expect(
      AVAILABLE,
      'SQL proof is REQUIRED here (CI=true or ATLAS_SQL_TEST_REQUIRED=1) but no ' +
        `PostgreSQL was reachable at ${ADMIN_URL.replace(/:[^:@/]*@/, ':***@')} ` +
        `via psql=${PSQL ?? 'NOT FOUND'}. The recall isolation boundary was NOT proven.`,
    ).toBe(true)
  })

  it('the fixtures really are in the tables (harness is not vacuous)', () => {
    expect(query(dsn, 'select count(*) from atlas.memories')[0][0]).toBe('4')
    expect(query(dsn, 'select count(*) from atlas.memory_events')[0][0]).toBe('4')
  })

  it('CASE 1 — an allowed project returns its own rows', () => {
    const rows = recall([PROJECT_A])
    expect(rows).toContain('MEM_A')
    expect(rows).toContain('EVT_A')
  })

  it('CASE 2+3 — a foreign project never appears when only A is requested', () => {
    const rows = recall([PROJECT_A])
    expect(rows).not.toContain('MEM_B')
    expect(rows).not.toContain('EVT_B')
    expect(rows.sort()).toEqual(['EVT_A', 'EVT_WORLD', 'MEM_A', 'MEM_WORLD'])
  })

  it('CASE 2+3 (mirror) — requesting only B never leaks A', () => {
    const rows = recall([PROJECT_B])
    expect(rows).not.toContain('MEM_A')
    expect(rows).not.toContain('EVT_A')
    expect(rows.sort()).toEqual(['EVT_B', 'EVT_WORLD', 'MEM_B', 'MEM_WORLD'])
  })

  it('CASE 4 — world scope is returned regardless of the allowed set', () => {
    for (const set of [[PROJECT_A], [PROJECT_B], [PROJECT_A, PROJECT_B], []]) {
      const rows = recall(set)
      expect(rows, `world missing for allowed=${JSON.stringify(set)}`).toContain('MEM_WORLD')
      expect(rows).toContain('EVT_WORLD')
    }
  })

  it('CASE 5 — an empty allowed set leaks no project-scoped row', () => {
    const rows = recall([])
    expect(rows.sort()).toEqual(['EVT_WORLD', 'MEM_WORLD'])
    expect(rows.some((r) => r.endsWith('_A') || r.endsWith('_B'))).toBe(false)
  })

  it('CASE 6 — a mixed explicit list returns exactly the supplied projects', () => {
    const rows = recall([PROJECT_A, PROJECT_B])
    expect(rows.sort()).toEqual(['EVT_A', 'EVT_B', 'EVT_WORLD', 'MEM_A', 'MEM_B', 'MEM_WORLD'])
  })

  it('an unknown project id grants nothing (no wildcard behaviour)', () => {
    const rows = recall(['99999999-9999-4999-8999-999999999999'])
    expect(rows.sort()).toEqual(['EVT_WORLD', 'MEM_WORLD'])
  })

  it('org-scope rows are never returned by recall', () => {
    for (const set of [[PROJECT_A], [PROJECT_A, PROJECT_B], []]) {
      const rows = recall(set)
      expect(rows).not.toContain('MEM_ORG')
      expect(rows).not.toContain('EVT_ORG')
    }
  })

  // ── Service-role contract (supplementary to the route-layer tests) ─────────

  it('neither wrapper is executable by anon or authenticated', () => {
    const recordSig =
      'public.atlas_record_event(text,text,text,text,uuid,text,text,text,jsonb,numeric,text,text,timestamptz)'
    const recallSig = 'public.atlas_recall(uuid[],text[],text[],integer,integer)'
    for (const sig of [recordSig, recallSig]) {
      for (const role of ['anon', 'authenticated', 'public']) {
        const [[granted]] = query(dsn, `select has_function_privilege('${role}', '${sig}', 'EXECUTE')`)
        expect(granted, `${role} must NOT execute ${sig}`).toBe('f')
      }
      const [[svc]] = query(dsn, `select has_function_privilege('service_role', '${sig}', 'EXECUTE')`)
      expect(svc, `service_role must execute ${sig}`).toBe('t')
    }
  })

  it('the atlas schema is not readable by anon or authenticated', () => {
    for (const role of ['anon', 'authenticated']) {
      const [[usage]] = query(dsn, `select has_schema_privilege('${role}', 'atlas', 'USAGE')`)
      expect(usage, `${role} must not have USAGE on atlas`).toBe('f')
    }
    const [[svc]] = query(dsn, `select has_schema_privilege('service_role', 'atlas', 'USAGE')`)
    expect(svc).toBe('t')
  })

  it('both wrappers are SECURITY DEFINER', () => {
    const rows = query(dsn, `
      select p.proname, p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname in ('atlas_recall','atlas_record_event') order by 1`)
    expect(rows).toEqual([['atlas_recall', 't'], ['atlas_record_event', 't']])
  })

  it('RLS is enabled on both tables WITH a policy (no "RLS on, no policy" trap)', () => {
    const rows = query(dsn, `
      select c.relname, c.relrowsecurity,
             (select count(*) from pg_policies p where p.schemaname='atlas' and p.tablename=c.relname)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='atlas' and c.relkind='r' order by 1`)
    expect(rows).toEqual([['memories', 't', '1'], ['memory_events', 't', '1']])
  })

  it('atlas_record_event does NOT self-authorize the project — the route layer must', () => {
    // Characterization, not a defect: the wrapper is service_role-only system
    // emit and trusts its caller's project_id by design (ADR v3 §4). Pinning it
    // here is what makes BOUNDARY C load-bearing — if this ever starts failing
    // because the wrapper gained its own ownership check, the write-scope tests
    // in atlas-memory-write-scope.test.ts should be revisited, not deleted.
    const [[id]] = query(dsn, `
      select public.atlas_record_event(
        'project','feedback','arbitrary','test',
        '${PROJECT_B}'::uuid,'output_type','article',null,'{}'::jsonb,0.5,'src-1','feedback:article'
      ) is not null`)
    expect(id).toBe('t')
    const [[count]] = query(
      dsn,
      `select count(*) from atlas.memory_events where source='test' and project_id='${PROJECT_B}'`,
    )
    expect(count).toBe('1')
  })
})
