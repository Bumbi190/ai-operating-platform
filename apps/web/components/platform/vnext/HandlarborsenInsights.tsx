import { deriveHandlarborsenInsights } from '@/lib/atlas/project-analytics/handlarborsen-insights'
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
  const reviewCount = analysis.insights.filter((insight) => insight.kind === 'proposal').length
  const rank = { proposal: 0, quality: 1, fact: 2 }
  const insights = [...analysis.insights].sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 3)
  return (
    <section className={styles.panel} aria-labelledby="hb-atlas-evidence">
      <header className={styles.header}>
        <div>
          <h2 id="hb-atlas-evidence">Atlas Intelligence</h2>
          <p className={styles.subtitle}>Regelbaserad analys · Ej exekverat</p>
        </div>
        {reviewCount > 0 && (
          <p className={styles.count}>{reviewCount} förslag att granska</p>
        )}
      </header>
      <dl className={styles.metadata}>
        <div>
          <dt>Källa</dt>
          <dd>Handlarbörsen · sparad rapport</dd>
        </div>
        <div>
          <dt>Kvalitet</dt>
          <dd>
            {quality.completeness === 'unknown'
              ? 'Okänd'
              : COMPLETENESS_LABELS[quality.completeness]}{' '}
            ·{' '}
            {quality.freshness === 'fresh'
              ? 'Aktuell'
              : quality.freshness === 'stale'
                ? 'Äldre än 26 h'
                : 'Okänd aktualitet'}
          </dd>
        </div>
        <div>
          <dt>Observerat (UTC)</dt>
          <dd>
            <time dateTime={latest.observedAt}>
              {new Date(latest.observedAt).toISOString().slice(0, 16).replace('T', ' ')}
            </time>
          </dd>
        </div>
      </dl>
      <ol className={styles.insights}>
        {insights.map((insight) => (
          <li key={insight.id} data-kind={insight.kind}>
            <p className={styles.kicker}>
              {insight.kind === 'quality'
                ? 'Kvalitet'
                : insight.kind === 'proposal'
                  ? 'Förslag · Att granska'
                  : 'Faktum'}{' '}
              ·{' '}
              {insight.priority === 'check'
                ? 'Kontrollera'
                : insight.priority === 'review'
                  ? 'Granska'
                  : 'Observera'}
            </p>
            <h3>{insight.title}</h3>
            <p>
              {insight.kind === 'quality'
                ? quality.reasons.join(' ') || 'Vissa regler saknar verifierat underlag. Kontrollera begränsningarna.'
                : insight.observation}
            </p>
            <p className={styles.check}>
              <strong>Att granska:</strong>{' '}
              {insight.kind === 'fact'
                ? 'Kontrollera observationerna i underlaget.'
                : insight.nextCheck.replace(/^Att granska: /, '')}
            </p>
            <details>
              <summary>Visa exakt evidens och proveniens</summary>
              <p>Regel: <code>{insight.rule}</code> · {insight.ruleVersion}</p>
              {insight.kind === 'proposal' && (
                <p><strong>Varför granskning krävs:</strong> {insight.reviewReason}</p>
              )}
              {insight.kind === 'quality' && <p>{insight.blockedReason}</p>}
              <p>
                Kvalitet: {quality.reportState} · {quality.completeness} · {quality.freshness} ·{' '}
                {quality.availableCount ?? 'Okänt'}/{quality.totalCount} mått · ålder{' '}
                {quality.ageHours ?? 'okänd'} h · bortvalda snapshots {quality.skippedInvalid}
              </p>
              <p>Analys utvärderad (UTC): {analysis.evaluatedAt ?? 'Okänt'}</p>
              <p>Insamlingsaudit: <code>{quality.collection ? JSON.stringify(quality.collection) : 'Okänd'}</code></p>
              <ul className={styles.evidence}>
                {quality.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                {quality.blockedRules.map((block) => (
                  <li key={block.rule}><code>{block.rule}</code>: {block.reason}</li>
                ))}
              </ul>
              {insight.evidence.length === 0 && <p>Verifierad numerisk evidens saknas.</p>}
              <ul className={styles.evidence}>
                {insight.evidence.map((item) => (
                  <li key={`${item.snapshotRef}/${item.metricKey}`}>
                    <p>
                      <code>{item.metricKey}</code>: <strong>{item.value ?? 'Okänt'}</strong> · {item.availability}
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
                      Källa: {item.source} · projekt {item.projectId} · schema {item.schemaVersion} · collector{' '}
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
