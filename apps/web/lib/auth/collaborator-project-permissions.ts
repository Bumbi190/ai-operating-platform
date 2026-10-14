/**
 * Organization collaborators share the Owner's project UI, NOT the Owner's
 * execution authority. Keep scope separate from visibility and require each
 * mutating route to enforce its own reviewed permission boundary.
 */
import type { OrganizationRoleState } from './organization-role'
import { HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'

export type CollaboratorProjectAction =
  | 'view'
  | 'propose_workflow'
  | 'operate_workflow'
  | 'edit_project'
  | 'approve'
  | 'deploy'
  | 'billing'
  | 'credentials'
  | 'manage_members'

export function canCollaborateOnProject(
  role: OrganizationRoleState,
  project: { id: string; slug: string },
  action: CollaboratorProjectAction,
): boolean {
  if (!role.active) return false
  if (action === 'view') return true
  if (role.role !== 'collaborator') return false // Owner uses existing privileged gate
  // Monitoring-only on projects other than Handlarbörsen: not even a new
  // workflow proposal grants a write path on the other businesses.
  if (action !== 'operate_workflow' && action !== 'propose_workflow') return false
  // This is only a precondition. Existing workflow server authorization,
  // human gates, spending limits and privileged-action checks remain mandatory.
  return project.id === HANDLARBORSEN_PROJECT_ID && project.slug === HANDLARBORSEN_PROJECT_SLUG
}
