/**
 * Omnira Trading — what the session calendar is structurally forbidden to be.
 *
 * These guards exist BEFORE any real session data and before any provider does.
 * A rule that arrives with the first integration has to be trusted; one that
 * already fails the build is enforced.
 *
 * This package is where a fixed -05:00 would want to live, where a weekday
 * formula would look harmless, and where "just ask the provider when the
 * session opened" would read as pragmatism. Canonical v1.0 §17 forbids the
 * first two and §11 the third, so the guards are written against those
 * temptations by name.
 *
 * COMMENTS ARE STRIPPED BEFORE EVERY CHECK. The prose that explains a rule
 * necessarily names what it forbids — the module headers say "no fixed offset"
 * repeatedly. A guard matching raw source would fire on its own explanation,
 * and the usual fix, excluding the files that discuss it, blinds the guard to
 * the files most likely to grow the thing it forbids.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import * as marketView from '../market-view'
import * as timeframeModule from '../market-timeframe'

const HERE = dirname(fileURLToPath(import.meta.url))
const TRADING_ROOT = resolve(HERE, '..')

const PRODUCTION = readdirSync(HERE)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .sort()

/** The domain module this slice moved down out of the presentation package. */
const DOMAIN_FILES = ['market-timeframe.ts']

const raw = (file: string): string => readFileSync(file, 'utf8')

const executable = (file: string): string =>
  raw(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const packageCode = (name: string): string => executable(join(HERE, name))
const domainCode = (name: string): string => executable(join(TRADING_ROOT, name))

/** Everything this slice added, package and domain modules alike. */
const ALL: readonly (readonly [string, string])[] = [
  ...PRODUCTION.map((f) => [`session-calendar/${f}`, packageCode(f)] as const),
  ...DOMAIN_FILES.map((f) => [f, domainCode(f)] as const),
]

/**
 * Assembled from fragments so this file never contains the literals it forbids,
 * even though it does not scan itself today. A future guard that widened its
 * scan would otherwise start failing on its own source.
 */
const ORDER = 'Order'
const FORBIDDEN_WRITE = [
  `submit${ORDER}`, `new${ORDER}`, `place${ORDER}`, `modify${ORDER}`,
  `cancel${ORDER}`, `replace${ORDER}`, `route${ORDER}`, `preflight${ORDER}`,
  'exitPosition', 'closePosition',
]

describe('the slice ships what it claims and nothing else', () => {
  it('has the expected module set', () => {
    expect(PRODUCTION).toEqual([
      'calendar.ts',
      'completeness.ts',
      'expectation.ts',
      'grid.ts',
      'index.ts',
      'strategy-eligibility.ts',
      'zone.ts',
    ])
  })

  it('POSITIVE CONTROL: the scan can actually find an identifier', () => {
    // Without this, a bug making `executable()` return '' would leave every
    // assertion below passing against nothing at all.
    expect(packageCode('grid.ts')).toContain('bucketAt')
    expect(packageCode('calendar.ts').length).toBeGreaterThan(1_000)
    expect(domainCode('market-timeframe.ts')).toContain('MARKET_TIMEFRAMES')
  })
})

// ─── AD. No wall clock, no randomness, no host timezone, no fixed offset ──────

describe('AD. an answer cannot depend on where or when it runs', () => {
  it('reads no wall clock and draws no random value', () => {
    for (const [name, code] of ALL) {
      for (const pattern of [
        /Date\.now\s*\(/, /new\s+Date\b/, /Math\.random\s*\(/, /randomUUID/,
        /performance\.now\s*\(/, /setTimeout\s*\(/, /setInterval\s*\(/, /hrtime/,
      ]) {
        expect(code, `${name} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('never consults the host timezone', () => {
    /*
     * `getTimezoneOffset` is the classic leak: it answers for the machine, not
     * for New York, and it is one keystroke from looking correct.
     */
    for (const [name, code] of ALL) {
      expect(code, name).not.toMatch(/getTimezoneOffset/)
      expect(code, name).not.toMatch(/toLocaleString|toLocaleDateString|toLocaleTimeString/)
    }
  })

  it('names an explicit timeZone on every formatter it builds', () => {
    // A formatter constructed without one resolves to the host zone, which would
    // make the canonical grid depend on where the process happens to run.
    let constructed = 0
    for (const [name, code] of ALL) {
      for (const match of code.matchAll(/new\s+Intl\.DateTimeFormat\s*\(([\s\S]*?)\)\n/g)) {
        constructed += 1
        expect(match[1], `${name} builds a formatter without a timeZone`).toContain('timeZone')
      }
    }
    // The scan must have found the formatters, or it proves nothing.
    expect(constructed).toBeGreaterThanOrEqual(2)
  })

  it('hard-codes no UTC offset and no DST abbreviation', () => {
    for (const [name, code] of ALL) {
      for (const pattern of [
        /-0[45]:00/, /\bUTC-[45]\b/, /\bEST\b/, /\bEDT\b/, /\bDST_OFFSET\b/,
        /offsetTable/i, /\bzoneTable\b/i,
      ]) {
        expect(code, `${name} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('takes the canonical zone from one place and never restates it', () => {
    /*
     * Exactly one module knows what a timezone is, and even it imports the
     * constant rather than writing the zone name out. A second literal would be
     * a second thing to keep in step with Strategy Canonical v1.0 §5.
     */
    const zoneAware = ALL.filter(([, code]) => /Intl\.DateTimeFormat/.test(code))
    expect(zoneAware.map(([name]) => name)).toEqual(['session-calendar/zone.ts'])

    for (const [name, code] of ALL) {
      expect(code, `${name} writes the zone name out`).not.toMatch(/America\/New_York/)
    }
    expect(packageCode('zone.ts')).toMatch(/CANONICAL_TIMEZONE/)
    // And the constant it imports really is the canonical one.
    expect(executable(join(TRADING_ROOT, 'time.ts'))).toContain(
      "CANONICAL_TIMEZONE = 'America/New_York' as const",
    )
  })

  it('computes no schedule of its own', () => {
    /*
     * Canonical v1.0 §17: the calendar is drawn FROM authoritative information,
     * it does not derive it. A weekday rule here would quietly become the
     * exchange schedule.
     */
    for (const [name, code] of ALL) {
      for (const forbidden of [
        'getDay(', 'getUTCDay(', 'weekday', 'DAY_OF_WEEK', 'isWeekend',
        'holiday', 'Holiday', 'thirdFriday', 'nthWeekday',
      ]) {
        expect(code, `${name} computes ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})

// ─── AE. Provider, network, authority and order firewalls ────────────────────

describe('AE. no provider, network, authority or order path can be reached', () => {
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

  it('references no network API and no endpoint', () => {
    const patterns = [
      /\bWebSocket\b/, /\bEventSource\b/, /\bXMLHttpRequest\b/, /\bfetch\s*\(/,
      /\baxios\b/, /https?:\/\//, /from\s+['"]node:/, /from\s+['"]net['"]/,
    ]
    for (const [name, code] of ALL) {
      for (const pattern of patterns) {
        expect(code, `${name} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('reads no environment and holds no credential', () => {
    for (const [name, code] of ALL) {
      for (const forbidden of ['process.env', 'apiKey', 'credential', 'password', 'secret', 'token']) {
        expect(code.toLowerCase(), `${name} names ${forbidden}`).not.toContain(forbidden.toLowerCase())
      }
    }
  })

  it('never names an authority artefact or its issuer', () => {
    for (const [name, code] of ALL) {
      for (const artefact of [
        'RiskClearance', 'PropClearance', 'ApprovalGrant', 'ExecutionIntent',
        'issueRiskClearance', 'issuePropClearance', 'issueApprovalGrant',
        'createExecutionIntent', 'openExecutionGate',
      ]) {
        expect(code, `${name} names ${artefact}`).not.toContain(artefact)
      }
    }
  })

  it('never reaches the module that issues authority', () => {
    for (const [name, code] of ALL) {
      expect(code, name).not.toMatch(/trading\/internal/)
      expect(code, name).not.toMatch(/\.\.\/internal/)
    }
  })

  it('defines no order-mutating identifier', () => {
    for (const [name, code] of ALL) {
      for (const forbidden of FORBIDDEN_WRITE) {
        expect(code, `${name} defines ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('POSITIVE CONTROL: the forbidden artefact names exist elsewhere', () => {
    // Proves the scans above run against real text, not an empty haystack.
    expect(raw(join(TRADING_ROOT, 'reason-codes.ts'))).toContain('RiskClearance')
    expect(raw(join(TRADING_ROOT, 'market-view', 'snapshot.ts'))).toContain('ExecutionIntent')
  })

  it('imports only the two lower domain modules it needs', () => {
    const external: string[] = []
    for (const [name, code] of ALL) {
      for (const match of code.matchAll(/from\s+'([^']+)'/g)) {
        if (match[1].startsWith('./')) continue
        external.push(`${name} → ${match[1]}`)
      }
    }
    expect([...new Set(external)].sort()).toEqual([
      'session-calendar/calendar.ts → ../time',
      'session-calendar/completeness.ts → ../time',
      'session-calendar/expectation.ts → ../time',
      'session-calendar/grid.ts → ../market-timeframe',
      'session-calendar/grid.ts → ../time',
      'session-calendar/strategy-eligibility.ts → ../time',
      'session-calendar/zone.ts → ../time',
    ])
  })

  it('the timeframe vocabulary module depends on nothing at all', () => {
    // What keeps it safe for the client-reachable Market View package to take
    // VALUES from it — nothing to import means no Node builtin to leak.
    expect(domainCode('market-timeframe.ts')).not.toMatch(/\bfrom\s+['"]/)
  })
})

// ─── AF. No aggregation was introduced ───────────────────────────────────────

describe('AF. no OHLCV aggregation exists yet', () => {
  it('names no price, volume or candle concept', () => {
    for (const [name, code] of ALL) {
      for (const pattern of [
        /\bMarketCandle\b/, /\bPriceText\b/, /\bDecimal\b/, /\bdecimal\b/,
        /\bvolume\b/i, /\bohlc\b/i, /\bhigh\b/, /\blow\b/, /\bprice\b/i,
        /\baggregate/i, /\bsumOf\b/,
      ]) {
        expect(code, `${name} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('reads only opening instants from an observation set', () => {
    // The whole observation input is a source state plus a list of Timestamps.
    // There is nowhere for a body to enter.
    const completeness = packageCode('completeness.ts')
    expect(completeness).toContain('readonly minuteOpenTimes: readonly Timestamp[]')
    expect(completeness).not.toMatch(/readonly (open|high|low|close):/)
  })

  it('POSITIVE CONTROL: the candle vocabulary exists elsewhere', () => {
    expect(raw(join(TRADING_ROOT, 'market-view', 'snapshot.ts'))).toContain('MarketCandle')
    expect(raw(join(TRADING_ROOT, 'decimal.ts'))).toContain('Decimal')
  })

  it('starts no later slice', () => {
    for (const [name, code] of ALL) {
      for (const later of [
        'ContractCandleSegment', 'LiveCandleSource', 'HistoricalContractCandleSource',
        'ContractSelectionDecision', 'mergeOlderCandles',
      ]) {
        expect(code, `${name} starts a later slice with ${later}`).not.toContain(later)
      }
      expect(code, `${name} reaches the reason registry`).not.toMatch(/reason-codes/)
    }
  })
})

// ─── The timeframe vocabulary moved down without being duplicated ────────────

describe('exactly one timeframe vocabulary exists', () => {
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
        if (/MARKET_TIMEFRAMES\s*=\s*\[/.test(readFileSync(full, 'utf8'))) {
          definitions.push(full.slice(TRADING_ROOT.length + 1))
        }
      }
    }
    walk(TRADING_ROOT)
    expect(definitions).toEqual(['market-timeframe.ts'])
  })

  it('Market View re-exports the SAME values, by identity', () => {
    /*
     * Identity, not equality. Two separately declared arrays with the same
     * members would satisfy `toEqual` while being exactly the duplication
     * Canonical v1.0 forbids — so the assertion is reference equality.
     */
    expect(marketView.MARKET_TIMEFRAMES).toBe(timeframeModule.MARKET_TIMEFRAMES)
    expect(marketView.isMarketTimeframe).toBe(timeframeModule.isMarketTimeframe)
    expect(marketView.parseMarketTimeframe).toBe(timeframeModule.parseMarketTimeframe)
  })

  it('Market View still exposes the API it had', () => {
    expect([...marketView.MARKET_TIMEFRAMES]).toEqual(['1m', '5m', '15m', '4H'])
    expect(marketView.isMarketTimeframe('4H')).toBe(true)
    expect(marketView.isMarketTimeframe('1h')).toBe(false)
    expect(marketView.parseMarketTimeframe('15m')).toBe('15m')
    expect(marketView.parseMarketTimeframe('15M')).toBeNull()
  })
})

// ─── AG / AH. The earlier slices are left alone ──────────────────────────────

describe('AG. the GATE-08C-1 contract calendar is untouched', () => {
  it('does not reference this slice', () => {
    const dir = join(TRADING_ROOT, 'contract-calendar')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const code = executable(join(dir, file))
      expect(code, file).not.toContain('session-calendar')
      expect(code, file).not.toContain('market-timeframe')
    }
  })

  it('still carries its own guards, unweakened', () => {
    // If C2A had needed to soften a C1 rule to fit, it would show here.
    const guard = raw(join(TRADING_ROOT, 'contract-calendar', 'import-discipline.test.ts'))
    expect(guard).toContain("expect(PRODUCTION).toEqual(['calendar.ts', 'index.ts', 'lifecycle.ts', 'resolver.ts'])")
    expect(guard).toContain("CONTRACT_REFUSALS = ['NO_AUTHORITATIVE_COVERAGE'] as const")
    expect(guard).toContain('W3. contains no third-Friday or roll arithmetic')
  })

  it('the root vocabulary module is still a leaf', () => {
    expect(domainCode('market-instrument.ts')).not.toMatch(/\bfrom\s+['"]/)
  })
})

describe('AH. the market-data history behaviour is untouched', () => {
  it('the root-oriented HistoricalCandleSource still takes a root', () => {
    const history = executable(join(TRADING_ROOT, 'market-data', 'history.ts'))
    expect(history).toContain('readonly instrument: MarketInstrument')
    expect(history).not.toContain('ResolvedContract')
    expect(history).not.toContain('session-calendar')
  })

  it('the dependency runs one way, and market-data takes only the grid predicate', () => {
    /*
     * This assertion used to read "nothing in market-data imports this
     * package". GATE-08C-3A made that false, deliberately: a contract segment
     * validates candle-open alignment with `isBucketOpen`, the ONE canonical
     * grid, rather than growing a second alignment rule of its own.
     *
     * What actually needed protecting is the DIRECTION — this package must not
     * depend on market-data — plus the narrowness of what market-data may take.
     * Both are asserted here; the original wording protected neither.
     */
    for (const [name, code] of ALL) {
      expect(code, `${name} reaches market-data`).not.toContain('market-data')
    }
    const dir = join(TRADING_ROOT, 'market-data')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const code = executable(join(dir, file))
      if (!code.includes('session-calendar')) continue
      // Exactly one import, and exactly one symbol from it.
      expect(code, file).toContain("import { isBucketOpen } from '../session-calendar'")
      expect([...code.matchAll(/from '\.\.\/session-calendar'/g)], file).toHaveLength(1)
    }
  })

  it('market-data still takes its timeframe vocabulary through Market View', () => {
    /*
     * The move was a placement change and nothing more. Every existing consumer
     * still imports exactly where it did — none was repointed at the new module,
     * which is what makes this a re-export rather than a migration.
     */
    for (const file of ['history.ts', 'history-controller.ts', 'fixture-history.ts']) {
      const code = executable(join(TRADING_ROOT, 'market-data', file))
      expect(code, file).toMatch(/from\s+'\.\.\/market-view'/)
      expect(code, file).not.toContain('market-timeframe')
    }
  })
})
