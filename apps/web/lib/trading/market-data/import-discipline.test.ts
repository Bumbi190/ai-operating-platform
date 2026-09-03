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

  it('imports only the market-view sibling and the time primitives', () => {
    /*
     * `../time` joined the list in GATE-08C-2B.1, and only for `toEpochMs`.
     * It is a leaf module carrying no provider, network or authority reach, and
     * nothing else may be taken from it.
     */
    const siblings = new Set<string>()
    for (const file of PACKAGE_FILES) {
      for (const specifier of importSpecifiers(file)) {
        if (specifier.startsWith('../')) siblings.add(specifier)
      }
    }
    expect([...siblings].sort()).toEqual(['../market-view', '../time'])
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

  it('parses no date and constructs no Date of its own', () => {
    /*
     * The instant primitives live in `../time`, which owns the single parser.
     * A second one here would be a second definition of what an instant is.
     */
    for (const file of PACKAGE_FILES) {
      expect(code(file), `${file} parses a date`).not.toMatch(/Date\.parse|new Date\s*\(/)
    }
  })
})

// ─── GATE-08C-2B.1. Instants are compared as instants ────────────────────────

describe('candle instants are ordered and identified semantically, never as text', () => {
  /*
   * This replaces a guard that asserted the OPPOSITE — that instants are
   * "compared as text, not as parsed dates" — on the reasoning that a
   * fixed-width UTC ISO string sorts chronologically.
   *
   * That reasoning is false for this repository's `Timestamp` grammar, which
   * permits an optional millisecond field. `…00:00:00Z` and `…00:00:00.000Z`
   * are one instant written two ways, and `…00:00:00.500Z` is later than
   * `…00:00:00Z` while sorting before it, because '.' precedes 'Z'. The old
   * guard was locking in the defect it was meant to prevent.
   */
  it('orders no candle by comparing openTime as text', () => {
    for (const file of PACKAGE_FILES) {
      expect(code(file), `${file} orders instants as text`).not.toMatch(
        /\bopenTime\s*(<=|>=|<|>)/,
      )
    }
  })

  it('keys no instant lookup on Timestamp text', () => {
    /*
     * A string-keyed structure holding candles cannot collide two equivalent
     * serializations of one instant, so the same bar survives a merge twice.
     * The fixture generator's own `Map<string, …>` is keyed on an instrument
     * and timeframe, not on an instant, which is why the ban is written against
     * the candle association rather than against `Map<string` generally.
     */
    for (const file of PACKAGE_FILES) {
      expect(code(file), `${file} keys candles by text`).not.toMatch(
        /Map<\s*string\s*,\s*MarketCandle\s*>/,
      )
      expect(code(file), `${file} passes raw openTime as a lookup key`).not.toMatch(
        /\.(set|get|has|add)\(\s*[A-Za-z_$][\w$.]*\.openTime\b/,
      )
    }
  })

  it('the merge contract resolves instants through the canonical helper', () => {
    const merge = code(join(HERE, 'merge.ts'))
    expect(merge).toMatch(/from '\.\.\/time'/)
    expect(merge).toContain('toEpochMs(candles[i].openTime) <= toEpochMs(candles[i - 1].openTime)')
    expect(merge).toContain('new Map<number, MarketCandle>()')
    expect(merge).toContain('new Set<number>()')
  })

  it('POSITIVE CONTROL: the scan reads real source', () => {
    // Without this, a bug making `code()` return '' would leave the bans above
    // passing against nothing at all.
    expect(code(join(HERE, 'merge.ts'))).toContain('mergeOlderCandles')
    expect(code(join(HERE, 'merge.ts')).length).toBeGreaterThan(1_000)
  })

  it('the refusal vocabulary is unchanged by the hardening', () => {
    const merge = code(join(HERE, 'merge.ts'))
    expect(merge).toContain("'UNORDERED_INPUT'")
    expect(merge).toContain("'DUPLICATE_DISAGREEMENT'")
    // No third refusal was introduced. Scoped to the declaration itself, so
    // the outcome literals `MERGED` and `REFUSED` are not swept in.
    const declared = /MERGE_REFUSALS\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(merge)
    expect(declared).not.toBeNull()
    expect([...(declared as RegExpExecArray)[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])).toEqual([
      'UNORDERED_INPUT', 'DUPLICATE_DISAGREEMENT',
    ])
  })

  it('normalizes no Timestamp text and no price', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [/toISOString/, /timestampFrom/, /asTimestamp/, /normaliz/i]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
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
