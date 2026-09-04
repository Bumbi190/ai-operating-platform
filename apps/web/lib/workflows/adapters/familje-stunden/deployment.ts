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
    vercelToken: process.env.FAMILJE_STUNDEN_VERCEL_TOKEN || null,
    vercelProjectId: process.env.FAMILJE_STUNDEN_VERCEL_PROJECT_ID || null,
    vercelTeamId: process.env.FAMILJE_STUNDEN_VERCEL_TEAM_ID || null,
    /** The release PR under verification. */
    releasePr: process.env.FAMILJE_STUNDEN_RELEASE_PR || null,
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

export interface DeploymentFacts {
  id: string
  state: string
  target: string | null
  /** Vercel's own authoritative git metadata. Never the site's HTTP status. */
  commitSha: string | null
  aliases: string[]
  observedAt: string
}

/**
 * The production deployment carrying a given commit SHA.
 *
 * Searched by SHA rather than "the newest production deployment", so a later
 * unrelated deploy cannot be mistaken for the one under verification.
 */
export async function findProductionDeployment(
  commitSha: string, now: string, deps: { fetchImpl?: typeof fetch } = {},
): Promise<Read<DeploymentFacts | null>> {
  const { vercelToken, vercelProjectId, vercelTeamId } = config()
  if (!vercelToken || !vercelProjectId) {
    return { ok: false, failure: 'credential_missing',
      detail: 'FAMILJE_STUNDEN_VERCEL_TOKEN / FAMILJE_STUNDEN_VERCEL_PROJECT_ID are not configured' }
  }
  const params = new URLSearchParams({ projectId: vercelProjectId, target: 'production', limit: '20' })
  if (vercelTeamId) params.set('teamId', vercelTeamId)

  const r = await getJson<{ deployments?: {
    uid?: string; id?: string; state?: string; readyState?: string; target?: string | null
    meta?: { githubCommitSha?: string }; alias?: string[]
  }[] }>(`${VERCEL_API}/v6/deployments?${params}`,
    { Authorization: `Bearer ${vercelToken}` }, deps.fetchImpl ?? fetch)
  if (!r.ok) return r

  const list = r.value?.deployments
  if (!Array.isArray(list)) {
    return { ok: false, failure: 'malformed_response', detail: 'deployment listing was not usable' }
  }
  const hit = list.find(d => d.meta?.githubCommitSha === commitSha)
  // Absent is not an error — the deploy may simply not have started yet. The
  // caller decides whether that is "still coming" or "never arrived".
  if (!hit) return { ok: true, value: null }

  return {
    ok: true,
    value: {
      id: hit.uid ?? hit.id ?? '', state: hit.readyState ?? hit.state ?? 'UNKNOWN',
      target: hit.target ?? null, commitSha: hit.meta?.githubCommitSha ?? null,
      aliases: Array.isArray(hit.alias) ? hit.alias : [], observedAt: now,
    },
  }
}

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

  // ── Vercel side. Verified against the MERGE SHA, never a requested one. ──
  const mergeSha = pr.ok ? pr.value.mergeCommitSha : null
  const readyExpected = 'a production deployment for the merge SHA is READY'
  const matchExpected = 'the deployed SHA is exactly the merge SHA'
  const aliasExpected = 'the production deployment carries a production alias'

  if (!mergeSha) {
    for (const [k, e] of [['vercel_production_ready', readyExpected],
                          ['vercel_deploy_sha_matches_merge_sha', matchExpected],
                          ['production_alias_attached', aliasExpected]] as const) {
      out.push(notPass(k, 'authoritative_fail', {
        expected: e, observed: 'no merge SHA to verify a deployment against',
        authoritative_system: VERCEL_SYSTEM, observed_at: now, detail: { pr: input.prNumber },
      }))
    }
    return out
  }

  const dep = await findProductionDeployment(mergeSha, now, deps)
  if (!dep.ok) {
    for (const [k, e] of [['vercel_production_ready', readyExpected],
                          ['vercel_deploy_sha_matches_merge_sha', matchExpected],
                          ['production_alias_attached', aliasExpected]] as const) {
      out.push(blocked(k, dep.failure, e, dep.detail, VERCEL_SYSTEM, now))
    }
    return out
  }

  const d = dep.value
  if (d === null) {
    // Not indexed yet is normal early and a finding late. The retry budget is
    // what separates the two, so this cannot block a release forever.
    const exhausted = attempt >= maxAttempts
    for (const [k, e] of [['vercel_production_ready', readyExpected],
                          ['vercel_deploy_sha_matches_merge_sha', matchExpected],
                          ['production_alias_attached', aliasExpected]] as const) {
      out.push(notPass(k, exhausted ? 'authoritative_fail' : 'service_unavailable', {
        expected: e,
        observed: exhausted
          ? `no production deployment for ${mergeSha} after ${attempt} attempts`
          : `no production deployment for ${mergeSha} yet (attempt ${attempt}/${maxAttempts})`,
        authoritative_system: VERCEL_SYSTEM, observed_at: now,
        detail: { merge_sha: mergeSha, attempt, max_attempts: maxAttempts, retryable: !exhausted },
      }))
    }
    return out
  }

  const detail = {
    deployment_id: d.id, state: d.state, target: d.target,
    deployed_sha: d.commitSha, merge_sha: mergeSha, aliases: d.aliases.length,
  }

  // ── vercel_production_ready ──
  if (d.target !== 'production') {
    out.push(notPass('vercel_production_ready', 'authoritative_fail', {
      expected: readyExpected, observed: `deployment target is ${d.target ?? 'null'}, not production`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
    }))
  } else if (d.state === 'BUILDING' || d.state === 'QUEUED' || d.state === 'INITIALIZING') {
    out.push(notPass('vercel_production_ready', 'service_unavailable', {
      expected: readyExpected, observed: `deployment is ${d.state}`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now, detail: { ...detail, retryable: true },
    }))
  } else if (d.state !== 'READY') {
    // ERROR and CANCELED are immediate findings, never retried.
    out.push(notPass('vercel_production_ready', 'authoritative_fail', {
      expected: readyExpected, observed: `deployment is ${d.state}`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
    }))
  } else {
    out.push(pass('vercel_production_ready', {
      expected: readyExpected, observed: `deployment ${d.id} is READY on production`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
    }))
  }

  // ── vercel_deploy_sha_matches_merge_sha ──
  // Deliberately independent of the READY check. A READY deployment on the wrong
  // commit is the exact failure that looks healthy from outside, so "READY" is
  // never allowed to imply "the right thing is deployed".
  if (d.commitSha === null) {
    out.push(notPass('vercel_deploy_sha_matches_merge_sha', 'malformed_response', {
      expected: matchExpected, observed: 'deployment carries no authoritative git SHA',
      authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
    }))
  } else if (d.commitSha !== mergeSha) {
    out.push(notPass('vercel_deploy_sha_matches_merge_sha', 'authoritative_fail', {
      expected: matchExpected,
      observed: `production is deployed on ${d.commitSha}, merge SHA is ${mergeSha}`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
    }))
  } else {
    out.push(pass('vercel_deploy_sha_matches_merge_sha', {
      expected: matchExpected, observed: `deployed SHA equals merge SHA (${mergeSha})`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
    }))
  }

  // ── production_alias_attached ──
  out.push(d.aliases.length > 0
    ? pass('production_alias_attached', {
        expected: aliasExpected, observed: `${d.aliases.length} alias(es) attached`,
        authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
      })
    : notPass('production_alias_attached', 'authoritative_fail', {
        expected: aliasExpected, observed: 'the production deployment has no alias attached',
        authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
      }))

  return out
}

/** The release PR from configuration, when one is set. */
export function configuredReleasePr(): number | null {
  const raw = config().releasePr
  if (!raw) return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Adapter entry point. With no PR configured every check reports blocked rather
 * than guessing which pull request a release belongs to.
 */
export async function verifyReleaseDeployment(
  now: string, deps: { fetchImpl?: typeof fetch } = {},
): Promise<VerificationEvidence[]> {
  const pr = configuredReleasePr()
  if (pr === null) {
    return ['github_pr_merged', 'github_pr_checks_green', 'github_merge_sha_matches_expected',
            'vercel_production_ready', 'vercel_deploy_sha_matches_merge_sha', 'production_alias_attached']
      .map(key => notPass(key, 'credential_missing', {
        expected: 'a release pull request to verify', observed: 'no release PR is configured',
        authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now,
        detail: { missing_config: 'FAMILJE_STUNDEN_RELEASE_PR' },
      }))
  }
  return verifyDeploymentChain({ prNumber: pr }, now, deps)
}
