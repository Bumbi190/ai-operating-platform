/**
 * lib/atlas/authorization/types.ts — Explicit Human Authorization V1 domain.
 *
 * An authorization is an AUTHORITY ACT, not reasoning and not execution
 * (canonical §27.3). It proves that one identified human principal granted one
 * explicitly scoped permission, over one pinned version of one target, inside
 * one project, until an explicit expiry.
 *
 * The four canonical concepts stay separate and are never collapsed:
 *   recommendation (EI reasoning, §10.3)
 *     ≠ decision      (authorized commitment, §10.3 — EI-S1.3B)
 *     ≠ authorization (this module, §27.3)
 *     ≠ execution     (runs / atlas_actions)
 *     ≠ outcome       (§11.96)
 *
 * §10.4 is the governing rule: "A correct recommendation made by an
 * unauthorized actor is not an authorized decision. Technical capability must
 * never be mistaken for authority." A service role is capability, never
 * authority — so every authority act here carries a human principal id.
 *
 * V1 scope is deliberately small. Excluded by FM.2 and not modelled here: the
 * full Approval Inbox (Ch 27's 359 sections), policy engine (Ch 16), Damage
 * Boundary (Ch 17), Autonomy Licensing (Ch 18), Trust Score (Ch 19), crisis
 * authority (Ch 28), delegated approvers (§27.178), batch/policy-bound
 * approval and autonomy licences (§27.8's later rungs), and cross-project
 * approval (§27.16).
 */

// ── Identity ──────────────────────────────────────────────────────────────────

/** Stable identity of the authorization aggregate (the whole event chain). */
export type AuthorizationId = string

/** Stable identity of one immutable event within a chain. */
export type AuthorizationEventId = string

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * The immutable acts that can be appended. History is a chain of these; the
 * current status is DERIVED and never stored as a mutable column.
 *
 * `expired` is optional and historical only — expiry is derived from time
 * (see `deriveAuthorizationState`), so safety never depends on a job writing it.
 */
export type AuthorizationEventType =
  | 'requested'
  | 'granted'
  | 'granted_with_conditions'
  | 'denied'
  | 'revoked'
  | 'superseded'
  | 'expired'

/** The seven derived V1 states. */
export type AuthorizationStatus =
  | 'pending'
  | 'granted'
  | 'granted_with_conditions'
  | 'denied'
  | 'revoked'
  | 'expired'
  | 'superseded'

/**
 * Who held the authority. V1 recognises exactly one basis: the founder/owner of
 * the project, proven by project ownership. Delegated approvers, governance
 * policy, autonomy licences, budget mandates and crisis authority (§11.39) are
 * all deferred — each needs machinery FM.2 excludes from Stage 1.
 */
export type AuthorityBasis = 'founder_owner'

// ── Target and version pinning (§27.21, §27.22) ───────────────────────────────

/**
 * The concrete object the authority act reviewed. `versionHash` pins it: a
 * material change to the target produces a different hash, and the prior
 * authorization stops being effective for the new content (§27.22).
 */
export interface AuthorizationTarget {
  targetType:  string
  targetId:    string
  /** sha256 over the canonical serialization of the reviewed payload. */
  versionHash: string
}

// ── Requested authority (§27.20, §27.313) ─────────────────────────────────────

/**
 * Exactly what the grant permits. Structured, not free text, so the minimum-
 * authority principle (§27.313) is checkable: the grant permits `actionKind` on
 * this target in this project until the expiry — and nothing else.
 *
 * `description` is human-readable provenance, never the carrier of the
 * permission itself.
 */
export interface RequestedAuthority {
  actionKind:  string
  description: string
}

// ── Conditions (§11.42, §27.184) ──────────────────────────────────────────────

/**
 * "Conditions are part of the decision. They are not optional notes." (§11.42)
 * Structured so they carry stable identity and readable provenance, and so a
 * future policy engine can enforce them.
 *
 * V1 RECORDS conditions. It does NOT enforce them — there is no condition
 * enforcement engine in Stage 1 (FM.2 excludes the policy engine). A
 * conditional grant is therefore never execution-effective here; see
 * `AuthorizationEffectivenessReason.conditions_unverified`. Claiming otherwise
 * would be canonical failure mode §27.348 (Unenforced Conditions).
 */
export interface AuthorizationCondition {
  conditionId: string
  type:        string
  value:       string
  description: string
}

// ── Evidence (§11.27, §27.27) ─────────────────────────────────────────────────

/**
 * Evidence available at the moment of the authority act. Deliberately its own
 * shape rather than the EI `EvidenceChain`: EI evidence traces reasoning, this
 * traces what a human could see when they exercised authority.
 */
export interface AuthorizationEvidenceReference {
  kind:       string
  ref:        string
  label:      string
  capturedAt: string
}

// ── Events ────────────────────────────────────────────────────────────────────

/**
 * One immutable authority act. Rows are appended, never updated or deleted.
 *
 * `principalId` is the human who performed the act. It is derived server-side
 * from the authenticated session by the write boundary and is never accepted
 * from a caller.
 */
export interface AuthorizationEvent {
  eventId:        AuthorizationEventId
  authorizationId: AuthorizationId
  type:           AuthorizationEventType
  occurredAt:     string
  /** V1 requires an explicit non-null project scope (§27.15). */
  projectId:      string
  principalId:    string
  authorityBasis: AuthorityBasis
  target:         AuthorizationTarget
  authority:      RequestedAuthority
  conditions:     AuthorizationCondition[]
  evidence:       AuthorizationEvidenceReference[]
  /** Required on a grant; bounded validity is mandatory (§27.319, §11.44). */
  expiresAt:      string | null
  /** Set by `superseded`: the authorization that replaces this one. */
  supersededBy:   AuthorizationId | null
  /** Human-readable reason, e.g. why denied or revoked. Never the permission. */
  reason:         string | null
}

// ── Derived state ─────────────────────────────────────────────────────────────

export interface DerivedAuthorizationState {
  authorizationId: AuthorizationId
  status:          AuthorizationStatus
  projectId:       string
  /** Principal of the deciding act (grant/deny/revoke); requester while pending. */
  principalId:     string
  authorityBasis:  AuthorityBasis
  authority:       RequestedAuthority
  target:          AuthorizationTarget
  conditions:      AuthorizationCondition[]
  evidence:        AuthorizationEvidenceReference[]
  requestedAt:     string
  /** When the authority act took effect. Null unless granted. */
  effectiveAt:     string | null
  expiresAt:       string | null
  revokedAt:       string | null
  supersededBy:    AuthorizationId | null
  eventCount:      number
  lastEventAt:     string
}

/** Typed reason — effectiveness is never reported as a bare boolean. */
export type AuthorizationEffectivenessReason =
  | 'effective'
  | 'not_yet_decided'
  | 'denied'
  | 'revoked'
  | 'superseded'
  | 'expired'
  | 'conditions_unverified'
  | 'version_mismatch'
  | 'project_mismatch'
  | 'action_mismatch'
  | 'malformed_chain'

export interface AuthorizationEffectivenessResult {
  effective: boolean
  reason:    AuthorizationEffectivenessReason
  state:     DerivedAuthorizationState | null
}

/** Thrown by the pure core when an event chain cannot be a valid history. */
export class MalformedAuthorizationChainError extends Error {
  constructor(public readonly invariant: string, detail?: string) {
    super(`authorization: invariant ${invariant} failed${detail ? ` (${detail})` : ''}`)
    this.name = 'MalformedAuthorizationChainError'
  }
}
