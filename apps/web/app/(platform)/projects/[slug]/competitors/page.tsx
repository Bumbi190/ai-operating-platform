import { loadWatchReadiness } from '@/lib/atlas/project-analytics/handlarborsen-watch-readiness-service'
import { notFound } from 'next/navigation'
import { getProjectBySlug } from '@/lib/project/get-project'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import { scanPublicSources } from '@/lib/atlas/project-analytics/handlarborsen-competitors-scan'
import { scanCompetitorLandscape } from '@/lib/atlas/project-analytics/handlarborsen-competitor-landscape-scan'
import { HandlarborsenCompetitors } from '@/components/platform/vnext/HandlarborsenCompetitors'
import { competitorHistoryEnabled, loadCompetitorHistory } from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-service'
import { candidateMemoryEnabled, loadCandidateMemory } from '@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service'
import { candidateReviewEnabled, loadCandidateReviews } from '@/lib/atlas/project-analytics/handlarborsen-candidate-review-service'
import { competitorInboxEnabled, loadCompetitorInbox } from '@/lib/atlas/project-analytics/handlarborsen-candidate-inbox-service'

export const dynamic = 'force-dynamic'

/** RLS resolution precedes the exact identity guard and all public-source I/O. */
export default async function CompetitorsPage({ params, searchParams }: {
  params: { slug: string }
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const project = await getProjectBySlug(params.slug)
  if (!project || !isHandlarborsenProject(project)) notFound()
  const historyEnabled = competitorHistoryEnabled()
  const [scan, landscape] = searchParams?.scan === '1'
    ? await Promise.all([scanPublicSources(), scanCompetitorLandscape()])
    : [null, null]
  const memoryEnabled = candidateMemoryEnabled()
  const reviewEnabled = candidateReviewEnabled()
  const inboxEnabled = competitorInboxEnabled()
  const [result, memory, reviews, inbox, watchReadiness] = await Promise.all([
    historyEnabled ? loadCompetitorHistory() : Promise.resolve(null),
    memoryEnabled ? loadCandidateMemory() : Promise.resolve(null),
    reviewEnabled ? loadCandidateReviews() : Promise.resolve(null),
    inboxEnabled ? loadCompetitorInbox('owner') : Promise.resolve(null),
    loadWatchReadiness('owner'),
  ])
  const history = result?.status === 'ok' ? result.history : null
  return <HandlarborsenCompetitors
    scan={scan} landscape={landscape} history={history} watchReadiness={watchReadiness}
    historyEnabled={historyEnabled} canSaveHistory={result?.status === 'ok'}
    memoryEnabled={memoryEnabled} memory={memory}
    reviewEnabled={reviewEnabled} reviews={reviews}
    inboxEnabled={inboxEnabled} inbox={inbox}
  />
}
