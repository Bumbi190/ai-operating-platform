import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { buildHandlarborsenOverview } from '@/lib/atlas/project-analytics/handlarborsen-overview'
import { KpiOverview, KpiOverviewNote } from './KpiOverview'
import { HandlarborsenVisualPulse } from './HandlarborsenVisualPulse'
import { HandlarborsenTrends } from './HandlarborsenTrends'
import { HandlarborsenPosthogTraffic } from './HandlarborsenPosthogTraffic'
import type { HandlarborsenTraffic } from '@/lib/atlas/project-analytics/handlarborsen-posthog-traffic'

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
  traffic,
}: {
  report: MarketplaceReport
  reportHref: string | null
  traffic?: HandlarborsenTraffic | null
}) {
  const model = buildHandlarborsenOverview(report)
  const common = { titleId: 'hb-overview', kicker: 'Marknadsplats · Nyckeltal', reportHref, reportLabel: 'Fullständig statistikrapport', prominent: true }

  if (model.kind === 'note') {
    return (
      <>
        <KpiOverviewNote
          {...common}
          title={model.title}
          text={model.text}
          tone={model.tone}
        />
        {traffic && <HandlarborsenPosthogTraffic traffic={traffic} />}
      </>
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
      {traffic && <HandlarborsenPosthogTraffic traffic={traffic} />}
      <HandlarborsenTrends report={report} />
      <HandlarborsenVisualPulse report={report} reportHref={reportHref} />
    </>
  )
}
