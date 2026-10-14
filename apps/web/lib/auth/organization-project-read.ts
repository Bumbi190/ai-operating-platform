/**
 * Read-only organization project boundary. Never use this scope for writes
 * or Atlas execution; it belongs only to explicitly audited read paths.
 * Project ownership is scoped to the single active organization Owner.
 */
import { resolveOrganizationRole, type OrganizationRoleState } from './organization-role'

interface ReadDb { from(table: string): any }
export type OrganizationReadScope = {
  role: OrganizationRoleState
  projectIds: readonly string[]
}

const denied: OrganizationReadScope = { role: { active: false, role: null }, projectIds: [] }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** User ID MUST be resolved by server-side auth.getUser, not request input. */
export async function resolveOrganizationReadScope(
  sessionDb: ReadDb,
  projectDb: ReadDb,
  authenticatedUserId: string | null | undefined,
): Promise<OrganizationReadScope> {
  if (!authenticatedUserId) return denied
  const role = await resolveOrganizationRole(
    sessionDb as Parameters<typeof resolveOrganizationRole>[0],
    authenticatedUserId,
  )
  if (!role.active) return denied
  try {
    // The admin DB is used solely AFTER the session-bound role check.
    // Never enumerate all projects: only this organization's active Owner.
    const { data: owner, error: ownerError } = await projectDb
      .from('omnira_organization_memberships').select('user_id')
      .eq('role', 'owner').is('revoked_at', null).maybeSingle()
    if (ownerError || !owner || typeof owner.user_id !== 'string' || !uuid.test(owner.user_id))
      return denied
    if (role.role === 'owner' && owner.user_id !== authenticatedUserId)
      return denied

    const { data, error } = await projectDb.from('projects').select('id')
      .eq('owner_id', owner.user_id)
    if (error || !Array.isArray(data)) return denied
    const ids = data.map((p: { id?: unknown }) => p.id)
    if (ids.some((id: unknown) => typeof id !== 'string' || !uuid.test(id))) return denied
    return { role, projectIds: [...new Set(ids as string[])] }
  } catch {
    return denied
  }
}
