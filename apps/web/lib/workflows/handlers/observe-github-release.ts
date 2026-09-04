/**
 * lib/workflows/handlers/observe-github-release.ts — the three GitHub release
 * observations, as executable READ_ONLY actions.
 *
 * ── ONE ACTION, ONE CHECK ───────────────────────────────────────────────────
 * `ANSWERS_CHECK` is strictly 1:1, and these three keep it that way. They share
 * a transport module and an installation-token cache — that is plumbing — but
 * each emits evidence for its OWN check and nothing else. Transport reuse is
 * not evidence provenance: one observation must never vouch for a question it
 * was not asked.
 *
 * ── THE IDENTITY IS THE INSTANCE'S ──────────────────────────────────────────
 * The pull request number and the expected merge SHA are read through
 * `readReleaseBinding`, which projects THIS instance's own evidence. There is
 * no environment fallback: `FAMILJE_STUNDEN_RELEASE_PR` and
 * `FAMILJE_STUNDEN_EXPECTED_MERGE_SHA` are deployment-global, and a stale
 * October pin silently answering November's question is precisely the failure
 * the instance binding exists to prevent. A binding that is missing, partial,
 * invalid or CONFLICTED yields no observation at all.
 *
 * ── NOTHING SECRET REACHES THE OUTPUT ───────────────────────────────────────
 * `safeDetail` copies only named scalar fields, so an unexpected key cannot
 * ride along. The App private key, the signed JWT and the installation token
 * exist only inside the auth module and never appear in a detail, an observed
 * string, an error or a log.
 */

import { observeGithubMergeShaMatch, observeGithubPrChecksGreen, observeGithubPrMerged }
  from '../adapters/familje-stunden/github-observation'
import type { GithubBinding } from '../bundle/github-binding'
import type {
  ReadOnlyHandler, ReadOnlyHandlerInput, ReadOnlyHandlerOutput, ReadOnlyResult,
} from './types'
import type { VerificationEvidence } from '../adapters/types'

function toResult(result: string): ReadOnlyResult {
  if (result === 'pass') return 'pass'
  if (result === 'fail') return 'fail'
  if (result === 'error') return 'error'
  return 'blocked'
}

/** Copy only the fields we name. An unexpected key cannot become output. */
function safeDetail(detail: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const k of ['pr', 'head_sha', 'merge_commit_sha', 'expected_merge_sha', 'state',
                   'outcome', 'checks', 'sources', 'reason', 'failure', 'retryable',
                   'merged', 'binding_status'] as const) {
    const v = detail[k]
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v
    }
  }
  return out
}

const toOutput = (e: VerificationEvidence): ReadOnlyHandlerOutput => ({
  result: toResult(e.result),
  checkKey: e.check_key,
  expected: e.expected,
  observed: e.observed,
  detail: safeDetail(e.detail),
  authoritativeSystem: e.authoritative_system,
})

/**
 * A usable release identity, or the reason there is none.
 *
 * Only `BOUND` proceeds. `CONFLICTED` is refused as firmly as `MISSING`: two
 * attestations naming different releases mean the observation would be about a
 * release nobody can name, and picking the newest is the behaviour the binding
 * authority rules were written to forbid.
 */
async function releaseIdentity(
  input: ReadOnlyHandlerInput,
): Promise<{ ok: true; prNumber: number; expectedMergeSha: string | null }
         | { ok: false; binding: GithubBinding | null }> {
  if (!input.readReleaseBinding) return { ok: false, binding: null }
  const binding = await input.readReleaseBinding()
  if (binding.binding_status === 'CONFLICTED' || binding.pr_number === null) {
    return { ok: false, binding }
  }
  return { ok: true, prNumber: binding.pr_number, expectedMergeSha: binding.expected_merge_sha }
}

function unbound(checkKey: string, binding: GithubBinding | null, now: string): ReadOnlyHandlerOutput {
  const status = binding?.binding_status ?? 'MISSING'
  return {
    result: 'blocked',
    checkKey,
    expected: 'the release pull request is bound to this workflow instance',
    observed: status === 'CONFLICTED'
      ? 'two attestations name different releases; the identity is not usable'
      : `no usable release identity is bound (${status})`,
    detail: { binding_status: status, retryable: false, observed_at: now },
    authoritativeSystem: null,
  }
}

const make = (
  checkKey: string,
  observe: (i: { prNumber: number; expectedMergeSha: string | null }, now: string)
    => Promise<VerificationEvidence>,
): ReadOnlyHandler => async (input) => {
  const id = await releaseIdentity(input)
  if (!id.ok) return unbound(checkKey, id.binding, input.now)
  await input.beforeAttempt?.()
  return toOutput(await observe(
    { prNumber: id.prNumber, expectedMergeSha: id.expectedMergeSha }, input.now))
}

export const observeGithubPrMergedHandler: ReadOnlyHandler =
  make('github_pr_merged', (i, now) => observeGithubPrMerged(i, now))

export const observeGithubPrChecksGreenHandler: ReadOnlyHandler =
  make('github_pr_checks_green', (i, now) => observeGithubPrChecksGreen(i, now))

export const observeGithubMergeShaMatchHandler: ReadOnlyHandler =
  make('github_merge_sha_matches_expected', (i, now) => observeGithubMergeShaMatch(i, now))
