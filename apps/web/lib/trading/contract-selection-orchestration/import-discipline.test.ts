/**
 * Import discipline, boundaries and source order for the
 * contract-selection-orchestration package.
 *
 * The claims worth protecting here are not behavioural. An orchestrator that
 * grew a clock, minted an identity, reached for a provider, wrote a journal
 * event or dropped its post-record re-read would still satisfy most of
 * `orchestration.test.ts`, because those assertions describe what the function
 * RETURNS — not what it is allowed to reach, nor the order in which it reaches.
 *
 * Two kinds of guard live here. The import guards forbid whole vocabularies.
 * The order guards (Beslut M §3, §25) pin the three sequencing facts that a
 * black-box success cannot distinguish from a lucky one: the lookup comes before
 * the fallback branch, the record comes after materialisation, and a second
 * lookup comes after the record.
 *
 * Several forbidden identifiers are assembled from fragments below, so this file
 * never contains the literals it forbids.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const TRADING_ROOT = resolve(HERE, '..')

const PRODUCTION = readdirSync(HERE)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .sort()

const raw = (file: string): string => readFileSync(file, 'utf8')

/** Source with comments stripped — the prose names the rules it must not be judged by. */
const executable = (file: string): string =>
  raw(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const CODE: readonly (readonly [string, string])[] = PRODUCTION.map(
  (name) => [name, executable(join(HERE, name))] as const,
)

const ORCHESTRATION = executable(join(HERE, 'orchestration.ts'))

function importSpecifiers(source: string): string[] {
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[\s\S]*?\s*from\s+['"]([^'"]+)['"]/g
  return [...source.matchAll(pattern)].map((m) => m[1])
}

const occurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1

/* Assembled from fragments so this file never contains what it forbids. */
const NEW_ID = `new${'Id'}`
const RANDOM_UUID = `random${'UUID'}`
const DATE_NOW = `Date${'.'}now(`
const WALL_CLOCK = `wallClock${'EpochMs'}`
const TO_EPOCH_MS = `to${'EpochMs'}`
const EVENT_TYPES = `EVENT${'_TYPES'}`
const EVENT_ENTITY_TYPES = `EVENT${'_ENTITY_TYPES'}`
const TRADING_EVENT = `Trading${'Event'}`
const RECORDED_AT = `recorded${'At'}`
const THIS_PACKAGE = `contract-selection-${'orchestration'}`

// ─── The scan reads real source ───────────────────────────────────────────────

describe('the package has files to check', () => {
  it('POSITIVE CONTROL: found exactly the production modules', () => {
    expect(PRODUCTION).toEqual(['index.ts', 'orchestration.ts'])
  })

  it('POSITIVE CONTROL: the scan reads real, substantial source', () => {
    expect(ORCHESTRATION).toContain('export async function orchestrateRecordedFirstContractSelection')
    expect(ORCHESTRATION).toContain('export interface HistoricalContractSelectionFallback')
    expect(ORCHESTRATION).toContain('export interface RecordedFirstContractSelectionInput')
    expect(ORCHESTRATION.length).toBeGreaterThan(1_000)
  })

  it('POSITIVE CONTROL: comment stripping actually removes prose', () => {
    const file = join(HERE, 'orchestration.ts')
    // The header names the clock and the id minting it must never perform.
    expect(raw(file)).toContain(DATE_NOW)
    expect(raw(file)).toContain(RANDOM_UUID)
    expect(executable(file)).not.toContain(DATE_NOW)
    expect(executable(file)).not.toContain(RANDOM_UUID)
  })
})

// ─── It composes: the three packages must actually be imported ───────────────

describe('the package composes the three it exists to compose', () => {
  it('imports contract-calendar, contract-selection and contract-selection-store', () => {
    const specs = importSpecifiers(ORCHESTRATION)
    expect(specs).toContain('../contract-calendar')
    expect(specs).toContain('../contract-selection')
    expect(specs).toContain('../contract-selection-store')
  })

  it('actually calls the resolver and the materializer', () => {
    expect(ORCHESTRATION).toContain('resolveContractAt(')
    expect(ORCHESTRATION).toContain('materializeContractSelectionDecision(')
    expect(ORCHESTRATION).toContain('store.find(')
    expect(ORCHESTRATION).toContain('store.record(')
  })

  it('imports nothing beyond the permitted surface', () => {
    const permitted = new Set([
      '../contract-calendar',
      '../contract-selection',
      '../contract-selection-store',
      '../ids',
      '../market-instrument',
      '../time',
      './orchestration',
    ])
    for (const [name, src] of CODE) {
      for (const spec of importSpecifiers(src)) {
        expect(permitted.has(spec), `${name} imports ${spec}`).toBe(true)
      }
    }
  })

  it('deep-imports beneath no composition package', () => {
    for (const [name, src] of CODE) {
      for (const spec of importSpecifiers(src)) {
        for (const pkg of ['../contract-calendar', '../contract-selection', '../contract-selection-store']) {
          expect(spec.startsWith(`${pkg}/`), `${name} deep-imports ${spec}`).toBe(false)
        }
      }
    }
  })

  it('never imports through the root Trading barrel', () => {
    for (const [name, src] of CODE) {
      for (const spec of importSpecifiers(src)) {
        expect(spec, `${name} imports the root barrel`).not.toBe('../index')
        expect(spec, `${name} imports the root barrel`).not.toBe('..')
        expect(spec.startsWith('@/lib/trading'), `${name} imports ${spec}`).toBe(false)
      }
    }
  })
})

// ─── Determinism: no clock, no identity, no environment ──────────────────────

describe('determinism', () => {
  it('reads no clock', () => {
    for (const [name, src] of CODE) {
      expect(src, `${name} reads the wall clock`).not.toContain(DATE_NOW)
      expect(src, `${name} names the wall clock helper`).not.toContain(WALL_CLOCK)
      for (const pattern of [
        /new\s+Date\s*\(/, /performance\s*\.\s*now\s*\(/,
        /setTimeout\s*\(/, /setInterval\s*\(/, /\bhrtime\b/,
      ]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('mints no identifier and uses no randomness', () => {
    for (const [name, src] of CODE) {
      expect(src, `${name} mints an id`).not.toContain(`${NEW_ID}(`)
      expect(src, `${name} imports the id minter`).not.toMatch(
        new RegExp(`\\b${NEW_ID}\\b\\s*[,}]`),
      )
      expect(src, `${name} uses randomUUID`).not.toContain(RANDOM_UUID)
      expect(src, `${name} uses Math.random`).not.toMatch(/Math\s*\.\s*random/)
      expect(src, `${name} imports crypto`).not.toMatch(/from\s+['"]node:crypto['"]/)
    }
  })

  it('reads no environment', () => {
    for (const [name, src] of CODE) {
      for (const pattern of [/process\s*\.\s*env/, /import\.meta\.env/, /\bdotenv\b/]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

// ─── The Timestamp firewall ──────────────────────────────────────────────────

describe('it performs no interval arithmetic', () => {
  it('never converts a Timestamp to an instant', () => {
    for (const [name, src] of CODE) {
      expect(src, `${name} converts a Timestamp`).not.toContain(TO_EPOCH_MS)
    }
  })

  it('compares no interval bound', () => {
    for (const [name, src] of CODE) {
      for (const bound of ['effectiveFrom', 'effectiveTo']) {
        expect(src, `${name} names ${bound}`).not.toContain(bound)
      }
      for (const pattern of [/\bisAfter\s*\(/, /\bisExpiredAt\s*\(/]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

// ─── Provider firewall ───────────────────────────────────────────────────────

describe('provider firewall', () => {
  it('names no provider, symbol or network', () => {
    for (const [name, src] of CODE) {
      const lowered = src.toLowerCase()
      for (const forbidden of [
        'rithmic', 'tradovate', 'projectx', 'frontmonth', 'providersymbol',
        'openinterest', 'websocket', 'provider',
      ]) {
        expect(lowered, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
      for (const pattern of [/\bfetch\s*\(/, /\baxios\b/, /XMLHttpRequest/]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

// ─── Journal firewall ────────────────────────────────────────────────────────

describe('journal firewall', () => {
  it('emits no event and writes no journal', () => {
    for (const [name, src] of CODE) {
      expect(src, `${name} names the event registry`).not.toContain(EVENT_TYPES)
      expect(src, `${name} names the entity registry`).not.toContain(EVENT_ENTITY_TYPES)
      expect(src, `${name} names the event envelope`).not.toContain(TRADING_EVENT)
      expect(src, `${name} names a storage instant`).not.toContain(RECORDED_AT)
      expect(src, `${name} emits`).not.toMatch(/\bemit\s*\(/)
      expect(src, `${name} imports the journal`).not.toContain("'../events")
      expect(src, `${name} imports reason codes`).not.toContain("'../reason-codes")
    }
  })
})

// ─── Database firewall ───────────────────────────────────────────────────────

describe('database firewall', () => {
  it('speaks to no database and no filesystem', () => {
    for (const [name, src] of CODE) {
      const lowered = src.toLowerCase()
      for (const forbidden of [
        'supabase', 'postgres', 'prisma', 'redis', 'localstorage', 'indexeddb',
        'migration', 'createclient',
      ]) {
        expect(lowered, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
      for (const pattern of [/from\s+['"]node:fs['"]/, /\bwriteFile\b/, /\breadFileSync\b/]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

// ─── Authority firewall ──────────────────────────────────────────────────────

describe('authority firewall', () => {
  it('mints no clearance, grant, intent or order', () => {
    for (const [name, src] of CODE) {
      for (const forbidden of [
        'RiskClearance', 'PropClearance', 'ApprovalGrant', 'ExecutionIntent',
        'TradeProposal', 'OrderIntent',
      ]) {
        expect(src, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})

// ─── No mutable module state ─────────────────────────────────────────────────

describe('no mutable module state', () => {
  it('declares no module-scope let, var, Map or Set', () => {
    for (const [name, src] of CODE) {
      for (const line of src.split('\n')) {
        if (/^\s/.test(line)) continue
        expect(line, `${name} declares module state: ${line.trim()}`).not.toMatch(
          /^(let|var)\s|^const\s+\w+\s*(:[^=]*)?=\s*new\s+(Map|Set|WeakMap)\b/,
        )
      }
    }
  })

  it('exposes one function, and no class or factory', () => {
    expect(ORCHESTRATION).not.toMatch(/\bclass\s+\w/)
    // Exactly one exported function, and it is the async orchestrator.
    expect(occurrences(ORCHESTRATION, 'export async function')).toBe(1)
    expect(occurrences(ORCHESTRATION, 'export function')).toBe(0)
    // No exported factory, builder or singleton alongside it.
    expect(ORCHESTRATION).not.toMatch(/export\s+const\s+\w+\s*(:[^=]*)?=\s*(async\s*)?\(/)
    expect(ORCHESTRATION).not.toMatch(/export\s+default\b/)
  })
})

// ─── §41: the order the source must keep ─────────────────────────────────────

describe('the recorded-first order is pinned in the source', () => {
  it('POSITIVE CONTROL: every order anchor is actually present', () => {
    for (const anchor of [
      'store.find(',
      'fallback === undefined',
      'materializeContractSelectionDecision(',
      'store.record(',
      'resolveContractAt(',
    ]) {
      expect(ORCHESTRATION.indexOf(anchor), `missing anchor ${anchor}`).toBeGreaterThan(-1)
    }
  })

  it('looks up recorded history before it branches on the fallback', () => {
    const firstFind = ORCHESTRATION.indexOf('store.find(')
    const fallbackBranch = ORCHESTRATION.indexOf('fallback === undefined')
    const resolverCall = ORCHESTRATION.indexOf('resolveContractAt(')
    const fallbackRead = ORCHESTRATION.indexOf('fallback.calendar')

    expect(firstFind).toBeLessThan(fallbackBranch)
    expect(firstFind).toBeLessThan(resolverCall)
    expect(firstFind).toBeLessThan(fallbackRead)
    expect(fallbackBranch).toBeLessThan(resolverCall)
  })

  it('records only after materialising, and never hand-builds a decision', () => {
    const materialize = ORCHESTRATION.indexOf('materializeContractSelectionDecision(')
    const record = ORCHESTRATION.indexOf('store.record(')

    expect(materialize).toBeLessThan(record)
    expect(occurrences(ORCHESTRATION, 'store.record(')).toBe(1)
    expect(occurrences(ORCHESTRATION, 'materializeContractSelectionDecision(')).toBe(1)
    // policyVersion, reasons and evidence belong to the materializer alone.
    for (const owned of ['policyVersion', 'reasons:', 'evidence:', 'CONTRACT_SELECTED']) {
      expect(ORCHESTRATION, `orchestration duplicates ${owned}`).not.toContain(owned)
    }
  })

  it('reads the store again after a successful record', () => {
    const record = ORCHESTRATION.indexOf('store.record(')
    const lastFind = ORCHESTRATION.lastIndexOf('store.find(')
    const firstFind = ORCHESTRATION.indexOf('store.find(')

    expect(occurrences(ORCHESTRATION, 'store.find(')).toBe(2)
    expect(lastFind).toBeGreaterThan(record)
    expect(lastFind).toBeGreaterThan(firstFind)
  })

  it('converts no rejected promise into a domain outcome', () => {
    expect(ORCHESTRATION, 'orchestration catches').not.toMatch(/\bcatch\s*[({]/)
    expect(ORCHESTRATION, 'orchestration uses .catch').not.toMatch(/\.\s*catch\s*\(/)
    for (const invented of ['NETWORK_ERROR', 'STORE_ERROR', 'INFRA_ERROR', 'UNKNOWN_ERROR']) {
      expect(ORCHESTRATION, `orchestration invents ${invented}`).not.toContain(invented)
    }
  })

  it('exposes no existing-versus-new observability', () => {
    for (const [name, src] of CODE) {
      for (const forbidden of ['FOUND_EXISTING', 'NEWLY_RECORDED', 'CREATED', 'REUSED', 'ALREADY_RECORDED']) {
        expect(src, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})

// ─── §10 / §40: the public surface and the untouched root barrel ─────────────

describe('the public surface', () => {
  const index = executable(join(HERE, 'index.ts'))

  it('exports exactly the four public names', () => {
    expect(index).toContain('orchestrateRecordedFirstContractSelection')
    expect(index).toContain('HistoricalContractSelectionFallback')
    expect(index).toContain('RecordedFirstContractSelectionInput')
    expect(index).toContain('RecordedFirstContractSelectionResult')
  })

  it('re-exports no foreign ownership', () => {
    for (const foreign of [
      'ContractSelectionDecisionId',
      'ContractSelectionDecisionStore',
      'ContractCalendar',
      'ContractResolution',
      'MarketInstrument',
      'Timestamp',
    ]) {
      expect(index, `index re-exports ${foreign}`).not.toContain(foreign)
    }
    // `ContractSelectionDecision` must not be re-exported either. It is checked
    // with a boundary so it cannot be satisfied by the longer names above.
    expect(index).not.toMatch(/\bContractSelectionDecision\b(?!Id|Store)/)
  })

  it('the root Trading barrel does not know this package exists', () => {
    const rootBarrel = raw(join(TRADING_ROOT, 'index.ts'))
    expect(rootBarrel, 'the root barrel references this package').not.toContain(THIS_PACKAGE)
    expect(rootBarrel).not.toContain('orchestrateRecordedFirstContractSelection')
  })
})
