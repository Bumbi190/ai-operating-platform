import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import {
  buildHandlarborsenTrendPanels,
  trendLineSegments,
  type TrendObservation,
  type TrendPanelModel,
} from '@/lib/atlas/project-analytics/handlarborsen-trends'
import styles from './HandlarborsenTrends.module.css'

/** Server-rendered, dependency-free charts. Zero new client-side chart JS and
 * zero new DB requests. The exact source is the validated report already used
 * by the project KPI, pulse and Atlas fact block. */
export function HandlarborsenTrends({ report }: { report: MarketplaceReport }) {
  const panels = buildHandlarborsenTrendPanels(report)
  if (panels.length === 0) return null
  const history = panels[0].mode === 'history'

  return (
    <section className={styles.section} aria-labelledby="hb-trend-heading">
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>MARKNADSPLATS / DATA</p>
          <h2 className={styles.heading} id="hb-trend-heading">
            Utveckling och nuläge
          </h2>
        </div>
        <span className={styles.mode}>
          {history ? 'Historiska mätpunkter' : 'Senaste dagsrapport'}
        </span>
      </div>
      <p className={styles.intro}>
        {history
          ? 'Historik för sparade UTC-rapporter. Saknade dagar och okända värden fylls inte i.'
          : 'Ännu finns bara en dagsrapport. Staplarna visar uppmätta nivåer, inte en historisk trend.'}
      </p>
      {!history && (
        <div className={styles.historyEmpty} role="note" aria-labelledby="hb-history-empty">
          <div className={styles.observation}>
            <span className={styles.observationPoint} aria-hidden="true" />
            <time dateTime={panels[0].observations[0].date}>{panels[0].observations[0].date} · UTC</time>
            <span>En faktisk observation</span>
          </div>
          <div>
            <h3 id="hb-history-empty">Historiken börjar här</h3>
            <p>En andra verifierad, sparad UTC-dagsrapport behövs innan en verklig historisk graf kan visas. Nedan jämförs exakta antal från den enda observationen.</p>
          </div>
        </div>
      )}
      <div className={styles.grid}>
        {panels.map((panel) => (
          <TrendCard key={panel.id} panel={panel} />
        ))}
      </div>
    </section>
  )
}

function TrendCard({ panel }: { panel: TrendPanelModel }) {
  const latest = panel.observations[panel.observations.length - 1]
  return (
    <article
      className={styles.card}
      data-kind={panel.id}
      aria-labelledby={`hb-trend-${panel.id}`}
    >
      <header className={styles.cardHeader}>
        <h3 id={`hb-trend-${panel.id}`} className={styles.cardTitle}>
          {panel.title}
        </h3>
        <p className={styles.cardDescription}>{panel.description}</p>
      </header>
      {panel.mode === 'history' ? (
        <HistoryPlot panel={panel} />
      ) : (
        <SnapshotBars panel={panel} />
      )}
      {panel.mode === 'history' ? (
        <dl className={styles.legend}>
          <LegendValue
            color="first"
            label={panel.first.label}
            value={latest.first}
          />
          <LegendValue
            color="second"
            label={panel.second.label}
            value={latest.second}
          />
        </dl>
      ) : null}
      <p className={styles.dateNote}>
        Senast uppmätt {latest.date}
        {panel.mode === 'history'
          ? ` · ${panel.observations.length} sparade dagar`
          : ''}
      </p>
      <p className={styles.disclaimer}>{panel.note}</p>
      {panel.mode === 'history' ? (
        <details className={styles.details}>
          <summary>Visa exakta historiska värden</summary>
          <table className={styles.valuesTable}>
            <thead>
              <tr>
                <th>Datum</th>
                <th scope="col">{panel.first.label}</th>
                <th scope="col">{panel.second.label}</th>
              </tr>
            </thead>
            <tbody>
              {panel.observations.map((row) => (
                <tr key={row.date}>
                  <th scope="row">{row.date}</th>
                  <td>{formatValue(row.first)}</td>
                  <td>{formatValue(row.second)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </article>
  )
}

function formatValue(value: number | null) {
  return value === null ? 'Okänt' : value.toLocaleString('sv-SE')
}

function LegendValue({
  color,
  label,
  value,
}: {
  color: 'first' | 'second'
  label: string
  value: number | null
}) {
  return (
    <div className={styles.legendItem}>
      <dt className={styles.legendLabel}>
        <span
          className={color === 'first' ? styles.firstDot : styles.secondDot}
          aria-hidden="true"
        />
        {label}
      </dt>
      <dd
        className={styles.legendValue}
        data-unknown={value === null ? 'true' : undefined}
      >
        {formatValue(value)}
      </dd>
    </div>
  )
}

function SnapshotBars({ panel }: { panel: TrendPanelModel }) {
  const row = panel.observations[panel.observations.length - 1]
  const max = Math.max(1, row.first ?? 0, row.second ?? 0)
  const bars = [
    { label: panel.first.label, value: row.first, color: 'first' },
    { label: panel.second.label, value: row.second, color: 'second' },
  ] as const
  return (
    <div className={styles.bars} aria-label={`Uppmätta nivåer för ${row.date}`}>
      {bars.map((bar) => (
        <div key={bar.color} className={styles.barGroup}>
          <div className={styles.barTitle}>
            <span>{bar.label}</span>
            <strong>{formatValue(bar.value)}</strong>
          </div>
          <div className={styles.track}>
            {bar.value !== null ? (
              <span
                className={
                  bar.color === 'first' ? styles.firstFill : styles.secondFill
                }
                style={{ width: `${(bar.value / max) * 100}%` }}
              />
            ) : (
              <span className={styles.unknown}>Värde saknas</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// No data points between dates are synthesized. Even if two readings are
// separated by several days, SVG only draws two points (not a continuous line).
// Unknown values remain unconnected. True zeros are plotted at zero.
function HistoryPlot({ panel }: { panel: TrendPanelModel }) {
  const data = panel.observations
  const left = 30
  const right = 402
  const top = 16
  const bottom = 155
  const dates = data.map((row) => Date.parse(row.date + 'T00:00:00Z'))
  const minDate = dates[0]
  const span = Math.max(1, dates[dates.length - 1] - minDate)
  const peak = Math.max(
    1,
    ...data.flatMap((row) =>
      [row.first, row.second].filter(
        (value): value is number => value !== null,
      ),
    ),
  )
  const x = (index: number) =>
    left + ((dates[index] - minDate) / span) * (right - left)
  const y = (value: number) => bottom - (value / peak) * (bottom - top)
  const first = trendLineSegments(data, 'first')
  const second = trendLineSegments(data, 'second')

  return (
    <div className={styles.plotWrap}>
      <svg
        className={styles.plot}
        viewBox="0 0 438 188"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Historik för ${panel.title} från ${data[0].date} till ${data[data.length - 1].date}. Exakta värden finns i tabellen nedanför.`}
      >
        <line
          className={styles.axis}
          x1={left}
          x2={right}
          y1={bottom}
          y2={bottom}
        />
        <line
          className={styles.gridLine}
          x1={left}
          x2={right}
          y1={top}
          y2={top}
        />
        <line
          className={styles.gridLine}
          x1={left}
          x2={right}
          y1={(top + bottom) / 2}
          y2={(top + bottom) / 2}
        />
        <text className={styles.tick} x={left - 8} y={top + 4} textAnchor="end">
          {peak}
        </text>
        <text
          className={styles.tick}
          x={left - 8}
          y={bottom + 4}
          textAnchor="end"
        >
          0
        </text>
        <text className={styles.tick} x={left} y={bottom + 20}>
          {dateLabel(data[0])}
        </text>
        <text
          className={styles.tick}
          x={right}
          y={bottom + 20}
          textAnchor="end"
        >
          {dateLabel(data[data.length - 1])}
        </text>
        {first.map(([a, b]) => (
          <line
            key={`a-${a}-${b}`}
            className={styles.firstLine}
            x1={x(a)}
            y1={y(data[a].first!)}
            x2={x(b)}
            y2={y(data[b].first!)}
          />
        ))}
        {second.map(([a, b]) => (
          <line
            key={`b-${a}-${b}`}
            className={styles.secondLine}
            x1={x(a)}
            y1={y(data[a].second!)}
            x2={x(b)}
            y2={y(data[b].second!)}
          />
        ))}
        {data.map((row, i) =>
          row.first === null ? null : (
            <circle
              key={`a-${row.date}`}
              className={styles.firstPoint}
              cx={x(i)}
              cy={y(row.first)}
              r={3.7}
            />
          ),
        )}
        {data.map((row, i) =>
          row.second === null ? null : (
            <circle
              key={`b-${row.date}`}
              className={styles.secondPoint}
              cx={x(i)}
              cy={y(row.second)}
              r={3.7}
            />
          ),
        )}
      </svg>
    </div>
  )
}

function dateLabel(row: TrendObservation) {
  return row.date.slice(5)
}
