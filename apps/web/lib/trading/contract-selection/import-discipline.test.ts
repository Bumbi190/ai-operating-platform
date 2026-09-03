/**
 * Import discipline and boundaries for the contract-selection package.
 *
 * The claims worth protecting here are not behavioural. A package that grew a
 * clock, a provider import or a journal write would still pass every assertion
 * in `decision.test.ts`, because those test what the materializer RETURNS, not
 * what it is allowed to reach.
 *
 * Several forbidden identifiers are assembled from fragments below, so this
 * file never contains the literals it forbids. Without that, the guards would
 * match their own source and the only remaining fix would be to stop scanning
 * this file.
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
  return [...source.matchAll(pattern)].map((match) => match[1])
}

/*
 * Assembled from fragments so this file never contains the literals it forbids.
 */
const RESOLVE = 'resolve'
const CONTRACT = 'Contract'
const RESOLVER_CALL = `${RESOLVE}${CONTRACT}At`
const CALENDAR_TYPE = `${CONTRACT}Calendar`
const NEW_ID = `new${'Id'}`
const RANDOM_UUID = `random${'UUID'}`

// ─── The scan reads real source ───────────────────────────────────────────────

describe('the package has files to check', () => {
  it('POSITIVE CONTROL: found the production modules', () => {
    expect(PRODUCTION).toEqual(['decision.ts', 'index.ts'])
  })

  it('POSITIVE CONTROL: the scan reads real, substantial source', () => {
    const decision = executable(join(HERE, 'decision.ts'))
    expect(decision).toContain('export function materializeContractSelectionDecision')
    expect(decision).toContain('export interface ContractSelectionDecision')
    expect(decision.length).toBeGreaterThan(1_000)
  })

  it('POSITIVE CONTROL: comment stripping actually removes prose', () => {
    const decision = join(HERE, 'decision.ts')
    // The header prose names the resolver it must never call.
    expect(raw(decision)).toContain(RESOLVER_CALL)
    expect(executable(decision)).not.toContain(RESOLVER_CALL)
  })
})

// ─── It does not select ───────────────────────────────────────────────────────

describe('materialisation never re-selects', () => {
  it('never calls the resolver', () => {
    for (const [name, src] of CODE) {
      expect(src, `${name} calls the resolver`).not.toContain(RESOLVER_CALL)
    }
  })

  it('never consults a calendar', () => {
    for (const [name, src] of CODE) {
      expect(src, `${name} names the calendar type`).not.toContain(CALENDAR_TYPE)
      expect(src, `${name} builds a calendar`).not.toContain(`build${CALENDAR_TYPE}`)
    }
  })

  it('imports from contract-calendar for a TYPE only', () => {
    for (const [name, src] of CODE) {
      const specifiers = importSpecifiers(src).filter((s) => s.includes('contract-calendar'))
      for (const specifier of specifiers) {
        const clause = new RegExp(
          `(?:import|export)\\s+type\\s+[\\s\\S]*?from\\s+['"]${specifier.replace('.', '\\.')}['"]`,
        )
        expect(src, `${name} imports ${specifier} as a value`).toMatch(clause)
      }
    }
  })

  it('branches on no resolution outcome at runtime', () => {
    for (const [name, src] of CODE) {
      expect(src, `${name} branches on outcome`).not.toMatch(/\.outcome\s*===/)
      expect(src, `${name} switches on outcome`).not.toMatch(/switch\s*\(\s*\w+\.outcome/)
      expect(src, `${name} names a refusal`).not.toContain('REFUSED')
      expect(src, `${name} names a refusal code`).not.toContain('NO_AUTHORITATIVE_COVERAGE')
    }
  })
})

// ─── It reads no clock and mints no identity ──────────────────────────────────

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

  it('reads no environment or configuration', () => {
    for (const [name, src] of CODE) {
      for (const pattern of [/process\s*\.\s*env/, /import\.meta\.env/, /\bdotenv\b/]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

// ─── It reaches nothing outside the domain ────────────────────────────────────

describe('the package reaches nothing external', () => {
  it('makes no network call and names no endpoint', () => {
    for (const [name, src] of CODE) {
      for (const pattern of [
        /\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/, /sendBeacon/, /\baxios\b/, /https?:\/\//,
      ]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('touches no database or persistence', () => {
    for (const [name, src] of CODE) {
      for (const pattern of [
        /supabase/i, /\bpostgres\b/i, /\bprisma\b/i, /\bSELECT\s+/i, /\bINSERT\s+INTO\b/i,
        /localStorage/, /\bredis\b/i,
      ]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('names no provider, exchange or protocol', () => {
    for (const [name, src] of CODE) {
      for (const pattern of [
        /rithmic/i, /tradovate/i, /projectx/i, /tradingview/i, /protobuf/i,
        /providerContractId/, /providerSymbol/, /frontMonth/, /monthCode/,
        /openInterest/, /continuousContract/,
      ]) {
        expect(src, `${name} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('imports only the permitted domain siblings', () => {
    const ALLOWED = new Set([
      '../contract-calendar', '../contract-identity', '../ids',
      '../market-instrument', '../reason-codes', '../time', './decision',
    ])
    for (const [name, src] of CODE) {
      for (const specifier of importSpecifiers(src)) {
        if (specifier.startsWith('node:')) {
          expect.fail(`${name} imports ${specifier}; this package needs no Node built-in`)
        }
        expect(ALLOWED.has(specifier), `${name} imports ${specifier}`).toBe(true)
      }
    }
  })

  it('reaches no journal, replay, provider or authority package', () => {
    for (const [name, src] of CODE) {
      for (const forbidden of [
        '../events', '../replay', '../internal', '../provider', '../provider-runtime',
        '../provider-normalization', '../market-data', '../execution-gate', '../proposal',
        '../risk', '../prop', '../candle-aggregation', '../session-calendar',
      ]) {
        expect(src, `${name} imports ${forbidden}`).not.toContain(`'${forbidden}`)
      }
    }
  })
})

// ─── It records nothing and grants nothing ────────────────────────────────────

describe('no journal, no authority', () => {
  it('writes no journal and names no event type', () => {
    for (const [name, src] of CODE) {
      for (const forbidden of [
        'EVENT_TYPES', 'TradingEvent', 'toTradingEvent', 'payloadVersion',
        'occurredAt', 'recordedAt', 'causationId', 'CONTRACT_SELECTION_RECORDED',
      ]) {
        expect(src, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('coins no event type from the canonical reason code', () => {
    /*
     * `CONTRACT_SELECTED` cannot be forbidden as a substring: it is the prefix
     * of the legitimate reason code. So assert instead that the ONLY token
     * beginning that way is the canonical code itself — an event type named
     * CONTRACT_SELECTED, or CONTRACT_SELECTED_V2, would be caught.
     */
    for (const [name, src] of CODE) {
      const tokens = [...src.matchAll(/CONTRACT_SELECTED[A-Z0-9_]*/g)].map((m) => m[0])
      for (const token of tokens) {
        expect(token, `${name} coins ${token}`).toBe('CONTRACT_SELECTED_BY_CANONICAL_CALENDAR')
      }
    }
  })

  it('implements no store, repository or recorded-decision lookup', () => {
    for (const [name, src] of CODE) {
      for (const forbidden of [
        'DecisionStore', 'recordDecision', 'readDecision', 'findDecision', 'Repository', 'persist',
      ]) {
        expect(src, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('issues no clearance, grant or intent', () => {
    const ISSUE = 'issue'
    for (const [name, src] of CODE) {
      for (const forbidden of [
        'RiskClearance', 'PropClearance', 'ApprovalGrant', 'ExecutionIntent',
        `${ISSUE}RiskClearance`, `${ISSUE}PropClearance`, 'openExecutionGate',
      ]) {
        expect(src, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('names no order path', () => {
    const ORDER = 'Order'
    for (const [name, src] of CODE) {
      for (const forbidden of [`submit${ORDER}`, `place${ORDER}`, `cancel${ORDER}`, `${ORDER}Id`]) {
        expect(src, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('starts no source-result or live-source work', () => {
    for (const [name, src] of CODE) {
      for (const forbidden of [
        'HistoryPage', 'HistoricalContractCandleSource', 'LiveCandleSource',
        'AsyncIterable', 'subscribe', 'backpressure', 'cursor', 'pagination',
      ]) {
        expect(src, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})

// ─── The locked canonical values ──────────────────────────────────────────────

describe('locked canonical values', () => {
  it('the policy literal appears exactly once in production source', () => {
    const occurrences = CODE.reduce(
      (total, [, src]) => total + src.split('market-data-contract-lifecycle-v1.0').length - 1,
      0,
    )
    expect(occurrences).toBe(1)
  })

  it('the policy version is a locked constant, never a lookup', () => {
    const decision = executable(join(HERE, 'decision.ts'))
    expect(decision).toContain(
      "export const CONTRACT_SELECTION_POLICY_VERSION = 'market-data-contract-lifecycle-v1.0' as const",
    )
    for (const alias of ['latest', 'current', 'head', 'stable']) {
      expect(decision, `policy version resolves the alias ${alias}`).not.toContain(`'${alias}'`)
    }
  })

  it('policyVersion is never a caller input', () => {
    const decision = executable(join(HERE, 'decision.ts'))
    const input = decision.slice(
      decision.indexOf('interface MaterializeContractSelectionDecisionInput'),
    )
    const body = input.slice(0, input.indexOf('}'))
    for (const forbidden of [
      'policyVersion', 'evidence', 'reasons', 'calendarVersion', 'effectiveFrom', 'effectiveTo',
      'resolvedContract', 'root',
    ]) {
      expect(body, `the input surface exposes ${forbidden}`).not.toContain(forbidden)
    }
    for (const required of ['resolution', 'decisionId', 'decidedAt']) {
      expect(body, `the input surface is missing ${required}`).toContain(required)
    }
  })

  it('evidence has no non-empty vocabulary', () => {
    const decision = executable(join(HERE, 'decision.ts'))
    expect(decision).toContain('export type ContractEvidence = never')
    for (const forbidden of [
      'ContractEvidenceKind', 'EVIDENCE_KINDS', 'FRONT_MONTH', 'OPEN_INTEREST', 'VOLUME_OBSERVED',
    ]) {
      expect(decision, `evidence grew ${forbidden}`).not.toContain(forbidden)
    }
    expect(decision, 'evidence became an open record').not.toMatch(
      /ContractEvidence\s*=\s*(?:unknown|any|Record\s*<)/,
    )
  })

  it('the canonical reason is emitted by the materializer, not accepted from a caller', () => {
    const decision = executable(join(HERE, 'decision.ts'))
    expect(decision).toContain("reason('CONTRACT_SELECTED_BY_CANONICAL_CALENDAR')")
    // Exactly one reason is constructed.
    expect(decision.split("reason('").length - 1).toBe(1)
  })
})

// ─── Package boundary ─────────────────────────────────────────────────────────

describe('package boundary', () => {
  it('the root Trading barrel does not re-export this package', () => {
    const barrel = executable(join(TRADING_ROOT, 'index.ts'))
    expect(barrel).not.toContain('contract-selection')
    expect(barrel).not.toContain('materializeContractSelectionDecision')
    expect(barrel).not.toContain('CONTRACT_SELECTION_POLICY_VERSION')
    expect(barrel).not.toContain('ContractSelectionDecision,')
  })

  it('the root barrel does export the central identity type', () => {
    expect(executable(join(TRADING_ROOT, 'index.ts'))).toContain('ContractSelectionDecisionId')
  })

  it('the identity is registered in the central TradingId vocabulary', () => {
    const ids = executable(join(TRADING_ROOT, 'ids.ts'))
    expect(ids).toContain(
      "export type ContractSelectionDecisionId = Branded<string, 'ContractSelectionDecisionId'>",
    )
    expect(ids).toContain('| ContractSelectionDecisionId')
  })

  it('ids.ts grew no bespoke minting function', () => {
    const ids = executable(join(TRADING_ROOT, 'ids.ts'))
    expect(ids).not.toContain('ContractSelectionDecisionId()')
    expect(ids).not.toMatch(/function\s+newContractSelectionDecisionId/)
  })

  it('the resolver and calendar are byte-untouched by this slice', () => {
    // Their purity is the reason materialisation lives in a separate package.
    const resolver = raw(join(TRADING_ROOT, 'contract-calendar', 'resolver.ts'))
    expect(resolver).not.toContain('ContractSelectionDecision')
    expect(resolver).not.toContain('decisionId')
    expect(resolver).not.toContain('reason-codes')
    const calendar = raw(join(TRADING_ROOT, 'contract-calendar', 'calendar.ts'))
    expect(calendar).not.toContain('ContractSelectionDecision')
    expect(calendar).not.toContain('decisionId')
  })
})
