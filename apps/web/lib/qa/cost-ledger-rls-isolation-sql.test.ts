/**
 * lib/qa/cost-ledger-rls-isolation-sql.test.ts — Phase 9AB, APPLIED.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Five policies read `project_id IS NULL OR project_id IN (…owner = auth.uid())`
 * on role PUBLIC. RLS was on and the policy mentioned auth.uid(), which is why
 * five closure audits passed them: the check was "RLS enabled + references the
 * caller". The first branch does not depend on the caller at all. In production
 * anon read 87 platform-level cost_events rows with nothing but the public key.
 *
 * A string match on the fixed migration would prove only that the file says the
 * right thing. This suite applies the REAL creating migrations, BECOMES each
 * role — anon, two different signed-in users, the service role — and asks
 * Postgres what it permits, before and after the fix.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────
 * LOCAL ONLY: per-process throwaway database, dropped in afterAll; never
 * reaches Supabase. SKIPS loudly without a local Postgres, like every *-sql
 * suite here. `auth.uid()` reads the same request.jwt.claim.sub GUC Supabase
 * sets, so impersonating a user is a `set local`, not a mock.
 *
 * ── WHAT THE FIXTURE SUPPLIES ──────────────────────────────────────────────
 * Only what the four creating migrations reference and do not create:
 * projects, agents, runs, run_logs, media_insights, media_scripts, memories, the roles,
 * and Supabase's default grants. The five cost-ledger tables, their policies
 * and their RLS all come from the real files.
 *
 * ── ONE THING IT CANNOT PROVE ──────────────────────────────────────────────
 * Local roles lack Supabase's BYPASSRLS on service_role, so the positive
 * control runs as the table owner, which bypasses RLS for the same reason.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
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
const AVAILABLE = (() => {
  if (!PSQL) return false
  try { execFileSync(PSQL, ['-X', '-t', '-A', '-d', ADMIN_URL, '-c', 'select 1'], { stdio: 'pipe', timeout: 10_000 }); return true }
  catch { return false }
})()

const DB = `omnira_cost_ledger_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
let dsn = ''
const MIG = (f: string) => join(process.cwd(), 'supabase/migrations', f)
const CREATING = [
  '20260528_agent_decisions.sql', '20260601_revenue_os.sql',
  '20260602_cost_events.sql', '20260602_atlas_bi_foundation.sql',
]
const FIX = MIG('20260910120000_cost_ledger_rls_isolation.sql')

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002'
const PROJ_A = 'aaaaaaaa-1111-1111-1111-111111111111'
const PROJ_B = 'bbbbbbbb-2222-2222-2222-222222222222'
const TABLES = ['cost_events', 'infra_costs', 'agent_decisions', 'memory_refs', 'ai_cost_snapshots'] as const

const FIXTURE = `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.projects (id uuid primary key default gen_random_uuid(), owner_id uuid, slug text, name text);
create table public.agents (id uuid primary key default gen_random_uuid(), name text, project_id uuid);
create table public.runs (id uuid primary key default gen_random_uuid(), project_id uuid, workflow_id uuid, status text, created_at timestamptz default now());
create table public.run_logs (id uuid primary key default gen_random_uuid(), run_id uuid, step_name text, role text,
  created_at timestamptz default now(), duration_ms int, tokens_in int, tokens_out int);
create table public.media_insights (id uuid primary key default gen_random_uuid());
create table public.media_scripts (id uuid primary key default gen_random_uuid(), project_id uuid);
create table public.memories (id uuid primary key default gen_random_uuid());
-- Supabase's default posture: client roles get the public schema. Without it the
-- exposure would not reproduce and the suite would prove nothing.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
insert into public.projects (id, owner_id, slug) values ('${PROJ_A}', '${USER_A}', 'a'), ('${PROJ_B}', '${USER_B}', 'b');
`

const SEED = `
insert into public.cost_events (project_id, provider, model, cost_sek) values
  (null, 'platform', 'm', 1), ('${PROJ_A}', 'p', 'm', 2), ('${PROJ_B}', 'p', 'm', 3);
insert into public.infra_costs (project_id, provider, period_month) values
  (null, 'vercel', date '2026-09-01'), ('${PROJ_A}', 'vercel', date '2026-09-01');
insert into public.agent_decisions (id, project_id, decision) values
  ('dddddddd-0000-0000-0000-000000000001', null, 'd'), ('dddddddd-0000-0000-0000-000000000002', '${PROJ_A}', 'd');
insert into public.memory_refs (decision_id) values ('dddddddd-0000-0000-0000-000000000001');
insert into public.ai_cost_snapshots (project_id, service, period_start, period_end) values
  (null, 's', date '2026-09-01', date '2026-09-30'), ('${PROJ_A}', 's', date '2026-09-01', date '2026-09-30');
`

const d = AVAILABLE ? describe : describe.skip
if (!AVAILABLE) console.warn('[cost-ledger-rls-isolation-sql] SKIPPED — no reachable local Postgres. The Phase 9AB '
  + 'policy change was NOT proven in this run. Set ATLAS_SQL_TEST_URL to enable it.')

let rowsBefore: Record<string, string> = {}

beforeAll(() => {
  if (!AVAILABLE) return
  run(ADMIN_URL, ['-c', `create database "${DB}"`])
  dsn = dsnFor(DB)
  run(dsn, ['-c', FIXTURE])
  for (const f of CREATING) run(dsn, ['--single-transaction', '-f', MIG(f)])
  run(dsn, ['-c', SEED])
}, 120_000)
afterAll(() => {
  if (!AVAILABLE || !dsn) return
  try { run(ADMIN_URL, ['-c', `drop database if exists "${DB}" with (force)`]) } catch { /* best effort */ }
})

/** Does the given role/user see, or can it write, a null-project row? */
const nullRead  = (t: string, role: string, sub: string | null) =>
  as(dsn, role, sub, t === 'memory_refs'
    ? `select count(*) from public.memory_refs`
    : `select count(*) from public.${t} where project_id is null`)

d('Phase 9AB — BEFORE the fix: the exposure reproduces from the real migrations', () => {
  it('all five tables exist with their original policies', () => {
    for (const t of TABLES) expect(one(dsn, `select to_regclass('public.${t}') is not null`), t).toBe('t')
    expect(one(dsn, `select count(*) from pg_policies where schemaname='public'
      and qual ilike '%project_id IS NULL%'`), 'the caller-independent branch is not present — nothing to fix').not.toBe('0')
  })

  for (const t of ['cost_events', 'infra_costs', 'agent_decisions', 'ai_cost_snapshots'] as const) {
    it(`anon READS null-project rows of ${t} — the live finding, executed`, () => {
      const r = nullRead(t, 'anon', null)
      expect(r.ok, r.err).toBe(true)
      expect(Number(r.out), `${t}: anon saw no null-project row — the suite would prove nothing`).toBeGreaterThan(0)
    })
  }

  it('memory_refs leaks through the same branch inlined in its subquery', () => {
    const r = nullRead('memory_refs', 'anon', null)
    expect(r.ok, r.err).toBe(true)
    expect(Number(r.out)).toBeGreaterThan(0)
  })

  it('anon can INSERT a null-project cost row — FOR ALL with no WITH CHECK reuses USING', () => {
    // Every NOT NULL column is supplied, so the only thing that could refuse this
    // is security. An earlier draft omitted \`provider\` and failed on a constraint,
    // which would have read as "anon is blocked" for entirely the wrong reason.
    const r = as(dsn, 'anon', null, `insert into public.cost_events (project_id, provider, cost_sek) values (null, 'anon', 999)`)
    expect(r.ok, r.err).toBe(true)
  })

  it('anon can UPDATE and DELETE null-project cost rows', () => {
    expect(as(dsn, 'anon', null, `update public.cost_events set cost_sek = 0 where project_id is null`).ok).toBe(true)
    expect(as(dsn, 'anon', null, `delete from public.cost_events where project_id is null`).ok).toBe(true)
  })

  it('a signed-in user reads platform rows too — retargeting to authenticated would not fix it', () => {
    const r = nullRead('cost_events', 'authenticated', USER_B)
    expect(r.ok).toBe(true)
    expect(Number(r.out)).toBeGreaterThan(0)
  })
})

d('Phase 9AB — applying the fix', () => {
  it('captures row counts so the fix can be shown to change no data', () => {
    for (const t of TABLES) rowsBefore[t] = one(dsn, `select count(*) from public.${t}`)
  })
  it('the real migration applies cleanly', () => { expect(() => run(dsn, ['--single-transaction', '-f', FIX])).not.toThrow() })
  it('is idempotent', () => { expect(() => run(dsn, ['--single-transaction', '-f', FIX])).not.toThrow() })
  it('changes no data — every row count is identical', () => {
    for (const t of TABLES) expect(one(dsn, `select count(*) from public.${t}`), t).toBe(rowsBefore[t])
  })
  it('leaves RLS ON for all five — it never disables it', () => {
    for (const t of TABLES) expect(one(dsn, `select relrowsecurity from pg_class where oid='public.${t}'::regclass`), t).toBe('t')
  })
  it('no caller-independent branch survives on any of them', () => {
    expect(one(dsn, `select count(*) from pg_policies where schemaname='public'
      and tablename in ('cost_events','infra_costs','agent_decisions','memory_refs','ai_cost_snapshots')`)).toBe('0')
  })
  it('anon and authenticated hold no privileges on any of them', () => {
    expect(one(dsn, `select count(*) from information_schema.role_table_grants where table_schema='public'
      and table_name in ('cost_events','infra_costs','agent_decisions','memory_refs','ai_cost_snapshots')
      and grantee in ('anon','authenticated')`)).toBe('0')
  })
})

d('Phase 9AB — negative controls: anon', () => {
  for (const t of TABLES) {
    it(`anon cannot read ${t}`, () => { expect(nullRead(t, 'anon', null).err).toMatch(/permission denied/i) })
  }
  it('anon cannot INSERT a null-project cost row', () => {
    expect(as(dsn, 'anon', null, `insert into public.cost_events (project_id, provider, cost_sek) values (null, 'anon', 1)`).err).toMatch(/permission denied/i)
  })
  it('anon cannot UPDATE null-project cost rows', () => {
    expect(as(dsn, 'anon', null, `update public.cost_events set cost_sek = 0 where project_id is null`).err).toMatch(/permission denied/i)
  })
  it('anon cannot DELETE null-project cost rows', () => {
    expect(as(dsn, 'anon', null, `delete from public.cost_events where project_id is null`).err).toMatch(/permission denied/i)
  })
  it('anon cannot reach a tenant row either', () => {
    expect(as(dsn, 'anon', null, `select count(*) from public.cost_events where project_id = '${PROJ_A}'`).err).toMatch(/permission denied/i)
  })
})

d('Phase 9AB — negative controls: signed-in users (no direct product surface exists)', () => {
  it('user A cannot read platform rows', () => {
    expect(nullRead('cost_events', 'authenticated', USER_A).err).toMatch(/permission denied/i)
  })
  it('user A cannot read even their OWN project rows directly — server-only, by design', () => {
    expect(as(dsn, 'authenticated', USER_A, `select count(*) from public.cost_events where project_id = '${PROJ_A}'`).err)
      .toMatch(/permission denied/i)
  })
  it('user A cannot read user B project rows', () => {
    expect(as(dsn, 'authenticated', USER_A, `select count(*) from public.cost_events where project_id = '${PROJ_B}'`).err)
      .toMatch(/permission denied/i)
  })
  it('user A cannot write a cost row', () => {
    expect(as(dsn, 'authenticated', USER_A, `insert into public.cost_events (project_id, provider, cost_sek) values ('${PROJ_A}', 'u', 1)`).err)
      .toMatch(/permission denied/i)
  })
  for (const t of ['infra_costs', 'agent_decisions', 'memory_refs', 'ai_cost_snapshots'] as const) {
    it(`user A cannot read ${t}`, () => { expect(nullRead(t, 'authenticated', USER_A).err).toMatch(/permission denied/i) })
  }
})

d('Phase 9AB — positive controls: the server path is untouched', () => {
  it('the writer path still inserts a cost row (null-project, as lib/cost/track.ts does)', () => {
    expect(() => run(dsn, ['-c', `insert into public.cost_events (project_id, provider, model, cost_sek) values (null, 'x', 'y', 1)`])).not.toThrow()
  })
  it('the reporting path still reads platform AND tenant rows', () => {
    expect(Number(one(dsn, `select count(*) from public.cost_events where project_id is null`))).toBeGreaterThan(0)
    expect(Number(one(dsn, `select count(*) from public.cost_events where project_id is not null`))).toBeGreaterThan(0)
  })
  it('the CostIntelligence path still reads project-scoped rows via .in(project_id, …)', () => {
    expect(one(dsn, `select count(*) from public.cost_events where project_id in ('${PROJ_A}')`)).toBe('1')
  })
  for (const t of ['infra_costs', 'agent_decisions', 'memory_refs', 'ai_cost_snapshots'] as const) {
    it(`the server path still reads ${t}`, () => { expect(Number(one(dsn, `select count(*) from public.${t}`))).toBeGreaterThan(0) })
  }
  it('service_role retains full privileges on all five', () => {
    for (const t of TABLES) {
      const privs = one(dsn, `select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
        where table_schema='public' and table_name='${t}' and grantee='service_role'`)
      for (const p of ['DELETE', 'INSERT', 'SELECT', 'UPDATE']) expect(privs, `${t} lost ${p}`).toContain(p)
    }
  })
})

d('Phase 9AB — production shape: the fresh-deploy-only tables are absent', () => {
  it('the migration still applies when agent_decisions, memory_refs and ai_cost_snapshots do not exist', () => {
    const db2 = `${DB}_prod`
    run(ADMIN_URL, ['-c', `create database "${db2}"`])
    try {
      const d2 = dsnFor(db2)
      run(d2, ['-c', FIXTURE])
      run(d2, ['--single-transaction', '-f', MIG('20260602_cost_events.sql')])
      // infra_costs alone, without the rest of atlas_bi_foundation
      run(d2, ['-c', `create table public.infra_costs (id uuid primary key default gen_random_uuid(), project_id uuid, provider text not null, period_month date not null);
        alter table public.infra_costs enable row level security;
        create policy "infra_costs_owner" on public.infra_costs for all using
          (project_id is null or project_id in (select id from projects where owner_id = auth.uid()));`])
      expect(() => run(d2, ['--single-transaction', '-f', FIX])).not.toThrow()
      expect(one(d2, `select count(*) from pg_policies where schemaname='public' and tablename in ('cost_events','infra_costs')`)).toBe('0')
    } finally {
      try { run(ADMIN_URL, ['-c', `drop database if exists "${db2}" with (force)`]) } catch { /* best effort */ }
    }
  })
})
