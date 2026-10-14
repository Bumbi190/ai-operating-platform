import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganizationReadScope } from './organization-project-read'
import { canCollaborateOnProject } from './collaborator-project-permissions'

export const ORGANIZATION_WRITE_HEADERS = { 'Cache-Control': 'private, no-store' } as const

export function organizationWriteError(status: number): NextResponse {
  const message = status === 401 ? 'Unauthenticated' : status === 400 ? 'Invalid request' : status === 503 ? 'Unavailable' : 'Forbidden'
  return NextResponse.json({ error: message }, { status, headers: ORGANIZATION_WRITE_HEADERS })
}

export function isSameOriginJson(request: Request): boolean {
  try {
    const source = request.headers.get('origin')
    const contentType = request.headers.get('content-type') ?? ''
    const length = Number(request.headers.get('content-length') ?? '0')
    return source === new URL(request.url).origin
      && /^application\/json(?:;|$)/i.test(contentType)
      && (!Number.isFinite(length) || length <= 4096)
  } catch { return false }
}

/** Only display metadata may be written. No scheduler, steps or activation fields. */
export function parseSafeWorkflowMetadata(input: unknown, requireName: boolean):
  | { name?: string; description?: string | null }
  | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const fields = input as Record<string, unknown>
  const keys = Object.keys(fields)
  if (!keys.length || keys.some(key => key !== 'name' && key !== 'description')) return null
  const result: { name?: string; description?: string | null } = {}
  if (Object.hasOwn(fields, 'name')) {
    if (typeof fields.name !== 'string') return null
    const name = fields.name.trim()
    if (!name || name.length > 120) return null
    result.name = name
  }
  if (Object.hasOwn(fields, 'description')) {
    if (fields.description !== null && typeof fields.description !== 'string') return null
    if (typeof fields.description === 'string' && fields.description.length > 1600) return null
    result.description = fields.description
  }
  if (requireName && !result.name) return null
  return result
}

type WriteGrant =
  | { ok: true; projectId: string; db: ReturnType<typeof createAdminClient> }
  | { ok: false; response: NextResponse }

/**
 * Per-request Auth user + active org membership + canonical Handlarbörsen.
 * Never use getAllowedProjectIds as a collaborator write authority.
 */
export async function authorizeHandlarborsenWorkflowWrite(slug: string): Promise<WriteGrant> {
  if (slug !== 'handlarborsen') return { ok: false, response: organizationWriteError(403) }
  const session = await createClient()
  const { data: { user }, error: authError } = await session.auth.getUser()
  if (authError || !user) return { ok: false, response: organizationWriteError(401) }

  try {
    const db = createAdminClient()
    const scope = await resolveOrganizationReadScope(session, db, user.id)
    if (!scope.role.active || scope.role.role !== 'collaborator' || scope.projectIds.length === 0)
      return { ok: false, response: organizationWriteError(403) }

    const { data: project, error } = await db.from('projects').select('id, slug')
      .eq('slug', slug).in('id', [...scope.projectIds]).maybeSingle()
    if (error || !project || !canCollaborateOnProject(scope.role, project, 'operate_workflow'))
      return { ok: false, response: organizationWriteError(403) }
    return { ok: true, db, projectId: project.id }
  } catch {
    return { ok: false, response: organizationWriteError(503) }
  }
}
