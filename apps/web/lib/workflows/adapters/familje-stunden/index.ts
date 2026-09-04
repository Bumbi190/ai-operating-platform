/**
 * The Familje-Stunden read-only verification adapter.
 *
 * ── IT OBSERVES POLICY. IT DOES NOT OWN POLICY. ──────────────────────────────
 * `can_access_month` is Familje-Stunden's single source of truth for access, and
 * it applies a FAIL-OPEN release gate: a month with no `month_releases` row
 * counts as released. A copy of those conditions living here and drifting out of
 * sync would publish material early — which is why this file contains no
 * subscription logic, no entitlement logic, no gate arithmetic, and no storage
 * path resolution. It asks, and it reports the answer.
 *
 * ── WHAT IT CAN ACTUALLY REACH TODAY ─────────────────────────────────────────
 * Audited against Familje-Stunden production before this was written:
 *
 *   is_month_released   SECURITY DEFINER, EXECUTE granted to postgres and
 *                       service_role ONLY. Not reachable by anon or
 *                       authenticated.
 *   can_access_month    granted to authenticated — answers for the CALLING user,
 *                       so it needs a session, not just a key.
 *   get_visible_months  granted to authenticated. Same.
 *   month_releases      RLS on, ZERO policies — service_role only.
 *
 * Omnira must not hold service_role (PR4 section B), so the gate reads are
 * genuinely unreachable today and report `blocked: credential_missing` rather
 * than guessing. That is the honest state, and it is why those checks exist here
 * fully written but inert: when a scoped read-only identity is granted, one
 * config value turns them on with no new code path to review.
 *
 * The protected-endpoint probes need NO credential at all — both functions carry
 * `verify_jwt: true`, so an unauthenticated request is refused by the platform
 * before any code runs. That check is real today.
 */

import 'server-only'

import {
  notPass, pass, type VerificationEvidence, type WorkflowAdapter,
} from '../types'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE } from '@/lib/workflows/definitions'
import { InvalidMonthKeyError, computeReleaseInstant, isCanonicalMonthKey } from './instant'
import { FAMILJE_STUNDEN_CHECKS } from './checks'
import { checkConsumersInSync, readAllConsumers, verifyDeployedSource } from './deployed-source'
import { verifyReleaseDeployment } from './deployment'

export const FAMILJE_STUNDEN_SYSTEM = 'familje-stunden'

/**
 * The two Edge Functions that serve protected material. Both declare
 * `verify_jwt = true`; the probe asserts the platform still refuses an
 * unauthenticated caller. Listed here because the runbook's KFM 7 is explicit
 * that one working proves nothing about the other.
 */
const PROTECTED_FUNCTIONS = ['sign-protected-asset', 'get-protected-ebook'] as const

/** Bounded, so a hung authority cannot hold a scheduler tick open. */
const PROBE_TIMEOUT_MS = 8_000

/**
 * Configuration, read at call time so a deployment can turn checks on without a
 * code change. Deliberately NOT defaulted to a hardcoded project URL: baking
 * another system's infrastructure into Omnira's source is the same boundary
 * mistake as copying its policy.
 */
function config(): { baseUrl: string | null; verifyKey: string | null } {
  const baseUrl = process.env.FAMILJE_STUNDEN_SUPABASE_URL?.replace(/\/+$/, '') || null
  // The scoped read-only identity. Absent today by design — see the header.
  const verifyKey = process.env.FAMILJE_STUNDEN_VERIFY_KEY || null
  return { baseUrl, verifyKey }
}

interface ProbeOutcome {
  status: number | null
  kind: 'ok' | 'timeout' | 'network' | null
}

/** One HTTP probe with a hard timeout. Never throws. */
async function probe(url: string, init: RequestInit): Promise<ProbeOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
    return { status: res.status, kind: 'ok' }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return { status: null, kind: aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

// ── Checks ───────────────────────────────────────────────────────────────────

/**
 * The requested release instant, recorded so an audit shows what was expected.
 * Pure — it consults nothing and decides nothing about release state.
 */
export function checkReleaseInstant(monthKey: string, now: string): VerificationEvidence {
  try {
    const instant = computeReleaseInstant(monthKey)
    return pass('release_instant_computed', {
      expected: 'first day of month 00:00 Europe/Stockholm, stored UTC',
      observed: `${instant.utc} (${instant.stockholm} ${instant.utcOffset})`,
      authoritative_system: null,        // nothing external was consulted
      observed_at: now,
      detail: { month_key: monthKey, utc: instant.utc, stockholm: instant.stockholm, utc_offset: instant.utcOffset },
    })
  } catch (e) {
    return notPass('release_instant_computed',
      e instanceof InvalidMonthKeyError ? 'malformed_response' : 'unexpected_status', {
        expected: 'a computable release instant',
        observed: e instanceof Error ? e.message : 'unknown error',
        authoritative_system: null, observed_at: now, detail: { month_key: monthKey },
      })
  }
}

/**
 * Unauthenticated callers must be refused by BOTH protected functions.
 *
 * A 200 here is the dangerous outcome — protected material reachable without a
 * session — so it is an authoritative FAIL, not an anomaly. Anything that is
 * neither a refusal nor a success is an error: an unrecognised status must never
 * be read as "probably fine".
 */
/**
 * Called immediately before each individual outbound probe request.
 *
 * G3C-3A: this check emits several requests per invocation, so one decision at
 * the top would authorise a whole burst. The callback lets the CALLER
 * re-establish governance per request while this adapter stays free of
 * governance logic — it knows only "ask before each packet", never what the
 * answer means. Refusal is expressed by throwing, so it cannot be silently
 * ignored by this loop.
 *
 * Optional on purpose: the same check is reused by adapter verification that
 * belongs to no run and holds no claim, and requiring one there would break
 * read-only verification for no benefit.
 */
export type BeforeProbeAttempt = () => Promise<void> | void

export async function checkAnonymousProtectedAccessDenied(
  monthKey: string, now: string, beforeAttempt?: BeforeProbeAttempt,
): Promise<VerificationEvidence> {
  const { baseUrl } = config()
  const key = 'anonymous_protected_access_denied'
  const expected = 'HTTP 401 from every protected function for an unauthenticated caller'

  if (!baseUrl) {
    return notPass(key, 'credential_missing', {
      expected, observed: 'FAMILJE_STUNDEN_SUPABASE_URL is not configured',
      authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now,
      detail: { missing_config: 'FAMILJE_STUNDEN_SUPABASE_URL' },
    })
  }

  const body = JSON.stringify({ monthKey, assetKey: 'mp3' })
  const attempts: { fn: string; variant: string; status: number | null; kind: string | null }[] = []

  for (const fn of PROTECTED_FUNCTIONS) {
    const url = `${baseUrl}/functions/v1/${fn}`
    const variants: { variant: string; init: RequestInit }[] = [
      { variant: 'no_headers', init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body } },
      { variant: 'invalid_bearer', init: { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not.a.jwt' }, body } },
    ]
    for (const { variant, init } of variants) {
      // Re-authorise before EVERY request. A stop committing after request N
      // must prevent request N+1; the already-dispatched one finishes, exactly
      // as G3C-1 and G3C-2B promise.
      if (beforeAttempt) await beforeAttempt()
      const outcome = await probe(url, init)
      attempts.push({ fn, variant, status: outcome.status, kind: outcome.kind })
    }
  }

  const timedOut = attempts.filter(a => a.kind === 'timeout')
  const networkFailed = attempts.filter(a => a.kind === 'network')
  const allowed = attempts.filter(a => a.status !== null && a.status >= 200 && a.status < 300)
  const denied = attempts.filter(a => a.status === 401)
  const unexpected = attempts.filter(
    a => a.status !== null && a.status !== 401 && !(a.status >= 200 && a.status < 300))

  const detail = { month_key: monthKey, attempts }

  // A leak outranks everything: report it even if other variants also failed.
  if (allowed.length > 0) {
    return notPass(key, 'authoritative_fail', {
      expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now, detail,
      observed: `${allowed.length} of ${attempts.length} unauthenticated requests were ALLOWED`,
    })
  }
  if (timedOut.length > 0) {
    return notPass(key, 'network_timeout', {
      expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now, detail,
      observed: `${timedOut.length} probe(s) timed out after ${PROBE_TIMEOUT_MS}ms`,
    })
  }
  if (networkFailed.length > 0) {
    return notPass(key, 'service_unavailable', {
      expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now, detail,
      observed: `${networkFailed.length} probe(s) could not reach the service`,
    })
  }
  if (unexpected.length > 0) {
    return notPass(key, 'unexpected_status', {
      expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now, detail,
      observed: `unexpected status(es): ${unexpected.map(u => `${u.fn}/${u.variant}=${u.status}`).join(', ')}`,
    })
  }

  return pass(key, {
    expected, authoritative_system: FAMILJE_STUNDEN_SYSTEM, observed_at: now, detail,
    observed: `all ${denied.length} unauthenticated requests refused with 401`,
  })
}

/**
 * Checks that require a scoped read-only identity Omnira does not hold.
 *
 * Written, typed and wired — and reporting `blocked` until a credential exists.
 * They must NEVER answer `pass` from a guess: `is_month_released` is the gate
 * that decides whether material is public, and inferring it locally would be
 * exactly the duplication this adapter exists to avoid.
 */
function blockedOnCredential(check_key: string, expected: string, now: string): VerificationEvidence {
  return notPass(check_key, 'credential_missing', {
    expected,
    observed: 'no scoped Familje-Stunden read-only credential is configured for Omnira',
    authoritative_system: FAMILJE_STUNDEN_SYSTEM,
    observed_at: now,
    detail: {
      missing_config: 'FAMILJE_STUNDEN_VERIFY_KEY',
      required_grant: 'EXECUTE on the three release/access RPCs for a scoped read-only role',
      note: 'a privileged full-access key is deliberately not an option for Omnira',
    },
  })
}

/** The one endpoint this adapter may ask about the release gate. */
const RELEASE_GATE_PATH = '/functions/v1/observe-release-gate'

/** Both mean the scoped verification credential was refused. Neither may pass. */
const AUTH_REFUSED: ReadonlySet<number> = new Set([401, 403])

const RELEASE_GATE_EXPECTED =
  'the authoritative month_releases row for the month, as reported by Familje-Stunden'

/**
 * Observe the authoritative release-gate row.
 *
 * ── WHY THIS EXISTS AND WHY IT IS NOT A LOCAL COMPUTATION ───────────────────
 * The gate is FAIL-OPEN: a month with no `month_releases` row counts as
 * released. Absence is therefore the dangerous state, and no other reachable
 * answer distinguishes it — `is_month_released` is service_role-only and would
 * return TRUE both for "no row" and for "row, already passed". So Omnira asks
 * Familje-Stunden, and Familje-Stunden answers.
 *
 * ── WHAT THIS FUNCTION REFUSES TO DO ────────────────────────────────────────
 * It never decides access, never computes a gate, never converts a failure into
 * "no row". A transport error, a refusal or an unreadable body are all reported
 * as NOT-PASS with a kind that keeps them distinguishable, because the consumer
 * maps an authoritative absence to NO but uncertainty to UNKNOWN, and those
 * block release for different reasons.
 *
 * ── THE TARGET IS CONFIGURATION ─────────────────────────────────────────────
 * The base URL comes from `FAMILJE_STUNDEN_SUPABASE_URL` and the path is the
 * module constant above. `monthKey` travels in the JSON body only; it can never
 * reach the host, the scheme or the path, so no caller can redirect this
 * request. The credential is read from the environment at call time and appears
 * in exactly one place: the Authorization header of this request.
 */
export async function observeReleaseGate(
  monthKey: string,
  now: string,
  beforeAttempt?: BeforeProbeAttempt,
): Promise<VerificationEvidence> {
  const key = 'release_gate_exists'
  const { baseUrl, verifyKey } = config()

  // Validate locally. A malformed key must not become a production request just
  // because the remote would also reject it.
  if (!isCanonicalMonthKey(monthKey)) {
    return notPass(key, 'malformed_response', {
      expected: RELEASE_GATE_EXPECTED,
      observed: 'the month key is not canonical YYYY-MM; no request was sent',
      authoritative_system: null,
      observed_at: now,
      detail: { reason: 'INVALID_MONTH_KEY', month_key: monthKey },
    })
  }

  // Missing configuration costs nothing: no DNS, no connection.
  if (!baseUrl || !verifyKey) {
    return blockedOnCredential(key, RELEASE_GATE_EXPECTED, now)
  }

  if (beforeAttempt) await beforeAttempt()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${baseUrl}${RELEASE_GATE_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${verifyKey}`,
      },
      body: JSON.stringify({ month_key: monthKey }),
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    // Never echo the error object: it can carry the request, and the request
    // carries the credential.
    return notPass(key, aborted ? 'network_timeout' : 'service_unavailable', {
      expected: RELEASE_GATE_EXPECTED,
      observed: aborted ? 'the request timed out' : 'the request did not complete',
      authoritative_system: FAMILJE_STUNDEN_SYSTEM,
      observed_at: now,
      detail: { reason: aborted ? 'TRANSPORT_TIMEOUT' : 'TRANSPORT_FAILURE', month_key: monthKey },
    })
  } finally {
    clearTimeout(timer)
  }

  // Membership rather than `401 || 403`: the anonymous probe below has a guard
  // forbidding that exact widening in its own status handling, and this refusal
  // is a different thing entirely — there, 401 is the expected PASS; here, both
  // codes mean our credential was refused and neither may pass.
  if (AUTH_REFUSED.has(res.status)) {
    return notPass(key, 'unexpected_status', {
      expected: RELEASE_GATE_EXPECTED,
      observed: `Familje-Stunden refused the verification credential (${res.status})`,
      authoritative_system: FAMILJE_STUNDEN_SYSTEM,
      observed_at: now,
      detail: { reason: 'AUTH_REJECTED', status: res.status, month_key: monthKey },
    })
  }

  if (res.status !== 200) {
    return notPass(key, res.status >= 500 ? 'service_unavailable' : 'unexpected_status', {
      expected: RELEASE_GATE_EXPECTED,
      observed: `Familje-Stunden answered ${res.status}`,
      authoritative_system: FAMILJE_STUNDEN_SYSTEM,
      observed_at: now,
      detail: { reason: 'REMOTE_SERVER_FAILURE', status: res.status, month_key: monthKey },
    })
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return notPass(key, 'malformed_response', {
      expected: RELEASE_GATE_EXPECTED,
      observed: 'the response body was not JSON',
      authoritative_system: FAMILJE_STUNDEN_SYSTEM,
      observed_at: now,
      detail: { reason: 'MALFORMED_RESPONSE', month_key: monthKey },
    })
  }

  const b = (body ?? {}) as Record<string, unknown>
  const present = b.row_present
  const releaseAt = b.release_at

  // The answer must be about the month we asked about. A filter regression
  // upstream must not be able to answer with a different month's date.
  if (b.month_key !== monthKey || typeof present !== 'boolean') {
    return notPass(key, 'malformed_response', {
      expected: RELEASE_GATE_EXPECTED,
      observed: 'the response did not carry a boolean row_present for the requested month',
      authoritative_system: FAMILJE_STUNDEN_SYSTEM,
      observed_at: now,
      detail: { reason: 'MALFORMED_RESPONSE', month_key: monthKey },
    })
  }

  if (!present) {
    // A real authoritative negative, not an inability to check. Because the gate
    // is fail-open, this is the finding that means "the month is unprotected".
    return notPass(key, 'authoritative_fail', {
      expected: RELEASE_GATE_EXPECTED,
      observed: `no month_releases row exists for ${monthKey}; the fail-open gate offers no protection`,
      authoritative_system: FAMILJE_STUNDEN_SYSTEM,
      observed_at: now,
      detail: { row_present: false, release_at: null, month_key: monthKey },
    })
  }

  if (typeof releaseAt !== 'string' || Number.isNaN(Date.parse(releaseAt))) {
    return notPass(key, 'malformed_response', {
      expected: RELEASE_GATE_EXPECTED,
      observed: 'the row exists but its release_at is not a parseable instant',
      authoritative_system: FAMILJE_STUNDEN_SYSTEM,
      observed_at: now,
      detail: { reason: 'MALFORMED_RELEASE_AT', row_present: true, month_key: monthKey },
    })
  }

  // The row exists and carries a readable instant. Whether that instant is the
  // RIGHT one is a separate comparison, made by the consumer against the
  // independently computed expected instant — deliberately not decided here, so
  // neither value can quietly overwrite the other.
  return pass(key, {
    expected: RELEASE_GATE_EXPECTED,
    observed: `month_releases row exists for ${monthKey} with release_at ${releaseAt}`,
    authoritative_system: FAMILJE_STUNDEN_SYSTEM,
    observed_at: now,
    detail: { row_present: true, release_at: releaseAt, month_key: monthKey },
  })
}

export function checkReleaseGate(monthKey: string, now: string): VerificationEvidence {
  return blockedOnCredential(
    'release_gate_exists',
    `a release row for ${monthKey} whose instant equals the computed one`, now)
}

export function checkIsMonthReleased(monthKey: string, now: string): VerificationEvidence {
  return blockedOnCredential(
    'is_month_released_expected_state',
    `the release-state answer for ${monthKey}, given by Familje-Stunden`, now)
}

export function checkNonAdminAccess(monthKey: string, now: string): VerificationEvidence {
  return blockedOnCredential(
    'non_admin_access_expected_state',
    `a non-admin denied ${monthKey} before release, as judged by Familje-Stunden`, now)
}

export function checkVisibleMonths(now: string): VerificationEvidence {
  return blockedOnCredential(
    'visible_months_expected_state', 'the visible-month list, given by Familje-Stunden', now)
}

// ── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Which states this adapter can say something about today.
 *
 * Deliberately short. It is the set whose verification is reachable read-only
 * over the network — not the set the runbook lists, most of which needs local
 * artefacts (ffprobe, PDF geometry, file counts) or systems PR4 may not touch.
 */
const VERIFIABLE: Record<string, (monthKey: string, now: string) => Promise<VerificationEvidence[]>> = {
  planning: async (monthKey, now) => [checkReleaseInstant(monthKey, now)],
  backend_release_gate: async (monthKey, now) => [
    checkReleaseInstant(monthKey, now),
    checkReleaseGate(monthKey, now),
    checkIsMonthReleased(monthKey, now),
  ],
  // KFM 3/4/5: a merged shared file is not a deployed shared file. This is the
  // state where that is established, against production rather than the repo.
  edge_deploy: async (_monthKey, now) => verifyDeployedSource(now),
  // The frontend half of the chain. Deliberately separate from edge_deploy:
  // Vercel deploys only the frontend and never touches the Edge Functions, so
  // a green Vercel deployment says nothing about the protected manifest.
  frontend_deploy: async (_monthKey, now) => verifyReleaseDeployment(now),
  approval_release: async (monthKey, now) => [
    await checkAnonymousProtectedAccessDenied(monthKey, now),
    checkNonAdminAccess(monthKey, now),
    // Re-read: a redeploy between edge_deploy and approval would otherwise slip past.
    checkConsumersInSync(await readAllConsumers(now), now),
    // The re-read of the deployment SHA used to come from a deployment-global
    // release PR. That authority is gone: the identity is instance-bound, and
    // the registered READ_ONLY action carries it.
  ],
  scheduled_release: async (monthKey, now) => [
    checkReleaseInstant(monthKey, now),
    checkIsMonthReleased(monthKey, now),
  ],
  post_release_qa: async (monthKey, now) => [
    checkIsMonthReleased(monthKey, now),
    checkNonAdminAccess(monthKey, now),
    checkVisibleMonths(now),
    checkConsumersInSync(await readAllConsumers(now), now),
    // The re-read of the deployment SHA used to come from a deployment-global
    // release PR. That authority is gone: the identity is instance-bound, and
    // the registered READ_ONLY action carries it.
  ],
}

export const familjeStundenAdapter: WorkflowAdapter = {
  defKey: FAMILJE_STUNDEN_MONTHLY_RELEASE,
  authoritativeSystem: FAMILJE_STUNDEN_SYSTEM,
  verifiableStates: () => Object.keys(VERIFIABLE).sort(),
  attestableChecks: () => FAMILJE_STUNDEN_CHECKS,
  verifyState: async ({ state, instanceKey, now }) => {
    const check = VERIFIABLE[state]
    if (!check) return []
    return check(instanceKey, now)
  },
}
