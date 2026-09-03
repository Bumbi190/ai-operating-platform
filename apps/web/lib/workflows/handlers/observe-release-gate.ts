/**
 * The third executable action — and the first that presents a credential.
 *
 * It wraps `observeReleaseGate` unchanged. There is no second implementation:
 * the adapter owns the request, the classification and the vocabulary, and this
 * handler only adapts one shape to another. That is what stops the release check
 * and the action from ever drifting apart.
 *
 * ── WHY THIS IS STILL READ_ONLY ─────────────────────────────────────────────
 * It sends one POST that reads one row. It writes nothing in Familje-Stunden,
 * nothing in Omnira, and running it twice changes nothing anywhere. The
 * credential it presents is a scoped verification key which cannot write in
 * Familje-Stunden either — the privileged service_role never leaves that
 * system's own Edge Function.
 *
 * ── THE TARGET IS CONFIGURATION, NEVER INPUT ────────────────────────────────
 * The URL is built inside the adapter from `FAMILJE_STUNDEN_SUPABASE_URL` and a
 * module constant path. This handler passes a month key and nothing else, so no
 * caller — not a workflow spec, not evidence, not an admin request — can steer
 * the request anywhere. `instanceKey` IS the month key for this definition, and
 * it is validated against the canonical pattern before any request is made.
 *
 * ── THE CREDENTIAL NEVER REACHES THE OUTPUT ─────────────────────────────────
 * The adapter builds `detail` from scalars it chose; it never spreads a response
 * body, never serialises an error object (which can carry the request, and the
 * request carries the header), and never reads the key back out. This handler
 * copies only known-named fields, so an unexpected detail key cannot ride along.
 */

import { observeReleaseGate } from '../adapters/familje-stunden'
import type { ReadOnlyHandler, ReadOnlyHandlerOutput, ReadOnlyResult } from './types'

/**
 * Map the adapter's verification result onto the handler vocabulary.
 *
 * `fail` stays `fail`: an absent row is a real finding about the world, not an
 * inability to look. Everything that could not establish truth becomes `blocked`
 * or `error`, which the consumer reads as UNKNOWN.
 */
function toResult(result: string): ReadOnlyResult {
  if (result === 'pass') return 'pass'
  if (result === 'fail') return 'fail'
  if (result === 'error') return 'error'
  return 'blocked'
}

/** Copy only the fields we name. An unexpected key cannot become output. */
function safeDetail(detail: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const k of ['month_key', 'row_present', 'release_at', 'reason', 'status', 'missing_config'] as const) {
    const v = detail[k]
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v
    }
  }
  return out
}

export const observeReleaseGateHandler: ReadOnlyHandler = async (
  input,
): Promise<ReadOnlyHandlerOutput> => {
  // instanceKey IS the month key for familje-stunden.monthly-release. It is
  // derived from the instance, never supplied by a caller, and the adapter
  // validates it against the canonical pattern before sending anything.
  const evidence = await observeReleaseGate(input.instanceKey, input.now, input.beforeAttempt)

  return {
    result: toResult(evidence.result),
    checkKey: evidence.check_key,
    expected: evidence.expected,
    observed: evidence.observed,
    detail: safeDetail(evidence.detail),
    authoritativeSystem: evidence.authoritative_system,
  }
}
