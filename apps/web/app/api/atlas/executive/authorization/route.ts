/**
 * POST /api/atlas/executive/authorization — Authorization V1 lifecycle acts.
 *
 * DELIBERATELY NOT A CREATION ROUTE. `requestAuthorization` accepts a raw
 * `AuthorizationTarget` (`{ targetType, targetId, versionHash }`) and a raw
 * `RequestedAuthority` (`{ actionKind, description }`), all free-form strings
 * validated against no registry. Exposing that to HTTP would let an
 * authenticated human mint a grant naming any action kind at all — including
 * the spending and publishing FM.2 excludes from Stage 1. Nothing would execute
 * today, which is precisely the danger: the rows are append-only and immutable,
 * so they would wait in the ledger until some future consumer began honouring
 * authorizations, and would then be arbitrary pre-existing grants nobody
 * reviewed.
 *
 * Authorization requests are therefore created only by the purpose-scoped,
 * server-atomic `request_authorization` action on the Decision and Mission
 * routes, where the target and action kind are derived from a prepared
 * candidate rather than named by the caller.
 *
 * This route acts on an authorization that already exists: grant, deny, revoke.
 * A grant must carry an explicit `expiresAt` — bounded validity is mandatory
 * (§27.319) and the domain enforces it; this route does not relax it.
 *
 * `grant_with_conditions` records genuine human authority whose conditions
 * remain fail-closed for operational use in V1. This route does not make
 * conditions executable and contains no conditional evaluation.
 */

import { NextResponse } from 'next/server'

import {
  grantAuthorization,
  grantAuthorizationWithConditions,
  denyAuthorization,
  revokeAuthorization,
} from '@/lib/atlas/authorization/principal-write'
import {
  assertSameOrigin, readJsonBody, reservedFieldIn, pick, isUuid,
  badRequest, unknownAction, mapFailure, type DomainResult,
} from '@/lib/atlas/executive/http'
import * as A from '@/lib/atlas/executive/canonical-authorization'
import { arrayOf, isRejected } from '@/lib/atlas/executive/canonicalize'

export const dynamic = 'force-dynamic'

const ACTIONS = ['grant', 'grant_with_conditions', 'deny', 'revoke'] as const
type Action = (typeof ACTIONS)[number]

/** Exactly the fields `DecideAuthorizationArgs` accepts, minus injection. */
const DECIDE_FIELDS = ['authorizationId', 'expiresAt', 'conditions', 'evidence', 'reason'] as const

/**
 * STRUCTURED TRANSPORT MAP (EI-HTTP-DTO-01).
 *
 * An Authorization event IS the authority record. The builder validates some
 * condition fields and then persists the caller's own condition objects and
 * evidence, so without reconstruction an unknown key would become part of an
 * immutable, append-only grant.
 *
 * Shape only. `grant_with_conditions` still requires conditions — that rule
 * stays with the domain and with the explicit check below — and conditions
 * remain recorded rather than execution-effective in Stage 1.
 */
const AUTHORIZATION_STRUCTURED = {
  conditions: arrayOf(A.condition),
  evidence:   arrayOf(A.evidenceReference),
} as const

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

  if (!isUuid(body.authorizationId)) return badRequest('authorizationId')

  // §27.319 — a grant without bounded validity is not a grant we will make
  // reachable. The domain also enforces this; checking here keeps the refusal a
  // clean 400 instead of a domain round-trip.
  if (action === 'grant' || action === 'grant_with_conditions') {
    if (typeof body.expiresAt !== 'string' || Number.isNaN(Date.parse(body.expiresAt))) {
      return badRequest('expiresAt_required')
    }
  }
  if (action === 'grant_with_conditions' && !Array.isArray(body.conditions)) {
    return badRequest('conditions_required')
  }

  // Reconstruct the structured fields; the caller's own objects never reach the
  // append-only ledger (EI-HTTP-DTO-01).
  for (const [field, parser] of Object.entries(AUTHORIZATION_STRUCTURED)) {
    if (body[field] === undefined) continue
    const parsed = (parser as (v: unknown) => unknown)(body[field])
    if (isRejected(parsed)) return badRequest(field)
    body[field] = parsed
  }

  const args = pick<Parameters<typeof grantAuthorization>[0]>(body, DECIDE_FIELDS)

  const run: Record<Action, () => Promise<DomainResult>> = {
    grant:                  () => grantAuthorization(args),
    grant_with_conditions:  () => grantAuthorizationWithConditions(args),
    deny:                   () => denyAuthorization(args),
    revoke:                 () => revokeAuthorization(args),
  }

  const result = await run[action as Action]()
  if (result.status !== 'ok') return mapFailure(result)
  return NextResponse.json({ ok: true, authorization: result.state }, { status: 200 })
}
