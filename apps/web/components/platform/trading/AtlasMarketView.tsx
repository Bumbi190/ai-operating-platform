'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MARKET_INSTRUMENTS,
  MARKET_VIEW_SCENARIOS,
  buildFixtureSnapshot,
  type MarketInstrument,
  type MarketTimeframe,
  type MarketViewScenarioId,
} from '@/lib/trading/market-view'
import { resolveMarketViewKeyAction, stepIndex } from '@/lib/trading/market-view/keyboard'
import { TRADING_WORKSPACE_ID } from '@/lib/atlas/first-party-workspaces'
import { MarketChart } from './MarketChart'
import { MarketViewHeader } from './MarketViewHeader'
import { ExplanationSurface } from './ExplanationSurface'
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
 * `buildFixtureSnapshot` is pure, seeded and dependency-free, so it produces
 * identical output on the server and in the browser. Building here rather than
 * serialising 72 instrument/timeframe/scenario combinations keeps the payload
 * to code, makes switching instant, and keeps SSR and hydration in agreement by
 * construction — both run the same function with the same three arguments.
 */

const DEFAULT_SCENARIO: MarketViewScenarioId = 'long-developing'
const DEFAULT_INSTRUMENT: MarketInstrument = 'NQ'
const DEFAULT_TIMEFRAME: MarketTimeframe = '5m'

export function AtlasMarketView() {
  const router = useRouter()
  const [scenario, setScenario] = useState<MarketViewScenarioId>(DEFAULT_SCENARIO)
  const [instrument, setInstrument] = useState<MarketInstrument>(DEFAULT_INSTRUMENT)
  const [timeframe, setTimeframe] = useState<MarketTimeframe>(DEFAULT_TIMEFRAME)

  const snapshot = useMemo(
    () => buildFixtureSnapshot(scenario, instrument, timeframe),
    [scenario, instrument, timeframe],
  )

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

      <div className={styles.canvas}>
        <div className={styles.chartColumn}>
          <MarketChart snapshot={snapshot} />
        </div>

        <aside className={styles.rail} aria-label="Marknadsanalys">
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
