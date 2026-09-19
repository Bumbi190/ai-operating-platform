/** Exact SDF-1B2 grant/deny/cancel boundary. No generic PATCH surface. */

import { NextResponse } from 'next/server'
import { assertSameOrigin, readJsonBody, reservedFieldIn } from '@/lib/atlas/executive/http'
import { decideOperatorCodeWork, type OperatorDecision } from '@/lib/atlas/code-work/control-plane/operator-write'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACTIONS = new Set(['grant', 'deny', 'cancel'])
const FIELDS = new Set(['action', 'projectSlug', 'expiresAt', 'reason'])

function failure(status: string) {
  const code = status === 'no_principal' ? 401
    : status === 'not_permitted' ? 404
      : status === 'invalid_request' ? 400
        : status === 'conflict' || status === 'ineligible' ? 409
          : status === 'integrity_violation' ? 500 : 503
  return NextResponse.json(
    { error: status === 'not_permitted' ? 'Not found' : status },
    { status: code },
  )
}

export async function POST(
  request: Request,
  { params }: { params: { workId: string } },
) {
  const origin = assertSameOrigin(request)
  if (origin) return origin
  if (!UUID.test(params.workId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await readJsonBody(request)
  if (body instanceof NextResponse) return body
  const reserved = reservedFieldIn(body)
  if (reserved) return NextResponse.json({ error: `reserved_field:${reserved}` }, { status: 400 })
  if (Object.keys(body).some(key => !FIELDS.has(key))) {
    return NextResponse.json({ error: 'unknown_field' }, { status: 400 })
  }
  if (typeof body.action !== 'string' || !ACTIONS.has(body.action)) {
    return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
  }
  if (typeof body.projectSlug !== 'string' || !body.projectSlug.trim()) {
    return NextResponse.json({ error: 'projectSlug_required' }, { status: 400 })
  }
  if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 500)) {
    return NextResponse.json({ error: 'reason_invalid' }, { status: 400 })
  }
  if (body.action === 'grant' && (typeof body.expiresAt !== 'string'
    || Number.isNaN(Date.parse(body.expiresAt)) || Date.parse(body.expiresAt) <= Date.now())) {
    return NextResponse.json({ error: 'expiresAt_required' }, { status: 400 })
  }
  if (body.action !== 'grant' && body.expiresAt !== undefined) {
    return NextResponse.json({ error: 'expiresAt_not_allowed' }, { status: 400 })
  }

  // Authenticate before the service-role project lookup, then constrain that
  // lookup to the authenticated owner's allow-list.
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response
  if (access.allowedProjectIds.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: project, error } = await (createAdminClient() as any).from('projects')
    .select('id').in('id', access.allowedProjectIds).eq('slug', body.projectSlug.trim()).maybeSingle()
  if (error) return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const decision: OperatorDecision = body.action === 'grant'
    ? { action: 'grant', expiresAt: body.expiresAt as string }
    : body.action === 'deny'
      ? { action: 'deny', ...(body.reason ? { reason: body.reason as string } : {}) }
      : { action: 'cancel', ...(body.reason ? { reason: body.reason as string } : {}) }

  const result = await decideOperatorCodeWork(project.id, params.workId, decision, {
    access: async () => access,
  })
  if (result.status !== 'ok' && result.status !== 'idempotent') return failure(result.status)
  return NextResponse.json({
    ok: true,
    idempotent: result.status === 'idempotent',
    work: result.run ? { workId: result.run.workId, state: result.run.state } : null,
  })
}
