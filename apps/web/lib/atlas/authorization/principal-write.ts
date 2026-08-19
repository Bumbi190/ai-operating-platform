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
  | 'project_denied'
  | 'invalid_request'
  | 'unknown_authorization'
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

/** Resolve principal + scope, then append. Never throws; always fails closed. */
async function appendAct(
  projectIdOf: (store: AuthorizationEventStore) => Promise<{ projectId: string } | AuthorizationWriteResult>,
  make: (ctx: { principalId: string; projectId: string; occurredAt: string }) => BuildAuthorizationEventInput,
  args: CommonArgs,
): Promise<AuthorizationWriteResult> {
  const access = await resolveProjectAccess()
  if (!access.ok) return DENY('no_principal')

  const store = args.store ?? createAuthorizationEventStore()
  const occurredAt = args.now ?? new Date().toISOString()

  const resolved = await projectIdOf(store)
  if ('status' in resolved) return resolved
  const { projectId } = resolved

  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return DENY('project_denied')

  let event
  try {
    event = buildAuthorizationEvent(make({ principalId: access.userId, projectId, occurredAt }))
  } catch (error) {
    return DENY('invalid_request', error instanceof Error ? error.message : 'invalid')
  }

  try {
    await store.append(event)
    const history = await store.history(event.authorizationId)
    return { state: deriveAuthorizationState(history, { at: occurredAt }), status: 'ok' }
  } catch {
    return DENY('unavailable')
  }
}

/** Open a new authorization chain. Creates `requested`; grants nothing. */
export async function requestAuthorization(args: RequestAuthorizationArgs): Promise<AuthorizationWriteResult> {
  const authorizationId = newAuthorizationId()
  return appendAct(
    async () => ({ projectId: args.projectId }),
    ({ principalId, projectId, occurredAt }) => ({
      type: 'requested',
      authorizationId,
      projectId,
      principalId,
      target: args.target,
      authority: args.authority,
      evidence: args.evidence,
      occurredAt,
      targetPayload: args.targetPayload,
    }),
    args,
  )
}

/** Load an existing chain and hand back its pinned scope/target/authority. */
async function existingChain(store: AuthorizationEventStore, authorizationId: string, at: string) {
  const history = await store.history(authorizationId)
  if (history.length === 0) return DENY('unknown_authorization')
  try {
    return { state: deriveAuthorizationState(history, { at }) }
  } catch (error) {
    return DENY('invalid_request', error instanceof Error ? error.message : 'malformed')
  }
}

function decider(type: 'granted' | 'granted_with_conditions' | 'denied' | 'revoked' | 'superseded') {
  return async (args: DecideAuthorizationArgs & { supersededBy?: string }): Promise<AuthorizationWriteResult> => {
    const at = args.now ?? new Date().toISOString()
    const store = args.store ?? createAuthorizationEventStore()

    let prior: Awaited<ReturnType<typeof existingChain>>
    try {
      prior = await existingChain(store, args.authorizationId, at)
    } catch {
      return DENY('unavailable')
    }
    if ('status' in prior) return prior
    const pinned = prior.state

    return appendAct(
      async () => ({ projectId: pinned.projectId }),
      ({ principalId, projectId, occurredAt }) => ({
        type,
        authorizationId: args.authorizationId,
        projectId,
        principalId,
        // Scope, target and granted authority are pinned by the request; a
        // decision can never widen them (§27.22, §27.313).
        target: pinned.target,
        authority: pinned.authority,
        conditions: args.conditions,
        evidence: args.evidence,
        expiresAt: args.expiresAt ?? null,
        supersededBy: args.supersededBy ?? null,
        reason: args.reason ?? null,
        occurredAt,
      }),
      { store, now: at },
    )
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
