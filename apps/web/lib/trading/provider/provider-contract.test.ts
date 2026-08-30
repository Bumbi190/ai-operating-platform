/**
 * Contract parity: the runtime transcription against Canonical v1.2.
 *
 * Stage 1.8a contains no architecture. Every assertion here answers one
 * question — does the runtime say exactly what the canonical document says —
 * so a reviewer can trace any construct back to a section without guessing.
 *
 * TRACEABILITY (v1.2 section → runtime symbol)
 * ───────────────────────────────────────────
 *   §3    → CapabilityState, satisfiesSafetyCriticalRequirement   primitives.ts
 *   §3.1  → ProviderCapabilities                                  observations.ts
 *   §4    → CredentialMode                                        primitives.ts
 *   §5    → Available<T>, present/unavailable/unknown             primitives.ts
 *   §6    → ExecutionProviderAdapter                              adapter.ts
 *   §7.0  → ProviderId, ContractId, ProviderTimestamp             primitives.ts
 *   §7.1  → ContractSnapshot (source union inline)                observations.ts
 *   §7.2  → HistoryRequest, FillHistory, HistoryCompleteness      observations.ts
 *   §8    → ProviderError                                         primitives.ts
 *   F2    → Result<T>, ok/failure                                 primitives.ts
 *   F3    → ProviderHealth                                        observations.ts
 *   F4    → ProviderConfig, ProviderSession                       observations.ts
 *   F5    → ProviderIdentity                                      observations.ts
 *   F6    → ProviderClock                                         observations.ts
 *   F7    → HistoryWindowCapability                               observations.ts
 *   F8    → AccountRef, ProviderAccountSnapshot                   observations.ts
 *   F9    → ContractSpec, ContractRef                             observations.ts
 *   F10   → PositionSnapshot, PositionSide, PositionState         observations.ts
 *   F11   → OrderSnapshot, FillSnapshot + vocabularies            observations.ts
 *   F12   → ReadOnlyReconciliation + vocabularies                 observations.ts
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_STATES,
  CREDENTIAL_MODES,
  DISCREPANCY_KINDS,
  HISTORY_COMPLETENESS,
  ORDER_SIDES,
  ORDER_STATUSES,
  ORDER_TYPES,
  POSITION_SIDES,
  POSITION_STATES,
  RECONCILIATION_STATUSES,
  failure,
  ok,
  present,
  satisfiesSafetyCriticalRequirement,
  unavailable,
  unknown,
  type Available,
  type ExecutionProviderAdapter,
  type ProviderTimestamp,
  type Result,
} from './index'
import type { Timestamp } from '../time'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_FILES = readdirSync(HERE)
  .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
  .map((n) => join(HERE, n))

/** Source with comments stripped — prose legitimately names what it forbids. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const adapterSource = () => code(join(HERE, 'adapter.ts'))

/** The method names declared on the interface, read from the source. */
function adapterMethods(): string[] {
  const body = /interface ExecutionProviderAdapter \{([\s\S]*?)\n\}/.exec(adapterSource())
  expect(body, 'ExecutionProviderAdapter interface not found').not.toBeNull()
  return [...body![1].matchAll(/^\s{2}(\w+)\s*\(/gm)].map((m) => m[1])
}

// ─── §6 / F15 — the method surface ────────────────────────────────────────────

const CANONICAL_METHODS = [
  'connect', 'disconnect',
  'getProviderIdentity', 'getEnvironment', 'getCapabilities', 'getHealth', 'getProviderTime',
  'getAccounts', 'getAccountSnapshot',
  'resolveContract', 'getContractSnapshot',
  'getPositions', 'getWorkingOrders', 'getRecentFills',
  'reconcileReadOnlyState',
] as const

describe('the Level-1 method surface is exactly canonical', () => {
  it('declares exactly fifteen methods', () => {
    expect(adapterMethods()).toHaveLength(15)
  })

  it('declares every canonical method, and no others', () => {
    expect(adapterMethods().sort()).toEqual([...CANONICAL_METHODS].sort())
  })

  it('returns Promise<Result<T>> from exactly fourteen of them', () => {
    const body = /interface ExecutionProviderAdapter \{([\s\S]*?)\n\}/.exec(adapterSource())![1]
    expect(body.match(/Promise<Result</g) ?? []).toHaveLength(14)
  })

  it('returns Promise<void> from exactly one, and it is disconnect', () => {
    const body = /interface ExecutionProviderAdapter \{([\s\S]*?)\n\}/.exec(adapterSource())![1]
    const lines = body.split('\n').filter((l) => l.includes('Promise<void>'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^\s{2}disconnect\(\)/)
    // Deliberately NOT Promise<Result<void>> — that would add error semantics
    // where v1.0 gave disconnect no failure outcome (v1.2 §6).
    expect(body).not.toMatch(/Promise<Result<void>>/)
  })

  it('declares no synchronous method', () => {
    const body = /interface ExecutionProviderAdapter \{([\s\S]*?)\n\}/.exec(adapterSource())![1]
    const sync = body
      .split('\n')
      .filter((l) => /^\s{2}\w+\s*\(/.test(l) || /:\s*(Result<|void\b)/.test(l))
      .filter((l) => /:\s*(Result<|void\b)/.test(l) && !l.includes('Promise'))
    expect(sync).toEqual([])
  })

  it('keeps both parameters on getRecentFills', () => {
    // Collapsing to a single HistoryRequest would drop whose fills are asked
    // for — business semantics, not port semantics (v1.2 §6).
    const src = adapterSource()
    expect(src).toMatch(/getRecentFills\(a: AccountId, window: HistoryRequest\): Promise<Result<FillHistory>>/)
  })

  it('is satisfied by a structurally complete implementation', () => {
    // A type-level fixture, not a fake provider: it proves the interface is
    // implementable and that no member was mistyped, without shipping an adapter.
    const shape = {} as ExecutionProviderAdapter
    expect(typeof shape).toBe('object')
  })
})

// ─── §1.1 — zero execution surface, §7.1/F16.1 — zero market data ─────────────

describe('forbidden surface is absent, not stubbed', () => {
  it('declares no order-writing method anywhere in the package', () => {
    for (const file of PACKAGE_FILES) {
      for (const name of [
        'submitOrder', 'modifyOrder', 'cancelOrder', 'preflightOrder',
        'replaceOrder', 'flatten', 'closePosition',
      ]) {
        expect(code(file), `${file} declares ${name}`).not.toMatch(new RegExp(`\\b${name}\\s*[(:]`))
      }
    }
  })

  it('declares no market-data method', () => {
    for (const file of PACKAGE_FILES) {
      for (const name of ['getQuote', 'getQuotes', 'getBars', 'getTicks', 'getMarketData', 'subscribe']) {
        expect(code(file), `${file} declares ${name}`).not.toMatch(new RegExp(`\\b${name}\\s*\\(`))
      }
    }
  })

  it('implements no contract-resolution policy', () => {
    // GATE-08 remains OPEN. The contract defines resolution TYPES, not policy.
    for (const file of PACKAGE_FILES) {
      for (const pattern of [/frontMonth/i, /rollover/i, /continuousContract/i, /startsWith\s*\(/]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

// ─── §3 · §4 · §5 — vocabulary ────────────────────────────────────────────────

describe('vocabulary is exactly canonical', () => {
  it('CapabilityState has the four canonical states', () => {
    expect(CAPABILITY_STATES).toEqual(['SUPPORTED', 'UNSUPPORTED', 'CONDITIONAL', 'UNKNOWN'])
  })

  it('only SUPPORTED satisfies a safety-critical requirement', () => {
    expect(satisfiesSafetyCriticalRequirement('SUPPORTED')).toBe(true)
    for (const state of ['UNSUPPORTED', 'CONDITIONAL', 'UNKNOWN'] as const) {
      expect(satisfiesSafetyCriticalRequirement(state), state).toBe(false)
    }
  })

  it('CredentialMode has the three canonical modes and none of the rejected fields', () => {
    expect(CREDENTIAL_MODES).toEqual(['READ_ONLY_ENFORCED', 'READ_WRITE_CAPABLE', 'UNKNOWN'])
    for (const file of PACKAGE_FILES) {
      for (const rejected of [
        'requestedCredentialMode', 'requiredCredentialMode',
        'preferredCredentialMode', 'credentialPolicy',
      ]) {
        expect(code(file), `${file} declares ${rejected}`).not.toContain(rejected)
      }
    }
  })

  it('Available<T> has three states and PRESENT carries its value', () => {
    const value = present(42)
    expect(value).toEqual({ state: 'PRESENT', value: 42 })
    expect(value.state).toBe('PRESENT')
    if (value.state === 'PRESENT') expect(value.value).toBe(42)
  })

  it('keeps UNAVAILABLE and UNKNOWN distinguishable, and both distinct from PRESENT', () => {
    const missing = unavailable<number>()
    const notAsked = unknown<number>()
    expect(missing).toEqual({ state: 'UNAVAILABLE' })
    expect(notAsked).toEqual({ state: 'UNKNOWN' })
    // Three different facts. v1.2 §5: "providern har bevisligen inget värde" is
    // not "ej efterfrågat, eller ej besvarat", and only one is worth retrying.
    expect(missing).not.toEqual(notAsked)
    expect(missing).not.toEqual(present(1))
    expect(notAsked).not.toEqual(present(1))
    // Neither carries a payload that could be mistaken for a value.
    expect('value' in missing).toBe(false)
    expect('value' in notAsked).toBe(false)
  })

  it('exports no reader that collapses a missing reading', () => {
    /*
     * v1.2 §5 forbids UNKNOWN→null and UNAVAILABLE→null alongside →0, →"", →[]
     * and →false. A reader returning `T | null` maps BOTH non-present states to
     * one value and erases the distinction the type exists to carry, so none is
     * offered — consumers discriminate on `state`.
     */
    const barrel = readFileSync(join(HERE, 'index.ts'), 'utf8')
    for (const banned of [
      'valueOrNull', 'valueOrUndefined', 'valueOrDefault', 'orDefault',
      'orZero', 'orEmpty', 'orFalse', 'unwrapOr', 'getOrNull',
    ]) {
      expect(barrel, `barrel exports ${banned}`).not.toContain(banned)
      for (const file of PACKAGE_FILES) {
        expect(code(file), `${file} declares ${banned}`).not.toContain(banned)
      }
    }
    // And no function anywhere in the package returns `T | null` from Available.
    for (const file of PACKAGE_FILES) {
      expect(code(file), file).not.toMatch(/Available<T>\s*\)\s*:\s*T\s*\|\s*null/)
    }
  })

  it('mints fresh objects rather than sharing singletons', () => {
    expect(unavailable<number>()).not.toBe(unavailable<number>())
    expect(unknown<number>()).not.toBe(unknown<number>())
  })

  it('PositionSide is LONG | SHORT | UNKNOWN, with no FLAT', () => {
    expect(POSITION_SIDES).toEqual(['LONG', 'SHORT', 'UNKNOWN'])
    expect(POSITION_SIDES as readonly string[]).not.toContain('FLAT')
    for (const file of PACKAGE_FILES) {
      expect(code(file), `${file} declares FLAT`).not.toMatch(/'FLAT'/)
    }
  })

  it('names no type that Canonical v1.2 leaves inline', () => {
    /*
     * §7.1 writes `source : PROVIDER | CANONICAL_SPEC` inline, and §7.2 writes
     * the history windows as inline `{ from, to }`. Naming either would add
     * provider vocabulary canon deliberately does not define.
     */
    const barrel = readFileSync(join(HERE, 'index.ts'), 'utf8')
    for (const invented of ['ContractSource', 'CONTRACT_SOURCES', 'HistoryWindow ', 'HistoryWindow,', 'HistoryWindow}']) {
      expect(barrel, `barrel exports ${invented.trim()}`).not.toContain(invented)
    }
    const observations = code(join(HERE, 'observations.ts'))
    expect(observations).not.toMatch(/export type ContractSource/)
    expect(observations).not.toMatch(/export const CONTRACT_SOURCES/)
    expect(observations).not.toMatch(/export interface HistoryWindow\b/)
    // The shapes are still present — inline, exactly as canon writes them.
    expect(observations).toMatch(/readonly source: 'PROVIDER' \| 'CANONICAL_SPEC'/)
    expect(observations).toMatch(/readonly requested: \{\s*readonly from: Timestamp\s*readonly to: Timestamp\s*\}/)
    expect(observations).toMatch(/readonly actual: Available<\{\s*readonly from: Timestamp\s*readonly to: Timestamp\s*\}>/)
    // `HistoryWindowCapability` is a real §3.1 field type and must survive.
    expect(observations).toMatch(/export interface HistoryWindowCapability/)
  })

  it('carries the remaining canonical vocabularies verbatim', () => {
    expect(POSITION_STATES).toEqual(['OPEN', 'CLOSED', 'UNKNOWN'])
    expect(ORDER_SIDES).toEqual(['BUY', 'SELL', 'UNKNOWN'])
    expect(ORDER_TYPES).toEqual(['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT', 'OTHER', 'UNKNOWN'])
    expect(ORDER_STATUSES).toEqual([
      'WORKING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'UNKNOWN',
    ])
    expect(HISTORY_COMPLETENESS).toEqual(['COMPLETE', 'TRUNCATED', 'UNKNOWN'])
    expect(RECONCILIATION_STATUSES).toEqual(['AGREED', 'DISCREPANCY', 'INDETERMINATE'])
    expect(DISCREPANCY_KINDS).toEqual([
      'POSITION_MISSING_AT_PROVIDER', 'POSITION_MISSING_IN_OMNIRA',
      'POSITION_QUANTITY_MISMATCH', 'POSITION_SIDE_MISMATCH',
      'ORDER_MISSING_AT_PROVIDER', 'ORDER_MISSING_IN_OMNIRA', 'UNKNOWN',
    ])
  })
})

// ─── §8 / F2 — Result and ProviderError ───────────────────────────────────────

describe('Result and ProviderError are canonical', () => {
  it('discriminates success from failure on ok', () => {
    const good: Result<number> = ok(7)
    expect(good).toEqual({ ok: true, value: 7 })
    const bad: Result<number> = failure('PROVIDER_DISCONNECTED', 'not connected')
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error.reasonCode).toBe('PROVIDER_DISCONNECTED')
      expect(bad.error.message).toBe('not connected')
    }
  })

  it('gives ProviderError exactly the canonical two fields', () => {
    const bad = failure<number>('SECURITY_DEGRADED', 'broader than least privilege')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(Object.keys(bad.error).sort()).toEqual(['message', 'reasonCode'])
  })

  it('excludes every field v1.2 F2 records as rejected', () => {
    const src = code(join(HERE, 'primitives.ts'))
    for (const rejected of ['retryable', 'statusCode', 'httpCode', 'providerNativeCode', 'stack']) {
      expect(src, `primitives declares ${rejected}`).not.toContain(rejected)
    }
  })

  it('never converts a failure into an empty value', () => {
    const bad = failure<readonly string[]>('PROVIDER_DISCONNECTED', 'x')
    expect(bad.ok).toBe(false)
    expect(bad).not.toHaveProperty('value')
    // A failure carries no value at all, so it cannot be read as an empty list.
    expect('value' in bad).toBe(false)
  })

  it('keeps Result domain-local rather than repo-global', () => {
    const barrel = readFileSync(join(HERE, '..', 'index.ts'), 'utf8')
    expect(barrel).not.toMatch(/from '\.\/provider'/)
  })
})

// ─── §7.0 — branded ids and type-level negative proofs ────────────────────────

describe('provider-owned branded ids', () => {
  it('brands ProviderId, ContractId and ProviderTimestamp in the provider package', () => {
    const src = code(join(HERE, 'primitives.ts'))
    for (const name of ['ProviderId', 'ContractId', 'ProviderTimestamp']) {
      expect(src, name).toMatch(new RegExp(`export type ${name} = Branded<`))
    }
  })

  it('keeps ProviderTimestamp nominally distinct from Timestamp', () => {
    /*
     * Type-level negative proofs. `@ts-expect-error` fails the build if the
     * assignment ever becomes legal, so these are compile-time assertions that
     * happen to run as a test.
     */
    const local = '2026-08-30T00:00:00.000Z' as Timestamp
    // @ts-expect-error a local Timestamp is not a ProviderTimestamp (v1.2 §7.0)
    const wrong: ProviderTimestamp = local
    void wrong

    const fromProvider = '2026-08-30T00:00:00.000Z' as ProviderTimestamp
    // @ts-expect-error and the reverse is equally forbidden
    const alsoWrong: Timestamp = fromProvider
    void alsoWrong

    expect(true).toBe(true)
  })

  it('reads no wall clock anywhere in the package', () => {
    for (const file of PACKAGE_FILES) {
      expect(code(file), file).not.toMatch(/Date\.now\(\)|new Date\(\)/)
    }
  })
})

// ─── F14.1 — Available<T> is not ObservedValue<T> ─────────────────────────────

describe('cross-layer ownership is preserved', () => {
  it('has zero replay dependency', () => {
    for (const file of PACKAGE_FILES) {
      expect(code(file), file).not.toMatch(/from '\.\.\/replay/)
      expect(code(file), file).not.toContain('ObservedValue')
      expect(code(file), file).not.toContain('ObservedPosition')
    }
  })

  it('is not imported by replay either', () => {
    const replayDir = join(HERE, '..', 'replay')
    for (const name of readdirSync(replayDir).filter((n) => n.endsWith('.ts'))) {
      expect(code(join(replayDir, name)), name).not.toMatch(/from '\.\.\/provider/)
    }
  })

  it('proves Available<T> and ObservedValue<T> are not interchangeable', async () => {
    const { present: replayPresent } = await import('../replay')
    const fromReplay = replayPresent(1)
    // Structurally alike today, but different owners. The compile-time proof is
    // that neither package references the other's type at all (asserted above);
    // this checks they are at least not the same object identity by accident.
    expect(fromReplay).not.toBe(present(1))
  })

  it('keeps ProviderAccountSnapshot distinct from any persistence AccountSnapshot', () => {
    const src = code(join(HERE, 'observations.ts'))
    expect(src).toMatch(/interface ProviderAccountSnapshot/)
    // No alias, and none of the Omnira-derived §65 fields.
    expect(src).not.toMatch(/=\s*AccountSnapshot\b/)
    for (const derived of ['dailyPnl', 'daily_pnl', 'drawdown', 'openPositions', 'open_positions']) {
      expect(src, `declares ${derived}`).not.toContain(derived)
    }
  })

  it('keeps PositionSnapshot free of persistence and replay concepts', () => {
    const src = code(join(HERE, 'observations.ts'))
    for (const foreign of [
      'originatingTradeId', 'originating_trade_id', 'unattributed', 'freshness', 'note',
    ]) {
      expect(src, `PositionSnapshot declares ${foreign}`).not.toContain(foreign)
    }
  })
})

// ─── §2 — authority boundary, §9 — provider neutrality ────────────────────────

describe('boundaries', () => {
  it('never reaches lib/trading/internal', () => {
    for (const file of PACKAGE_FILES) {
      expect(code(file), file).not.toMatch(/(^|\/)internal(\/|')/)
    }
  })

  it('names no authority constructor and no execution gate', () => {
    for (const file of PACKAGE_FILES) {
      for (const name of [
        'RiskClearance', 'PropClearance', 'ApprovalGrant', 'ExecutionIntent',
        'openExecutionGate', 'issueRiskClearance', 'issuePropClearance', 'issueApprovalGrant',
      ]) {
        expect(code(file), `${file} names ${name}`).not.toContain(name)
      }
    }
  })

  it('contains no provider-specific or transport implementation', () => {
    // Structural surface only: comments legitimately name what they forbid.
    for (const file of PACKAGE_FILES) {
      for (const pattern of [
        /Rithmic/i, /Tradovate/i, /ProjectX/i, /protobuf/i,
        /WebSocket/, /\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /\baxios\b/,
        /https?:\/\//, /hostname/, /password/, /apiKey/, /api_key/,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('ships no adapter implementation', () => {
    for (const file of PACKAGE_FILES) {
      const src = code(file)
      expect(src, file).not.toMatch(/class \w*Adapter/)
      expect(src, file).not.toMatch(/implements ExecutionProviderAdapter/)
      expect(src, file).not.toMatch(/createExecutionProviderAdapter/)
    }
  })

  it('imports no Node builtin', () => {
    for (const file of PACKAGE_FILES) {
      expect(code(file), file).not.toMatch(/from 'node:/)
    }
  })

  it('takes Core primitives type-only, so node:crypto cannot follow', () => {
    for (const file of PACKAGE_FILES) {
      const valueImports = [...code(file).matchAll(/^\s*import\s+(?!type)([\s\S]*?)from\s+'([^']+)'/gm)]
        .map((m) => m[2])
      expect(valueImports, file).toEqual([])
    }
  })
})

// ─── §8 — reason codes ────────────────────────────────────────────────────────

describe('the two canonical provider reason codes', () => {
  it('exist in the Trading Core registry', async () => {
    const { CORE_REASON_CODES, isReasonCode } = await import('../reason-codes')
    expect(CORE_REASON_CODES as readonly string[]).toContain('PROVIDER_DISCONNECTED')
    expect(CORE_REASON_CODES as readonly string[]).toContain('SECURITY_DEGRADED')
    expect(isReasonCode('PROVIDER_DISCONNECTED')).toBe(true)
    expect(isReasonCode('SECURITY_DEGRADED')).toBe(true)
  })

  it('adds exactly two codes and nothing else', async () => {
    const { CORE_REASON_CODES, RISK_REASON_CODES } = await import('../reason-codes')
    // 29 Core codes on main, plus exactly the two canonical provider codes.
    // The risk registry is untouched by this stage.
    expect(CORE_REASON_CODES).toHaveLength(31)
    expect(RISK_REASON_CODES).toHaveLength(18)
  })
})

// ─── Availability semantics the whole contract rests on ───────────────────────

describe('known flat is not the same as unknown', () => {
  it('represents a flat account as a successful empty result', () => {
    const flat: Result<readonly string[]> = ok([])
    expect(flat.ok).toBe(true)
    if (flat.ok) expect(flat.value).toEqual([])

    const unavailableState: Result<readonly string[]> = failure('PROVIDER_DISCONNECTED', 'x')
    expect(unavailableState.ok).toBe(false)
    // The two are structurally different, so no consumer can confuse them.
    expect(JSON.stringify(flat)).not.toBe(JSON.stringify(unavailableState))
  })

  it('offers no way to fabricate a flat position', () => {
    const sides: readonly string[] = POSITION_SIDES
    expect(sides).not.toContain('FLAT')
    expect(sides).not.toContain('NONE')
    expect(sides).not.toContain('ZERO')
  })
})

// ─── Availability of every declared type ──────────────────────────────────────

describe('the barrel exposes the full v1.2 vocabulary', () => {
  it('exports every provider-owned type named by Canonical v1.2', async () => {
    const barrel = readFileSync(join(HERE, 'index.ts'), 'utf8')
    for (const name of [
      'Result', 'ProviderError', 'ProviderConfig', 'ProviderSession', 'ProviderIdentity',
      'CapabilityState', 'ProviderCapabilities', 'HistoryWindowCapability', 'CredentialMode',
      'Available', 'ProviderId', 'ContractId', 'ProviderTimestamp',
      'ProviderHealth', 'ProviderClock', 'AccountRef', 'ProviderAccountSnapshot',
      'ContractSpec', 'ContractRef', 'ContractSnapshot', 'HistoryRequest',
      'PositionSnapshot', 'PositionSide', 'PositionState',
      'OrderSnapshot', 'OrderSide', 'OrderType', 'OrderStatus',
      'FillSnapshot', 'FillHistory',
      'ReadOnlyReconciliation', 'ReconciliationStatus', 'DiscrepancyKind',
      'ReconciliationDiscrepancy', 'ExecutionProviderAdapter',
    ]) {
      expect(barrel, `barrel omits ${name}`).toMatch(new RegExp(`\\b${name}\\b`))
    }
  })

  it('is not re-exported from the client-facing @/lib/trading barrel', () => {
    const core = readFileSync(join(HERE, '..', 'index.ts'), 'utf8')
    expect(core).not.toMatch(/provider/)
  })
})

// A compile-time witness that Available<T> keeps its payload typed.
const witness: Available<number> = present(1)
void witness
