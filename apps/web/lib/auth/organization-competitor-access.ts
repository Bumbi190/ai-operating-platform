import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from './organization-project-read'
import { canCollaborateOnProject } from './collaborator-project-permissions'
import {
  HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'

type Db = ReturnType<typeof createAdminClient>
export type OrganizationCompetitorGrant =
  | { ok: true; db: Db }
  | { ok: false; status: 'unauthorized' | 'forbidden' | 'unavailable' }
export type OrganizationCompetitorAction = 'view_competitors' | 'record_competitor_evidence'

interface Dependencies {
  session: typeof createClient
  admin: typeof createAdminClient
  scope: typeof resolveOrganizationReadScope
}
const live: Dependencies = {
  session: createClient,
  admin: createAdminClient,
  scope: resolveOrganizationReadScope,
}

/**
 * Collaborator-specific project gate. Never broadens owner project RLS,
 * existing /api/projects ownership assertions, or other project access.
 * Session is verified before service-role reads; organizational membership
 * must be active and rooted in the sole active organization's Owner.
 * Every authorized operation remains bound to the canonical Handlarbörsen.
 */
export async function authorizeOrganizationCompetitorAction(
  action: OrganizationCompetitorAction,
  deps: Dependencies = live,
): Promise<OrganizationCompetitorGrant> {
  if (action !== 'view_competitors' && action !== 'record_competitor_evidence')
    return { ok: false, status: 'forbidden' }
  try {
    const session = await deps.session()
    const { data: { user }, error: authError } = await session.auth.getUser()
    if (authError || !user) return { ok: false, status: 'unauthorized' }
    const db = deps.admin()
    const scope = await deps.scope(session, db, user.id)
    if (!scope.role.active || scope.role.role !== 'collaborator'
      || !scope.projectIds.includes(HANDLARBORSEN_PROJECT_ID))
      return { ok: false, status: 'forbidden' }

    // The project itself is checked live *after* the membership scope.
    const { data: project, error: projectError } = await db.from('projects')
      .select('id, slug, name')
      .eq('id', HANDLARBORSEN_PROJECT_ID)
      .eq('slug', HANDLARBORSEN_PROJECT_SLUG)
      .maybeSingle()
    if (projectError || !project || !isHandlarborsenProject(project)
      || !canCollaborateOnProject(scope.role, project, action))
      return { ok: false, status: 'forbidden' }
    return { ok: true, db }
  } catch {
    return { ok: false, status: 'unavailable' }
  }
}
