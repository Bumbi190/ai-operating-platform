import { notFound } from 'next/navigation'
import { authorizeOrganizationCompetitorAction } from '@/lib/auth/organization-competitor-access'
import { competitorHistoryEnabled, loadOrganizationCompetitorHistory } from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-service'
import { candidateMemoryEnabled, loadOrganizationCandidateMemory } from '@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service'
import { candidateReviewEnabled, loadCandidateReviews } from '@/lib/atlas/project-analytics/handlarborsen-candidate-review-service'
import { competitorInboxEnabled, loadCompetitorInbox } from '@/lib/atlas/project-analytics/handlarborsen-candidate-inbox-service'
import { scanPublicSources } from '@/lib/atlas/project-analytics/handlarborsen-competitors-scan'
import { scanCompetitorLandscape } from '@/lib/atlas/project-analytics/handlarborsen-competitor-landscape-scan'
import { HandlarborsenCompetitors } from '@/components/platform/vnext/HandlarborsenCompetitors'
import { HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'

export const dynamic = 'force-dynamic'

/**
 * Oscar's organization-scoped view of the same reviewed public evidence.
 * The owning RLS route /projects/... is intentionally unchanged.
 * Membership & canonical project identity are verified before ANY external I/O.
 */
export default async function OrganizationCompetitorsPage({ params, searchParams }: {
  params: { slug: string }
  searchParams?: Record<string, string | string[] | undefined>
}) {
  if (params.slug !== HANDLARBORSEN_PROJECT_SLUG) notFound()
  const grant = await authorizeOrganizationCompetitorAction('view_competitors')
  if (!grant.ok) notFound()

  const historyEnabled = competitorHistoryEnabled()
  const memoryEnabled = candidateMemoryEnabled()
  const reviewEnabled = candidateReviewEnabled()
  const inboxEnabled = competitorInboxEnabled()
  const [scan, landscape] = searchParams?.scan === '1'
    ? await Promise.all([scanPublicSources(), scanCompetitorLandscape()])
    : [null, null]
  const [savedHistory, savedCandidates, reviews, inbox] = await Promise.all([
    historyEnabled ? loadOrganizationCompetitorHistory() : Promise.resolve(null),
    memoryEnabled ? loadOrganizationCandidateMemory() : Promise.resolve(null),
    reviewEnabled ? loadCandidateReviews() : Promise.resolve(null),
    inboxEnabled ? loadCompetitorInbox('collaborator') : Promise.resolve(null),
  ])
  const history = savedHistory?.status === 'ok' ? savedHistory.history : null
  return <main className="min-h-screen bg-[#0b1424] text-slate-50">
    <HandlarborsenCompetitors
      scan={scan} landscape={landscape} history={history}
      historyEnabled={historyEnabled} canSaveHistory={savedHistory?.status === 'ok'}
      memory={savedCandidates} memoryEnabled={memoryEnabled}
      reviewEnabled={reviewEnabled} reviews={reviews}
      inboxEnabled={inboxEnabled} inbox={inbox} mode="collaborator"
    />
  </main>
}
