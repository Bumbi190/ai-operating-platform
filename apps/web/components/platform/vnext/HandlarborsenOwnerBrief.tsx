import Link from 'next/link'
import { ArrowUpRight, Bot, ClipboardList, DatabaseZap } from 'lucide-react'
import { resolveDestination } from '@/lib/nav/registry'
import type { ProjectCommandCenterModel, CommandCenterSection } from '@/lib/os/project-command-center'
import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { COLLECTION_TODAY_LABELS, COMPLETENESS_LABELS, STALE_AFTER_HOURS, formatStockholm } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import styles from './HandlarborsenOwnerBrief.module.css'

type BriefModel = Pick<ProjectCommandCenterModel, 'agents' | 'workflows' | 'links'>

function sectionCount(section: Pick<CommandCenterSection<unknown>, 'state' | 'total'>): string {
  if (section.state !== 'ok' || section.total === null) return 'Okänt'
  return String(section.total)
}

function reportStatus(report: MarketplaceReport): { headline: string; detail: string; tone: 'ok' | 'warning' | 'neutral' } {
  if (report.state === 'ok' && report.latest) {
    const latest = report.latest
    return {
      headline: latest.freshness === 'stale' ? `Rapporten är äldre än ${STALE_AFTER_HOURS} timmar` : 'Senaste rapporten är sparad',
      detail: `${formatStockholm(latest.observedAt)} · ${COMPLETENESS_LABELS[latest.completeness].toLowerCase()} datakvalitet`,
      tone: latest.freshness === 'stale' || latest.completeness !== 'complete' ? 'warning' : 'ok',
    }
  }

  if (report.state === 'read_failed') return {
    headline: 'Statistiken kunde inte läsas',
    detail: 'Det går inte att bedöma senaste insamlingen just nu.',
    tone: 'warning',
  }
  if (report.state === 'invalid_snapshot') return {
    headline: 'Rapporten gick inte att verifiera',
    detail: 'Inga osäkra mätvärden visas.',
    tone: 'warning',
  }
  return {
    headline: report.state === 'not_enabled' ? 'Statistiken är inte tillgänglig' : 'Ingen sparad rapport ännu',
    detail: 'Inga mätvärden visas innan de kan verifieras.',
    tone: 'neutral',
  }
}

/**
 * Handlarbörsen-only leadership shortcuts. A presentational surface, not a
 * workflow or an automation engine: no RPC, no write and no inferred KPIs.
 *
 * All counts come from the scoped Project Command Center model. Report state
 * comes from the separately authorized marketplace reader; an unreadable
 * quantity is never treated as zero.
 */
export function HandlarborsenOwnerBrief({ model, report }: { model: BriefModel; report: MarketplaceReport }) {
  const source = reportStatus(report)
  const chatHref = resolveDestination('chat')?.href
  const agentsCount = sectionCount(model.agents)
  const workflowsCount = sectionCount(model.workflows)
  const noAutomation = model.agents.state === 'ok'
    && model.workflows.state === 'ok'
    && model.agents.total === 0
    && model.workflows.total === 0

  return (
    <section className={styles.section} aria-labelledby="hb-owner-brief-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.kicker}>Handlarbörsen · Arbetsöversikt</p>
          <h2 id="hb-owner-brief-title">Nästa steg för projektet</h2>
        </div>
        <span className={styles.readOnly}>Underlag för dina beslut</span>
      </div>
      <a className={styles.link} href="/projects/handlarborsen/competitors">Öppna Konkurrentspanaren</a>

      <div className={styles.cards}>
        <article className={styles.card}>
          <div className={styles.cardTop}><Bot size={19} aria-hidden="true" /><span>01 · Atlas</span></div>
          <h3>Analysera med Atlas</h3>
          <p>Ställ en fråga som nämner <strong>Handlarbörsen</strong>. Atlas kan då använda den senast sparade, verifierade rapporten, om den finns, som underlag.</p>
          {chatHref ? <Link className={styles.link} href={chatHref}>Öppna Atlas-chatt <ArrowUpRight size={15} aria-hidden="true" /></Link> : null}
        </article>

        <article className={styles.card}>
          <div className={styles.cardTop}><ClipboardList size={19} aria-hidden="true" /><span>02 · Automationer</span></div>
          <h3>Bygg arbetsflödet</h3>
          <dl className={styles.counts}>
            <div><dt>Agenter</dt><dd>{agentsCount}</dd></div>
            <div><dt>Workflows</dt><dd>{workflowsCount}</dd></div>
          </dl>
          <p>{noAutomation
            ? 'Inga agenter eller workflows är skapade för projektet ännu. Vi kan börja med ett granskningsbart supportflöde.'
            : 'Öppna projektets befintliga agenter och workflows för att se vad som kan förberedas. Inget aktiveras här.'}</p>
          <div className={styles.links}>
            {model.links.agents ? <Link className={styles.link} href={model.links.agents}>Visa agenter <ArrowUpRight size={15} aria-hidden="true" /></Link> : null}
            {model.links.workflows ? <Link className={styles.link} href={model.links.workflows}>Visa workflows <ArrowUpRight size={15} aria-hidden="true" /></Link> : null}
          </div>
        </article>

        <article className={styles.card} data-tone={source.tone}>
          <div className={styles.cardTop}><DatabaseZap size={19} aria-hidden="true" /><span>03 · Datagrund</span></div>
          <h3>{source.headline}</h3>
          <p>{source.detail}</p>
          {report.collection ? (
            <p className={styles.collection}>Dagens insamling: {COLLECTION_TODAY_LABELS[report.collection.today].value.toLowerCase()}.</p>
          ) : null}
          {model.links.marketplace ? (
            <Link className={styles.link} href={model.links.marketplace}>Öppna statistikrapport <ArrowUpRight size={15} aria-hidden="true" /></Link>
          ) : null}
        </article>
      </div>
    </section>
  )
}
