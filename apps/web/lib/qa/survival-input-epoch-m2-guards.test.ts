/**
 * Phase 3B1B2 · M2 — permanent guards.
 *
 * The real-PostgreSQL suite (`survival-input-epoch-m2-sql.test.ts`) proves the
 * epoch works. These guards keep the CURRENT SOURCE SET visible and reviewable,
 * and make a future edit fail until its epoch coverage is reviewed:
 *
 *   - exactly 8 shards, ids 0..7, one documented shard formula;
 *   - every Survival authority source carries its deferred bump, and nothing
 *     else does; TRUNCATE is revoked and refused on every source, and no
 *     immediate (mid-transaction) bump exists anywhere;
 *   - the epoch contract is stated as AT-LEAST-ONCE change identity, never as a
 *     bounded count;
 *   - the Survival read surface (TypeScript reads and imports, the reviewed
 *     public-function CALL GRAPH below the RPCs it calls, the tables that graph
 *     reads, the SurvivalInput shape) equals the reviewed set — a new input,
 *     direct or hidden behind a helper function, fails here first;
 *   - the stable-observation helper is inert: no route, workflow or bind
 *     consumer imports it;
 *   - presentation fields (operatingPaused, slug) are not silently promoted;
 *   - no role gains direct epoch mutation; vector order is ascending;
 *   - the fence simulator locks in ascending order;
 *   - licensed binds still fail closed and nothing at runtime reads M2;
 *   - no M3/M4 primitive arrives with M2.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => { throw new Error('bind admission must not touch the database') },
}))

import { admitAutonomyAtBind } from '@/lib/atlas/autonomy-runtime/bind'
import { AUTONOMY_RUNTIME_POLICY } from '@/lib/atlas/autonomy-runtime/policy'

const APP = process.cwd()
const MIGRATIONS = join(APP, 'supabase/migrations')
const M2_FILE = '20261002190000_survival_input_epoch.sql'
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const sqlCode = (s: string) => s.replace(/--[^\n]*/g, '')
const tsCode = (s: string) => s.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')
const m2 = read(join(MIGRATIONS, M2_FILE))
const m2Code = sqlCode(m2)
const MIGRATION_FILES = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()

// ── THE REVIEWED SOURCE SET (Section 0, d7de380) ────────────────────────────
// Changing any of these lists is a review event: the SQL suite must prove the
// new coverage before the list may change.

/** Every table whose committed mutation can change the Survival ceiling. */
const AUTHORITY_SOURCES = [
  'cost_events', 'platform_config', 'project_budgets', 'projects',
  'revenue_snapshots', 'spend_reservations', 'survival_funding_config',
] as const
/** Sources where only some columns are authority: the WHEN-filtered UPDATE trigger. */
const COLUMN_SENSITIVE: Record<string, { trigger: string; columns: string[] }> = {
  platform_config: { trigger: 'survival_input_epoch_bump_limits', columns: ['id', 'global_daily_sek', 'global_weekly_sek', 'global_monthly_sek'] },
  projects: { trigger: 'survival_input_epoch_bump_population', columns: ['id'] },
}
/** What readSurvivalSnapshot() and its funding helpers read, by name. */
const SNAPSHOT_TABLE_READS = ['cost_events', 'platform_config', 'revenue_snapshots', 'spend_reservations', 'survival_funding_config']
const SNAPSHOT_RPC_READS = ['budget_headroom', 'survival_scope_is_platform_complete']
/** Tables the effective SQL definitions of those RPCs (and budget_scope_state) read. */
const RPC_TABLE_DEPENDENCIES: Record<string, string[]> = {
  budget_headroom: ['projects'],
  budget_scope_state: ['cost_events', 'platform_config', 'project_budgets', 'spend_reservations'],
  survival_scope_is_platform_complete: ['projects'],
}
/** The SurvivalInput shape. `operatingPaused` is PRESENTATION: copied, never branched on. */
const SURVIVAL_INPUT_FIELDS = ['scopes', 'reads', 'burnSekPerDay', 'runwayCoverage', 'funding', 'revenueTrendSek', 'operatingPaused']

/** The LAST migration (apply order) that defines `public.<fn>(` — its header and body. */
function effectiveFunction(fn: string): { header: string; body: string; file: string } | null {
  let found: { header: string; body: string; file: string } | null = null
  for (const f of MIGRATION_FILES) {
    const code = sqlCode(read(join(MIGRATIONS, f)))
    const re = new RegExp(`create or replace function public\\.${fn}\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, 'gi')
    for (const m of code.matchAll(re)) found = { header: m[1], body: m[2], file: f }
  }
  return found
}
const effectiveDefinition = (fn: string) => effectiveFunction(fn)?.body ?? ''
// Identifiers may contain digits (an `m2_helper` must not slip past) and SQL is
// case-insensitive. A quoted identifier (`public."X"`) is refused by the graph test.
const tablesIn = (sql: string) =>
  [...new Set([...sql.matchAll(/\bpublic\s*\.\s*([a-z0-9_]+)\b(?!\s*\()/gi)].map(m => m[1].toLowerCase()))].sort()
const callsIn = (sql: string) =>
  [...new Set([...sql.matchAll(/\bpublic\s*\.\s*([a-z0-9_]+)\s*\(/gi)].map(m => m[1].toLowerCase()))].sort()

/**
 * THE REVIEWED PUBLIC-FUNCTION CALL GRAPH below the Survival observation.
 * Roots are the RPCs the TypeScript read path calls; edges are every
 * `public.<fn>(` call in each function's EFFECTIVE (last-applied) body. A new
 * helper anywhere in this graph changes it, and so does a new table read by any
 * function in it — both fail until reviewed and given epoch coverage.
 */
const SURVIVAL_SQL_CALL_GRAPH: Record<string, string[]> = {
  budget_headroom: ['budget_scope_state'],
  budget_scope_state: [],
  survival_scope_is_platform_complete: [],
  survival_input_epoch_vector: [],
}
const SURVIVAL_SQL_ROOTS = ['budget_headroom', 'survival_input_epoch_vector', 'survival_scope_is_platform_complete']

// ── Shards ───────────────────────────────────────────────────────────────────

describe('M2 shards: exactly 8, ids 0..7, one formula', () => {
  it('shard ids are constrained to 0..7 and seeded 0..7 at epoch 0', () => {
    expect(m2Code).toMatch(/shard_id smallint primary key check \(shard_id between 0 and 7\)/)
    expect(m2Code).toMatch(/select g::smallint, 0 from generate_series\(0, 7\) g;/)
    expect(m2Code).toMatch(/epoch\s+bigint\s+not null check \(epoch >= 0\)/)
  })

  it('the table has exactly two columns — change identity, nothing else', () => {
    const table = /create table public\.survival_input_epoch_shards \(([\s\S]*?)\n\);/.exec(m2Code)?.[1] ?? ''
    expect(table.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split(/\s+/)[0])).toEqual(['shard_id', 'epoch'])
    expect(table).not.toMatch(/timestamp|state|ceiling|policy|project|source|label/i)
  })

  it('the shard formula is txid_current() % 8, in one place, and no other modulus appears', () => {
    const bump = effectiveDefinition('survival_input_epoch_bump')
    expect(bump).toMatch(/v_xid\s+bigint\s+:= pg_catalog\.txid_current\(\);/)
    expect(bump).toMatch(/v_shard smallint := \(v_xid % 8\)::smallint;/)
    // 8 is the shard count; 2^32 only maps the 64-bit txid onto the 32-bit xmin for the once-per-transaction skip.
    const moduli = [...bump.matchAll(/%\s*(\d+)/g)].map(m => m[1])
    expect(moduli.sort()).toEqual(['4294967296', '8'])
  })

  it('the vector reader is ascending by shard_id and demands exactly 0..7', () => {
    const body = effectiveDefinition('survival_input_epoch_vector')
    expect(body).toMatch(/array_agg\(s\.shard_id order by s\.shard_id\)/)
    expect(body).toMatch(/array_agg\(s\.epoch\s+order by s\.shard_id\)/)
    expect(body).toMatch(/array\[0, 1, 2, 3, 4, 5, 6, 7\]::smallint\[\]/)
    expect(body).not.toMatch(/\bdesc\b/i)
  })
})

// ── Coverage ─────────────────────────────────────────────────────────────────

describe('M2 coverage: every Survival authority source, and nothing else', () => {
  const triggers = [...m2Code.matchAll(
    /create (constraint )?trigger (\w+)\s+after ([\w\s]+?) on public\.(\w+)([\s\S]*?)execute function public\.(\w+)\(\);/g)]
    .map(m => ({ constraint: !!m[1], name: m[2], events: m[3].trim(), table: m[4], rest: m[5], fn: m[6] }))
  const bumpers = triggers.filter(t => t.fn === 'survival_input_epoch_bump')

  it('the set of tables carrying a bump trigger IS the reviewed authority set', () => {
    expect([...new Set(bumpers.map(t => t.table))].sort()).toEqual([...AUTHORITY_SOURCES])
  })

  it.each(AUTHORITY_SOURCES)('%s: INSERT, UPDATE and DELETE bump (deferred row constraint trigger); TRUNCATE is refused', (table) => {
    const mine = bumpers.filter(t => t.table === table)
    const deferred = mine.filter(t => t.constraint)
    for (const t of deferred) {
      expect(t.rest, t.name).toMatch(/deferrable initially deferred for each row/)
    }
    const events = deferred.flatMap(t => t.events.split(/\s+or\s+/))
    expect(events).toContain('insert')
    expect(events).toContain('delete')
    expect(events).toContain('update')
    // No immediate bump of any kind: every bump trigger is a deferred constraint trigger.
    expect(mine.filter(t => !t.constraint)).toEqual([])
    expect(m2Code).toContain(`create trigger survival_input_truncate_refused before truncate on public.${table}\n  for each statement execute function public.survival_input_truncate_refused();`)
  })

  it('TRUNCATE is revoked from PUBLIC, anon, authenticated and service_role on all seven sources', () => {
    const revoke = /revoke truncate on table ([\s\S]*?)\n\s*from public, anon, authenticated, service_role;/.exec(m2Code)?.[1] ?? ''
    expect(revoke.split(',').map(x => x.trim().replace(/^public\./, '')).sort()).toEqual([...AUTHORITY_SOURCES])
    for (const f of MIGRATION_FILES.filter(f => f > M2_FILE)) {
      expect(sqlCode(read(join(MIGRATIONS, f))), f).not.toMatch(/grant [^;]*truncate/i)
    }
  })

  it('no trigger anywhere in M2 bumps the epoch immediately (no AFTER … FOR EACH STATEMENT bump)', () => {
    expect(m2Code).not.toMatch(/after truncate/)
    expect(triggers.filter(t => t.fn === 'survival_input_epoch_bump' && !t.constraint)).toEqual([])
  })

  it('the epoch contract is AT-LEAST-ONCE change identity — no bounded-count promise survives in the migration', () => {
    expect(m2).toMatch(/AT LEAST ONCE/)
    expect(m2).toMatch(/CHANGE IDENTITY, not a count/)
    expect(m2).not.toMatch(/worst case is one extra|at most \+?2|\+2 max/i)
  })

  it('UPDATE bumps unconditionally everywhere except the reviewed column-sensitive sources', () => {
    for (const t of bumpers.filter(b => b.constraint && b.events.includes('update'))) {
      const sensitive = COLUMN_SENSITIVE[t.table]
      if (!sensitive) {
        expect(t.rest, `${t.table} must bump on every UPDATE`).not.toMatch(/\bwhen\b/)
        continue
      }
      expect(t.name).toBe(sensitive.trigger)
      const when = /when \(\(?([\s\S]*?)\)?\s+is distinct from/.exec(t.rest)?.[1] ?? ''
      const cols = [...when.matchAll(/old\.(\w+)/g)].map(m => m[1])
      expect(cols, `${t.table}: authority columns`).toEqual(sensitive.columns)
    }
  })

  it('no presentation column is promoted: pause/updated_at/name/slug never appear in a WHEN clause', () => {
    for (const t of bumpers) {
      expect(t.rest, t.name).not.toMatch(/automation_paused|paused_at|paused_reason|updated_at|slug|name\b|color|settings|atlas_mode|execution_paused/)
    }
  })

  it('audit ledgers are NOT sources: survival_state_events and survival_funding_events carry no bump', () => {
    expect(m2Code).not.toMatch(/on public\.survival_(state|funding)_events/)
  })
})

// ── The Survival read surface must not drift without review ─────────────────

describe('M2 source set is pinned to the CURRENT Survival read surface', () => {
  const surface = ['lib/atlas/survival/snapshot.ts', 'lib/atlas/survival/funding.ts']
    .map(f => tsCode(read(join(APP, f)))).join('\n')

  it('readSurvivalSnapshot() reads exactly the reviewed tables and RPCs', () => {
    const froms = [...new Set([...surface.matchAll(/\.from\(\s*(?:'(\w+)'|(SURVIVAL_FUNDING_CONFIG_TABLE))\s*\)/g)]
      .map(m => m[1] ?? 'survival_funding_config'))].sort()
    expect(froms).toEqual(SNAPSHOT_TABLE_READS)
    const rpcs = [...new Set([...surface.matchAll(/\.rpc\(\s*'(\w+)'/g)].map(m => m[1]))].sort()
    expect(rpcs).toEqual(SNAPSHOT_RPC_READS)
    expect(surface).toMatch(/const SURVIVAL_FUNDING_CONFIG_TABLE = 'survival_funding_config'/)
  })

  it('platform_config is read ONLY for automation_paused (presentation) — its limits arrive via budget_scope_state', () => {
    const selects = [...surface.matchAll(/\.from\('platform_config'\)\s*\.select\('([^']*)'\)/g)].map(m => m[1])
    expect(selects).toEqual(['automation_paused'])
  })

  it.each(Object.entries(RPC_TABLE_DEPENDENCIES))('the effective %s reads exactly the reviewed tables', (fn, tables) => {
    expect(tablesIn(effectiveDefinition(fn))).toEqual(tables)
  })

  it('the TypeScript read path calls exactly the reviewed SQL roots (snapshot, funding, stable observation)', () => {
    const all = ['lib/atlas/survival/snapshot.ts', 'lib/atlas/survival/funding.ts', 'lib/atlas/survival/stable-observation.ts']
      .map(f => tsCode(read(join(APP, f)))).join('\n')
    expect([...new Set([...all.matchAll(/\.rpc\(\s*'(\w+)'/g)].map(m => m[1]))].sort()).toEqual(SURVIVAL_SQL_ROOTS)
  })

  it('the public-function CALL GRAPH below those roots is exactly the reviewed graph (no hidden helper)', () => {
    const seen: Record<string, string[]> = {}
    const queue = [...SURVIVAL_SQL_ROOTS]
    while (queue.length) {
      const fn = queue.shift()!
      if (fn in seen) continue
      const def = effectiveFunction(fn)
      expect(def, `public.${fn} has a definition in the corpus`).not.toBeNull()
      seen[fn] = callsIn(def!.body)
      queue.push(...seen[fn])
    }
    expect(seen).toEqual(SURVIVAL_SQL_CALL_GRAPH)
  })

  it('every function in the graph is search_path-pinned and runs no dynamic SQL (nothing can resolve around the graph)', () => {
    for (const fn of Object.keys(SURVIVAL_SQL_CALL_GRAPH)) {
      const def = effectiveFunction(fn)!
      expect(def.header, fn).toMatch(/set search_path (to|=) ''/)
      expect(def.body, fn).not.toMatch(/\bexecute\b|\bformat\s*\(/i)
      expect(def.body, fn).not.toMatch(/public\s*\.\s*"/i)
    }
  })

  it('the tables read by the WHOLE graph are exactly the reviewed authority tables', () => {
    const tables = new Set(Object.keys(SURVIVAL_SQL_CALL_GRAPH).flatMap(fn => tablesIn(effectiveDefinition(fn))))
    tables.delete('survival_input_epoch_shards') // the epoch itself, read only by the vector
    expect([...tables].sort()).toEqual(['cost_events', 'platform_config', 'project_budgets', 'projects', 'spend_reservations'])
  })

  it('the Survival modules import exactly the reviewed modules (no new data reader behind an import)', () => {
    const imports = (f: string) =>
      [...new Set([...read(join(APP, f)).matchAll(/^import\b[^']*?'([^']+)'/gm)].map(m => m[1]))].sort()
    expect(imports('lib/atlas/survival/snapshot.ts')).toEqual(
      ['./ceiling', './derive', './funding', './types', '@/lib/cost/budget-gate', '@/lib/supabase/admin', 'server-only'])
    expect(imports('lib/atlas/survival/funding.ts')).toEqual(['./types', '@/lib/supabase/admin', 'server-only'])
    expect(imports('lib/atlas/survival/stable-observation.ts')).toEqual(['./snapshot', './types', '@/lib/supabase/admin', 'server-only'])
    for (const pure of ['lib/atlas/survival/derive.ts', 'lib/atlas/survival/ceiling.ts']) {
      const code = tsCode(read(join(APP, pure)))
      expect(code, pure).not.toMatch(/supabase|\.rpc\(|\.from\(/)
    }
  })

  it('every table the read surface reaches is either an authority source or reviewed presentation', () => {
    const reached = new Set([...SNAPSHOT_TABLE_READS, ...Object.values(RPC_TABLE_DEPENDENCIES).flat()])
    expect([...reached].sort()).toEqual([...AUTHORITY_SOURCES])
  })

  it('SurvivalInput has exactly the reviewed fields', () => {
    const types = tsCode(read(join(APP, 'lib/atlas/survival/types.ts')))
    const body = /export interface SurvivalInput \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? ''
    expect([...body.matchAll(/^\s+(\w+)\??:/gm)].map(m => m[1])).toEqual(SURVIVAL_INPUT_FIELDS)
  })

  it('derive.ts never branches on operatingPaused and never reads a project slug', () => {
    const derive = tsCode(read(join(APP, 'lib/atlas/survival/derive.ts')))
    expect([...derive.matchAll(/operatingPaused/g)]).toHaveLength(2) // the copy: `operatingPaused: input.operatingPaused`
    expect(derive).toMatch(/operatingPaused: input\.operatingPaused,/)
    expect(derive).not.toMatch(/\.slug\b/)
  })
})

// ── Privileges ───────────────────────────────────────────────────────────────

describe('M2 privileges', () => {
  it('the exact grant set: SELECT and vector EXECUTE to service_role; nothing else to anyone', () => {
    const grants = [...m2Code.matchAll(/^grant [^;]+;/gm)].map(m => m[0])
    expect(grants).toEqual([
      'grant select on table public.survival_input_epoch_shards to service_role;',
      'grant execute on function public.survival_input_epoch_vector() to service_role;',
    ])
    expect(m2Code).toMatch(/revoke all on table public\.survival_input_epoch_shards from public, anon, authenticated, service_role;/)
    expect(m2Code).toMatch(/revoke all on function public\.survival_input_epoch_bump\(\) from public, anon, authenticated, service_role;/)
    expect(m2Code).toMatch(/revoke all on function public\.survival_input_epoch_shards_guard\(\) from public, anon, authenticated, service_role;/)
    expect(m2Code).toMatch(/revoke all on function public\.survival_input_truncate_refused\(\) from public, anon, authenticated, service_role;/)
    expect(m2Code).toMatch(/alter table public\.survival_input_epoch_shards enable row level security;/)
    expect(m2Code).not.toMatch(/create policy/)
  })

  it('no later migration grants anything on the epoch table or its machinery', () => {
    for (const f of MIGRATION_FILES.filter(f => f > M2_FILE)) {
      expect(sqlCode(read(join(MIGRATIONS, f))), f).not.toMatch(/grant [^;]*survival_input_epoch/i)
    }
  })

  it('every M2 function is SECURITY DEFINER with an empty search_path', () => {
    const fns = [...m2Code.matchAll(/create or replace function public\.(\w+)\(\)\s*returns [^\n]*\n?[^$]*?security definer set search_path = ''/g)].map(m => m[1])
    expect(fns.sort()).toEqual(['survival_input_epoch_bump', 'survival_input_epoch_shards_guard', 'survival_input_epoch_vector',
      'survival_input_truncate_refused'])
  })
})

// ── Simulator order ──────────────────────────────────────────────────────────

describe('M2 fence SIMULATOR (test-only) locks ascending', () => {
  it('FENCE_LOCK_SQL orders by shard_id ascending before FOR SHARE, and lives only in the test', () => {
    const sqlSuite = read(join(APP, 'lib/qa/survival-input-epoch-m2-sql.test.ts'))
    const fence = /const FENCE_LOCK_SQL =\s*([\s\S]*?)\n\s*function fence/.exec(sqlSuite)?.[1] ?? ''
    expect(fence).toMatch(/order by shard_id for share/)
    expect(fence).not.toMatch(/\bdesc\b/i)
    expect(m2Code).not.toMatch(/for share/)
  })
})

// ── Licensed binds stay OFF; nothing at runtime reads M2 ────────────────────

describe('M2 did NOT widen runtime authority', () => {
  const licensed = Object.entries(AUTONOMY_RUNTIME_POLICY).filter(([, p]) => p.mode === 'licensed').map(([k]) => k)

  it('there are licensed kinds to test (the guard is not vacuous)', () => {
    expect(licensed.length).toBeGreaterThan(0)
  })

  it.each(licensed)('licensed kind %s is still refused with licensed_bind_not_serializable', async (kind) => {
    const r = await admitAutonomyAtBind(kind, '99999999-9999-4999-8999-999999999999')
    expect(r).toMatchObject({ admitted: false, reason: 'licensed_bind_not_serializable' })
  })

  it('no runtime code (outside lib/qa) references the epoch — except the inert stable-observation helper', () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e)
        if (statSync(p).isDirectory()) {
          if (!['node_modules', '.next', 'qa'].includes(e)) walk(p)
        } else if (/\.(ts|tsx|mjs|js)$/.test(e) && /survival_input_epoch/.test(read(p))) hits.push(p)
      }
    }
    for (const root of ['lib', 'app']) walk(join(APP, root))
    expect(hits).toEqual([join(APP, 'lib/atlas/survival/stable-observation.ts')])
  })

  it('the stable-observation helper has NO consumer: no route, workflow, bind or other runtime module imports it', () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e)
        if (statSync(p).isDirectory()) {
          // Tests are not consumers; every runtime directory is scanned.
          if (!['node_modules', '.next', 'qa'].includes(e)) walk(p)
        } else if (/\.(ts|tsx|mjs|js)$/.test(e) && !/\.test\.tsx?$/.test(e)
          // An import of the module, or a call — prose that NAMES it is not a consumer.
          && /from\s+['"][^'"]*stable-observation['"]|import\(\s*['"][^'"]*stable-observation['"]|observeSurvivalStable\s*\(/
            .test(tsCode(read(p)))) hits.push(p)
      }
    }
    for (const root of ['lib', 'app', 'scripts']) walk(join(APP, root))
    expect(hits).toEqual([join(APP, 'lib/atlas/survival/stable-observation.ts')])
  })

  it('the helper is inert by construction: it binds nothing, writes nothing, and its shard count is the migration\'s', () => {
    const helper = tsCode(read(join(APP, 'lib/atlas/survival/stable-observation.ts')))
    expect(helper).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|admitAutonomyAtBind|bind_workflow|autonomy-runtime|runs\b|provenance/)
    expect(helper).toMatch(/export const SURVIVAL_EPOCH_SHARDS = 8\b/)
    // Accepts ONLY equal vectors, and carries V_after.
    expect(helper).toMatch(/if \(sameVector\(before, after\)\) \{\n\s+return \{ kind: 'STABLE', asOf, observation, observedEpochVector: Object\.freeze\(\[\.\.\.after\]\), attempts \}/)
  })
})

// ── M4 blocking precondition: provisional Survival policy ───────────────────

// ── The authority boundary: nothing injectable ─────────────────────────────

describe('observeSurvivalStable is an UNSPOOFABLE authority boundary', () => {
  const raw = read(join(APP, 'lib/atlas/survival/stable-observation.ts'))
  const helper = tsCode(raw)
  const prose = raw.replace(/\n\s*\*\s?/g, ' ').replace(/\s+/g, ' ')

  it('its only exported runtime signature takes the project scope and nothing else', () => {
    const sig = /export async function observeSurvivalStable\(([\s\S]*?)\): Promise<StableSurvivalObservation>/.exec(helper)?.[1] ?? ''
    expect(sig.replace(/\s+/g, ' ').trim()).toBe('allowedProjectIds: readonly string[],')
    const exported = [...helper.matchAll(/^export (?:async function|function|const|let|var|type|interface|class|enum) (\w+)/gm)]
      .map(m => m[1]).sort()
    expect(exported).toEqual(['SURVIVAL_EPOCH_SHARDS', 'SURVIVAL_OBSERVATION_MAX_ATTEMPTS', 'StableSurvivalObservation', 'observeSurvivalStable'])
    expect(helper).not.toMatch(/^export\s*\{|^export default|^export \*/m)
    expect(helper).not.toMatch(/Options\b|\boptions\b|\boverrides?\b|\bargs\b/)
  })

  it('it derives its own database client: createAdminClient(), unconditionally — no parameter, no fallback', () => {
    expect(helper).toMatch(/\n  const db: AnyDb = createAdminClient\(\)\n/)
    expect([...helper.matchAll(/createAdminClient\(/g)]).toHaveLength(1)
    expect(helper).not.toContain('??')
  })

  it('it reaches readSurvivalSnapshot with ONLY its own client and clock — no funding, coverage or snapshot override', () => {
    const calls = [...helper.matchAll(/readSurvivalSnapshot\(([^)]*)\)/g)].map(m => m[1].replace(/\s+/g, ' ').trim())
    expect(calls).toEqual(['allowedProjectIds, { db, now: asOf }'])
    expect(helper).not.toMatch(/funding|Funding|testRunwayCoverage|RunwayCoverage|SnapshotOptions/)
  })

  it('the instant is the server clock, read ONCE inside — no caller can choose `now`', () => {
    expect([...helper.matchAll(/new Date\(\)\.toISOString\(\)/g)]).toHaveLength(1)
    expect(helper).toMatch(/\n  const asOf = new Date\(\)\.toISOString\(\)\n/)
    expect(helper).not.toMatch(/\bnow\s*\?\s*:|\bnow\s*:(?!\s*asOf\b)|process\.env|Date\.parse|new Date\(\s*\w/)
  })

  it('the epoch vectors are read inside and never accepted; the retry budget is a reviewed constant', () => {
    expect(helper).toMatch(/\nexport const SURVIVAL_OBSERVATION_MAX_ATTEMPTS = 3\n/)
    expect(helper).toMatch(/while \(attempts < SURVIVAL_OBSERVATION_MAX_ATTEMPTS\)/)
    expect([...helper.matchAll(/await readEpochVector\(db\)/g)]).toHaveLength(2)
    expect(helper).not.toMatch(/maxAttempts|observedEpochVector\s*\?|epochVector\s*:/)
  })

  it('M4 SCOPE precondition is recorded at the boundary', () => {
    expect(prose).toContain('must derive the observation scope SERVER-SIDE from canonical bind/instance authority')
    expect(prose).toContain('must never accept caller-supplied project ids')
  })
})

// ── The deferred-lock contract is qualified ─────────────────────────────────

describe('the deferred-lock contract is QUALIFIED, and runtime never forces the bump early', () => {
  const SET_IMMEDIATE = /set\s+constraints[^;]*?\bimmediate\b/i

  it('no production runtime TS/JS issues SET CONSTRAINTS … IMMEDIATE (tests and QA exempt)', () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e)
        if (statSync(p).isDirectory()) {
          if (!['node_modules', '.next', 'qa', '__tests__'].includes(e)) walk(p)
        } else if (/\.(ts|tsx|mjs|js|cjs)$/.test(e) && !/\.test\.[cm]?[jt]sx?$/.test(e) && SET_IMMEDIATE.test(read(p))) hits.push(p)
      }
    }
    for (const root of ['lib', 'app', 'scripts']) walk(join(APP, root))
    expect(hits).toEqual([])
  })

  it('no SQL FUNCTION body in the migration corpus issues it either (top-level maintenance SQL is not prohibited)', () => {
    const hits: string[] = []
    for (const f of MIGRATION_FILES) {
      for (const m of sqlCode(read(join(MIGRATIONS, f))).matchAll(/\$(\w*)\$([\s\S]*?)\$\1\$/g)) {
        if (SET_IMMEDIATE.test(m[2])) hits.push(f)
      }
    }
    expect(hits).toEqual([])
  })

  it('the migration states the qualified contract — never an unconditional "always last lock" claim', () => {
    const comments = m2.replace(/\n--\s*/g, ' ')
    expect(comments).toContain("under CANONICAL (default) runtime operation, the shard is the writer's FINAL M2 lock")
    expect(comments).toContain('MAY take the shard EARLY')
    expect(comments).toContain('M3/M4 correctness may not rely on a writer that does unless that writer\'s lock order is independently proven')
    expect(comments).not.toMatch(/makes the shard the LAST lock a writer takes/)
  })
})

describe('M4 BLOCKING PRECONDITION stays visible while Survival policy is provisional', () => {
  it('while SURVIVAL_THRESHOLD_STATUS is provisional, the future bind entry point carries the precondition', () => {
    const derive = read(join(APP, 'lib/atlas/survival/derive.ts'))
    const helper = read(join(APP, 'lib/atlas/survival/stable-observation.ts'))
    const provisional = /export const SURVIVAL_THRESHOLD_STATUS = 'provisional' as const/.test(derive)
    const sixProvisional = [...derive.matchAll(/^export const (PROVISIONAL_[A-Z_]+) = /gm)].map(m => m[1])
    expect(sixProvisional).toHaveLength(6)
    if (provisional) {
      expect(helper).toMatch(/M4 BLOCKING PRECONDITION/)
      for (const n of ['0.1', '0.35', '0.5', '3 / 14 / 60']) expect(helper).toContain(n)
    }
  })
})

// ── No M3/M4 primitive in M2 ────────────────────────────────────────────────

describe('M2 ships no M3/M4 primitive', () => {
  it('no commit clock, fence, prepared-transaction guard, bind, run, licence or provenance', () => {
    const code = m2Code.toLowerCase()
    for (const forbidden of ['clock_timestamp', 'statement_timestamp', 'now()', 'pg_prepared_xacts', 'prepare transaction',
      'fence', 'bind', 'runs', 'license', 'licence', 'provenance', 'atlas_decision', 'workflow_instances', 'for share']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
  })

  it('M1 is untouched: M2 never redefines an M1 object', () => {
    expect(m2Code).not.toMatch(/atlas_decision_lineage|autonomy_license_append|atlas_decision_record_type_advances/)
  })

  it('M0 is untouched: M2 redefines no M0 function and only ADDS triggers', () => {
    expect(m2Code).not.toMatch(/function public\.(budget_\w+|spend_reservations_\w+|cost_events_guard_\w+)\(/)
    expect(m2Code).not.toMatch(/drop trigger|alter table public\.(cost_events|spend_reservations|project_budgets|platform_config|projects|revenue_snapshots|survival_funding_config)\b/)
  })
})
