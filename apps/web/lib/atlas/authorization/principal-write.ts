/**
 * lib/atlas/authorization/principal-write.ts — the sanctioned write boundary
 * for authority acts.
 *
 * Every authorization event enters the system through here. The two things this
 * shell adds to the pure builder are the two things that make an act *authority*
 * rather than data:
 *
 *   1. The human principal is DERIVED from the authenticated session via
 *      `resolveProjectAccess()`. It is never a parameter. A caller cannot name
 *      whoever they like as the authority, and a service role — which has
 *      capability but not authority (§10.4) — can never author an act, because
 *      it has no session and `resolveProjectAccess` fails closed with 401.
 *
 *   2. The project scope is validated against the caller's own allow-list, so a
 *      principal can only exercise authority inside a project they own.
 *
 * `import 'server-only'` keeps this module and the service-role store out of any
 * client bundle. No UI may write authorization rows directly.
 *
 * Nothing here executes anything. Appending a grant authorizes; it never acts
 * (§27.3 vs execution). Authorization ≠ execution is preserved by construction:
 * this module imports no tool, no runner and no action dispatcher.
 *
 * ORDERING RULE (EI-S1.3A-R1): authenticate → establish project authority →
 * only then touch the privileged store. An earlier revision read the event chain
 * before authenticating in order to discover its project, which let an
 * unauthenticated caller distinguish "no such authorization" from "exists but
 * not yours" — an authorization-id existence oracle. Unknown and unauthorized
 * now return one indistinguishable `not_permitted`, and no store read happens
 * until a principal is established.
 */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { buildAuthorizationEvent, newAuthorizationId, type BuildAuthorizationEventInput } from './build'
import { deriveAuthorizationState } from './derive'
import { createAuthorizationEventStore, type AuthorizationEventStore } from './store'
import type {
  AuthorizationCondition,
  AuthorizationEvidenceReference,
  AuthorizationTarget,
  DerivedAuthorizationState,
  RequestedAuthority,
} from './types'

export type AuthorizationWriteStatus =
  | 'ok'
  | 'no_principal'
  /** Caller supplied the scope and does not own it — reveals nothing new. */
  | 'project_denied'
  /**
   * Deliberately indistinguishable: the authorization does not exist, OR it
   * exists in a project the caller cannot access. Never split these apart.
   */
  | 'not_permitted'
  | 'invalid_request'
  /** A competing terminal act won the race; the chain is unchanged. */
  | 'conflict'
  | 'unavailable'

export interface AuthorizationWriteResult {
  state:  DerivedAuthorizationState | null
  status: AuthorizationWriteStatus
  /** Names the failed invariant on `invalid_request`. Never leaks a path. */
  detail?: string
}

interface CommonArgs {
  store?: AuthorizationEventStore
  /** Injected clock; production callers omit it. */
  now?: string
}

export interface RequestAuthorizationArgs extends CommonArgs {
  projectId: string
  target:    AuthorizationTarget
  authority: RequestedAuthority
  evidence?: AuthorizationEvidenceReference[]
  /** When supplied, the version pin is recomputed from it and must match. */
  targetPayload?: unknown
}

export interface DecideAuthorizationArgs extends CommonArgs {
  authorizationId: string
  /** Mandatory on a grant — bounded validity (§27.319). */
  expiresAt?: string
  conditions?: AuthorizationCondition[]
  evidence?: AuthorizationEvidenceReference[]
  reason?: string
}

const DENY = (status: AuthorizationWriteStatus, detail?: string): AuthorizationWriteResult =>
  ({ state: null, status, ...(detail ? { detail } : {}) })

/** Postgres unique-violation — a competing terminal act already landed. */
function isConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('23505') || message.toLowerCase().includes('duplicate key')
}

interface Principal { userId: string; allowedProjectIds: string[] }

/**
 * Step 1 of the ordering rule. Nothing privileged may run before this resolves.
 */
async function authenticate(): Promise<Principal | AuthorizationWriteResult> {
  const access = await resolveProjectAccess()
  if (!access.ok) return DENY('no_principal')
  return { userId: access.userId, allowedProjectIds: access.allowedProjectIds }
}

async function persist(
  store: AuthorizationEventStore,
  input: BuildAuthorizationEventInput,
  at: string,
): Promise<AuthorizationWriteResult> {
  let event
  try {
    event = buildAuthorizationEvent(input)
  } catch (error) {
    return DENY('invalid_request', error instanceof Error ? error.message : 'invalid')
  }
  try {
    await store.append(event)
  } catch (error) {
    return isConflict(error) ? DENY('conflict') : DENY('unavailable')
  }
  try {
    const history = await store.history(event.authorizationId)
    return { state: deriveAuthorizationState(history, { at }), status: 'ok' }
  } catch {
    return DENY('unavailable')
  }
}

/**
 * Open a new authorization chain. Creates `requested`; grants nothing.
 *
 * The caller supplies the project, so `project_denied` here reveals only that
 * the caller does not own a project they already named — not an oracle.
 *
 * Retry semantics: retry-SAFE, NOT idempotent. Each call mints a new
 * authorization id, so a retried request opens a second pending chain. That is
 * harmless (nothing is authorized by a request) but it is not deduplication.
 */
export async function requestAuthorization(args: RequestAuthorizationArgs): Promise<AuthorizationWriteResult> {
  const principal = await authenticate()
  if ('status' in principal) return principal
  if (!assertProjectAllowed(args.projectId, principal.allowedProjectIds)) return DENY('project_denied')

  const store = args.store ?? createAuthorizationEventStore()
  const occurredAt = args.now ?? new Date().toISOString()

  return persist(store, {
    type: 'requested',
    authorizationId: newAuthorizationId(),
    projectId: args.projectId,
    principalId: principal.userId,
    target: args.target,
    authority: args.authority,
    evidence: args.evidence,
    occurredAt,
    targetPayload: args.targetPayload,
  }, occurredAt)
}

function decider(type: 'granted' | 'granted_with_conditions' | 'denied' | 'revoked' | 'superseded') {
  return async (args: DecideAuthorizationArgs & { supersededBy?: string }): Promise<AuthorizationWriteResult> => {
    // 1. AUTHENTICATE — before any privileged read.
    const principal = await authenticate()
    if ('status' in principal) return principal

    const store = args.store ?? createAuthorizationEventStore()
    const at = args.now ?? new Date().toISOString()

    // 2. Now that a principal exists, resolve the chain to learn its scope.
    let history
    try {
      history = await store.history(args.authorizationId)
    } catch {
      return DENY('unavailable')
    }
    // Unknown chain and foreign chain share one denial class, so neither can be
    // used to probe whether an authorization id exists.
    if (history.length === 0) return DENY('not_permitted')

    let pinned
    try {
      pinned = deriveAuthorizationState(history, { at })
    } catch (error) {
      return DENY('invalid_request', error instanceof Error ? error.message : 'malformed')
    }

    // 3. ESTABLISH PROJECT AUTHORITY against the chain's own recorded scope.
    if (!assertProjectAllowed(pinned.projectId, principal.allowedProjectIds)) return DENY('not_permitted')

    // 4. Append. Scope, target and authority are re-pinned from the chain, so a
    //    decision can never widen what was requested (§27.22, §27.313).
    return persist(store, {
      type,
      authorizationId: args.authorizationId,
      projectId: pinned.projectId,
      principalId: principal.userId,
      target: pinned.target,
      authority: pinned.authority,
      conditions: args.conditions,
      evidence: args.evidence,
      expiresAt: args.expiresAt ?? null,
      supersededBy: args.supersededBy ?? null,
      reason: args.reason ?? null,
      occurredAt: at,
    }, at)
  }
}

/** Unconditional grant. Requires an explicit future `expiresAt`. */
export const grantAuthorization = decider('granted')

/**
 * Conditional grant. Recorded as genuine human authority, but never
 * execution-effective in V1 — there is no condition enforcement engine, so
 * `isEffectiveNow` reports `conditions_unverified` (§27.348).
 */
export const grantAuthorizationWithConditions = decider('granted_with_conditions')

export const denyAuthorization = decider('denied')
export const revokeAuthorization = decider('revoked')

/** Supersede this authorization with a successor. Appends; never mutates. */
export async function supersedeAuthorization(
  args: DecideAuthorizationArgs & { supersededBy: string },
): Promise<AuthorizationWriteResult> {
  return decider('superseded')(args)
}
