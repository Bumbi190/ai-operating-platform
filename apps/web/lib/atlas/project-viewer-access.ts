/**
 * Read-only membership check for a future project-scoped dashboard endpoint.
 * This grants NO read on resources by itself, and must never be reused to
 * authorize write-capable Atlas operations.
 */
interface MembershipQuery {
  from(table: 'project_viewer_memberships'): {
    select(columns: 'user_id'): {
      eq(column: 'project_id', value: string): {
        eq(column: 'user_id', value: string): {
          maybeSingle(): Promise<{ data: { user_id: string } | null; error: unknown }>
        }
      }
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Database must already be scoped to the requesting authenticated identity. */
export async function hasProjectViewerMembership(
  db: MembershipQuery,
  projectId: string | null | undefined,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!projectId || !userId || !UUID.test(projectId) || !UUID.test(userId)) return false
  try {
    const { data, error } = await db.from('project_viewer_memberships')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle()
    return !error && data?.user_id === userId
  } catch {
    return false
  }
}
