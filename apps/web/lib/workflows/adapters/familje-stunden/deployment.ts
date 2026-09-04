/**
 * Read-only GitHub + Vercel verification of the release deployment chain.
 *
 * ── THE CHAIN, AND WHY NO LINK MAY BE INFERRED FROM ANOTHER ─────────────────
 *
 *   branch → pull request → merge SHA → production deployment → deployed SHA
 *
 * The runbook's requirement is exact: after merge, verify that Vercel's
 * production deployment is READY *and* that its `githubCommitSha` is exactly the
 * merge SHA. A green PR is not a merge; a merge is not a deployment; a READY
 * deployment is not a deployment OF THE THING THAT WAS APPROVED. The failure
 * this guards against is a production build that is green on the wrong commit —
 * which looks completely healthy from the outside.
 *
 * The site returning HTTP 200 proves nothing at all and is never consulted.
 * Only Vercel's own authoritative git metadata decides.
 *
 * ── EVENTUAL CONSISTENCY vs SEMANTIC MISMATCH ───────────────────────────────
 * GitHub and Vercel are eventually consistent, so "checks pending", "still
 * BUILDING" and "deployment not indexed yet" are BLOCKED and worth retrying
 * inside a budget. A READY deployment on the wrong SHA is not a timing問題 — it
 * is a finding, reported immediately and never retried. So is an ERROR
 * deployment, and so is a 401/403, which must never become a retry storm.
 *
 * ── NO WRITE PATH EXISTS ────────────────────────────────────────────────────
 * Merge, close, push, tag, release, workflow dispatch, deployment creation,
 * promotion, alias mutation, rollback and env mutation are absent from this
 * module — not guarded, absent. Both clients issue GET only.
 */

import 'server-only'

import { notPass, pass, type VerificationEvidence, type VerificationFailureKind } from '../types'
import { FAMILJE_STUNDEN_SYSTEM } from './index'
import {
  observeGithubMergeShaMatch, observeGithubPrChecksGreen, observeGithubPrMerged,
  readPullRequest,
} from './github-observation'
import {
  observeVercelDeployShaMatch, observeVercelProductionAlias, observeVercelProductionReady,
} from './vercel-observation'


const GITHUB_API = 'https://api.github.com'
const VERCEL_API = 'https://api.vercel.com'
const REQUEST_TIMEOUT_MS = 12_000

const GITHUB_SYSTEM = 'github'
const VERCEL_SYSTEM = 'vercel'

/**
 * Configuration.
 *
 * GITHUB: the Familje-Stunden repository is PRIVATE — an unauthenticated read
 * returns 404 — so a credential is required and the public API is not an option.
 * GitHub does, however, offer a genuinely least-privilege one: a FINE-GRAINED
 * personal access token scoped to this single repository with read-only
 * permissions (Metadata, Contents, Pull requests, Checks, Commit statuses). That
 * is materially different from the Supabase Management PAT of PR7, and it is
 * what should be created here — nothing broader.
 *
 * VERCEL: tokens are ACCOUNT/TEAM scoped with full API access. Vercel offers no
 * read-only scope, so a token that can read deployment metadata can also create
 * deployments, mutate aliases and env, and delete projects. Same class of risk
 * as PR7's Supabase token, and the same conclusion: not provisioned here.
 */
function config() {
  return {
    repo: process.env.FAMILJE_STUNDEN_GITHUB_REPO || null,     // "owner/name"
  }
}

// ── Transport ────────────────────────────────────────────────────────────────

export type ReadFailure =
  | 'credential_missing' | 'network_timeout' | 'service_unavailable'
  | 'unauthorized' | 'not_found' | 'unexpected_status' | 'malformed_response'

/** Which failures are worth another attempt. A credential problem never is. */
export function isRetryableReadFailure(f: ReadFailure): boolean {
  return f === 'network_timeout' || f === 'service_unavailable'
}

const FAILURE_KIND: Record<ReadFailure, VerificationFailureKind> = {
  credential_missing: 'credential_missing',
  network_timeout: 'network_timeout',
  service_unavailable: 'service_unavailable',
  // An authority that refuses us is not evidence about the release.
  unauthorized: 'credential_missing',
  not_found: 'unexpected_status',
  unexpected_status: 'unexpected_status',
  malformed_response: 'malformed_response',
}

type Read<T> = { ok: true; value: T } | { ok: false; failure: ReadFailure; detail: string }

/** GET with a hard timeout. Never throws, never mutates. */
async function getJson<T>(
  url: string, headers: Record<string, string>, fetchImpl: typeof fetch,
): Promise<Read<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal, cache: 'no-store' })
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return { ok: false, failure: aborted ? 'network_timeout' : 'service_unavailable',
      detail: aborted ? `no response within ${REQUEST_TIMEOUT_MS}ms` : 'could not reach the API' }
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, failure: 'unauthorized', detail: `HTTP ${res.status} — credential refused` }
  }
  if (res.status === 404) return { ok: false, failure: 'not_found', detail: 'HTTP 404' }
  if (res.status >= 500) return { ok: false, failure: 'service_unavailable', detail: `HTTP ${res.status}` }
  if (!res.ok) return { ok: false, failure: 'unexpected_status', detail: `HTTP ${res.status}` }

  try {
    return { ok: true, value: (await res.json()) as T }
  } catch {
    return { ok: false, failure: 'malformed_response', detail: 'response body was not JSON' }
  }
}

// ── GitHub ───────────────────────────────────────────────────────────────────

// ── GitHub ───────────────────────────────────────────────────────────────────
//
// This module no longer talks to GitHub. Authentication, pagination, producer
// binding and the three release observations live in ./github-observation,
// which reads as the GitHub App — the only credential type GitHub grants the
// `Checks` permission to. A personal access token is deliberately absent: the
// fine-grained kind cannot hold `Checks` at all, and the classic kind is
// account-wide with write access to every repository.

// ── Vercel ───────────────────────────────────────────────────────────────────
//
// This module no longer talks to Vercel either. The GET-only transport, the
// exact sha= binding and the three observations live in ./vercel-observation.
// The predecessor here searched the newest twenty production deployments
// client-side and read `alias` from that listing — a window that false-fails
// once a twenty-first lands, and a field the listing does not populate at all.

// ── Checks ───────────────────────────────────────────────────────────────────

function blocked(
  key: string, failure: ReadFailure, expected: string, detail: string,
  system: string, now: string,
): VerificationEvidence {
  return notPass(key, FAILURE_KIND[failure], {
    expected, observed: detail, authoritative_system: system, observed_at: now,
    detail: { failure, retryable: isRetryableReadFailure(failure) },
  })
}

export interface DeploymentChainInput {
  prNumber: number
  /**
   * The independently attested pin, from the INSTANCE binding.
   *
   * Deliberately a parameter and not an environment read: a deployment-global
   * value would let one month's pin answer another month's question, which is
   * exactly what the instance binding exists to prevent.
   */
  expectedMergeSha?: string | null
  /** Attempts already spent, so a not-yet-indexed deploy escalates eventually. */
  attempt?: number
  maxAttempts?: number
}

/**
 * Verify the whole chain from one read of both authorities.
 *
 * Every check is emitted even when an earlier one fails, so an operator sees the
 * whole picture rather than only the first broken link.
 */
export async function verifyDeploymentChain(
  input: DeploymentChainInput, now: string, deps: { fetchImpl?: typeof fetch } = {},
): Promise<VerificationEvidence[]> {
  const attempt = input.attempt ?? 1
  const maxAttempts = input.maxAttempts ?? 5
  const out: VerificationEvidence[] = []

  // ── The three GitHub checks ──
  // Delegated whole. The observations are the SAME functions the three
  // registered actions call, so a passive verification and an executed action
  // can never disagree about what GitHub said.
  const identity = { prNumber: input.prNumber, expectedMergeSha: input.expectedMergeSha ?? null }
  out.push(await observeGithubPrMerged(identity, now, deps))
  out.push(await observeGithubPrChecksGreen(identity, now, deps))
  out.push(await observeGithubMergeShaMatch(identity, now, deps))

  const pr = await readPullRequest(input.prNumber, deps)

  // ── The three Vercel checks ──
  // Delegated whole, to the SAME functions the three registered actions call,
  // so a passive verification and an executed action can never disagree.
  // Bound by the ACTUAL merge SHA — never the head SHA, never the attested pin.
  const vercel = {
    mergeSha: pr.ok ? pr.value.mergeCommitSha : null,
    prNumber: input.prNumber, attempt, maxAttempts,
  }
  out.push(await observeVercelProductionReady(vercel, now, deps))
  out.push(await observeVercelDeployShaMatch(vercel, now, deps))
  out.push(await observeVercelProductionAlias(vercel, now, deps))

  return out
}

/**
 * Adapter entry point for `frontend_deploy`.
 *
 * ── WHY THIS CANNOT ANSWER ANY MORE ─────────────────────────────────────────
 * It used to read `FAMILJE_STUNDEN_RELEASE_PR` — a deployment-global value, one
 * pull request number for every month that will ever run. That is exactly the
 * authority PR #184 replaced: a release identity belongs to ONE workflow
 * instance, and October's PR number silently answering November's question is
 * the failure the instance binding exists to prevent.
 *
 * A passive verifier receives a month key and a clock. It has no instance
 * evidence, so it cannot name the release — and inventing one from configuration
 * would reintroduce the defect. It therefore reports BLOCKED with the reason,
 * and the six checks are answered by the registered READ_ONLY actions, which do
 * hold the binding.
 */
export async function verifyReleaseDeployment(
  now: string, _deps: { fetchImpl?: typeof fetch } = {},
): Promise<VerificationEvidence[]> {
  return ['github_pr_merged', 'github_pr_checks_green', 'github_merge_sha_matches_expected',
          'vercel_production_ready', 'vercel_deploy_sha_matches_merge_sha', 'production_alias_attached']
    .map(key => notPass(key, 'credential_missing', {
      expected: 'a release pull request bound to this workflow instance',
      observed: 'the release identity is instance-bound; a passive verifier cannot name it',
      authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now,
      detail: { reason: 'RELEASE_IDENTITY_IS_INSTANCE_BOUND', retryable: false },
    }))
}
