/**
 * POST /api/workflows/gate — open an authorization request for a workflow gate.
 *
 * PURPOSE-SCOPED AND SERVER-ATOMIC, for the reason
 * app/api/atlas/executive/authorization/route.ts states in its own header:
 * `requestAuthorization` accepts a free-form target and action kind validated
 * against no registry, so a route that forwarded caller input would let an
 * authenticated human mint a request naming any action at all — into an
 * append-only ledger, where it would wait until some future consumer honoured
 * it. So the caller names an INSTANCE and nothing else. The target, the pinned
 * version hash, the action kind and the description are all derived server-side
 * from the instance's own definition, current state and recorded evidence.
 *
 * DECIDING IS NOT HERE. Grant, deny and revoke stay on the existing executive
 * authorization route. A second decision endpoint would be a second place for
 * the authority rules to drift apart.
 *
 * This route grants nothing and executes nothing. It opens a `requested` act.
 */

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { assertSameOrigin, badRequest, isUuid, readJsonBody, unknownAction } from '@/lib/atlas/executive/http'
import { requestWorkflowAuthorization } from '@/lib/workflows/authorization'
import { rearmForAuthorization } from '@/lib/workflows/rearm'
import { readInstance } from '@/lib/workflows/store'

export const dynamic = 'force-dynamic'

/**
 * `rearm` is deliberately a WORKFLOW action, not something the authorization
 * route does. The Executive authority routes are import-allowlisted precisely so
 * they cannot grow subsystem dependencies, and coupling the authority ledger to
 * the scheduler is the exact shape we are avoiding: approval must be permission,
 * never a trigger. So the workflow asks to be looked at sooner; the ledger stays
 * unaware that a scheduler exists.
 *
 * Safe to expose: every real precondition is enforced inside public.workflow_rearm
 * (instance active, project not paused, live grant for THIS instance's CURRENT
 * state). A caller who invents an authorizationId achieves nothing — the worst
 * possible outcome of any call is that a legitimately-granted instance is
 * evaluated a little earlier, which is what a grant already earned.
 */
const ACTIONS = ['request_authorization', 'rearm'] as const

export async function POST(request: Request) {
  const sameOrigin = assertSameOrigin(request)
  if (sameOrigin) return sameOrigin

  const body = await readJsonBody(request)
  if (body instanceof NextResponse) return body

  const action = body.action
  if (typeof action !== 'string' || !ACTIONS.includes(action as (typeof ACTIONS)[number])) {
    return unknownAction()
  }
  if (!isUuid(body.instanceId)) return badRequest('instanceId')

  // Authenticate BEFORE any privileged read — the same ordering rule the
  // authorization write boundary follows, so an unauthenticated caller cannot
  // use this endpoint to learn which instance ids exist.
  const access = await resolveProjectAccess()
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()

  const instance = await readInstance(db, body.instanceId)
  // Unknown and foreign answer identically: no instance-id oracle.
  if (!instance || !assertProjectAllowed(instance.project_id, access.allowedProjectIds)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // ── rearm ── pull the next scheduler evaluation forward after a human grant.
  // Moves one timestamp. Starts nothing: the tick still re-derives the state,
  // re-checks the gate and re-validates the authorization before doing anything.
  if (action === 'rearm') {
    if (!isUuid(body.authorizationId)) return badRequest('authorizationId')
    const outcome = await rearmForAuthorization(db, body.authorizationId as string)
    // A refusal is a correct answer, not an error — the grant stands either way,
    // and the scheduler will reach the instance on its own schedule regardless.
    return NextResponse.json(
      outcome.rearmed ? { ok: true, rearmed: true } : { ok: true, rearmed: false, reason: outcome.reason },
      { status: 200 },
    )
  }

  const result = await requestWorkflowAuthorization(db, instance.id)

  if (result.status === 'not_gated') {
    return NextResponse.json({ error: 'not_gated' }, { status: 409 })
  }
  if (result.status !== 'ok') {
    const http =
      result.status === 'no_principal'   ? 401 :
      result.status === 'project_denied' ? 404 :
      result.status === 'conflict'       ? 409 :
      result.status === 'unavailable'    ? 503 : 400
    return NextResponse.json({ error: result.status }, { status: http })
  }

  return NextResponse.json(
    { ok: true, authorizationId: result.authorizationId, gate: result.gate },
    { status: 201 },
  )
}
