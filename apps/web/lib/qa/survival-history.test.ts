/**
 * Phase 2A — survival history, structural guarantees.
 *
 * The database behaviours (append-only enforcement, chain integrity,
 * concurrency, vocabulary closure) are proven against real PostgreSQL in
 * `survival-history-sql.test.ts`. This suite proves the things that are
 * properties of the CODE: which direction the dependency runs, what the module
 * is allowed to reach for, and where it is allowed to be called from.
 *
 * The load-bearing one is §12 of the phase brief: history must never become the
 * source of truth for the CURRENT state. That is a dependency-direction claim,
 * and it is asserted here rather than trusted.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { SURVIVAL_DERIVATION_VERSION, SURVIVAL_HISTORY_MAX_LIMIT } from '@/lib/atlas/survival/history'
import { SURVIVAL_STATES, FUNDING_STATES } from '@/lib/atlas/survival/types'
import {
  PROVISIONAL_CRITICAL_HEADROOM_FRACTION,
  PROVISIONAL_CONSERVE_HEADROOM_FRACTION,
  PROVISIONAL_EXPAND_MIN_HEADROOM_FRACTION,
  PROVISIONAL_RUNWAY_CRITICAL_DAYS,
  PROVISIONAL_RUNWAY_CONSERVE_DAYS,
  PROVISIONAL_EXPAND_MIN_RUNWAY_DAYS,
  FUNDING_UNDECLARED_FLOOR,
  FUNDING_DEPLETED_FLOOR,
  FUNDING_UNAVAILABLE_FLOOR,
  allCeilings,
} from '@/lib/atlas/survival'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
/** Comments name what a file deliberately does NOT do; scans read code. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

const HISTORY = ['types.ts', 'store.ts', 'principal-write.ts', 'principal-read.ts', 'index.ts']
const historyPath = (f: string) => `lib/atlas/survival/history/${f}`
const MIGRATION = 'supabase/migrations/20260923120000_survival_state_events.sql'
/** The migration as text, comments stripped of execution meaning by EXEC below. */
const SQL = readFileSync(resolve(WEB_ROOT, MIGRATION), 'utf8')

// ── The direction that must not reverse ─────────────────────────────────────

describe('history is evidence, never the current-state source', () => {
  it('the derivation and the snapshot do not know history exists', () => {
    for (const file of ['../atlas/survival/derive.ts', '../atlas/survival/ceiling.ts', '../atlas/survival/snapshot.ts']) {
      const src = codeOnly(read(file.replace('../', 'lib/')))
      expect(src, file).not.toMatch(/survival_state_events|survival_record_observation/)
      expect(src, file).not.toMatch(/from '\.\/history|from '\.\.\/history|survival\/history/)
    }
  })

  it('the recorder does not derive a competing survival answer', () => {
    const src = codeOnly(read(historyPath('principal-write.ts')))
    // It may OBTAIN the canonical observation (readSurvivalSnapshot) and must
    // never re-derive one from thresholds of its own.
    expect(src).not.toContain('deriveSurvivalState')
    expect(src).not.toMatch(/PROVISIONAL_[A-Z_]*(HEADROOM|RUNWAY)/)
    expect(src).not.toMatch(/FUNDING_(UNDECLARED|UNAVAILABLE|DEPLETED)_FLOOR/)
    expect(src).toContain('readSurvivalSnapshot')
  })

  it('the reader returns history and decides nothing', () => {
    const src = codeOnly(read(historyPath('principal-read.ts')))
    expect(src).not.toContain('deriveSurvivalState')
    expect(src).not.toMatch(/survivalCeiling\(|effectiveAutonomy\(/)
    expect(src).not.toMatch(/state\s*=\s*.*events/)   // no "current state from events"
  })

  it('no consumer of history exists outside the two suites yet', () => {
    // Phase 2A deliberately wires the recorder NOWHERE. If a future phase wires
    // it, this list must be edited deliberately rather than the property being
    // lost silently.
    const roots = ['lib', 'app', 'components'].map(r => resolve(WEB_ROOT, r))
    const allowed = [
      resolve(WEB_ROOT, 'lib/atlas/survival'),           // the module itself
      resolve(WEB_ROOT, 'lib/qa/survival-history.test.ts'),
      resolve(WEB_ROOT, 'lib/qa/survival-history-sql.test.ts'),
    ]
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next' || entry === '.turbo') continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) { walk(full); continue }
        if (!/\.(ts|tsx)$/.test(entry)) continue
        if (allowed.some(p => full.startsWith(p))) continue
        // codeOnly, not raw text: a comment that NAMES this module is not a
        // consumer of it, and other files legitimately cross-reference it while
        // explaining that they must not call it. Every real consumer imports or
        // calls one of these names, and those survive comment-stripping.
        if (/survival\/history|recordSurvivalTransition|observeProjectSurvival/.test(codeOnly(readFileSync(full, 'utf8')))) {
          offenders.push(full)
        }
      }
    }
    for (const root of roots) walk(root)
    expect(offenders, `unexpected history consumers: ${offenders.join(', ')}`).toEqual([])
  })

  it('no read surface writes history', () => {
    for (const file of ['app/api/system/survival/route.ts', 'lib/os/system-health.ts',
                        'components/platform/vnext/SystemHealth.tsx']) {
      const src = codeOnly(read(file))
      expect(src, file).not.toMatch(/recordSurvivalTransition|observeProjectSurvival|recordObservation/)
      expect(src, file).not.toMatch(/survival\/history/)
    }
  })
})

// ── One project, not the platform ───────────────────────────────────────────

describe('the stream is project-scoped, never a platform stream', () => {
  it('the recorder takes ONE project id and cannot accept an allow-list', () => {
    const src = codeOnly(read(historyPath('principal-write.ts')))
    // The signature is the guard: a set-wide observation cannot be attributed to
    // one project if there is no parameter that could carry a set.
    expect(src).toMatch(/observeProjectSurvival\(\s*\n?\s*projectId: string/)
    expect(src).not.toMatch(/observeProjectSurvival\([\s\S]{0,80}readonly string\[\]/)
  })

  it('introduces no second scope type', () => {
    // Ruling: no portfolio or platform-global stream in this phase. A second
    // scope dimension would have to appear as a column, so its absence is
    // checkable rather than merely intended.
    const start = SQL.indexOf('create table if not exists public.survival_state_events')
    const columns = SQL.slice(start, SQL.indexOf('\n);', start))
    for (const forbidden of ['platform_id', 'portfolio_id', 'scope_type', 'tenant_id', 'organization_id']) {
      expect(columns, `second scope dimension: ${forbidden}`).not.toContain(forbidden)
    }
    expect(columns).toContain('project_id')
    // …and the binding project is NOT stored a second time.
    expect(columns).not.toContain('binding_project_id')
  })

  it('states the distinction where a reader will meet it', () => {
    // The Systemhälsa figure and a stream are different facts. Each entry point
    // carries the note, so a future reader cannot mistake one for the other
    // without having read past it.
    expect(read('lib/atlas/survival/history/types.ts')).toContain('Systemhälsa')
    expect(read('lib/atlas/survival/history/principal-read.ts')).toContain('Systemhälsa')
    expect(read(MIGRATION)).toContain('NOT THE SYSTEMHÄLSA NUMBER')
    expect(read('lib/os/system-health.ts')).toContain('A survival history stream is per project')
  })
})

// ── Survival never grants authority and never stops anything ────────────────

describe('the recorder cannot spend, stop, authorize or call out', () => {
  it('reaches no provider, no spend boundary and no stop authority', () => {
    for (const f of HISTORY) {
      const src = codeOnly(read(historyPath(f)))
      expect(src, f).not.toMatch(/anthropic|openai|elevenlabs|ideogram|muapi|getAnthropic/)
      expect(src, f).not.toMatch(/withGovernedSpend|reserveSpend|settleSpend|releaseSpend/)
      // A TYPE-ONLY import of `BudgetScope` is expected and is not a runtime
      // edge. A VALUE import of the spend boundary would be one, so the type
      // imports are removed before the path is checked.
      const valueImports = src.replace(/^import type[\s\S]*?from '[^']*'\s*$/gm, '')
      expect(valueImports, f).not.toMatch(/@\/lib\/cost\/budget-gate/)
      expect(src, f).not.toMatch(/stop_set_platform_automation|stop_set_project_execution|setPlatformAutomationStop|setProjectExecutionStop/)
      expect(src, f).not.toMatch(/automation_paused\s*=|execution_paused\s*=/)
      expect(src, f).not.toMatch(/survivalCeiling\(|effectiveAutonomy\(|lowestAutonomy\(/)
    }
  })

  it('never inserts, updates or deletes the ledger from TypeScript', () => {
    for (const f of HISTORY) {
      const src = codeOnly(read(historyPath(f)))
      expect(src, f).not.toMatch(/\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(/)
    }
    // The ONLY write path is the RPC.
    expect(codeOnly(read(historyPath('store.ts')))).toContain("rpc('survival_record_observation'")
  })

  it('grants no authority, licence or mission authority of any kind', () => {
    for (const f of HISTORY) {
      const src = codeOnly(read(historyPath(f)))
      expect(src, f).not.toMatch(/grantAuthorization|requestAuthorization|autonomyLicense|atlas_autonomy_licenses/)
      expect(src, f).not.toMatch(/MissionBudget|withGovernedSpend|delegation|workpackage/i)
    }
  })
})

// ── The migration is what the code claims ───────────────────────────────────

describe('the migration matches the contract the code assumes', () => {
  const sql = readFileSync(resolve(WEB_ROOT, MIGRATION), 'utf8')
  const EXEC = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').toLowerCase()

  it('creates exactly one table and no budget, funding, authorization or state table', () => {
    expect(EXEC.match(/create table if not exists public\./g)).toHaveLength(1)
    expect(EXEC).toContain('create table if not exists public.survival_state_events')
    for (const forbidden of ['budget', 'funding', 'licen', 'authorization', 'current_state']) {
      expect(EXEC, forbidden).not.toMatch(
        new RegExp(`create table[^(]*public\\.\\w*${forbidden}`))
    }
  })

  it('is append-only including TRUNCATE, and service_role cannot write', () => {
    expect(EXEC).toMatch(/before update or delete on public\.survival_state_events/)
    expect(EXEC).toMatch(/before truncate on public\.survival_state_events/)
    expect(EXEC).toMatch(/before insert on public\.survival_state_events/)
    expect(EXEC).toMatch(/revoke all on table public\.survival_state_events from public, anon, authenticated, service_role/)
    expect(EXEC).toMatch(/grant select on table public\.survival_state_events to service_role/)
    // No INSERT grant to anyone: the boundary is the only writer.
    expect(EXEC).not.toMatch(/grant[^;]*insert[^;]*survival_state_events/)
  })

  it('derives from_state in the boundary, and refuses a no-op', () => {
    expect(EXEC).toContain("if v_previous is null then")
    expect(EXEC).toContain("if v_previous = p_to_state then")
    expect(EXEC).toContain("'unchanged'")
    expect(EXEC).toContain("for update")
  })

  it('keeps the five states and three funding situations closed', () => {
    for (const s of SURVIVAL_STATES) expect(EXEC, s).toContain(`'${s.toLowerCase()}'`)
    for (const f of FUNDING_STATES) expect(EXEC, f).toContain(`'${f.toLowerCase()}'`)
  })

  it('binds the declared funding amount to the KNOWN state in SQL', () => {
    expect(EXEC).toContain("check (declared_funding_sek is null or funding_state = 'known')")
  })
})

// ── Versions ────────────────────────────────────────────────────────────────

/**
 * ── THE DERIVATION VERSION IS LOAD-BEARING ──────────────────────────────────
 *
 * Every recorded row says "derivation version N produced this state". That claim
 * is only worth anything if N identifies a POLICY, so this is the frozen record
 * of what version 1 means. Changing any value below changes what the same
 * `SurvivalInput` derives, and therefore changes what an already-recorded row
 * would mean if it were recomputed — so it MUST be a deliberate, reviewed act
 * that also bumps `SURVIVAL_DERIVATION_VERSION`.
 *
 * The mechanism is deliberately the smallest one in the house style: a frozen
 * literal compared against the live constants. There is no registry, no hash,
 * no migration-time bookkeeping. A threshold edit now fails a test that names
 * the version, which is the whole point — the two edits get reviewed together
 * or not at all.
 *
 * Covered because each can alter a derived state from an unchanged input:
 *   • the six provisional thresholds
 *   • the three funding floors
 *   • the state → autonomy ceiling table
 *   • the closed vocabularies a row can carry
 */
const FROZEN_POLICY_V1 = {
  thresholds: {
    criticalHeadroomFraction: 0.1,
    conserveHeadroomFraction: 0.35,
    expandMinHeadroomFraction: 0.5,
    criticalRunwayDays: 3,
    conserveRunwayDays: 14,
    expandMinRunwayDays: 60,
  },
  floors: {
    undeclared: 'CONSERVE',
    depleted: 'HIBERNATE',
    unavailable: 'HIBERNATE',
  },
  ceilings: { EXPAND: 'L6', NORMAL: 'L6', CONSERVE: 'L3', CRITICAL: 'L1', HIBERNATE: 'L0' },
  fundingStates: ['KNOWN', 'UNDECLARED', 'UNAVAILABLE'],
} as const

const BUMP_HINT =
  'Survival policy changed. If that is intended, bump SURVIVAL_DERIVATION_VERSION ' +
  'and update FROZEN_POLICY_V1 together — already-recorded rows name the old version.'

describe('the derivation version is load-bearing', () => {
  it('freezes every value that derivation_version 1 describes', () => {
    const live = {
      thresholds: {
        criticalHeadroomFraction: PROVISIONAL_CRITICAL_HEADROOM_FRACTION,
        conserveHeadroomFraction: PROVISIONAL_CONSERVE_HEADROOM_FRACTION,
        expandMinHeadroomFraction: PROVISIONAL_EXPAND_MIN_HEADROOM_FRACTION,
        criticalRunwayDays: PROVISIONAL_RUNWAY_CRITICAL_DAYS,
        conserveRunwayDays: PROVISIONAL_RUNWAY_CONSERVE_DAYS,
        expandMinRunwayDays: PROVISIONAL_EXPAND_MIN_RUNWAY_DAYS,
      },
      floors: {
        undeclared: FUNDING_UNDECLARED_FLOOR,
        depleted: FUNDING_DEPLETED_FLOOR,
        unavailable: FUNDING_UNAVAILABLE_FLOOR,
      },
      ceilings: allCeilings(),
      fundingStates: [...FUNDING_STATES],
    }
    expect(live, BUMP_HINT).toEqual(FROZEN_POLICY_V1)
  })

  it('records the version and the threshold status on EVERY branch of the writer', () => {
    // A baseline and a transition must both carry the policy identity. If only
    // one branch stored it, half the ledger would be uninterpretable after a
    // policy change and the gap would be invisible until someone read history.
    const inserts = SQL.match(/insert into public\.survival_state_events[\s\S]*?returning/g) ?? []
    expect(inserts.length).toBeGreaterThanOrEqual(2)
    for (const insert of inserts) {
      expect(insert).toContain('derivation_version')
      expect(insert).toContain('threshold_status')
    }
  })

  it('is a plain integer, not a content hash of the policy', () => {
    // The row asserts a PRODUCER version. It is not a content guarantee, and
    // pretending otherwise would imply the ledger can detect a policy change on
    // its own — it cannot; this suite is what does that.
    expect(Number.isInteger(SURVIVAL_DERIVATION_VERSION)).toBe(true)
    expect(SURVIVAL_DERIVATION_VERSION).toBe(1)   // bump WITH FROZEN_POLICY_V1
    for (const f of HISTORY) {
      expect(codeOnly(read(historyPath(f))), f).not.toMatch(/sha256|createHash|\bhash\b/i)
    }
  })

  it('caps the history read hard', () => {
    expect(SURVIVAL_HISTORY_MAX_LIMIT).toBeGreaterThan(0)
    expect(SURVIVAL_HISTORY_MAX_LIMIT).toBeLessThanOrEqual(500)
  })
})
