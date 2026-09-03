/**
 * Omnira Trading — what canonical aggregation is structurally forbidden to be.
 *
 * These guards exist BEFORE any provider does. A rule that arrives with the
 * first integration has to be trusted; one that already fails the build is
 * enforced.
 *
 * This package is where a float would want to live. Summing volume and picking
 * a bucket high are the two most natural places in the whole system to reach
 * for `Number`, `Math.max` and `reduce`, and every one of those would put a
 * binary rounding error inside a value the Risk Engine later compares against a
 * hard limit. So the guards are written against those temptations by name.
 *
 * It is also where a second duplicate policy, a second completeness engine and
 * a second timeframe vocabulary would each look like a small convenience.
 *
 * COMMENTS ARE STRIPPED BEFORE EVERY CHECK. The prose that explains a rule
 * necessarily names what it forbids — the module headers say "no float" a dozen
 * times. A guard matching raw source would fire on its own explanation, and the
 * usual fix, excluding the files that discuss it, blinds the guard to the files
 * most likely to grow the thing it forbids.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import * as marketView from '../market-view'
import * as priceModule from '../market-price'

const HERE = dirname(fileURLToPath(import.meta.url))
const TRADING_ROOT = resolve(HERE, '..')

const PRODUCTION = readdirSync(HERE)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .sort()

/** The two domain modules this slice moved down out of the presentation package. */
const DOMAIN_FILES = ['market-price.ts', 'market-candle.ts']

const raw = (file: string): string => readFileSync(file, 'utf8')

const executable = (file: string): string =>
  raw(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const packageCode = (name: string): string => executable(join(HERE, name))
const domainCode = (name: string): string => executable(join(TRADING_ROOT, name))

const ALL: readonly (readonly [string, string])[] = [
  ...PRODUCTION.map((f) => [`candle-aggregation/${f}`, packageCode(f)] as const),
  ...DOMAIN_FILES.map((f) => [f, domainCode(f)] as const),
]

/**
 * Assembled from fragments so this file never contains the literals it forbids,
 * even though it does not scan itself today.
 */
const ORDER = 'Order'
const FORBIDDEN_WRITE = [
  `submit${ORDER}`, `new${ORDER}`, `place${ORDER}`, `modify${ORDER}`,
  `cancel${ORDER}`, `replace${ORDER}`, `route${ORDER}`, `preflight${ORDER}`,
  'exitPosition', 'closePosition',
]

describe('the slice ships what it claims and nothing else', () => {
  it('has the expected module set', () => {
    expect(PRODUCTION).toEqual(['aggregation.ts', 'exact-sum.ts', 'index.ts'])
  })

  it('POSITIVE CONTROL: the scan can actually find an identifier', () => {
    // Without this, a bug making `executable()` return '' would leave every
    // assertion below passing against nothing at all.
    expect(packageCode('aggregation.ts')).toContain('aggregateCanonicalCandle')
    expect(packageCode('exact-sum.ts').length).toBeGreaterThan(500)
    expect(domainCode('market-candle.ts')).toContain('readonly openTime: Timestamp')
  })
})

// ─── A–D. The two vocabularies moved down without being duplicated ───────────

describe('A/C. PriceText moved below presentation, exactly once', () => {
  it('is defined in precisely one file', () => {
    const definitions: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue
        if (/export type PriceText\s*=/.test(readFileSync(full, 'utf8'))) {
          definitions.push(full.slice(TRADING_ROOT.length + 1))
        }
      }
    }
    walk(TRADING_ROOT)
    expect(definitions).toEqual(['market-price.ts'])
  })

  it('Market View re-exports the SAME runtime functions, by identity', () => {
    /*
     * Identity, not equality. Two separately declared functions with the same
     * body would satisfy a behavioural test while being exactly the duplication
     * Canonical v1.0 forbids — so the assertion is reference equality.
     */
    expect(marketView.priceText).toBe(priceModule.priceText)
    expect(marketView.parsePriceText).toBe(priceModule.parsePriceText)
  })

  it('Market View still exposes the API it had', () => {
    expect(marketView.priceText('1.25')).toBe('1.25')
    expect(marketView.parsePriceText('1.25')).toBe('1.25')
    expect(marketView.parsePriceText('1e5')).toBeNull()
    expect(marketView.parsePriceText('.5')).toBeNull()
    expect(() => marketView.priceText('nope')).toThrow()
  })

  it('priceMagnitude deliberately stayed in presentation', () => {
    // The one legitimate float in the system: a price projected onto a pixel.
    expect(marketView.priceMagnitude(marketView.priceText('1.25'))).toBe(1.25)
    expect(domainCode('market-price.ts')).not.toContain('priceMagnitude')
    // And the aggregation package cannot reach it.
    for (const [name, code] of ALL) {
      expect(code, `${name} names priceMagnitude`).not.toContain('priceMagnitude')
    }
  })
})

describe('B/D. MarketCandle moved below presentation, exactly once', () => {
  it('is declared in precisely one file', () => {
    const definitions: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue
        if (/export interface MarketCandle\b/.test(readFileSync(full, 'utf8'))) {
          definitions.push(full.slice(TRADING_ROOT.length + 1))
        }
      }
    }
    walk(TRADING_ROOT)
    expect(definitions).toEqual(['market-candle.ts'])
  })

  it('kept exactly the six-field body on the way down', () => {
    const body = domainCode('market-candle.ts')
    for (const field of ['openTime', 'open', 'high', 'low', 'close', 'volume']) {
      expect(body).toContain(`readonly ${field}`)
    }
    // §14 keeps contract identity in the segment envelope; §19 keeps
    // completeness beside the bucket. Neither joined the candle.
    for (const forbidden of [
      'ResolvedContract', 'contract', 'root', 'symbol', 'timeframe',
      'completeness', 'sessionTruncated', 'decisionId',
    ]) {
      expect(body, `MarketCandle grew a ${forbidden} field`).not.toContain(forbidden)
    }
  })

  it('the market-data package still reaches it through Market View, unchanged', () => {
    /*
     * AT. The move was a placement change and nothing more. Stage 1.9B history
     * and merge were not repointed, not rewritten, and not touched.
     */
    for (const file of ['history.ts', 'merge.ts', 'history-controller.ts', 'fixture-history.ts']) {
      const code = executable(join(TRADING_ROOT, 'market-data', file))
      expect(code, file).toMatch(/from\s+'\.\.\/market-view'/)
      expect(code, file).not.toContain('market-candle')
      expect(code, file).not.toContain('candle-aggregation')
    }
  })
})

// ─── E. No presentation dependency ───────────────────────────────────────────

describe('E. the aggregation package cannot reach presentation', () => {
  it('never imports market-view, in any form', () => {
    for (const [name, code] of ALL) {
      expect(code, `${name} imports market-view`).not.toMatch(/market-view/)
    }
  })

  it('imports only the lower domain modules it needs', () => {
    const external: string[] = []
    for (const [name, code] of ALL) {
      for (const match of code.matchAll(/from\s+'([^']+)'/g)) {
        if (match[1].startsWith('./')) continue
        external.push(`${name} → ${match[1]}`)
      }
    }
    expect([...new Set(external)].sort()).toEqual([
      'candle-aggregation/aggregation.ts → ../decimal',
      'candle-aggregation/aggregation.ts → ../market-candle',
      'candle-aggregation/aggregation.ts → ../market-price',
      'candle-aggregation/aggregation.ts → ../market-timeframe',
      'candle-aggregation/aggregation.ts → ../session-calendar',
      'candle-aggregation/aggregation.ts → ../time',
      'candle-aggregation/exact-sum.ts → ../decimal',
      'candle-aggregation/exact-sum.ts → ../market-price',
    ])
  })

  it('the two domain modules depend only on lower leaves', () => {
    /*
     * A sibling `./x` is skipped above as a same-directory neighbour, which is
     * right for the package but would leave the flat domain files unasserted.
     * They are enumerated here instead.
     */
    const siblings = (name: string): string[] =>
      [...domainCode(name).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]).sort()
    expect(siblings('market-price.ts')).toEqual(['./decimal', './ids'])
    expect(siblings('market-candle.ts')).toEqual(['./market-price', './time'])
  })

  it('takes only the TYPE from ids, never the node:crypto value', () => {
    // `market-price.ts` is reachable from a client component through Market
    // View, so a value import here would put `node:crypto` in the browser
    // bundle. The market-view suite proves the whole closure; this pins the edge.
    expect(domainCode('market-price.ts')).toContain("import type { Branded } from './ids'")
    expect(domainCode('market-price.ts')).not.toMatch(/import\s+\{[^}]*\}\s+from\s+'\.\/ids'/)
  })
})

// ─── AO. No float ever touches a price or a volume ───────────────────────────

describe('AO. no binary floating point reaches a price or a volume', () => {
  it('names no float conversion or float-ordering helper', () => {
    for (const [name, code] of ALL) {
      for (const pattern of [
        /\bNumber\s*\(/, /\bparseFloat\b/, /\bparseInt\b/, /\bMath\.max\b/, /\bMath\.min\b/,
        /\bMath\.round\b/, /\bMath\.abs\b/, /\btoFixed\b/, /\btoPrecision\b/, /\bvaluueOf\b/,
      ]) {
        expect(code, `${name} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('orders prices through the exact decimal comparator', () => {
    const aggregation = packageCode('aggregation.ts')
    expect(aggregation).toContain('compareDecimal')
    // High and low are chosen by comparison, never by a sort on text.
    expect(aggregation).toContain('if (compareDecimal(body.high, high) > 0) high = body.high')
    expect(aggregation).toContain('if (compareDecimal(body.low, low) < 0) low = body.low')
  })

  it('sums volume as a scaled bigint', () => {
    const sum = packageCode('exact-sum.ts')
    expect(sum).toContain('BigInt')
    expect(sum).toContain('parseDecimal')
    expect(sum).toContain('padStart')
  })

  it('POSITIVE CONTROL: the float door exists elsewhere and is still shut', () => {
    // Proves the scan runs against real text: `priceMagnitude` is the system's
    // one sanctioned float, and it lives outside this package.
    expect(raw(join(TRADING_ROOT, 'market-view', 'snapshot.ts'))).toContain('Number(value)')
  })

  it('grows no general arithmetic API', () => {
    /*
     * `decimal.ts` deliberately ships no arithmetic, because a general one
     * invites position sizing and R:R computation before anyone has decided how
     * they should round. The narrow bucket summation here must not become that.
     */
    const sum = packageCode('exact-sum.ts')
    for (const forbidden of ['export function subtract', 'export function multiply', 'export function divide', 'roundingMode']) {
      expect(sum, `exact-sum grew ${forbidden}`).not.toContain(forbidden)
    }
    // And it is not on the package's public surface at all.
    expect(packageCode('index.ts')).not.toContain('exactVolumeSum')
  })
})

// ─── No second engine, no second policy ──────────────────────────────────────

describe('nothing here duplicates GATE-08C-2A', () => {
  it('defines no second completeness vocabulary or truncation rule', () => {
    for (const [name, code] of ALL) {
      expect(code, `${name} redefines the completeness enum`).not.toMatch(/BAR_COMPLETENESS\s*=\s*\[/)
      expect(code, `${name} redefines the source states`).not.toMatch(/OBSERVATION_SOURCE_STATES\s*=\s*\[/)
      expect(code, `${name} rebuilds an expectation`).not.toMatch(/expectedMinuteOpenTimes\s*:/)
      expect(code, `${name} recomputes the 4H grid`).not.toMatch(/FOUR_HOUR_OPEN_HOURS\s*=\s*\[/)
    }
    // It asks C2A instead.
    expect(packageCode('aggregation.ts')).toContain('evaluateBucketEvidence(bucket, expectation, {')
  })

  it('defines no second timeframe vocabulary', () => {
    for (const [name, code] of ALL) {
      expect(code, `${name} restates the vocabulary`).not.toMatch(/MARKET_TIMEFRAMES\s*=\s*\[/)
      expect(code, `${name} hard-codes the derived set`).not.toMatch(/\[\s*'5m'\s*,\s*'15m'\s*,\s*'4H'\s*\]/)
    }
    // The derived set is filtered from the one canonical list.
    expect(packageCode('aggregation.ts')).toContain("MARKET_TIMEFRAMES.filter(")
  })

  it('AS. the GATE-08C-2A package is untouched by this slice', () => {
    const dir = join(TRADING_ROOT, 'session-calendar')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const code = executable(join(dir, file))
      expect(code, file).not.toContain('candle-aggregation')
      expect(code, file).not.toContain('market-candle')
      expect(code, file).not.toContain('market-price')
    }
    // Its own guards are still in force, unweakened. If C2B had needed to
    // soften a C2A rule to fit, it would show here.
    const guard = raw(join(dir, 'import-discipline.test.ts'))
    expect(guard).toContain('AD. an answer cannot depend on where or when it runs')
    expect(guard).toContain("expect(zoneAware.map(([name]) => name)).toEqual(['session-calendar/zone.ts'])")
    expect(guard).toContain('hard-codes no UTC offset and no DST abbreviation')
  })

  it('the DST-boundary gap is still recorded as OPEN', () => {
    expect(raw(join(TRADING_ROOT, 'session-calendar', 'grid.ts')))
      .toContain('GATE-08C-2A DST-BOUNDARY GAP — OPEN / FAIL-CLOSED IMPLEMENTATION')
  })
})

// ─── AT. mergeOlderCandles is not competed with ──────────────────────────────

describe('AT. the Stage 1.9B merge contract is left alone', () => {
  it('this package neither imports nor reimplements it', () => {
    for (const [name, code] of ALL) {
      expect(code, `${name} reaches the merge contract`).not.toContain('mergeOlderCandles')
      expect(code, `${name} defines a competing refusal set`).not.toMatch(/MERGE_REFUSALS/)
      expect(code, `${name} silently sorts`).not.toMatch(/\.sort\s*\(/)
      expect(code, `${name} silently de-duplicates`).not.toMatch(/dedupe|deduplicate/i)
    }
  })

  it('merge.ts still owns duplicate and ordering semantics', () => {
    const merge = executable(join(TRADING_ROOT, 'market-data', 'merge.ts'))
    expect(merge).toContain("'UNORDERED_INPUT'")
    expect(merge).toContain("'DUPLICATE_DISAGREEMENT'")
  })
})

// ─── Provider, network, authority, order, C3 ─────────────────────────────────

describe('no provider, network, authority, order or C3 surface exists', () => {
  it('names no provider, exchange or wire format', () => {
    const patterns = [
      /rithmic/i, /tradovate/i, /projectx/i, /\bcme\b/i, /tradingview/i,
      /protobuf/i, /\bproto\b/i, /template_id/i, /templateId/i,
    ]
    for (const [name, code] of ALL) {
      for (const pattern of patterns) {
        expect(code, `${name} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('references no network API, endpoint, environment or credential', () => {
    for (const [name, code] of ALL) {
      for (const pattern of [
        /\bWebSocket\b/, /\bEventSource\b/, /\bfetch\s*\(/, /\baxios\b/, /https?:\/\//,
        /from\s+['"]node:/, /process\.env/,
      ]) {
        expect(code, `${name} matches ${String(pattern)}`).not.toMatch(pattern)
      }
      for (const forbidden of ['apiKey', 'credential', 'password', 'secret']) {
        expect(code.toLowerCase(), `${name} names ${forbidden}`).not.toContain(forbidden.toLowerCase())
      }
    }
  })

  it('reads no clock and draws no random value', () => {
    for (const [name, code] of ALL) {
      for (const pattern of [
        /Date\.now\s*\(/, /new\s+Date\b/, /Math\.random\s*\(/, /randomUUID/,
        /performance\.now\s*\(/, /setTimeout\s*\(/, /Intl\.DateTimeFormat/,
      ]) {
        expect(code, `${name} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('never names an authority artefact, its issuer, or an order', () => {
    for (const [name, code] of ALL) {
      for (const artefact of [
        'RiskClearance', 'PropClearance', 'ApprovalGrant', 'ExecutionIntent',
        'issueRiskClearance', 'issuePropClearance', 'issueApprovalGrant',
        'createExecutionIntent', 'openExecutionGate',
      ]) {
        expect(code, `${name} names ${artefact}`).not.toContain(artefact)
      }
      for (const forbidden of FORBIDDEN_WRITE) {
        expect(code, `${name} defines ${forbidden}`).not.toContain(forbidden)
      }
      expect(code, name).not.toMatch(/trading\/internal|\.\.\/internal/)
    }
  })

  it('POSITIVE CONTROL: the forbidden artefact names exist elsewhere', () => {
    expect(raw(join(TRADING_ROOT, 'reason-codes.ts'))).toContain('RiskClearance')
    expect(raw(join(TRADING_ROOT, 'market-view', 'snapshot.ts'))).toContain('ExecutionIntent')
  })

  it('detects nothing and starts no later slice', () => {
    for (const [name, code] of ALL) {
      for (const later of [
        'ContractCandleSegment', 'ContractSelectionDecision', 'LiveCandleSource',
        'HistoricalContractCandleSource', 'ResolvedContract',
        'iFVG', 'CISD', 'FairValueGap', 'SetupGrade', 'TradeProposal', 'detectSmt',
      ]) {
        expect(code, `${name} starts ${later}`).not.toContain(later)
      }
      expect(code, `${name} reaches the reason registry`).not.toMatch(/reason-codes/)
    }
  })

  it('candle aggregation adds no decision or aggregation reason vocabulary', () => {
    /*
     * This test used to claim GATE-08C REASON-CODE GAP was OPEN. Beslut J closed
     * it and Beslut K added the materializer, so that rationale is false — and
     * the old assertion only still passed by a near-miss of spelling: it looked
     * for CONTRACT_SELECTED_BY_CALENDAR while the canonical code is
     * CONTRACT_SELECTED_BY_CANONICAL_CALENDAR. Asserting the canonical code is
     * absent would now be asserting something untrue.
     *
     * The invariant that survives both rulings is narrower and is the one worth
     * keeping: aggregation DERIVES CANDLES, so it may not own selection
     * provenance or invent a journal vocabulary of its own.
     */
    const registry = raw(join(TRADING_ROOT, 'reason-codes.ts'))

    // POSITIVE CONTROL: the canonical selection code legitimately exists now.
    expect(registry).toContain('CONTRACT_SELECTED_BY_CANONICAL_CALENDAR')
    // No aggregation outcome was ever canonised, and none may be invented here.
    expect(registry).not.toContain('CANDLE_AGGREGATED')

    for (const [name, code] of ALL) {
      expect(code, `${name} reaches the reason registry`).not.toMatch(/reason-codes/)
      expect(code, `${name} emits a contract-selection reason`).not.toContain('CONTRACT_SELECTED')
      expect(code, `${name} invents an aggregation reason`).not.toContain('CANDLE_AGGREGATED')
    }
  })
})

// ─── AU. Market View is unchanged in behaviour ───────────────────────────────

describe('AU. Market View keeps exactly the surface it had', () => {
  it('still exports every price and candle name from its barrel', () => {
    for (const name of ['priceText', 'parsePriceText', 'priceMagnitude'] as const) {
      expect(typeof marketView[name]).toBe('function')
    }
    const barrel = raw(join(TRADING_ROOT, 'market-view', 'index.ts'))
    for (const name of ['MarketCandle', 'PriceText', 'priceText', 'parsePriceText', 'priceMagnitude']) {
      expect(barrel, `market-view barrel dropped ${name}`).toContain(name)
    }
  })

  it('its own import-discipline guard is still in force', () => {
    const guard = raw(join(TRADING_ROOT, 'market-view', 'import-discipline.test.ts'))
    expect(guard).toContain('never value-imports ../ids — the node:crypto carrier')
    expect(guard).toContain("expect([...seen].some((f) => f.endsWith('/ids.ts'))).toBe(false)")
  })
})
