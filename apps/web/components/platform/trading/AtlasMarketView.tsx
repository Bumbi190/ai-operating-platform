'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  LOADING,
  createFixtureReplayTimelineSource,
  identityOfTimeline,
  isCurrentGeneration,
  isUsableSeed,
  loadTimelineState,
  pause,
  play,
  projectReplay,
  resetCursor,
  seekTo,
  setSpeed,
  stepBackward,
  stepForward,
  tickIntervalMs,
  readyState,
  timelineIdentity,
  timelineOf,
  type PlaybackSpeed,
  type ReplayCursor,
  type ReplayLoadState,
  type ReplayTimeline,
} from '@/lib/trading/replay'
import { resolveMarketViewKeyAction, stepIndex } from '@/lib/trading/market-view/keyboard'
import { TRADING_WORKSPACE_ID } from '@/lib/atlas/first-party-workspaces'
import { ChartShell, fullscreenOwnsEscape } from './ChartShell'
import { MarketViewHeader } from './MarketViewHeader'
import { ExplanationSurface } from './ExplanationSurface'
import { ReplayControls } from './ReplayControls'
import { SourceStatus } from './SourceStatus'
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
 * WHERE THE TIMELINE COMES FROM
 * ─────────────────────────────
 * A `ReplayTimelineSource`, and nowhere else. This component does not know how
 * a timeline is constructed and must not: it holds the cursor and the
 * presentation state, asks a source for a timeline, and projects it. That is
 * what lets a real market feed replace the fixture source later without any
 * change here.
 *
 * Loading is async because every future source will be. The fixture source
 * resolves immediately, but it goes through the same seam, so the loading,
 * unavailable and error paths are exercised now rather than discovered later.
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

export interface AtlasMarketViewProps {
  /**
   * A timeline already in hand for the default selection.
   *
   * Optional, and only ever a SEED: acquisition still belongs to the source.
   * It exists so a server render — or a test, which cannot await inside
   * `renderToStaticMarkup` — can show the ready workspace instead of a loading
   * frame. The first load is skipped only while the seed matches the current
   * selection; every change after that goes through the source like any other.
   */
  initialTimeline?: ReplayTimeline
}

export function AtlasMarketView({ initialTimeline }: AtlasMarketViewProps = {}) {
  const router = useRouter()
  const [scenario, setScenario] = useState<MarketViewScenarioId>(DEFAULT_SCENARIO)
  const [instrument, setInstrument] = useState<MarketInstrument>(DEFAULT_INSTRUMENT)
  const [timeframe, setTimeframe] = useState<MarketTimeframe>(DEFAULT_TIMEFRAME)

  // One source per scenario. The component knows the seam, not the construction.
  const source = useMemo(
    () => createFixtureReplayTimelineSource({ scenario }),
    [scenario],
  )

  /*
   * The seed is validated SYNCHRONOUSLY, before it can initialize anything.
   *
   * AN INVALID SEED MUST NEVER BECOME PRESENTATION STATE. Checking it in the
   * effect would be too late: effects do not run during server rendering or
   * static markup, so a mismatched seed would be painted first and corrected
   * afterwards — an ES/1m chart under an NQ/5m header for one frame. That is
   * the same query-identity fault the source refuses, so the view refuses it in
   * the same way.
   *
   * A rejected seed is not an error: the caller passed something stale or
   * wrong, and the safe, already-designed behaviour is simply to load through
   * the source like any other selection. Throwing would turn a caller's mistake
   * into a blank workspace.
   *
   * The initial selection is always the defaults, because that is what the
   * three `useState` calls above were initialized with.
   */
  const seed = initialTimeline !== undefined
    && isUsableSeed(
      initialTimeline,
      timelineIdentity(DEFAULT_SCENARIO, DEFAULT_INSTRUMENT, DEFAULT_TIMEFRAME),
      source.origin,
    )
    ? initialTimeline
    : null

  const [loadState, setLoadState] = useState<ReplayLoadState>(
    () => (seed === null ? LOADING : readyState(seed)),
  )
  const [cursor, setCursor] = useState<ReplayCursor>(() => (
    seed === null
      ? INITIAL_CURSOR
      : seekTo(INITIAL_CURSOR, seed.events, seed.events.length - 1)
  ))

  /**
   * The selection a valid seed already satisfies, consumed once.
   *
   * Null for a rejected seed, so the normal source acquisition runs for it.
   */
  const seededKey = useRef<string | null>(seed === null ? null : identityOfTimeline(seed))

  /*
   * The generation guard.
   *
   * Every load is tagged with the generation that requested it, and a result is
   * applied only while that generation is still current. Without this, a slow
   * request for a previously selected instrument would resolve after a faster
   * newer one and quietly drag the view back to the old selection.
   */
  const generation = useRef(0)

  useEffect(() => {
    // A seed already satisfies this exact selection, so there is nothing to
    // fetch. Consumed once: any later change loads through the source.
    if (seededKey.current === timelineIdentity(scenario, instrument, timeframe)) {
      seededKey.current = null
      return
    }

    const requested = generation.current + 1
    generation.current = requested
    setLoadState(LOADING)
    // A new timeline is coming, so the old cursor addresses nothing. Reset to
    // the start and stop playback; the end position is chosen once the timeline
    // actually arrives. Speed is a UI preference and survives.
    setCursor((current) => ({ ...INITIAL_CURSOR, speed: current.speed }))

    let applied = false
    void loadTimelineState(requested, () => source.load({ instrument, timeframe }))
      .then((outcome) => {
        if (!isCurrentGeneration(outcome.generation, generation.current)) return
        applied = true
        setLoadState(outcome.state)
        const loaded = timelineOf(outcome.state)
        // Open at the end of the replay: the same state Stage 1 showed.
        if (loaded !== null) {
          setCursor((current) => ({
            ...seekTo(INITIAL_CURSOR, loaded.events, loaded.events.length - 1),
            speed: current.speed,
          }))
        }
      })

    return () => {
      // Unmount or a newer selection: bump the generation so an in-flight
      // result can no longer match. `applied` is only read to keep the linter
      // honest about the closure being used.
      void applied
      generation.current += 1
    }
  }, [source, scenario, instrument, timeframe])

  const timeline = timelineOf(loadState)

  const projection = useMemo(
    () => (timeline === null ? null : projectReplay(timeline, cursor.position)),
    [timeline, cursor.position],
  )
  const snapshot = projection?.snapshot ?? null

  // The one wall clock in this component. It advances the cursor and decides
  // nothing else; market state is a function of the cursor, not of this timer.
  useEffect(() => {
    // No timeline means nothing to advance through. Playback also cannot leak
    // across a reload, because the effect re-runs when the timeline changes and
    // the cursor was reset to a paused start.
    if (!cursor.playing || timeline === null) return
    const events = timeline.events
    const id = setInterval(
      () => setCursor((current) => stepForward(current, events)),
      tickIntervalMs(cursor.speed),
    )
    return () => clearInterval(id)
  }, [cursor.playing, cursor.speed, timeline])

  const shiftInstrument = useCallback((delta: number) => {
    setInstrument((current) => {
      const index = MARKET_INSTRUMENTS.indexOf(current)
      return MARKET_INSTRUMENTS[stepIndex(index, delta, MARKET_INSTRUMENTS.length)]
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      /*
       * While the chart is fullscreen, Esc belongs to the browser.
       *
       * Without this the operator presses Esc expecting the chart to close and
       * is navigated back to Atlas instead — losing the workspace to a key
       * that, in fullscreen, means exactly one thing. The browser's own handler
       * still runs; we simply do not add a second meaning on top of it.
       *
       * Read from the document rather than from local state, so a fullscreen
       * exit triggered anywhere else cannot leave this guard stuck on.
       */
      if (fullscreenOwnsEscape(document)) return

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
        loadStatus={loadState.status}
        sourceLabel={source.label}
        sourceOrigin={source.origin}
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
        events={timeline?.events ?? []}
        marketTimeLabel={snapshot?.sessionState.canonicalTime ?? '—'}
        marketZoneLabel={
          snapshot === null
            ? 'ingen tidslinje'
            : `${snapshot.sessionState.timezone} ${snapshot.sessionState.utcOffset}`
        }
        onPlayPause={() => setCursor((c) => (c.playing ? pause(c) : play(c, timeline?.events ?? [])))}
        onStepBackward={() => setCursor((c) => stepBackward(c, timeline?.events ?? []))}
        onStepForward={() => setCursor((c) => stepForward(c, timeline?.events ?? []))}
        onReset={() => setCursor(resetCursor)}
        onSeek={(position) => setCursor((c) => seekTo(c, timeline?.events ?? [], position))}
        onSpeed={(speed: PlaybackSpeed) => setCursor((c) => setSpeed(c, speed))}
      />

      {projection === null || snapshot === null ? (
        <SourceStatus state={loadState} />
      ) : (
        <>
          <div className={styles.canvas}>
            <div className={styles.chartColumn}>
              <ChartShell snapshot={snapshot} instrument={instrument} timeframe={timeframe} />
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
        </>
      )}

      <p className={styles.keyboardHint}>← → byt instrument · Esc eller Backspace tillbaka till Atlas</p>
    </div>
  )
}
