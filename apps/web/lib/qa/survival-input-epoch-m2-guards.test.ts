/**
 * Phase 3B1B2 · M2 — permanent guards.
 *
 * The real-PostgreSQL suite (`survival-input-epoch-m2-sql.test.ts`) proves the
 * epoch works. These guards keep the CURRENT SOURCE SET visible and reviewable,
 * and make a future edit fail until its epoch coverage is reviewed:
 *
 *   - exactly 8 shards, ids 0..7, one documented shard formula;
 *   - every Survival authority source carries its deferred bump + TRUNCATE bump,
 *     and nothing else does;
 *   - the Survival read surface (TypeScript reads, SQL dependencies of the RPCs
 *     it calls, the SurvivalInput shape) equals the reviewed set — a new input
 *     fails here first;
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

/** The LAST migration (apply order) that defines `public.<fn>(` — the effective body. */
function effectiveDefinition(fn: string): string {
  let body = ''
  for (const f of MIGRATION_FILES) {
    const code = sqlCode(read(join(MIGRATIONS, f)))
    const re = new RegExp(`create or replace function public\\.${fn}\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, 'gi')
    for (const m of code.matchAll(re)) body = m[2]
  }
  return body
}
const tablesIn = (sql: string) =>
  [...new Set([...sql.matchAll(/\bpublic\.([a-z_]+)\b(?!\s*\()/g)].map(m => m[1]))].sort()

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

  it.each(AUTHORITY_SOURCES)('%s: INSERT and DELETE bump (deferred row constraint trigger), TRUNCATE bumps (statement)', (table) => {
    const mine = bumpers.filter(t => t.table === table)
    const deferred = mine.filter(t => t.constraint)
    for (const t of deferred) {
      expect(t.rest, t.name).toMatch(/deferrable initially deferred for each row/)
    }
    const events = deferred.flatMap(t => t.events.split(/\s+or\s+/))
    expect(events).toContain('insert')
    expect(events).toContain('delete')
    expect(events).toContain('update')
    const truncate = mine.filter(t => !t.constraint)
    expect(truncate.map(t => t.events)).toEqual(['truncate'])
    expect(truncate[0].rest).toMatch(/for each statement/)
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
    expect(fns.sort()).toEqual(['survival_input_epoch_bump', 'survival_input_epoch_shards_guard', 'survival_input_epoch_vector'])
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

  it('no runtime code (outside lib/qa) references the epoch', () => {
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
    expect(hits).toEqual([])
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
