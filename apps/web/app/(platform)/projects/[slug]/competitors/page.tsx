import { notFound } from 'next/navigation'
import { getProjectBySlug } from '@/lib/project/get-project'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import { scanPublicSources } from '@/lib/atlas/project-analytics/handlarborsen-competitors-scan'
import { scanCompetitorLandscape } from '@/lib/atlas/project-analytics/handlarborsen-competitor-landscape-scan'
import { HandlarborsenCompetitors } from '@/components/platform/vnext/HandlarborsenCompetitors'

export const dynamic = 'force-dynamic'

/** RLS resolution precedes the exact identity guard and all public-source I/O. */
export default async function CompetitorsPage({ params, searchParams }: {
  params: { slug: string }
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const project = await getProjectBySlug(params.slug)
  if (!project || !isHandlarborsenProject(project)) notFound()
  const [scan, landscape] = searchParams?.scan === '1'
    ? await Promise.all([scanPublicSources(), scanCompetitorLandscape()])
    : [null, null]
  return <HandlarborsenCompetitors scan={scan} landscape={landscape} />
}
