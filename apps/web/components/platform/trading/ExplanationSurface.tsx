import React from 'react'
import type { MarketExplanation, TradingMarketViewSnapshot } from '@/lib/trading/market-view'
import styles from './AtlasMarketView.module.css'

/**
 * The Atlas explanation surface under the chart.
 *
 * Stage 1 renders text supplied on the snapshot. There is no model call behind
 * it and no interface here that could become one by accident: the component
 * receives a finished `MarketExplanation` and renders it. When a real
 * explanation producer exists it fills the same field, and this component does
 * not change.
 *
 * The wording is deliberately labelled as explanation rather than advice.
 */

function timeOfDay(iso: string): string {
  const date = new Date(iso)
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export function ExplanationSurface({
  explanation,
  snapshot,
}: {
  explanation: MarketExplanation
  snapshot: TradingMarketViewSnapshot
}) {
  return (
    <section className={styles.explanation} aria-label="Atlas förklaring">
      <div className={styles.explanationMain}>
        <p className={styles.explanationEyebrow}>Atlas · kontext</p>
        <h2 className={styles.explanationHeadline}>{explanation.headline}</h2>
        <p className={styles.explanationBody}>{explanation.body}</p>
        <p className={styles.explanationDisclaimer}>
          Förklarande text baserad på visat tillstånd. Ingen rådgivning, ingen prognos, och
          ingenting som ger körbarhet.
        </p>
      </div>

      <ol className={styles.timeline} aria-label="Händelseförlopp">
        {explanation.timeline.map((entry) => (
          <li key={entry.id} className={styles.timelineEntry}>
            <span className={styles.timelineTime}>{timeOfDay(entry.at)}</span>
            <span className={styles.timelineText}>{entry.text}</span>
          </li>
        ))}
        {explanation.timeline.length === 0 ? (
          <li className={styles.timelineEntry}>
            <span className={styles.timelineTime}>—</span>
            <span className={styles.timelineText}>Inga händelser rapporterade.</span>
          </li>
        ) : null}
      </ol>

      <dl className={styles.explanationMeta}>
        <div>
          <dt>Miljö</dt>
          <dd>{snapshot.environment}</dd>
        </div>
        <div>
          <dt>Aktualitet</dt>
          <dd>{snapshot.provenance.freshness}</dd>
        </div>
        <div>
          <dt>Observerad</dt>
          <dd>{snapshot.provenance.observedAt ?? 'aldrig'}</dd>
        </div>
        <div>
          <dt>Genererad</dt>
          <dd>{snapshot.generatedAt}</dd>
        </div>
      </dl>
    </section>
  )
}