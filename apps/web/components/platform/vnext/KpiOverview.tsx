import type { ReactNode } from 'react'
import Link from 'next/link'
import { Building2, ShieldCheck, CarFront, CircleParking, Gavel, Handshake } from 'lucide-react'
import styles from './KpiOverview.module.css'

/**
 * KpiOverview — a project's key figures, first on its page. Presentation only and
 * project-neutral: it renders exactly the items it is given and computes nothing.
 *
 * HONESTY. A null value renders "Okänt" (never 0) with its stated reason. A note is
 * shown only when the caller supplies one, so no change or trend can appear that the
 * data did not state. There are no arrows and no charts here.
 */

export interface KpiItem {
  key: string
  label: string
  /** null = unavailable at the source. */
  value: number | null
  /** Why a value is unknown, or a caller-computed comparison such as "+2 sedan 2026-10-09". */
  note?: string | null
}

export interface KpiMetaItem {
  label: string
  value: ReactNode
  tone?: 'ok' | 'warning'
}

export interface KpiNotice {
  tone: 'warning' | 'error' | 'empty'
  text: string
}

export function KpiOverview({
  titleId,
  kicker,
  headline,
  activityTitle,
  activityCaption,
  activity,
  meta,
  notices,
  historyTitle,
  historyText,
  reportHref,
  reportLabel,
  prominent = false,
}: {
  titleId: string
  kicker: string
  headline: KpiItem[]
  activityTitle: string
  activityCaption: string
  activity: KpiItem[]
  meta: KpiMetaItem[]
  notices: KpiNotice[]
  historyTitle: string
  historyText: string
  reportHref: string | null
  reportLabel: string
  /** Optional, project-specific typography; defaults preserve existing UI. */
  prominent?: boolean
}) {
  return (
    <section className={styles.overview} aria-labelledby={titleId} data-prominent={prominent || undefined}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.kicker}>{kicker}</h2>
        {reportHref ? <Link href={reportHref} className={styles.reportLink}>{reportLabel} →</Link> : null}
      </div>

      <ul className={styles.headline}>
        {headline.map((item) => <KpiCard key={item.key} item={item} large visual={prominent} />)}
      </ul>

      <dl className={styles.meta}>
        {meta.map((m) => (
          <div key={m.label} className={styles.metaItem}>
            <dt>{m.label}</dt>
            <dd data-tone={m.tone}>{m.value}</dd>
          </div>
        ))}
      </dl>

      {notices.map((n) => (
        <p key={n.text} className={styles.note} data-tone={n.tone} role={n.tone === 'error' ? 'alert' : 'note'}>{n.text}</p>
      ))}

      <div className={styles.band}>
        <div className={styles.bandHead}>
          <h3 className={styles.bandTitle}>{activityTitle}</h3>
          <span className={styles.bandCaption}>{activityCaption}</span>
        </div>
        <ul className={styles.activity}>
          {activity.map((item) => <KpiCard key={item.key} item={item} />)}
        </ul>
      </div>

      <div className={styles.band}>
        <h3 className={styles.bandTitle}>{historyTitle}</h3>
        <p className={styles.history}>{historyText}</p>
      </div>
    </section>
  )
}

/** A report that cannot be shown: one honest note in place of the figures. */
export function KpiOverviewNote({
  titleId, kicker, title, text, tone, reportHref, reportLabel, prominent = false,
}: {
  titleId: string
  kicker: string
  title: string
  text: string
  tone: 'error' | 'empty'
  reportHref: string | null
  reportLabel: string
  prominent?: boolean
}) {
  return (
    <section className={styles.overview} aria-labelledby={titleId} data-prominent={prominent || undefined}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.kicker}>{kicker}</h2>
        {reportHref ? <Link href={reportHref} className={styles.reportLink}>{reportLabel} →</Link> : null}
      </div>
      <p className={styles.noteTitle}>{title}</p>
      <p className={styles.note} data-tone={tone} role={tone === 'error' ? 'alert' : 'note'}>{text}</p>
    </section>
  )
}

const marketIcons = {
  companies_registered_total: Building2,
  companies_verified_total: ShieldCheck,
  vehicles_published_active: CarFront,
  vehicles_reserved: CircleParking,
  bids_total: Gavel,
  deals_completed_total: Handshake,
} as const

function KpiCard({ item, large, visual = false }: { item: KpiItem; large?: boolean; visual?: boolean }) {
  const unknown = item.value === null
  const Icon = visual ? marketIcons[item.key as keyof typeof marketIcons] : undefined
  if (!Icon) {
    // Preserve the exact original markup for other projects and the 24h activity row.
    return (
      <li className={styles.card} data-size={large ? 'large' : 'small'} data-unknown={unknown ? 'true' : undefined}>
        <span className={styles.value}>{unknown ? 'Okänt' : item.value}</span>
        <span className={styles.label}>{item.label}</span>
        {item.note ? <span className={styles.cardNote}>{item.note}</span> : null}
      </li>
    )
  }
  return (
    <li className={styles.card} data-size={large ? 'large' : 'small'} data-unknown={unknown ? 'true' : undefined} data-visual="true">
      <span className={styles.cardIcon} aria-hidden="true"><Icon size={22} strokeWidth={1.75} /></span>
      <span className={styles.cardBody}>
        <span className={styles.value}>{item.value === null ? 'Okänt' : item.value.toLocaleString('sv-SE')}</span>
        <span className={styles.label}>{item.label}</span>
        {item.note ? <span className={styles.cardNote}>{item.note}</span> : null}
      </span>
    </li>
  )
}
