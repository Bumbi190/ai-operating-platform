/**
 * lib/workflows/bundle/manifest-binding.ts — which shared manifest is THIS
 * month's release supposed to be running?
 *
 * ── THE DEFECT THIS REPLACES ────────────────────────────────────────────────
 * `deployed_manifest_matches_expected` read its expectation from
 * `FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256` — a deployment-global environment
 * value, one hash for every month that will ever run. October's expected
 * manifest would still be sitting there in November, and the check would report
 * a confident PASS having compared production against the wrong release.
 *
 * This is the third time the same class of defect has been removed, after
 * `FAMILJE_STUNDEN_RELEASE_PR` and `FAMILJE_STUNDEN_EXPECTED_MERGE_SHA`. An
 * expectation belongs to ONE workflow instance, so it is read from evidence
 * recorded against that instance, and from nowhere else.
 *
 * ── WHERE THE EXPECTATION MAY COME FROM ─────────────────────────────────────
 * A human, attesting the sha256 of the canonical `_utils/protectedManifest.ts`
 * at the approved release commit — before any deployed-source verification runs.
 *
 * It may NOT come from the deployed function, the Management API, a runtime
 * self-report, or "whatever the repository says at verification time". Every one
 * of those derives the expectation from the thing being checked, which turns
 * `deployed_manifest_matches_expected` into a statement that production equals
 * itself. The check exists precisely because a merged shared file is not a
 * deployed shared file.
 *
 * ── WHY THIS SLICE CHANGES NO CHECK ─────────────────────────────────────────
 * The deployed-source checks stay unreachable: Supabase offers no credential
 * that is both project-scoped and read-only, so nothing here makes them
 * executable. Fixing the expectation first means that when a safe credential
 * one day exists, the value it compares against is already sound.
 */

import type { WorkflowEvidence } from '../types'

/** The state whose checks consume the expectation. */
export const MANIFEST_BINDING_STATE = 'edge_deploy'

export const MANIFEST_BINDING_CHECKS = {
  expectedSha: 'expected_manifest_sha256',
} as const

/**
 * The checks whose evidence LOCKS the expectation.
 *
 * Exactly one, and that is a finding rather than an omission: of the four
 * deployed-source checks, only `deployed_manifest_matches_expected` reads the
 * expected hash. `shared_manifest_consumers_in_sync` compares consumers against
 * each other and needs no expectation at all; the two `*_source_current` checks
 * read status, version and verify_jwt. Locking on those would refuse a
 * legitimate correction on the strength of evidence that never depended on it.
 *
 * Membership is explicit and may be widened deliberately — never inferred from
 * a state, a name, or the fact that the checks happen to run together.
 */
export const MANIFEST_IDENTITY_CONSUMERS: readonly string[] = [
  'deployed_manifest_matches_expected',
]

const CONSUMER_KEYS = new Set(MANIFEST_IDENTITY_CONSUMERS)

/** A full SHA-256 digest. 64 hex characters; abbreviations are ambiguous. */
const SHA256_HEX = /^[0-9a-f]{64}$/

export type ManifestBindingStatus = 'BOUND' | 'MISSING' | 'INVALID' | 'CONFLICTED'

/** An expectation that was recorded but refused authority. Kept for audit. */
export interface RejectedManifestRebind {
  expected_manifest_sha256: string | null
  recorded_at: string | null
  reason: 'AFTER_DOWNSTREAM_RELIANCE'
}

export interface ManifestBinding {
  expected_manifest_sha256: string | null
  binding_status: ManifestBindingStatus
  /** Present only when a recorded value failed validation. */
  invalid_fields: string[]
  /** When the expectation became relied upon, and by which check. */
  locked_at: string | null
  locked_by: string | null
  /** The newest expectation that was refused authority, or null. */
  rejected_rebind: RejectedManifestRebind | null
  /** How many expectations have held authority. 1 = never corrected. */
  generations: number
}

/**
 * Normalize before validating.
 *
 * A digest is case-insensitive as a value, so `ABC…` and `abc…` name the same
 * manifest. Comparing them as raw strings would make a re-attestation in the
 * other case look like a DIFFERENT expectation — and after the lock that reads
 * as a conflict, blocking a release over nothing but letter case. Normalizing
 * first makes the identity deterministic: one manifest, one value, whatever a
 * tool happened to print.
 */
function validSha(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const normalized = v.trim().toLowerCase()
  return SHA256_HEX.test(normalized) ? normalized : null
}

const oldestFirst = (a: WorkflowEvidence, b: WorkflowEvidence): number => {
  if (a.recorded_at === b.recorded_at) return a.id < b.id ? -1 : 1
  return a.recorded_at < b.recorded_at ? -1 : 1
}

/** Rows for one binding key, oldest first. Append-only, so this is a history. */
function bindingRows(
  evidence: readonly WorkflowEvidence[], checkKey: string,
): WorkflowEvidence[] {
  return evidence
    .filter(e => e.check_key === checkKey && e.state === MANIFEST_BINDING_STATE)
    .sort(oldestFirst)
}

const atOrAfter = (a: string, b: string): boolean => a >= b

/**
 * Project the expectation for one instance from ITS OWN evidence.
 *
 * The caller passes evidence already scoped to a single instance, which is what
 * makes cross-instance leakage impossible here: this function has no query, no
 * client, and no way to see another month's rows. It reads `process.env`
 * nowhere, so the deployment-global value cannot answer for anybody.
 *
 * ── NO `PARTIAL` STATE ──────────────────────────────────────────────────────
 * The identity is a single field. There is no half of it to record, so the
 * incomplete-pair condition the GitHub binding must handle cannot arise, and a
 * state that can never occur is not carried.
 */
export function projectManifestBinding(
  evidence: readonly WorkflowEvidence[],
): ManifestBinding {
  // 1. The lock boundary: the earliest evidence recorded by a check that
  //    consumes the expectation. Any result counts — a `fail` compared
  //    production against this expectation just as a `pass` did. Rendering the
  //    bundle is not evidence and never appears here.
  let locked_at: string | null = null
  let locked_by: string | null = null
  for (const e of [...evidence].sort(oldestFirst)) {
    if (CONSUMER_KEYS.has(e.check_key)) {
      locked_at = e.recorded_at
      locked_by = e.check_key
      break
    }
  }

  const rows = bindingRows(evidence, MANIFEST_BINDING_CHECKS.expectedSha)
  const invalid: string[] = []

  // 2. Validate the NEWEST recorded value. A malformed replacement must not
  //    leave the previous value looking authoritative.
  const newestRaw = rows.length > 0 ? rows[rows.length - 1].detail?.value : undefined
  if (newestRaw !== undefined && newestRaw !== null && validSha(newestRaw) === null) {
    invalid.push(MANIFEST_BINDING_CHECKS.expectedSha)
  }

  // 3. Replay the well-formed rows in order. Before the lock a correction
  //    replaces the expectation; after it, a different value is refused.
  let committed: string | null = null
  let generations = 0
  let conflicted = false
  let rejected: RejectedManifestRebind | null = null

  for (const row of rows) {
    const value = validSha(row.detail?.value)
    if (value === null) continue          // malformed rows never hold authority

    if (committed === null) {
      committed = value
      generations = 1
      continue
    }
    if (value === committed) continue     // a restatement is not a generation

    if (locked_at !== null && atOrAfter(row.recorded_at, locked_at)) {
      // Refused authority. Recorded, visible, and NOT applied.
      conflicted = true
      rejected = {
        expected_manifest_sha256: value,
        recorded_at: row.recorded_at,
        reason: 'AFTER_DOWNSTREAM_RELIANCE',
      }
      continue
    }
    committed = value
    generations += 1
  }

  // 4. With an expectation committed, that expectation is the answer — never a
  //    later one. CONFLICTED outranks INVALID: an expectation two attestations
  //    disagree about must stop a release, because the recorded comparison
  //    silently depends on which one wins.
  let expected = committed
  if (invalid.length > 0) expected = committed ?? null

  let binding_status: ManifestBindingStatus
  if (conflicted) binding_status = 'CONFLICTED'
  else if (invalid.length > 0) binding_status = 'INVALID'
  else if (expected !== null) binding_status = 'BOUND'
  else binding_status = 'MISSING'

  return {
    expected_manifest_sha256: binding_status === 'INVALID' && committed === null ? null : expected,
    binding_status,
    invalid_fields: invalid,
    locked_at,
    locked_by,
    rejected_rebind: rejected,
    generations,
  }
}
