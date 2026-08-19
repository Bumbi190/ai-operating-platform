/**
 * lib/atlas/authorization/build.ts — pure construction and validation of
 * authorization events.
 *
 * Separated from the write boundary so every validation rule is testable with
 * no database, no session and no clock. The shell (`principal-write.ts`) adds
 * exactly two things this module cannot do safely: the authenticated human
 * principal and the project-access check.
 *
 * Zero I/O apart from `node:crypto` hashing of a caller-supplied value.
 */

import { createHash, randomUUID } from 'node:crypto'
import { MalformedAuthorizationChainError } from './types'
import type {
  AuthorityBasis,
  AuthorizationCondition,
  AuthorizationEvent,
  AuthorizationEventType,
  AuthorizationEvidenceReference,
  AuthorizationTarget,
  RequestedAuthority,
} from './types'

const SHA256_HEX = /^[a-f0-9]{64}$/

// ── Canonical version pinning (§27.22) ────────────────────────────────────────

/** Key-order-independent serialization, so an equal object always hashes equal. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/**
 * The version pin for a reviewed payload. Deterministic and order-independent:
 * the same content always produces the same hash, and any material change
 * produces a different one, which is what invalidates a prior authorization.
 */
export function canonicalTargetVersionHash(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex')
}

// ── Validation ────────────────────────────────────────────────────────────────

function requireText(value: unknown, invariant: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MalformedAuthorizationChainError(invariant)
  }
  return value
}

function requireIsoTime(value: string, invariant: string): string {
  if (Number.isNaN(Date.parse(value))) throw new MalformedAuthorizationChainError(invariant, value)
  return value
}

function validateTarget(target: AuthorizationTarget): AuthorizationTarget {
  requireText(target?.targetType, 'target-type-required')
  requireText(target?.targetId, 'target-id-required')
  requireText(target?.versionHash, 'target-version-required')
  if (!SHA256_HEX.test(target.versionHash)) {
    throw new MalformedAuthorizationChainError('target-version-hash-format')
  }
  return target
}

function validateConditions(conditions: AuthorizationCondition[]): AuthorizationCondition[] {
  const seen = new Set<string>()
  for (const condition of conditions) {
    requireText(condition?.conditionId, 'condition-id-required')
    requireText(condition?.type, 'condition-type-required')
    requireText(condition?.value, 'condition-value-required')
    if (seen.has(condition.conditionId)) {
      throw new MalformedAuthorizationChainError('condition-id-unique', condition.conditionId)
    }
    seen.add(condition.conditionId)
  }
  return conditions
}

// ── Construction ──────────────────────────────────────────────────────────────

export interface BuildAuthorizationEventInput {
  type:            AuthorizationEventType
  authorizationId: string
  /** V1 requires an explicit non-null project scope (§27.15, owner decision 6). */
  projectId:       string
  /** Server-derived human identity. Never taken from an untrusted caller. */
  principalId:     string
  authorityBasis?: AuthorityBasis
  target:          AuthorizationTarget
  authority:       RequestedAuthority
  conditions?:     AuthorizationCondition[]
  evidence?:       AuthorizationEvidenceReference[]
  expiresAt?:      string | null
  supersededBy?:   string | null
  reason?:         string | null
  occurredAt:      string
  eventId?:        string
  /**
   * When the caller holds the reviewed payload, the pin is recomputed from it
   * and must match `target.versionHash` — a caller-supplied hash is never
   * trusted on its own where the runtime can check it.
   */
  targetPayload?:  unknown
}

export function buildAuthorizationEvent(input: BuildAuthorizationEventInput): AuthorizationEvent {
  requireText(input.authorizationId, 'authorization-id-required')
  requireText(input.projectId, 'project-scope-required')
  requireText(input.principalId, 'human-principal-required')
  requireText(input.authority?.actionKind, 'authority-action-required')
  requireIsoTime(input.occurredAt, 'occurred-at-valid')

  const target = validateTarget(input.target)
  if (input.targetPayload !== undefined) {
    const recomputed = canonicalTargetVersionHash(input.targetPayload)
    if (recomputed !== target.versionHash) {
      throw new MalformedAuthorizationChainError('target-version-matches-payload')
    }
  }

  const conditions = validateConditions(input.conditions ?? [])

  // A grant must be bounded, and conditional grants must actually carry
  // conditions — otherwise the two grant types are indistinguishable.
  if (input.type === 'granted' || input.type === 'granted_with_conditions') {
    const expiresAt = requireText(input.expiresAt, 'grant-requires-expiry')
    requireIsoTime(expiresAt, 'grant-expiry-valid')
    if (Date.parse(expiresAt) <= Date.parse(input.occurredAt)) {
      throw new MalformedAuthorizationChainError('grant-expiry-after-effective')
    }
    if (input.type === 'granted_with_conditions' && conditions.length === 0) {
      throw new MalformedAuthorizationChainError('conditional-grant-requires-conditions')
    }
    if (input.type === 'granted' && conditions.length > 0) {
      throw new MalformedAuthorizationChainError('unconditional-grant-has-no-conditions')
    }
  }

  if (input.type === 'superseded') {
    requireText(input.supersededBy, 'supersede-requires-successor')
  }

  return {
    eventId:         input.eventId ?? randomUUID(),
    authorizationId: input.authorizationId,
    type:            input.type,
    occurredAt:      input.occurredAt,
    projectId:       input.projectId,
    principalId:     input.principalId,
    authorityBasis:  input.authorityBasis ?? 'founder_owner',
    target,
    authority:       input.authority,
    conditions,
    evidence:        input.evidence ?? [],
    expiresAt:       input.expiresAt ?? null,
    supersededBy:    input.supersededBy ?? null,
    reason:          input.reason ?? null,
  }
}

export function newAuthorizationId(): string {
  return randomUUID()
}
