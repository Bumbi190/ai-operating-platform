import Link from 'next/link'
import type { OverviewModel, Metric } from '@/lib/overview/types'
import { OverviewCharts, formatSek, dataStateLabel } from './OverviewCharts'
import styles from './overview.module.css'
function Stat({
  label,
  value,
  money = false
}: {
  label: string
  value: Metric<number>
  money?: boolean
}) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <strong>
        {value.state === 'complete' && value.value !== null
          ? money
            ? formatSek(value.value)
            : value.value
          : '—'}
      </strong>
      {value.state !== 'complete' && (
        <small>{dataStateLabel(value.state)}</small>
      )}
    </div>
  )
}
export function OverviewDashboard({
  model
}: {
  model: OverviewModel
}): JSX.Element {
  const cost: Metric<number> = {
    state: model.costByDay.state,
    value:
      model.costByDay.state === 'complete' && model.costByDay.value
        ? model.costByDay.value.reduce((n, d) => n + d.costSek, 0)
        : null
  }
  const updated = new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm'
  }).format(new Date(model.generatedAt))
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OMNIRA</p>
          <h1>Översikt</h1>
          <p className={styles.subtitle}>Så går dina projekt.</p>
        </div>
        <div className={styles.headerActions}>
          <nav aria-label="Tidsperiod" className={styles.period}>
            {([7, 30] as const).map((period) => (
              <Link
                key={period}
                href={'/dashboard?period=' + period}
                aria-current={model.period === period ? 'page' : undefined}
              >
                {period} dagar
              </Link>
            ))}
          </nav>
          <Link className={styles.atlasLink} href="/atlas">
            Öppna Atlas <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>
      <p className={styles.updated}>Uppdaterad {updated} · Stockholm</p>
      <section className={styles.stats} aria-label="Sammanfattning">
        <Stat label="AI-kostnad under perioden" value={cost} money />
        <Stat label="Pågående körningar" value={model.totals.running} />
        <Stat label="Fel senaste dygnet" value={model.totals.failed24h} />
        <Stat
          label="Väntar på granskning"
          value={model.totals.pendingApprovals}
        />
      </section>
      <OverviewCharts model={model} />
      <section className={styles.projects} aria-label="Dina projekt">
        <div className={styles.sectionHeading}>
          <div>
            <h2>Dina projekt</h2>
            <p>Aktiva projekt du har åtkomst till</p>
          </div>
          {model.projects.state === 'complete' && (
            <span className={styles.count}>{model.projects.rows.length}</span>
          )}
        </div>
        {model.projects.state !== 'complete' ? (
          <p role="status" className={styles.empty}>
            {dataStateLabel(model.projects.state)}
          </p>
        ) : model.projects.rows.length ? (
          <div className={styles.projectGrid}>
            {model.projects.rows.map((p) => (
              <Link key={p.id} className={styles.projectCard} href={p.href}>
                <div className={styles.projectTitle}>
                  <span
                    className={styles.projectDot}
                    style={{
                      background: /^#[0-9a-f]{3,8}$/i.test(p.color ?? '')
                        ? p.color!
                        : '#77d4c4'
                    }}
                  />
                  <h3>{p.name}</h3>
                  <span className={styles.projectArrow} aria-hidden="true">
                    ↗
                  </span>
                </div>
                <div className={styles.projectStatus}>
                  <span>
                    {p.runningRuns.value === null
                      ? 'Status otillgänglig'
                      : p.runningRuns.value + ' pågår'}
                  </span>
                  <span>
                    {p.pendingApprovals.value === null
                      ? 'Granskningar otillgängliga'
                      : p.pendingApprovals.value + ' att granska'}
                  </span>
                  {p.failedRuns24h.value !== null &&
                    p.failedRuns24h.value > 0 && (
                      <span className={styles.failed}>
                        {p.failedRuns24h.value} fel senaste dygnet
                      </span>
                    )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>Inga projekt att visa ännu.</p>
        )}
      </section>
    </div>
  )
}
