import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { getProjectBySlug, type ResolvedProject } from '@/lib/project/get-project'
import { isHandlarborsenProject, loadProjectCommandCenter, type ProjectCommandCenterModel } from '@/lib/os/project-command-center'
import { loadHandlarborsenMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-read'
import { HandlarborsenOverview } from '@/components/platform/vnext/HandlarborsenOverview'
import { HandlarborsenOwnerBrief } from '@/components/platform/vnext/HandlarborsenOwnerBrief'
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
  // Start the existing scoped report beside the workspace model. The fallback
  // keeps the workspace readable while the same report loads for both the
  // overview and owner brief; a refused read unlocks neither.
  const reportPromise = isHandlarborsenProject(project)
    ? loadHandlarborsenMarketplaceReport(project, { allowedProjectIds: [project.id] })
    : null
  const model = await loadProjectCommandCenter(project)

  if (!reportPromise) return <ProjectCommandCenter model={model} />

  return (
    <Suspense fallback={<ProjectCommandCenter model={model} overview={<HandlarborsenStatsLoading />} />}>
      <LoadedHandlarborsenCommandCenter reportPromise={reportPromise} model={model} />
    </Suspense>
  )
}

/** One report feeds both slots after authorization. Until then the boundary
 * streams the existing workspace, without an owner brief or fictional data. */
async function LoadedHandlarborsenCommandCenter({
  reportPromise,
  model,
}: {
  reportPromise: ReturnType<typeof loadHandlarborsenMarketplaceReport>
  model: ProjectCommandCenterModel
}) {
  const result = await reportPromise
  const overview = result.status === 'ok'
    ? <HandlarborsenOverview report={result.report} reportHref={model.links.marketplace} />
    : undefined
  const briefing = result.status === 'ok'
    ? <HandlarborsenOwnerBrief model={model} report={result.report} />
    : undefined
  return <ProjectCommandCenter model={model} overview={overview} briefing={briefing} />
}

function HandlarborsenStatsLoading() {
  return (
    <section
      aria-busy="true"
      role="status"
      className="rounded-xl border border-white/10 bg-white/[0.025] p-5"
    >
      <p className="text-sm text-muted-foreground">Läser Handlarbörsens senaste verifierade statistik…</p>
    </section>
  )
}
