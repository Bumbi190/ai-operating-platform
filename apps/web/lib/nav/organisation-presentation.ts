/**
 * Presentation only: keep long agent lists from pushing later project cards
 * below the fold in the organisation hierarchy.
 *
 * This never filters projects or agents, changes membership, or grants access.
 * Every project is still rendered; large agent groups can be expanded by the
 * operator and scrolled separately.
 */
export const ORG_LONG_AGENT_LIST_THRESHOLD = 8

export function initiallyCollapsedOrganisationProjects(
  projects: readonly { id: string; agents: readonly unknown[] }[],
): ReadonlySet<string> {
  return new Set(
    projects
      .filter(project => project.agents.length > ORG_LONG_AGENT_LIST_THRESHOLD)
      .map(project => project.id),
  )
}
