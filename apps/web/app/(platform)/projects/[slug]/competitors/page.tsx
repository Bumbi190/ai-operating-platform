import { notFound } from 'next/navigation'
import { getProjectBySlug } from '@/lib/project/get-project'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import { loadCompetitorHistory } from '@/lib/atlas/project-analytics/handlarborsen-competitor-store'
import { HandlarborsenCompetitors } from '@/components/platform/vnext/HandlarborsenCompetitors'

export const dynamic = 'force-dynamic'

/** RLS resolution precedes the exact identity guard and all public-source I/O. */
export default async function CompetitorsPage({ params, searchParams }: {
  params: { slug: string }
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const project = await getProjectBySlug(params.slug)
  if (!project || !isHandlarborsenProject(project)) notFound()
  const history = await loadCompetitorHistory()
  const result = typeof searchParams?.result === 'string' ? searchParams.result : undefined
  return <HandlarborsenCompetitors scan={null} history={history} result={result} />
}
