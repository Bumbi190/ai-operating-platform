/**
 * lib/workflows/bundle/github-binding.ts — which GitHub release does THIS month
 * refer to, and when does that answer stop being changeable?
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
 * ── APPEND-ONLY IS AUDITABILITY, NOT AUTHORITY ──────────────────────────────
 * `workflow_evidence` rejects mutation by trigger, so every binding ever
 * recorded stays readable. That answers "what was claimed, and when". It does
 * NOT answer "which claim is authoritative", and taking the newest row is the
 * wrong answer to the second question: once a verification has already compared
 * production against PR #59, a later attestation naming PR #72 would silently
 * re-point every one of those recorded observations at a different release.
 * Both values remain in the log either way — the danger is which one is treated
 * as true.
 *
 * So authority is decided here, by replaying the rows in order:
 *
 *   BEFORE the identity is relied upon   a complete correction MAY replace it
 *   AFTER  the identity is relied upon   a differing identity is REFUSED
 *                                        authority and reported as CONFLICTED
 *
 * Nothing is deleted, rewritten or hidden in either case. The refused value is
 * carried in `rejected_rebind` precisely so it stays visible.
 *
 * ── ONE IDENTITY, TWO ROWS ──────────────────────────────────────────────────
 * A PR number without its expected SHA is not half an identity — it is no
 * identity. Storage needs two rows; meaning has one value. A rebind therefore
 * has to restate BOTH fields, and an incomplete one never combines with the
 * surviving half of the previous pair. That is what stops
 *
 *   bound: PR #59 + SHA A,  later: PR #72 alone   ->   PR #72 + SHA A, "BOUND"
 *
 * which reads as a healthy binding and is a fabricated pair no one attested to.
 *
 * ── WHAT "EXPECTED MERGE SHA" MEANS ─────────────────────────────────────────
 * Preserved exactly as the deployment verifier defines it: "an independent pin,
 * so the merge SHA is not self-attesting". It is what a human independently
 * expected the release to merge as, recorded so that GitHub's own answer about
 * itself can be checked against something. It is NOT derived from the trunk
 * branch, from a deployment, or from GitHub — deriving it from the thing it
 * verifies would make the check circular and worthless.
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

/**
 * The checks that CONSUME the release identity — the lock boundary.
 *
 * Each one reads the bound PR or the bound SHA and states something about the
 * release it names. The moment ANY of them has recorded evidence, that evidence
 * is a claim about one specific release, and repointing the identity would make
 * an already-recorded observation describe a different one.
 *
 * This is not a new state and not a new gate. Every key below is an existing
 * declared check of the existing definition; the boundary is the earliest of
 * them to produce evidence, which is strictly earlier than entering
 * `approval_release` and earlier still than RELEASE approval.
 *
 * Membership is explicit, never inferred from a name or a state. Three of these
 * are declared at `approval_release` and `post_release_qa` as well, and are
 * matched by key so a late re-check locks the identity just as firmly.
 */
export const RELEASE_IDENTITY_CONSUMERS: readonly string[] = [
  'github_pr_merged',
  'github_pr_checks_green',
  'github_merge_sha_matches_expected',
  'vercel_production_ready',
  'vercel_deploy_sha_matches_merge_sha',
  'production_alias_attached',
]

const CONSUMER_KEYS = new Set(RELEASE_IDENTITY_CONSUMERS)

/** A full Git object name. Abbreviations are refused: they are ambiguous. */
const FULL_SHA = /^[0-9a-f]{40}$/

export type BindingStatus = 'BOUND' | 'PARTIAL' | 'MISSING' | 'INVALID' | 'CONFLICTED'

/** An identity that was recorded but refused authority. Kept for audit. */
export interface RejectedRebind {
  pr_number: number | null
  expected_merge_sha: string | null
  recorded_at: string | null
  reason: 'AFTER_DOWNSTREAM_RELIANCE' | 'INCOMPLETE_PAIR'
}

export interface GithubBinding {
  /** Canonical target, from trusted configuration. Never from evidence or input. */
  repository: string | null
  pr_number: number | null
  expected_merge_sha: string | null
  binding_status: BindingStatus
  /** Present only when a recorded value failed validation. */
  invalid_fields: string[]
  /** When the identity became relied upon, and by which check. */
  locked_at: string | null
  locked_by: string | null
  /** The newest identity that was refused authority, or null. */
  rejected_rebind: RejectedRebind | null
  /** How many complete identities have held authority. 1 = never corrected. */
  generations: number
}

// ── Validation ───────────────────────────────────────────────────────────────

/** An exact positive integer. Never a string that coerces, never a float. */
function validPr(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null
}

function validSha(v: unknown): string | null {
  return typeof v === 'string' && FULL_SHA.test(v) ? v : null
}

// ── Ordering ─────────────────────────────────────────────────────────────────

/** Oldest first; ties broken by id so the replay order is total and stable. */
function oldestFirst(a: WorkflowEvidence, b: WorkflowEvidence): number {
  if (a.recorded_at === b.recorded_at) return a.id < b.id ? -1 : 1
  return a.recorded_at < b.recorded_at ? -1 : 1
}

function bindingRows(
  evidence: readonly WorkflowEvidence[], checkKey: string,
): WorkflowEvidence[] {
  return evidence
    .filter(e => e.check_key === checkKey && e.state === GITHUB_BINDING_STATE)
    .sort(oldestFirst)
}

/**
 * Is `at` on or after the lock instant?
 *
 * Fail-safe: an instant that cannot be parsed counts as locked. A rebind whose
 * timing cannot be established must not be granted authority on the strength of
 * an unreadable timestamp.
 */
function atOrAfter(at: string, lock: string): boolean {
  const a = Date.parse(at)
  const l = Date.parse(lock)
  if (Number.isNaN(a) || Number.isNaN(l)) return true
  return a >= l
}

// ── The replay ───────────────────────────────────────────────────────────────

interface Staged { value: number | string; at: string }

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
  // 1. The lock boundary: the earliest evidence recorded by any check that
  //    consumes the identity. Any result counts — a `fail` observation compared
  //    production against this identity just as a `pass` did.
  let locked_at: string | null = null
  let locked_by: string | null = null
  for (const e of [...evidence].sort(oldestFirst)) {
    if (CONSUMER_KEYS.has(e.check_key)) {
      locked_at = e.recorded_at
      locked_by = e.check_key
      break
    }
  }

  // 2. Validate the NEWEST recorded value of each field. A malformed
  //    replacement must not leave the previous value looking authoritative.
  const prRows = bindingRows(evidence, GITHUB_BINDING_CHECKS.prNumber)
  const shaRows = bindingRows(evidence, GITHUB_BINDING_CHECKS.expectedMergeSha)
  const invalid: string[] = []

  const newestPrRaw = prRows.length > 0 ? prRows[prRows.length - 1].detail?.value : undefined
  if (newestPrRaw !== undefined && newestPrRaw !== null && validPr(newestPrRaw) === null) {
    invalid.push(GITHUB_BINDING_CHECKS.prNumber)
  }
  const newestShaRaw = shaRows.length > 0 ? shaRows[shaRows.length - 1].detail?.value : undefined
  if (newestShaRaw !== undefined && newestShaRaw !== null && validSha(newestShaRaw) === null) {
    invalid.push(GITHUB_BINDING_CHECKS.expectedMergeSha)
  }

  // 3. Replay the well-formed rows in order, staging fields until a COMPLETE
  //    identity forms. Only a complete pair can hold authority, so a half
  //    rebind can never borrow the other half from the pair it is replacing.
  const timeline = [
    ...prRows.map(r => ({ field: 'pr' as const, at: r.recorded_at, value: validPr(r.detail?.value) })),
    ...shaRows.map(r => ({ field: 'sha' as const, at: r.recorded_at, value: validSha(r.detail?.value) })),
  ]
    .filter(r => r.value !== null)
    .sort((a, b) => (a.at === b.at ? (a.field < b.field ? -1 : 1) : a.at < b.at ? -1 : 1))

  let committed: { pr: number; sha: string } | null = null
  let generations = 0
  let conflicted = false
  let rejected: RejectedRebind | null = null
  let staged: { pr?: Staged; sha?: Staged } = {}

  for (const row of timeline) {
    staged[row.field] = { value: row.value as number | string, at: row.at }
    if (staged.pr === undefined || staged.sha === undefined) continue

    const pair = { pr: staged.pr.value as number, sha: staged.sha.value as string }
    // The identity exists from the moment its LAST field lands.
    const completedAt = staged.pr.at > staged.sha.at ? staged.pr.at : staged.sha.at
    staged = {}

    if (committed === null) {
      committed = pair
      generations = 1
      continue
    }
    if (pair.pr === committed.pr && pair.sha === committed.sha) continue // restatement

    if (locked_at !== null && atOrAfter(completedAt, locked_at)) {
      // Refused authority. Recorded, visible, and NOT applied.
      conflicted = true
      rejected = {
        pr_number: pair.pr, expected_merge_sha: pair.sha,
        recorded_at: completedAt, reason: 'AFTER_DOWNSTREAM_RELIANCE',
      }
      continue
    }
    committed = pair
    generations += 1
  }

  // 4. A half-finished rebind. Before any identity was committed this is simply
  //    an incomplete first binding (PARTIAL). After one exists it is a conflict:
  //    the operator has begun replacing the identity and has not said with what.
  const dangling = staged.pr ?? staged.sha
  if (committed !== null && dangling !== undefined) {
    conflicted = true
    rejected = {
      pr_number: staged.pr ? (staged.pr.value as number) : null,
      expected_merge_sha: staged.sha ? (staged.sha.value as string) : null,
      recorded_at: dangling.at,
      reason: 'INCOMPLETE_PAIR',
    }
  }

  // 5. Report. With an identity committed, that identity is the answer — never
  //    a later one. With none, the newest well-formed value of each field is
  //    reported so a first binding in progress still shows what it has.
  let pr_number = committed ? committed.pr : validPr(newestPrRaw)
  let expected_merge_sha = committed ? committed.sha : validSha(newestShaRaw)
  if (invalid.includes(GITHUB_BINDING_CHECKS.prNumber)) pr_number = null
  if (invalid.includes(GITHUB_BINDING_CHECKS.expectedMergeSha)) expected_merge_sha = null

  // CONFLICTED outranks everything: an identity that two attestations disagree
  // about is the one condition that must stop a release, because every recorded
  // GitHub observation silently depends on which one wins. INVALID comes next —
  // a malformed pin is worse than an absent one, since absence is obvious and a
  // bad value looks like a binding.
  let binding_status: BindingStatus
  if (conflicted) binding_status = 'CONFLICTED'
  else if (invalid.length > 0) binding_status = 'INVALID'
  else if (pr_number !== null && expected_merge_sha !== null) binding_status = 'BOUND'
  else if (pr_number !== null || expected_merge_sha !== null) binding_status = 'PARTIAL'
  else binding_status = 'MISSING'

  return {
    repository,
    pr_number,
    expected_merge_sha,
    binding_status,
    invalid_fields: invalid,
    locked_at,
    locked_by,
    rejected_rebind: rejected,
    generations,
  }
}
