import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertProjectAllowed, scopeProjectFilter } from '@/lib/atlas/isolation'
import { resolveProjectSlug } from '@/lib/nav/registry'

type AdminClient = ReturnType<typeof createAdminClient>
const UUID_REFERENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve a model-supplied project reference through the authenticated user's
 * project allow-list. A failed, missing, or ambiguous lookup always returns
 * null; callers must not perform privileged work without a resolved id.
 */
export async function resolveOwnedProjectId(
  db: AdminClient,
  input: string | undefined,
  allowedProjectIds: string[],
): Promise<string | null> {
  if (!input) return null

  if (assertProjectAllowed(input, allowedProjectIds)) return input
  // A UUID-shaped value claims an exact identity. Never reinterpret a foreign
  // UUID as a slug and accidentally resolve it to a different project.
  if (UUID_REFERENCE.test(input)) return null

  const slug = resolveProjectSlug(input)
  if (!slug) return null

  try {
    const { data, error } = await db
      .from('projects')
      .select('id')
      .eq('slug', slug)
      .in('id', scopeProjectFilter(allowedProjectIds))
      .maybeSingle()

    if (error) return null
    const resolvedId = (data as { id: string } | null)?.id

    // Keep this check even though the query is scoped. The service-role client
    // bypasses RLS, so an adapter/query regression must still fail closed.
    if (!assertProjectAllowed(resolvedId, allowedProjectIds)) return null
    return resolvedId ?? null
  } catch {
    return null
  }
}
