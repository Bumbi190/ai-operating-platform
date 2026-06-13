/**
 * Per-request project access for API routes that use the service-role
 * (admin) client and therefore bypass RLS.
 *
 * These routes still need the SAME project boundary the UI gets from RLS.
 * `resolveProjectAccess` establishes "who is calling and which projects may
 * they touch", reusing the Atlas isolation boundary (`getAllowedProjectIds`,
 * which mirrors RLS `projects.owner_id = auth.uid()`). Routes then gate every
 * row on `assertProjectAllowed(row.project_id, access.allowedProjectIds)`.
 *
 * FAIL CLOSED:
 *  - no session            → 401
 *  - user owns no projects → allowedProjectIds = [] → every assert fails
 *
 * Usage:
 *   const access = await resolveProjectAccess()
 *   if (!access.ok) return access.response
 *   if (!assertProjectAllowed(row.project_id, access.allowedProjectIds))
 *     return forbidden()
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds, assertProjectAllowed } from '@/lib/atlas/isolation'

export interface ProjectAccessOk {
  ok: true
  userId: string
  /** Project ids this user owns. May be empty (then every assert fails). */
  allowedProjectIds: string[]
}

export interface ProjectAccessFail {
  ok: false
  response: NextResponse
}

export type ProjectAccess = ProjectAccessOk | ProjectAccessFail

export async function resolveProjectAccess(): Promise<ProjectAccess> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  // Admin client only to enumerate ownership; the boundary itself is owner-scoped.
  const allowedProjectIds = await getAllowedProjectIds(createAdminClient(), user.id)
  return { ok: true, userId: user.id, allowedProjectIds }
}

/** Standard 403 for a row that exists but is outside the caller's projects. */
export function projectForbidden(): NextResponse {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/** Re-export so routes import the assertion from one place. */
export { assertProjectAllowed }
