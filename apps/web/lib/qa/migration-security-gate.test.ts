/**
 * lib/qa/migration-security-gate.test.ts — Phase 9AA, the migration security DIFF gate.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Closure audit #5 wrote throwaway migrations and watched CI pass every one that
 * mattered: DISABLE ROW LEVEL SECURITY, an anon `USING (true)` policy, a grant to
 * anon on a server-only table. Phase 9AB added the shape nobody's check could see
 * — a role-PUBLIC policy whose `project_id IS NULL OR …` branch ignores the
 * caller — and the 9AA survey added views, which run as their owner and bypass
 * base-table RLS entirely. This suite is the control that was missing.
 *
 * ── WHAT RUNS HERE ─────────────────────────────────────────────────────────
 * No database, no network, no secrets: it belongs in the DB-free Atlas gate.
 *   1. The gate proves it scans BOTH roots and is wired into CI.
 *   2. The real corpus passes: every blocking finding is matched by exactly one
 *      reviewed allowlist entry, and the allowlist itself is sound.
 *   3. Every audit #5 / 9AB / view probe is replayed on top of the REAL corpus as
 *      a new migration, and must be classified correctly.
 *   4. The parser and the policy-expression analyzer are tested directly on the
 *      forms that matter.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ALLOWLIST_FILE, BOOTSTRAP_FILE, MIGRATION_ROOTS, REGISTRY_FILE, RULES,
  allowlistProblems, analyze, analyzeExprText, discoverMigrations, findRepoRoot, gate, isBlocking, lex, parseOp, splitStatements,
  type Allowlist, type Finding, type MigrationFile, type Registry, type Root, type RuleId,
} from './migration-security-gate'

const REPO = findRepoRoot()
const REGISTRY = JSON.parse(readFileSync(join(REPO, REGISTRY_FILE), 'utf8')) as Registry
const ALLOWLIST = JSON.parse(readFileSync(join(REPO, ALLOWLIST_FILE), 'utf8')) as Allowlist
const BOOTSTRAP = readFileSync(join(REPO, BOOTSTRAP_FILE), 'utf8')
const CORPUS = discoverMigrations(REPO)
const run = (files = CORPUS, registry = REGISTRY, allowlist = ALLOWLIST) => analyze({ files, registry, allowlist, bootstrapSql: BOOTSTRAP })
const FULL = run()

let probeSeq = 0
/** Replay the real corpus plus `sql` as a brand-new migration, and return what the gate says about it. */
function probe(sql: string, opts: { root?: Root; registry?: Registry; extra?: string[] } = {}) {
  const root = opts.root ?? 'apps/web'
  const dir = MIGRATION_ROOTS.find(r => r.root === root)!.dir
  const mk = (s: string, i: number): MigrationFile => {
    const name = `2999010100${String(++probeSeq).padStart(4, '0')}_probe_${i}.sql`
    return { root, name, relPath: `${dir}/${name}`, version: name.slice(0, 14), sql: s }
  }
  const files = [sql, ...(opts.extra ?? [])].map(mk)
  const a = run([...CORPUS, ...files], opts.registry ?? REGISTRY)
  const mine = (f: MigrationFile) => a.findings.filter(x => x.migration === f.relPath)
  const first = mine(files[0])
  const later = files.slice(1).flatMap(mine)
  const res = gate(a.findings, ALLOWLIST)
  return {
    rules: first.map(f => f.rule),
    blocking: first.filter(f => f.blocking).map(f => f.rule),
    laterRules: later.map(f => f.rule),
    laterBlocking: later.filter(f => f.blocking).map(f => f.rule),
    unexcused: res.unexcused.filter(f => files.some(p => p.relPath === f.migration)),
    findings: first,
  }
}
/** A registry copy that also classifies the given public objects — for rule-isolating probes. */
function withClasses(tables: Record<string, string> = {}, views: Record<string, string> = {}): Registry {
  const r = JSON.parse(JSON.stringify(REGISTRY)) as Registry
  for (const [t, cls] of Object.entries(tables)) r.tables[t] = { class: cls as Registry['tables'][string]['class'], rls: true }
  r.views = { ...(r.views ?? {}) }
  for (const [v, cls] of Object.entries(views)) r.views[v] = { class: cls as Registry['tables'][string]['class'] }
  return r
}
const OWNER = `project_id in (select id from public.projects where owner_id = auth.uid())`

// ─── 1. Self-test: roots and CI ─────────────────────────────────────────────

describe('Phase 9AA — the gate scans BOTH migration roots', () => {
  it('declares exactly the two canonical roots', () => {
    expect(MIGRATION_ROOTS.map(r => r.dir)).toEqual(['supabase/migrations', 'apps/web/supabase/migrations'])
  })

  it('scans every .sql file in both roots — the scanned set IS the directory listing', () => {
    const onDisk = ['supabase/migrations', 'apps/web/supabase/migrations']
      .flatMap(d => readdirSync(join(REPO, d)).filter(n => n.endsWith('.sql')).map(n => `${d}/${n}`)).sort()
    expect(CORPUS.map(f => f.relPath).sort()).toEqual(onDisk)
    for (const root of ['repo-root', 'apps/web'] as const) {
      expect(CORPUS.filter(f => f.root === root).length, `${root} contributed no migrations`).toBeGreaterThan(30)
    }
  })

  it('refuses a partial corpus: a missing root throws instead of scanning half', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mig-gate-'))
    try {
      mkdirSync(join(tmp, 'supabase/migrations'), { recursive: true })
      mkdirSync(join(tmp, 'apps/web/supabase/migrations'), { recursive: true })
      writeFileSync(join(tmp, 'supabase/migrations/20260101_a.sql'), 'select 1;')
      expect(() => discoverMigrations(tmp)).toThrow(/apps\/web\/supabase\/migrations/)
      rmSync(join(tmp, 'supabase/migrations'), { recursive: true })
      writeFileSync(join(tmp, 'apps/web/supabase/migrations/20260101_b.sql'), 'select 1;')
      expect(() => discoverMigrations(tmp)).toThrow(/supabase\/migrations/)
    } finally { rmSync(tmp, { recursive: true, force: true }) }
  })

  it('a weakening is caught identically in either root', () => {
    for (const root of ['repo-root', 'apps/web'] as const) {
      expect(probe('alter table public.cost_rates disable row level security;', { root }).blocking, root).toContain('DISABLE_RLS')
    }
  })
})

describe('Phase 9AA — the gate actually runs in the DB-free Atlas CI job', () => {
  const WF = readFileSync(join(REPO, '.github/workflows/atlas-project-isolation.yml'), 'utf8')
  it('is in the vitest invocation', () => {
    const invocation = WF.slice(WF.indexOf('npx --no vitest run'), WF.indexOf('--reporter=default'))
    expect(invocation).toContain('lib/qa/migration-security-gate.test.ts')
  })
  it('carries an anti-skip floor, so gutting or skipping it fails the job', () => {
    const floor = /'migration-security-gate\.test\.ts':\s*(\d+)/.exec(WF)
    expect(floor, 'no floor for this suite in REQUIRED').not.toBeNull()
    expect(Number(floor![1])).toBeGreaterThanOrEqual(80)
  })
  it('runs in the job that forbids a database', () => {
    expect(WF).toMatch(/ATLAS_SQL_TEST_URL is set — these suites must stay DB-free/)
  })
})

// ─── 2. The real corpus ─────────────────────────────────────────────────────

describe('Phase 9AA — the real corpus passes, and only by exact review', () => {
  const g = gate(FULL.findings, ALLOWLIST)

  it('replays every migration and the bootstrap without an unparsed security statement', () => {
    expect(FULL.statements).toBeGreaterThan(900)
    expect(FULL.findings.filter(f => f.category === 'UNKNOWN').map(f => `${f.migration} ${f.rule} ${f.detail}`)).toEqual([])
  })

  it('every blocking finding is matched by a reviewed exception', () => {
    expect(g.unexcused.map(f => `${f.migration} :: ${f.object} :: ${f.policy ?? '-'} :: ${f.rule} :: ${f.fingerprint}`)).toEqual([])
  })

  it('no exception is stale, and none matches more than one statement', () => {
    expect(g.stale.map(e => `${e.migration} :: ${e.rule}`)).toEqual([])
    expect(g.ambiguous.map(e => `${e.migration} :: ${e.rule}`)).toEqual([])
  })

  it('the allowlist is sound: no wildcard, every superseded condition really gone, the intentional one still present', () => {
    expect(allowlistProblems(ALLOWLIST, FULL, REGISTRY, REPO)).toEqual([])
  })

  it('the corpus holds exactly the historical findings this programme already closed', () => {
    const byRule = (r: RuleId) => g.blocking.filter(f => f.rule === r).map(f => f.object).sort()
    expect(byRule('NEW_TABLE_WITHOUT_RLS')).toEqual(['public.atlas_actions', 'public.cost_rates', 'public.cron_heartbeat', 'public.dream_issues',
      'public.media_news_items', 'public.media_scripts', 'public.morning_briefings', 'public.token_health', 'public.workflow_stories'])
    expect(byRule('PUBLIC_POLICY_CALLER_INDEPENDENT')).toEqual(['public.agent_decisions', 'public.ai_cost_snapshots', 'public.cost_events', 'public.infra_costs', 'public.memory_refs'])
    expect(byRule('PUBLIC_POLICY_WRITE_EXTENSION')).toEqual(['public.ai_cost_snapshots', 'public.cost_events', 'public.infra_costs'])
    expect(byRule('VIEW_RLS_BYPASS')).toEqual(['public.agent_scorecards'])
    expect(byRule('AUTH_POLICY_CROSS_TENANT')).toEqual(['public.comment_replies', 'public.platform_config'])
  })

  it('only one exception is CURRENT_INTENTIONAL — platform_config, which is global configuration by design', () => {
    const current = ALLOWLIST.exceptions.filter(e => e.status === 'CURRENT_INTENTIONAL')
    expect(current.map(e => `${e.table}:${e.policy}`)).toEqual(['public.platform_config:authenticated_read_platform_config'])
  })

  it('the Phase 9AA view migration is pure hardening', () => {
    const mine = FULL.findings.filter(f => f.migration.endsWith('20260910150000_agent_scorecards_view_isolation.sql'))
    expect(mine.filter(f => f.blocking)).toEqual([])
    expect(mine.map(f => f.rule)).toEqual(expect.arrayContaining(['VIEW_SECURED', 'CLIENT_PRIVILEGE_REVOKED']))
  })

  it('the Phase 9AB migration is pure hardening — its drops read as unsafe policies removed', () => {
    const mine = FULL.findings.filter(f => f.migration.endsWith('20260910120000_cost_ledger_rls_isolation.sql'))
    expect(mine.filter(f => f.blocking)).toEqual([])
    expect(mine.filter(f => f.rule === 'UNSAFE_POLICY_DROPPED').map(f => f.object).sort())
      .toEqual(['public.agent_decisions', 'public.ai_cost_snapshots', 'public.cost_events', 'public.infra_costs', 'public.memory_refs'])
  })

  it('SECURITY DEFINER functions are a recognised, recorded object class — not silently ignored', () => {
    const recorded = FULL.findings.filter(f => f.rule === 'SECURITY_DEFINER_FUNCTION')
    expect(recorded.length).toBeGreaterThan(40)
    expect(recorded.every(f => !f.blocking)).toBe(true)
  })
})

// ─── 3. Allowlist safety ────────────────────────────────────────────────────

describe('Phase 9AA — the allowlist cannot be widened quietly', () => {
  const clone = (): Allowlist => JSON.parse(JSON.stringify(ALLOWLIST)) as Allowlist
  const problems = (al: Allowlist) => allowlistProblems(al, FULL, REGISTRY, REPO)

  it('a wildcard migration, table or rule is refused', () => {
    for (const [field, value] of [['migration', 'apps/web/supabase/migrations/*.sql'], ['table', 'public.*'], ['rule', 'PUBLIC_POLICY_*']] as const) {
      const al = clone()
      ;(al.exceptions[0] as unknown as Record<string, string>)[field] = value
      expect(problems(al).join('\n'), field).toMatch(/wildcard/)
    }
  })

  it('an exception for a rule that does not exist is refused', () => {
    const al = clone()
    al.exceptions[0].rule = 'EVERYTHING' as RuleId
    expect(problems(al).join('\n')).toMatch(/unknown rule/)
  })

  it('an exception that matches nothing is stale and fails the gate', () => {
    const al = clone()
    al.exceptions.push({ ...al.exceptions[0], fingerprint: '0000000000000000' })
    expect(gate(FULL.findings, al).stale.length).toBe(1)
  })

  it('an exception naming a migration that does not exist is refused', () => {
    const al = clone()
    al.exceptions[0].migration = 'apps/web/supabase/migrations/20990101_nope.sql'
    expect(problems(al).join('\n')).toMatch(/does not exist/)
  })

  it('an exception never follows its statement into another migration', () => {
    // The excused cost_events policy, copied verbatim into a NEW file, must still fail.
    const p = probe(`CREATE POLICY "cost_events_owner" ON cost_events FOR ALL USING ( project_id IS NULL OR project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()) );`)
    expect(p.unexcused.map(f => f.rule)).toEqual(expect.arrayContaining(['PUBLIC_POLICY_CALLER_INDEPENDENT', 'PUBLIC_POLICY_WRITE_EXTENSION']))
  })

  it('a "superseded" exception whose condition is still present at the end of the corpus is refused', () => {
    const al = clone()
    const pc = al.exceptions.find(e => e.table === 'public.platform_config')!
    pc.status = 'HISTORICAL_SUPERSEDED'
    pc.superseded_by = 'apps/web/supabase/migrations/20260910150000_agent_scorecards_view_isolation.sql'
    expect(problems(al).join('\n')).toMatch(/still present at the end of the corpus/)
  })

  it('a "current" exception whose subject has gone is refused as stale', () => {
    const al = clone()
    const cr = al.exceptions.find(e => e.table === 'public.comment_replies')!
    cr.status = 'CURRENT_INTENTIONAL'
    expect(problems(al).join('\n')).toMatch(/no longer exists/)
  })

  it('superseded_by must come AFTER the migration it supersedes', () => {
    const al = clone()
    const ws = al.exceptions.find(e => e.table === 'public.workflow_stories')!
    ws.superseded_by = 'apps/web/supabase/migrations/20260520_media_tables.sql'
    expect(problems(al).join('\n')).toMatch(/must come after/)
  })

  it('public can never be declared an internal schema', () => {
    const al = clone()
    al.internal_schemas.push({ schema: 'public', exposed_via_data_api: false, verified: 'x', justification: 'no — this must be refused by the gate itself' })
    expect(problems(al).join('\n')).toMatch(/public can never be an internal schema/)
  })

  it('every exception excuses a blocking rule, names a real fingerprint and is justified', () => {
    for (const e of ALLOWLIST.exceptions) {
      expect(isBlocking(e.rule), e.rule).toBe(true)
      expect(e.fingerprint).toMatch(/^[0-9a-f]{16}$/)
      expect(e.justification.length).toBeGreaterThanOrEqual(60)
      expect(existsSync(join(REPO, e.migration)), e.migration).toBe(true)
    }
  })
})

// ─── 4. Audit #5 + Phase 9AB probe matrix ───────────────────────────────────

describe('Phase 9AA — audit #5 and Phase 9AB probes, replayed on the real corpus', () => {
  it('A — a new public table without RLS FAILS', () => {
    const p = probe('create table public.probe_rlsless (id uuid primary key, note text);', { registry: withClasses({ probe_rlsless: 'TENANT_RLS' }) })
    expect(p.blocking).toEqual(['NEW_TABLE_WITHOUT_RLS'])
  })

  it('A′ — the same table, never classified, also fails closed as UNCLASSIFIED', () => {
    expect(probe('create table public.probe_rlsless (id uuid primary key);').blocking).toEqual(expect.arrayContaining(['UNCLASSIFIED_TABLE', 'NEW_TABLE_WITHOUT_RLS']))
  })

  it('A″ — a new table WITH RLS in the same migration passes', () => {
    const p = probe('create table public.probe_ok (id uuid primary key);\nalter table public.probe_ok enable row level security;', { registry: withClasses({ probe_ok: 'INTERNAL_DENY_ALL' }) })
    expect(p.blocking).toEqual([])
  })

  it('B — DISABLE ROW LEVEL SECURITY FAILS, though earlier migrations enabled it', () => {
    expect(probe('alter table public.cost_rates disable row level security;').blocking).toEqual(['DISABLE_RLS'])
  })

  it('C1 — an inert grant on a TENANT_RLS table is contextual, not blocking', () => {
    const p = probe('grant select on public.leads to anon;')
    expect(p.blocking).toEqual([])
    expect(p.rules).toEqual(['CLIENT_GRANT_INERT_UNDER_RLS'])
  })

  it('C2 — the same grant on an INTERNAL_DENY_ALL table FAILS', () => {
    expect(probe('grant select on public.cost_rates to anon;').blocking).toEqual(['CLIENT_GRANT_ON_SERVER_ONLY'])
  })

  it('D — a permissive anon policy FAILS', () => {
    expect(probe('create policy probe_d on public.leads for select to anon using (true);').blocking).toEqual(['PUBLIC_POLICY_CALLER_INDEPENDENT'])
  })

  it('D2 — dropping an owner policy is a LOCKOUT, not an escalation', () => {
    const p = probe('drop policy "leads_owner" on public.leads;')
    expect(p.blocking).toEqual([])
    expect(p.rules).toEqual(['POLICY_DROPPED_LOCKOUT'])
  })

  it('E — `<col> IS NULL OR owner_scope` FAILS', () => {
    const p = probe(`create policy probe_e on public.leads for select using (project_id is null or ${OWNER});`)
    expect(p.blocking).toEqual(['PUBLIC_POLICY_CALLER_INDEPENDENT'])
    expect(p.findings[0].detail).toMatch(/project_id is null/i)
  })

  it('E′ — the reversed form `owner_scope OR <col> IS NULL` FAILS too', () => {
    expect(probe(`create policy probe_e2 on public.leads for select using (${OWNER} or project_id is null);`).blocking).toEqual(['PUBLIC_POLICY_CALLER_INDEPENDENT'])
  })

  it('F — the same branch inside a subquery FAILS', () => {
    const p = probe('create policy probe_f on public.content_feedback for select using (project_id in (select p.id from public.projects p where p.owner_id is null or p.owner_id = auth.uid()));')
    expect(p.blocking).toEqual(['PUBLIC_POLICY_CALLER_INDEPENDENT'])
  })

  it('G — a policy with NO `TO` clause is PUBLIC, so anon is in scope', () => {
    const p = probe('create policy probe_g on public.leads for select using (true);')
    expect(p.blocking).toEqual(['PUBLIC_POLICY_CALLER_INDEPENDENT'])
    expect(p.findings[0].detail).toMatch(/no TO clause, so PUBLIC/)
  })

  it('G′ — a no-TO policy that IS bounded by the caller is a normal tenant policy', () => {
    const p = probe(`create policy probe_g2 on public.leads for all using (${OWNER});`)
    expect(p.blocking).toEqual([])
    expect(p.rules).toEqual(['TENANT_POLICY'])
  })

  it('H — FOR ALL + caller-independent USING + no WITH CHECK FAILS for reads AND writes', () => {
    const p = probe(`create policy probe_h on public.leads for all using (project_id is null or ${OWNER});`)
    expect(p.blocking).toEqual(['PUBLIC_POLICY_CALLER_INDEPENDENT', 'PUBLIC_POLICY_WRITE_EXTENSION'])
    expect(p.findings[1].detail).toMatch(/WITH CHECK omitted/)
  })

  it('I — GRANT … TO anon on a SERVER_ONLY table FAILS', () => {
    expect(probe('grant select on public.cost_events to anon;').blocking).toEqual(['CLIENT_GRANT_ON_SERVER_ONLY'])
  })

  it('J — GRANT … TO authenticated on a SERVER_ONLY table FAILS', () => {
    expect(probe('grant select on public.cost_events to authenticated;').blocking).toEqual(['CLIENT_GRANT_ON_SERVER_ONLY'])
  })

  it('J′ — GRANT ALL, and GRANT on ALL TABLES IN SCHEMA public, FAIL', () => {
    expect(probe('grant all on public.workflow_stories to anon, authenticated;').blocking).toEqual(['CLIENT_GRANT_ON_SERVER_ONLY'])
    expect(probe('grant select on all tables in schema public to anon;').blocking).toEqual(['CLIENT_GRANT_ALL_TABLES'])
  })

  it('service_role grants and client REVOKEs are never blocking', () => {
    expect(probe('grant all on public.cost_events to service_role;\nrevoke all on public.leads from anon;').blocking).toEqual([])
  })
})

// ─── 5. Views ───────────────────────────────────────────────────────────────

describe('Phase 9AA — views that can bypass RLS', () => {
  const VIEW = 'create view public.probe_v as select id, project_id, name from public.agents;'

  it('1 — a public view over an RLS table, owner-executed and client-readable, FAILS', () => {
    expect(probe(VIEW, { registry: withClasses({}, { probe_v: 'TENANT_RLS' }) }).blocking).toEqual(['VIEW_RLS_BYPASS'])
  })

  it('2 — the same view with security_invoker = true passes', () => {
    const p = probe('create view public.probe_v with (security_invoker = true) as select id, project_id, name from public.agents;', { registry: withClasses({}, { probe_v: 'TENANT_RLS' }) })
    expect(p.blocking).toEqual([])
  })

  it('3 — the same view with anon/authenticated revoked passes for SERVER_ONLY', () => {
    const p = probe(`${VIEW}\nrevoke all on public.probe_v from anon, authenticated;`, { registry: withClasses({}, { probe_v: 'SERVER_ONLY' }) })
    expect(p.blocking).toEqual([])
  })

  it('4 — a client grant added later to an insecure view FAILS', () => {
    const reg = withClasses({}, { probe_v: 'TENANT_RLS' })
    const p = probe(`${VIEW}\nrevoke all on public.probe_v from anon, authenticated;`, { registry: reg, extra: ['grant select on public.probe_v to anon;'] })
    expect(p.blocking).toEqual([])
    expect(p.laterBlocking).toEqual(['CLIENT_GRANT_ON_INSECURE_VIEW'])
  })

  it('4′ — a client grant on the SERVER_ONLY agent_scorecards view FAILS', () => {
    expect(probe('grant select on public.agent_scorecards to authenticated;').blocking).toEqual(['CLIENT_GRANT_ON_SERVER_ONLY_VIEW'])
  })

  it('5 — a secured view later altered to disable security_invoker FAILS', () => {
    expect(probe('alter view public.agent_scorecards set (security_invoker = false);').blocking).toEqual(['VIEW_SECURITY_INVOKER_DISABLED'])
    expect(probe('alter view public.agent_scorecards reset (security_invoker);').blocking).toEqual(['VIEW_SECURITY_INVOKER_DISABLED'])
  })

  it('5′ — CREATE OR REPLACE without security_invoker silently resets it, and FAILS', () => {
    const p = probe('create or replace view public.agent_scorecards as select id as agent_id, project_id from public.agents;')
    expect(p.blocking).toContain('VIEW_SECURITY_INVOKER_DISABLED')
  })

  it('6 — an unknown public view over tenant tables fails closed', () => {
    expect(probe('create view public.probe_unknown_v as select r.id, r.project_id from public.runs r;').blocking)
      .toEqual(expect.arrayContaining(['UNCLASSIFIED_VIEW', 'VIEW_RLS_BYPASS']))
  })

  it('7 — a view in a reviewed internal schema is classified separately, not failed', () => {
    const p = probe('create view atlas.probe_v as select 1 as x;')
    expect(p.blocking).toEqual([])
    expect(p.rules).toEqual(['INTERNAL_SCHEMA_OBJECT'])
  })

  it('8 — a SERVER_ONLY view must have its client grants revoked, even with security_invoker', () => {
    const p = probe('create view public.probe_v with (security_invoker = true) as select id from public.agents;', { registry: withClasses({}, { probe_v: 'SERVER_ONLY' }) })
    expect(p.blocking).toEqual(['SERVER_ONLY_VIEW_CLIENT_REACHABLE'])
  })

  it('a view in a schema nobody reviewed fails closed', () => {
    expect(probe('create view shadow.v as select * from public.agents;').blocking).toEqual(['UNKNOWN_SCHEMA'])
  })

  it('a client grant on an internal schema FAILS — that is the step that exposes it', () => {
    expect(probe('grant usage on schema atlas to authenticated;').blocking).toEqual(['INTERNAL_SCHEMA_CLIENT_GRANT'])
    expect(probe('grant select on atlas.memories to anon;').blocking).toEqual(['INTERNAL_SCHEMA_CLIENT_GRANT'])
  })
})

// ─── 6. Authenticated context and write semantics ───────────────────────────

describe('Phase 9AA — authenticated policies are judged by the table they protect', () => {
  it('a legitimate tenant policy for authenticated passes', () => {
    const p = probe(`create policy probe_t on public.leads for select to authenticated using (${OWNER});`)
    expect(p.blocking).toEqual([])
  })

  it('`owner_id = auth.uid()` and `(select auth.uid())` both count as bounded', () => {
    expect(probe('create policy probe_t on public.projects for all to authenticated using (owner_id = auth.uid());').blocking).toEqual([])
    expect(probe('create policy probe_t on public.projects for all to authenticated using (owner_id = (select auth.uid()));').blocking).toEqual([])
  })

  it('authenticated USING (true) on a TENANT_RLS table is a cross-tenant read, and FAILS', () => {
    expect(probe('create policy probe_x on public.leads for select to authenticated using (true);').blocking).toEqual(['AUTH_POLICY_CROSS_TENANT'])
  })

  it('ANY client policy on a SERVER_ONLY table needs review — even a bounded one', () => {
    expect(probe(`create policy probe_s on public.cost_events for select to authenticated using (${OWNER});`).blocking).toEqual(['CLIENT_POLICY_ON_SERVER_ONLY'])
    expect(probe('create policy probe_s on public.cost_events for select to authenticated using (true);').blocking)
      .toEqual(['CLIENT_POLICY_ON_SERVER_ONLY', 'AUTH_POLICY_CROSS_TENANT'])
  })

  it('a deny-all policy on a server-only table is not an exposure', () => {
    expect(probe('create policy probe_deny on public.cost_events for all to authenticated using (false) with check (false);').blocking).toEqual([])
  })

  it('a FOR INSERT policy with WITH CHECK (true) for anon FAILS as a write exposure', () => {
    expect(probe('create policy probe_w on public.leads for insert to anon with check (true);').blocking).toEqual(['PUBLIC_POLICY_WRITE_EXTENSION'])
  })

  it('FOR ALL with a bounded USING but WITH CHECK (true) is a write-only exposure', () => {
    expect(probe(`create policy probe_w on public.leads for all using (${OWNER}) with check (true);`).blocking).toEqual(['PUBLIC_POLICY_WRITE_EXTENSION'])
  })

  it('FOR SELECT with a caller-independent USING does not invent a write exposure', () => {
    expect(probe('create policy probe_r on public.leads for select using (true);').blocking).toEqual(['PUBLIC_POLICY_CALLER_INDEPENDENT'])
  })

  it('ALTER POLICY that widens an existing policy FAILS', () => {
    expect(probe('alter policy "leads_owner" on public.leads using (true);').blocking).toEqual(['PUBLIC_POLICY_CALLER_INDEPENDENT', 'PUBLIC_POLICY_WRITE_EXTENSION'])
    expect(probe('alter policy "leads_owner" on public.leads to anon;').blocking).toEqual([])
  })

  it('dropping a RESTRICTIVE policy is a weakening', () => {
    const p = probe(`create policy probe_rr on public.leads as restrictive for all using (${OWNER});`, { extra: ['drop policy probe_rr on public.leads;'] })
    expect(p.blocking).toEqual([])
    expect(p.laterBlocking).toEqual(['RESTRICTIVE_POLICY_DROPPED'])
  })
})

// ─── 7. Delta semantics ─────────────────────────────────────────────────────

describe('Phase 9AA — each migration is judged on its own delta', () => {
  it('RLS enabled in a LATER migration does not excuse the one that created the table without it', () => {
    const p = probe('create table public.probe_late (id int);', {
      registry: withClasses({ probe_late: 'INTERNAL_DENY_ALL' }), extra: ['alter table public.probe_late enable row level security;'],
    })
    expect(p.blocking).toEqual(['NEW_TABLE_WITHOUT_RLS'])
    expect(p.laterBlocking).toEqual([])
  })

  it('a migration that only restates hardening adds no finding', () => {
    expect(probe('alter table public.cost_events enable row level security;\nrevoke all on public.cost_events from anon, authenticated;').blocking).toEqual([])
  })

  it('CREATE TABLE IF NOT EXISTS on a table that already exists is not a new table', () => {
    expect(probe('create table if not exists public.projects (id uuid primary key);').blocking).toEqual([])
  })
})

// ─── 8. Parser ──────────────────────────────────────────────────────────────

describe('Phase 9AA — the statement parser', () => {
  const ops = (sql: string) => splitStatements(lex(sql)).map(parseOp)

  it('qualified, unqualified, quoted and mixed-case names resolve to the same object', () => {
    for (const sql of ['alter table cost_rates disable row level security', 'ALTER TABLE Public.COST_RATES Disable Row Level Security',
      'alter table "public"."cost_rates" disable row level security', 'alter table if exists only public.cost_rates disable row level security']) {
      expect(probe(`${sql};`).blocking, sql).toEqual(['DISABLE_RLS'])
    }
  })

  it('a quoted identifier keeps its case — "Cost_Rates" is a different, unknown table', () => {
    expect(probe('alter table public."Cost_Rates" disable row level security;').blocking).toEqual(expect.arrayContaining(['DISABLE_RLS', 'UNCLASSIFIED_TABLE']))
  })

  it('multi-line statements with line, block and nested block comments parse', () => {
    const sql = `alter /* a /* nested */ comment */ table
      -- a line comment ; with a semicolon
      public.cost_rates
      disable row level security;`
    expect(probe(sql).blocking).toEqual(['DISABLE_RLS'])
  })

  it('keywords inside strings and comments are not statements', () => {
    expect(ops("select 'grant select on public.cost_events to anon';")).toEqual([null])
    expect(ops('-- grant select on public.cost_events to anon\nselect 1;')).toEqual([null])
    expect(ops("select E'it''s \\' grant';")).toEqual([null])
  })

  it('a CHECK constraint with `IS NULL OR` is not a policy', () => {
    expect(probe('alter table public.manager_tasks add constraint probe_chk check (work_package_id is null or project_id is not null);').blocking).toEqual([])
  })

  it('a function body is one token: a `;` inside it never splits the file', () => {
    const parsed = ops(`create function public.f() returns int language plpgsql security definer as $$ begin perform 1; return 1; end $$;`)
    expect(parsed.length).toBe(1)
    expect(parsed[0]?.k).toBe('function')
  })

  it('executable SQL inside a DO block is analysed, not stripped', () => {
    expect(probe(`do $$ begin if true then alter table public.cost_rates disable row level security; end if; end $$;`).blocking).toEqual(['DISABLE_RLS'])
  })

  it('EXECUTE of a literal inside a DO block is analysed', () => {
    expect(probe(`do $$ begin execute 'grant select on public.cost_events to anon'; end $$;`).blocking).toEqual(['CLIENT_GRANT_ON_SERVER_ONLY'])
  })

  it('EXECUTE format(…%I…) with a weakening verb fails closed on the run-time name', () => {
    expect(probe(`do $$ declare t text := 'cost_rates'; begin execute format('alter table public.%I disable row level security', t); end $$;`).blocking)
      .toEqual(['DYNAMIC_SECURITY_SQL'])
  })

  it('EXECUTE format(…%I…) with a hardening verb is fine', () => {
    expect(probe(`do $$ declare t text; begin foreach t in array array['a','b'] loop execute format('alter table public.%I enable row level security', t); end loop; end $$;`).blocking)
      .toEqual([])
  })

  it('EXECUTE of SQL the gate cannot see fails closed', () => {
    expect(probe(`do $$ declare q text := current_setting('app.q'); begin execute q; end $$;`).blocking).toEqual(['DYNAMIC_SECURITY_SQL'])
  })

  it('a SQL literal assigned in a DO block and executed later is still seen', () => {
    expect(probe(`do $$ declare q text := 'alter table public.cost_rates disable row level security'; begin execute q; end $$;`).blocking)
      .toEqual(expect.arrayContaining(['DISABLE_RLS']))
  })

  it('security DDL inside a function body needs review — it runs whenever the function is called', () => {
    expect(probe(`create function public.probe_fn() returns void language plpgsql as $$ begin grant select on public.cost_events to anon; end $$;`).blocking)
      .toEqual(['FUNCTION_BODY_SECURITY_DDL'])
  })

  it('a recognised security verb in a form the parser cannot read fails closed', () => {
    expect(probe('create policy probe_bad on public.leads frobnicate;').blocking).toEqual(['UNPARSED_SECURITY_STATEMENT'])
  })

  it('ALTER DEFAULT PRIVILEGES granting client roles FAILS; for service_role it does not', () => {
    expect(probe('alter default privileges in schema public grant select on tables to anon;').blocking).toEqual(['DEFAULT_PRIVILEGES_CLIENT_GRANT'])
    expect(probe('alter default privileges in schema atlas grant select on tables to service_role;').blocking).toEqual([])
  })

  it('granting a client role membership in another role FAILS', () => {
    expect(probe('grant service_role to authenticated;').blocking).toEqual(['CLIENT_ROLE_MEMBERSHIP'])
  })
})

// ─── 9. Policy expressions ──────────────────────────────────────────────────

describe('Phase 9AA — every OR branch must be bounded by the caller', () => {
  const v = (sql: string) => analyzeExprText(sql).verdict
  it.each([
    ['1  <col> IS NULL OR owner', `project_id is null or ${OWNER}`],
    ['2  owner OR <col> IS NULL', `${OWNER} or project_id is null`],
    ['3  same branch inside a subquery', 'decision_id in (select id from agent_decisions where project_id is null or project_id in (select id from projects where owner_id = auth.uid()))'],
    ['4  true', 'true'],
    ['5  (true)', '(true)'],
    ['6  1=1', '1=1'],
    ['7  TRUE OR …', `true or ${OWNER}`],
    ['8  … OR TRUE', `${OWNER} or true`],
    ['9  quoted true', "'t'::boolean"],
    ['9  coalesce(…, true)', 'coalesce(owner_id = auth.uid(), true)'],
    ['9  CASE … ELSE true', 'case when auth.uid() is null then true else owner_id = auth.uid() end'],
    ['9  scope = world OR …', `scope = 'world' or (scope = 'project' and ${OWNER})`],
    ['   auth.uid() IS NOT NULL — any signed-in user', 'auth.uid() is not null'],
    ['   auth.role() = authenticated — a population', "auth.role() = 'authenticated'"],
    ['   NOT IN the owner set — everyone else', 'project_id not in (select id from projects where owner_id = auth.uid())'],
    ['   unbounded subquery', 'project_id in (select id from projects)'],
    ['   auth.uid() mentioned but only in the other branch', `status = 'published' or owner_id = auth.uid()`],
  ])('%s → CALLER_INDEPENDENT', (_name, sql) => {
    expect(v(sql)).toBe('CALLER_INDEPENDENT')
  })

  it.each([
    ['owner_id = auth.uid()', 'owner_id = auth.uid()'],
    ['auth.uid() = owner_id', 'auth.uid() = owner_id'],
    ['(select auth.uid())', 'user_id = (select auth.uid())'],
    ['owner subquery', OWNER],
    ['Postgres-normalised owner subquery', '(project_id IN ( SELECT projects.id FROM projects WHERE (projects.owner_id = auth.uid())))'],
    ['join ON bound', 'asset_id in (select a.id from assets a join projects p on p.id = a.project_id where p.owner_id = auth.uid())'],
    ['AND with a bounded conjunct', `project_id is null and owner_id = auth.uid()`],
    ['jwt email claim', "email = auth.jwt() ->> 'email'"],
    ['BETWEEN … AND inside a bounded AND', `created_at between now() - interval '1 day' and now() and owner_id = auth.uid()`],
  ])('%s → BOUNDED', (_name, sql) => {
    expect(v(sql)).toBe('BOUNDED')
  })

  it('false, and a missing expression, admit nothing', () => {
    expect(v('false')).toBe('DENY')
    expect(v('(false)')).toBe('DENY')
    expect(analyzeExprText('').verdict).toBe('DENY')
  })

  it('a jwt ROLE claim is a population, not an identity', () => {
    expect(v("(auth.jwt() ->> 'role') = 'authenticated'")).toBe('CALLER_INDEPENDENT')
  })

  it('the caller-independent branch is named in the finding, so a reviewer sees WHY', () => {
    expect(analyzeExprText(`project_id is null or ${OWNER}`).branches).toEqual(['project_id is null'])
  })
})

// ─── 10. Rule catalogue ─────────────────────────────────────────────────────

describe('Phase 9AA — the rule catalogue keeps its five categories honest', () => {
  it('every weakening and unknown rule blocks; nothing else does', () => {
    for (const [rule, cat] of Object.entries(RULES)) {
      expect(isBlocking(rule as RuleId), rule).toBe(cat === 'WEAKENING' || cat === 'UNKNOWN')
    }
  })
  it('all five categories are in use', () => {
    expect(new Set(Object.values(RULES))).toEqual(new Set(['WEAKENING', 'UNKNOWN', 'HARDENING', 'LOCKOUT', 'CONTEXTUAL']))
  })
  it('findings carry the fields a reviewer needs', () => {
    const f: Finding = FULL.findings.find(x => x.rule === 'VIEW_RLS_BYPASS')!
    expect(f.migration).toMatch(/20260528_agent_decisions\.sql$/)
    expect(f.fingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(f.detail).toMatch(/public\.agents/)
  })
})
