import type { projectGrowthDashboard } from '@/lib/content-growth/growth-dashboard-advisory'
import { presentGrowthDashboard } from '@/lib/content-growth/growth-dashboard-presentation'

type View = NonNullable<ReturnType<typeof presentGrowthDashboard>>
type Section = View['sections'][number]
type Row = Section['rows'][number]

const sectionNumbers = { analytics: '01', reference: '02', quality: '03', learning: '04' } as const

function AdvisoryBar({ bar }: { bar: NonNullable<Row['bar']> }) {
  // Numeric inputs originate in the validated projection; the SVG is decorative.
  const width = bar.maximum > 0 && Number.isFinite(bar.value) && Number.isFinite(bar.maximum)
    ? Math.min(100, Math.max(0, bar.value / bar.maximum * 100)) : 0
  return (
    <>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 100 5" preserveAspectRatio="none" className="mt-2 h-1.5 w-full text-indigo-400">
        <rect x="0" y="0" width="100" height="5" rx="1" fill="currentColor" opacity="0.15" />
        <rect x="0" y="0" width={width} height="5" rx="1" fill="currentColor" />
      </svg>
      {bar.caption && <span className="mt-1 block text-xs text-muted-foreground">{bar.caption}</span>}
    </>
  )
}

function MetricRows({ rows }: { rows: Row[] }) {
  return (
    <dl className="mt-4 grid min-w-0 grid-cols-2 gap-2">
      {rows.map((row, i) => (
        <div key={i} className="min-w-0 rounded-lg border border-border bg-background/40 p-3">
          <dt className="text-xs leading-snug text-muted-foreground break-words">{row.label}</dt>
          <dd className="mt-1.5 break-words text-lg font-semibold leading-tight tabular-nums sm:text-xl">
            {row.value}
            {row.bar && <AdvisoryBar bar={row.bar} />}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function SignalRows({ rows }: { rows: Row[] }) {
  return (
    <dl className="mt-3 space-y-2">
      {rows.map((row, i) => (
        <div key={i} className={row.attention
          ? 'min-w-0 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2'
          : 'min-w-0 rounded-lg border border-border px-3 py-2'}>
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="mt-0.5 break-words text-sm font-semibold">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function DetailRows({ rows }: { rows: Row[] }) {
  return (
    <dl className="mt-3 divide-y divide-border/60">
      {rows.map((row, i) => (
        <div key={i} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
          <dt className="min-w-0 break-words text-xs text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-words text-sm font-medium tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function AdvisorySection({ section }: { section: Section }) {
  const of = (kind: Row['kind']) => section.rows.filter(row => row.kind === kind)
  const metrics = of('metric'), signals = of('signal'), details = of('detail')
  const ideas = of('idea'), criteria = of('criterion'), rates = of('rate')
  return (
    <section aria-label={section.title} className="min-w-0 self-start rounded-xl border border-border bg-background/20 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden="true" className="rounded-md border border-indigo-400/25 bg-indigo-400/10 px-2 py-1 text-xs text-indigo-300 tabular-nums">{sectionNumbers[section.id]}</span>
        {section.title}
      </h3>
      <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">{section.note}</p>
      {signals.length > 0 && <SignalRows rows={signals} />}
      {metrics.length > 0 && <MetricRows rows={metrics} />}
      {ideas.length > 0 && (
        <dl className="mt-3 grid gap-2">
          {ideas.map((row, i) => (
            <div key={i} className="min-w-0 rounded-lg border border-indigo-400/20 bg-indigo-400/5 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="mt-1 break-words text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {rates.length > 0 && section.rateScale && (
        <div className="mt-4 rounded-lg border border-border p-3">
          <p className="text-xs font-semibold">Beskrivande A/B-kvoter</p>
          <p className="mt-1 text-xs text-muted-foreground">{section.rateScale}</p>
          <dl className="mt-3 space-y-3">
            {rates.map((row, i) => (
              <div key={i} className="min-w-0">
                <dt className="break-words text-xs text-muted-foreground">{row.label}</dt>
                <dd className="mt-1 break-words text-sm font-semibold tabular-nums">
                  {row.value}
                  {row.bar && <AdvisoryBar bar={row.bar} />}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {details.length > 0 && <DetailRows rows={details} />}
      {criteria.length > 0 && (
        <details className="mt-3 rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer rounded text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-400">
            Visa kriterier ({criteria.length})
          </summary>
          <DetailRows rows={criteria} />
        </details>
      )}
    </section>
  )
}

/** Inactive local candidate. Mount only after authenticated data wiring and
 * separate approval. Native disclosure is presentation-only; no queries,
 * network actions, publication controls, links or client-side data state. */
export function GrowthEngineAdvisoryCard({ projection }: { projection: ReturnType<typeof projectGrowthDashboard> }) {
  const view = presentGrowthDashboard(projection)
  if (!view) return null
  return (
    <section aria-label={view.title} className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tillväxtanalys · {view.brand}</p>
      <h2 className="mt-1 break-words text-xl font-semibold tracking-tight">{view.title} · {view.brand}</h2>
      <p className="mt-2 break-words text-sm leading-relaxed">{view.note}</p>
      <div className="mt-5 grid min-w-0 items-start gap-3 md:grid-cols-2">
        {view.sections.map(section => <AdvisorySection key={section.id} section={section} />)}
      </div>
    </section>
  )
}