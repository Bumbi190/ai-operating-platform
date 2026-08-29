/**
 * lib/qa/executive-intelligence-schema-activation.test.ts — EI-S1.6A
 *
 * The EI-S1.5B conformance review found the Executive Brief apex had no storage
 * in production: `atlas_intelligence` and `atlas_entities` did not exist and the
 * generation cron had never been scheduled. The cause was not a missing file —
 * all three migrations existed — but a missing DIRECTORY: they sat under the
 * repo-root `supabase/migrations/`, which `check-migrations.mjs` does not scan.
 * The guard reported "39 enforced / 0 missing" truthfully while being blind to
 * the entire Executive Intelligence schema.
 *
 * These tests hold the dependency closure together. They assert on migration
 * SOURCE, because that is what the guard enforces and what a reviewer can check
 * before anything touches production — but they deliberately also assert the
 * runtime/schema AGREEMENT that source-only tests historically missed: every
 * column the store reads, and the exact conflict target the registry upserts on.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(__dirname, '../../../..')
const CANON = resolve(REPO_ROOT, 'apps/web/supabase/migrations')
const LEGACY = resolve(REPO_ROOT, 'supabase/migrations')

/** Lazy so a MISSING bundle member fails as a clear assertion, not a collect crash. */
const read = (dir: string, f: string): string => {
  try { return readFileSync(resolve(dir, f), 'utf8') } catch { return '' }
}
const ledgerName = (file: string) => file.replace(/^\d+_/, '').replace(/\.sql$/, '')

const INTEL = '20260821_atlas_intelligence.sql'
const ENTITIES = '20260821_atlas_entities.sql'
const CRON = '20260821_atlas_intelligence_cron.sql'
const BUNDLE = [INTEL, ENTITIES, CRON]

/** The 14-name frozen baseline in check-migrations.mjs. */
const GRANDFATHERED_COUNT = 14

describe('EI-S1.6A — Executive Intelligence schema activation bundle', () => {
  const canonFiles = readdirSync(CANON).filter(f => f.endsWith('.sql'))

  it('activates all three closure members in the guarded directory', () => {
    for (const f of BUNDLE) expect(canonFiles, `${f} must be canonical`).toContain(f)
  })

  it('derives unique, collision-free ledger names', () => {
    const names = canonFiles.map(ledgerName)
    expect(new Set(names).size).toBe(names.length)
    expect(BUNDLE.map(ledgerName)).toEqual([
      'atlas_intelligence', 'atlas_entities', 'atlas_intelligence_cron',
    ])
  })

  it('orders the bundle so the cron schedule applies last', () => {
    const applied = canonFiles.filter(f => BUNDLE.includes(f)).sort()
    expect(applied[applied.length - 1]).toBe(CRON)
  })

  /**
   * TRIPWIRE, not a delta assertion.
   *
   * Despite its original name this pins the ABSOLUTE number of enforced
   * migrations, so any migration added anywhere in the repository fails it
   * until the number is raised deliberately. That is worth keeping: a new
   * enforced migration is production state the build guard will demand, and it
   * should never arrive unnoticed. Raising the number is an acknowledgement.
   *
   * 42 → 43: `project_api_credentials` (Security Credential Phase 1).
   * 43 → 44: `workflow_instance_core` (Workflow Instance Core, PR1).
   * 44 → 45: `workflow_instance_core_hardening` (advisor fixes for the above).
   */
  it('enforces exactly the expected number of migrations — currently 45', () => {
    const enforced = canonFiles.map(ledgerName).length - GRANDFATHERED_COUNT
    expect(enforced).toBe(45)
    // The EI-S1.6A bundle is still exactly three of them, all canonical.
    expect(BUNDLE).toHaveLength(3)
    expect(BUNDLE.every(f => canonFiles.includes(f))).toBe(true)
  })

  it('does not newly enforce any unrelated legacy migration', () => {
    // The repo-root directory stays historical and unscanned. If a future change
    // pointed the guard at it, dozens of stale migrations would silently become
    // required production state.
    const guard = read(resolve(REPO_ROOT, 'apps/web/scripts'), 'check-migrations.mjs')
    expect(guard).toContain("new URL('../supabase/migrations/', import.meta.url)")
    expect(guard).not.toMatch(/\.\.\/\.\.\/\.\.\/supabase\/migrations/)
    // The legacy originals are preserved for provenance, not deleted.
    for (const f of [
      '20260629_120000_atlas_intelligence.sql',
      '20260629_120100_atlas_entities.sql',
      '20260629_200000_atlas_intelligence_cron.sql',
    ]) expect(readdirSync(LEGACY)).toContain(f)
  })
})

describe('EI-S1.6A — schema matches what the runtime actually requires', () => {
  const intel = () => read(CANON, INTEL)
  const entities = () => read(CANON, ENTITIES)

  /**
   * Reads the column list the runtime actually uses, in either form the codebase
   * writes it: a joined array (postgres-store) or a plain string (entity-registry).
   * Parsing the real declaration rather than restating it is the point — a
   * hand-copied list would drift silently, which is the whole failure mode here.
   */
  const columnsOf = (file: string, symbol: string): string[] => {
    const src = readFileSync(resolve(REPO_ROOT, file), 'utf8')
    const arr = src.match(new RegExp(`const ${symbol}\\s*=\\s*\\[([\\s\\S]*?)\\]`))?.[1]
    const str = src.match(new RegExp(`const ${symbol}\\s*=\\s*'([^']+)'`))?.[1]
    const raw = arr ?? str
    expect(raw, `${symbol} must be discoverable`).toBeTruthy()
    return raw!.split(',').map(c => c.trim().replace(/^'|'$/g, '')).filter(Boolean)
  }

  it('carries every column the intelligence store reads and writes', () => {
    const cols = columnsOf('apps/web/lib/atlas/intelligence/postgres-store.ts', 'SELECT_COLS')
    expect(cols.length).toBeGreaterThan(10)
    for (const col of cols) {
      expect(intel(), `column ${col} missing from schema`).toMatch(new RegExp(`\\b${col}\\b`))
    }
  })

  it('carries every column the entity registry reads and writes', () => {
    const cols = columnsOf('apps/web/lib/atlas/intelligence/entity-registry.ts', 'ENTITY_COLS')
    expect(cols.length).toBeGreaterThan(4)
    for (const col of cols) {
      expect(entities(), `column ${col} missing from schema`).toMatch(new RegExp(`\\b${col}\\b`))
    }
  })

  /**
   * The defect this bundle fixes, and the reason a "table exists" check is not
   * enough. The registry upserts on (kind, key, project_id), and global entities
   * carry project_id NULL. A plain UNIQUE is NULLS DISTINCT, so ON CONFLICT
   * could never fire for them and every reconcile would insert a duplicate.
   */
  it('supports the exact upsert conflict target, including for global entities', () => {
    const reg = readFileSync(
      resolve(REPO_ROOT, 'apps/web/lib/atlas/intelligence/entity-registry.ts'), 'utf8')
    const onConflict = reg.match(/onConflict:\s*'([^']+)'/)?.[1]
    expect(onConflict).toBe('kind,key,project_id')

    const keyCols = onConflict!.split(',').map(c => c.trim()).join(', ')
    expect(entities()).toMatch(
      new RegExp(`unique\\s+nulls\\s+not\\s+distinct\\s*\\(\\s*${keyCols}\\s*\\)`, 'i'),
    )
  })

  it('scopes project evidence with RESTRICT, never re-scoping it to world scope', () => {
    expect(intel()).toMatch(/project_id\s+uuid\s+references\s+public\.projects\(id\)\s+on\s+delete\s+restrict/i)
    expect(intel()).not.toMatch(/references\s+public\.projects\(id\)\s+on\s+delete\s+set\s+null/i)
  })

  it('keeps the store service-role only with no user-facing policy', () => {
    for (const sql of [intel(), entities()]) {
      expect(sql).toMatch(/enable row level security/i)
      expect(sql).toMatch(/revoke all on .* from anon, authenticated/i)
      expect(sql).not.toMatch(/create policy/i)
    }
  })
})

describe('EI-S1.6A — supersession is the only permitted mutation', () => {
  const intel = () => read(CANON, INTEL)

  /**
   * Asserts the trigger NAME is bound to its event and function, all three in one
   * statement. An earlier version matched only the `before update on ...`
   * fragment, which a renamed (and therefore no-longer-installed) trigger still
   * satisfied — the mutation survived. Binding the whole statement kills it.
   */
  const triggerBinding = (name: string, event: string) =>
    new RegExp(
      `create trigger ${name}\\s+before ${event} on public\\.atlas_intelligence` +
      `\\s+for each row execute function public\\.atlas_intelligence_reject_mutation\\(\\)`,
      'i',
    )

  it('binds a DELETE-rejecting trigger by name', () => {
    expect(intel()).toMatch(triggerBinding('atlas_intelligence_no_delete', 'delete'))
  })

  it('binds an UPDATE-guarding trigger by name', () => {
    expect(intel()).toMatch(triggerBinding('atlas_intelligence_supersede_only', 'update'))
  })

  it('permits only an unset→set superseded_by transition', () => {
    expect(intel()).toMatch(/old\.superseded_by is not null/i)   // already closed → immutable
    expect(intel()).toMatch(/new\.superseded_by is null/i)       // must actually supersede
    expect(intel()).toMatch(/is distinct from/i)                 // substance unchanged
  })

  it('freezes the artifact substance', () => {
    for (const col of ['body', 'evidence', 'confidence', 'produced_at', 'produced_by']) {
      expect(intel()).toMatch(new RegExp(`new\\.${col}`))
      expect(intel()).toMatch(new RegExp(`old\\.${col}`))
    }
  })
})

describe('EI-S1.6A — the cron schedule generates and nothing more', () => {
  const cron = () => read(CANON, CRON)

  it('schedules only the generation path', () => {
    expect(cron()).toContain('/api/atlas/intelligence/cron/brief')
    expect(cron()).toMatch(/cron\.schedule\(/)
  })

  it('does not resurrect the retired shared-secret read route', () => {
    const code = cron().replace(/--[^\n]*/g, ' ')
    expect(code).not.toMatch(/call_vercel\('\/api\/atlas\/intelligence\/brief'\)/)
    expect(code).not.toMatch(/'\/api\/atlas\/intelligence\/brief'/)
  })

  it('is idempotent', () => {
    expect(cron()).toMatch(/cron\.unschedule\('omnira_atlas_intelligence_brief'\)/)
  })

  it('names its verified dependencies', () => {
    for (const dep of ['omnira_cron.config', 'omnira_cron.call_vercel', 'atlas_intelligence', 'atlas_entities']) {
      expect(cron()).toContain(dep)
    }
  })

  it('introduces no authority, execution or user-facing surface', () => {
    const code = cron().replace(/--[^\n]*/g, ' ')
    for (const forbidden of [
      'atlas_authorizations', 'atlas_decision_ledger', 'atlas_mission_ledger',
      'atlas_delegation_ledger', 'manager_tasks', 'create policy', 'grant ',
    ]) {
      expect(code.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })
})
