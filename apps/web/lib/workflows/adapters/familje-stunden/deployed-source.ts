/**
 * Read-only deployed-source verification for Familje-Stundens Edge Functions.
 *
 * ── THE FAILURE THIS EXISTS FOR ─────────────────────────────────────────────
 * KFM 3/4/5 in the canonical runbook: `_utils/protectedManifest.ts` was merged
 * and the objects were uploaded, but the functions were never redeployed. The
 * gate said YES while the allowlist said NO, and the symptom — 400 "Unknown
 * asset", 404 "No ebook for month" — reads as a permissions bug rather than
 * deploy drift. A deploy from a stale checkout made it worse: the bundle was
 * identical to the deployed one, the CLI said "No change found", and it looked
 * like a successful no-op.
 *
 * The lesson the runbook draws is exact: "a merged shared file is not a
 * deployed shared file", and local source shows only what you INTENDED to
 * deploy. So this module never reads the repository. It asks the Management API
 * what is actually running.
 *
 * ── THE CHECK THAT NEEDS NO EXPECTED VALUE ──────────────────────────────────
 * The shared manifest is bundled into every consumer at deploy time, so two
 * consumers deployed from the same commit carry byte-identical copies. If one
 * was redeployed and the other was not, their copies DIFFER — and that is
 * detectable without knowing what the manifest should contain. Consumer
 * agreement is therefore checked directly against production, and it is the
 * check that would have caught the real incident.
 *
 * `deployed_manifest_matches_expected` is the stronger claim and does need a
 * pinned expectation; without one it reports blocked rather than guessing.
 *
 * ── NO WRITE PATH EXISTS HERE ───────────────────────────────────────────────
 * Deploy, update, delete, rollback and storage are absent from this module —
 * not guarded, absent. The only HTTP verb it issues is GET.
 */

import 'server-only'

import { createHash } from 'node:crypto'
import { notPass, pass, type VerificationEvidence } from '../types'
import { FAMILJE_STUNDEN_SYSTEM } from './index'

/**
 * The functions that bundle the shared protected manifest.
 *
 * Mirrors `MANIFEST_CONSUMERS` in the Familje-Stunden repository's own
 * verification script, which is the canonical list. KFM 7 is explicit that one
 * working proves nothing about the other, and KFM 5 that a new consumer must be
 * added in the same commit that introduces it — so a deployed set that differs
 * from this one is itself a finding.
 */
export const MANIFEST_CONSUMERS = ['sign-protected-asset', 'get-protected-ebook'] as const
export type ManifestConsumer = (typeof MANIFEST_CONSUMERS)[number]

/** The bundled path of the shared manifest inside a deployed function. */
const MANIFEST_FILE_SUFFIX = '_utils/protectedManifest.ts'

const MANAGEMENT_API = 'https://api.supabase.com'
const READ_TIMEOUT_MS = 12_000

/**
 * Configuration.
 *
 * `FAMILJE_STUNDEN_MANAGEMENT_TOKEN` is deliberately NOT provisioned. A Supabase
 * Management API token is an ACCOUNT-scoped personal access token: it can
 * create and delete projects, deploy and delete functions, and read secrets
 * across every project in the account. Supabase offers no read-only variant. So
 * while this module only ever issues GET, the credential it would need is not
 * read-only, and installing it into a deployed web app would put full account
 * control one bug away from the internet. Until that trade is decided
 * explicitly, every check here reports `credential_missing`.
 */
function config(): { token: string | null; projectRef: string | null; expectedManifestSha: string | null } {
  return {
    token: process.env.FAMILJE_STUNDEN_MANAGEMENT_TOKEN || null,
    projectRef: process.env.FAMILJE_STUNDEN_PROJECT_REF || null,
    expectedManifestSha: process.env.FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256 || null,
  }
}

// ── Deployed reader ──────────────────────────────────────────────────────────

export interface DeployedFunctionFacts {
  slug: string
  version: number | null
  status: string | null
  verifyJwt: boolean | null
  /** The platform's own hash of the deployed bundle. Differs per function. */
  bundleHash: string | null
  /** sha256 of the DEPLOYED shared manifest's content. Comparable across consumers. */
  manifestHash: string | null
  /** Month keys present in the deployed manifest, for a human to read. */
  manifestMonthKeys: string[]
  observedAt: string
}

export type ReadFailure =
  | 'credential_missing' | 'network_timeout' | 'service_unavailable'
  | 'unexpected_status' | 'malformed_response' | 'manifest_absent'

export type DeployedReadResult =
  | { ok: true; facts: DeployedFunctionFacts }
  | { ok: false; failure: ReadFailure; detail: string }

/** Month keys at the top level of an object literal following a marker. */
function monthKeysFrom(source: string, marker: string): string[] {
  const i = source.indexOf(marker)
  if (i === -1) return []
  const body = source.slice(i)
  const end = body.indexOf('\n};')
  const scoped = end === -1 ? body : body.slice(0, end)
  return [...scoped.matchAll(/^\s{2}"(\d{4}-\d{2})":/gm)].map(m => m[1])
}

/**
 * Read what is deployed for one function.
 *
 * GET only. The Management API returns the whole bundled file set, which is why
 * this can see `_utils/protectedManifest.ts` at all — the CLI's `functions
 * download` extracts only the entrypoint, so a grep there proves nothing (KFM 11).
 */
export async function readDeployedFunction(
  slug: string,
  now: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<DeployedReadResult> {
  const { token, projectRef } = config()
  if (!token || !projectRef) {
    return { ok: false, failure: 'credential_missing',
      detail: 'FAMILJE_STUNDEN_MANAGEMENT_TOKEN / FAMILJE_STUNDEN_PROJECT_REF are not configured' }
  }

  const doFetch = deps.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS)
  let res: Response
  try {
    res = await doFetch(`${MANAGEMENT_API}/v1/projects/${projectRef}/functions/${slug}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return { ok: false, failure: aborted ? 'network_timeout' : 'service_unavailable',
      detail: aborted ? `no response within ${READ_TIMEOUT_MS}ms` : 'could not reach the Management API' }
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    return { ok: false, failure: 'unexpected_status', detail: `Management API returned HTTP ${res.status}` }
  }

  let body: { version?: number; status?: string; verify_jwt?: boolean; ezbr_sha256?: string
              files?: { name?: string; content?: string }[] }
  try {
    body = await res.json()
  } catch {
    return { ok: false, failure: 'malformed_response', detail: 'response body was not JSON' }
  }
  if (!Array.isArray(body.files)) {
    return { ok: false, failure: 'malformed_response', detail: 'response carried no deployed file set' }
  }

  const manifest = body.files.find(f => typeof f.name === 'string' && f.name.endsWith(MANIFEST_FILE_SUFFIX))
  if (!manifest || typeof manifest.content !== 'string') {
    // A consumer deployed without the shared manifest is drift, not a read error.
    return { ok: false, failure: 'manifest_absent',
      detail: `deployed bundle for "${slug}" contains no ${MANIFEST_FILE_SUFFIX}` }
  }

  return {
    ok: true,
    facts: {
      slug,
      version: typeof body.version === 'number' ? body.version : null,
      status: typeof body.status === 'string' ? body.status : null,
      verifyJwt: typeof body.verify_jwt === 'boolean' ? body.verify_jwt : null,
      bundleHash: typeof body.ezbr_sha256 === 'string' ? body.ezbr_sha256 : null,
      // Hash of the DEPLOYED content — never derived from anything local.
      manifestHash: createHash('sha256').update(manifest.content).digest('hex'),
      manifestMonthKeys: monthKeysFrom(manifest.content, 'export const PROTECTED_ASSETS'),
      observedAt: now,
    },
  }
}

// ── Drift model ──────────────────────────────────────────────────────────────

export interface ConsumerReport {
  slug: string
  read: DeployedReadResult
}

/** Read every canonical consumer. One failure does not stop the others. */
export async function readAllConsumers(
  now: string, deps: { fetchImpl?: typeof fetch } = {},
): Promise<ConsumerReport[]> {
  const out: ConsumerReport[] = []
  for (const slug of MANIFEST_CONSUMERS) {
    out.push({ slug, read: await readDeployedFunction(slug, now, deps) })
  }
  return out
}

const FAILURE_TO_KIND = {
  credential_missing: 'credential_missing',
  network_timeout: 'network_timeout',
  service_unavailable: 'service_unavailable',
  unexpected_status: 'unexpected_status',
  malformed_response: 'malformed_response',
  // A consumer missing the shared manifest is an authoritative finding.
  manifest_absent: 'authoritative_fail',
} as const

/**
 * Do every consumer carry the SAME deployed manifest?
 *
 * The check that would have caught the real incident, and it needs no expected
 * value: two consumers deployed from one commit bundle byte-identical copies, so
 * a difference means one of them was not redeployed.
 *
 * PASSES ONLY IF EVERY CONSUMER WAS READ. One readable consumer that happens to
 * match proves nothing about the other, so a partial read is never a pass.
 */
export function checkConsumersInSync(reports: ConsumerReport[], now: string): VerificationEvidence {
  const key = 'shared_manifest_consumers_in_sync'
  const expected = `every consumer (${MANIFEST_CONSUMERS.join(', ')}) deployed with an identical shared manifest`

  const failed = reports.filter(r => !r.read.ok)
  if (failed.length > 0) {
    const worst = failed[0].read as { ok: false; failure: ReadFailure; detail: string }
    return notPass(key, FAILURE_TO_KIND[worst.failure], {
      expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now,
      observed: `${failed.length} of ${reports.length} consumers could not be verified: ` +
                failed.map(f => `${f.slug} (${(f.read as { failure: string }).failure})`).join(', '),
      detail: { consumers: reports.map(r => ({ slug: r.slug, ok: r.read.ok })) },
    })
  }

  const facts = reports.map(r => (r.read as { ok: true; facts: DeployedFunctionFacts }).facts)
  const hashes = new Set(facts.map(f => f.manifestHash))
  const detail = {
    consumers: facts.map(f => ({
      slug: f.slug, version: f.version, verify_jwt: f.verifyJwt,
      manifest_sha256: f.manifestHash, months: f.manifestMonthKeys,
    })),
  }

  if (hashes.size > 1) {
    return notPass(key, 'authoritative_fail', {
      expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now, detail,
      observed: 'consumers DISAGREE on the deployed shared manifest — at least one was not redeployed',
    })
  }
  return pass(key, {
    expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now, detail,
    observed: `all ${facts.length} consumers share deployed manifest ${[...hashes][0]?.slice(0, 16)}…`,
  })
}

/**
 * Does the deployed manifest match the pinned expectation?
 *
 * Needs `FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256`, which binds a repository
 * commit to a manifest content hash. Without it this reports blocked — inferring
 * the expectation from local source would defeat the entire point, since local
 * source is what you meant to deploy, not what is running.
 */
export function checkDeployedManifestMatchesExpected(
  reports: ConsumerReport[], now: string,
): VerificationEvidence {
  const key = 'deployed_manifest_matches_expected'
  const { expectedManifestSha } = config()
  const expected = `deployed shared manifest equals the pinned expected hash`

  if (!expectedManifestSha) {
    return notPass(key, 'credential_missing', {
      expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now,
      observed: 'no expected manifest hash is pinned for this release',
      detail: { missing_config: 'FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256' },
    })
  }

  const failed = reports.filter(r => !r.read.ok)
  if (failed.length > 0) {
    const worst = failed[0].read as { ok: false; failure: ReadFailure; detail: string }
    return notPass(key, FAILURE_TO_KIND[worst.failure], {
      expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now,
      observed: `could not verify ${failed.map(f => f.slug).join(', ')}`,
      detail: { expected_sha256: expectedManifestSha },
    })
  }

  const facts = reports.map(r => (r.read as { ok: true; facts: DeployedFunctionFacts }).facts)
  const stale = facts.filter(f => f.manifestHash !== expectedManifestSha)
  const detail = {
    expected_sha256: expectedManifestSha,
    consumers: facts.map(f => ({ slug: f.slug, version: f.version, manifest_sha256: f.manifestHash })),
  }

  if (stale.length > 0) {
    return notPass(key, 'authoritative_fail', {
      expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now, detail,
      observed: `${stale.length} consumer(s) deployed with a different manifest: ${stale.map(s => s.slug).join(', ')}`,
    })
  }
  return pass(key, {
    expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now, detail,
    observed: `all consumers deployed with the expected manifest ${expectedManifestSha.slice(0, 16)}…`,
  })
}

/**
 * Per-consumer currency.
 *
 * A version number moving without the manifest content changing is NOT drift —
 * a redeploy of unchanged code is routine. Only the content hash decides.
 */
export function checkConsumerCurrent(
  report: ConsumerReport, checkKey: string, now: string,
): VerificationEvidence {
  const expected = `"${report.slug}" deployed, active, JWT-verified, carrying the shared manifest`

  if (!report.read.ok) {
    return notPass(checkKey, FAILURE_TO_KIND[report.read.failure], {
      expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now,
      observed: report.read.detail, detail: { slug: report.slug },
    })
  }
  const f = report.read.facts
  const detail = {
    slug: f.slug, version: f.version, status: f.status, verify_jwt: f.verifyJwt,
    bundle_sha256: f.bundleHash, manifest_sha256: f.manifestHash, months: f.manifestMonthKeys,
  }

  // verify_jwt turning off would make protected material reachable without a
  // session — the same class of exposure the anonymous probe watches for.
  if (f.verifyJwt !== true) {
    return notPass(checkKey, 'authoritative_fail', {
      expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now, detail,
      observed: `"${f.slug}" is deployed WITHOUT verify_jwt`,
    })
  }
  if (f.status !== 'ACTIVE') {
    return notPass(checkKey, 'authoritative_fail', {
      expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now, detail,
      observed: `"${f.slug}" is deployed with status ${f.status ?? 'unknown'}`,
    })
  }
  return pass(checkKey, {
    expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now, detail,
    observed: `v${f.version} ACTIVE, manifest ${f.manifestHash?.slice(0, 16)}…, months ${f.manifestMonthKeys.join('/')}`,
  })
}

/** Every deployed-source check, from one read of production. */
export async function verifyDeployedSource(
  now: string, deps: { fetchImpl?: typeof fetch } = {},
): Promise<VerificationEvidence[]> {
  const reports = await readAllConsumers(now, deps)
  return [
    checkConsumersInSync(reports, now),
    checkDeployedManifestMatchesExpected(reports, now),
    checkConsumerCurrent(reports[0], 'sign_protected_asset_source_current', now),
    checkConsumerCurrent(reports[1], 'get_protected_ebook_source_current', now),
  ]
}
