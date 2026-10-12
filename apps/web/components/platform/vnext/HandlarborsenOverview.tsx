import type { AnalysisRuleId, SaveSelector } from '@/lib/atlas/project-analytics/analysis-review-contract'
import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { buildHandlarborsenOverview } from '@/lib/atlas/project-analytics/handlarborsen-overview'
import { KpiOverview, KpiOverviewNote } from './KpiOverview'
import { HandlarborsenVisualPulse } from './HandlarborsenVisualPulse'
import { HandlarborsenInsights } from './HandlarborsenInsights'
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
  projectSlug,
  analysisSelectors,
  now = new Date(),
}: {
  report: MarketplaceReport
  reportHref: string | null
  projectSlug?: string
  analysisSelectors?: Partial<Record<AnalysisRuleId, SaveSelector>>
  traffic?: HandlarborsenTraffic | null
  now?: Date
}) {
  const model = buildHandlarborsenOverview(report)
  const common = {
    titleId: 'hb-overview',
    kicker: 'Marknadsplats · Nyckeltal',
    reportHref,
    reportLabel: 'Fullständig statistikrapport',
    prominent: true,
  }

  if (model.kind === 'note') {
    return (
      <>
        <KpiOverviewNote {...common} title={model.title} text={model.text} tone={model.tone} />
        {traffic && <HandlarborsenPosthogTraffic traffic={traffic} />}
        {projectSlug && (
          <p>
            <a href={'/projects/' + encodeURIComponent(projectSlug) + '/atlas/analysis-drafts'}>Sparade analysutkast</a>
          </p>
        )}
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
      <HandlarborsenInsights
        report={report}
        now={now}
        projectSlug={projectSlug}
        analysisSelectors={analysisSelectors}
      />
      {projectSlug && (
        <p>
          <a href={'/projects/' + encodeURIComponent(projectSlug) + '/atlas/analysis-drafts'}>Sparade analysutkast</a>
        </p>
      )}
    </>
  )
}
