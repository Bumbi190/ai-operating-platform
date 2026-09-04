/**
 * lib/workflows/adapters/familje-stunden/github-observation.ts — the three
 * GitHub release observations, read as the GitHub App.
 *
 * ── THREE AUTHORITIES, KEPT APART ───────────────────────────────────────────
 * They are easy to confuse and answer different questions:
 *
 *   CI authority          pr.head.sha          which commit CI ran on
 *   actual merge SHA      pr.merge_commit_sha  what actually landed
 *   expected merge SHA    the instance pin     what a human said should land
 *
 * CI is read on the HEAD commit and only there. Audited across five merged
 * Familje-Stunden pull requests: the merge commit never receives the
 * `Vercel Preview Comments` check run at all, so a required set pinned to it
 * could not be satisfied and would report a permanent, misleading absence.
 *
 * The expected pin is never allowed to choose which commit is queried. It is
 * only ever the right-hand side of a comparison — otherwise the check would
 * verify the pin against itself.
 *
 * ── THE TARGET IS CONFIGURATION, THE PR IS THE ONLY VARIABLE ────────────────
 * Host and repository are a module constant and one trusted environment value.
 * Nothing a workflow, a request or an evidence row can carry chooses a
 * hostname, an owner, a repository, an App id or an installation id. The single
 * per-release variable is the PR number, which arrives from the instance
 * binding — never from the deployment-global env vars that binding replaced.
 *
 * ── READ ONLY ───────────────────────────────────────────────────────────────
 * Every repository request is a GET. The one POST in the whole call graph mints
 * an installation token, which is authentication and changes nothing in the
 * repository. Merge, close, comment, review, dispatch, status-create and
 * check-create are absent — not guarded, absent.
 */

import 'server-only'

import { notPass, pass, type VerificationEvidence, type VerificationFailureKind } from '../types'
import { getInstallationToken, type MintDeps } from './github-app-auth'
import {
  FAMILJE_STUNDEN_REQUIRED_CHECKS, evaluateRequiredChecks,
  type CheckRunsPayload, type CiOutcome, type CommitStatusPayload,
} from './ci-checks'

const GITHUB_API = 'https://api.github.com'
const GITHUB_SYSTEM = 'github'
const REQUEST_TIMEOUT_MS = 12_000
/** Generous against reality (2 statuses, 10 runs observed) and still bounded. */
const MAX_PAGES = 10
const PER_PAGE = 100

export type ReadFailure =
  | 'credential_missing' | 'network_timeout' | 'service_unavailable'
  | 'unauthorized' | 'not_found' | 'rate_limited'
  | 'unexpected_status' | 'malformed_response'

export type Read<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ReadFailure; detail: string }

const FAILURE_KIND: Record<ReadFailure, VerificationFailureKind> = {
  credential_missing: 'credential_missing',
  network_timeout: 'network_timeout',
  service_unavailable: 'service_unavailable',
  // An authority that refuses us is not evidence about the release.
  unauthorized: 'credential_missing',
  not_found: 'authoritative_fail',
  // Ordinary throttling, not a finding. Retried inside the existing budget.
  rate_limited: 'service_unavailable',
  unexpected_status: 'unexpected_status',
  malformed_response: 'malformed_response',
}

export function isRetryableReadFailure(f: ReadFailure): boolean {
  return f === 'network_timeout' || f === 'service_unavailable' || f === 'rate_limited'
}

/** The canonical target. Trusted configuration, never input. */
function canonicalRepo(): string | null {
  return process.env.FAMILJE_STUNDEN_GITHUB_REPO || null
}

interface GetResult<T> { value: T; linkNext: boolean }

/**
 * One authenticated GET.
 *
 * The token is fetched per call and passed straight into the header. It is
 * never stored on a result, never placed in a URL, and never included in a
 * detail string — a token in a URL is a token in a log, a proxy and a history.
 */
async function githubGet<T>(
  path: string, deps: { fetchImpl?: typeof fetch } & MintDeps,
): Promise<Read<GetResult<T>>> {
  const auth = await getInstallationToken(deps)
  if (!auth.ok) {
    const failure: ReadFailure =
      auth.failure === 'unauthorized' ? 'unauthorized'
      : auth.failure === 'network_timeout' ? 'network_timeout'
      : auth.failure === 'malformed_response' ? 'malformed_response'
      : auth.failure === 'service_unavailable' ? 'service_unavailable'
      : 'credential_missing'
    return { ok: false, failure, detail: auth.detail }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await (deps.fetchImpl ?? fetch)(`${GITHUB_API}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    // The caught error is never quoted: it can carry the request, and the
    // request carries the installation token.
    return { ok: false, failure: aborted ? 'network_timeout' : 'service_unavailable',
      detail: aborted ? `no response within ${REQUEST_TIMEOUT_MS}ms` : 'could not reach GitHub' }
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 404) {
    return { ok: false, failure: 'not_found', detail: 'GitHub reported the resource does not exist' }
  }
  if (res.status === 401) {
    return { ok: false, failure: 'unauthorized', detail: 'GitHub refused the installation token' }
  }
  if (res.status === 403 || res.status === 429) {
    // 403 is BOTH "forbidden" and "rate limited" at GitHub. Only the headers
    // separate them, and treating throttling as an authorization finding would
    // turn a delay into a release blocker.
    const remaining = res.headers?.get?.('x-ratelimit-remaining')
    const limited = res.status === 429 || remaining === '0'
    return limited
      ? { ok: false, failure: 'rate_limited', detail: 'GitHub rate limit reached' }
      : { ok: false, failure: 'unauthorized', detail: 'GitHub refused the request (HTTP 403)' }
  }
  if (res.status >= 500) {
    return { ok: false, failure: 'service_unavailable', detail: `GitHub returned HTTP ${res.status}` }
  }
  if (!res.ok) {
    return { ok: false, failure: 'unexpected_status', detail: `GitHub returned HTTP ${res.status}` }
  }

  try {
    const value = (await res.json()) as T
    const link = res.headers?.get?.('link') ?? ''
    return { ok: true, value: { value, linkNext: /\brel="next"/.test(link) } }
  } catch {
    return { ok: false, failure: 'malformed_response', detail: 'response body was not JSON' }
  }
}

// ── Pull request ─────────────────────────────────────────────────────────────

export interface PullRequestFacts {
  number: number
  state: string
  merged: boolean
  /** The commit that landed on the base branch. Null unless actually merged. */
  mergeCommitSha: string | null
  headSha: string
  baseRepo: string
}

/**
 * The EXACT bound pull request.
 *
 * There is no listing, no search and no "most recent PR" anywhere in this
 * module: a release identity that GitHub gets to choose is not an identity.
 */
export async function readPullRequest(
  prNumber: number, deps: { fetchImpl?: typeof fetch } & MintDeps = {},
): Promise<Read<PullRequestFacts>> {
  const repo = canonicalRepo()
  if (!repo) {
    return { ok: false, failure: 'credential_missing',
      detail: 'FAMILJE_STUNDEN_GITHUB_REPO is not configured' }
  }
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return { ok: false, failure: 'malformed_response', detail: 'the bound pull request number is not usable' }
  }

  const r = await githubGet<{
    number?: unknown; state?: unknown; merged?: unknown; merge_commit_sha?: unknown
    head?: { sha?: unknown }; base?: { repo?: { full_name?: unknown } }
  }>(`/repos/${repo}/pulls/${prNumber}`, deps)
  if (!r.ok) return r

  const v = r.value.value
  const headSha = typeof v?.head?.sha === 'string' ? v.head.sha : null
  const baseRepo = typeof v?.base?.repo?.full_name === 'string' ? v.base.repo.full_name : null
  if (typeof v?.number !== 'number' || headSha === null || baseRepo === null) {
    return { ok: false, failure: 'malformed_response', detail: 'pull request payload was not usable' }
  }
  // The PR must belong to the canonical repository. A response for anything
  // else is refused rather than interpreted.
  if (baseRepo !== repo) {
    return { ok: false, failure: 'not_found',
      detail: `pull request #${prNumber} does not belong to ${repo}` }
  }

  const merged = v.merged === true
  return {
    ok: true,
    value: {
      number: v.number,
      state: typeof v.state === 'string' ? v.state : 'unknown',
      merged,
      // GitHub populates merge_commit_sha SPECULATIVELY on open pull requests.
      // Trusting it there would verify a commit that never landed.
      mergeCommitSha: merged && typeof v.merge_commit_sha === 'string' ? v.merge_commit_sha : null,
      headSha,
      baseRepo,
    },
  }
}

// ── Paginated CI sources ─────────────────────────────────────────────────────

/**
 * Every commit status for a commit, across all pages.
 *
 * `/statuses`, not the combined `/status`: the rollup strips `creator`, so it
 * cannot say who wrote a status — and a status whose producer is unknown can
 * never satisfy a producer-bound requirement.
 */
export async function readCommitStatuses(
  sha: string, deps: { fetchImpl?: typeof fetch } & MintDeps = {},
): Promise<Read<CommitStatusPayload>> {
  const repo = canonicalRepo()
  if (!repo) {
    return { ok: false, failure: 'credential_missing', detail: 'FAMILJE_STUNDEN_GITHUB_REPO is not configured' }
  }
  const statuses: unknown[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await githubGet<unknown>(
      `/repos/${repo}/commits/${sha}/statuses?per_page=${PER_PAGE}&page=${page}`, deps)
    if (!r.ok) return r
    if (!Array.isArray(r.value.value)) {
      return { ok: false, failure: 'malformed_response', detail: 'status page was not a list' }
    }
    statuses.push(...r.value.value)
    if (!r.value.linkNext) {
      // The evaluator wants the combined SHAPE, which carries the commit once.
      return { ok: true, value: { sha, state: 'unknown', total_count: statuses.length, statuses } }
    }
  }
  // More pages remained than the bound allows. An incomplete CI picture must
  // never be evaluated — a required signal could be sitting on page 11.
  return { ok: false, failure: 'malformed_response',
    detail: `commit statuses exceeded ${MAX_PAGES} pages and could not be read completely` }
}

/** Every latest-per-name check run for a commit, across all pages. */
export async function readCheckRuns(
  sha: string, deps: { fetchImpl?: typeof fetch } & MintDeps = {},
): Promise<Read<CheckRunsPayload>> {
  const repo = canonicalRepo()
  if (!repo) {
    return { ok: false, failure: 'credential_missing', detail: 'FAMILJE_STUNDEN_GITHUB_REPO is not configured' }
  }
  const runs: unknown[] = []
  let declared: number | null = null
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await githubGet<{ total_count?: unknown; check_runs?: unknown }>(
      `/repos/${repo}/commits/${sha}/check-runs?filter=latest&per_page=${PER_PAGE}&page=${page}`, deps)
    if (!r.ok) return r
    const body = r.value.value
    if (!Array.isArray(body?.check_runs)) {
      return { ok: false, failure: 'malformed_response', detail: 'check-runs page was not usable' }
    }
    if (declared === null && typeof body.total_count === 'number') declared = body.total_count
    runs.push(...body.check_runs)
    if (!r.value.linkNext) {
      // GitHub states how many exist. Collecting fewer means the picture is
      // incomplete, whatever the pagination headers claimed.
      if (declared !== null && runs.length < declared) {
        return { ok: false, failure: 'malformed_response',
          detail: `check runs incomplete: ${runs.length} of ${declared} collected` }
      }
      return { ok: true, value: { total_count: runs.length, check_runs: runs } }
    }
  }
  return { ok: false, failure: 'malformed_response',
    detail: `check runs exceeded ${MAX_PAGES} pages and could not be read completely` }
}

// ── The three observations ───────────────────────────────────────────────────

export interface ReleaseIdentityInput {
  /** From the instance binding. Never from a deployment-global env var. */
  prNumber: number
  /** The independently attested pin. Null when the instance has not bound one. */
  expectedMergeSha: string | null
}

export type ObservationDeps = { fetchImpl?: typeof fetch } & MintDeps

const blocked = (
  key: string, failure: ReadFailure, expected: string, detail: string, now: string,
): VerificationEvidence =>
  notPass(key, FAILURE_KIND[failure], {
    expected, observed: detail, authoritative_system: GITHUB_SYSTEM, observed_at: now,
    detail: { failure, retryable: isRetryableReadFailure(failure) },
  })

/** github_pr_merged — did the bound pull request actually merge? */
export async function observeGithubPrMerged(
  input: ReleaseIdentityInput, now: string, deps: ObservationDeps = {},
): Promise<VerificationEvidence> {
  const expected = `pull request #${input.prNumber} is merged`
  const pr = await readPullRequest(input.prNumber, deps)
  if (!pr.ok) return blocked('github_pr_merged', pr.failure, expected, pr.detail, now)

  if (!pr.value.merged) {
    // An open pull request is a normal stage of the release, not a defect.
    return notPass('github_pr_merged', 'authoritative_fail', {
      expected, observed: `pull request is ${pr.value.state} and not merged`,
      authoritative_system: GITHUB_SYSTEM, observed_at: now,
      detail: { pr: input.prNumber, state: pr.value.state, head_sha: pr.value.headSha },
    })
  }
  return pass('github_pr_merged', {
    expected, observed: `merged as ${pr.value.mergeCommitSha}`,
    authoritative_system: GITHUB_SYSTEM, observed_at: now,
    detail: { pr: input.prNumber, merge_commit_sha: pr.value.mergeCommitSha, head_sha: pr.value.headSha },
  })
}

/** github_merge_sha_matches_expected — did it merge as the pinned commit? */
export async function observeGithubMergeShaMatch(
  input: ReleaseIdentityInput, now: string, deps: ObservationDeps = {},
): Promise<VerificationEvidence> {
  const key = 'github_merge_sha_matches_expected'
  const expected = 'the merge SHA equals the independently pinned expected SHA'

  if (!input.expectedMergeSha) {
    // Nothing to compare against. UNKNOWN, never PASS — a comparison with no
    // right-hand side proves nothing at all.
    return notPass(key, 'credential_missing', {
      expected, observed: 'no expected merge SHA is bound for this release',
      authoritative_system: null, observed_at: now, detail: { pr: input.prNumber, retryable: false },
    })
  }
  const pr = await readPullRequest(input.prNumber, deps)
  if (!pr.ok) return blocked(key, pr.failure, expected, pr.detail, now)

  const actual = pr.value.mergeCommitSha
  if (actual === null) {
    return notPass(key, 'service_unavailable', {
      expected, observed: 'the pull request has no merge SHA yet',
      authoritative_system: GITHUB_SYSTEM, observed_at: now,
      detail: { pr: input.prNumber, merged: pr.value.merged, retryable: true },
    })
  }
  if (actual !== input.expectedMergeSha) {
    return notPass(key, 'authoritative_fail', {
      expected, observed: `merged as ${actual}, expected ${input.expectedMergeSha}`,
      authoritative_system: GITHUB_SYSTEM, observed_at: now,
      detail: { pr: input.prNumber, reason: 'SHA_MISMATCH',
                merge_commit_sha: actual, expected_merge_sha: input.expectedMergeSha },
    })
  }
  return pass(key, {
    expected, observed: `merge SHA equals the pinned ${actual}`,
    authoritative_system: GITHUB_SYSTEM, observed_at: now,
    detail: { pr: input.prNumber, merge_commit_sha: actual },
  })
}

const CI_OUTCOME_FAILURE: Readonly<Record<CiOutcome, VerificationFailureKind>> = {
  ALL_REQUIRED_CHECKS_GREEN: 'authoritative_fail', // unreachable: green never fails
  CHECKS_PENDING: 'service_unavailable',
  SOURCE_UNAVAILABLE: 'service_unavailable',
  MALFORMED_RESPONSE: 'malformed_response',
  CHECKS_FAILED: 'authoritative_fail',
  EXPECTED_CHECK_MISSING: 'authoritative_fail',
  SHA_MISMATCH: 'authoritative_fail',
  UNTRUSTED_PRODUCER: 'authoritative_fail',
  NO_REQUIRED_POLICY: 'authoritative_fail',
}

/** github_pr_checks_green — every required signal, on the HEAD commit. */
export async function observeGithubPrChecksGreen(
  input: ReleaseIdentityInput, now: string, deps: ObservationDeps = {},
): Promise<VerificationEvidence> {
  const key = 'github_pr_checks_green'
  const expected =
    `all required CI checks (${FAMILJE_STUNDEN_REQUIRED_CHECKS.map(c => c.identity).join(', ')}) ` +
    'pass on the pull request head commit'

  const pr = await readPullRequest(input.prNumber, deps)
  if (!pr.ok) return blocked(key, pr.failure, expected, pr.detail, now)
  const sha = pr.value.headSha

  // BOTH sources, always. GitHub keeps Checks and Commit Statuses in two
  // separate systems and neither sees the other, so one of them answering is
  // half an answer — which is the false PASS this whole design removed.
  const statuses = await readCommitStatuses(sha, deps)
  const runs = await readCheckRuns(sha, deps)

  const verdict = evaluateRequiredChecks({
    sha,
    commitStatus: statuses.ok ? statuses.value : null,
    checkRuns: runs.ok ? runs.value : null,
  })
  const detail = {
    pr: input.prNumber, head_sha: sha, outcome: verdict.outcome,
    checks: verdict.checks.map(c => `${c.identity}=${c.state}`).join(', '),
    sources: `commit_status=${statuses.ok}, check_runs=${runs.ok}`,
  }

  if (verdict.green) {
    return pass(key, {
      expected, observed: 'every required check is green on the head commit',
      authoritative_system: GITHUB_SYSTEM, observed_at: now, detail,
    })
  }
  const unread = verdict.outcome === 'SOURCE_UNAVAILABLE'
  const transport = !statuses.ok ? statuses.failure : !runs.ok ? runs.failure : null
  const kind = unread && transport !== null
    ? FAILURE_KIND[transport]
    : CI_OUTCOME_FAILURE[verdict.outcome]
  return notPass(key, kind, {
    expected,
    observed: unread
      ? 'both the commit-status and check-runs sources must be read before this check can be answered'
      : `required checks are ${verdict.outcome}`,
    authoritative_system: GITHUB_SYSTEM, observed_at: now,
    detail: {
      ...detail,
      retryable: (unread && transport !== null && isRetryableReadFailure(transport))
        || verdict.outcome === 'CHECKS_PENDING',
    },
  })
}
