import Link from 'next/link'
import {
  COLLECTION_TODAY_LABELS,
  COMPLETENESS_LABELS,
  METRIC_GROUP_ORDER,
  STALE_AFTER_HOURS,
  formatAge,
  formatStockholm,
  type CollectionStatus,
  type MarketplaceReport,
  type MetricView,
  type ReportSnapshot,
  type ReportState,
  REPORT_STATE_MESSAGES,
} from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import styles from './HandlarborsenMarketplaceReport.module.css'

/**
 * Handlarbörsen · Marknadsplatsstatistik — the latest stored report, as stored.
 *
 * Presentation only. Every number comes from the report model (a stored snapshot);
 * nothing is computed, estimated or defaulted here. An unavailable metric reads
 * "Okänt" with its reason — never 0 — and no change is claimed without a previous report.
 */

export function HandlarborsenMarketplaceReport({
  slug,
  name,
  report,
}: {
  slug: string
  name: string
  report: MarketplaceReport
}) {
  const latest = report.latest

  return (
    <main className={styles.field}>
      <header className={styles.header}>
        <p className={styles.kicker}>Projekt · Marknadsplatsstatistik</p>
        <h1 className={styles.title}>{name}</h1>
        <nav aria-label="Projektets vyer">
          <Link href={`/projects/${slug}`} className={styles.back}>← Command Center</Link>
        </nav>
      </header>

      {report.state !== 'ok' || !latest ? (
        <StateNote state={report.state === 'ok' ? 'no_snapshot' : report.state} />
      ) : (
        <>
          <section className={styles.panel} aria-labelledby="hb-report">
            <h2 id="hb-report" className={styles.sectionTitle}>Senaste rapport</h2>
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>Uppmätt</dt>
                <dd>
                  <time dateTime={latest.observedAt}>{formatStockholm(latest.observedAt)}</time>
                  <span className={styles.detail}> · {formatAge(latest.ageHours)} sedan</span>
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Datakvalitet</dt>
                <dd data-tone={latest.completeness === 'complete' ? 'ok' : 'warning'}>
                  {COMPLETENESS_LABELS[latest.completeness]}
                  <span className={styles.detail}> · {latest.availableCount} av {latest.metrics.length} mätvärden</span>
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Aktualitet</dt>
                <dd data-tone={latest.freshness === 'fresh' ? 'ok' : 'warning'}>
                  {latest.freshness === 'fresh' ? 'Aktuell' : `Äldre än ${STALE_AFTER_HOURS} tim`}
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Rapportdag</dt>
                <dd>{latest.snapshotDate}</dd>
              </div>
              {report.collection ? <CollectionFacts collection={report.collection} /> : null}
            </dl>
            {latest.freshness === 'stale' ? (
              <p className={styles.note} data-tone="warning" role="note">
                Rapporten är äldre än {STALE_AFTER_HOURS} tim och kan vara inaktuell.
              </p>
            ) : null}
            {report.collection?.latestAttemptFailed ? (
              <p className={styles.note} data-tone="warning" role="note">
                Det senaste insamlingsförsöket misslyckades eller gav ingen ny rapport. Siffrorna är från den senast sparade rapporten.
              </p>
            ) : null}
            {latest.completeness !== 'complete' ? (
              <p className={styles.note} data-tone="warning" role="note">
                Rapporten är {COMPLETENESS_LABELS[latest.completeness].toLowerCase()}: {latest.unavailableCount} mätvärden saknas och visas som okända, inte som noll.
              </p>
            ) : null}
          </section>

          {METRIC_GROUP_ORDER.map((group) => (
            <section key={group} className={styles.panel} aria-labelledby={`hb-${group}`}>
              <h2 id={`hb-${group}`} className={styles.sectionTitle}>{group}</h2>
              <ul className={styles.metrics}>
                {latest.metrics.filter((m) => m.group === group).map((metric) => (
                  <MetricRow key={metric.key} metric={metric} delta={deltaFor(report, metric)} />
                ))}
              </ul>
            </section>
          ))}

          <section className={styles.panel} aria-labelledby="hb-history">
            <h2 id="hb-history" className={styles.sectionTitle}>Historik</h2>
            {report.history.comparison.available ? (
              <p className={styles.noteQuiet}>
                Jämförelse mot rapporten {report.history.comparison.previousDate} ({report.history.comparison.daysBetween} dygn tidigare).
                Förändring visas för totaler och aktuella nivåer; värden för senaste 24 h jämförs inte mellan dagar.
              </p>
            ) : (
              <p className={styles.noteQuiet} role="note">
                Det finns bara en rapport. Ingen ökning eller minskning kan bedömas förrän fler rapporter har sparats.
              </p>
            )}
            <p className={styles.noteQuiet}>
              Sparade rapporter: {report.history.snapshotCount}
              {report.history.skippedInvalid > 0 ? ` · ${report.history.skippedInvalid} kunde inte verifieras och hoppades över` : ''}
            </p>
            {report.history.series.length > 1 ? (
              <ol className={styles.history} aria-label="Sparade rapporter, senaste först">
                {report.history.series.slice(0, HISTORY_ROWS).map((snapshot) => (
                  <HistoryRow key={snapshot.snapshotDate} snapshot={snapshot} />
                ))}
              </ol>
            ) : null}
          </section>
        </>
      )}
    </main>
  )
}

/** How many saved days the history list shows; the report model holds more. */
const HISTORY_ROWS = 14

function CollectionFacts({ collection }: { collection: CollectionStatus }) {
  const today = COLLECTION_TODAY_LABELS[collection.today]
  return (
    <>
      <div className={styles.fact}>
        <dt>Senaste lyckade insamling</dt>
        <dd>
          {collection.lastSuccess ? (
            <>
              <time dateTime={collection.lastSuccess.ranAt}>{formatStockholm(collection.lastSuccess.ranAt)}</time>
              <span className={styles.detail}> · {formatAge(collection.lastSuccess.ageHours)} sedan</span>
            </>
          ) : (
            'Ingen lyckad insamling registrerad'
          )}
        </dd>
      </div>
      <div className={styles.fact}>
        <dt>Dagens insamling</dt>
        <dd data-tone={today.tone}>{today.value}</dd>
      </div>
    </>
  )
}

/**
 * One saved day: the stock-type figures only (totals and current levels). The 24 h window
 * figures are a different window each day and are not lined up against each other.
 */
function HistoryRow({ snapshot }: { snapshot: ReportSnapshot }) {
  return (
    <li className={styles.historyRow}>
      <span className={styles.historyDate}>
        {snapshot.snapshotDate}
        <span className={styles.detail}> · {COMPLETENESS_LABELS[snapshot.completeness]}</span>
      </span>
      <span className={styles.historyValues}>
        {snapshot.metrics.filter((m) => m.kind !== 'window24h').map((m) => (
          <span key={m.key} className={styles.historyValue} data-unavailable={m.value === null ? 'true' : undefined}>
            {m.label} {m.value === null ? 'okänt' : m.value}
          </span>
        ))}
      </span>
    </li>
  )
}

function StateNote({ state }: { state: Exclude<ReportState, 'ok'> }) {
  const message = REPORT_STATE_MESSAGES[state]
  return (
    <section className={styles.panel} aria-labelledby="hb-state">
      <h2 id="hb-state" className={styles.sectionTitle}>{message.title}</h2>
      <p className={styles.note} data-tone={message.tone} role={message.tone === 'error' ? 'alert' : 'note'}>
        {message.body}
      </p>
    </section>
  )
}

function deltaFor(report: MarketplaceReport, metric: MetricView): number | null {
  const comparison = report.history.comparison
  if (!comparison.available) return null
  return comparison.deltas[metric.key] ?? null
}

function MetricRow({ metric, delta }: { metric: MetricView; delta: number | null }) {
  return (
    <li className={styles.metric} data-unavailable={metric.value === null ? 'true' : undefined}>
      <span className={styles.metricLabel}>{metric.label}</span>
      <span className={styles.metricValue}>
        {metric.value === null ? (
          <>
            Okänt
            <span className={styles.detail}> · {metric.reasonLabel}</span>
          </>
        ) : (
          metric.value
        )}
        {delta !== null ? (
          <span className={styles.delta} aria-label={`Förändring ${delta > 0 ? 'plus' : delta < 0 ? 'minus' : ''} ${Math.abs(delta)}`}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
        ) : null}
      </span>
    </li>
  )
}
