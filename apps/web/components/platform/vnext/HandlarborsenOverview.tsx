import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { buildHandlarborsenOverview } from '@/lib/atlas/project-analytics/handlarborsen-overview'
import { KpiOverview, KpiOverviewNote } from './KpiOverview'

/**
 * Handlarbörsen's key figures for the top of its Command Center. A thin mapping from the
 * stored marketplace report to the project-neutral KpiOverview; the caller has already
 * verified that this is the Handlarbörsen project and read the report through the
 * authorized reader.
 */
export function HandlarborsenOverview({ report, reportHref }: { report: MarketplaceReport; reportHref: string | null }) {
  const model = buildHandlarborsenOverview(report)
  const common = { titleId: 'hb-overview', kicker: 'Marknadsplats · Nyckeltal', reportHref, reportLabel: 'Fullständig statistikrapport' }

  if (model.kind === 'note') {
    return <KpiOverviewNote {...common} title={model.title} text={model.text} tone={model.tone} />
  }
  return (
    <KpiOverview
      {...common}
      headline={model.headline}
      activityTitle="Aktivitet senaste 24 h"
      activityCaption="Fönstervärden — jämförs inte mellan dagar"
      activity={model.activity}
      meta={model.meta}
      notices={model.notices}
      historyTitle="Historisk utveckling"
      historyText={model.historyText}
    />
  )
}
