import type { ProjectCommandCenterModel } from './project-command-center'

type WorkspaceState = Pick<
  ProjectCommandCenterModel,
  'agents' | 'workflows' | 'approvals' | 'runs' | 'instances' | 'outputs' | 'activity'
>

/**
 * Fold a project-specific technical workspace only when its scoped sources
 * positively agree that there is nothing to act on.
 *
 * Read errors, unknown totals, active/past runs, and any loaded rows all keep
 * the sections visible. This is purely a presentation decision; data stays in
 * the DOM when folded so the operator can always inspect it on demand.
 *
 * The generic Project Command Center never calls this unconditionally:
 * the owner-brief prop is the opt-in surface.
 */
export function shouldCollapseEmptyOwnerWorkspace(model: WorkspaceState): boolean {
  const { agents, workflows, approvals, runs, instances, outputs, activity } = model

  if (agents.state !== 'ok' || agents.total !== 0 || agents.items.length !== 0) return false
  if (workflows.state !== 'ok' || workflows.total !== 0 || workflows.items.length !== 0) return false
  if (approvals.state !== 'ok' || approvals.total !== 0 || approvals.items.length !== 0) return false

  if (activity.activeRuns !== 0) return false
  if (activity.lastRun.state !== 'ok' || activity.lastRun.at !== null) return false

  // These lists may not have a total-count query: a null total alone does not
  // mean a failed read. Only their explicit successful state and empty rows
  // allow folding, and a positive total can never be hidden.
  return [runs, instances, outputs].every(section =>
    section.state === 'ok'
      && section.items.length === 0
      && (section.total === null || section.total === 0))
}
