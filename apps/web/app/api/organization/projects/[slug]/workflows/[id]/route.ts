import { NextResponse } from 'next/server'
import {
  authorizeHandlarborsenWorkflowWrite, isSameOriginJson,
  organizationWriteError, ORGANIZATION_WRITE_HEADERS, parseSafeWorkflowMetadata,
} from '@/lib/auth/organization-workflow-write'

export const dynamic = 'force-dynamic'

/** Editing display metadata only. No steps, trigger, cron, active or deletes. */
export async function PATCH(request: Request, { params }: { params: { slug: string; id: string } }) {
  if (!isSameOriginJson(request)) return organizationWriteError(403)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.id))
    return organizationWriteError(400)

  const grant = await authorizeHandlarborsenWorkflowWrite(params.slug)
  if (!grant.ok) return grant.response

  let payload: unknown
  try { payload = await request.json() } catch { return organizationWriteError(400) }
  const safe = parseSafeWorkflowMetadata(payload, false)
  if (!safe) return organizationWriteError(400)

  const { data, error } = await grant.db.from('workflows').update(safe)
    .eq('id', params.id)
    .eq('project_id', grant.projectId)
    .select('id, name, description, trigger, active, created_at').maybeSingle()
  if (error) return organizationWriteError(503)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: ORGANIZATION_WRITE_HEADERS })
  return NextResponse.json({ workflow: data }, { headers: ORGANIZATION_WRITE_HEADERS })
}
