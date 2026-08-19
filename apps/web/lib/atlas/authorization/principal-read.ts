/**
 * lib/atlas/authorization/principal-read.ts — principal-scoped read boundary,
 * and the Chapter 11 seam.
 *
 * Reads fail closed: no session, a project outside the caller's allow-list, an
 * unknown chain or a malformed chain all resolve to a typed denial rather than
 * to data. `CRON_SECRET` is never accepted as user authorization here — that
 * shared-secret pattern belongs to cron-only internal routes and must not back
 * a user-facing surface.
 *
 * EI-S1.3B (Chapter 11 Decision Ledger) consumes `resolveAuthorization` and
 * `isAuthorizationEffective`. The ledger stores an `authorizationId` and derives
 * effectiveness through this seam; it never copies authority state into itself,
 * so §11.41 ("a decision requiring approval is not effective until approval
 * exists") stays a live query rather than a duplicated field that can drift.
 */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { deriveAuthorizationState, isEffectiveNow } from './derive'
import { createAuthorizationEventStore, type AuthorizationEventStore } from './store'
import type {
  AuthorizationEffectivenessResult,
  AuthorizationEvent,
  AuthorizationTarget,
  DerivedAuthorizationState,
} from './types'

export type AuthorizationReadStatus =
  | 'ok'
  | 'no_principal'
  | 'project_denied'
  | 'not_found'
  | 'malformed'
  | 'unavailable'

export interface AuthorizationReadResult {
  state:   DerivedAuthorizationState | null
  /** Full immutable history, for audit. Empty unless the read was permitted. */
  history: AuthorizationEvent[]
  status:  AuthorizationReadStatus
}

interface ReadArgs {
  store?: AuthorizationEventStore
  now?:   string
}

const DENY = (status: AuthorizationReadStatus): AuthorizationReadResult =>
  ({ state: null, history: [], status })

/**
 * Read one authorization with its full event history.
 * Project ownership is checked against the chain's own scope before anything
 * is returned.
 */
export async function resolveAuthorization(
  authorizationId: string,
  args: ReadArgs = {},
): Promise<AuthorizationReadResult> {
  const access = await resolveProjectAccess()
  if (!access.ok) return DENY('no_principal')

  const store = args.store ?? createAuthorizationEventStore()
  const at = args.now ?? new Date().toISOString()

  let history: AuthorizationEvent[]
  try {
    history = await store.history(authorizationId)
  } catch {
    return DENY('unavailable')
  }
  if (history.length === 0) return DENY('not_found')

  // Scope check uses the chain's own recorded project, never a caller hint.
  if (!assertProjectAllowed(history[0].projectId, access.allowedProjectIds)) return DENY('project_denied')

  try {
    return { state: deriveAuthorizationState(history, { at }), history, status: 'ok' }
  } catch {
    return DENY('malformed')
  }
}

/**
 * The Chapter 11 seam: is this authorization execution-effective right now?
 *
 * Returns a typed reason, never a bare boolean, so a caller can distinguish
 * "expired" from "revoked" from "conditions unverified" — a distinction the
 * Decision Ledger needs to record honestly.
 */
export async function isAuthorizationEffective(
  authorizationId: string,
  query: { target?: AuthorizationTarget; projectId?: string; actionKind?: string } = {},
  args: ReadArgs = {},
): Promise<AuthorizationEffectivenessResult & { status: AuthorizationReadStatus }> {
  const at = args.now ?? new Date().toISOString()
  const read = await resolveAuthorization(authorizationId, { ...args, now: at })
  if (read.status !== 'ok') {
    return { effective: false, reason: 'malformed_chain', state: null, status: read.status }
  }
  return { ...isEffectiveNow(read.history, { ...query, at }), status: 'ok' }
}

/**
 * Find live authority for one pinned target inside a project — the lookup a
 * caller needs before acting. Only an unconditional, unexpired, unrevoked grant
 * for exactly this version answers `effective`.
 */
export async function findEffectiveAuthorizationForTarget(
  input: { projectId: string; target: AuthorizationTarget; actionKind?: string },
  args: ReadArgs = {},
): Promise<AuthorizationEffectivenessResult & { status: AuthorizationReadStatus }> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { effective: false, reason: 'malformed_chain', state: null, status: 'no_principal' }
  if (!assertProjectAllowed(input.projectId, access.allowedProjectIds)) {
    return { effective: false, reason: 'project_mismatch', state: null, status: 'project_denied' }
  }

  const store = args.store ?? createAuthorizationEventStore()
  const at = args.now ?? new Date().toISOString()

  let events: AuthorizationEvent[]
  try {
    events = await store.byTarget(input.projectId, input.target.targetType, input.target.targetId)
  } catch {
    return { effective: false, reason: 'malformed_chain', state: null, status: 'unavailable' }
  }
  if (events.length === 0) return { effective: false, reason: 'not_yet_decided', state: null, status: 'not_found' }

  const chains = new Map<string, AuthorizationEvent[]>()
  for (const event of events) {
    chains.set(event.authorizationId, [...(chains.get(event.authorizationId) ?? []), event])
  }

  let lastDenial: (AuthorizationEffectivenessResult & { status: AuthorizationReadStatus }) | null = null
  for (const chain of [...chains.values()].sort((a, b) => (a[0].authorizationId < b[0].authorizationId ? -1 : 1))) {
    const result = isEffectiveNow(chain, { at, target: input.target, projectId: input.projectId, actionKind: input.actionKind })
    if (result.effective) return { ...result, status: 'ok' }
    lastDenial = { ...result, status: 'ok' }
  }
  return lastDenial ?? { effective: false, reason: 'not_yet_decided', state: null, status: 'not_found' }
}

/** Bounded audit listing for one project. Fails closed. */
export async function listProjectAuthorizations(
  projectId: string,
  args: ReadArgs & { limit?: number } = {},
): Promise<{ events: AuthorizationEvent[]; status: AuthorizationReadStatus }> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { events: [], status: 'no_principal' }
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return { events: [], status: 'project_denied' }

  const store = args.store ?? createAuthorizationEventStore()
  try {
    return { events: await store.byProject(projectId, args.limit), status: 'ok' }
  } catch {
    return { events: [], status: 'unavailable' }
  }
}
