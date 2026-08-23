import Link from 'next/link'
import type { CSSProperties } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, LoaderCircle } from 'lucide-react'
import type { AtlasHomeViewModel } from '@/lib/atlas/home-view-model'
import { resolveDestination } from '@/lib/nav/registry'
import styles from './AtlasHomeVNext.module.css'

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

interface ActivitySystemRailProps {
  model: AtlasHomeViewModel
}

export function ActivitySystemRail({ model }: ActivitySystemRailProps) {
  const activityHref = resolveDestination('activity')?.href ?? '/agent-activity'
  const failedActivityHref = resolveDestination('activity', { filters: { status: 'failed' } })?.href ?? '/agent-activity?status=failed'
  const approvalsHref = resolveDestination('approvals')?.href ?? '/approvals'

  return (
    <aside className={styles.insightRail} aria-label="Aktivitet och underlag">
      <section className={styles.railPanel}>
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
      </section>

      <section className={styles.railPanel}>
        <div className={styles.railHeading}>
          <div>
            <p className={styles.sectionKicker}>Senaste</p>
            <h2>Aktivitet</h2>
          </div>
          <Link href={activityHref} aria-label="Visa all aktivitet"><ArrowRight size={16} /></Link>
        </div>
        {model.activity.length > 0 ? (
          <div className={styles.activityList}>
            {model.activity.slice(0, 7).map((item) => (
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
      </section>
    </aside>
  )
}
