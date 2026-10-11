import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { loadAtlasHomeViewModel } from '@/lib/atlas/home-view-model'
import { composeAtlasRailCards } from '@/lib/atlas/first-party-workspaces'
import { ProjectCoverGallery } from '@/components/platform/vnext/ProjectCoverGallery'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { ProjectsIndexLegacy } from './ProjectsIndexLegacy'

/**
 * `/projects` — the projects index.
 *
 * This route did not exist. Only `/projects/[slug]` and `/projects/new` did, so
 * the registry's `project_home` was reachable only with a project in hand and
 * the breadcrumb's "Projekt" had nothing to link to. Both are now real.
 *
 * The data is the SAME scoped model Atlas Home renders its rail from:
 * `loadAtlasHomeViewModel` applies `getAllowedProjectIds` + `scopeProjectFilter`
 * server-side, and `composeAtlasRailCards` adds the first-party workspaces. No
 * project list is built here, and nothing widens what the loader returned.
 *
 * Each card carries the project's own `href`, so opening one enters the
 * existing project route. No second command-center route is introduced.
 */
export const dynamic = 'force-dynamic'

export default async function ProjectsIndexPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  const model = await loadAtlasHomeViewModel()
  const cards = composeAtlasRailCards(model?.projects ?? [])
  const projectsAvailable = model?.availability.projects ?? false

  // The cover gallery is a vNext surface. Legacy gets a plain list of the same
  // scoped cards rather than the visual portfolio — the rollback path has
  // never had this route, and giving it the vNext treatment would change what
  // "legacy" means.
  if (!isVNext(generation)) {
    return <ProjectsIndexLegacy cards={cards} projectsAvailable={projectsAvailable} />
  }

  return <ProjectCoverGallery cards={cards} projectsAvailable={projectsAvailable} />
}
