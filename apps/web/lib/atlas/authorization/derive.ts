/**
 * lib/atlas/authorization/derive.ts — Authorization V1 pure core.
 *
 * Deterministic derivation of authorization state and effectiveness from an
 * immutable event chain. Zero I/O: no database, no network, no filesystem, no
 * clock read — the evaluation time is injected, so identical events plus
 * identical `at` always yield identical output.
 *
 * Two safety properties are load-bearing here:
 *
 *  1. EXPIRY IS DERIVED FROM TIME, never from a job. If `expiresAt <= at`, the
 *     authorization is not effective even when no `expired` event was ever
 *     appended (§27.319). No background worker is required for safety.
 *
 *  2. CONDITIONAL GRANTS ARE NOT EXECUTION-EFFECTIVE. Stage 1 has no condition
 *     enforcement engine (FM.2 excludes the policy engine), so a
 *     `granted_with_conditions` act is preserved as genuine human authority but
 *     reports `conditions_unverified` rather than effectiveness. Reporting it as
 *     effective would be canonical failure mode §27.348.
 *
 * Everything fails closed: an unrecognised or impossible chain raises rather
 * than resolving to a permissive default.
 */

import {
  MalformedAuthorizationChainError,
  type AuthorityBasis,
  type AuthorizationEffectivenessResult,
  type AuthorizationEvent,
  type AuthorizationStatus,
  type AuthorizationTarget,
  type DerivedAuthorizationState,
} from './types'

/** Acts that decide a pending request. */
const DECIDING = new Set<AuthorizationEvent['type']>(['granted', 'granted_with_conditions', 'denied'])
/** Acts that close an already-granted authorization. */
const CLOSING = new Set<AuthorizationEvent['type']>(['revoked', 'superseded', 'expired'])

// ── Ordering ──────────────────────────────────────────────────────────────────

/**
 * Deterministic history order: by time, then by event id so equal timestamps can
 * never reorder between reads. Duplicate event ids are collapsed, which makes a
 * retried append idempotent rather than a contradiction.
 */
export function orderAuthorizationEvents(events: AuthorizationEvent[]): AuthorizationEvent[] {
  const unique = new Map<string, AuthorizationEvent>()
  for (const event of events) {
    const existing = unique.get(event.eventId)
    if (existing && !sameEvent(existing, event)) {
      throw new MalformedAuthorizationChainError('event-id-stable', event.eventId)
    }
    unique.set(event.eventId, event)
  }
  return [...unique.values()].sort((a, b) => {
    const at = Date.parse(a.occurredAt)
    const bt = Date.parse(b.occurredAt)
    if (Number.isNaN(at) || Number.isNaN(bt)) {
      throw new MalformedAuthorizationChainError('event-timestamp-valid')
    }
    return at - bt || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)
  })
}

function sameEvent(a: AuthorizationEvent, b: AuthorizationEvent): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function sameTarget(a: AuthorizationTarget, b: AuthorizationTarget): boolean {
  return a.targetType === b.targetType && a.targetId === b.targetId && a.versionHash === b.versionHash
}

// ── Derivation ────────────────────────────────────────────────────────────────

/**
 * Fold an event chain into current state. Raises on any chain that could not be
 * a real history — a permissive "best effort" reading of a broken authority
 * record is exactly the wrong failure mode.
 */
export function deriveAuthorizationState(
  events: AuthorizationEvent[],
  options: { at: string },
): DerivedAuthorizationState {
  const ordered = orderAuthorizationEvents(events)
  if (ordered.length === 0) throw new MalformedAuthorizationChainError('chain-non-empty')

  const first = ordered[0]
  if (first.type !== 'requested') throw new MalformedAuthorizationChainError('chain-starts-with-request', first.type)

  const authorizationId = first.authorizationId
  const projectId = first.projectId
  if (!projectId) throw new MalformedAuthorizationChainError('project-scope-required')

  let status: AuthorizationStatus = 'pending'
  let principalId = first.principalId
  let authorityBasis: AuthorityBasis = first.authorityBasis
  let effectiveAt: string | null = null
  let expiresAt: string | null = null
  let revokedAt: string | null = null
  let supersededBy: string | null = null
  let conditions = first.conditions
  let evidence = first.evidence

  for (const [index, event] of ordered.entries()) {
    if (event.authorizationId !== authorizationId) {
      throw new MalformedAuthorizationChainError('single-aggregate', event.eventId)
    }
    // Scope, target and granted authority are pinned by the request and can
    // never drift within one chain — a change is a new authorization, not an
    // amendment (§27.22).
    if (event.projectId !== projectId) throw new MalformedAuthorizationChainError('project-scope-stable', event.eventId)
    if (!sameTarget(event.target, first.target)) throw new MalformedAuthorizationChainError('target-pin-stable', event.eventId)
    if (event.authority.actionKind !== first.authority.actionKind) {
      throw new MalformedAuthorizationChainError('authority-statement-stable', event.eventId)
    }
    if (!event.principalId) throw new MalformedAuthorizationChainError('human-principal-required', event.eventId)

    if (index === 0) continue

    if (DECIDING.has(event.type)) {
      if (status !== 'pending') throw new MalformedAuthorizationChainError('single-decision', event.eventId)
      if (event.type === 'granted' || event.type === 'granted_with_conditions') {
        // Bounded validity is mandatory on any grant (§27.319, §11.44).
        if (!event.expiresAt) throw new MalformedAuthorizationChainError('grant-requires-expiry', event.eventId)
        const expiry = Date.parse(event.expiresAt)
        if (Number.isNaN(expiry)) throw new MalformedAuthorizationChainError('grant-expiry-valid', event.eventId)
        if (expiry <= Date.parse(event.occurredAt)) {
          throw new MalformedAuthorizationChainError('grant-expiry-after-effective', event.eventId)
        }
        status = event.type
        effectiveAt = event.occurredAt
        expiresAt = event.expiresAt
      } else {
        status = 'denied'
      }
      principalId = event.principalId
      authorityBasis = event.authorityBasis
      conditions = event.conditions
      evidence = event.evidence.length > 0 ? event.evidence : evidence
      continue
    }

    if (CLOSING.has(event.type)) {
      if (status !== 'granted' && status !== 'granted_with_conditions') {
        throw new MalformedAuthorizationChainError('close-requires-grant', event.eventId)
      }
      if (event.type === 'revoked') {
        status = 'revoked'
        revokedAt = event.occurredAt
      } else if (event.type === 'superseded') {
        if (!event.supersededBy) throw new MalformedAuthorizationChainError('supersede-requires-successor', event.eventId)
        status = 'superseded'
        supersededBy = event.supersededBy
      } else {
        status = 'expired'
      }
      principalId = event.principalId
      continue
    }

    throw new MalformedAuthorizationChainError('unknown-event-type', event.type)
  }

  // Time-derived expiry: a live grant whose window has closed is expired even
  // when nobody appended an `expired` event (§27.319, owner decision 5).
  if ((status === 'granted' || status === 'granted_with_conditions') && expiresAt) {
    if (Date.parse(expiresAt) <= Date.parse(options.at)) status = 'expired'
  }

  const last = ordered[ordered.length - 1]
  return {
    authorizationId,
    status,
    projectId,
    principalId,
    authorityBasis,
    authority: first.authority,
    target: first.target,
    conditions,
    evidence,
    requestedAt: first.occurredAt,
    effectiveAt,
    expiresAt,
    revokedAt,
    supersededBy,
    eventCount: ordered.length,
    lastEventAt: last.occurredAt,
  }
}

// ── Effectiveness ─────────────────────────────────────────────────────────────

export interface EffectivenessQuery {
  at: string
  /** When supplied, the authorization must pin exactly this target version. */
  target?: AuthorizationTarget
  /** When supplied, the authorization must be scoped to this project. */
  projectId?: string
  /** When supplied, the authorization must grant exactly this action. */
  actionKind?: string
}

/**
 * Is this authorization execution-effective right now, and if not, why?
 *
 * A `granted_with_conditions` chain is a valid authority act but always answers
 * `conditions_unverified` in V1: there is no sanctioned mechanism to verify
 * conditions without building the policy engine FM.2 excludes, so the honest and
 * fail-closed answer is that execution is not authorized.
 */
export function isEffectiveNow(
  events: AuthorizationEvent[],
  query: EffectivenessQuery,
): AuthorizationEffectivenessResult {
  let state: DerivedAuthorizationState
  try {
    state = deriveAuthorizationState(events, { at: query.at })
  } catch {
    return { effective: false, reason: 'malformed_chain', state: null }
  }

  const deny = (reason: AuthorizationEffectivenessResult['reason']) =>
    ({ effective: false, reason, state }) as AuthorizationEffectivenessResult

  if (query.projectId !== undefined && query.projectId !== state.projectId) return deny('project_mismatch')
  if (query.target && !sameTarget(query.target, state.target)) return deny('version_mismatch')
  if (query.actionKind !== undefined && query.actionKind !== state.authority.actionKind) return deny('action_mismatch')

  switch (state.status) {
    case 'pending':     return deny('not_yet_decided')
    case 'denied':      return deny('denied')
    case 'revoked':     return deny('revoked')
    case 'superseded':  return deny('superseded')
    case 'expired':     return deny('expired')
    case 'granted_with_conditions': return deny('conditions_unverified')
    case 'granted':     return { effective: true, reason: 'effective', state }
  }
}

/**
 * Does this act need an authorization at all?
 *
 * Default-deny placeholder for the Chapter 11 seam. The materiality test that
 * actually answers this is canonical §11.19 and belongs to the Decision Ledger
 * (EI-S1.3B); V1 only guarantees the safe default — anything not positively
 * established as non-material requires authorization.
 */
export function isAuthorizationRequired(input: { materiality: 'material' | 'non_material' | 'unknown' }): boolean {
  return input.materiality !== 'non_material'
}
