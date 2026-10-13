/**
 * Separate read-only project visibility resolver for organization members.
 * DO NOT pass this allowlist to Atlas executors, project mutations or
 * resolveProjectAccess: those keep owner/action-specific authorization.
 */
import { resolveOrganizationRole, type OrganizationRoleState } from './organization-role'

interface ReadDb {
  from(table: string): any
}
export type OrganizationReadScope = {
  role: OrganizationRoleState
  projectIds: readonly string[]
}

/** Session-bound user ID must come from auth.getUser(), never from request JSON. */
export async function resolveOrganizationReadScope(
  sessionDb: ReadDb,
  projectDb: ReadDb,
  authenticatedUserId: string | null | undefined,
): Promise<OrganizationReadScope> {
  const denied: OrganizationReadScope = { role: { active: false, role: null }, projectIds: [] }
  if (!authenticatedUserId) return denied
  const role = await resolveOrganizationRole(
    sessionDb as Parameters<typeof resolveOrganizationRole>[0],
    authenticatedUserId,
  )
  if (!role.active) return denied
  try {
    const { data, error } = await projectDb.from('projects').select('id')
    if (error || !Array.isArray(data)) return denied
    const ids = data.map((p: { id?: unknown }) => p.id)
    if (ids.some((id: unknown) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) return denied
    return { role, projectIds: [...new Set(ids as string[])] }
  } catch {
    return denied
  }
}
