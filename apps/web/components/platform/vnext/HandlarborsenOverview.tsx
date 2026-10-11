import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { buildHandlarborsenOverview } from '@/lib/atlas/project-analytics/handlarborsen-overview'
import { KpiOverview, KpiOverviewNote } from './KpiOverview'
import { HandlarborsenVisualPulse } from './HandlarborsenVisualPulse'

/**
 * Handlarbörsen-specific composition on the project Command Center.
 *
 * The existing verified KPI summary is preserved. The visual pulse below it
 * reuses exactly the same stored report; it never reads or writes separately.
 * Other projects are unaffected.
 */
export function HandlarborsenOverview({
  report,
  reportHref,
}: {
  report: MarketplaceReport
  reportHref: string | null
}) {
  const model = buildHandlarborsenOverview(report)
  const common = {
    titleId: 'hb-overview',
    kicker: 'Marknadsplats · Nyckeltal',
    reportHref,
    reportLabel: 'Fullständig statistikrapport',
  }

  if (model.kind === 'note') {
    return (
      <KpiOverviewNote
        {...common}
        title={model.title}
        text={model.text}
        tone={model.tone}
      />
    )
  }
  return (
    <>
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
      <HandlarborsenVisualPulse report={report} reportHref={reportHref} />
    </>
  )
}
