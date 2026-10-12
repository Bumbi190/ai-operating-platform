import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import {
  buildHandlarborsenTrendPanels,
  trendLineSegments,
  type TrendPanelModel,
} from '@/lib/atlas/project-analytics/handlarborsen-trends'
import styles from './HandlarborsenTrends.module.css'

/** Server-rendered, dependency-free charts. Zero new client-side chart JS and
 * zero new DB requests. The exact source is the validated report already used
 * by the project KPI, pulse and Atlas fact block. */
export function HandlarborsenTrends({ report }: { report: MarketplaceReport }) {
  const panels = buildHandlarborsenTrendPanels(report)
  if (panels.length === 0) return null
  const history = panels[0].mode !== 'snapshot'
  const comparison = panels[0].mode === 'comparison'
  const gap = comparison &&
    Date.parse(panels[0].observations[1].date) - Date.parse(panels[0].observations[0].date) > 86_400_000

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
          {comparison ? 'Två sparade mätdagar' : history ? 'Historiska mätpunkter' : 'Senaste dagsrapport'}
        </span>
      </div>
      <p className={styles.intro}>
        {comparison
          ? `Jämförelse av två sparade mätdagar${gap ? '; värden saknas däremellan.' : ' i följd.'} Endast uppmätta värden visas.`
          : history
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
      {panel.mode === 'comparison' ? (
        <ComparisonBars panel={panel} />
      ) : panel.mode === 'history' ? (
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
        {panel.mode !== 'snapshot'
          ? ` · ${panel.observations.length} sparade dagar`
          : ''}
      </p>
      <p className={styles.disclaimer}>{panel.note}</p>
      {panel.mode !== 'snapshot' ? (
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

/** Both dates share one zero-based scale. Null has a label, never a bar. */
function ComparisonBars({ panel }: { panel: TrendPanelModel }) {
  const peak = Math.max(1, ...panel.observations.flatMap((row) => [row.first ?? 0, row.second ?? 0]))
  return (
    <div className={styles.comparison} aria-label={`Jämförelse för ${panel.title}. Gemensam skala från 0 till ${formatValue(peak)}.`}>
      <p className={styles.scaleNote}>Antal · gemensam skala 0–{formatValue(peak)}</p>
      {panel.observations.map((row) => (
        <div className={styles.dateGroup} key={row.date}>
          <time className={styles.comparisonDate} dateTime={row.date}>{row.date} <span>UTC</span></time>
          {([
            { ...panel.first, value: row.first, color: 'first' },
            { ...panel.second, value: row.second, color: 'second' },
          ] as const).map((bar) => (
            <div className={styles.barGroup} key={bar.key} data-series={bar.color} data-unknown={bar.value === null ? 'true' : undefined}>
              <div className={styles.barTitle}>
                <span>{bar.label}</span>
                <strong>{formatValue(bar.value)}</strong>
              </div>
              <div className={styles.track} aria-hidden="true">
                {bar.value !== null && (
                  <span className={bar.color === 'first' ? styles.firstFill : styles.secondFill}
                    style={{ width: `${(bar.value / peak) * 100}%` }} />
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// No data points between dates are synthesized.
// Unknown values remain unconnected. True zeros are plotted at zero.
function HistoryPlot({ panel }: { panel: TrendPanelModel }) {
  const data = panel.observations
  const left = 62
  const right = 402
  const top = 24
  const bottom = 155
  const dates = data.map((row) => Date.parse(row.date + 'T00:00:00Z'))
  const minDate = dates[0]
  const span = Math.max(1, dates[dates.length - 1] - minDate)
  const peak = Math.ceil(1.15 * Math.max(
    1,
    ...data.flatMap((row) =>
      [row.first, row.second].filter(
        (value): value is number => value !== null,
      ),
    ),
  ))
  const x = (index: number) =>
    left + ((dates[index] - minDate) / span) * (right - left)
  const y = (value: number) => bottom - (value / peak) * (bottom - top)
  const first = trendLineSegments(data, 'first')
  const second = trendLineSegments(data, 'second')

  return (
    <div className={styles.plotWrap}>
      <p className={styles.scaleNote}>Antal · endast sparade UTC-mätdagar</p>
      <svg
        className={styles.plot}
        viewBox="0 0 438 210"
        style={{ minWidth: Math.max(340, data.length * 44) }}
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
          {formatValue(peak)}
        </text>
        <text
          className={styles.tick}
          x={left - 8}
          y={bottom + 4}
          textAnchor="end"
        >
          0
        </text>
        {data.map((row, i) => (
          <text key={row.date} className={styles.tick} x={x(i)}
            y={bottom + 22 + (i % 2) * 18} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>
            {row.date.slice(8)} / {row.date.slice(5, 7)}
          </text>
        ))}
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
              r={4.5}
            ><title>{`${row.date} · ${panel.first.label}: ${formatValue(row.first)}`}</title></circle>
          ),
        )}
        {data.map((row, i) =>
          row.second === null ? null : (
            <rect
              key={`b-${row.date}`}
              className={styles.secondPoint}
              x={x(i) - 6}
              y={y(row.second) - 6}
              width={12}
              height={12}
              rx={2}
            ><title>{`${row.date} · ${panel.second.label}: ${formatValue(row.second)}`}</title></rect>
          ),
        )}
      </svg>
    </div>
  )
}
