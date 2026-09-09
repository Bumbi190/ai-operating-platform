/**
 * lib/qa/schema-security-invariant.test.ts — the schema layer, as an invariant.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Every phase from 9J to 9X.2 audited ROUTE code, and every one of them was
 * clean. The exposure that blocked closure was a table: `workflow_stories` was
 * created with content-addressed identity, append-only triggers and no row
 * level security, and Supabase's default grants to `anon` and `authenticated`
 * — inert on every other table because RLS gates them — were live on that one.
 * It answered the public anon key with HTTP 200 where its own four siblings
 * answered 401. No route audit could ever have seen it, because no route reads
 * the table.
 *
 * ── WHY NOT "NO ANON GRANTS ANYWHERE" ──────────────────────────────────────
 * That rule would fail on 54 of 70 tables and be deleted within a week. Supabase
 * grants the public schema to anon and authenticated by default; the grants are
 * harmless precisely because RLS denies the rows. The dangerous combination is
 * grants AND no RLS, which is why the rule below is about EFFECTIVE reachability
 * rather than about grants in isolation.
 *
 * ── THE TWO HALVES, AND WHY BOTH ───────────────────────────────────────────
 * 1. EFFECTIVE STATE. `tests/isolation/schema-security.json` is introspected
 *    from the live catalog. Every table carries a class, and the rules below say
 *    what each class may be. A table absent from the file fails — new tables are
 *    fail-closed, not silently trusted.
 * 2. MIGRATION TEXT, forward-looking. Any migration that CREATES a public table
 *    must also enable RLS on it somewhere in the corpus. This is the half that
 *    would have caught workflow_stories on the day it was written.
 *
 * Neither half alone is sufficient, and the file says so: (1) is point-in-time
 * and cannot see a dashboard change made after capture; (2) cannot see anything
 * done outside a migration. They are recorded as limitations rather than
 * papered over, and the local-Postgres proof in
 * `lib/qa/schema-rls-closure-sql.test.ts` is the third leg.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

interface Entry {
  class: 'SERVER_ONLY' | 'TENANT_RLS' | 'INTERNAL_DENY_ALL' | 'INTENTIONALLY_PUBLIC'
  rls: boolean
  policies: number
  anon_grants: boolean
  authenticated_grants: boolean
  service_role: boolean
}

const REGISTRY = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/isolation/schema-security.json'), 'utf8'),
) as { _meta: Record<string, unknown>; tables: Record<string, Entry> }

const TABLES = Object.entries(REGISTRY.tables)

/** Both migration roots. The repo has two, and the gap lived under the second. */
const MIGRATION_DIRS = [
  resolve(process.cwd(), 'supabase/migrations'),
  resolve(process.cwd(), '../../supabase/migrations'),
]

function migrationSources(): { file: string; sql: string }[] {
  const out: { file: string; sql: string }[] = []
  for (const dir of MIGRATION_DIRS) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter(n => n.endsWith('.sql'))) {
      out.push({ file: join(dir, f), sql: readFileSync(join(dir, f), 'utf8') })
    }
  }
  return out
}

const SOURCES = migrationSources()
const ALL_SQL = SOURCES.map(s => s.sql).join('\n').toLowerCase()

/** Public tables the migration corpus creates. */
function createdTables(): Set<string> {
  const created = new Set<string>()
  for (const { sql } of SOURCES) {
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)/gi)) {
      created.add(m[1].toLowerCase())
    }
  }
  return created
}

/** Does the corpus turn RLS on for this table anywhere? */
function rlsDeclaredInMigrations(t: string): boolean {
  return new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?public\\.${t}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(ALL_SQL)
    || new RegExp(`alter\\s+table\\s+${t}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(ALL_SQL)
}

describe('Phase 9Y — schema-security invariant: effective state', () => {
  it('the registry is populated and covers the whole public schema', () => {
    expect(TABLES.length, 'registry is empty — the invariant would be vacuous').toBeGreaterThan(50)
    expect(REGISTRY._meta.total_tables).toBe(TABLES.length)
  })

  it('NO public table has RLS disabled unless explicitly reviewed as INTENTIONALLY_PUBLIC', () => {
    const offenders = TABLES
      .filter(([, e]) => !e.rls && e.class !== 'INTENTIONALLY_PUBLIC')
      .map(([t, e]) => `${t} (class ${e.class})`)
    expect(offenders, 'a public table has RLS disabled — this is the workflow_stories class').toEqual([])
  })

  it('a SERVER_ONLY table grants nothing to anon', () => {
    const offenders = TABLES
      .filter(([, e]) => e.class === 'SERVER_ONLY' && e.anon_grants)
      .map(([t]) => t)
    expect(offenders, 'server-only table is reachable by the public anon key').toEqual([])
  })

  it('a SERVER_ONLY table grants nothing to authenticated either', () => {
    const offenders = TABLES
      .filter(([, e]) => e.class === 'SERVER_ONLY' && e.authenticated_grants)
      .map(([t]) => t)
    expect(offenders, 'server-only table is reachable by any signed-in user').toEqual([])
  })

  it('every SERVER_ONLY table still reaches its own writer', () => {
    const broken = TABLES.filter(([, e]) => e.class === 'SERVER_ONLY' && !e.service_role).map(([t]) => t)
    expect(broken, 'locking a table down must not cut off the service-role writer').toEqual([])
  })

  it('an INTENTIONALLY_PUBLIC table may never hold DML — read only, and only by review', () => {
    const offenders = TABLES
      .filter(([, e]) => e.class === 'INTENTIONALLY_PUBLIC' && (e.anon_grants || e.authenticated_grants))
      .map(([t]) => t)
    expect(offenders, 'a deliberately public table has gained write access').toEqual([])
  })

  it('a TENANT_RLS table has RLS on AND at least one policy — grants are inert only then', () => {
    const offenders = TABLES
      .filter(([, e]) => e.class === 'TENANT_RLS' && (!e.rls || e.policies < 1))
      .map(([t, e]) => `${t} (rls=${e.rls}, policies=${e.policies})`)
    expect(offenders, 'a tenant table relies on a policy it does not have').toEqual([])
  })

  it('an INTERNAL_DENY_ALL table has RLS on and no policy — default-deny is the whole boundary', () => {
    const offenders = TABLES
      .filter(([, e]) => e.class === 'INTERNAL_DENY_ALL' && (!e.rls || e.policies !== 0))
      .map(([t, e]) => `${t} (rls=${e.rls}, policies=${e.policies})`)
    expect(offenders, 'deny-all table is not actually deny-all').toEqual([])
  })

  it('the class of every entry is one the registry declares', () => {
    const declared = Object.keys((REGISTRY._meta.classes ?? {}) as Record<string, unknown>)
    const unknown = TABLES.filter(([, e]) => !declared.includes(e.class)).map(([t, e]) => `${t}:${e.class}`)
    expect(unknown, 'an entry carries a class nobody defined').toEqual([])
  })

  it('workflow_stories specifically is locked — the table this phase exists for', () => {
    const ws = REGISTRY.tables['workflow_stories']
    expect(ws, 'workflow_stories vanished from the registry').toBeDefined()
    expect(ws.class).toBe('SERVER_ONLY')
    expect(ws.rls).toBe(true)
    expect(ws.anon_grants).toBe(false)
    expect(ws.authenticated_grants).toBe(false)
    expect(ws.service_role).toBe(true)
  })
})

describe('Phase 9Y — schema-security invariant: migration text, forward-looking', () => {
  it('finds migrations in BOTH roots — the gap lived under the second one', () => {
    expect(SOURCES.length, 'no migrations found; the rule below would be vacuous').toBeGreaterThan(50)
    const roots = new Set(SOURCES.map(s => (s.file.includes('/apps/web/') ? 'apps/web' : 'repo-root')))
    expect([...roots].sort()).toEqual(['apps/web', 'repo-root'])
  })

  it('every public table CREATED by a migration is present in the registry — new tables fail closed', () => {
    const created = createdTables()
    expect(created.size, 'no CREATE TABLE found — the rule would be vacuous').toBeGreaterThan(5)
    const unregistered = [...created].filter(t => !(t in REGISTRY.tables)).sort()
    expect(unregistered, 'a migration creates a public table that no one classified').toEqual([])
  })

  it('every public table CREATED by a migration has RLS declared there, or a reviewed out-of-band entry', () => {
    const created = createdTables()
    const outOfBand = new Set(
      ((REGISTRY._meta.out_of_band_rls as { tables?: string[] } | undefined)?.tables ?? []),
    )
    const missing = [...created]
      .filter(t => !rlsDeclaredInMigrations(t) && !outOfBand.has(t))
      .sort()
    // workflow_stories was exactly this: created by a migration, RLS declared nowhere,
    // and nobody had written down that it was unprotected.
    expect(missing, 'a migration creates a public table, declares no RLS, and nobody reviewed it').toEqual([])
  })

  it('an out-of-band entry must still be RLS-enabled in the effective state — the escape hatch is not a bypass', () => {
    const outOfBand = ((REGISTRY._meta.out_of_band_rls as { tables?: string[] } | undefined)?.tables ?? [])
    for (const t of outOfBand) {
      expect(REGISTRY.tables[t], `${t} is excused but not classified`).toBeDefined()
      expect(REGISTRY.tables[t].rls, `${t} is excused from declaring RLS but does not have it`).toBe(true)
    }
  })

  it('the Phase 9Y migration exists and does all three halves of the lockdown', () => {
    const f = resolve(process.cwd(), 'supabase/migrations/20260909120000_workflow_stories_rls.sql')
    expect(existsSync(f), 'the Phase 9Y migration is missing').toBe(true)
    const sql = readFileSync(f, 'utf8').toLowerCase()
    expect(sql).toMatch(/alter\s+table\s+public\.workflow_stories\s+enable\s+row\s+level\s+security/)
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.workflow_stories\s+from\s+anon,\s*authenticated/)
    expect(sql).toMatch(/grant\s+all\s+on\s+public\.workflow_stories\s+to\s+service_role/)
  })

  it('the Phase 9Y migration destroys nothing', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260909120000_workflow_stories_rls.sql'), 'utf8',
    ).toLowerCase()
    for (const forbidden of ['drop table', 'truncate', 'delete from', 'drop column']) {
      expect(sql.includes(forbidden), `migration contains ${forbidden}`).toBe(false)
    }
  })

  it('does not add a permissive policy — server-only means no policy, not a fake owner policy', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260909120000_workflow_stories_rls.sql'), 'utf8',
    ).toLowerCase()
    expect(sql.includes('create policy'), 'an invented policy would describe a surface that does not exist').toBe(false)
  })
})

describe('Phase 9Y — the invariant states its own limits', () => {
  it('the registry records that it is a point-in-time capture', () => {
    const lim = (REGISTRY._meta.limitations ?? []) as string[]
    expect(lim.length).toBeGreaterThanOrEqual(3)
    expect(lim.join(' ')).toMatch(/point-in-time/i)
    expect(lim.join(' ')).toMatch(/dashboard/i)
  })

  it('the registry names where it was captured from, so a stale file is visible', () => {
    expect(String(REGISTRY._meta.captured_from)).toMatch(/iboepohjwrhtgshrqaol/)
    expect(String(REGISTRY._meta.captured_at)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

/**
 * The manifest correction this phase carries. Same construction as
 * `breaking-dual-authority-isolation.test.ts` and
 * `executive-authority-entrypoint.test.ts`, which each pin the manifest row
 * their phase corrected — a metadata fix nobody asserts is a metadata fix that
 * silently regresses.
 */
describe('Phase 9Y — /memory/patterns manifest truthfulness', () => {
  const MANIFEST = JSON.parse(
    readFileSync(resolve(process.cwd(), 'tests/isolation/route-manifest.json'), 'utf8'),
  ) as { _meta: { legend: Record<string, unknown> }; routes: Record<string, unknown>[] }

  it('the legend still defines serviceRole as ANY createAdminClient use', () => {
    // The correction below is only true under this definition. If someone
    // narrows the legend to "direct use in the route file", the entry would
    // need revisiting rather than silently becoming wrong again.
    expect(String(MANIFEST._meta.legend.serviceRole)).toMatch(/createAdminClient/i)
    expect(String(MANIFEST._meta.legend.serviceRole)).not.toMatch(/route file|directly/i)
  })

  it('/memory/patterns declares the service-role reach it actually has', () => {
    const row = MANIFEST.routes.find(r => r.path === '/memory/patterns') as
      { serviceRole?: boolean; auth?: string; scope?: string; note?: string } | undefined
    expect(row, '/memory/patterns vanished from the manifest').toBeDefined()
    expect(row!.serviceRole, 'the reach is helper-mediated, but it is still service-role').toBe(true)
    expect(row!.auth).toBe('User')
    expect(row!.scope).toBe('project_id')
    expect(String(row!.note)).toMatch(/getMemory/)
  })
})
