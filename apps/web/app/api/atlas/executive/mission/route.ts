/**
 * POST /api/atlas/executive/mission — Executive Mission Brief V1 human acts.
 *
 * ACTIVATE IS NOT EXECUTE. This is the hard Stage-1 boundary and the reason
 * this route imports nothing but the Mission and Authorization write
 * boundaries. `activateMission` proves authority, snapshots project mode, and
 * appends one lifecycle record. It creates no run, no manager task, no Work
 * Package, no tool call and no delegation. The Manager and Workforce chain
 * stays exactly where it was, reachable only through `/api/manager`, and this
 * route neither imports nor touches it.
 *
 * `request_authorization` is server-atomic for the same reason as the Decision
 * route: the binding hashes the exact act, so handing it to the client to
 * re-submit would put a server-derived authority target back under client
 * control. Candidate terms go in, an authorization id comes out, and the
 * binding never leaves the process.
 *
 * `pause` and `cancel` are in the Stage-1 set deliberately. Making activation
 * reachable without making stopping reachable would be a worse surface than
 * leaving both unreachable.
 *
 * Deferred in R2 and absent from the allowlist: amend, supersede, fail,
 * archive, progress, blocker, dependency and gate resolution.
 */

import { NextResponse } from 'next/server'

import {
  prepareMissionAct,
  openMission,
  proposeMission,
  approveMission,
  activateMission,
  cancelMission,
  pauseMission,
  resumeMission,
  closeMission,
  recordMissionEvidence,
  reviewMission,
} from '@/lib/atlas/mission/principal-write'
import { requestAuthorization } from '@/lib/atlas/authorization/principal-write'
import {
  assertSameOrigin, readJsonBody, reservedFieldIn, pick, isUuid, isText,
  badRequest, unknownAction, mapFailure, type DomainResult,
} from '@/lib/atlas/executive/http'

export const dynamic = 'force-dynamic'

const ACTIONS = [
  'open', 'propose', 'request_authorization', 'approve', 'activate',
  'cancel', 'pause', 'resume', 'close', 'evidence', 'review',
] as const

const AUTHORITY_PURPOSES = ['approve', 'activate', 'cancel'] as const
type Purpose = (typeof AUTHORITY_PURPOSES)[number]

/** `MissionBriefInput` plus scope — every field named, none inferred. */
const OPEN_FIELDS = [
  'projectId', 'asDraft',
  'title', 'missionType', 'executiveOwner', 'missionOwner', 'objective',
  'strategicContext', 'expectedOutcome', 'deliverables', 'successCriteria',
  'inScope', 'outOfScope', 'constraints', 'budget', 'authoritySource',
  'allowedActions', 'forbiddenActions', 'tools', 'dataScope', 'dependencies',
  'assumptions', 'risks', 'approvalGates', 'deadline', 'reporting',
  'escalationTriggers', 'stopConditions', 'pauseConditions',
] as const

const APPROVE_FIELDS  = ['missionId', 'authorizationId'] as const
const ACTIVATE_FIELDS = ['missionId', 'authorizationId'] as const
const CANCEL_FIELDS   = ['missionId', 'authorizationId', 'reason'] as const
const PAUSE_FIELDS    = ['missionId', 'reason'] as const
const RESUME_FIELDS   = ['missionId'] as const
const CLOSE_FIELDS    = ['missionId', 'closure', 'partial'] as const
const EVIDENCE_FIELDS = ['missionId', 'evidence'] as const
const REVIEW_FIELDS   = ['missionId', 'reviewNote'] as const

const PREPARE_FIELDS: Record<Purpose, readonly string[]> = {
  approve:  ['missionId'],
  activate: ['missionId'],
  cancel:   ['missionId', 'reason'],
}

const describe = (purpose: Purpose) => `Executive Mission: ${purpose}`

export async function POST(request: Request) {
  const origin = assertSameOrigin(request)
  if (origin) return origin

  const body = await readJsonBody(request)
  if (body instanceof NextResponse) return body

  const reserved = reservedFieldIn(body)
  if (reserved) return badRequest(`reserved_field:${reserved}`)

  const action = body.action
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
    return unknownAction()
  }

  // ── Open a mission (§20.99 draft / §20.98 proposal) ────────────────────────
  // `asDraft` carries the distinction the domain already draws; there is no
  // free-form status from the client and no second lifecycle model here.
  if (action === 'open') {
    if (!isUuid(body.projectId)) return badRequest('projectId')
    if (!isText(body.title, 500)) return badRequest('title')
    if (!isText(body.objective)) return badRequest('objective')
    if (!isText(body.missionType, 200)) return badRequest('missionType')
    if (!isText(body.executiveOwner, 200)) return badRequest('executiveOwner')
    if (body.asDraft !== undefined && typeof body.asDraft !== 'boolean') return badRequest('asDraft')
    const result = await openMission(
      pick<Parameters<typeof openMission>[0]>(body, OPEN_FIELDS),
    )
    if (result.status !== 'ok') return mapFailure(result)
    return NextResponse.json({ ok: true, mission: result.state }, { status: 200 })
  }

  if (!isUuid(body.missionId)) return badRequest('missionId')

  if (action === 'propose') {
    const result = await proposeMission({ missionId: body.missionId })
    if (result.status !== 'ok') return mapFailure(result)
    return NextResponse.json({ ok: true, mission: result.state }, { status: 200 })
  }

  // ── Server-atomic purpose-scoped authorization request ─────────────────────
  if (action === 'request_authorization') {
    const purpose = body.purpose
    if (typeof purpose !== 'string' || !(AUTHORITY_PURPOSES as readonly string[]).includes(purpose)) {
      return badRequest('purpose')
    }
    const p = purpose as Purpose
    if (p === 'cancel' && !isText(body.reason)) return badRequest('reason')

    const prepared = await prepareMissionAct({
      act: p,
      ...pick<Record<string, never>>(body, PREPARE_FIELDS[p]),
    } as Parameters<typeof prepareMissionAct>[0])

    if (prepared.status !== 'ok' || !prepared.binding) {
      return mapFailure({ status: prepared.status, detail: prepared.detail })
    }

    const result = await requestAuthorization({
      projectId: prepared.binding.projectId,
      target:    prepared.binding.target,
      authority: { actionKind: prepared.binding.actionKind, description: describe(p) },
    })
    if (result.status !== 'ok') return mapFailure(result)
    return NextResponse.json({ ok: true, authorization: result.state }, { status: 200 })
  }

  if (action === 'approve' || action === 'activate' || action === 'cancel') {
    if (!isUuid(body.authorizationId)) return badRequest('authorizationId')
  }

  let result: DomainResult
  switch (action) {
    case 'approve':
      result = await approveMission(
        pick<Parameters<typeof approveMission>[0]>(body, APPROVE_FIELDS),
      )
      break
    case 'activate':
      // Lifecycle authority state only — see the header.
      result = await activateMission(
        pick<Parameters<typeof activateMission>[0]>(body, ACTIVATE_FIELDS),
      )
      break
    case 'cancel':
      if (!isText(body.reason)) return badRequest('reason')
      result = await cancelMission(
        pick<Parameters<typeof cancelMission>[0]>(body, CANCEL_FIELDS),
      )
      break
    case 'pause':
      if (!isText(body.reason)) return badRequest('reason')
      result = await pauseMission(
        pick<Parameters<typeof pauseMission>[0]>(body, PAUSE_FIELDS),
      )
      break
    case 'resume':
      result = await resumeMission(
        pick<Parameters<typeof resumeMission>[0]>(body, RESUME_FIELDS),
      )
      break
    case 'close':
      if (!body.closure || typeof body.closure !== 'object') return badRequest('closure')
      if (body.partial !== undefined && typeof body.partial !== 'boolean') return badRequest('partial')
      result = await closeMission(
        pick<Parameters<typeof closeMission>[0]>(body, CLOSE_FIELDS),
      )
      break
    case 'evidence':
      if (!body.evidence || typeof body.evidence !== 'object') return badRequest('evidence')
      result = await recordMissionEvidence(
        pick<Parameters<typeof recordMissionEvidence>[0]>(body, EVIDENCE_FIELDS),
      )
      break
    case 'review':
      if (!isText(body.reviewNote)) return badRequest('reviewNote')
      result = await reviewMission(
        pick<Parameters<typeof reviewMission>[0]>(body, REVIEW_FIELDS),
      )
      break
    default:
      return unknownAction()
  }

  if (result.status !== 'ok') return mapFailure(result)
  return NextResponse.json({ ok: true, mission: result.state }, { status: 200 })
}
