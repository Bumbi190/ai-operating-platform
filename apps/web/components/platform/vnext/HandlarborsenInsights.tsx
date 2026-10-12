import { Brain, ClipboardCheck, Info, ShieldAlert } from 'lucide-react'
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
  const insights = analysis.insights.slice(0, 3)
  const proposalCount = insights.filter((insight) => insight.kind === 'proposal').length
  const factChecks = {
    'company-status':
      'Kontrollera populationsdefinitionen och faktiska företagsstatusar före nästa bedömning.',
    'bid-window': 'Kontrollera fönstrets täckning innan budnivåerna används i nästa bedömning.',
    'published-stock':
      'Granska de två daterade nivåläsningarna; förändringen förklarar inte orsaken.',
    quality: '',
  }
  return (
    <section className={styles.panel} aria-labelledby="hb-atlas-evidence">
      <header className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.brandIcon}>
            <Brain size={22} aria-hidden="true" />
          </span>
          <div>
            <h2 id="hb-atlas-evidence">Atlas Intelligence</h2>
            <p className={styles.status}>Regelbaserad analys · Endast förslag</p>
          </div>
        </div>
        <p className={styles.count}>{proposalCount} förslag att granska</p>
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
      </dl>
      <ul className={styles.insights} data-card-count={insights.length}>
        {insights.map((insight) => (
          <li key={insight.id} className={styles.card} data-kind={insight.kind}>
            <p className={styles.kicker}>
              {insight.kind === 'quality' ? (
                <ShieldAlert size={16} aria-hidden="true" />
              ) : insight.kind === 'proposal' ? (
                <ClipboardCheck size={16} aria-hidden="true" />
              ) : (
                <Info size={16} aria-hidden="true" />
              )}
              {insight.kind === 'quality'
                ? 'Kvalitet · Kontrollera'
                : insight.kind === 'proposal'
                  ? 'Förslag · Att granska'
                  : 'Faktum · Observera'}
            </p>
            <h3>
              {insight.rule === 'company-status'
                ? 'Företagsstatus'
                : insight.rule === 'bid-window'
                  ? 'Bud vid observationen'
                  : insight.rule === 'published-stock'
                    ? 'Publicerat utbud'
                    : insight.title}
            </h3>
            <p className={styles.observation}>
              {insight.kind === 'quality'
                ? [
                    ...quality.reasons,
                    ...new Set(quality.blockedRules.map((block) => block.reason)),
                  ].join(' ')
                : insight.observation}
            </p>
            {insight.kind === 'proposal' && (
              <p className={styles.limit}>
                <strong>Varför granskning krävs:</strong> {insight.reviewReason}
              </p>
            )}
            <p className={styles.check}>
              <strong>Att granska:</strong>{' '}
              {insight.kind === 'fact'
                ? factChecks[insight.rule]
                : insight.nextCheck.replace(/^Att granska: /, '')}
            </p>
            <details>
              <summary>Visa underlag</summary>
              <div className={styles.provenance}>
                <p>
                  Atlas – Underlag och förslag. Regelbaserad analys – ej exekverat. Ingen LLM har
                  anropats.
                </p>
                <p>
                  Regel: <code>{insight.rule}</code> · Regelversion:{' '}
                  <code>{insight.ruleVersion}</code> · Prioritet: {insight.priority}
                </p>
                <p>Observation: {insight.observation}</p>
                {insight.kind === 'quality' && <p>Begränsning: {insight.blockedReason}</p>}
                <p>
                  Källa: handlarborsen.marketplace · sparad statistikrapport · Observerat (UTC):{' '}
                  <time dateTime={latest.observedAt}>{latest.observedAt}</time>
                </p>
                <p>
                  Kvalitet:{' '}
                  {quality.completeness === 'unknown'
                    ? 'Okänd'
                    : COMPLETENESS_LABELS[quality.completeness]}{' '}
                  · {quality.availableCount ?? 'Okänt'}/{quality.totalCount} mått · Bortvalda
                  ogiltiga snapshots: {quality.skippedInvalid}
                </p>
                {quality.reasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
                {quality.blockedRules.map((block) => (
                  <p key={block.rule}>
                    <code>{block.rule}</code>: {block.reason}
                  </p>
                ))}
              </div>
              {insight.evidence.length === 0 && <p>Verifierad numerisk evidens saknas.</p>}
              <ul className={styles.evidence}>
                {insight.evidence.map((item) => (
                  <li key={`${item.snapshotRef}/${item.metricKey}`}>
                    <p>
                      <code>{item.metricKey}</code>: <strong>{item.value ?? 'Okänt'}</strong>
                      {item.reason ? ` · ${item.reason}` : ''}
                    </p>
                    <p>
                      Tillgänglighet: {item.availability} · Projekt: {item.projectId}
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
      </ul>
    </section>
  )
}
