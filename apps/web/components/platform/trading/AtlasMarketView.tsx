'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MARKET_INSTRUMENTS,
  MARKET_VIEW_SCENARIOS,
  type MarketInstrument,
  type MarketTimeframe,
  type MarketViewScenarioId,
} from '@/lib/trading/market-view'
import {
  INITIAL_CURSOR,
  buildReplayTimeline,
  pause,
  play,
  projectReplay,
  resetCursor,
  seekTo,
  setSpeed,
  stepBackward,
  stepForward,
  tickIntervalMs,
  type PlaybackSpeed,
  type ReplayCursor,
} from '@/lib/trading/replay'
import { resolveMarketViewKeyAction, stepIndex } from '@/lib/trading/market-view/keyboard'
import { TRADING_WORKSPACE_ID } from '@/lib/atlas/first-party-workspaces'
import { MarketChart } from './MarketChart'
import { MarketViewHeader } from './MarketViewHeader'
import { ExplanationSurface } from './ExplanationSurface'
import { ReplayControls } from './ReplayControls'
import { ObservedPositionsPanel, PlannedTradesPanel } from './PositionPanels'
import { ProposalPanel, PropPanel, RiskPanel, SetupPanel, ThesisPanel } from './panels'
import styles from './AtlasMarketView.module.css'

/**
 * Atlas Market View — the Trading project's primary screen.
 *
 * AUTHORITY BOUNDARY
 * ──────────────────
 * This component observes and renders. It cannot mint `RiskClearance`,
 * `PropClearance`, `ApprovalGrant` or `ExecutionIntent`, and that is structural
 * rather than a matter of discipline.
 *
 * Concretely: this component imports `@/lib/trading/market-view` and nothing
 * deeper. That package imports its own siblings inside `lib/trading/` — values
 * only from `../time` and `../decimal`, everything else type-only — and never
 * `lib/trading/internal/`, where issuance and the execution gate live. No
 * authority constructor is exported by anything on that path, so there is no
 * name here that could produce one. `import-discipline.test.ts` walks the whole
 * transitive value-import closure and proves both halves.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA.
 *
 * WHY THE FIXTURES ARE BUILT CLIENT-SIDE
 * ──────────────────────────────────────
 * `buildReplayTimeline` and `projectReplay` are pure, seeded and
 * dependency-free, so they produce identical output on the server and in the
 * browser. Building here rather than serialising every combination keeps the
 * payload to code, makes switching instant, and keeps SSR and hydration in
 * agreement by construction — both run the same functions with the same
 * arguments.
 *
 * REPLAY
 * ──────
 * The view holds a cursor; state is recomputed from the timeline for that
 * cursor. The playback timer is the ONLY wall clock in this component, and it
 * decides nothing but when to advance the cursor — market state comes from the
 * event under the cursor, never from `Date.now()`.
 *
 * The cursor starts at the END of the timeline, so the workspace opens on the
 * same state Stage 1 showed. Reset walks it back to the beginning.
 */

const DEFAULT_SCENARIO: MarketViewScenarioId = 'long-developing'
const DEFAULT_INSTRUMENT: MarketInstrument = 'NQ'
const DEFAULT_TIMEFRAME: MarketTimeframe = '5m'

export function AtlasMarketView() {
  const router = useRouter()
  const [scenario, setScenario] = useState<MarketViewScenarioId>(DEFAULT_SCENARIO)
  const [instrument, setInstrument] = useState<MarketInstrument>(DEFAULT_INSTRUMENT)
  const [timeframe, setTimeframe] = useState<MarketTimeframe>(DEFAULT_TIMEFRAME)

  const timeline = useMemo(
    () => buildReplayTimeline(scenario, instrument, timeframe),
    [scenario, instrument, timeframe],
  )

  // Opens at the end of the replay: the same state Stage 1 showed.
  const [cursor, setCursor] = useState<ReplayCursor>(
    () => seekTo(INITIAL_CURSOR, timeline.events, timeline.events.length - 1),
  )

  /*
   * Changing scenario, instrument or timeframe is a different timeline, so the
   * old cursor position is meaningless against it. Jump to that timeline's end
   * rather than keeping an index that now points at an unrelated event. The
   * playback speed is a UI preference and survives.
   */
  const timelineKey = `${scenario}:${instrument}:${timeframe}`
  const [activeKey, setActiveKey] = useState(timelineKey)
  if (activeKey !== timelineKey) {
    setActiveKey(timelineKey)
    setCursor((current) => ({
      ...seekTo(INITIAL_CURSOR, timeline.events, timeline.events.length - 1),
      speed: current.speed,
    }))
  }

  const projection = useMemo(
    () => projectReplay(timeline, cursor.position),
    [timeline, cursor.position],
  )
  const snapshot = projection.snapshot

  // The one wall clock in this component. It advances the cursor and decides
  // nothing else; market state is a function of the cursor, not of this timer.
  useEffect(() => {
    if (!cursor.playing) return
    const id = setInterval(
      () => setCursor((current) => stepForward(current, timeline.events)),
      tickIntervalMs(cursor.speed),
    )
    return () => clearInterval(id)
  }, [cursor.playing, cursor.speed, timeline.events])

  const shiftInstrument = useCallback((delta: number) => {
    setInstrument((current) => {
      const index = MARKET_INSTRUMENTS.indexOf(current)
      return MARKET_INSTRUMENTS[stepIndex(index, delta, MARKET_INSTRUMENTS.length)]
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveMarketViewKeyAction(event, document)
      if (action === null) return
      // Native controls keep their own keys; a focused button is not the rail.
      if (event.target instanceof HTMLElement && event.target.closest('a, button, [role="group"]')) {
        if (action !== 'return') return
      }
      event.preventDefault()
      if (action === 'previous-instrument') shiftInstrument(-1)
      if (action === 'next-instrument') shiftInstrument(1)
      if (action === 'return') {
        // Return to the rail with this workspace's card reselected — the same
        // `?project=` restore the project rail already uses. The id carries a
        // colon, so it can never be read as a project slug.
        router.push(`/atlas?ui=vnext&project=${encodeURIComponent(TRADING_WORKSPACE_ID)}`)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router, shiftInstrument])

  return (
    <div className={styles.workspace} data-testid="atlas-market-view">
      <MarketViewHeader
        snapshot={snapshot}
        instrument={instrument}
        timeframe={timeframe}
        onInstrumentChange={setInstrument}
        onTimeframeChange={setTimeframe}
      />

      <div className={styles.scenarioBar} role="group" aria-label="Fixturscenario">
        <span className={styles.scenarioLabel}>Fixturscenario</span>
        {MARKET_VIEW_SCENARIOS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={styles.scenarioButton}
            aria-pressed={entry.id === scenario}
            data-active={entry.id === scenario || undefined}
            title={entry.summary}
            onClick={() => setScenario(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <ReplayControls
        cursor={cursor}
        events={timeline.events}
        marketTimeLabel={snapshot.sessionState.canonicalTime}
        marketZoneLabel={`${snapshot.sessionState.timezone} ${snapshot.sessionState.utcOffset}`}
        onPlayPause={() => setCursor((c) => (c.playing ? pause(c) : play(c, timeline.events)))}
        onStepBackward={() => setCursor((c) => stepBackward(c, timeline.events))}
        onStepForward={() => setCursor((c) => stepForward(c, timeline.events))}
        onReset={() => setCursor(resetCursor)}
        onSeek={(position) => setCursor((c) => seekTo(c, timeline.events, position))}
        onSpeed={(speed: PlaybackSpeed) => setCursor((c) => setSpeed(c, speed))}
      />

      <div className={styles.canvas}>
        <div className={styles.chartColumn}>
          <MarketChart snapshot={snapshot} />
        </div>

        <aside className={styles.rail} aria-label="Marknadsanalys">
          {/*
            Planned and observed lead the rail — they are what the future
            graph-first terminal keeps, and putting them first now makes that
            redesign a layout change rather than a rewrite.
          */}
          <PlannedTradesPanel plans={projection.plannedTrades} />
          <ObservedPositionsPanel positions={projection.observedPositions} />
          <ThesisPanel thesis={snapshot.thesis} />
          <SetupPanel setup={snapshot.setup} />
          <RiskPanel risk={snapshot.riskState} />
          <PropPanel prop={snapshot.propState} position={snapshot.positionState} />
          <ProposalPanel proposal={snapshot.tradeProposal} />
        </aside>
      </div>

      <ExplanationSurface explanation={snapshot.explanation} snapshot={snapshot} />

      <p className={styles.keyboardHint}>← → byt instrument · Esc eller Backspace tillbaka till Atlas</p>
    </div>
  )
}
