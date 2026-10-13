/**
 * Organization role read boundary. Does not grant Atlas action authority.
 * Use a session-bound Supabase client; never trust a caller-supplied role.
 */
export type OmniraOrganizationRole = 'owner' | 'collaborator'
export type OrganizationRoleState =
  | { readonly active: true; readonly role: OmniraOrganizationRole }
  | { readonly active: false; readonly role: null }

interface OrganizationRoleReader {
  from(table: 'omnira_organization_memberships'): {
    select(columns: 'user_id, role, revoked_at'): {
      eq(column: 'user_id', id: string): {
        maybeSingle(): Promise<{ data: { user_id: string; role: string; revoked_at: string | null } | null; error: unknown }>
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
    if (error || !data || data.user_id !== authenticatedUserId || data.revoked_at !== null) return denied
    if (data.role !== 'owner' && data.role !== 'collaborator') return denied
    return { active: true, role: data.role }
  } catch {
    return denied
  }
}

/** Viewing is separate from acting. Never reuse this for authorization of writes. */
export function mayViewOrganizationProjects(state: OrganizationRoleState): boolean {
  return state.active
}
