import type { AnalysisRuleId, SaveSelector } from '@/lib/atlas/project-analytics/analysis-review-contract'
import { AnalysisDraftSave } from './AnalysisDraftSave'
import {
  deriveHandlarborsenInsights,
  type HandlarborsenInsight,
} from '@/lib/atlas/project-analytics/handlarborsen-insights'
import {
  COMPLETENESS_LABELS,
  formatStockholm,
  type MarketplaceReport,
} from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import styles from './HandlarborsenInsights.module.css'

/** Server-only composition: consumes the existing authorized report, never reads it. */
export function HandlarborsenInsights({
  report,
  now,
  projectSlug,
  analysisSelectors,
}: {
  report: MarketplaceReport
  now: Date
  projectSlug?: string
  analysisSelectors?: Partial<Record<AnalysisRuleId, SaveSelector>>
}) {
  if (report.state !== 'ok' || !report.latest) return null
  const analysis = deriveHandlarborsenInsights(report, now)
  const latest = report.latest
  const { quality } = analysis
  if (quality.freshness === 'unknown') return null
  const relevant = analysis.insights.filter((insight) => insight.kind !== 'quality')
  const limitations = analysis.insights.filter((insight) => insight.kind === 'quality')
  const proposalCount = analysis.insights.filter((insight) => insight.kind === 'proposal').length
  const qualityNotes = [...new Set([...quality.reasons, ...quality.blockedRules.map((block) => block.reason)])]

  return (
    <section className={styles.panel} aria-labelledby="hb-atlas-evidence">
      <header className={styles.header}>
        <p className={styles.kicker}>Atlas · Analys</p>
        <h2 id="hb-atlas-evidence">Atlas Intelligence</h2>
        <p className={styles.subtitle}>Analyserat utifrån Handlarbörsens senaste verifierade rapport.</p>
      </header>
      <dl className={styles.status}>
        <div>
          <dt>Kvalitet</dt>
          <dd>
            {quality.completeness === 'unknown' ? 'Okänd' : COMPLETENESS_LABELS[quality.completeness]}
            {' · '}
            {quality.freshness === 'fresh' ? 'Aktuell' : 'Äldre än 26 h'}
          </dd>
        </div>
        <div>
          <dt>Senaste observation · svensk tid</dt>
          <dd>
            <time dateTime={latest.observedAt}>{formatStockholm(latest.observedAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Förslag att granska</dt>
          <dd>{proposalCount}</dd>
        </div>
      </dl>

      {limitations.length > 0 && (
        <aside className={styles.limitations} aria-labelledby="hb-atlas-quality">
          <h3 id="hb-atlas-quality">Underlagets begränsningar</h3>
          <ul>
            {qualityNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          {limitations.map((insight) => (
            <p key={insight.id} className={styles.check}>
              {insight.nextCheck}
            </p>
          ))}
        </aside>
      )}

      {relevant.length > 0 ? (
        <ol className={styles.insights} aria-label="Insikter att granska">
          {relevant.slice(0, 3).map((insight) => (
            <li key={insight.id}>
              <InsightCard
                insight={insight}
                projectSlug={projectSlug}
                selector={analysisSelectors?.[insight.rule as AnalysisRuleId]}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>Inga sakinsikter kan bedömas med det här underlaget.</p>
      )}
      {relevant.length > 3 && (
        <details className={styles.audit}>
          <summary>Fler insikter ({relevant.length - 3})</summary>
          <ol className={styles.insights}>
            {relevant.slice(3).map((insight) => (
              <li key={insight.id}>
                <InsightCard
                  insight={insight}
                  projectSlug={projectSlug}
                  selector={analysisSelectors?.[insight.rule as AnalysisRuleId]}
                />
              </li>
            ))}
          </ol>
        </details>
      )}

      <details className={styles.audit}>
        <summary>Källor, kvalitet och tekniskt underlag</summary>
        <p>Regelbaserad analys – ej exekverat. Ingen LLM har anropats.</p>
        <p>
          Källa: handlarborsen.marketplace · sparad statistikrapport · {quality.availableCount ?? 'Okänt'} av{' '}
          {quality.totalCount} mått.
        </p>
        {limitations.map((insight) => (
          <InsightEvidence key={insight.id} insight={insight} />
        ))}
        <details>
          <summary>Fullständig analys med alla evidensfält</summary>
          <pre className={styles.raw}>{JSON.stringify(analysis, null, 2)}</pre>
        </details>
      </details>
    </section>
  )
}

function InsightCard({
  insight,
  projectSlug,
  selector,
}: {
  insight: HandlarborsenInsight
  projectSlug?: string
  selector?: SaveSelector
}) {
  return (
    <article className={styles.card}>
      <p className={styles.kicker}>{insight.kind === 'proposal' ? 'Förslag · Att granska' : 'Observation'}</p>
      <h3>{insight.title}</h3>
      <p>{insight.observation}</p>
      {insight.kind === 'proposal' && <p className={styles.caveat}>{insight.reviewReason}</p>}
      <p className={styles.check}>
        <strong>Nästa manuella kontroll:</strong>{' '}
        {insight.kind === 'fact'
          ? 'Stäm av observationen mot källrapporten före nästa bedömning.'
          : insight.nextCheck.replace(/^Att granska: /, '')}
      </p>
      {insight.kind === 'proposal' && projectSlug && selector && (
        <AnalysisDraftSave slug={projectSlug} selector={selector} />
      )}
      <details className={styles.audit}>
        <summary>Visa evidens och källa</summary>
        <InsightEvidence insight={insight} />
      </details>
    </article>
  )
}

export function InsightEvidence({ insight }: { insight: HandlarborsenInsight }) {
  return (
    <div className={styles.provenance}>
      <p>
        Regel: <code>{insight.rule}</code> · version {insight.ruleVersion} · prioritet {insight.priority}
      </p>
      <p>
        Insikts-ID: <code>{insight.id}</code>
      </p>
      {insight.kind === 'quality' && <p>{insight.blockedReason}</p>}
      {insight.evidence.length === 0 && <p>Verifierad numerisk evidens saknas.</p>}
      <ul className={styles.evidence}>
        {insight.evidence.map((item) => (
          <li key={`${item.snapshotRef}/${item.metricKey}`}>
            <p>
              <code>{item.metricKey}</code>: <strong>{item.value ?? 'Okänt'}</strong>
              {item.reason ? ` · ${item.reason}` : ''}
            </p>
            <p>
              Observerat: <time dateTime={item.observedAt}>{item.observedAt}</time> · Snapshot: {item.snapshotDate} ·{' '}
              {COMPLETENESS_LABELS[item.completeness]}
            </p>
            <p>
              Fönster (UTC): {item.window.start} → {item.window.end} · {item.semanticKind} · täckning{' '}
              {item.window.complete === null ? 'okänd' : 'punktobservation'}
            </p>
            <p>
              Källa: {item.source} · schema {item.schemaVersion} · collector {item.collectorId} · collectorversion okänd
              i rapporten
            </p>
            <p>
              Snapshotreferens: <code>{item.snapshotRef}</code> · sparad {item.capturedAt}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
