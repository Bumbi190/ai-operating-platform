import type { InstagramGrowthPanel } from '@/lib/content-growth/instagram-read'

const count = (n: number) => new Intl.NumberFormat('sv-SE').format(n)
const percent = (n: number | null) => n === null ? 'Saknas' : `${(n * 100).toFixed(1).replace('.', ',')} %`

/**
 * Server-rendered, read-only. All data is already authorization-scoped before
 * reaching this component; no browser tokens or Meta calls.
 */
export function InstagramGrowthCard({ panel }: { panel: InstagramGrowthPanel }) {
  if (panel.status === 'no_access') return null

  const title = 'Instagram · innehållsanalys'
  if (panel.status !== 'ready') {
    return (
      <section aria-label={title} className="rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {panel.status === 'unavailable'
            ? 'Insiktsdata kunde inte läsas. Inga resultat antas.'
            : 'Ingen tillräcklig Instagram-data med uppmätta visningar än. Atlas väntar på insikter från befintlig koppling.'}
        </p>
      </section>
    )
  }

  const { summary, lastFetchedAt } = panel
  const ranked = [...summary.posts]
    .filter(post => post.viewMultiple !== null)
    .sort((a, b) => (b.viewMultiple ?? 0) - (a.viewMultiple ?? 0))
  const highest = ranked[0]
  const label = summary.confidence === 'insufficient'
    ? 'För litet urval för slutsatser'
    : summary.confidence === 'exploratory'
      ? 'Utforskande mönster, inte bevis'
      : 'Beskrivande resultat, inte prognos'

  return (
    <section aria-label={title} className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <span className="text-xs text-muted-foreground">{label} · {summary.sampleSize} inlägg</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Medianvisningar</p>
          <p className="text-lg font-semibold">{summary.medianViews === null ? 'Saknas' : count(summary.medianViews)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Starkaste inlägg / median</p>
          <p className="text-lg font-semibold">{highest?.viewMultiple == null ? 'Saknas' : `${highest.viewMultiple.toFixed(1).replace('.', ',')}×`}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Delningar / räckvidd (toppinlägg)</p>
          <p className="text-lg font-semibold">{percent(highest?.sharesPerReach ?? null)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sparningar / räckvidd (toppinlägg)</p>
          <p className="text-lg font-semibold">{percent(highest?.savesPerReach ?? null)}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {lastFetchedAt
          ? `Senast hämtad Insights-data: ${new Date(lastFetchedAt).toLocaleDateString('sv-SE')}. `
          : 'Hämtningstid saknas. '}
        {panel.skippedUnknownViews > 0 ? `${panel.skippedUnknownViews} rader saknar visningsdata. ` : ''}
        Insikterna är historiska, från detta konto – inga förutsägelser om viralitet.
      </p>
    </section>
  )
}
