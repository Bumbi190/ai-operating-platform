'use client'

import Link from 'next/link'
import { useId, useRef, useState, type CSSProperties } from 'react'
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, LoaderCircle } from 'lucide-react'
import type { AtlasHomeViewModel } from '@/lib/atlas/home-view-model'
import { resolveDestination } from '@/lib/nav/registry'
import { useDismissOnOutside } from './useDismissOnOutside'
import styles from './AtlasHomeVNext.module.css'

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

interface ActivitySystemRailProps {
  model: AtlasHomeViewModel
}

/**
 * "Aktiv övervakning" — the mockup's left summary card.
 *
 * The face line is built only from numbers the server actually read; a figure
 * whose source failed is left out rather than shown as zero. The panel above
 * the card holds the operational detail the old right-hand rail carried.
 */
export function ActivitySystemRail({ model }: ActivitySystemRailProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLElement>(null)
  useDismissOnOutside(rootRef, open, () => setOpen(false))

  const activityHref = resolveDestination('activity')?.href ?? '/agent-activity'
  const failedActivityHref = resolveDestination('activity', { filters: { status: 'failed' } })?.href ?? '/agent-activity?status=failed'
  const approvalsHref = resolveDestination('approvals')?.href ?? '/approvals'

  const summary = [
    `${model.totals.projects} projekt`,
    model.totals.runningRuns !== null ? `${model.totals.runningRuns} körningar` : null,
    model.totals.pendingApprovals !== null ? `${model.totals.pendingApprovals} väntar beslut` : null,
  ].filter(Boolean).join(' · ')

  return (
    <section ref={rootRef} className={styles.summaryCard} data-open={open || undefined} aria-label="Aktiv övervakning">
      <button
        type="button"
        className={styles.summaryButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.summaryIcon} aria-hidden="true"><Activity size={22} strokeWidth={1.7} /></span>
        <span className={styles.summaryCopy}>
          <span className={styles.summaryTitle}>Aktiv övervakning</span>
          <span className={styles.summarySub}>{summary}</span>
        </span>
        <ChevronDown className={styles.summaryChevron} size={18} aria-hidden="true" />
      </button>

      <div id={panelId} className={styles.summaryPanel} hidden={!open}>
        <div className={styles.railHeading}>
          <div>
            <p className={styles.sectionKicker}>Nu</p>
            <h2>Arbetsläge</h2>
          </div>
        </div>
        <div className={styles.statusList}>
          {model.totals.runningRuns !== null ? (
            <Link href={activityHref}>
              <LoaderCircle size={15} aria-hidden="true" />
              <span>Körningar</span>
              <strong>{model.totals.runningRuns}</strong>
            </Link>
          ) : null}
          {model.totals.pendingApprovals !== null ? (
            <Link href={approvalsHref}>
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>Väntar beslut</span>
              <strong>{model.totals.pendingApprovals}</strong>
            </Link>
          ) : null}
          {model.totals.failedRuns24h !== null ? (
            <Link href={failedActivityHref}>
              <AlertTriangle size={15} aria-hidden="true" />
              <span>Fel · 24 h</span>
              <strong>{model.totals.failedRuns24h}</strong>
            </Link>
          ) : null}
        </div>
        {!model.availability.runs || !model.availability.approvals ? (
          <p className={styles.dataNotice}>Vissa driftdata kunde inte läsas och visas därför inte.</p>
        ) : null}

        <div className={styles.railHeading} data-spaced="true">
          <div>
            <p className={styles.sectionKicker}>Senaste</p>
            <h2>Aktivitet</h2>
          </div>
          <Link href={activityHref} aria-label="Visa all aktivitet"><ArrowRight size={16} /></Link>
        </div>
        {model.activity.length > 0 ? (
          <div className={styles.activityList}>
            {model.activity.slice(0, 5).map((item) => (
              <Link key={item.id} href={item.href} className={styles.activityItem}>
                <span
                  className={styles.activityDot}
                  data-attention={item.requiresAttention}
                  style={{ '--project-color': item.projectColor } as CSSProperties}
                />
                <span className={styles.activityCopy}>
                  <strong>{item.title}</strong>
                  <span>{item.projectName} · {timeLabel(item.timestamp)}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className={styles.dataNotice}>Ingen projektaktivitet att visa.</p>
        )}
      </div>

    </section>
  )
}
