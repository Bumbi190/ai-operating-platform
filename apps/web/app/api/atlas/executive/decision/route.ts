/**
 * POST /api/atlas/executive/decision — Decision Ledger V1 human acts.
 *
 * THE SERVER-ATOMIC AUTHORIZATION REQUEST is the reason this route exists in
 * this shape. An authority-bearing Decision act must reference an Authorization
 * whose target and action kind hash the exact act being authorized. If the
 * client were handed that binding to submit — prepare, receive, re-send — the
 * server-derived binding would be client-controlled again, and a caller could
 * request authority for terms other than the ones they later write.
 *
 * So `request_authorization` never leaves the server mid-flight:
 *
 *   candidate terms  →  prepareDecisionAct()  →  binding (server-held)
 *                    →  requestAuthorization({ projectId, target, authority })
 *                    →  authorization id returned
 *
 * The client supplies only the human terms. It cannot supply `target`,
 * `authority`, `targetType`, `targetId`, `versionHash`, `actionKind` or
 * `binding` — the shared helper rejects every one of those names.
 *
 * PREPARATION IS ADVISORY. When `approve`/`reject` is later called with the
 * resulting `authorizationId`, `principal-write` independently rebuilds the
 * candidate and recomputes the binding from its own content, then checks that
 * authorization against it. Changing any term between request and write changes
 * the binding, and the write fails `authority_not_effective`. Nothing here is
 * trusted at write time.
 */

import { NextResponse } from 'next/server'

import {
  prepareDecisionAct,
  proposeDecision,
  approveDecision,
  rejectDecision,
  observeOutcome,
  recordDecisionReview,
  completeDecision,
} from '@/lib/atlas/decision-ledger/principal-write'
import { requestAuthorization } from '@/lib/atlas/authorization/principal-write'
import {
  assertSameOrigin, readJsonBody, reservedFieldIn, pick, isUuid, isText,
  badRequest, unknownAction, mapFailure, type DomainResult,
} from '@/lib/atlas/executive/http'
import * as D from '@/lib/atlas/executive/canonical-decision'
import { isRejected } from '@/lib/atlas/executive/canonicalize'

export const dynamic = 'force-dynamic'

const ACTIONS = [
  'propose', 'request_authorization', 'approve', 'reject', 'review', 'outcome', 'complete',
] as const

/** Authority-bearing acts a human may request authorization for in R2. */
const AUTHORITY_PURPOSES = ['approve', 'reject'] as const
type Purpose = (typeof AUTHORITY_PURPOSES)[number]

const PROPOSE_FIELDS = [
  'projectId', 'title', 'statement', 'materiality', 'recommendation', 'rationale',
  'evidence', 'snapshot', 'alternatives', 'confidence', 'expectedImpact',
  'reversalConditions', 'asDraft',
] as const
const APPROVE_FIELDS = ['decisionId', 'authorizationId', 'rationale', 'review', 'effectiveAt', 'expiresAt'] as const
const REJECT_FIELDS  = ['decisionId', 'authorizationId', 'reason'] as const
const OUTCOME_FIELDS = ['decisionId', 'outcome'] as const
const REVIEW_FIELDS  = ['decisionId', 'reviewNote'] as const
const COMPLETE_FIELDS = ['decisionId', 'reason'] as const

/** Candidate terms for a prepared act — never includes `authorizationId`. */
const PREPARE_FIELDS: Record<Purpose, readonly string[]> = {
  approve: ['decisionId', 'rationale', 'review', 'effectiveAt', 'expiresAt'],
  reject:  ['decisionId', 'reason'],
}

/**
 * STRUCTURED TRANSPORT MAP (EI-HTTP-DTO-01).
 *
 * The Decision authority binding includes these structures, so their exact
 * shape is part of what a human authorization is bound to. The domain's
 * `validateEvidence` / `validateSnapshot` / `validateAlternatives` /
 * `validateReview` / `validateOutcome` check selected properties and then
 * return the caller's own object, so the adapter is the only place an unknown
 * nested key can be stopped.
 */
const DECISION_STRUCTURED = {
  materiality:        D.materiality,
  evidence:           D.arrayOf(D.evidenceReference),
  snapshot:           D.nullable(D.snapshot),
  alternatives:       D.arrayOf(D.alternative),
  confidence:         D.nullable(D.confidence),
  reversalConditions: D.arrayOfStr,
  review:             D.reviewCondition,
  outcome:            D.outcome,
} as const

/**
 * Canonicalize IN PLACE, before any act branches.
 *
 * `review` is read by BOTH `prepareDecisionAct` (which derives the
 * authorization binding) and `approveDecision` (which writes). Canonicalizing
 * once, on the single parsed body both paths read, makes a mismatch between the
 * authorized terms and the written terms structurally impossible — there is
 * only one representation after this runs. `body` is this request's own parsed
 * JSON and is not shared.
 */
function canonicalizeDecisionBody(body: Record<string, unknown>): string | null {
  for (const [field, parser] of Object.entries(DECISION_STRUCTURED)) {
    if (body[field] === undefined) continue
    const parsed = (parser as (v: unknown) => unknown)(body[field])
    if (isRejected(parsed)) return field
    body[field] = parsed
  }
  return null
}

/** §27.20 — structured provenance, server-derived. Never caller text. */
const describe = (purpose: Purpose) => `Executive Decision: ${purpose}`

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

  // Reconstruct every structured field ONCE, so `prepare` and the write path
  // can only ever see the same canonical terms.
  const badStructured = canonicalizeDecisionBody(body)
  if (badStructured) return badRequest(badStructured)

  // ── Open a decision (§11.49 draft / §11.50 proposal) ───────────────────────
  if (action === 'propose') {
    if (!isUuid(body.projectId)) return badRequest('projectId')
    if (!isText(body.title, 500)) return badRequest('title')
    if (!isText(body.statement)) return badRequest('statement')
    if (!Array.isArray(body.materiality) || body.materiality.length === 0) return badRequest('materiality')
    if (body.asDraft !== undefined && typeof body.asDraft !== 'boolean') return badRequest('asDraft')
    const result = await proposeDecision(
      pick<Parameters<typeof proposeDecision>[0]>(body, PROPOSE_FIELDS),
    )
    if (result.status !== 'ok') return mapFailure(result)
    return NextResponse.json({ ok: true, decision: result.state }, { status: 200 })
  }

  // ── Server-atomic purpose-scoped authorization request ─────────────────────
  if (action === 'request_authorization') {
    const purpose = body.purpose
    if (typeof purpose !== 'string' || !(AUTHORITY_PURPOSES as readonly string[]).includes(purpose)) {
      return badRequest('purpose')
    }
    if (!isUuid(body.decisionId)) return badRequest('decisionId')
    const p = purpose as Purpose
    if (p === 'approve') {
      if (!isText(body.rationale)) return badRequest('rationale')
      if (!body.review || typeof body.review !== 'object') return badRequest('review')
      if (typeof body.effectiveAt !== 'string' || Number.isNaN(Date.parse(body.effectiveAt))) {
        return badRequest('effectiveAt')
      }
    } else if (!isText(body.reason)) {
      return badRequest('reason')
    }

    // 1–3. Derive the exact binding server-side. `prepare` runs the same
    //      authentication, project authority, lifecycle gate and candidate
    //      construction as the write path, and appends nothing.
    const prepared = await prepareDecisionAct({
      act: p,
      ...pick<Record<string, never>>(body, PREPARE_FIELDS[p]),
    } as Parameters<typeof prepareDecisionAct>[0])

    if (prepared.status !== 'ok' || !prepared.binding) {
      return mapFailure({ status: prepared.status, detail: prepared.detail })
    }

    // 5. The binding never leaves the process: it goes straight into the
    //    request. `description` is derived here, not accepted.
    const result = await requestAuthorization({
      projectId: prepared.binding.projectId,
      target:    prepared.binding.target,
      authority: { actionKind: prepared.binding.actionKind, description: describe(p) },
    })
    if (result.status !== 'ok') return mapFailure(result)
    return NextResponse.json({ ok: true, authorization: result.state }, { status: 200 })
  }

  // ── Acts on an existing decision ───────────────────────────────────────────
  if (!isUuid(body.decisionId)) return badRequest('decisionId')

  if (action === 'approve' || action === 'reject') {
    if (!isUuid(body.authorizationId)) return badRequest('authorizationId')
  }

  let result: DomainResult
  switch (action) {
    case 'approve':
      if (!isText(body.rationale)) return badRequest('rationale')
      if (!body.review || typeof body.review !== 'object') return badRequest('review')
      if (typeof body.effectiveAt !== 'string' || Number.isNaN(Date.parse(body.effectiveAt))) {
        return badRequest('effectiveAt')
      }
      result = await approveDecision(
        pick<Parameters<typeof approveDecision>[0]>(body, APPROVE_FIELDS),
      )
      break
    case 'reject':
      if (!isText(body.reason)) return badRequest('reason')
      result = await rejectDecision(
        pick<Parameters<typeof rejectDecision>[0]>(body, REJECT_FIELDS),
      )
      break
    case 'review':
      if (!isText(body.reviewNote)) return badRequest('reviewNote')
      result = await recordDecisionReview(
        pick<Parameters<typeof recordDecisionReview>[0]>(body, REVIEW_FIELDS),
      )
      break
    case 'outcome':
      if (!body.outcome || typeof body.outcome !== 'object') return badRequest('outcome')
      result = await observeOutcome(
        pick<Parameters<typeof observeOutcome>[0]>(body, OUTCOME_FIELDS),
      )
      break
    case 'complete':
      if (!isText(body.reason)) return badRequest('reason')
      result = await completeDecision(
        pick<Parameters<typeof completeDecision>[0]>(body, COMPLETE_FIELDS),
      )
      break
    default:
      return unknownAction()
  }

  if (result.status !== 'ok') return mapFailure(result)
  return NextResponse.json({ ok: true, decision: result.state }, { status: 200 })
}
