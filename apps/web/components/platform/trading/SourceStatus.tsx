import React from 'react'
import type { ReplayLoadState } from '@/lib/trading/replay'
import styles from './AtlasMarketView.module.css'

/**
 * What the canvas shows when there is no timeline.
 *
 * Deliberately NOT an empty chart. An empty chart reads as a quiet market, and
 * the three states below are not that — they are "we are fetching", "no usable
 * timeline could be assembled for this selection", and "the attempt failed".
 * Each says which, in words, because a reader who cannot tell them apart cannot
 * tell a missing instrument from a broken source.
 *
 * WHY THE UNAVAILABLE COPY IS DELIBERATELY UNSPECIFIC
 * ──────────────────────────────────────────────────
 * More than one thing reaches it. The market-data seam may have nothing for
 * this instrument and timeframe — and, since Stage 1.7, the provider-observation
 * seam may have been unable to establish position state at all, in which case
 * the load fails closed rather than render a timeline that would look flat.
 *
 * So the words must be true of both, and must not claim any of: that the
 * provider was successfully observed, that it reported nothing, or that the
 * account is flat. Saying "the source answered" would assert the first, and the
 * reader would draw the other two from it.
 *
 * Also deliberately not a spinner over stale data. When a load starts the
 * previous timeline is dropped, so nothing on screen can be a leftover from an
 * earlier selection.
 *
 * Development UI. The graph-first redesign is still deferred.
 */

const COPY: Record<Exclude<ReplayLoadState['status'], 'READY'>, { title: string; body: string }> = {
  LOADING: {
    title: 'Laddar tidslinje',
    body: 'Hämtar marknadsobservationer och replay-händelser från källan.',
  },
  UNAVAILABLE: {
    title: 'Ingen tidslinje för detta urval',
    body: 'Källan kunde inte lämna en användbar tidslinje för detta urval. '
      + 'Det säger ingenting om marknadsläget och ingenting om vilka positioner '
      + 'som finns — och det är inte en lugn marknad.',
  },
  ERROR: {
    title: 'Källan kunde inte läsas',
    body: 'Försöket att hämta en tidslinje misslyckades. Ingen data visas, och '
      + 'ingenting från ett tidigare urval ligger kvar.',
  },
}

export function SourceStatus({ state }: { state: ReplayLoadState }) {
  if (state.status === 'READY') return null
  const copy = COPY[state.status]

  return (
    <section
      className={styles.sourceStatus}
      data-status={state.status}
      data-testid="source-status"
      role="status"
      aria-live="polite"
    >
      <p className={styles.sourceStatusLabel}>{state.status}</p>
      <h2 className={styles.sourceStatusTitle}>{copy.title}</h2>
      <p className={styles.sourceStatusBody}>{copy.body}</p>
      {state.status === 'ERROR' ? (
        // The reason, verbatim. A swallowed message is a debugging session.
        <p className={styles.sourceStatusReason} data-testid="source-status-reason">
          {state.message}
        </p>
      ) : null}
    </section>
  )
}
