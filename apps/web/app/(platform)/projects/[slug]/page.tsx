import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { getProjectBySlug, type ResolvedProject } from '@/lib/project/get-project'
import { isHandlarborsenProject, loadProjectCommandCenter } from '@/lib/os/project-command-center'
import { loadHandlarborsenMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-read'
import { HandlarborsenOverview } from '@/components/platform/vnext/HandlarborsenOverview'
import {
  ProjectCommandCenter,
  ProjectCommandCenterLoading,
} from '@/components/platform/vnext/ProjectCommandCenter'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { ProjectLegacy } from './ProjectLegacy'

/**
 * `/projects/[slug]` — the project.
 *
 * vNext renders the Project Command Center; `?ui=legacy` renders the previous
 * body, moved verbatim into `ProjectLegacy`. Both start from the same guard:
 * the project is resolved through the RLS-bound `getProjectBySlug`, so a slug
 * the session does not own and a slug that does not exist are the same 404, and
 * there is no path to any other project.
 *
 * The legacy branch returns before the Command Center loader is even reached,
 * so a rollback costs nothing and cannot fail on a read it does not use.
 */
export default async function ProjectPage({
  params,
}: {
  params: { slug: string }
}) {
  const { slug } = params

  const project = await getProjectBySlug(slug)
  if (!project) notFound()

  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <ProjectLegacy slug={slug} project={project} />

  return (
    <Suspense fallback={<ProjectCommandCenterLoading name={project.name} color={project.color} />}>
      <LoadedProjectCommandCenter project={project} />
    </Suspense>
  )
}

async function LoadedProjectCommandCenter({ project }: { project: ResolvedProject }) {
  // Key figures lead the page for Handlarbörsen only. The project (verified by id, slug and
  // name) is the RLS-resolved one, and it is also the allow-list handed to the reader, which
  // re-checks identity and atlas_mode. Every other project loads exactly what it did before.
  const withKeyFigures = isHandlarborsenProject(project)
  const [model, reportResult] = await Promise.all([
    loadProjectCommandCenter(project),
    withKeyFigures
      ? loadHandlarborsenMarketplaceReport(project, { allowedProjectIds: [project.id] })
      : Promise.resolve(null),
  ])
  const overview = reportResult && reportResult.status === 'ok'
    ? <HandlarborsenOverview report={reportResult.report} reportHref={model.links.marketplace} />
    : undefined
  return <ProjectCommandCenter model={model} overview={overview} />
}
