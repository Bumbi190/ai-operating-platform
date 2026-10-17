import type { AnalysisRuleId, SaveSelector } from '@/lib/atlas/project-analytics/analysis-review-contract'
import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { buildHandlarborsenOverview } from '@/lib/atlas/project-analytics/handlarborsen-overview'
import { KpiOverview, KpiOverviewNote } from './KpiOverview'
import { HandlarborsenVisualPulse } from './HandlarborsenVisualPulse'
import { HandlarborsenInsights } from './HandlarborsenInsights'
import { HandlarborsenTrends } from './HandlarborsenTrends'
import { HandlarborsenPosthogTraffic } from './HandlarborsenPosthogTraffic'
import { HandlarborsenExecutiveSummary } from './HandlarborsenExecutiveSummary'
import styles from './HandlarborsenExecutiveSummary.module.css'
import { AnalysisDraftHistoryLink } from './AnalysisDraftHistoryLink'
import type { HandlarborsenTraffic } from '@/lib/atlas/project-analytics/handlarborsen-posthog-traffic'
import type { CandidateMemoryLoad } from '@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service'
import { HandlarborsenCandidateReviewNotice } from './HandlarborsenCandidateReviewNotice'

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
  candidateMemory = null,
  candidateMemoryEnabled = false,
  candidateAudience = 'owner',
  now = new Date(),
}: {
  report: MarketplaceReport
  reportHref: string | null
  projectSlug?: string
  analysisSelectors?: Partial<Record<AnalysisRuleId, SaveSelector>>
  candidateMemory?: CandidateMemoryLoad | null
  candidateMemoryEnabled?: boolean
  candidateAudience?: 'owner' | 'collaborator'
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
        <HandlarborsenCandidateReviewNotice memory={candidateMemory} enabled={candidateMemoryEnabled} audience={candidateAudience} />
        <KpiOverviewNote {...common} title={model.title} text={model.text} tone={model.tone} />
        {traffic && <HandlarborsenPosthogTraffic traffic={traffic} />}
        {projectSlug && <AnalysisDraftHistoryLink projectSlug={projectSlug} />}
      </>
    )
  }
  return (
    <>
      <HandlarborsenCandidateReviewNotice memory={candidateMemory} enabled={candidateMemoryEnabled} audience={candidateAudience} />
      <HandlarborsenExecutiveSummary report={report} model={model} traffic={traffic} now={now} />
      <HandlarborsenTrends report={report} />
      {traffic && <HandlarborsenPosthogTraffic traffic={traffic} />}
      <details className={styles.deepDive}>
        <summary>
          <span>Fördjupning · alla nyckeltal, aktivitet och analysunderlag</span>
          <span className={styles.deepDiveHint}>Visa detaljer</span>
        </summary>
        <div className={styles.deepDiveContent}>
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
          <HandlarborsenInsights
            report={report}
            now={now}
            projectSlug={projectSlug}
            analysisSelectors={analysisSelectors}
          />
          {projectSlug && <AnalysisDraftHistoryLink projectSlug={projectSlug} />}
        </div>
      </details>
    </>
  )
}
