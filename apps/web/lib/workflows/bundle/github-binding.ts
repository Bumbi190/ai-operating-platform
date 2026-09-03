/**
 * lib/workflows/bundle/github-binding.ts — which GitHub release does THIS month
 * refer to?
 *
 * ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────
 * The three GitHub checks compare production against an expectation. Today that
 * expectation lives in `FAMILJE_STUNDEN_RELEASE_PR` and
 * `FAMILJE_STUNDEN_EXPECTED_MERGE_SHA` — deployment-global environment values,
 * one pair for every month that will ever run. October's PR number would still
 * be sitting there in November.
 *
 * A release identity belongs to ONE workflow instance. So it is read from
 * evidence recorded against that instance, and from nowhere else.
 *
 * ── WHY THE ENV VARS ARE NOT A FALLBACK ─────────────────────────────────────
 * A missing binding must stay missing. Falling back to a global value would let
 * a stale October pin silently satisfy a November comparison — the check would
 * report PASS having compared the wrong release. This module therefore reads
 * `process.env` nowhere, and a test asserts the absence.
 *
 * ── WHAT "EXPECTED MERGE SHA" MEANS ─────────────────────────────────────────
 * Preserved exactly as the deployment verifier defines it: "an independent pin,
 * so the merge SHA is not self-attesting". It is what a human independently
 * expected the release to merge as, recorded so that GitHub's own answer about
 * itself can be checked against something. It is NOT derived from latest main,
 * from a deployment, or from GitHub — deriving it from the thing it verifies
 * would make the check circular and worthless.
 *
 * ── AND IT PROVES NOTHING ───────────────────────────────────────────────────
 * Binding says which release to look at. It never says the PR merged, the checks
 * were green, or the SHAs agreed. All three GitHub checks stay unanswered until
 * an executable observation exists.
 */

import type { WorkflowEvidence } from '../types'

/** The state whose declared output is the merge SHA. */
export const GITHUB_BINDING_STATE = 'frontend_deploy'

export const GITHUB_BINDING_CHECKS = {
  prNumber: 'github_release_pr_number',
  expectedMergeSha: 'github_expected_merge_sha',
} as const

/** A full Git object name. Abbreviations are refused: they are ambiguous. */
const FULL_SHA = /^[0-9a-f]{40}$/

export type BindingStatus = 'BOUND' | 'PARTIAL' | 'MISSING' | 'INVALID'

export interface GithubBinding {
  /** Canonical target, from trusted configuration. Never from evidence or input. */
  repository: string | null
  pr_number: number | null
  expected_merge_sha: string | null
  binding_status: BindingStatus
  /** Present only when a recorded value failed validation. */
  invalid_fields: string[]
}

/** Newest first; ties broken by id so the ordering is total. */
function newestFirst(a: WorkflowEvidence, b: WorkflowEvidence): number {
  if (a.recorded_at === b.recorded_at) return a.id < b.id ? 1 : -1
  return a.recorded_at < b.recorded_at ? 1 : -1
}

/**
 * The newest recorded value for one binding key.
 *
 * `workflow_evidence` is append-only — a trigger rejects UPDATE — so a rebinding
 * adds a row rather than overwriting one, and the whole history stays auditable.
 * Newest wins, and every earlier value remains visible to an auditor.
 */
function newestValue(
  evidence: readonly WorkflowEvidence[], checkKey: string,
): unknown {
  const rows = evidence
    .filter(e => e.check_key === checkKey && e.state === GITHUB_BINDING_STATE)
    .sort(newestFirst)
  return rows[0]?.detail?.value
}

/**
 * Project the binding for one instance from ITS OWN evidence.
 *
 * The caller passes evidence already scoped to a single instance, which is what
 * makes cross-instance leakage impossible here: this function has no query, no
 * client and no way to see another month's rows.
 */
export function projectGithubBinding(
  evidence: readonly WorkflowEvidence[],
  repository: string | null,
): GithubBinding {
  const invalid: string[] = []

  const rawPr = newestValue(evidence, GITHUB_BINDING_CHECKS.prNumber)
  let prNumber: number | null = null
  if (rawPr !== undefined && rawPr !== null) {
    // An exact positive integer. Never "the latest PR", never a string that
    // happens to coerce, never a float.
    prNumber = typeof rawPr === 'number' && Number.isInteger(rawPr) && rawPr > 0 ? rawPr : null
    if (prNumber === null) invalid.push(GITHUB_BINDING_CHECKS.prNumber)
  }

  const rawSha = newestValue(evidence, GITHUB_BINDING_CHECKS.expectedMergeSha)
  let sha: string | null = null
  if (rawSha !== undefined && rawSha !== null) {
    sha = typeof rawSha === 'string' && FULL_SHA.test(rawSha) ? rawSha : null
    if (sha === null) invalid.push(GITHUB_BINDING_CHECKS.expectedMergeSha)
  }

  // INVALID outranks everything: a malformed pin is worse than an absent one,
  // because absence is obvious and a bad value looks like a binding.
  let binding_status: BindingStatus
  if (invalid.length > 0) binding_status = 'INVALID'
  else if (prNumber !== null && sha !== null) binding_status = 'BOUND'
  else if (prNumber !== null || sha !== null) binding_status = 'PARTIAL'
  else binding_status = 'MISSING'

  return {
    repository,
    pr_number: prNumber,
    expected_merge_sha: sha,
    binding_status,
    invalid_fields: invalid,
  }
}
