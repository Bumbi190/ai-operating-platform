/**
 * lib/workflows/evidence-consumption.ts — when recorded evidence actually counts.
 *
 * Recording a fact and being satisfied by it are different decisions, kept apart
 * on purpose. Ingestion writes what a producer said. THIS decides whether what
 * they said still applies, and it refuses far more often than it accepts:
 *
 *   undeclared          the definition declares no such check for this state
 *   provenance_refused  attested evidence for a check Omnira observes itself
 *   unbound             no target pin where the check requires one
 *   stale               pinned to a target that has since moved
 *   failed / blocked
 *     / errored         the producer did not report a pass
 *   absent              nothing was ever recorded
 *   satisfied           the only accepting answer
 *
 * Pure and total. The caller supplies the rows and the current target hash; no
 * clock is read, so the same inputs always give the same verdict.
 */

import type { AttestableCheck, EvidenceBinding } from './attestation'
import { evidenceBinding } from './attestation'
import type { WorkflowEvidence } from './types'

export type EvidenceSatisfaction =
  | 'satisfied'
  | 'failed'
  | 'blocked'
  | 'errored'
  | 'stale'
  | 'unbound'
  | 'provenance_refused'
  | 'undeclared'
  | 'absent'

export interface CheckVerdict {
  check_key: string
  satisfaction: EvidenceSatisfaction
  /** True only for `satisfied`. The one field a caller should branch on. */
  satisfies: boolean
  binding: EvidenceBinding | null
  /** Provenance of the row the verdict came from. */
  source: WorkflowEvidence['source'] | null
  producer: string | null
  observed_at: string | null
  reason: string
}

/** Newest first — an append-only table keeps every restatement. */
function newestFirst(rows: readonly WorkflowEvidence[]): WorkflowEvidence[] {
  return [...rows].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
}

const deny = (
  check_key: string, satisfaction: EvidenceSatisfaction, reason: string,
  row?: WorkflowEvidence, binding?: EvidenceBinding,
): CheckVerdict => ({
  check_key, satisfaction, satisfies: false,
  binding: binding ?? null,
  source: row?.source ?? null,
  producer: row?.producer ?? null,
  observed_at: row?.observed_at ?? row?.recorded_at ?? null,
  reason,
})

/**
 * Does the recorded evidence satisfy one declared check?
 *
 * Only rows whose binding is CURRENT are considered. A stale row is reported as
 * stale rather than ignored, because "this was verified, but against different
 * artefacts" is a materially different thing to tell an operator than "this was
 * never verified".
 */
export function evaluateCheck(
  check: AttestableCheck | null,
  checkKey: string,
  rows: readonly WorkflowEvidence[],
  currentTargetHash: string,
): CheckVerdict {
  if (check === null) {
    return deny(checkKey, 'undeclared',
      'the pinned definition declares no such check for this state')
  }

  const relevant = newestFirst(rows.filter(r => r.check_key === checkKey))
  if (relevant.length === 0) {
    return deny(checkKey, 'absent', 'no evidence has been recorded for this check')
  }

  // Provenance is judged before anything else: a row that may not speak for this
  // check is refused whatever it says.
  const permitted = relevant.filter(r => check.allowed_provenance.includes(r.source))
  if (permitted.length === 0) {
    const got = [...new Set(relevant.map(r => r.source))].join(', ')
    return deny(checkKey, 'provenance_refused',
      `this check accepts ${check.allowed_provenance.join(' or ')} evidence; found ${got}`,
      relevant[0])
  }

  const current = permitted.find(r => evidenceBinding(r.target_hash, currentTargetHash) === 'current')
  if (!current) {
    const newest = permitted[0]
    const binding = evidenceBinding(newest.target_hash, currentTargetHash)
    return binding === 'unbound'
      ? deny(checkKey, 'unbound',
          'evidence carries no target pin, so it cannot be shown to be about this target',
          newest, binding)
      : deny(checkKey, 'stale',
          'evidence was produced against a different target — the definition, state or artefacts have changed since',
          newest, binding)
  }

  const verdict = (satisfaction: EvidenceSatisfaction, reason: string): CheckVerdict => ({
    check_key: checkKey, satisfaction, satisfies: satisfaction === 'satisfied',
    binding: 'current', source: current.source, producer: current.producer ?? null,
    observed_at: current.observed_at ?? current.recorded_at, reason,
  })

  switch (current.result) {
    case 'pass':    return verdict('satisfied', `reported pass by ${current.producer ?? current.source}`)
    case 'fail':    return verdict('failed', 'the producer reported a failure')
    case 'blocked': return verdict('blocked', 'the check could not be produced')
    case 'error':   return verdict('errored', 'the check produced an unusable result')
    // Pre-PR5 vocabulary. Never satisfying — it means the check did not run.
    default:        return verdict('blocked', `evidence result "${current.result}" does not satisfy a check`)
  }
}

export interface StateEvidenceSummary {
  verdicts: CheckVerdict[]
  /** Checks that positively passed against the current target. */
  satisfied: string[]
  /** Checks reporting a real negative finding — these must block. */
  failing: string[]
  /** Everything else that is not satisfied, with its reason class. */
  outstanding: string[]
  /** True when at least one declared check reported a failure. */
  hasFailure: boolean
  /** True when every declared check for the state is satisfied. */
  allSatisfied: boolean
}

/**
 * Summarise every check a state declares.
 *
 * A state with no declared checks reports `allSatisfied: false` and no failures:
 * nothing was required, and nothing was proven. That is deliberately not the same
 * as "verified" — absence of a requirement is not evidence.
 */
export function summarizeStateEvidence(
  checks: readonly AttestableCheck[],
  state: string,
  rows: readonly WorkflowEvidence[],
  targetHashFor: (checkKey: string) => string,
): StateEvidenceSummary {
  const declared = checks.filter(c => c.state === state)
  const verdicts = declared.map(c =>
    evaluateCheck(c, c.check_key, rows, targetHashFor(c.check_key)))

  const satisfied = verdicts.filter(v => v.satisfies).map(v => v.check_key)
  const failing = verdicts.filter(v => v.satisfaction === 'failed').map(v => v.check_key)
  const outstanding = verdicts
    .filter(v => !v.satisfies && v.satisfaction !== 'failed')
    .map(v => `${v.check_key}:${v.satisfaction}`)

  return {
    verdicts, satisfied, failing, outstanding,
    hasFailure: failing.length > 0,
    allSatisfied: declared.length > 0 && satisfied.length === declared.length,
  }
}
