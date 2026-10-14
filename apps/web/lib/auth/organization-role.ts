/**
 * Organization role read boundary. Does not grant Atlas action authority.
 * Use a session-bound Supabase client; never trust a caller-supplied role.
 */
export type OmniraOrganizationRole = 'owner' | 'collaborator'
export type OrganizationRoleState =
  | { readonly active: true; readonly role: OmniraOrganizationRole }
  | { readonly active: false; readonly role: null }

interface OrganizationRoleReader {
  from(table: string): {
    select(columns: string): {
      eq(column: string, id: string): {
        maybeSingle(): Promise<{ data: unknown; error: unknown }>
      }
    }
  }
}

export async function resolveOrganizationRole(
  db: OrganizationRoleReader,
  authenticatedUserId: string | null | undefined,
): Promise<OrganizationRoleState> {
  const denied: OrganizationRoleState = { active: false, role: null }
  if (!authenticatedUserId) return denied
  try {
    const { data, error } = await db.from('omnira_organization_memberships')
      .select('user_id, role, revoked_at')
      .eq('user_id', authenticatedUserId)
      .maybeSingle()
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) return denied
    const row = data as Record<string, unknown>
    if (row.user_id !== authenticatedUserId || row.revoked_at !== null) return denied
    if (row.role !== 'owner' && row.role !== 'collaborator') return denied
    return { active: true, role: row.role }
  } catch {
    return denied
  }
}

/** Viewing is separate from acting. Never reuse this for authorization of writes. */
export function mayViewOrganizationProjects(state: OrganizationRoleState): boolean {
  return state.active
}
