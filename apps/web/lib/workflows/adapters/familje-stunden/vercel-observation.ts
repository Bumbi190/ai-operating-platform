/**
 * lib/workflows/adapters/familje-stunden/vercel-observation.ts — the three
 * Vercel release observations, read with a PROJECT-SCOPED token.
 *
 * ── THE CREDENTIAL IS NOT READ-ONLY, SO THE CODE IS ─────────────────────────
 * Vercel offers project scope but no read-only tier: this token can read AND
 * write inside familje-stunden-v2. It cannot touch Omnira, the team, the
 * account or any other project — but within that one project it could create a
 * deployment or mutate an alias. The platform will not stop that; this module
 * is what does.
 *
 * There is exactly one request function, `vercelGet`. It takes a PATH and no
 * method, so there is no argument anyone can pass to make it write. A generic
 * `request(method, path)` helper is deliberately absent — that shape is how a
 * write becomes reachable a year from now, one convenient parameter at a time.
 *
 * ── EXACT BINDING, NEVER RECENCY ────────────────────────────────────────────
 * The deployment is located by `sha=` on the pinned project with
 * `target=production`. The predecessor fetched the newest twenty production
 * deployments and searched them client-side, which quietly false-fails once a
 * twenty-first lands: the release is still deployed, but it has fallen out of
 * the window and reads as "never arrived".
 *
 * ── THE LISTING IS NOT THE AUTHORITY ────────────────────────────────────────
 * `/v6/deployments` does not populate `alias` — measured against the live
 * project, every production deployment comes back with the field absent, healthy
 * ones included. The predecessor read it from there and would have reported a
 * CRITICAL alias failure on a correct release. The listing is used to resolve
 * one id, and `/v13/deployments/{id}` answers everything.
 */

import 'server-only'

import { notPass, pass, type VerificationEvidence, type VerificationFailureKind } from '../types'

/** Trusted constants. Not configuration, not input. */
const VERCEL_API = 'https://api.vercel.com'
const VERCEL_SYSTEM = 'vercel'
/** What the product is actually served from. A .vercel.app alias is not it. */
export const CANONICAL_PRODUCTION_DOMAIN = 'familje-stunden.se'
const REQUEST_TIMEOUT_MS = 12_000

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
  unauthorized: 'credential_missing',
  not_found: 'authoritative_fail',
  rate_limited: 'service_unavailable',
  unexpected_status: 'unexpected_status',
  malformed_response: 'malformed_response',
}

export function isRetryableReadFailure(f: ReadFailure): boolean {
  return f === 'network_timeout' || f === 'service_unavailable' || f === 'rate_limited'
}

/**
 * Credential and target, read at call time from the environment only.
 *
 * No parameter, request field or workflow value can supply a token or a project
 * id, which is what makes both the credential and its target un-steerable. The
 * project-scoped token carries its own team, so no team id is needed or read.
 */
function config(): { token: string; projectId: string } | null {
  const token = process.env.FAMILJE_STUNDEN_VERCEL_TOKEN?.trim() || ''
  const projectId = process.env.FAMILJE_STUNDEN_VERCEL_PROJECT_ID?.trim() || ''
  if (!token || !projectId) return null
  return { token, projectId }
}

/**
 * The ONLY way this module reaches Vercel.
 *
 * GET is hard-coded. The caller supplies a path, never a method — so no call
 * site, and no future call site, can turn this into a write.
 */
async function vercelGet<T>(
  path: string, deps: { fetchImpl?: typeof fetch } = {},
): Promise<Read<T>> {
  const cfg = config()
  if (!cfg) {
    return { ok: false, failure: 'credential_missing',
      detail: 'FAMILJE_STUNDEN_VERCEL_TOKEN / FAMILJE_STUNDEN_VERCEL_PROJECT_ID are not configured' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await (deps.fetchImpl ?? fetch)(`${VERCEL_API}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    // The caught error is never quoted: it can carry the request, and the
    // request carries the Authorization header.
    return { ok: false, failure: aborted ? 'network_timeout' : 'service_unavailable',
      detail: aborted ? `no response within ${REQUEST_TIMEOUT_MS}ms` : 'could not reach Vercel' }
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 404) return { ok: false, failure: 'not_found', detail: 'Vercel reported the resource does not exist' }
  if (res.status === 401) return { ok: false, failure: 'unauthorized', detail: 'Vercel refused the token' }
  if (res.status === 429) return { ok: false, failure: 'rate_limited', detail: 'Vercel rate limit reached' }
  if (res.status === 403) {
    // Only explicit rate-limit evidence turns a refusal into a delay. Guessing
    // the other way would turn a real authorization failure into a retry storm.
    const remaining = res.headers?.get?.('x-ratelimit-remaining')
    return remaining === '0'
      ? { ok: false, failure: 'rate_limited', detail: 'Vercel rate limit reached' }
      : { ok: false, failure: 'unauthorized', detail: 'Vercel refused the request (HTTP 403)' }
  }
  if (res.status >= 500) return { ok: false, failure: 'service_unavailable', detail: `Vercel returned HTTP ${res.status}` }
  if (!res.ok) return { ok: false, failure: 'unexpected_status', detail: `Vercel returned HTTP ${res.status}` }

  try {
    return { ok: true, value: (await res.json()) as T }
  } catch {
    return { ok: false, failure: 'malformed_response', detail: 'response body was not JSON' }
  }
}

// ── The authoritative deployment record ──────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export interface DeploymentFacts {
  id: string
  readyState: string
  readySubstate: string | null
  target: string | null
  /** Vercel's own git metadata. Never the site's HTTP status. */
  commitSha: string | null
  aliases: readonly string[]
  aliasAssigned: boolean
  aliasError: unknown
}

/**
 * The production deployment for one exact commit, or null when none exists.
 *
 * `sha=` is a server-side filter, so the answer is the deployment for THAT
 * commit or nothing at all. There is no window to fall out of and no "latest"
 * to be mistaken for the release.
 */
export async function findProductionDeployment(
  mergeSha: string, deps: { fetchImpl?: typeof fetch } = {},
): Promise<Read<string | null>> {
  const cfg = config()
  if (!cfg) {
    return { ok: false, failure: 'credential_missing',
      detail: 'FAMILJE_STUNDEN_VERCEL_TOKEN / FAMILJE_STUNDEN_VERCEL_PROJECT_ID are not configured' }
  }
  const params = new URLSearchParams({
    projectId: cfg.projectId, target: 'production', sha: mergeSha, limit: '1',
  })
  const r = await vercelGet<{ deployments?: unknown }>(`/v6/deployments?${params}`, deps)
  if (!r.ok) return r

  const list = r.value?.deployments
  if (!Array.isArray(list)) {
    return { ok: false, failure: 'malformed_response', detail: 'deployment listing was not usable' }
  }
  // Absent is not an error — the deploy may simply not have started yet. The
  // caller decides whether that is "still coming" or "never arrived".
  if (list.length === 0) return { ok: true, value: null }

  const first = list[0]
  if (!isObj(first)) {
    return { ok: false, failure: 'malformed_response', detail: 'deployment entry was not usable' }
  }
  const uid = str(first.uid) ?? str(first.id)
  if (uid === null) {
    return { ok: false, failure: 'malformed_response', detail: 'deployment carried no usable id' }
  }
  return { ok: true, value: uid }
}

/**
 * The full record for one deployment.
 *
 * This — not the listing — is the authority for every field the three checks
 * read. The listing omits `alias` entirely.
 */
export async function readDeployment(
  uid: string, deps: { fetchImpl?: typeof fetch } = {},
): Promise<Read<DeploymentFacts>> {
  const r = await vercelGet<Record<string, unknown>>(`/v13/deployments/${uid}`, deps)
  if (!r.ok) return r

  const d = r.value
  if (!isObj(d)) return { ok: false, failure: 'malformed_response', detail: 'deployment payload was not usable' }
  const readyState = str(d.readyState) ?? str(d.status)
  if (readyState === null) {
    return { ok: false, failure: 'malformed_response', detail: 'deployment carried no ready state' }
  }
  const alias = Array.isArray(d.alias) ? d.alias.filter((a): a is string => typeof a === 'string') : null
  if (d.alias !== undefined && alias === null) {
    return { ok: false, failure: 'malformed_response', detail: 'deployment alias field was not a list' }
  }
  return {
    ok: true,
    value: {
      id: str(d.uid) ?? str(d.id) ?? uid,
      readyState,
      readySubstate: str(d.readySubstate),
      target: str(d.target),
      commitSha: isObj(d.meta) ? str(d.meta.githubCommitSha) : null,
      aliases: alias ?? [],
      aliasAssigned: d.aliasAssigned === true,
      aliasError: d.aliasError ?? null,
    },
  }
}

// ── The three observations ───────────────────────────────────────────────────

export interface ReleaseDeploymentInput {
  /** The ACTUAL merge commit, from the bound PR. Never the head or the pin. */
  mergeSha: string | null
  /** Carried only for detail; the SHA is what binds. */
  prNumber: number
  attempt?: number
  maxAttempts?: number
}

export type ObservationDeps = { fetchImpl?: typeof fetch }

const blocked = (key: string, failure: ReadFailure, expected: string, detail: string, now: string) =>
  notPass(key, FAILURE_KIND[failure], {
    expected, observed: detail, authoritative_system: VERCEL_SYSTEM, observed_at: now,
    detail: { failure, retryable: isRetryableReadFailure(failure) },
  })

const noMergeSha = (key: string, expected: string, prNumber: number, now: string) =>
  notPass(key, 'authoritative_fail', {
    expected, observed: 'the bound pull request has no merge SHA to verify a deployment against',
    authoritative_system: VERCEL_SYSTEM, observed_at: now,
    detail: { pr: prNumber, reason: 'NO_MERGE_SHA', retryable: false },
  })

/** Resolve the bound release deployment, or the reason there is none. */
async function boundDeployment(
  input: ReleaseDeploymentInput, key: string, expected: string, now: string, deps: ObservationDeps,
): Promise<{ ok: true; d: DeploymentFacts } | { ok: false; evidence: VerificationEvidence }> {
  if (!input.mergeSha) return { ok: false, evidence: noMergeSha(key, expected, input.prNumber, now) }

  const found = await findProductionDeployment(input.mergeSha, deps)
  if (!found.ok) return { ok: false, evidence: blocked(key, found.failure, expected, found.detail, now) }

  if (found.value === null) {
    // Not indexed yet is normal early and a finding late. The retry budget is
    // what separates the two, so this cannot block a release forever.
    const attempt = input.attempt ?? 1
    const maxAttempts = input.maxAttempts ?? 5
    const exhausted = attempt >= maxAttempts
    return { ok: false, evidence: notPass(key, exhausted ? 'authoritative_fail' : 'service_unavailable', {
      expected,
      observed: exhausted
        ? `no production deployment for ${input.mergeSha} after ${attempt} attempts`
        : `no production deployment for ${input.mergeSha} yet (attempt ${attempt}/${maxAttempts})`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now,
      detail: { merge_sha: input.mergeSha, reason: 'DEPLOYMENT_NOT_FOUND',
                attempt, max_attempts: maxAttempts, retryable: !exhausted },
    }) }
  }

  const dep = await readDeployment(found.value, deps)
  if (!dep.ok) return { ok: false, evidence: blocked(key, dep.failure, expected, dep.detail, now) }
  return { ok: true, d: dep.value }
}

const baseDetail = (d: DeploymentFacts, input: ReleaseDeploymentInput) => ({
  pr: input.prNumber, deployment_id: d.id, ready_state: d.readyState,
  ready_substate: d.readySubstate ?? 'none', target: d.target ?? 'none',
  deployed_sha: d.commitSha ?? 'none', merge_sha: input.mergeSha ?? 'none',
})

/** vercel_production_ready — is the bound deployment live on production? */
export async function observeVercelProductionReady(
  input: ReleaseDeploymentInput, now: string, deps: ObservationDeps = {},
): Promise<VerificationEvidence> {
  const key = 'vercel_production_ready'
  const expected = 'the deployment of the merge SHA is READY and PROMOTED on production'
  const b = await boundDeployment(input, key, expected, now, deps)
  if (!b.ok) return b.evidence
  const d = b.d
  const detail = baseDetail(d, input)

  // A preview deployment can be READY all day and prove nothing about production.
  if (d.target !== 'production') {
    return notPass(key, 'authoritative_fail', {
      expected, observed: `deployment target is ${d.target ?? 'null'}, not production`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
    })
  }
  if (d.readyState === 'BUILDING' || d.readyState === 'QUEUED' || d.readyState === 'INITIALIZING') {
    return notPass(key, 'service_unavailable', {
      expected, observed: `deployment is ${d.readyState}`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now,
      detail: { ...detail, reason: 'PRODUCTION_DEPLOYMENT_NOT_READY', retryable: true },
    })
  }
  if (d.readyState !== 'READY') {
    // ERROR and CANCELED are immediate findings, never retried.
    return notPass(key, 'authoritative_fail', {
      expected, observed: `deployment is ${d.readyState}`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now,
      detail: { ...detail, reason: 'PRODUCTION_DEPLOYMENT_NOT_READY' },
    })
  }
  // READY says the build finished. PROMOTED says it is the one production runs.
  if (d.readySubstate !== 'PROMOTED') {
    return notPass(key, 'service_unavailable', {
      expected, observed: `deployment is READY but its substate is ${d.readySubstate ?? 'absent'}, not PROMOTED`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now,
      detail: { ...detail, reason: 'PRODUCTION_DEPLOYMENT_NOT_READY', retryable: true },
    })
  }
  return pass(key, {
    expected, observed: `deployment ${d.id} is READY and PROMOTED on production`,
    authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
  })
}

/** vercel_deploy_sha_matches_merge_sha — is production running THAT commit? */
export async function observeVercelDeployShaMatch(
  input: ReleaseDeploymentInput, now: string, deps: ObservationDeps = {},
): Promise<VerificationEvidence> {
  const key = 'vercel_deploy_sha_matches_merge_sha'
  const expected = 'the deployed SHA is exactly the merge SHA'
  const b = await boundDeployment(input, key, expected, now, deps)
  if (!b.ok) return b.evidence
  const d = b.d
  const detail = baseDetail(d, input)

  // Deliberately independent of READY. A READY deployment on the wrong commit
  // is the exact failure that looks completely healthy from the outside.
  if (d.commitSha === null) {
    return notPass(key, 'malformed_response', {
      expected, observed: 'deployment carries no authoritative git SHA',
      authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
    })
  }
  if (d.commitSha !== input.mergeSha) {
    return notPass(key, 'authoritative_fail', {
      expected, observed: `production is deployed on ${d.commitSha}, merge SHA is ${input.mergeSha}`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now,
      detail: { ...detail, reason: 'DEPLOY_SHA_MISMATCH' },
    })
  }
  return pass(key, {
    expected, observed: `deployed SHA equals merge SHA (${input.mergeSha})`,
    authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
  })
}

/** production_alias_attached — does the real domain point at THAT deployment? */
export async function observeVercelProductionAlias(
  input: ReleaseDeploymentInput, now: string, deps: ObservationDeps = {},
): Promise<VerificationEvidence> {
  const key = 'production_alias_attached'
  const expected = `${CANONICAL_PRODUCTION_DOMAIN} is attached to the deployment of the merge SHA`
  const b = await boundDeployment(input, key, expected, now, deps)
  if (!b.ok) return b.evidence
  const d = b.d
  const detail = {
    ...baseDetail(d, input),
    canonical_domain: CANONICAL_PRODUCTION_DOMAIN,
    alias_assigned: d.aliasAssigned,
    alias_count: d.aliases.length,
  }

  if (d.aliasError !== null && d.aliasError !== undefined) {
    return notPass(key, 'authoritative_fail', {
      expected, observed: 'Vercel reported an alias error for this deployment',
      authoritative_system: VERCEL_SYSTEM, observed_at: now,
      detail: { ...detail, reason: 'ALIAS_MISSING' },
    })
  }
  if (!d.aliasAssigned) {
    return notPass(key, 'authoritative_fail', {
      expected, observed: 'the deployment has no alias assigned',
      authoritative_system: VERCEL_SYSTEM, observed_at: now,
      detail: { ...detail, reason: 'ALIAS_MISSING' },
    })
  }
  // The canonical domain, exactly. "Has at least one alias" is what the
  // predecessor asked, and every deployment that ever built has one of those —
  // including the previous release, which is precisely the wrong answer.
  if (!d.aliases.includes(CANONICAL_PRODUCTION_DOMAIN)) {
    return notPass(key, 'authoritative_fail', {
      expected,
      observed: `${CANONICAL_PRODUCTION_DOMAIN} is not among this deployment's ${d.aliases.length} alias(es)`,
      authoritative_system: VERCEL_SYSTEM, observed_at: now,
      detail: { ...detail, reason: 'ALIAS_POINTS_TO_WRONG_DEPLOYMENT' },
    })
  }
  return pass(key, {
    expected, observed: `${CANONICAL_PRODUCTION_DOMAIN} is attached to deployment ${d.id}`,
    authoritative_system: VERCEL_SYSTEM, observed_at: now, detail,
  })
}
