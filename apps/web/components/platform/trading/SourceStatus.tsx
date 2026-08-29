import React from 'react'
import type { ReplayLoadState } from '@/lib/trading/replay'
import styles from './AtlasMarketView.module.css'

/**
 * What the canvas shows when there is no timeline.
 *
 * Deliberately NOT an empty chart. An empty chart reads as a quiet market, and
 * the three states below are not that — they are "we are fetching", "the source
 * has nothing for this selection", and "the attempt failed". Each says which,
 * in words, because a reader who cannot tell them apart cannot tell a missing
 * instrument from a broken source.
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
    body: 'Källan svarade, men har ingenting för det valda instrumentet och tidsramen. '
      + 'Det är ett svar, inte ett fel — och inte en lugn marknad.',
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
