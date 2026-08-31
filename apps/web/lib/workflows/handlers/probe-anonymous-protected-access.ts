/**
 * The second executable action — and the first that reaches outside Omnira.
 *
 * It wraps `checkAnonymousProtectedAccessDenied` unchanged. There is no second
 * implementation of the probe: the Familje-Stunden adapter calls the same
 * function at `approval_release`, so the release check and the capability test
 * can never drift apart.
 *
 * ── WHY THIS IS STILL READ_ONLY ─────────────────────────────────────────────
 * It sends four requests whose ONLY purpose is to be refused. No credential is
 * presented — the sole Authorization header it ever sets is the deliberately
 * invalid `Bearer not.a.jwt` — and a 2xx is the finding, not the success. It
 * writes nothing anywhere, and repeating it changes nothing.
 *
 * ── THE URL IS CONFIGURATION, NEVER INPUT ───────────────────────────────────
 * The base URL comes from `FAMILJE_STUNDEN_SUPABASE_URL` inside the adapter.
 * Nothing here accepts a URL, a host or a path from a caller, so this handler
 * cannot become a general-purpose fetch. The instance key is echoed into the
 * probe body and the audit detail only; it never influences where the request
 * goes.
 *
 * ── MISSING CONFIG IS BLOCKED, AND COSTS NOTHING ────────────────────────────
 * With the URL unset the underlying check returns `credential_missing` BEFORE
 * constructing any request, so no DNS lookup and no connection is attempted.
 * That is what makes a first validation run possible with zero outbound
 * traffic — and `blocked` is reported honestly rather than as a pass or a
 * failure of Familje-Stunden.
 */

import { checkAnonymousProtectedAccessDenied } from '../adapters/familje-stunden'
import { PROBE_CHECK } from '../adapters/probe-validation'
import type { ReadOnlyHandler, ReadOnlyHandlerOutput, ReadOnlyResult } from './types'

interface ProbeAttempt { fn: string; variant: string; status: number | null; kind: string | null }

/**
 * Flatten the evidence detail to scalars.
 *
 * The underlying check records every attempt as an object; `ReadOnlyHandlerOutput`
 * takes only scalars, and a summary is the right shape for an audit anyway — a
 * count of 401s and the distinct statuses seen, never a response body.
 */
function summarize(detail: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const attempts = Array.isArray(detail.attempts) ? (detail.attempts as ProbeAttempt[]) : []
  const statuses = [...new Set(attempts.map(a => (a.status === null ? (a.kind ?? 'no_status') : String(a.status))))]
  return {
    attempts: attempts.length,
    denied_401: attempts.filter(a => a.status === 401).length,
    allowed_2xx: attempts.filter(a => a.status !== null && a.status >= 200 && a.status < 300).length,
    distinct_statuses: statuses.sort().join(','),
    endpoints: [...new Set(attempts.map(a => a.fn))].sort().join(','),
    instance_key: typeof detail.month_key === 'string' ? detail.month_key : null,
    missing_config: typeof detail.missing_config === 'string' ? detail.missing_config : null,
  }
}

export const probeAnonymousProtectedAccessHandler: ReadOnlyHandler = async input => {
  // The adapter owns the classification: all-401 is the only pass, a 2xx
  // outranks everything as a leak, and 403 is `unexpected_status` rather than a
  // second kind of success. None of that is re-decided here.
  const evidence = await checkAnonymousProtectedAccessDenied(input.instanceKey, input.now)

  const out: ReadOnlyHandlerOutput = {
    result: evidence.result as ReadOnlyResult,
    checkKey: PROBE_CHECK,
    expected: evidence.expected,
    observed: evidence.observed,
    authoritativeSystem: evidence.authoritative_system,
    detail: {
      ...summarize((evidence.detail ?? {}) as Record<string, unknown>),
      failure_kind: evidence.failure_kind ?? null,
      observed_at: input.now,
    },
  }
  return out
}
