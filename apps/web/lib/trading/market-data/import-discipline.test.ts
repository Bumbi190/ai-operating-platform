/**
 * Import discipline and boundaries for the market-data package.
 *
 * The claim worth protecting here is that this package is PROVIDER-NEUTRAL and
 * fetches nothing. A package that quietly grew a `fetch` or an endpoint would
 * still pass every behavioural test in `history.test.ts`, because those test the
 * state machine rather than what the source is allowed to reach.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const TRADING_ROOT = resolve(HERE, '..')

const PACKAGE_FILES = readdirSync(HERE)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => join(HERE, name))

/** Source with comments stripped — prose names the rules it must not be judged by. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function importSpecifiers(file: string): string[] {
  const text = code(file)
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[\s\S]*?\s*from\s+['"]([^'"]+)['"]/g
  return [...text.matchAll(pattern)].map((match) => match[1])
}

describe('the package has files to check', () => {
  it('found the implementation modules', () => {
    expect(PACKAGE_FILES.length).toBeGreaterThanOrEqual(4)
  })
})

describe('provider neutrality', () => {
  it('names no real provider, exchange or protocol', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [
        /rithmic/i, /tradovate/i, /projectx/i, /\bcme\b/i, /tradingview/i, /protobuf/i,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('makes no network call and names no endpoint', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [
        /\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/, /sendBeacon/, /\baxios\b/,
        /https?:\/\//,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('carries no credential or environment secret', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [/apiKey/, /api_key/, /process\.env/, /\bcredential/i, /\bsecret\b/i]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

describe('authority and order boundaries', () => {
  it('never reaches lib/trading/internal', () => {
    for (const file of PACKAGE_FILES) {
      for (const specifier of importSpecifiers(file)) {
        expect(specifier, `${file} imports ${specifier}`)
          .not.toMatch(/(^|\/)internal(\/|$)/)
      }
    }
  })

  it('names no authority constructor and no order path', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [
        /issueRiskClearance/, /issuePropClearance/, /issueApprovalGrant/,
        /createExecutionIntent/, /openExecutionGate/,
        /submitOrder/, /cancelOrder/, /modifyOrder/, /placeOrder/, /closePosition/,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('imports only the market-view sibling', () => {
    const siblings = new Set<string>()
    for (const file of PACKAGE_FILES) {
      for (const specifier of importSpecifiers(file)) {
        if (specifier.startsWith('../')) siblings.add(specifier)
      }
    }
    expect([...siblings].sort()).toEqual(['../market-view'])
  })
})

describe('GATE-08 stays open', () => {
  it('implements no contract resolution of any kind', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [
        /frontMonth/i, /rollover/i, /continuousContract/i, /monthCode/i,
        /startsWith\s*\(/, /new RegExp/,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

describe('exact prices never become numbers here', () => {
  it('performs no float conversion on candle data', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [
        /\bNumber\s*\(/, /\bparseFloat\s*\(/, /\bparseInt\s*\(/, /priceMagnitude/,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('compares instants as text, not as parsed dates', () => {
    for (const file of PACKAGE_FILES) {
      // `Date.parse` on a candle instant would be a numeric path on canonical data.
      expect(code(file), `${file} parses a date`).not.toMatch(/Date\.parse|new Date\s*\(/)
    }
  })
})

describe('determinism', () => {
  it('reads no clock and draws no random value', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [/Date\.now\s*\(/, /Math\.random\s*\(/, /randomUUID/]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

describe('the package is server and test side only', () => {
  it('is absent from the public @/lib/trading barrel', () => {
    const barrel = readFileSync(join(TRADING_ROOT, 'index.ts'), 'utf8')
    expect(barrel).not.toMatch(/market-data/)
  })
})
