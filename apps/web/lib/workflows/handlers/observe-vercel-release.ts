/**
 * lib/workflows/handlers/observe-vercel-release.ts — the three Vercel release
 * observations, as executable READ_ONLY actions.
 *
 * ── TWO AUTHORITIES, ONE CHAIN ──────────────────────────────────────────────
 * The release identity is the instance's bound PR number; the SHA that binds
 * the DEPLOYMENT is that pull request's ACTUAL merge commit, read from GitHub.
 * So each of these reads GitHub for the merge SHA and then Vercel for the
 * deployment — two authorities, neither inferred from the other.
 *
 * The instance's attested pin is deliberately NOT used here. It is a separate
 * GitHub invariant (`github_merge_sha_matches_expected`), and substituting it
 * would collapse two independent links into one: a wrong merge would then look
 * like a wrong deployment, and neither could be told apart.
 *
 * ── ONE ACTION, ONE CHECK ───────────────────────────────────────────────────
 * They share a transport module. Each emits evidence for its own check and
 * nothing else — transport reuse is not evidence provenance.
 */

import { readPullRequest } from '../adapters/familje-stunden/github-observation'
import {
  observeVercelDeployShaMatch, observeVercelProductionAlias, observeVercelProductionReady,
  type ReleaseDeploymentInput,
} from '../adapters/familje-stunden/vercel-observation'
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
  for (const k of ['pr', 'deployment_id', 'ready_state', 'ready_substate', 'target',
                   'deployed_sha', 'merge_sha', 'canonical_domain', 'alias_assigned',
                   'alias_count', 'reason', 'failure', 'retryable', 'attempt',
                   'max_attempts', 'binding_status'] as const) {
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
  observe: (i: ReleaseDeploymentInput, now: string) => Promise<VerificationEvidence>,
): ReadOnlyHandler => async (input: ReadOnlyHandlerInput) => {
  // 1. The instance's own binding. No environment fallback exists.
  if (!input.readReleaseBinding) return unbound(checkKey, null, input.now)
  const binding = await input.readReleaseBinding()
  if (binding.binding_status === 'CONFLICTED' || binding.pr_number === null) {
    return unbound(checkKey, binding, input.now)
  }

  // 2. GitHub for the ACTUAL merge SHA. A null here is reported by the
  //    observation itself, so an unmerged release reads as a finding about the
  //    deployment rather than as a transport failure.
  await input.beforeAttempt?.()
  const pr = await readPullRequest(binding.pr_number)
  const mergeSha = pr.ok ? pr.value.mergeCommitSha : null

  // 3. Vercel for the deployment of exactly that commit.
  await input.beforeAttempt?.()
  return toOutput(await observe(
    { mergeSha, prNumber: binding.pr_number }, input.now))
}

export const observeVercelProductionReadyHandler: ReadOnlyHandler =
  make('vercel_production_ready', (i, now) => observeVercelProductionReady(i, now))

export const observeVercelDeployShaMatchHandler: ReadOnlyHandler =
  make('vercel_deploy_sha_matches_merge_sha', (i, now) => observeVercelDeployShaMatch(i, now))

export const observeVercelProductionAliasHandler: ReadOnlyHandler =
  make('production_alias_attached', (i, now) => observeVercelProductionAlias(i, now))
