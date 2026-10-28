import Link from 'next/link'
import { ArrowUpRight, BarChart3, Bot, Compass, ShieldCheck } from 'lucide-react'
import { deriveHandlarborsenInsights } from '@/lib/atlas/project-analytics/handlarborsen-insights'
import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import type { HandlarborsenTraffic } from '@/lib/atlas/project-analytics/handlarborsen-posthog-traffic'
import type { HandlarborsenOverviewModel } from '@/lib/atlas/project-analytics/handlarborsen-overview'
import { resolveDestination } from '@/lib/nav/registry'
import styles from './HandlarborsenExecutiveSummary.module.css'

const number = (value: number | null) => value === null ? 'Okänt' : value.toLocaleString('sv-SE')

/**
 * Decision-first summary of *existing* authorized reports. No network calls,
 * identity inference, LLM claims, DB writes, or fake competitive intelligence.
 */
export function HandlarborsenExecutiveSummary({
  report,
  model,
  traffic,
  now,
}: {
  report: MarketplaceReport
  model: HandlarborsenOverviewModel
  traffic?: HandlarborsenTraffic | null
  now: Date
}) {
  if (model.kind !== 'kpi' || report.state !== 'ok' || !report.latest) return null

  const byKey = new Map(model.headline.map((item) => [item.key, item]))
  const registered = byKey.get('companies_registered_total')?.value ?? null
  const verified = byKey.get('companies_verified_total')?.value ?? null
  const trustworthyRatio = registered !== null && verified !== null
    && registered > 0 && verified <= registered
  const verifiedPercent = trustworthyRatio ? Math.round((verified! / registered!) * 100) : null
  const actualTraffic = traffic?.status === 'available' ? traffic.totalPageviews : null
  const insights = deriveHandlarborsenInsights(report, now)
  const mainInsight = insights.insights.find((insight) => insight.kind === 'proposal')
    ?? insights.insights.find((insight) => insight.kind === 'fact')
  const freshness = report.latest.freshness === 'fresh' ? 'Aktuell rapport' : 'Äldre rapport'
  const chatHref = resolveDestination('chat')?.href

  const metrics = [
    { label: 'Verifierade handlare', value: verified, note: 'Totalt · Handlarbörsen' },
    { label: 'Publicerade fordon', value: byKey.get('vehicles_published_active')?.value ?? null, note: 'Aktuellt antal' },
    { label: 'Bud totalt', value: byKey.get('bids_total')?.value ?? null, note: 'Ackumulerat' },
    { label: 'Sidvisningar', value: actualTraffic, note: 'Senaste 7 UTC-dagarna · PostHog' },
  ]

  return (
    <section className={styles.shell} aria-labelledby="hb-executive-heading">
      <div className={styles.topline}>
        <div>
          <p className={styles.kicker}>Handlarbörsen / Ledningsöversikt</p>
          <h2 id="hb-executive-heading">Det viktigaste just nu</h2>
          <p className={styles.subline}>Uppmätta värden och tydliga nästa steg. Detaljerna finns längre ner.</p>
          <a className={styles.quickLink} href="#hb-workflow-drafts">
            Visa arbetsflödesförslag <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
        <span className={styles.quality} data-stale={report.latest.freshness === 'stale'}>
          <ShieldCheck size={15} aria-hidden="true" />
          {freshness} · {report.latest.snapshotDate}
        </span>
      </div>

      <div className={styles.kpis}>
        {metrics.map((item) => (
          <div className={styles.kpi} key={item.label}>
            <span className={styles.kpiLabel}>{item.label}</span>
            <strong className={styles.kpiValue} data-unknown={item.value === null}>{number(item.value)}</strong>
            <small className={styles.kpiNote}>{item.note}</small>
          </div>
        ))}
      </div>

      <div className={styles.insightRow}>
        <article className={styles.progress}>
          <div className={styles.rowTitle}><BarChart3 size={17} aria-hidden="true" /><h3>Handlare · verifiering</h3></div>
          <div className={styles.progressNumbers}>
            <strong>{verifiedPercent === null ? 'Ej beräkningsbart' : verifiedPercent + ' %'}</strong>
            <span>{number(verified)} verifierade av {number(registered)} registrerade</span>
          </div>
          {verifiedPercent !== null ? (
            <div className={styles.track} role="progressbar" aria-label="Andel verifierade registrerade företag" aria-valuemin={0} aria-valuemax={100} aria-valuenow={verifiedPercent}>
              <span style={{ width: verifiedPercent + '%' }} />
            </div>
          ) : <p className={styles.missing}>Visas när båda källvärdena finns och kan jämföras.</p>}
          <p className={styles.explain}>En andel av registrerade företag, inte kundkonvertering eller antal aktiva köpare.</p>
        </article>

        <article className={styles.atlas}>
          <div className={styles.rowTitle}><Bot size={18} aria-hidden="true" /><h3>Atlas · lägesbild</h3></div>
          {report.latest.freshness === 'stale'
            ? <p>Senaste rapporten är äldre än 26 timmar. Kontrollera datans aktualitet innan nya beslut.</p>
            : mainInsight
              ? <p>{mainInsight.observation}</p>
              : <p>Ingen ny affärsinsikt kan styrkas med det tillgängliga underlaget.</p>}
          <p className={styles.explain}>Regelbaserad sammanfattning från den verifierade rapporten · inga åtgärder utförda.</p>
          {chatHref ? <Link href={chatHref}>Be Atlas fördjupa analysen <ArrowUpRight size={14} aria-hidden="true" /></Link> : null}
        </article>

        <article className={styles.competitors}>
          <div className={styles.rowTitle}><Compass size={18} aria-hidden="true" /><h3>Konkurrentbevakning</h3></div>
          <p>Kontrollera daterade offentliga källor och granska hypoteser innan de blir projektplaner.</p>
          <p className={styles.explain}>Manuell, källbegränsad kontroll · ingen automatisk publicering eller exekvering.</p>
          <Link href="/projects/handlarborsen/competitors">Öppna Konkurrentspanaren <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </article>
      </div>
    </section>
  )
}
