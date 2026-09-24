/**
 * lib/atlas/autonomy-license/derive.ts — the pure licence fold.
 *
 * The current licence is DERIVED from its immutable event chain, never stored
 * as a mutable status column. §18.274 requires Omnira to "preserve every grant,
 * renewal, restriction, suspension, and revocation" — which an append-only
 * chain does and a status column cannot, because updating a column destroys the
 * evidence that the earlier state ever existed.
 *
 * ── NARROWING IS FOLDED, NOT TRUSTED ───────────────────────────────────────
 * Ruling 7: "RESTRICTED may ONLY narrow … It may NEVER widen any of them."
 * The write boundary refuses a widening restriction, and this fold enforces
 * narrowing AGAIN by construction — level takes the minimum, actions take the
 * intersection, the window takes the latest start and the earliest end. So no
 * single bad row, and no future writer that forgets the rule, can produce a
 * licence wider than the one that was issued. The two mechanisms are not
 * redundant: the write refusal gives a caller a clear error, and the fold
 * guarantees that error is unreachable even if the write boundary is bypassed.
 *
 * ── FAIL CLOSED, NEVER REPAIR ──────────────────────────────────────────────
 * A chain that cannot be folded is `malformed_lineage` and resolves to L0.
 * Nothing here rewrites, reorders or skips a record to make a chain valid: a
 * ledger that can be silently repaired is a ledger that cannot be trusted to
 * say what happened.
 */

import { compareLevels } from './levels'
import { entriesFor } from './scope'
import type { AutonomyLicenseLevel } from './levels'
import type {
  AutonomyLicenseId,
  LicenseEvent,
  LicenseGeneration,
  LicenseReason,
  LicenseStatus,
  LicensedActionEntry,
} from './types'

/** Acts that end a lineage. Nothing may follow one (§18.57, §18.56). */
const TERMINAL_ACTS = new Set(['LICENSE_REVOKED', 'LICENSE_SUPERSEDED'])

export interface DerivedLicenseState {
  readonly licenseId: AutonomyLicenseId
  readonly status: LicenseStatus
  readonly projectId: string
  readonly workflowInstanceId: string
  readonly boundDefKey: string
  readonly boundDefHash: string
  readonly licensedLevel: AutonomyLicenseLevel
  /** The ACTION KINDS the fold permits. Classes are added at read time. */
  readonly actionKinds: readonly string[]
  /** Entries with CURRENT registry classes — what the read model reports. */
  readonly entries: readonly LicensedActionEntry[]
  readonly effectiveAt: string
  readonly expiresAt: string
  /** The fingerprint recorded by the latest scope-carrying event. */
  readonly recordedFingerprint: string
  readonly decision: { decisionId: string; version: number; recordId: string }
  readonly issuer: string
  readonly generation: LicenseGeneration
  readonly eventCount: number
  readonly supersededByLicenseId: string | null
}

export class MalformedLicenseLineageError extends Error {
  constructor(invariant: string, detail?: string) {
    super(`malformed autonomy-license lineage: ${invariant}${detail ? ` (${detail})` : ''}`)
    this.name = 'MalformedLicenseLineageError'
  }
}

/**
 * Canonical order: time, then GENERATION, then the database's monotonic cursor.
 *
 * The generation tiebreak is load-bearing for the same reason it is in the
 * decision ledger: two acts stamped in the same millisecond would otherwise be
 * ordered by a random UUID, and "was this licence revoked before or after it
 * was restricted?" would be a coin flip. Generation is a fact about the chain,
 * not about the clock.
 */
export function orderLicenseEvents(events: readonly LicenseEvent[]): LicenseEvent[] {
  return [...events].sort((a, b) =>
    (Date.parse(a.occurredAt) - Date.parse(b.occurredAt)) ||
    (a.generation - b.generation) ||
    (a.eventSeq - b.eventSeq),
  )
}

/**
 * The generation an act derived from this chain belongs to: the chain's current
 * length, because generations are contiguous from zero.
 *
 * The database enforces contiguity independently via a unique index on
 * `(license_id, license_generation)`, so two human acts derived from the same
 * state claim the same number and the second is rejected. Timestamps are never
 * the serialization mechanism.
 */
export function licenseGenerationOf(events: readonly LicenseEvent[]): LicenseGeneration {
  return events.length
}

/**
 * Fold one licence lineage. Throws `MalformedLicenseLineageError` when the chain
 * cannot be read as a history — the caller converts that to `malformed_lineage`
 * rather than this function inventing a status.
 */
export function deriveLicenseState(events: readonly LicenseEvent[]): DerivedLicenseState {
  if (events.length === 0) throw new MalformedLicenseLineageError('empty-lineage')

  const ordered = orderLicenseEvents(events)

  // ── Structural validity ───────────────────────────────────────────────────
  const first = ordered[0]
  if (first.act !== 'LICENSE_ISSUED') {
    throw new MalformedLicenseLineageError('lineage-starts-with-issue', first.act)
  }

  const licenseId = first.licenseId
  for (const event of ordered) {
    if (event.licenseId !== licenseId) {
      throw new MalformedLicenseLineageError('license-id-drift', event.licenseId)
    }
    // The subject is fixed at issue and may never move. A restriction naming a
    // different instance would be a second grant smuggled into a narrowing act.
    if (event.workflowInstanceId !== first.workflowInstanceId) {
      throw new MalformedLicenseLineageError('subject-drift', event.eventId)
    }
    if (event.projectId !== first.projectId) {
      throw new MalformedLicenseLineageError('project-drift', event.eventId)
    }
    if (event.boundDefKey !== first.boundDefKey) {
      throw new MalformedLicenseLineageError('definition-key-drift', event.eventId)
    }
  }

  // Contiguity from zero: a gap means an act was lost or hidden, and every
  // later act was derived from a state this chain cannot show.
  ordered.forEach((event, index) => {
    if (event.generation !== index) {
      throw new MalformedLicenseLineageError('generation-gap', `${index}:${event.generation}`)
    }
  })

  const terminalIndex = ordered.findIndex(e => TERMINAL_ACTS.has(e.act))
  if (terminalIndex !== -1 && terminalIndex !== ordered.length - 1) {
    throw new MalformedLicenseLineageError('act-after-terminal', ordered[terminalIndex + 1].act)
  }

  // ── Narrowing fold ────────────────────────────────────────────────────────
  let level: AutonomyLicenseLevel = first.licensedLevel
  let kinds: string[] = [...first.allowedActionKinds].sort()
  if (kinds.length === 0) {
    throw new MalformedLicenseLineageError('issue-without-actions', first.eventId)
  }
  let effectiveAt = first.effectiveAt
  let expiresAt = first.expiresAt
  let scopeEvent = first

  for (let i = 1; i < ordered.length; i += 1) {
    const event = ordered[i]

    if (event.act === 'LICENSE_RESTRICTED') {
      if (compareLevels(event.licensedLevel, level) > 0) {
        throw new MalformedLicenseLineageError('restriction-raises-level', event.eventId)
      }
      level = event.licensedLevel

      const next = [...event.allowedActionKinds].sort()
      const narrowed = kinds.filter(k => next.includes(k))
      // A restriction that is not a subset would WIDEN the granted set. The
      // write boundary refuses it; catching it here too means a bypassed
      // boundary still cannot widen authority.
      if (narrowed.length !== next.length) {
        throw new MalformedLicenseLineageError('restriction-adds-action', event.eventId)
      }
      kinds = narrowed
      scopeEvent = event
    }

    // Window narrows in both directions: a later start or an earlier end. Both
    // are strictly narrowing, so no row can widen the window it inherits.
    if (Date.parse(event.effectiveAt) > Date.parse(effectiveAt)) effectiveAt = event.effectiveAt
    if (Date.parse(event.expiresAt) < Date.parse(expiresAt)) expiresAt = event.expiresAt
  }

  if (Date.parse(expiresAt) <= Date.parse(effectiveAt)) {
    throw new MalformedLicenseLineageError('window-empty', `${effectiveAt}..${expiresAt}`)
  }

  const last = ordered[ordered.length - 1]
  const status: LicenseStatus =
    last.act === 'LICENSE_REVOKED' ? 'revoked'
    : last.act === 'LICENSE_SUPERSEDED' ? 'superseded'
    : last.act === 'LICENSE_SUSPENDED' ? 'suspended'
    : last.act === 'LICENSE_RESTRICTED' ? 'restricted'
    : 'active'

  return {
    licenseId,
    status,
    projectId: first.projectId,
    workflowInstanceId: first.workflowInstanceId,
    boundDefKey: first.boundDefKey,
    boundDefHash: first.boundDefHash,
    licensedLevel: level,
    actionKinds: kinds,
    // Classes come from the CURRENT registry, which is what makes the read
    // model report today's truth while the drift check compares it against the
    // fingerprint recorded on the day of issue.
    entries: entriesFor(kinds),
    effectiveAt,
    expiresAt,
    recordedFingerprint: scopeEvent.actionScopeFingerprint,
    decision: {
      decisionId: first.decisionId,
      version: first.decisionVersion,
      recordId: first.decisionRecordId,
    },
    issuer: first.actor,
    generation: last.generation,
    eventCount: ordered.length,
    supersededByLicenseId: last.supersededByLicenseId,
  }
}

/**
 * Why this licence is (not) effective right now, given the read clock and the
 * three facts a pure fold cannot know: whether the authorizing decision still
 * governs, whether the definition moved, and whether the registry reclassified.
 *
 * Precedence is deliberate. A terminal act (revoked/superseded) outranks a time
 * window, because "this was taken away" is a more useful answer than "and it
 * also expired". A live suspension outranks the window for the same reason. The
 * time window then decides, and only a licence that is live AND in window AND
 * whose subject is unchanged can be `active`.
 */
export function effectivenessOf(
  state: DerivedLicenseState,
  at: string,
  external: {
    defHashMatches: boolean
    scopeMatches: boolean
    decisionGoverning: boolean
    decisionReason: string | null
  },
): { effective: boolean; reason: LicenseReason; decisionReason: string | null } {
  const deny = (reason: LicenseReason, decisionReason: string | null = null) =>
    ({ effective: false, reason, decisionReason })

  if (state.status === 'revoked') return deny('revoked')
  if (state.status === 'superseded') return deny('superseded')
  if (state.status === 'suspended') return deny('suspended')

  const now = Date.parse(at)
  if (now < Date.parse(state.effectiveAt)) return deny('not_yet_effective')
  if (now >= Date.parse(state.expiresAt)) return deny('expired')

  // A licence cannot outlive the institution that granted it (Ruling 2), outlive
  // its own subject (§18.61), or survive a reclassification of what it permits
  // (§18.60). All three are DERIVED — the ledger is never touched.
  if (!external.defHashMatches) return deny('workflow_definition_drifted')
  if (!external.scopeMatches) return deny('scope_drifted')
  if (!external.decisionGoverning) {
    return deny('decision_not_governing', external.decisionReason)
  }

  return { effective: true, reason: 'active', decisionReason: null }
}

/** The level that may be used: the licensed one when effective, else L0. */
export function resolvedLevelOf(
  state: DerivedLicenseState | null,
  effective: boolean,
): AutonomyLicenseLevel {
  if (!state || !effective || state.actionKinds.length === 0) return 'L0'
  return state.licensedLevel
}
