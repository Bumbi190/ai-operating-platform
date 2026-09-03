/**
 * Omnira Trading — what contract resolution is structurally forbidden to be.
 *
 * These guards exist BEFORE any real calendar data or any provider does. A rule
 * that arrives with the first integration has to be trusted; one that already
 * fails the build is enforced.
 *
 * This package is where a front-month algorithm would want to live. It is the
 * natural home for "just parse the month code", for "ask the provider which
 * contract is current", and for "if the calendar has no entry, use the newest
 * one" — and every one of those is exactly what Canonical v1.0 §7.2 forbids by
 * name. So the guards are written against those temptations specifically.
 *
 * COMMENTS ARE STRIPPED BEFORE EVERY CHECK. The prose that explains a rule
 * necessarily names what it forbids — the module headers say "no front month" a
 * dozen times. A guard matching raw source would fire on its own explanation,
 * and the usual fix (exclude the files that discuss it) blinds the guard to the
 * files most likely to grow the thing it forbids.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const TRADING_ROOT = resolve(HERE, '..')

const PRODUCTION = readdirSync(HERE)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .sort()

/** The two lower-level modules this slice also introduced. */
const DOMAIN_FILES = ['market-instrument.ts', 'contract-identity.ts']

const raw = (file: string): string => readFileSync(file, 'utf8')

const executable = (file: string): string =>
  raw(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const packageCode = (name: string): string => executable(join(HERE, name))
const domainCode = (name: string): string => executable(join(TRADING_ROOT, name))

/** Everything this slice added, package and domain modules alike. */
const ALL: readonly (readonly [string, string])[] = [
  ...PRODUCTION.map((f) => [`contract-calendar/${f}`, packageCode(f)] as const),
  ...DOMAIN_FILES.map((f) => [f, domainCode(f)] as const),
]

/**
 * Assembled from fragments so this file never contains the literal it forbids.
 * Without it the guards below would match their own source, and the only
 * remaining fix would be to stop scanning this file.
 */
const ORDER = 'Order'
const MONTH = 'Month'
const FORBIDDEN_WRITE = [
  `submit${ORDER}`, `new${ORDER}`, `place${ORDER}`, `modify${ORDER}`,
  `cancel${ORDER}`, `replace${ORDER}`, `route${ORDER}`, `preflight${ORDER}`,
  'exitPosition', 'closePosition',
]
const FORBIDDEN_INFERENCE = [
  `front${MONTH}`, `FRONT_${MONTH.toUpperCase()}`, `${MONTH.toLowerCase()}Code`,
  `contract${MONTH}Code`, 'expiryCode', 'continuousContract', 'backAdjust',
]

describe('the slice ships what it claims and nothing else', () => {
  it('has the expected module set', () => {
    expect(PRODUCTION).toEqual(['calendar.ts', 'index.ts', 'lifecycle.ts', 'resolver.ts'])
  })

  it('POSITIVE CONTROL: the scan can actually find an identifier', () => {
    // Without this, a bug making `executable()` return '' would leave every
    // assertion below passing against nothing at all.
    expect(packageCode('resolver.ts')).toContain('resolveContractAt')
    expect(packageCode('calendar.ts').length).toBeGreaterThan(1_000)
    expect(domainCode('contract-identity.ts')).toContain('sameContract')
  })
})

// ─── W. No provider symbol logic, no formula ──────────────────────────────────

describe('nothing here infers a contract', () => {
  it('W. names no front-month, month-code or continuous-contract concept', () => {
    for (const [name, code] of ALL) {
      for (const forbidden of FORBIDDEN_INFERENCE) {
        expect(code, `${name} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('W2. parses no symbol and matches no contract pattern', () => {
    for (const [name, code] of ALL) {
      for (const pattern of [
        /\.startsWith\(/, /\.endsWith\(/, /\.match\(/, /new\s+RegExp/, /\/\^[^/]*\/[gimsuy]*\.test/,
      ]) {
        expect(code, `${name} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('W3. contains no third-Friday or roll arithmetic', () => {
    /*
     * Canonical v1.0 §27.2: CME's published 2026 table gives the June expiry as
     * a Thursday, one day before that month's third Friday. Any arithmetic here
     * would be wrong for that cycle and would have no way to know it.
     */
    for (const [name, code] of ALL) {
      for (const forbidden of ['thirdFriday', 'getDay(', 'getUTCDay(', 'weekday', 'DAY_OF_WEEK']) {
        expect(code, `${name} computes ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('the resolver declines rather than falling back', () => {
    const code = packageCode('resolver.ts')
    // Exactly one refusal value, and every failure path returns it.
    expect(code).toContain("CONTRACT_REFUSALS = ['NO_AUTHORITATIVE_COVERAGE'] as const")
    expect(code).toContain('if (window === undefined) return refused')
    expect(code).toContain('if (chosen === null) return refused')
  })
})

// ─── T. No clock, no randomness ───────────────────────────────────────────────

describe('resolution cannot depend on when it runs', () => {
  it('T. reads no wall clock and draws no random value', () => {
    for (const [name, code] of ALL) {
      for (const pattern of [
        /Date\.now\s*\(/, /new\s+Date\b/, /Math\.random\s*\(/, /randomUUID/,
        /performance\.now\s*\(/, /setTimeout\s*\(/, /setInterval\s*\(/,
      ]) {
        expect(code, `${name} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('takes the instant as an argument rather than fetching one', () => {
    expect(packageCode('resolver.ts')).toContain('at: Timestamp')
  })
})

// ─── U. No provider, network, protobuf or credential ──────────────────────────

describe('no provider and no network can be reached', () => {
  it('U. names no provider, exchange or wire format', () => {
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

  it('U2. references no network API and no endpoint', () => {
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

  it('U3. reads no environment and holds no credential', () => {
    for (const [name, code] of ALL) {
      for (const forbidden of ['process.env', 'apiKey', 'credential', 'password', 'secret', 'token']) {
        expect(code.toLowerCase(), `${name} names ${forbidden}`).not.toContain(forbidden.toLowerCase())
      }
    }
  })

  it('U4. imports only lower Trading domain modules', () => {
    const external: string[] = []
    for (const [name, code] of ALL) {
      for (const match of code.matchAll(/from\s+'([^']+)'/g)) {
        if (match[1].startsWith('./')) continue
        external.push(`${name} → ${match[1]}`)
      }
    }
    /*
     * Only `time`, `market-instrument` and `contract-identity` — all leaf domain
     * modules. Nothing reaches a package, a provider, or the public barrel.
     */
    expect(external.sort()).toEqual([
      'contract-calendar/calendar.ts → ../contract-identity',
      'contract-calendar/calendar.ts → ../market-instrument',
      'contract-calendar/calendar.ts → ../time',
      'contract-calendar/lifecycle.ts → ../contract-identity',
      'contract-calendar/lifecycle.ts → ../time',
      'contract-calendar/resolver.ts → ../contract-identity',
      'contract-calendar/resolver.ts → ../market-instrument',
      'contract-calendar/resolver.ts → ../time',
    ])
  })

  it('U5. the two domain modules depend only on each other', () => {
    /*
     * A sibling `./x` is skipped above as a same-directory neighbour, which is
     * right for the package but would leave the flat domain files unasserted.
     * They are enumerated here instead.
     */
    const siblings = (name: string): string[] =>
      [...domainCode(name).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]).sort()
    expect(siblings('market-instrument.ts')).toEqual([])
    expect(siblings('contract-identity.ts')).toEqual(['./market-instrument'])
  })

  it('the root vocabulary module depends on nothing at all', () => {
    // What makes it safe for the client-reachable Market View package to take
    // values from it.
    expect(domainCode('market-instrument.ts')).not.toMatch(/\bfrom\s+['"]/)
  })
})

// ─── V. Authority and execution firewall ──────────────────────────────────────

describe('a resolved contract mints no authority', () => {
  it('V. never names an authority artefact or its issuer', () => {
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

  it('V2. never reaches the module that issues authority', () => {
    for (const [name, code] of ALL) {
      expect(code, name).not.toMatch(/trading\/internal/)
      expect(code, name).not.toMatch(/\.\.\/internal/)
    }
  })

  it('V3. defines no order-mutating identifier', () => {
    for (const [name, code] of ALL) {
      for (const forbidden of FORBIDDEN_WRITE) {
        expect(code, `${name} defines ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('V4. POSITIVE CONTROL: the forbidden artefact names exist elsewhere', () => {
    // Proves the scans above run against real text, not an empty haystack.
    expect(raw(join(TRADING_ROOT, 'reason-codes.ts'))).toContain('RiskClearance')
    expect(raw(join(TRADING_ROOT, 'market-view', 'snapshot.ts'))).toContain('ExecutionIntent')
  })
})

// ─── Those concerns belong to other packages ─────────────────────────────────

/*
 * These slices are no longer "unstarted" — SessionCalendar, aggregation,
 * ContractCandleSegment and the decision materializer all exist, each in its own
 * package. What the assertions below protect is therefore a BOUNDARY, not a
 * schedule: contract-calendar resolves, and must not absorb the concerns that
 * were deliberately built elsewhere.
 */
describe('other packages own the layers above this one', () => {
  it('implements no session calendar, aggregation or candle segment', () => {
    for (const [name, code] of ALL) {
      for (const later of [
        'SessionCalendar', 'expectedTradingMinutes', 'BarCompleteness',
        'ContractCandleSegment', 'LiveCandleSource', 'HistoricalContractCandleSource',
        'nominalTo', 'effectiveMinutes', 'aggregate',
      ]) {
        expect(code, `${name} starts a later slice with ${later}`).not.toContain(later)
      }
    }
  })

  it('mints no ContractSelectionDecision and reaches no reason registry', () => {
    /*
     * The code and the materializer BOTH exist now — `reason-codes.ts` carries
     * CONTRACT_SELECTED_BY_CANONICAL_CALENDAR (Beslut J) and
     * `contract-selection/` materializes decisions (Beslut K). This assertion
     * therefore no longer guards a missing vocabulary; it guards a LAYER.
     *
     * Materialization belongs to the separate contract-selection package.
     * contract-calendar resolves and must not own a decision, because the moment
     * it does, the resolver stops being a pure function of (calendar, root, at)
     * and starts carrying an identity, a clock and a reason registry with it.
     */
    for (const [name, code] of ALL) {
      expect(code, `${name} mints a decision`).not.toContain('ContractSelectionDecision')
      expect(code, `${name} reaches the reason registry`).not.toMatch(/reason-codes/)
    }
  })
})

// ─── The market-data package is untouched by this slice ───────────────────────

describe('Stage 1.9B history navigation is left alone', () => {
  it('the root-oriented HistoricalCandleSource still takes a root', () => {
    const history = executable(join(TRADING_ROOT, 'market-data', 'history.ts'))
    expect(history).toContain('readonly instrument: MarketInstrument')
    // And it still knows nothing about a resolved contract.
    expect(history).not.toContain('ResolvedContract')
    expect(history).not.toContain('contract-calendar')
  })

  it('nothing in market-data imports this package', () => {
    const dir = join(TRADING_ROOT, 'market-data')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      expect(executable(join(dir, file)), file).not.toContain('contract-calendar')
    }
  })
})
