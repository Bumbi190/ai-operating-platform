import type { RealDealerMetricsV3 } from '@/lib/atlas/project-analytics/handlarborsen-real-dealer-v3'
import { companyPopulation } from '@/lib/atlas/project-analytics/handlarborsen-company-population'
import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import type { HandlarborsenTraffic } from '@/lib/atlas/project-analytics/handlarborsen-posthog-traffic'
import { deriveHandlarborsenGrowthBrief } from '@/lib/atlas/project-analytics/handlarborsen-growth-brief'

type Step = { title: string; value: number | null; note: string }

function safeCount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

/**
 * Two independent measurement populations displayed together, never divided:
 * - opt-in PostHog /registrera pageviews in the recent seven UTC dates
 * - audited Handlarbörsen cumulative company totals at snapshot observation time.
 * This is NOT a user-level conversion funnel or a cohort attribution claim.
 */
export function registrationJourneySteps(
  report: MarketplaceReport,
  traffic?: HandlarborsenTraffic | null,
  realDealerMetrics?: RealDealerMetricsV3 | null,
  now = new Date(),
): Step[] {
  const population = companyPopulation(report, now, realDealerMetrics)
  const { registered, verified } = population
  const sourceNote = realDealerMetrics !== undefined
    ? population.observedAt
      ? 'Handlarbörsens v3-API · classified_real_external_dealers · observerad ' + population.observedAt
      : 'Handlarbörsens v3-API · verifierat underlag ej tillgängligt; inga äldre antal används'
    : population.observedAt
      ? 'Handlarbörsen · totalt till ' + population.observedAt.slice(0, 10) + ' UTC'
      : 'Handlarbörsen · verifierad produktionsrapport saknas'
  const trafficValue = traffic?.status === 'available' ? safeCount(traffic.registrationPageviews) : null

  return [
    {
      title: 'Registreringssidans visningar',
      value: trafficValue,
      note: traffic?.status === 'available'
        ? `PostHog · 7 UTC-dagar: ${traffic.firstDate}–${traffic.lastDate} · kräver analyssamtycke`
        : 'PostHog · trafikdata ej tillgänglig',
    },
    {
      title: realDealerMetrics !== undefined ? 'Riktiga externa handlare' : 'Registrerade företag',
      value: registered,
      note: sourceNote,
    },
    {
      title: realDealerMetrics !== undefined ? 'Verifierade externa handlare' : 'Verifierade företag',
      value: verified,
      note: sourceNote,
    },
  ]
}

export function HandlarborsenRegistrationJourney({
  report,
  traffic,
  realDealerMetrics,
  now,
}: {
  report: MarketplaceReport
  traffic?: HandlarborsenTraffic | null
  realDealerMetrics?: RealDealerMetricsV3 | null
  now: Date
}) {
  const steps = registrationJourneySteps(report, traffic, realDealerMetrics, now)
  const brief = deriveHandlarborsenGrowthBrief(report, traffic, now, realDealerMetrics)
  return (
    <section aria-labelledby="hb-registration-journey-title"
      className="my-6 rounded-2xl border border-sky-400/20 bg-slate-950/40 p-5 text-slate-100">
      <p className="text-xs font-semibold uppercase tracking-widest text-sky-300">Handlarbörsen / tillväxt</p>
      <h2 id="hb-registration-journey-title" className="mt-2 text-xl font-semibold">Från intresse till verifierad handlare</h2>
      <p className="mt-2 text-sm text-slate-300">
        Tre separata mätvärden från två källor. Ingen konverteringsgrad beräknas eftersom
        sidvisningar och företagsantal inte avser samma användare eller tidsperiod.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4" key={step.title}>
            <p className="text-xs text-slate-400">Steg {index + 1}</p>
            <h3 className="mt-1 text-sm font-medium">{step.title}</h3>
            <strong className="mt-3 block text-3xl tabular-nums">
              {step.value === null ? '—' : step.value.toLocaleString('sv-SE')}
            </strong>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">{step.note}</p>
          </div>
        ))}
      </div>
      <aside aria-labelledby="hb-growth-brief-title" className="mt-5 rounded-xl border border-sky-400/20 bg-sky-950/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">Nova · granskningsunderlag</p>
        <h3 id="hb-growth-brief-title" className="mt-2 text-base font-semibold">{brief.headline}</h3>
        <p className="mt-1 text-xs text-slate-300">Regelbaserad rapport · ingen AI-genererad analys eller automatisk åtgärd</p>
        {brief.observations.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{brief.observations.map(item => <li key={item}>{item}</li>)}</ul>}
        <p className="mt-4 text-sm font-semibold">Föreslagna manuella kontroller</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-300">{brief.checks.map(item => <li key={item}>{item}</li>)}</ul>
        <details className="mt-4 text-xs text-slate-300"><summary className="cursor-pointer">Källor och observationsperioder</summary><ul className="mt-2 list-disc space-y-1 pl-5">{brief.provenance.map(item => <li key={item}>{item}</li>)}</ul></details>
      </aside>
      <p className="mt-4 text-xs text-slate-400">
        En sidvisning är inte en person eller en påbörjad ansökan. Företagsantal kommer från
        Handlarbörsens angivna datakälla vid dess observationstid och kan avse en annan tid än trafikstatistiken.
      </p>
    </section>
  )
}
