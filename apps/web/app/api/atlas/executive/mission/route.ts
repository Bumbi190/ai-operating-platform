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
import * as M from '@/lib/atlas/executive/canonical-mission'

export const dynamic = 'force-dynamic'

const ACTIONS = [
  'open', 'propose', 'request_authorization', 'approve', 'activate',
  'cancel', 'pause', 'resume', 'close', 'evidence', 'review',
] as const

const AUTHORITY_PURPOSES = ['approve', 'activate', 'cancel'] as const
type Purpose = (typeof AUTHORITY_PURPOSES)[number]

/**
 * Every client-supplied key of `OpenMissionArgs`, named explicitly.
 *
 * `authority` here is `MissionActionBound[]` — the Mission Brief's action
 * bounds — NOT a raw `RequestedAuthority`. The two share a name and nothing
 * else; see `MISSION_OPEN_EXEMPT` below.
 *
 * `decisionRef` is load-bearing rather than decorative: the builder throws
 * `decision-authority-requires-reference` when `authoritySource.kind` is
 * `decision_ledger` and no reference is present, so omitting it here made a
 * Decision-backed Mission impossible to open over HTTP at all.
 */
const OPEN_FIELDS = [
  'projectId', 'asDraft',
  'title', 'missionType', 'executiveOwner', 'missionOwner', 'objective',
  'strategicContext', 'expectedOutcome', 'deliverables', 'successCriteria',
  'inScope', 'outOfScope', 'constraints', 'budget', 'authority', 'authoritySource',
  'allowedActions', 'forbiddenActions', 'tools', 'dataScope', 'dependencies',
  'assumptions', 'risks', 'approvalGates', 'deadline', 'reporting',
  'escalationTriggers', 'stopConditions', 'pauseConditions',
  'completionConditions', 'evidenceRequirements', 'decisionRef',
] as const

/**
 * COMPILE-TIME PARITY GUARD.
 *
 * The first version of this route omitted four genuine Mission Brief fields —
 * `authority`, `completionConditions`, `evidenceRequirements`, `decisionRef` —
 * and nothing caught it, because a missing key just silently never arrives.
 * These types make the omission a build failure instead: if the domain gains
 * another client-supplied field, `Missing` stops being `never` and TypeScript
 * refuses to compile until this adapter explicitly adjudicates it.
 *
 * The four excluded names are the dependency-injection seams, which are
 * server/test-only and must never be reachable from HTTP.
 */
type MissionOpenDomainKey = Exclude<
  keyof Parameters<typeof openMission>[0],
  'store' | 'now' | 'projectMode' | 'availability'
>
type MissingOpenField = Exclude<MissionOpenDomainKey, (typeof OPEN_FIELDS)[number]>
type ExtraOpenField = Exclude<(typeof OPEN_FIELDS)[number], MissionOpenDomainKey>
type AssertNever<T extends never> = T
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _OpenFieldsCoverDomain = AssertNever<MissingOpenField>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _OpenFieldsInventNothing = AssertNever<ExtraOpenField>

/**
 * `authority` is globally reserved because a raw `RequestedAuthority` must
 * never be client-supplied. Mission `open` is the one place the same name means
 * something a human legitimately writes, so the exemption is granted here and
 * nowhere else — not for request_authorization, approve, activate, cancel,
 * pause, resume, close, evidence or review.
 */
const MISSION_OPEN_EXEMPT = ['authority'] as const

/**
 * STRUCTURED TRANSPORT MAP (EI-HTTP-DTO-01).
 *
 * Every object-valued field a client may send to `open` is reconstructed into
 * its exact documented domain shape before it reaches the principal-write
 * boundary. `missionBoundProjection` folds the material ones into the hash a
 * human authorization is bound to, so an unknown nested key here would become
 * permanent, authority-bound institutional data.
 *
 * The parsers live in `lib/atlas/executive/canonical-mission.ts` and rebuild
 * objects rather than filtering them, so nothing can ride along on an object we
 * merely inspected.
 */
const OPEN_STRUCTURED = {
  deliverables:         M.arrayOfStr,
  successCriteria:      M.arrayOf(M.successCriterion),
  inScope:              M.arrayOfStr,
  outOfScope:           M.arrayOfStr,
  constraints:          M.arrayOf(M.constraint),
  budget:               M.nullable(M.budget),
  // `authority` refuses a RequestedAuthority masquerade by name; the other two
  // share the same canonical shape and simply never reconstruct those keys.
  authority:            M.arrayOf(M.authorityActionBound),
  authoritySource:      M.nullable(M.authoritySource),
  allowedActions:       M.arrayOf(M.actionBound),
  forbiddenActions:     M.arrayOf(M.actionBound),
  tools:                M.arrayOf(M.toolBound),
  dataScope:            M.arrayOf(M.dataScope),
  dependencies:         M.arrayOf(M.dependency),
  assumptions:          M.arrayOf(M.assumption),
  risks:                M.arrayOf(M.risk),
  approvalGates:        M.arrayOf(M.approvalGate),
  reporting:            M.arrayOf(M.reportingRequirement),
  escalationTriggers:   M.arrayOf(M.escalationTrigger),
  stopConditions:       M.arrayOf(M.haltCondition),
  pauseConditions:      M.arrayOf(M.haltCondition),
  completionConditions: M.arrayOfStr,
  evidenceRequirements: M.arrayOf(M.evidenceRequirement),
  decisionRef:          M.nullable(M.decisionRef),
} as const

/**
 * FINITE COVERAGE GUARD.
 *
 * `StructuredKeys` selects exactly the object-valued keys of the domain's own
 * open argument type — arrays included, since an array is an object. If the
 * domain gains another structured client-supplied field, `UnhandledStructured`
 * stops being `never` and the build fails until it is adjudicated above. That
 * is what stops this from becoming whack-a-mole: a new field cannot silently
 * bypass transport canonicalization.
 */
type StructuredKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends object ? K : never
}[keyof T]
type MissionOpenStructuredKey = Extract<StructuredKeys<Parameters<typeof openMission>[0]>, MissionOpenDomainKey>
type UnhandledStructured = Exclude<MissionOpenStructuredKey, keyof typeof OPEN_STRUCTURED>
type OverreachingStructured = Exclude<keyof typeof OPEN_STRUCTURED, MissionOpenStructuredKey>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _StructuredCoversDomain = AssertNever<UnhandledStructured>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _StructuredInventsNothing = AssertNever<OverreachingStructured>

/**
 * Canonicalize every structured field present on the request, in place of the
 * caller's own objects. Returns the offending field name on rejection so the
 * 400 names what was wrong without echoing caller input back.
 */
function canonicalizeOpen(
  body: Record<string, unknown>,
  args: Record<string, unknown>,
): string | null {
  for (const [field, parser] of Object.entries(OPEN_STRUCTURED)) {
    if (body[field] === undefined) continue
    const parsed = (parser as (v: unknown) => unknown)(body[field])
    if (M.isRejected(parsed)) return field
    args[field] = parsed
  }
  return null
}

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

  // The action is resolved BEFORE the reserved-field sweep, because the one
  // exemption is action-scoped. An unknown action is still refused first, so
  // nothing can smuggle a reserved field in under an unrecognised action.
  const action = body.action
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
    return unknownAction()
  }

  const exempt = action === 'open' ? MISSION_OPEN_EXEMPT : []
  const reserved = reservedFieldIn(body, exempt)
  if (reserved) return badRequest(`reserved_field:${reserved}`)

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
    const args = pick<Parameters<typeof openMission>[0]>(body, OPEN_FIELDS)
    // Every structured field is REBUILT; the caller's nested objects never reach
    // the domain, so no unknown key can land in the immutable record.
    const bad = canonicalizeOpen(body, args as unknown as Record<string, unknown>)
    if (bad) return badRequest(bad)
    const result = await openMission(args)
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
    case 'close': {
      // `closure` lands in the immutable Mission record, so it is reconstructed
      // rather than type-checked and forwarded (EI-HTTP-DTO-01).
      const canonicalClosure = M.closure(body.closure)
      if (M.isRejected(canonicalClosure)) return badRequest('closure')
      if (body.partial !== undefined && typeof body.partial !== 'boolean') return badRequest('partial')
      const closeArgs = pick<Parameters<typeof closeMission>[0]>(body, CLOSE_FIELDS)
      closeArgs.closure = canonicalClosure
      result = await closeMission(closeArgs)
      break
    }
    case 'evidence': {
      const canonicalEvidence = M.evidence(body.evidence)
      if (M.isRejected(canonicalEvidence)) return badRequest('evidence')
      const evidenceArgs = pick<Parameters<typeof recordMissionEvidence>[0]>(body, EVIDENCE_FIELDS)
      evidenceArgs.evidence = canonicalEvidence
      result = await recordMissionEvidence(evidenceArgs)
      break
    }
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
