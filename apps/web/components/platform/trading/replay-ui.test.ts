/**
 * The replay UI, as it actually renders.
 *
 * Two claims are asserted here that nothing else can prove: that the transport
 * moves the market state, and that a reader can tell a PLANNED trade from an
 * OBSERVED position at a glance. The second is the whole reason Stage 1.5
 * separates the two models, and it is a rendering claim.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  INITIAL_CURSOR,
  projectReplay,
  seekTo,
  setSpeed,
  type PlaybackSpeed,
} from '@/lib/trading/replay'
// The synchronous fixture helper is deliberately not on the public barrel — see
// the note in index.ts. Tests reach for it directly, so the bypass is visible.
import { buildReplayTimeline } from '@/lib/trading/replay/timelines'
import { MARKET_VIEW_SCENARIO_IDS, type MarketViewScenarioId } from '@/lib/trading/market-view'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/trading',
}))

let AtlasMarketView: (props: Record<string, unknown>) => JSX.Element
let ReplayControls: (props: Record<string, unknown>) => JSX.Element
let PlannedTradesPanel: (props: Record<string, unknown>) => JSX.Element
let ObservedPositionsPanel: (props: Record<string, unknown>) => JSX.Element
let SourceStatus: (props: Record<string, unknown>) => JSX.Element

beforeAll(async () => {
  AtlasMarketView = (await import('./AtlasMarketView')).AtlasMarketView as never
  ReplayControls = (await import('./ReplayControls')).ReplayControls as never
  const panels = await import('./PositionPanels')
  PlannedTradesPanel = panels.PlannedTradesPanel as never
  ObservedPositionsPanel = panels.ObservedPositionsPanel as never
  SourceStatus = (await import('./SourceStatus')).SourceStatus as never
})

const TL = (s: MarketViewScenarioId = 'a-plus-confirmed') => buildReplayTimeline(s, 'NQ', '5m')

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

function renderControls(position: number, speed: PlaybackSpeed = 1): string {
  const timeline = TL()
  const cursor = setSpeed(seekTo(INITIAL_CURSOR, timeline.events, position), speed)
  return renderToStaticMarkup(
    createElement(ReplayControls, {
      cursor,
      events: timeline.events,
      marketTimeLabel: '11:30',
      marketZoneLabel: 'America/New_York -04:00',
      onPlayPause: () => {},
      onStepBackward: () => {},
      onStepForward: () => {},
      onReset: () => {},
      onSeek: () => {},
      onSpeed: () => {},
    }),
  )
}

// ─── Transport ────────────────────────────────────────────────────────────────

describe('replay controls', () => {
  it('renders the full transport', () => {
    const markup = renderView()
    expect(markup).toContain('data-testid="replay-controls"')
    for (const control of ['replay-reset', 'replay-prev', 'replay-playpause', 'replay-next', 'replay-scrubber']) {
      expect(markup, `missing ${control}`).toContain(`data-testid="${control}"`)
    }
  })

  it('labels the clock as market time, not the browser clock', () => {
    const markup = renderView()
    expect(markup).toContain('marknadstid')
    expect(markup).toContain('America/New_York')
  })

  it('disables reset and previous at the start of a replay', () => {
    const markup = renderControls(-1)
    const reset = markup.match(/<button[^>]*data-testid="replay-reset"[^>]*>/)?.[0] ?? ''
    const prev = markup.match(/<button[^>]*data-testid="replay-prev"[^>]*>/)?.[0] ?? ''
    expect(reset).toContain('disabled')
    expect(prev).toContain('disabled')
  })

  it('disables play and next at the end of a replay', () => {
    const timeline = TL()
    const markup = renderControls(timeline.events.length - 1)
    const play = markup.match(/<button[^>]*data-testid="replay-playpause"[^>]*>/)?.[0] ?? ''
    const next = markup.match(/<button[^>]*data-testid="replay-next"[^>]*>/)?.[0] ?? ''
    expect(play).toContain('disabled')
    expect(next).toContain('disabled')
  })

  it('reports position and progress', () => {
    const timeline = TL()
    expect(renderControls(-1)).toContain(`start / ${timeline.events.length}`)
    expect(renderControls(-1)).toContain('>0%<')
    expect(renderControls(timeline.events.length - 1)).toContain('>100%<')
  })

  it('marks exactly one playback speed as pressed', () => {
    for (const speed of [0.5, 1, 2, 4] as PlaybackSpeed[]) {
      const markup = renderControls(3, speed)
      expect((markup.match(/aria-pressed="true"/g) ?? []).length).toBe(1)
      expect(markup).toContain(`>${speed}×</button>`)
    }
  })

  it('does not change the rendered market state when only the speed changes', () => {
    const timeline = TL()
    const reference = JSON.stringify(projectReplay(timeline, 6).snapshot)
    for (const speed of [0.5, 1, 2, 4] as PlaybackSpeed[]) {
      const cursor = setSpeed(seekTo(INITIAL_CURSOR, timeline.events, 6), speed)
      expect(JSON.stringify(projectReplay(timeline, cursor.position).snapshot), `speed ${speed}`).toBe(reference)
    }
  })

  it('opens at the end of the replay, matching the Stage 1 state', () => {
    const timeline = TL('long-developing')
    const markup = renderView()
    // The default scenario is long-developing; its final state is on screen.
    expect(markup).toContain(`${timeline.events.length} / ${timeline.events.length}`)
    expect(markup).toContain('>100%<')
  })
})

// ─── Planned vs observed ──────────────────────────────────────────────────────

describe('planned trades are visibly not open positions', () => {
  it('renders both panels with distinct headings and vocabulary', () => {
    const markup = renderView()
    expect(markup).toContain('Planerade trades')
    expect(markup).toContain('Observerade positioner')
    // Neither borrows the other's word.
    expect(markup).toContain('Plan, inte order')
    expect(markup).toContain('faktisk exponering enligt provider')
  })

  it('gives the two card kinds different classes', () => {
    const timeline = TL('risk-blocked')
    const projection = projectReplay(timeline, timeline.events.length - 1)
    const planned = renderToStaticMarkup(
      createElement(PlannedTradesPanel, { plans: projection.plannedTrades }),
    )
    const observed = renderToStaticMarkup(
      createElement(ObservedPositionsPanel, { positions: [] }),
    )
    expect(planned).toContain('data-testid="planned-trade"')
    expect(planned).toContain('plannedCard')
    expect(observed).not.toContain('plannedCard')
  })

  it('states the non-executable boundary on every planned trade', () => {
    for (const scenario of MARKET_VIEW_SCENARIO_IDS) {
      const timeline = buildReplayTimeline(scenario, 'NQ', '5m')
      const projection = projectReplay(timeline, timeline.events.length - 1)
      const markup = renderToStaticMarkup(
        createElement(PlannedTradesPanel, { plans: projection.plannedTrades }),
      )
      if (projection.plannedTrades.length === 0) {
        expect(markup, scenario).toContain('data-testid="planned-empty"')
        continue
      }
      expect(markup, scenario).toContain('data-testid="planned-boundary"')
      expect(markup, scenario).not.toContain('data-executable')
      expect(markup, scenario).toContain('ingen orderväg')
    }
  })

  it('marks an observed position as fixture data on the card itself', () => {
    const timeline = buildReplayTimeline('neutral-no-setup', 'NQ', '5m')
    const projection = projectReplay(timeline, timeline.events.length - 1)
    const markup = renderToStaticMarkup(
      createElement(ObservedPositionsPanel, { positions: projection.observedPositions }),
    )
    expect(markup).toContain('data-testid="observed-source"')
    expect(markup).toContain('FIXTURE')
    expect(markup).toContain('Fixtur')
    // Never anything that reads as a live brokerage position.
    expect(markup).not.toContain('LIVE')
  })

  it('says when an observed position has no matching plan', () => {
    const timeline = buildReplayTimeline('neutral-no-setup', 'NQ', '5m')
    const projection = projectReplay(timeline, timeline.events.length - 1)
    const markup = renderToStaticMarkup(
      createElement(ObservedPositionsPanel, { positions: projection.observedPositions }),
    )
    expect(markup).toContain('data-testid="observed-unattributed"')
    expect(markup).toContain('inte föreslagen av Omnira')
  })

  it('distinguishes RAPPORTERAS EJ from OKÄND', () => {
    const unavailableScenario = buildReplayTimeline('neutral-no-setup', 'NQ', '5m')
    const unavailable = projectReplay(unavailableScenario, unavailableScenario.events.length - 1)
    const markupA = renderToStaticMarkup(
      createElement(ObservedPositionsPanel, { positions: unavailable.observedPositions }),
    )
    // This provider does not report P/L — a different claim from "we don't know".
    expect(markupA).toContain('RAPPORTERAS EJ')

    const staleScenario = buildReplayTimeline('unknown-stale', 'NQ', '5m')
    const stale = projectReplay(staleScenario, staleScenario.events.length - 1)
    const markupB = renderToStaticMarkup(
      createElement(ObservedPositionsPanel, { positions: stale.observedPositions }),
    )
    expect(markupB).toContain('OKÄND')
    expect(markupB).toContain('data-stale="true"')
  })

  it('renders an empty state rather than nothing when there is no plan', () => {
    const markup = renderToStaticMarkup(createElement(PlannedTradesPanel, { plans: [] }))
    expect(markup).toContain('data-testid="planned-empty"')
    expect(markup).toContain('Ingen planerad trade')
  })
})

// ─── Async source states (Stage 1.6) ──────────────────────────────────────────

describe('the workspace without a timeline', () => {
  it('opens in LOADING, not in an empty chart', () => {
    // The real first frame in a browser: acquisition is async, so there is no
    // timeline yet. An empty chart here would read as a calm market.
    const markup = renderViewUnseeded()
    expect(markup).toContain('data-testid="source-status"')
    expect(markup).toContain('data-status="LOADING"')
    expect(markup).toContain('Laddar tidslinje')
    expect(markup).not.toContain('<svg')
  })

  it('reports the source state in the banner rather than a market claim', () => {
    const markup = renderViewUnseeded()
    expect(markup).toContain('data-banner="LOADING"')
    expect(markup).toContain('LADDAR')
    // No market-state claim is made without market state.
    expect(markup).not.toContain('data-banner="FIXTURE"')
  })

  it('still shows source identity, which exists without a timeline', () => {
    const markup = renderViewUnseeded()
    expect(markup).toContain('data-testid="provenance-chip"')
    expect(markup).toContain('FIXTURE')
    expect(markup).toContain('Fixturreplay')
    expect(markup).toContain('Ingen provider ansluten')
  })

  it('keeps the selection controls usable so the operator can change it', () => {
    const markup = renderViewUnseeded()
    expect(markup).toContain('data-testid="instrument-switch"')
    expect(markup).toContain('data-testid="timeframe-switch"')
    expect(markup).toContain('Fixturscenario')
  })

  it('renders no panels and no planned/observed state', () => {
    const markup = renderViewUnseeded()
    expect(markup).not.toContain('Planerade trades')
    expect(markup).not.toContain('Observerade positioner')
    expect(markup).not.toContain('aria-label="Marknadsanalys"')
  })

  it('disables the whole transport when there is nothing to step through', () => {
    const markup = renderViewUnseeded()
    const buttons = markup.match(/<button[^>]*data-testid="replay-[^"]*"[^>]*>/g) ?? []
    expect(buttons.length).toBe(4)
    for (const button of buttons) {
      expect(button, `enabled with no timeline: ${button}`).toContain('disabled')
    }
    expect(markup).toContain('start / 0')
  })

  it('says "ingen tidslinje" rather than a fabricated market time', () => {
    expect(renderViewUnseeded()).toContain('ingen tidslinje')
  })
})

describe('unavailable and error frames', () => {
  it('distinguishes UNAVAILABLE from ERROR in words', () => {
    const unavailable = renderToStaticMarkup(
      createElement(SourceStatus, { state: { status: 'UNAVAILABLE' } }),
    )
    expect(unavailable).toContain('data-status="UNAVAILABLE"')
    expect(unavailable).toContain('Ingen tidslinje för detta urval')
    expect(unavailable).toContain('kunde inte lämna en användbar tidslinje')
    expect(unavailable).toContain('inte en lugn marknad')

    /*
     * More than one thing reaches UNAVAILABLE: the market seam having nothing
     * for this selection, and — since Stage 1.7 — the provider-observation seam
     * being unable to establish position state, which fails the load closed.
     *
     * The copy must therefore claim none of these, or a reader would conclude
     * the account had been checked and found flat.
     */
    for (const forbidden of [
      'Källan svarade',
      'Det är ett svar',
      'har ingenting för det valda instrumentet',
      'inga positioner',
      'inga öppna positioner',
      'flat',
    ]) {
      expect(unavailable, `UNAVAILABLE copy asserts "${forbidden}"`).not.toContain(forbidden)
    }

    const failed = renderToStaticMarkup(
      createElement(SourceStatus, { state: { status: 'ERROR', message: 'källan svarade inte' } }),
    )
    expect(failed).toContain('data-status="ERROR"')
    expect(failed).toContain('Källan kunde inte läsas')
    // The reason is shown verbatim; a swallowed message is a debugging session.
    expect(failed).toContain('källan svarade inte')
    expect(failed).toContain('data-testid="source-status-reason"')
  })

  it('renders nothing at all when the state is READY', () => {
    const timeline = buildReplayTimeline('long-developing', 'NQ', '5m')
    expect(
      renderToStaticMarkup(createElement(SourceStatus, { state: { status: 'READY', timeline } })),
    ).toBe('')
  })
})

// ─── An invalid seed must never become presentation state ─────────────────────

/**
 * `renderToStaticMarkup` runs no effects, which is exactly what makes it the
 * right tool here: it shows the FIRST FRAME, before any correction. If a
 * mismatched seed were only rejected in the effect, these renders would display
 * it — a server-rendered ES/1m chart under an NQ/5m header.
 *
 * The component's defaults are long-developing / NQ / 5m.
 */
function renderSeeded(timeline: unknown): string {
  return renderToStaticMarkup(createElement(AtlasMarketView, { initialTimeline: timeline }))
}

describe('an invalid initialTimeline never reaches the first frame', () => {
  it('accepts a seed that matches the initial selection', () => {
    const markup = renderSeeded(buildReplayTimeline('long-developing', 'NQ', '5m'))
    expect(markup).toContain('data-banner="FIXTURE"')
    expect(markup).toContain('<svg')
    expect(markup).toContain('Planerade trades')
    expect(markup).not.toContain('data-testid="source-status"')
  })

  it('rejects a seed for the wrong instrument', () => {
    const markup = renderSeeded(buildReplayTimeline('long-developing', 'ES', '5m'))
    // No market state at all — and specifically not ES market state under an
    // NQ header.
    expect(markup).toContain('data-testid="source-status"')
    expect(markup).toContain('data-status="LOADING"')
    expect(markup).not.toContain('<svg')
    expect(markup).not.toContain('E-mini S&P 500')
    // The header still reports the real selection.
    expect(markup).toContain('E-mini Nasdaq-100')
  })

  it('rejects a seed for the wrong timeframe', () => {
    const markup = renderSeeded(buildReplayTimeline('long-developing', 'NQ', '1m'))
    expect(markup).toContain('data-status="LOADING"')
    expect(markup).not.toContain('<svg')
    // A 1m timeline would have carried 1m bars into a 5m selection.
    const timeframeGroup = markup.split('data-testid="timeframe-switch"')[1].split('</div>')[0]
    expect(timeframeGroup).toMatch(/aria-pressed="true"[^>]*data-active="true">5m/)
  })

  it('rejects a seed for the wrong scenario', () => {
    const markup = renderSeeded(buildReplayTimeline('risk-blocked', 'NQ', '5m'))
    expect(markup).toContain('data-status="LOADING"')
    expect(markup).not.toContain('<svg')
    // risk-blocked would have rendered a BLOCKED banner and a blocked risk panel.
    expect(markup).not.toContain('data-banner="BLOCKED"')
    expect(markup).not.toContain('BLOCKERAD')
  })

  it('rejects a seed whose provenance disagrees with the source', () => {
    const honest = buildReplayTimeline('long-developing', 'NQ', '5m')
    // Identity matches; only the origin is wrong. The seed must still be refused,
    // or a LIVE-labelled timeline would render under a FIXTURE source.
    const mislabelled = {
      ...honest,
      base: {
        ...honest.base,
        provenance: { ...honest.base.provenance, origin: 'LIVE', sourceLabel: 'Live feed' },
      },
    }
    const markup = renderSeeded(mislabelled)
    expect(markup).toContain('data-status="LOADING"')
    expect(markup).not.toContain('<svg')
    expect(markup).not.toContain('data-banner="LIVE"')
    expect(markup).not.toContain('Live feed')
    // The provenance chip falls back to the source's own honest identity.
    expect(markup).toContain('Fixturreplay')
  })

  it('gives a rejected seed the same explicit first frame as no seed at all', () => {
    const rejected = renderSeeded(buildReplayTimeline('long-developing', 'ES', '5m'))
    const none = renderViewUnseeded()
    expect(rejected).toBe(none)
  })

  it('leaves a valid seed as a seed only — the source still owns later loads', () => {
    // The seed initializes state; it does not disable acquisition. The guard is
    // consumed once and the effect depends on all four inputs.
    const view = readFileSync(
      fileURLToPath(new URL('./AtlasMarketView.tsx', import.meta.url)),
      'utf8',
    )
    expect(view).toMatch(/seededKey\.current = null/)
    expect(view).toMatch(/\}, \[source, scenario, instrument, timeframe\]\)/)
    // And the seed is validated before it can initialize anything.
    const seedIndex = view.indexOf('const seed = initialTimeline !== undefined')
    const stateIndex = view.indexOf('const [loadState, setLoadState]')
    expect(seedIndex).toBeGreaterThan(-1)
    expect(seedIndex).toBeLessThan(stateIndex)
  })
})

// ─── Safety and provenance survive Stage 1.5 ──────────────────────────────────

describe('safety vocabulary is unchanged', () => {
  it('still states FIXTURDATA and no connected provider', () => {
    const markup = renderView()
    expect(markup).toContain('data-banner="FIXTURE"')
    expect(markup).toContain('FIXTURDATA')
    expect(markup).toContain('Ingen provider ansluten')
    expect(markup).not.toContain('data-banner="LIVE"')
  })

  it('still names the development environment', () => {
    expect(renderView()).toContain('development')
  })
})
