/**
 * The replay UI, as it actually renders.
 *
 * Two claims are asserted here that nothing else can prove: that the transport
 * moves the market state, and that a reader can tell a PLANNED trade from an
 * OBSERVED position at a glance. The second is the whole reason Stage 1.5
 * separates the two models, and it is a rendering claim.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  INITIAL_CURSOR,
  buildReplayTimeline,
  projectReplay,
  seekTo,
  setSpeed,
  type PlaybackSpeed,
} from '@/lib/trading/replay'
import { MARKET_VIEW_SCENARIO_IDS, type MarketViewScenarioId } from '@/lib/trading/market-view'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/trading',
}))

let AtlasMarketView: (props: Record<string, never>) => JSX.Element
let ReplayControls: (props: Record<string, unknown>) => JSX.Element
let PlannedTradesPanel: (props: Record<string, unknown>) => JSX.Element
let ObservedPositionsPanel: (props: Record<string, unknown>) => JSX.Element

beforeAll(async () => {
  AtlasMarketView = (await import('./AtlasMarketView')).AtlasMarketView as never
  ReplayControls = (await import('./ReplayControls')).ReplayControls as never
  const panels = await import('./PositionPanels')
  PlannedTradesPanel = panels.PlannedTradesPanel as never
  ObservedPositionsPanel = panels.ObservedPositionsPanel as never
})

const TL = (s: MarketViewScenarioId = 'a-plus-confirmed') => buildReplayTimeline(s, 'NQ', '5m')

function renderView(): string {
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
