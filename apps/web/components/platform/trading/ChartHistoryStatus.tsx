'use client'

import React from 'react'
import type { HistoryState } from '@/lib/trading/market-data'
import styles from './AtlasMarketView.module.css'

/**
 * Omnira Trading — what the chart's history is currently doing.
 *
 * NON-BLOCKING, ALWAYS
 * ────────────────────
 * Loading older candles must never blank the chart. An operator who scrolls
 * back and is met with a spinner has lost the bars they were reading in order
 * to be told that more are coming. So this is a small marker at the top-left of
 * the plot, the candles stay exactly where they were, and nothing is replaced.
 *
 * The same is true of failure. If older history cannot be fetched, the loaded
 * candles remain on screen and this says so — because a chart that emptied
 * itself on a failed request would imply the data it had was wrong, which it
 * is not.
 *
 * EXHAUSTION IS NOT AN ERROR
 * ──────────────────────────
 * Reaching the start of the available history is a normal, final answer, and it
 * is styled as information rather than as a problem. It also has to be visible:
 * an operator who keeps dragging left deserves to know the chart has stopped
 * asking on purpose rather than silently given up.
 */

interface Presentation {
  readonly text: string
  readonly tone: 'busy' | 'settled' | 'problem'
  /** Only a failure offers a retry; exhaustion has nothing to retry. */
  readonly retryable: boolean
}

/**
 * A total mapping over the state vocabulary.
 *
 * `IDLE` and `READY` render nothing — an operator does not need to be told the
 * chart is fine. Everything else has something worth saying.
 */
const PRESENTATION: Readonly<Record<HistoryState, Presentation | null>> = {
  IDLE: null,
  READY: null,
  LOADING_INITIAL: { text: 'Laddar historik…', tone: 'busy', retryable: false },
  LOADING_OLDER: { text: 'Laddar äldre staplar…', tone: 'busy', retryable: false },
  EXHAUSTED: { text: 'Ingen äldre historik', tone: 'settled', retryable: false },
  UNAVAILABLE: { text: 'Äldre historik ej tillgänglig', tone: 'problem', retryable: true },
  ERROR: { text: 'Historikfel', tone: 'problem', retryable: true },
}

export function ChartHistoryStatus({
  state,
  detail,
  loadedCount,
  onRetry,
}: {
  readonly state: HistoryState
  readonly detail: string | null
  readonly loadedCount: number
  readonly onRetry: () => void
}) {
  const presentation = PRESENTATION[state]
  if (presentation === null) return null

  return (
    <div
      className={styles.chartHistoryStatus}
      data-tone={presentation.tone}
      data-state={state}
      data-testid="chart-history-status"
      /* Announced politely: it must not interrupt what the operator is doing. */
      role="status"
      aria-live="polite"
    >
      <span className={styles.chartHistoryStatusText}>{presentation.text}</span>
      {/*
        The loaded count is the honest reassurance that nothing was lost when a
        request failed: those candles are still on the chart.
      */}
      <span className={styles.chartHistoryStatusCount}>{loadedCount} staplar</span>
      {presentation.retryable ? (
        <button
          type="button"
          className={styles.chartHistoryRetry}
          onClick={onRetry}
          data-testid="chart-history-retry"
        >
          Försök igen
        </button>
      ) : null}
      {/* Operator and journal text. Never decision input. */}
      {detail !== null ? <span className={styles.chartHistoryDetail}>{detail}</span> : null}
    </div>
  )
}
