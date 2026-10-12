import {
  deriveHandlarborsenInsights,
  HANDLARBORSEN_INSIGHT_RULE_VERSION,
} from '@/lib/atlas/project-analytics/handlarborsen-insights'
import {
  COMPLETENESS_LABELS,
  type MarketplaceReport,
} from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import styles from './HandlarborsenInsights.module.css'

/** Server-only composition: consumes the existing authorized report, never reads it. */
export function HandlarborsenInsights({ report, now }: { report: MarketplaceReport; now: Date }) {
  if (report.state !== 'ok' || !report.latest) return null
  const analysis = deriveHandlarborsenInsights(report, now)
  const latest = report.latest
  const { quality } = analysis
  if (quality.freshness === 'unknown') return null
  return (
    <section className={styles.panel} aria-labelledby="hb-atlas-evidence">
      <header>
        <p className={styles.kicker}>Atlas · Evidens</p>
        <h2 id="hb-atlas-evidence">Atlas – Underlag och förslag</h2>
        <p>Regelbaserad analys – ej exekverat. Ingen LLM har anropats.</p>
      </header>
      <dl className={styles.metadata}>
        <div>
          <dt>Observerat (UTC)</dt>
          <dd>
            <time dateTime={latest.observedAt}>{latest.observedAt}</time>
          </dd>
        </div>
        <div>
          <dt>Källa</dt>
          <dd>handlarborsen.marketplace · sparad statistikrapport</dd>
        </div>
        <div>
          <dt>Kvalitet</dt>
          <dd>
            {quality.completeness === 'unknown'
              ? 'Okänd'
              : COMPLETENESS_LABELS[quality.completeness]}{' '}
            · {quality.availableCount ?? 'Okänt'}/{quality.totalCount} mått ·{' '}
            {quality.freshness === 'fresh'
              ? 'Aktuell'
              : quality.freshness === 'stale'
                ? 'Äldre än 26 h'
                : 'Okänd aktualitet'}
          </dd>
        </div>
        <div>
          <dt>Regelversion</dt>
          <dd>{HANDLARBORSEN_INSIGHT_RULE_VERSION}</dd>
        </div>
      </dl>
      <ol className={styles.insights}>
        {analysis.insights.slice(0, 3).map((insight) => (
          <li key={insight.id}>
            <p className={styles.kicker}>
              {insight.kind === 'quality'
                ? 'Kvalitet'
                : insight.kind === 'proposal'
                  ? 'Förslag · Att granska'
                  : 'Faktum'}{' '}
              · {insight.rule} ·{' '}
              {insight.priority === 'check'
                ? 'Kontrollera'
                : insight.priority === 'review'
                  ? 'Granska'
                  : 'Observera'}
            </p>
            <h3>{insight.title}</h3>
            <p>{insight.observation}</p>
            {insight.kind === 'proposal' && (
              <p>
                <strong>Varför granskning krävs:</strong> {insight.reviewReason}
              </p>
            )}
            {insight.kind !== 'fact' && (
              <p className={styles.check}>
                <strong>Att granska:</strong> {insight.nextCheck.replace(/^Att granska: /, '')}
              </p>
            )}
            <details>
              <summary>Visa exakt evidens och proveniens</summary>
              {insight.evidence.length === 0 && <p>Verifierad numerisk evidens saknas.</p>}
              <ul className={styles.evidence}>
                {insight.evidence.map((item) => (
                  <li key={`${item.snapshotRef}/${item.metricKey}`}>
                    <p>
                      <code>{item.metricKey}</code>: <strong>{item.value ?? 'Okänt'}</strong>
                      {item.reason ? ` · ${item.reason}` : ''}
                    </p>
                    <p>
                      Observerat: <time dateTime={item.observedAt}>{item.observedAt}</time> ·
                      Snapshot: {item.snapshotDate} · {COMPLETENESS_LABELS[item.completeness]}
                    </p>
                    <p>
                      Fönster (UTC): {item.window.start} → {item.window.end} · {item.semanticKind} ·
                      täckning {item.window.complete === null ? 'okänd' : 'punktobservation'}
                    </p>
                    <p>
                      Källa: {item.source} · schema {item.schemaVersion} · collector{' '}
                      {item.collectorId} · collectorversion okänd i rapporten
                    </p>
                    <p>
                      Snapshotreferens: <code>{item.snapshotRef}</code> · sparad {item.capturedAt}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>
    </section>
  )
}
