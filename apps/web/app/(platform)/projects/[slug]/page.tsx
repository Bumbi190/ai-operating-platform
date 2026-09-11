import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { getProjectBySlug, type ResolvedProject } from '@/lib/project/get-project'
import { loadProjectCommandCenter } from '@/lib/os/project-command-center'
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
  const model = await loadProjectCommandCenter(project)
  return <ProjectCommandCenter model={model} />
}
