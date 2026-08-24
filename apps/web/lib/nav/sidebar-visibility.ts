import { isVNext, type OmniraUiGeneration } from '@/lib/ui/generation'

/**
 * Sidebar project-section visibility.
 *
 * One decision, kept pure so the rendering choice can be tested directly rather
 * than inferred from Sidebar's source text. Sidebar consumes exactly these
 * functions — nothing here restates behaviour the component decides separately.
 *
 * The distinction that matters: in vNext, ProjectRail on Atlas Home is the
 * canonical surface for CHOOSING a project, so the global list of every project
 * is duplication and goes. Workspace navigation for the project you are already
 * inside is not duplication — it is context — and stays.
 *
 * Visibility here is layout only. It grants and denies nothing; the project list
 * has always been scoped server-side by the layout's allow-list.
 */

/** The global list of every project. Legacy keeps it; vNext defers to ProjectRail. */
export function shouldRenderGlobalProjectList(generation: OmniraUiGeneration): boolean {
  return !isVNext(generation)
}

/**
 * Which projects the sidebar section renders.
 *
 * Legacy: all of them. vNext: only the one currently open, so its workspace
 * sub-navigation still has an anchor — and none when you are outside a project.
 */
export function sidebarProjectsFor<T extends { slug: string }>(
  generation: OmniraUiGeneration,
  projects: readonly T[],
  activeSlug: string | undefined,
): T[] {
  if (shouldRenderGlobalProjectList(generation)) return [...projects]
  if (!activeSlug) return []
  return projects.filter((project) => project.slug === activeSlug)
}

/**
 * Whether the section renders at all.
 *
 * Legacy always shows it — it owns the "deploy your first system" empty state.
 * vNext shows it only as workspace context, so with nothing open there is
 * nothing to show and no empty state to offer.
 */
export function shouldRenderProjectSection<T extends { slug: string }>(
  generation: OmniraUiGeneration,
  projects: readonly T[],
  activeSlug: string | undefined,
): boolean {
  if (shouldRenderGlobalProjectList(generation)) return true
  return sidebarProjectsFor(generation, projects, activeSlug).length > 0
}
