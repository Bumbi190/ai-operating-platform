/**
 * Atlas Market View — rendered surface and authority boundary.
 *
 * Two kinds of assertion live here.
 *
 * The first renders the real component tree with `renderToStaticMarkup` and
 * asserts what a reader actually sees — the established pattern in this
 * repository (see components/platform/intelligence/GraphCanvas.accessibility.test.ts).
 *
 * The second reads the component sources and asserts structural properties that
 * no amount of rendering can prove: that this surface reaches no network, and
 * that it cannot reach the module where execution authority is issued. Those
 * are the invariants a future edit is most likely to break quietly, so they are
 * pinned against the source rather than against behaviour.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  MARKET_VIEW_SCENARIO_IDS,
  buildFixtureSnapshot,
  type MarketViewScenarioId,
  type TradingMarketViewSnapshot,
} from '@/lib/trading/market-view'
// The synchronous fixture helper is deliberately not on the public barrel — see
// the note in index.ts. Tests reach for it directly, so the bypass is visible.
import { buildReplayTimeline } from '@/lib/trading/replay/timelines'

// The view calls useRouter for the Escape-to-Atlas action. Static rendering has
// no app-router context, so the hook is stubbed; nothing else about the tree is
// replaced.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/trading',
}))

let AtlasMarketView: (props: Record<string, unknown>) => JSX.Element
let MarketChart: (props: { snapshot: TradingMarketViewSnapshot }) => JSX.Element
let SetupPanel: (props: { setup: TradingMarketViewSnapshot['setup'] }) => JSX.Element
let RiskPanel: (props: { risk: TradingMarketViewSnapshot['riskState'] }) => JSX.Element
let ProposalPanel: (props: { proposal: TradingMarketViewSnapshot['tradeProposal'] }) => JSX.Element
let TradingPage: () => JSX.Element
let OSPage: unknown

beforeAll(async () => {
  OSPage = (await import('@/components/platform/os')).OSPage
  AtlasMarketView = (await import('./AtlasMarketView')).AtlasMarketView as never
  MarketChart = (await import('./MarketChart')).MarketChart as never
  const panels = await import('./panels')
  SetupPanel = panels.SetupPanel as never
  RiskPanel = panels.RiskPanel as never
  ProposalPanel = panels.ProposalPanel as never
  TradingPage = (await import('@/app/(platform)/trading/page')).default as never
})

/**
 * The workspace with a timeline already in hand.
 *
 * Acquisition is async now, and `renderToStaticMarkup` cannot await, so a
 * static render of the bare component correctly shows the LOADING frame. The
 * seed lets these assertions keep testing the composed ready workspace; the
 * loading, unavailable and error frames have their own tests.
 */
function renderView(scenario: MarketViewScenarioId = 'long-developing'): string {
  return renderToStaticMarkup(
    createElement(AtlasMarketView, { initialTimeline: buildReplayTimeline(scenario, 'NQ', '5m') }),
  )
}

/** The bare component, with no seed — the real first frame in a browser. */
function renderViewUnseeded(): string {
  return renderToStaticMarkup(createElement(AtlasMarketView, {}))
}

function renderChart(scenario: MarketViewScenarioId): string {
  return renderToStaticMarkup(
    createElement(MarketChart, { snapshot: buildFixtureSnapshot(scenario, 'NQ', '5m') }),
  )
}

/** Every button's inner text, tags stripped. */
function buttonTexts(markup: string): string[] {
  return (markup.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? []).map((button) =>
    button.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  )
}

function source(file: string): string {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
}

/**
 * Source with comments removed.
 *
 * These files DESCRIBE the boundary in prose — "lib/trading/internal/ is
 * unreachable from here" — so a naive text scan matches the very sentence that
 * states the rule. Scanning code only is what makes the assertion mean
 * something.
 */
function code(file: string): string {
  return source(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Every module specifier the file imports from. */
function importSpecifiers(file: string): string[] {
  const text = code(file)
  return [...text.matchAll(/(?:^|\n)\s*import\s[\s\S]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
}

const COMPONENT_FILES = [
  './AtlasMarketView.tsx',
  './MarketChart.tsx',
  './MarketViewHeader.tsx',
  './ExplanationSurface.tsx',
  './ReplayControls.tsx',
  './PositionPanels.tsx',
  './panels.tsx',
  './primitives.tsx',
]

// ─── The route renders ────────────────────────────────────────────────────────

describe('trading route', () => {
  it('composes the OS canvas around the market view, and that content renders', () => {
    // The page element is inspected rather than rendered whole: OSPage is a
    // shared layout primitive that predates this work and carries no explicit
    // React import, so rendering it here would fail on a file this change has
    // no business editing. Asserting the wrapper's identity and then rendering
    // its children covers the same ground without touching it.
    const element = TradingPage() as unknown as {
      type: unknown
      props: { density: string; children: JSX.Element }
    }
    expect(element.type).toBe(OSPage)
    expect(element.props.density).toBe('comfortable')

    const markup = renderToStaticMarkup(element.props.children)
    expect(markup).toContain('data-testid="atlas-market-view"')
  })

  it('renders the workspace with a chart and all five panels', () => {
    const markup = renderView()
    expect(markup).toContain('aria-label="Marknadsanalys"')
    for (const panel of ['Marknadstes', 'Setup', 'Riskläge', 'Prop Mode', 'Trade proposal']) {
      expect(markup, `missing panel: ${panel}`).toContain(panel)
    }
    expect(markup).toContain('<svg')
    expect(markup).toContain('Atlas Market View')
  })
})

// ─── Fixture / development mode is unmistakable ───────────────────────────────

describe('fixture and development mode visibility', () => {
  it('states FIXTURDATA in the safety banner', () => {
    const markup = renderView()
    expect(markup).toContain('data-testid="safety-banner"')
    expect(markup).toContain('data-banner="FIXTURE"')
    expect(markup).toContain('FIXTURDATA')
    expect(markup).toContain('Ingen marknadsanslutning')
  })

  it('states the origin and the absence of a provider in the provenance chip', () => {
    const markup = renderView()
    expect(markup).toContain('data-testid="provenance-chip"')
    expect(markup).toContain('Ingen provider ansluten')
  })

  it('names the development environment on the surface', () => {
    const markup = renderView()
    expect(markup).toContain('Miljö')
    expect(markup).toContain('development')
  })

  it('never renders the word LIVE as a state claim', () => {
    // The banner vocabulary contains LIVE, but no fixture may ever select it.
    const markup = renderView()
    expect(markup).not.toContain('data-banner="LIVE"')
  })

  it('labels the scenario switcher as fixture data', () => {
    expect(renderView()).toContain('Fixturscenario')
  })
})

// ─── Switching controls exist ─────────────────────────────────────────────────

describe('instrument and timeframe switching', () => {
  it('offers every instrument as a control', () => {
    const markup = renderView()
    expect(markup).toContain('data-testid="instrument-switch"')
    for (const instrument of ['NQ', 'MNQ', 'ES']) {
      expect(markup).toContain(`>${instrument}</button>`)
    }
  })

  it('offers every timeframe as a control', () => {
    const markup = renderView()
    expect(markup).toContain('data-testid="timeframe-switch"')
    for (const timeframe of ['1m', '5m', '15m', '4H']) {
      expect(markup).toContain(`>${timeframe}</button>`)
    }
  })

  it('marks exactly one instrument and one timeframe as pressed', () => {
    const markup = renderView()
    const instrumentGroup = markup.split('data-testid="instrument-switch"')[1].split('</div>')[0]
    const timeframeGroup = markup.split('data-testid="timeframe-switch"')[1].split('</div>')[0]
    expect((instrumentGroup.match(/aria-pressed="true"/g) ?? []).length).toBe(1)
    expect((timeframeGroup.match(/aria-pressed="true"/g) ?? []).length).toBe(1)
  })
})

// ─── Setup and UNKNOWN states are drawn, never omitted ────────────────────────

describe('setup state rendering', () => {
  it('draws all four confirmations in every scenario', () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const snapshot = buildFixtureSnapshot(scenario, 'NQ', '5m')
      const markup = renderToStaticMarkup(createElement(SetupPanel, { setup: snapshot.setup }))
      for (const label of ['Likviditetssweep', 'iFVG', 'CISD', 'SMT']) {
        expect(markup, `${scenario} is missing ${label}`).toContain(label)
      }
    }
  })

  it('gives UNKNOWN its own word and its own tone rather than an empty cell', () => {
    const snapshot = buildFixtureSnapshot('unknown-stale', 'NQ', '5m')
    const markup = renderToStaticMarkup(createElement(SetupPanel, { setup: snapshot.setup }))
    // Four confirmations, all unknown, all rendered.
    expect((markup.match(/OKÄND/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect((markup.match(/data-tone="unknown"/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('distinguishes ABSENT from UNKNOWN in the same panel', () => {
    // long-developing has CONFIRMED, ABSENT and UNKNOWN simultaneously. If
    // visual absence were being used for UNKNOWN, these three could not all be
    // present at once.
    const snapshot = buildFixtureSnapshot('long-developing', 'NQ', '5m')
    const markup = renderToStaticMarkup(createElement(SetupPanel, { setup: snapshot.setup }))
    expect(markup).toContain('BEKRÄFTAD')
    expect(markup).toContain('SAKNAS')
    expect(markup).toContain('OKÄND')
    expect(markup).toContain('data-tone="positive"')
    expect(markup).toContain('data-tone="negative"')
    expect(markup).toContain('data-tone="unknown"')
  })

  it('marks a stale chart frame so the drawing itself reads as untrusted', () => {
    expect(renderChart('unknown-stale')).toContain('data-stale="true"')
    expect(renderChart('long-developing')).not.toContain('data-stale')
  })
})

// ─── Blocked risk ─────────────────────────────────────────────────────────────

describe('blocked risk state', () => {
  it('renders BLOCKERAD with the limit and the exhausted attempts', () => {
    const snapshot = buildFixtureSnapshot('risk-blocked', 'NQ', '5m')
    const markup = renderToStaticMarkup(createElement(RiskPanel, { risk: snapshot.riskState }))
    expect(markup).toContain('BLOCKERAD')
    expect(markup).toContain('450.00')
    expect(markup).toContain('data-tone="critical"')
    expect(markup).toContain('3')
  })

  it('says the Risk Engine spec is authoritative and that nothing is evaluated here', () => {
    const snapshot = buildFixtureSnapshot('long-developing', 'NQ', '5m')
    const markup = renderToStaticMarkup(createElement(RiskPanel, { risk: snapshot.riskState }))
    expect(markup).toContain('Risk Engine Specification Canonical v1.0')
    expect(markup).toContain('ingen regel')
  })
})

// ─── Non-executability ────────────────────────────────────────────────────────

const ORDER_ACTION_WORDS = [
  'köp', 'sälj', 'buy', 'sell', 'lägg order', 'skicka order', 'place order', 'send order',
  'submit', 'execute', 'exekvera', 'godkänn och skicka', 'approve and send', 'flatten',
  'stäng position', 'close position', 'cancel order', 'modify order',
]

describe('the proposal is not executable', () => {
  it('renders a non-executable statement in every scenario', () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const snapshot = buildFixtureSnapshot(scenario, 'NQ', '5m')
      const markup = renderToStaticMarkup(
        createElement(ProposalPanel, { proposal: snapshot.tradeProposal }),
      )
      expect(markup).toContain('data-testid="execution-boundary"')
      expect(markup, `${scenario} claims executability`).not.toContain('data-executable')
      expect(markup).toContain('Inte körbart')
    }
  })

  it('renders no order control anywhere in the workspace', () => {
    const markup = renderView()
    const texts = buttonTexts(markup)
    expect(texts.length).toBeGreaterThan(0) // the switches exist, so this is a real scan
    for (const text of texts) {
      const lower = text.toLowerCase()
      for (const word of ORDER_ACTION_WORDS) {
        expect(lower, `a control reads "${text}"`).not.toContain(word)
      }
    }
  })

  it('renders no form and no submit input', () => {
    const markup = renderView()
    expect(markup).not.toContain('<form')
    expect(markup).not.toContain('type="submit"')
  })

  it('disables only replay transport controls, never an order affordance', () => {
    // The original form of this test asserted no `disabled` attribute at all,
    // to prove there was no greyed-out order button waiting to be enabled. The
    // replay transport legitimately disables itself at the start and end of a
    // timeline, so the assertion is narrowed to what it actually protects:
    // every disabled control must be one of the transport buttons.
    const markup = renderView()
    const disabled = (markup.match(/<button[^>]*disabled[^>]*>[\s\S]*?<\/button>/g) ?? [])
    expect(disabled.length).toBeGreaterThan(0) // start-of-replay disables Reset/Prev
    for (const button of disabled) {
      expect(button, `unexpected disabled control: ${button.slice(0, 120)}`)
        .toMatch(/data-testid="replay-(reset|prev|next|playpause)"/)
    }
  })

  it('offers only switching controls', () => {
    const texts = buttonTexts(renderView())
    const allowed = new Set([
      'NQ', 'MNQ', 'ES', '1m', '5m', '15m', '4H',
      'Long utvecklas', 'Short utvecklas', 'A+ bekräftad',
      'Risk blockerad', 'Ingen setup', 'Okänd / inaktuell',
      // Replay transport and playback speed. Every one of these moves a cursor
      // over authored fixture events; none of them reaches anything else.
      '⏮', '◀', '▶', '❚❚',
      '0.5×', '1×', '2×', '4×',
      // Fullscreen toggle. A VIEW control: it changes how much of the screen
      // the chart occupies and reaches nothing else. Listed explicitly so this
      // allowlist keeps doing its real job — proving no control can place,
      // modify or cancel anything.
      '⤢', '⤡',
    ])
    for (const text of texts) {
      expect(allowed.has(text), `unexpected control: "${text}"`).toBe(true)
    }
  })
})

// ─── Authority boundary, asserted against the source ──────────────────────────

describe('authority boundary', () => {
  it('never imports the internal authority or gate modules', () => {
    for (const file of COMPONENT_FILES) {
      for (const specifier of importSpecifiers(file)) {
        expect(specifier, `${file} imports ${specifier}`).not.toMatch(/trading\/internal/)
      }
    }
  })

  it('reaches the trading domain only through the market-view package', () => {
    // Components do not import `@/lib/trading` at all — the market-view package
    // is their whole view of the domain, and it re-exports the canonical types
    // they need. The keyboard module is the one named exception: it belongs to
    // this feature and carries no domain state.
    //
    // The package's own import rules — what it may take from its siblings, and
    // why the barrel is off limits for values — are asserted separately in
    // lib/trading/market-view/import-discipline.test.ts.
    const allowed = new Set([
      '@/lib/trading/market-view',
      '@/lib/trading/market-view/keyboard',
      // The replay package is the Stage 1.5 public barrel, with the same import
      // discipline — proven by lib/trading/replay/import-discipline.test.ts.
      '@/lib/trading/replay',
    ])
    for (const file of COMPONENT_FILES) {
      for (const specifier of importSpecifiers(file)) {
        if (!specifier.startsWith('@/lib/trading')) continue
        expect(allowed.has(specifier), `${file} imports ${specifier}`).toBe(true)
      }
    }
  })

  it('never names an authority constructor', () => {
    // Reading these types is legitimate; constructing one is the boundary.
    const forbidden = [
      /issueRiskClearance/, /issuePropClearance/, /issueApprovalGrant/,
      /createExecutionIntent/, /executionIntent\s*\(/, /riskClearanceOf/, /openExecutionGate/,
    ]
    for (const file of COMPONENT_FILES) {
      const text = code(file)
      for (const pattern of forbidden) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('makes no network call from the presentation surface', () => {
    // A market view that cannot reach the network cannot submit an order,
    // whatever a future button might be labelled.
    for (const file of COMPONENT_FILES) {
      const text = code(file)
      expect(text, `${file} calls fetch`).not.toMatch(/\bfetch\s*\(/)
      expect(text, `${file} uses XMLHttpRequest`).not.toMatch(/XMLHttpRequest/)
      expect(text, `${file} opens a WebSocket`).not.toMatch(/new\s+WebSocket/)
      expect(text, `${file} uses sendBeacon`).not.toMatch(/sendBeacon/)
    }
  })

  it('declares the boundary in the code it governs', () => {
    expect(source('./AtlasMarketView.tsx')).toContain(
      'AUTHORITY IS ISSUED, NOT DERIVED FROM DATA.',
    )
  })

  it('keeps the market-data seam free of execution-provider vocabulary', () => {
    const seam = readFileSync(
      fileURLToPath(new URL('../../../lib/trading/market-view/data-source.ts', import.meta.url)),
      'utf8',
    )
    // Mentioned in the comment that forbids it, never as a declaration.
    expect(seam).not.toMatch(/^\s*import .*ExecutionProviderAdapter/m)
    for (const method of ['getAccounts', 'getPositions', 'getWorkingOrders', 'getRecentFills']) {
      expect(seam, `seam declares ${method}`).not.toMatch(new RegExp(`${method}\\s*[(:]`))
    }
  })
})

// ─── Chart annotation coverage ────────────────────────────────────────────────

describe('chart annotations', () => {
  it('draws every supported annotation layer for a rich scenario', () => {
    const markup = renderChart('a-plus-confirmed')
    for (const layer of [
      'data-layer="candles"',
      'data-layer="liquidity-zones"',
      'data-layer="fair-value-gaps"',
      'data-layer="liquidity-levels"',
      'data-layer="four-hour-open"',
      'data-layer="proposal-levels"',
      'data-layer="manipulation"',
    ]) {
      expect(markup, `missing ${layer}`).toContain(layer)
    }
  })

  it('draws entry, SL, TP and BE when the proposal carries them', () => {
    const markup = renderChart('a-plus-confirmed')
    for (const label of ['>Entry<', '>SL<', '>TP<', '>BE<']) {
      expect(markup, `missing ${label}`).toContain(label)
    }
  })

  it('distinguishes an inverted gap from an open one', () => {
    const markup = renderChart('a-plus-confirmed')
    expect(markup).toContain('data-fvg-state="INVERTED"')
    expect(markup).toContain('data-fvg-state="OPEN"')
  })

  it('marks swept liquidity as swept', () => {
    expect(renderChart('long-developing')).toContain('data-liquidity-status="SWEPT"')
  })

  it('carries an accessible label naming the instrument, timeframe and source', () => {
    const markup = renderChart('long-developing')
    expect(markup).toMatch(/role="img"/)
    expect(markup).toMatch(/aria-label="NQ 5m — 90 staplar, Fixtur · Long utvecklas"/)
  })

  it('produces byte-identical markup across two renders', () => {
    expect(renderChart('a-plus-confirmed')).toBe(renderChart('a-plus-confirmed'))
  })
})
