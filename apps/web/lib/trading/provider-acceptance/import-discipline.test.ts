/**
 * Import discipline and structural boundaries for the acceptance package.
 *
 * Structural absence tests are used only where a runtime behaviour cannot
 * express the claim — an order method that does not exist has no behaviour to
 * observe, and neither does a network call that is never made. Everything that
 * CAN be tested behaviourally is tested behaviourally, in `checks.test.ts` and
 * the acceptance suite, rather than by matching source prose.
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

describe('the acceptance package has files to check', () => {
  it('found the implementation modules', () => {
    expect(PACKAGE_FILES.length).toBeGreaterThanOrEqual(4)
  })
})

describe('authority boundary', () => {
  it('never reaches lib/trading/internal, in any form', () => {
    for (const file of PACKAGE_FILES) {
      for (const specifier of importSpecifiers(file)) {
        expect(specifier, `${file} imports ${specifier}`)
          .not.toMatch(/(^|\/)internal(\/|$)/)
      }
    }
  })

  it('names no authority constructor', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [
        /issueRiskClearance/, /issuePropClearance/, /issueApprovalGrant/,
        /createExecutionIntent/, /riskClearanceOf/, /openExecutionGate/,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('imports only the sibling packages it bridges', () => {
    const siblings = new Set<string>()
    for (const file of PACKAGE_FILES) {
      for (const specifier of importSpecifiers(file)) {
        if (specifier.startsWith('../')) siblings.add(specifier)
      }
    }
    expect([...siblings].sort()).toEqual([
      '../decimal', '../ids', '../market-view', '../provider',
      '../provider-normalization', '../replay',
    ])
  })
})

describe('no order path exists in the acceptance surface', () => {
  it('names no execution method', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [
        /submitOrder/, /modifyOrder/, /cancelOrder/, /placeOrder/, /sendOrder/,
        /preflightOrder/, /createOrder/, /replaceOrder/, /closePosition/,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

describe('no provider protocol, network or credential', () => {
  it('names no real provider or protocol', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [/rithmic/i, /tradovate/i, /projectx/i, /protobuf/i]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('makes no network call', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [
        /\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/, /sendBeacon/, /\baxios\b/,
        /https?:\/\/[a-z]/i,
      ]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('carries no credential or environment secret', () => {
    for (const file of PACKAGE_FILES) {
      for (const pattern of [/apiKey/, /api_key/, /process\.env/, /\bpassword\b/i]) {
        expect(code(file), `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

describe('the harness does not duplicate normalization', () => {
  it('reuses the Stage 1.8b seam rather than reimplementing the mapping', () => {
    const sources = PACKAGE_FILES.map(code).join('\n')
    // It calls the seam...
    expect(sources).toMatch(/normalizePositionSnapshots/)
    // ...and does not carry its own copy of the mapping tables.
    for (const pattern of [
      /DIRECTION_OF_SIDE/, /STATE_OF_STATE/, /toQuantityText/, /toPriceText/,
    ]) {
      expect(sources, `acceptance package re-implements ${pattern}`).not.toMatch(pattern)
    }
  })

  it('builds no second replay assembler', () => {
    const sources = PACKAGE_FILES.map(code).join('\n')
    expect(sources).not.toMatch(/mergeReplayStreams/)
  })
})

describe('GATE-08 stays open', () => {
  it('implements no symbol, month-code, front-month or rollover inference', () => {
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

describe('the acceptance package is server and test side only', () => {
  it('is absent from the public @/lib/trading barrel', () => {
    const barrel = readFileSync(join(TRADING_ROOT, 'index.ts'), 'utf8')
    expect(barrel).not.toMatch(/provider-acceptance/)
  })

  it('is not reachable from any client component', () => {
    for (const file of PACKAGE_FILES) {
      expect(code(file), `${file} declares use client`).not.toMatch(/use client/)
    }
  })
})

/**
 * The guard's own regression test.
 *
 * A guard that cannot demonstrate catching what it forbids is not a guard. The
 * literals below are assembled from fragments so this file does not itself
 * contain the patterns it bans — a test asserting absence that contains the
 * banned text would fail against itself.
 */
describe('the structural guards actually catch what they forbid', () => {
  const FORBIDDEN_SAMPLES = [
    ['order method', ['submit', 'Order'].join(''), /submitOrder/],
    ['provider name', ['rith', 'mic'].join(''), /rithmic/i],
    ['network call', ['fet', 'ch('].join(''), /\bfetch\s*\(/],
    ['internal import', ['../int', 'ernal'].join(''), /(^|\/)internal(\/|$)/],
    ['front-month rule', ['front', 'Month'].join(''), /frontMonth/i],
  ] as const

  for (const [label, sample, pattern] of FORBIDDEN_SAMPLES) {
    it(`detects a ${label}`, () => {
      expect(sample).toMatch(pattern)
    })
  }

  it('does not match clean source', () => {
    const clean = 'export function readOnly() { return 1 }'
    for (const [, , pattern] of FORBIDDEN_SAMPLES) {
      expect(clean).not.toMatch(pattern)
    }
  })
})
