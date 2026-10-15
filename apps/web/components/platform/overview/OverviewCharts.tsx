import type { OverviewModel, DataState } from '@/lib/overview/types'
import styles from './overview.module.css'
const money = new Intl.NumberFormat('sv-SE', {
  style: 'currency',
  currency: 'SEK',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
export const formatSek = (value: number) =>
  money.format(value).replace(/^-/, '−')
export const dataStateLabel = (state: DataState) =>
  state === 'partial'
    ? 'Ofullständiga data'
    : state === 'unavailable'
      ? 'Data kunde inte läsas'
      : ''
const shortDate = (date: string) =>
  new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Stockholm'
  }).format(new Date(date + 'T12:00:00Z'))
const statusLabels = new Map([
  ['done', 'Klart'],
  ['completed', 'Klart'],
  ['running', 'Pågår'],
  ['failed', 'Fel'],
  ['queued', 'I kö'],
  ['pending', 'Väntar'],
  ['cancelled', 'Avbrutet']
])
const statusColors = new Map([
  ['done', '#77d4c4'],
  ['completed', '#77d4c4'],
  ['running', '#74b5ef'],
  ['failed', '#eea283'],
  ['queued', '#dac187'],
  ['pending', '#bba7de'],
  ['cancelled', '#7d94ac']
])
export function OverviewCharts({
  model
}: {
  model: OverviewModel
}): JSX.Element {
  const costs = model.costByDay.value,
    runs = model.runsByDay.value
  const costReady = model.costByDay.state === 'complete' && costs !== null,
    runReady = model.runsByDay.state === 'complete' && runs !== null
  const min = Math.min(0, ...(costs ?? []).map((d) => d.costSek)),
    max = Math.max(0, ...(costs ?? []).map((d) => d.costSek)),
    span = max - min || 1
  const y = (value: number) => 160 - ((value - min) / span) * 140
  const statuses = [
    ...new Set((runs ?? []).flatMap((d) => Object.keys(d.counts)))
  ].sort()
  const maximumRuns = Math.max(
    0,
    ...(runs ?? []).map((d) =>
      Object.values(d.counts).reduce((a, b) => a + b, 0)
    )
  )
  const peak = Math.max(1, maximumRuns)
  const projects = model.costByProject.value,
    projectReady = model.costByProject.state === 'complete' && projects !== null
  const projectMin = Math.min(0, ...(projects ?? []).map((p) => p.costSek)),
    projectMax = Math.max(0, ...(projects ?? []).map((p) => p.costSek)),
    projectSpan = projectMax - projectMin || 1,
    zero = (-projectMin / projectSpan) * 100
  return (
    <div className={styles.charts}>
      <section className={styles.dailyCost} aria-label="AI-kostnader per dag">
        <div className={styles.sectionHeading}>
          <div>
            <h2>AI-kostnader per dag</h2>
            <p>Registrerade kostnader i SEK</p>
          </div>
          {costReady && (
            <span className={styles.smallNumber}>
              {formatSek(max)}
              <small>högst per dag</small>
            </span>
          )}
        </div>
        {!costReady ? (
          <p role="status" className={styles.empty}>
            {dataStateLabel(model.costByDay.state)}
          </p>
        ) : (
          <>
            {!costs.some((d) => d.costSek !== 0) && (
              <p className={styles.quiet}>
                Inga registrerade kostnader under perioden.
              </p>
            )}
            <svg
              data-overview-chart="cost"
              className={styles.chart}
              viewBox="0 0 720 180"
              preserveAspectRatio="none"
              role="img"
              aria-label="Registrerad AI-kostnad per dag i kronor"
            >
              <title>AI-kostnader per dag</title>
              {[20, 90, 160].map((line) => (
                <line
                  key={line}
                  x1={0}
                  x2={720}
                  y1={line}
                  y2={line}
                  stroke="#7993aa25"
                  strokeDasharray="3 6"
                />
              ))}
              <line x1={0} x2={720} y1={y(0)} y2={y(0)} stroke="#99afc555" />
              {costs.map((day, i) => {
                const slot = 720 / Math.max(1, costs.length)
                return (
                  <rect
                    key={day.date}
                    x={i * slot + 3}
                    y={Math.min(y(day.costSek), y(0))}
                    width={Math.max(1, slot - 6)}
                    height={Math.abs(y(day.costSek) - y(0))}
                    rx={3}
                    fill={day.costSek < 0 ? '#eea283' : '#77d4c4'}
                  >
                    <title>
                      {shortDate(day.date) + ': ' + formatSek(day.costSek)}
                    </title>
                  </rect>
                )
              })}
            </svg>
            <div className={styles.axis}>
              <span>{costs[0] ? shortDate(costs[0].date) : ''}</span>
              <span>{costs.at(-1) ? shortDate(costs.at(-1)!.date) : ''}</span>
            </div>
            <details className={styles.values}>
              <summary>Visa värden</summary>
              <table>
                <caption>Registrerad kostnad per Stockholmsdygn</caption>
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>SEK</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((d) => (
                    <tr key={d.date}>
                      <th scope="row">{shortDate(d.date)}</th>
                      <td>{formatSek(d.costSek)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </section>
      <section
        className={styles.projectCost}
        aria-label="AI-kostnad per projekt"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h2>Kostnad per projekt</h2>
            <p>Under vald period</p>
          </div>
        </div>
        {!projectReady ? (
          <p role="status" className={styles.empty}>
            {dataStateLabel(model.costByProject.state)}
          </p>
        ) : projects.length ? (
          <ul className={styles.costList}>
            {projects.map((p) => (
              <li key={p.projectId}>
                <div>
                  <span>
                    {model.projects.rows.find(
                      (project) => project.id === p.projectId
                    )?.name ?? 'Projekt'}
                  </span>
                  <strong>{formatSek(p.costSek)}</strong>
                </div>
                <div className={styles.barTrack}>
                  <span className={styles.zero} style={{ left: zero + '%' }} />
                  <span
                    className={styles.bar}
                    style={{
                      left:
                        ((Math.min(0, p.costSek) - projectMin) / projectSpan) *
                          100 +
                        '%',
                      width: (Math.abs(p.costSek) / projectSpan) * 100 + '%',
                      background: p.costSek < 0 ? '#eea283' : '#77d4c4'
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>Inga projekt att jämföra.</p>
        )}
      </section>
      <section className={styles.runChart} aria-label="Körningar per dag">
        <div className={styles.sectionHeading}>
          <div>
            <h2>Körningar per dag</h2>
            <p>Nuvarande status, efter när körningen skapades</p>
          </div>
          {runReady && (
            <span
              className={styles.smallNumber}
              aria-label={'Högst ' + maximumRuns + ' körningar per dag'}
            >
              {maximumRuns}
              <small>högst per dag</small>
            </span>
          )}
        </div>
        {!runReady ? (
          <p role="status" className={styles.empty}>
            {dataStateLabel(model.runsByDay.state)}
          </p>
        ) : (
          <>
            <div className={styles.legend}>
              {statuses.map((status) => (
                <span key={status}>
                  <i
                    style={{
                      background: statusColors.get(status) ?? '#bba7de'
                    }}
                  />
                  {statusLabels.get(status) ?? 'Övrigt'}
                </span>
              ))}
            </div>
            {!runs.some((d) => Object.values(d.counts).some(Boolean)) && (
              <p className={styles.quiet}>Inga körningar under perioden.</p>
            )}
            <svg
              data-overview-chart="runs"
              className={styles.chart}
              viewBox="0 0 720 180"
              preserveAspectRatio="none"
              role="img"
              aria-label="Antal körningar per dag och nuvarande status"
            >
              <title>Körningar per dag och status</title>
              {[20, 90, 160].map((line) => (
                <line
                  key={line}
                  x1={0}
                  x2={720}
                  y1={line}
                  y2={line}
                  stroke="#7993aa25"
                  strokeDasharray="3 6"
                />
              ))}
              {runs.flatMap((day, i) => {
                let base = 160
                const slot = 720 / Math.max(1, runs.length)
                return statuses.map((status) => {
                  const count = day.counts[status] ?? 0,
                    height = (count / peak) * 140
                  base -= height
                  return (
                    <rect
                      key={day.date + status}
                      x={i * slot + 3}
                      y={base}
                      width={Math.max(1, slot - 6)}
                      height={height}
                      fill={statusColors.get(status) ?? '#bba7de'}
                    >
                      <title>
                        {shortDate(day.date) +
                          ': ' +
                          count +
                          ' ' +
                          (statusLabels.get(status) ?? 'Övrigt')}
                      </title>
                    </rect>
                  )
                })
              })}
            </svg>
            <div className={styles.axis}>
              <span>{runs[0] ? shortDate(runs[0].date) : ''}</span>
              <span>{runs.at(-1) ? shortDate(runs.at(-1)!.date) : ''}</span>
            </div>
            <details className={styles.values}>
              <summary>Visa värden</summary>
              <table>
                <caption>Antal körningar, nuvarande status</caption>
                <thead>
                  <tr>
                    <th>Datum</th>
                    {statuses.map((s) => (
                      <th key={s}>{statusLabels.get(s) ?? 'Övrigt'}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((d) => (
                    <tr key={d.date}>
                      <th scope="row">{shortDate(d.date)}</th>
                      {statuses.map((s) => (
                        <td key={s}>{d.counts[s] ?? 0}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </section>
    </div>
  )
}
