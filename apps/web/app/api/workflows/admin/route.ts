/**
 * POST /api/workflows/admin — the two deliberate operator actions.
 *
 * Both are explicit, session-authenticated and idempotent, and NEITHER runs at
 * deploy time. That matters: `workflow_defs = 0` has been an accidental safety
 * barrier for several phases, and it should stop being one only when a person
 * decides it should, not because a build ran.
 *
 *   register_definition — insert one workflow_defs row from the vendored file.
 *                         Creates NO instance.
 *   create_instance     — create one instance at the canonical initial state.
 *                         Runs NO action.
 *
 * Neither executes anything. The scheduler and the read-only executor decide
 * that later, on their own terms.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { assertSameOrigin, badRequest, isUuid, readJsonBody, unknownAction } from '@/lib/atlas/executive/http'
import {
  registerVendoredDefinition, readDefinition, instantiate, readInstanceByKey,
  readInstance as readInstanceById, scheduleWorkflowWake,
} from '@/lib/workflows/store'
import { loadVendoredDefinitions } from '@/lib/workflows/definitions'

export const dynamic = 'force-dynamic'

/**
 * `schedule_readonly_evaluation` makes an instance ELIGIBLE for the next
 * scheduler pass. It is deliberately incapable of naming what will run: no
 * action kind, no class, no target hash, no handler. It sets one timestamp, and
 * the canonical registry decides the rest.
 */
const ACTIONS = ['register_definition', 'create_instance', 'schedule_readonly_evaluation'] as const

/** Only definitions vendored in this build may be registered. */
const REGISTERABLE = new Set(['familje-stunden.monthly-release'])

export async function POST(request: Request) {
  const sameOrigin = assertSameOrigin(request)
  if (sameOrigin) return sameOrigin

  const body = await readJsonBody(request)
  if (body instanceof NextResponse) return body

  const action = body.action
  if (typeof action !== 'string' || !ACTIONS.includes(action as (typeof ACTIONS)[number])) {
    return unknownAction()
  }

  const access = await resolveProjectAccess()
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()

  if (action === 'register_definition') {
    const defKey = typeof body.defKey === 'string' ? body.defKey : null
    const version = typeof body.version === 'number' ? body.version : null
    if (!defKey || !REGISTERABLE.has(defKey)) return badRequest('defKey')
    if (version === null || !Number.isInteger(version) || version < 1) return badRequest('version')

    // Idempotent: an identical second call returns created:false. A changed
    // definition under the same version throws inside the store rather than
    // rewriting a version other instances may already be pinned to.
    try {
      const { def, created } = await registerVendoredDefinition(db, defKey, version)
      return NextResponse.json({
        ok: true, created,
        definition: {
          id: def.id, def_key: def.def_key, version: def.version,
          def_hash: def.def_hash, status: def.spec.status, states: def.spec.states.length,
        },
      }, { status: created ? 201 : 200 })
    } catch (e) {
      return NextResponse.json({ error: 'registration_refused', detail: (e as Error).message }, { status: 409 })
    }
  }

  if (action === 'schedule_readonly_evaluation') {
    if (!isUuid(body.instanceId)) return badRequest('instanceId')
    // A caller may not describe the work — only ask for an evaluation.
    for (const forbidden of ['actionKind', 'actionClass', 'targetVersionHash', 'handler', 'authorizationId']) {
      if (body[forbidden] !== undefined) return badRequest(`reserved:${forbidden}`)
    }
    const instance = await readInstanceById(db, body.instanceId as string)
    // Unknown and foreign answer identically: no instance-id oracle.
    if (!instance || !assertProjectAllowed(instance.project_id, access.allowedProjectIds)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (instance.status !== 'active') {
      return NextResponse.json({ error: 'instance_not_active', detail: `instance is ${instance.status}` },
        { status: 409 })
    }
    const { data: project } = await (db as any).from('projects')
      .select('execution_paused').eq('id', instance.project_id).maybeSingle()
    if (project?.execution_paused === true) {
      return NextResponse.json({ error: 'project_paused' }, { status: 409 })
    }

    // Sets wake_at only. No transition, no authorization, no run, no execution.
    const updated = await scheduleWorkflowWake(
      db, instance.id, new Date().toISOString(), access.userId,
      typeof body.reason === 'string' ? body.reason.slice(0, 300) : 'operator-requested evaluation')
    return NextResponse.json({ ok: true, instance: summarize(updated) }, { status: 200 })
  }

  // ── create_instance ──
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const instanceKey = typeof body.instanceKey === 'string' ? body.instanceKey : null
  const defKey = typeof body.defKey === 'string' ? body.defKey : null
  const version = typeof body.version === 'number' ? body.version : null

  if (!projectId || !isUuid(projectId)) return badRequest('projectId')
  if (!instanceKey || instanceKey.length > 64) return badRequest('instanceKey')
  if (!defKey || !version) return badRequest('defKey/version')
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const def = await readDefinition(db, defKey, version)
  if (!def) {
    return NextResponse.json(
      { error: 'definition_not_registered', detail: `${defKey} v${version} must be registered first` },
      { status: 409 })
  }

  // Idempotent by (def_key, instance_key): a repeated call returns the existing
  // instance rather than creating a second one for the same month.
  const existing = await readInstanceByKey(db, defKey, instanceKey)
  if (existing) {
    if (!assertProjectAllowed(existing.project_id, access.allowedProjectIds)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, created: false, instance: summarize(existing) }, { status: 200 })
  }

  // wake_at is deliberately NOT set here: creating an instance schedules
  // nothing. An operator decides when the scheduler should first look at it.
  const instance = await instantiate(db, {
    defKey, version, projectId, instanceKey,
    actor: access.userId,
    reason: typeof body.reason === 'string' ? body.reason.slice(0, 300) : 'operator-created instance',
  })
  return NextResponse.json({ ok: true, created: true, instance: summarize(instance) }, { status: 201 })
}

function summarize(i: { id: string; instance_key: string; current_state: string; status: string; wake_at: string | null }) {
  return {
    id: i.id, instance_key: i.instance_key,
    current_state: i.current_state, status: i.status, wake_at: i.wake_at,
  }
}

/** GET — what is vendored and what is registered. Read-only. */
export async function GET() {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response
  const db = createAdminClient()
  const vendored = loadVendoredDefinitions().map(d => ({
    def_key: d.def_key, version: d.version, def_hash: d.def_hash, status: d.spec.status,
  }))
  const registered = await Promise.all(vendored.map(async v => {
    const row = await readDefinition(db, v.def_key, v.version)
    return { def_key: v.def_key, version: v.version, registered: !!row, def_hash: row?.def_hash ?? null }
  }))
  return NextResponse.json({ vendored, registered })
}
