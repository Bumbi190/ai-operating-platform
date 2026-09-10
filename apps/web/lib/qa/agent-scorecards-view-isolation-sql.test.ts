/**
 * lib/qa/agent-scorecards-view-isolation-sql.test.ts — Phase 9AA, APPLIED.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `20260528_agent_decisions.sql` creates the view `agent_scorecards` over
 * agents, runs and run_logs with no options. A view runs as its OWNER unless it
 * is security_invoker, so the owner-rooted RLS on all three base tables is never
 * consulted when the view is read — and Supabase's default privileges give every
 * new object in `public`, views included, to anon and authenticated. Every phase
 * up to 9AB compared TABLES only, which is how a rebuild could come up with a
 * cross-tenant read that production does not have.
 *
 * This suite applies the REAL creating migration, becomes each role and asks
 * Postgres what it permits — before and after the fix.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────
 * LOCAL ONLY: per-process throwaway database, dropped in afterAll; never
 * reaches Supabase. SKIPS loudly without a local Postgres, like every *-sql
 * suite here. `auth.uid()` reads the request.jwt.claim.sub GUC Supabase sets.
 *
 * ── WHAT THE FIXTURE SUPPLIES ──────────────────────────────────────────────
 * Only what the creating migration references and does not create: projects,
 * agents, runs, run_logs, memories, the roles, Supabase's default grants — and
 * the base tables' RLS with production's EXACT policies (projects_owner,
 * agents_owner, runs_owner, run_logs_owner, all FOR ALL on role PUBLIC). The
 * leak is only meaningful against base tables that are correctly protected.
 *
 * ── SERVICE ROLE ───────────────────────────────────────────────────────────
 * Local roles lack Supabase's BYPASSRLS on service_role, and with
 * security_invoker the view now honours the caller's RLS. So the positive
 * control uses a per-run role that is BYPASSRLS and a member of service_role —
 * what service_role is in production (verified: rolbypassrls = true) — and
 * drops it afterwards.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function findPsql(): string | null {
  for (const c of [process.env.ATLAS_SQL_TEST_PSQL, 'psql', '/opt/homebrew/opt/libpq/bin/psql',
    '/usr/local/opt/libpq/bin/psql', '/usr/bin/psql'].filter(Boolean) as string[]) {
    try { execFileSync(c, ['--version'], { stdio: 'pipe' }); return c } catch { /* next */ }
  }
  return null
}
const PSQL = findPsql()
const ADMIN_URL = process.env.ATLAS_SQL_TEST_URL ?? `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:5432/postgres`
const dsnFor = (db: string) => { const u = new URL(ADMIN_URL); u.pathname = `/${db}`; return u.toString() }
function run(dsn: string, args: string[]) {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-d', dsn, ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
}
function one(dsn: string, sql: string): string {
  return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', sql],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 }).trim()
}
/** Run as a role (and optionally as a signed-in user) inside a rolled-back txn. */
function as(dsn: string, role: string, sub: string | null, sql: string): { ok: boolean; out: string; err: string } {
  const claim = sub ? `set local request.jwt.claim.sub = '${sub}';` : ''
  try {
    const out = execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c',
      `begin; set local role ${role}; ${claim} ${sql}; rollback;`],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 })
    return { ok: true, out: out.trim(), err: '' }
  } catch (e) { return { ok: false, out: '', err: String((e as { stderr?: Buffer }).stderr ?? '') } }
}
/** Run SQL as the superuser inside a transaction that is always rolled back. */
function inRolledBackTxn(dsn: string, sql: string): string {
  try {
    return execFileSync(PSQL!, ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-d', dsn, '-c', `begin; ${sql}; rollback;`],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 }).trim()
  } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e) }
}
const AVAILABLE = (() => {
  if (!PSQL) return false
  try { execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 }); return true }
  catch { return false }
})()

const TAG = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const DB = `omnira_scorecards_${TAG}`
const DB_ABSENT = `omnira_scorecards_absent_${TAG}`
const SVC = `omnira_9aa_svc_${TAG}`
let dsn = ''
let dsnAbsent = ''
const MIG = (f: string) => join(process.cwd(), 'supabase/migrations', f)
const CREATING = MIG('20260528_agent_decisions.sql')
const FIX = MIG('20260910150000_agent_scorecards_view_isolation.sql')

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002'
const PROJ_A = 'aaaaaaaa-1111-1111-1111-111111111111'
const PROJ_B = 'bbbbbbbb-2222-2222-2222-222222222222'

const ROLES = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
`

const FIXTURE = `
create extension if not exists pgcrypto;
${ROLES}
create table public.projects (id uuid primary key default gen_random_uuid(), owner_id uuid not null, slug text, name text);
create table public.agents (id uuid primary key default gen_random_uuid(), name text not null, project_id uuid not null);
create table public.runs (id uuid primary key default gen_random_uuid(), project_id uuid not null, workflow_id uuid, status text, created_at timestamptz default now());
create table public.run_logs (id uuid primary key default gen_random_uuid(), run_id uuid not null, step_name text, role text,
  created_at timestamptz default now(), duration_ms int, tokens_in int, tokens_out int);
create table public.memories (id uuid primary key default gen_random_uuid());
-- Production's exact base-table protection (pg_policies, captured 2026-09-10).
alter table public.projects enable row level security;
alter table public.agents   enable row level security;
alter table public.runs     enable row level security;
alter table public.run_logs enable row level security;
create policy projects_owner on public.projects for all using (owner_id = auth.uid());
create policy agents_owner   on public.agents   for all using (project_id in (select projects.id from public.projects where projects.owner_id = auth.uid()));
create policy runs_owner     on public.runs     for all using (project_id in (select projects.id from public.projects where projects.owner_id = auth.uid()));
create policy run_logs_owner on public.run_logs for all using (run_id in (select runs.id from public.runs where runs.project_id in (select projects.id from public.projects where projects.owner_id = auth.uid())));
-- Supabase's default posture: client roles get the public schema, and default
-- privileges hand them every object created later — views included. Without it
-- the bypass would not reproduce and the suite would prove nothing.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
insert into public.projects (id, owner_id, slug, name) values ('${PROJ_A}', '${USER_A}', 'a', 'A'), ('${PROJ_B}', '${USER_B}', 'b', 'B');
insert into public.agents (name, project_id) values ('writer', '${PROJ_A}'), ('editor', '${PROJ_B}');
insert into public.runs (id, project_id, status) values
  ('aaaaaaaa-3333-3333-3333-333333333333', '${PROJ_A}', 'done'), ('bbbbbbbb-4444-4444-4444-444444444444', '${PROJ_B}', 'failed');
insert into public.run_logs (run_id, step_name, role, tokens_in, tokens_out, duration_ms) values
  ('aaaaaaaa-3333-3333-3333-333333333333', 'writer', 'assistant', 10, 20, 100),
  ('bbbbbbbb-4444-4444-4444-444444444444', 'editor', 'assistant', 30, 40, 200);
`

const d = AVAILABLE ? describe : describe.skip
if (!AVAILABLE) console.warn('[agent-scorecards-view-isolation-sql] SKIPPED — no reachable local Postgres. The Phase 9AA '
  + 'view fix was NOT proven in this run. Set ATLAS_SQL_TEST_URL to enable it.')

const policiesOf = (t: string) => one(dsn, `select string_agg(policyname||':'||cmd||':'||roles::text||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ' | ' order by policyname) from pg_policies where schemaname='public' and tablename='${t}'`)
const projectsSeen = (role: string, sub: string | null) =>
  as(dsn, role, sub, `select count(distinct project_id) from public.agent_scorecards`)
const optionsOfView = () => one(dsn, `select coalesce(array_to_string(reloptions, ','), '') from pg_class where oid = 'public.agent_scorecards'::regclass`)
const priv = (role: string, obj = 'public.agent_scorecards', p = 'SELECT') => one(dsn, `select has_table_privilege('${role}', '${obj}', '${p}')`)

let baseline: { policies: Record<string, string>; rows: Record<string, string>; rls: string } = { policies: {}, rows: {}, rls: '' }
const BASE = ['projects', 'agents', 'runs', 'run_logs'] as const

beforeAll(() => {
  if (!AVAILABLE) return
  run(ADMIN_URL, ['-c', `create database "${DB}"`, '-c', `create database "${DB_ABSENT}"`])
  dsn = dsnFor(DB)
  dsnAbsent = dsnFor(DB_ABSENT)
  run(dsn, ['-c', FIXTURE])
  run(dsn, ['--single-transaction', '-f', CREATING])
  run(ADMIN_URL, ['-c', `create role "${SVC}" nologin bypassrls in role service_role`])
  for (const t of BASE) {
    baseline.policies[t] = policiesOf(t)
    baseline.rows[t] = one(dsn, `select count(*) from public.${t}`)
  }
  baseline.rls = one(dsn, `select string_agg(relname||'='||relrowsecurity, ',' order by relname) from pg_class where relname in ('projects','agents','runs','run_logs') and relnamespace='public'::regnamespace`)
}, 120_000)
afterAll(() => {
  if (!AVAILABLE) return
  for (const db of [DB, DB_ABSENT]) {
    try { run(ADMIN_URL, ['-c', `drop database if exists "${db}" with (force)`]) } catch { /* best effort */ }
  }
  try { run(ADMIN_URL, ['-c', `drop role if exists "${SVC}"`]) } catch { /* best effort */ }
})

d('Phase 9AA — BEFORE the fix: the view bypasses RLS on a fresh deploy', () => {
  it('the real creating migration builds the view with no options and client grants', () => {
    expect(one(dsn, `select relkind from pg_class where oid = 'public.agent_scorecards'::regclass`)).toBe('v')
    expect(optionsOfView(), 'the view is already security_invoker — nothing to fix').not.toMatch(/security_invoker=(true|on)/)
    expect(priv('anon')).toBe('t')
    expect(priv('authenticated')).toBe('t')
  })

  it('the base tables themselves are correctly protected — the leak is not a base-table bug', () => {
    expect(as(dsn, 'anon', null, 'select count(*) from public.agents').out).toBe('0')
    expect(as(dsn, 'authenticated', USER_A, 'select count(*) from public.agents').out).toBe('1')
    expect(as(dsn, 'authenticated', USER_A, `select count(*) from public.agents where project_id = '${PROJ_B}'`).out).toBe('0')
  })

  it('anon, holding only the public key, reads EVERY tenant through the view', () => {
    const r = projectsSeen('anon', null)
    expect(r.ok, r.err).toBe(true)
    expect(r.out, 'anon saw fewer than both projects — the suite would prove nothing').toBe('2')
  })

  it('a signed-in user reads another tenant through the view', () => {
    const r = as(dsn, 'authenticated', USER_A, `select count(*) from public.agent_scorecards where project_id = '${PROJ_B}'`)
    expect(r.ok, r.err).toBe(true)
    expect(Number(r.out), 'user A could not see project B — the suite would prove nothing').toBeGreaterThan(0)
  })

  it('the leaked columns include run metrics aggregated from run_logs', () => {
    const r = as(dsn, 'anon', null, `select coalesce(sum(tokens), 0) from public.agent_scorecards`)
    expect(r.ok, r.err).toBe(true)
    expect(Number(r.out), 'no run_logs data flowed through the view').toBeGreaterThan(0)
  })
})

d('Phase 9AA — applying the fix', () => {
  it('the real migration applies cleanly', () => {
    expect(() => run(dsn, ['--single-transaction', '-f', FIX])).not.toThrow()
  })

  it('is idempotent', () => {
    expect(() => run(dsn, ['--single-transaction', '-f', FIX])).not.toThrow()
  })

  it('makes the view security_invoker', () => {
    expect(optionsOfView()).toMatch(/security_invoker=(true|on)/)
  })

  it('anon, authenticated and PUBLIC hold no privilege on the view', () => {
    for (const role of ['anon', 'authenticated']) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) expect(priv(role, 'public.agent_scorecards', p), `${role} ${p}`).toBe('f')
    }
    expect(one(dsn, `select count(*) from information_schema.role_table_grants where table_schema='public'
      and table_name='agent_scorecards' and grantee in ('anon','authenticated','PUBLIC')`)).toBe('0')
  })

  it('keeps SELECT for service_role', () => {
    expect(priv('service_role')).toBe('t')
  })

  it('changes no base table: RLS, policies and row counts are identical', () => {
    for (const t of BASE) {
      expect(policiesOf(t), `${t} policies changed`).toBe(baseline.policies[t])
      expect(one(dsn, `select count(*) from public.${t}`), `${t} rows changed`).toBe(baseline.rows[t])
    }
    expect(one(dsn, `select string_agg(relname||'='||relrowsecurity, ',' order by relname) from pg_class where relname in ('projects','agents','runs','run_logs') and relnamespace='public'::regnamespace`)).toBe(baseline.rls)
  })
})

d('Phase 9AA — negative controls AFTER the fix', () => {
  it('anon cannot read the view at all', () => {
    const r = projectsSeen('anon', null)
    expect(r.ok).toBe(false)
    expect(r.err).toMatch(/permission denied/i)
  })

  it('user A cannot read the view at all — no direct product surface exists', () => {
    const r = projectsSeen('authenticated', USER_A)
    expect(r.ok).toBe(false)
    expect(r.err).toMatch(/permission denied/i)
  })

  it('user A therefore cannot see user B rows through it', () => {
    const r = as(dsn, 'authenticated', USER_A, `select count(*) from public.agent_scorecards where project_id = '${PROJ_B}'`)
    expect(r.ok).toBe(false)
    expect(r.err).toMatch(/permission denied/i)
  })

  it('base-table RLS is intact: anon 0, user A only their own', () => {
    expect(as(dsn, 'anon', null, 'select count(*) from public.agents').out).toBe('0')
    expect(as(dsn, 'authenticated', USER_A, 'select count(*) from public.agents').out).toBe('1')
    expect(as(dsn, 'authenticated', USER_A, `select count(*) from public.agents where project_id = '${PROJ_B}'`).out).toBe('0')
  })

  it('even a grant restored by mistake would not reopen the bypass — security_invoker holds', () => {
    // Belt and braces, proven rather than asserted: restore the client grant in a
    // rolled-back transaction and read as user A. With security_invoker the view
    // honours user A's RLS, so project B stays invisible.
    const r = inRolledBackTxn(dsn, `grant select on public.agent_scorecards to authenticated;
      set local role authenticated; set local request.jwt.claim.sub = '${USER_A}';
      select count(distinct project_id)||':'||count(*) filter (where project_id = '${PROJ_B}') from public.agent_scorecards`)
    expect(r, 'user A saw project B through a restored grant').toBe('1:0')
  })

  it('a later CREATE OR REPLACE VIEW resets security_invoker — and the revoke still holds', () => {
    // Postgres drops view options on CREATE OR REPLACE without WITH, but keeps the
    // ACL. Re-running the creating migration's own definition turns invoker mode
    // off; the view is still unreachable because the grant is gone. This is
    // exactly why the migration does BOTH halves.
    const after = inRolledBackTxn(dsn, `${viewDefinition()}
      select coalesce(array_to_string(reloptions, ','), '')||'|'||has_table_privilege('anon', 'public.agent_scorecards', 'SELECT')::text
        from pg_class where oid = 'public.agent_scorecards'::regclass`)
    expect(after, 'CREATE OR REPLACE behaved differently than documented').toBe('|false')
  })
})

d('Phase 9AA — positive control: the server path is untouched', () => {
  it('a BYPASSRLS member of service_role — what service_role is in production — reads every tenant', () => {
    const r = as(dsn, `"${SVC}"`, null, `select count(distinct project_id) from public.agent_scorecards`)
    expect(r.ok, r.err).toBe(true)
    expect(r.out).toBe('2')
  })

  it('no runtime code reads the view — nothing in app/ or lib/ names it', async () => {
    const { execFileSync: ex } = await import('node:child_process')
    let hits = ''
    try {
      hits = ex('grep', ['-rln', '--include=*.ts', '--include=*.tsx', 'agent_scorecards', 'app', 'lib', 'components'],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    } catch { hits = '' }
    const runtime = hits.split('\n').filter(Boolean).filter(f => !f.startsWith('lib/qa/'))
    expect(runtime, 'a runtime caller exists — the SERVER_ONLY model would need revisiting').toEqual([])
  })
})

d('Phase 9AA — production shape: the view does not exist there', () => {
  it('on a database without the view the migration is a no-op and creates nothing', () => {
    run(dsnAbsent, ['-c', `${ROLES} create table public.projects (id uuid primary key);`])
    expect(() => run(dsnAbsent, ['--single-transaction', '-f', FIX])).not.toThrow()
    expect(one(dsnAbsent, `select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('v', 'm')`)).toBe('0')
    expect(one(dsnAbsent, `select to_regclass('public.agent_scorecards') is null`)).toBe('t')
  })

  it('a same-named TABLE is never touched — the guard checks relkind', () => {
    run(dsnAbsent, ['-c', `create table public.agent_scorecards (id int);
      grant select on public.agent_scorecards to anon;`])
    expect(() => run(dsnAbsent, ['--single-transaction', '-f', FIX])).not.toThrow()
    expect(one(dsnAbsent, `select has_table_privilege('anon', 'public.agent_scorecards', 'SELECT')`),
      'the migration altered an object that is not the view').toBe('t')
  })
})

/** The creating migration's own view definition, re-run verbatim. */
function viewDefinition(): string {
  const sql = readFileSync(CREATING, 'utf8')
  const start = sql.search(/create\s+or\s+replace\s+view\s+agent_scorecards/i)
  return sql.slice(start, sql.indexOf(';', start) + 1)
}
