/**
 * lib/workflows/bundle/manifest-binding.ts — which shared manifest is THIS
 * release generation supposed to be running?
 *
 * ── TWO DEFECTS, NOT ONE ────────────────────────────────────────────────────
 * The first was the obvious one: the expectation came from
 * `FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256`, a deployment-global value, so
 * October's manifest would still answer in November.
 *
 * The second only appears once you look at the state order:
 *
 *     10. edge_deploy      ← the manifest expectation is attested here
 *     11. frontend_deploy  ← every release-identity consumer lives here
 *
 * The release identity does not lock until a `frontend_deploy` check consumes
 * it, which is AFTER the manifest is attested. So binding the manifest to the
 * instance is necessary and not sufficient: one instance legitimately holds
 * more than one release generation before that lock, and a manifest attested
 * for PR 59 would sit there, reported BOUND, after the release was legitimately
 * corrected to PR 72. The gate would say YES about a release that no longer
 * exists — which is the KFM failure class this whole check exists to catch.
 *
 * ── ONE INSEPARABLE ATTESTATION ─────────────────────────────────────────────
 * The manifest hash and the release generation it was computed for are recorded
 * as ONE value in ONE evidence row. There is no arrangement of rows that can
 * pair a hash from one generation with an identity from another, because the
 * fields never travel separately.
 *
 * ── THE LOCK IS PER GENERATION, NOT PER INSTANCE ────────────────────────────
 * Consuming evidence for generation A locks A's hash and nothing else. A
 * legitimate pre-lock correction to B therefore does NOT brick the instance: a
 * fresh attestation for B is a new generation, not a mutation of A, and A stays
 * in the history exactly as recorded. What is forbidden is changing A's hash
 * once A has been verified against.
 */

import type { WorkflowEvidence } from '../types'

/** The state where the expectation is attested. */
export const MANIFEST_BINDING_STATE = 'edge_deploy'

export const MANIFEST_BINDING_CHECKS = {
  expectedSha: 'expected_manifest_sha256',
} as const

/**
 * The checks whose evidence LOCKS a manifest generation.
 *
 * Exactly one, and that is a finding rather than an omission: of the four
 * deployed-source checks, only `deployed_manifest_matches_expected` reads the
 * expected hash. `shared_manifest_consumers_in_sync` compares consumers against
 * each other; the two `*_source_current` checks read status, version and
 * verify_jwt. Locking on those would refuse a legitimate correction on the
 * strength of evidence that never used the value.
 */
export const MANIFEST_IDENTITY_CONSUMERS: readonly string[] = [
  'deployed_manifest_matches_expected',
]

const CONSUMER_KEYS = new Set(MANIFEST_IDENTITY_CONSUMERS)

/** A full SHA-256 digest. 64 hex characters; abbreviations are ambiguous. */
const SHA256_HEX = /^[0-9a-f]{64}$/
/** A full Git object name. */
const FULL_SHA = /^[0-9a-f]{40}$/

export type ManifestBindingStatus = 'BOUND' | 'MISSING' | 'INVALID' | 'CONFLICTED'

/**
 * The release the expectation belongs to.
 *
 * The same pair `github-binding.ts` treats as one logical release identity. No
 * separate counter is invented: the pair already IS the generation, and a
 * counter would be a second identity to keep in step with the first.
 */
export interface ReleaseGeneration {
  pr_number: number
  expected_merge_sha: string
}

export const sameGeneration = (
  a: ReleaseGeneration | null, b: ReleaseGeneration | null,
): boolean =>
  a !== null && b !== null
  && a.pr_number === b.pr_number
  && a.expected_merge_sha === b.expected_merge_sha

/** An expectation that was recorded but refused authority. Kept for audit. */
export interface RejectedManifestRebind {
  expected_manifest_sha256: string | null
  release: ReleaseGeneration | null
  recorded_at: string | null
  reason: 'AFTER_DOWNSTREAM_RELIANCE' | 'RELEASE_GENERATION_CHANGED'
}

export interface ManifestBinding {
  expected_manifest_sha256: string | null
  /** The release generation the authoritative expectation was attested for. */
  release: ReleaseGeneration | null
  binding_status: ManifestBindingStatus
  invalid_fields: string[]
  /** When this generation's expectation became relied upon, and by which check. */
  locked_at: string | null
  locked_by: string | null
  rejected_rebind: RejectedManifestRebind | null
  /** Complete attestations recorded for the CURRENT generation. 1 = never corrected. */
  generations: number
}

/**
 * One complete attestation, or null.
 *
 * All three fields or nothing. A row missing any of them names no generation
 * and can hold no authority — which is what makes cross-generation mixing
 * structurally impossible rather than merely guarded against.
 */
function parseAttestation(
  v: unknown,
): { sha: string; release: ReleaseGeneration } | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>

  // Normalize before validating. A digest is case-insensitive as a value, so a
  // re-attestation in another case must not read as a different expectation and
  // block a release over nothing but letter case.
  const sha = typeof o.expected_manifest_sha256 === 'string'
    ? o.expected_manifest_sha256.trim().toLowerCase() : null
  const mergeSha = typeof o.expected_merge_sha === 'string'
    ? o.expected_merge_sha.trim().toLowerCase() : null
  const pr = o.release_pr_number

  if (sha === null || !SHA256_HEX.test(sha)) return null
  if (mergeSha === null || !FULL_SHA.test(mergeSha)) return null
  if (typeof pr !== 'number' || !Number.isInteger(pr) || pr <= 0) return null

  return { sha, release: { pr_number: pr, expected_merge_sha: mergeSha } }
}

const oldestFirst = (a: WorkflowEvidence, b: WorkflowEvidence): number => {
  if (a.recorded_at === b.recorded_at) return a.id < b.id ? -1 : 1
  return a.recorded_at < b.recorded_at ? -1 : 1
}

const atOrAfter = (a: string, b: string): boolean => a >= b

/** The generation a consuming evidence row actually verified, if it said. */
function consumedGeneration(e: WorkflowEvidence): ReleaseGeneration | null {
  const d = e.detail as Record<string, unknown> | null | undefined
  if (!d) return null
  const pr = d.release_pr_number
  const sha = typeof d.release_merge_sha === 'string'
    ? d.release_merge_sha.trim().toLowerCase() : null
  if (typeof pr !== 'number' || !Number.isInteger(pr) || pr <= 0) return null
  if (sha === null || !FULL_SHA.test(sha)) return null
  return { pr_number: pr, expected_merge_sha: sha }
}

export interface ManifestBindingInput {
  evidence: readonly WorkflowEvidence[]
  /**
   * The instance's CURRENT authoritative release generation, from the GitHub
   * binding. Null when the release identity is missing, invalid or conflicted —
   * in which case no manifest expectation can be authoritative either, because
   * there is no release for it to belong to.
   */
  release: ReleaseGeneration | null
}

/**
 * Project the expectation for the CURRENT release generation.
 *
 * Reads instance evidence and the already-projected release identity. Touches
 * no environment, no network and no filesystem — a module that could reach the
 * Management API could supply its own expectation and turn
 * `deployed_manifest_matches_expected` into production equalling itself.
 */
export function projectManifestBinding(input: ManifestBindingInput): ManifestBinding {
  const { evidence, release } = input

  const rows = [...evidence]
    .filter(e => e.check_key === MANIFEST_BINDING_CHECKS.expectedSha
              && e.state === MANIFEST_BINDING_STATE)
    .sort(oldestFirst)

  // 1. Every well-formed attestation, in order.
  const parsed = rows
    .map(r => ({ at: r.recorded_at, a: parseAttestation(r.detail?.value) }))
  const malformedNewest = parsed.length > 0 && parsed[parsed.length - 1].a === null
  const invalid_fields = malformedNewest ? [MANIFEST_BINDING_CHECKS.expectedSha] : []

  // 2. The lock is PER GENERATION: consuming evidence locks only the generation
  //    it actually verified. A's consumption must not freeze B.
  const lockFor = (g: ReleaseGeneration): { at: string; by: string } | null => {
    for (const e of [...evidence].sort(oldestFirst)) {
      if (!CONSUMER_KEYS.has(e.check_key)) continue
      if (sameGeneration(consumedGeneration(e), g)) {
        return { at: e.recorded_at, by: e.check_key }
      }
    }
    return null
  }

  // 3. Only attestations for the CURRENT generation can hold authority. One
  //    attested for another release is history, never a fallback.
  const mine = parsed.filter(p => p.a !== null && sameGeneration(p.a.release, release))
  const foreign = parsed.filter(p => p.a !== null && !sameGeneration(p.a.release, release))

  const lock = release ? lockFor(release) : null
  let committed: string | null = null
  let generations = 0
  let conflicted = false
  let rejected: RejectedManifestRebind | null = null

  for (const p of mine) {
    const value = p.a!.sha
    if (committed === null) { committed = value; generations = 1; continue }
    if (value === committed) continue                       // idempotent restatement

    if (lock !== null && atOrAfter(p.at, lock.at)) {
      // Same generation, already verified against. Refused, recorded, visible.
      conflicted = true
      rejected = {
        expected_manifest_sha256: value, release,
        recorded_at: p.at, reason: 'AFTER_DOWNSTREAM_RELIANCE',
      }
      continue
    }
    committed = value
    generations += 1
  }

  // 4. An expectation exists, but for a release this instance has moved past.
  //    Not MISSING — someone did attest one — and not usable. CONFLICTED, with
  //    the superseded pairing named so the operator knows a re-attestation for
  //    the current generation is what is wanted.
  if (committed === null && foreign.length > 0) {
    const newest = foreign[foreign.length - 1]
    conflicted = true
    rejected = {
      expected_manifest_sha256: newest.a!.sha,
      release: newest.a!.release,
      recorded_at: newest.at,
      reason: 'RELEASE_GENERATION_CHANGED',
    }
  }

  let binding_status: ManifestBindingStatus
  if (conflicted) binding_status = 'CONFLICTED'
  else if (invalid_fields.length > 0) binding_status = 'INVALID'
  else if (committed !== null) binding_status = 'BOUND'
  else binding_status = 'MISSING'

  return {
    expected_manifest_sha256: committed,
    release: committed !== null ? release : null,
    binding_status,
    invalid_fields,
    locked_at: lock?.at ?? null,
    locked_by: lock?.by ?? null,
    rejected_rebind: rejected,
    generations,
  }
}

/**
 * Does a recorded verification apply to the CURRENT release generation?
 *
 * A PASS that compared production against generation A's manifest says nothing
 * about generation B, however green it looks in the ledger. Consumers of
 * `deployed_manifest_matches_expected` evidence must ask this before treating
 * it as satisfied — especially at `approval_release`, which runs after the
 * release identity has finally settled.
 */
export function evidenceMatchesGeneration(
  e: WorkflowEvidence, release: ReleaseGeneration | null,
): boolean {
  return sameGeneration(consumedGeneration(e), release)
}
