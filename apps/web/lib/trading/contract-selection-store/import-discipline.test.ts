/**
 * Import discipline and boundaries for the contract-selection-store package.
 *
 * The claims worth protecting here are not behavioural. A store that grew a
 * clock, a resolver call, a provider import or a journal write would still pass
 * every assertion in `store.test.ts`, because those test what `record` and
 * `find` RETURN, not what the package is allowed to reach.
 *
 * Several forbidden identifiers are assembled from fragments below, so this file
 * never contains the literals it forbids. Without that, the guards would match
 * their own source and the only remaining fix would be to stop scanning it.
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

function importSpecifiers(source: string): string[] {
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[\s\S]*?\s*from\s+['"]([^'"]+)['"]/g
  return [...source.matchAll(pattern)].map((m) => m[1])
}

/* Assembled from fragments so this file never contains what it forbids. */
const RESOLVE = 'resolve'
const CONTRACT = 'Contract'
const RESOLVER_CALL = `${RESOLVE}${CONTRACT}At`
const CALENDAR_TYPE = `${CONTRACT}Calendar`
const MATERIALIZE = `materialize${CONTRACT}SelectionDecision`
const NEW_ID = `new${'Id'}`
const RANDOM_UUID = `random${'UUID'}`
const BY_DECISION_ID = `getBy${'DecisionId'}`

// ─── The scan reads real source ───────────────────────────────────────────────

describe('the package has files to check', () => {
  it('POSITIVE CONTROL: found the production modules', () => {
    expect(PRODUCTION).toEqual(['index.ts', 'store.ts'])
  })

  it('POSITIVE CONTROL: the scan reads real, substantial source', () => {
    const store = executable(join(HERE, 'store.ts'))
    expect(store).toContain('export function createInMemoryContractSelectionDecisionStore')
    expect(store).toContain('export interface ContractSelectionDecisionStore')
    expect(store.length).toBeGreaterThan(1_000)
  })

  it('POSITIVE CONTROL: comment stripping actually removes prose', () => {
    const store = join(HERE, 'store.ts')
    // The header names the resolver it must never call.
    expect(raw(store)).toContain(RESOLVER_CALL)
    expect(executable(store)).not.toContain(RESOLVER_CALL)
  })
})

// ─── Recorded-first: it never resolves ────────────────────────────────────────

describe('the store never resolves', () => {
  it('calls no resolver and consults no calendar', () => {
    for (const [name, src] of CODE) {
      expect(src, `${name} calls the resolver`).not.toContain(RESOLVER_CALL)
      expect(src, `${name} names the calendar type`).not.toContain(CALENDAR_TYPE)
      expect(src, `${name} imports contract-calendar`).not.toContain("'../contract-calendar")
    }
  })

  it('never materializes a decision', () => {
    for (const [name, src] of CODE) {
      expect(src, `${name} materializes`).not.toContain(MATERIALIZE)
    }
  })

  it('performs no calendar-pin or policy lookup', () => {
    for (const [name, src] of CODE) {
      for (const forbidden of ['pinnedCalendar', 'calendarPin', 'policyLookup', 'resolvePolicy']) {
        expect(src, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('reads no clock', () => {
    for (const [name, src] of CODE) {
      for (const pattern of [
        /Date\s*\.\s*now\s*\(/, /new\s+Date\s*\(/, /performance\s*\.\s*now\s*\(/,
        /setTimeout\s*\(/, /setInterval\s*\(/, /\bhrtime\b/,
      ]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('mints no identifier and uses no randomness', () => {
    for (const [name, src] of CODE) {
      expect(src, `${name} mints an id`).not.toContain(`${NEW_ID}(`)
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

  it('holds no module-global mutable state', () => {
    const store = executable(join(HERE, 'store.ts'))
    /*
     * Module scope is proven by INDENTATION, not by the declaration alone: the
     * factory's own Map is legitimate and is indented, while a module-global one
     * would start at column zero. Trimming the line first would erase exactly
     * the evidence this guard depends on.
     */
    for (const line of store.split('\n')) {
      if (/^(const|let|var)\s+\w+\s*=\s*new\s+(Map|Set|WeakMap)/.test(line)) {
        expect.fail(`module-scope mutable collection: ${line.trim()}`)
      }
    }
    // ...and the factory-scoped one really is there, indented.
    expect(store).toMatch(/\n\s+const byDecisionId = new Map/)
  })
})

// ─── It reaches nothing outside the domain ────────────────────────────────────

describe('the package reaches nothing external', () => {
  it('imports only the permitted domain siblings', () => {
    const ALLOWED = new Set(['../contract-selection', '../market-instrument', '../time', './store'])
    for (const [name, src] of CODE) {
      for (const specifier of importSpecifiers(src)) {
        if (specifier.startsWith('node:')) {
          expect.fail(`${name} imports ${specifier}; this package needs no Node built-in`)
        }
        expect(ALLOWED.has(specifier), `${name} imports ${specifier}`).toBe(true)
      }
    }
  })

  it('makes no network call and names no endpoint', () => {
    for (const [name, src] of CODE) {
      for (const pattern of [
        /\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/, /sendBeacon/, /\baxios\b/, /https?:\/\//,
      ]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('touches no database or external persistence', () => {
    for (const [name, src] of CODE) {
      for (const pattern of [
        /supabase/i, /\bpostgres\b/i, /\bprisma\b/i, /\bSELECT\s+/i, /\bINSERT\s+INTO\b/i,
        /localStorage/, /indexedDB/i, /\bredis\b/i, /node:fs/, /writeFile/, /readFile/,
      ]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('names no provider, exchange or protocol', () => {
    for (const [name, src] of CODE) {
      for (const pattern of [
        /rithmic/i, /tradovate/i, /projectx/i, /tradingview/i, /protobuf/i,
        /providerContractId/, /providerSymbol/, /frontMonth/, /ExecutionProviderAdapter/,
      ]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('reaches no journal, replay, provider or authority package', () => {
    for (const [name, src] of CODE) {
      for (const forbidden of [
        '../events', '../replay', '../internal', '../provider', '../provider-runtime',
        '../market-data', '../execution-gate', '../proposal', '../reason-codes',
        '../contract-calendar', '../candle-aggregation', '../session-calendar',
      ]) {
        expect(src, `${name} imports ${forbidden}`).not.toContain(`'${forbidden}`)
      }
    }
  })
})

// ─── It records nothing to a journal and grants nothing ───────────────────────

describe('no journal, no authority', () => {
  it('emits no event and names no event vocabulary', () => {
    for (const [name, src] of CODE) {
      for (const forbidden of [
        'EVENT_TYPES', 'EVENT_ENTITY_TYPES', 'TradingEvent', 'toTradingEvent',
        'payloadVersion', 'occurredAt', 'recordedAt', 'causationId', 'correlationId', 'emit(',
      ]) {
        expect(src, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('uses no canonical ReasonCode vocabulary', () => {
    for (const [name, src] of CODE) {
      expect(src, `${name} reaches the reason registry`).not.toMatch(/reason-codes|\bReasonCode\b/)
      expect(src, `${name} emits a selection reason`).not.toContain('CONTRACT_SELECTED')
    }
  })

  it('issues no clearance, grant or intent', () => {
    const ISSUE = 'issue'
    for (const [name, src] of CODE) {
      for (const forbidden of [
        'RiskClearance', 'PropClearance', 'ApprovalGrant', 'ExecutionIntent', 'TradeProposal',
        `${ISSUE}RiskClearance`, 'openExecutionGate',
      ]) {
        expect(src, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('names no order, fill or position path', () => {
    const ORDER = 'Order'
    for (const [name, src] of CODE) {
      for (const forbidden of [`submit${ORDER}`, `place${ORDER}`, `cancel${ORDER}`, `${ORDER}Id`, 'FillId', 'PositionId']) {
        expect(src, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})

// ─── The locked store semantics ───────────────────────────────────────────────

describe('locked store semantics', () => {
  const store = () => executable(join(HERE, 'store.ts'))

  it('the refusal vocabulary is exactly the four canonical codes', () => {
    const src = store()
    expect(src).toContain('export const CONTRACT_SELECTION_STORE_REFUSALS = [')
    for (const code of [
      'DECISION_ID_DISAGREEMENT', 'OVERLAPPING_SELECTION_INTERVAL',
      'OPEN_ENDED_DECISION_UNSUPPORTED', 'INVALID_SELECTION_INTERVAL',
    ]) {
      expect(src, `missing ${code}`).toContain(`'${code}'`)
    }
    const block = src.slice(src.indexOf('CONTRACT_SELECTION_STORE_REFUSALS'))
    const list = block.slice(0, block.indexOf('] as const'))
    expect((list.match(/'[A-Z_]+'/g) ?? []).length, 'a fifth refusal appeared').toBe(4)
  })

  it('the v1 port exposes no decisionId lookup', () => {
    for (const [name, src] of CODE) {
      expect(src, `${name} exposes ${BY_DECISION_ID}`).not.toContain(BY_DECISION_ID)
    }
  })

  it('compares instants through toEpochMs, never lexically', () => {
    const src = store()
    expect(src).toContain('toEpochMs')
    // No direct relational comparison of Timestamp-bearing fields as text.
    for (const pattern of [
      /effectiveFrom\s*[<>]=?\s*[^ )]*effective/, /\.effectiveTo\s*[<>]=?\s*at\b/, /\bat\s*[<>]=?\s*\w+\.effective/,
    ]) {
      expect(src, `lexical comparison: ${pattern}`).not.toMatch(pattern)
    }
  })

  it('uses explicit field equality, never serialization or hashing', () => {
    const src = store()
    expect(src).toContain('function sameDecision')
    for (const forbidden of ['JSON.stringify', 'canonicalJson', 'createHash', 'sha256', 'toEqual']) {
      expect(src, `equality uses ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('the find path counts matches and fails closed above one', () => {
    const src = store()
    expect(src).toContain('matches.length === 0')
    expect(src).toContain('matches.length === 1')
    expect(src).toContain("outcome: 'INVARIANT_VIOLATION'")
    // It must not silently pick one of several.
    for (const forbidden of ['.sort(', 'matches.pop(', 'matches.shift(', 'matches.at(']) {
      expect(src, `find uses ${forbidden}`).not.toContain(forbidden)
    }
    // matches[0] is legitimate ONLY inside the exactly-one branch.
    const one = src.indexOf('matches.length === 1')
    const zeroIdx = src.indexOf('matches[0]')
    expect(zeroIdx, 'matches[0] is read outside the single-match branch').toBeGreaterThan(one)
  })

  it('stores the decision directly, with no wrapper fields', () => {
    const src = store()
    for (const forbidden of ['Envelope', 'runId', 'scenarioId', 'storageId', 'sequence', 'insertedAt']) {
      expect(src, `store grew a wrapper field ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('creates storage per factory invocation, never as a singleton', () => {
    const src = store()
    expect(src).toContain('export function createInMemoryContractSelectionDecisionStore')
    for (const forbidden of ['singleton', 'getInstance', 'sharedStore', 'globalThis']) {
      expect(src, `store names ${forbidden}`).not.toContain(forbidden)
    }
  })
})

// ─── Package boundary ─────────────────────────────────────────────────────────

describe('package boundary', () => {
  it('the root Trading barrel does not re-export this package', () => {
    const barrel = executable(join(TRADING_ROOT, 'index.ts'))
    expect(barrel).not.toContain('contract-selection-store')
    expect(barrel).not.toContain('createInMemoryContractSelectionDecisionStore')
    expect(barrel).not.toContain('CONTRACT_SELECTION_STORE_REFUSALS')
  })

  it('the barrel exports only this package own surface', () => {
    const idx = executable(join(HERE, 'index.ts'))
    for (const own of [
      'CONTRACT_SELECTION_STORE_REFUSALS', 'createInMemoryContractSelectionDecisionStore',
      'ContractSelectionDecisionStore', 'ContractSelectionStoreRefusal',
      'FindContractSelectionDecisionResult', 'RecordContractSelectionDecisionResult',
    ]) {
      expect(idx, `barrel omits ${own}`).toContain(own)
    }
    /*
     * Types owned by other packages are not re-exported here. Matched on a token
     * boundary, because `ContractSelectionDecisionStore` legitimately contains
     * `ContractSelectionDecision` — a substring check would fire on this
     * package's own exported port type.
     */
    for (const foreign of ['MarketInstrument', 'Timestamp', 'ContractSelectionDecision']) {
      const token = new RegExp(`\\b${foreign}\\b(?!Store)`)
      expect(idx, `barrel re-exports ${foreign}`).not.toMatch(token)
    }
  })

  it('the C3B.1 materializer package is untouched by this slice', () => {
    const decision = raw(join(TRADING_ROOT, 'contract-selection', 'decision.ts'))
    expect(decision).not.toContain('Store')
    expect(decision).not.toContain('record(')
  })
})
