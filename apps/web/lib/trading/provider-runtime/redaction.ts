/**
 * Omnira Trading — structured logging that cannot carry a secret.
 *
 * ALLOW-LISTED, NOT SCRUBBED
 * ──────────────────────────
 * The usual approach is to log an object and strip secrets on the way out with
 * a deny-list. That fails the moment someone adds a field: the new field is
 * logged in full, and nothing tells you until it is already in a log
 * aggregator. A deny-list has to be right about every future field; an
 * allow-list only has to be right about the ones deliberately added.
 *
 * So a `SessionLogFields` value carries exactly the fields named below, all of
 * them non-secret by construction, and `redactValue` exists for the one place
 * that cannot be structured: text arriving from somewhere else, on its way into
 * a `ProviderError.message`.
 *
 * A note on what this is NOT: `lib/media` has redaction helpers that read
 * `process.env` to find secret values to strip. That approach is deliberately
 * not reused here. R1A must not touch the real environment at all, and a
 * redactor that needs the secrets in order to hide them is one configuration
 * mistake away from being the thing that leaks them.
 */

/** Field names whose values never appear in any output. */
const SECRET_KEY_PATTERN = /pass|secret|token|auth|cookie|credential|key|session[-_]?id|bearer/i

export const REDACTED = '[redacted]'

/**
 * The only fields the runtime logs about a session.
 *
 * Every one is either an enum member, a number, or a boolean. None can hold a
 * credential, an endpoint with an embedded token, or a raw provider payload —
 * not by policy, but because the type has nowhere to put one.
 */
export interface SessionLogFields {
  readonly event: string
  readonly state: string
  readonly generation: number
  readonly attempt: number
  readonly liveness: string
  readonly failure?: string
  readonly delayMs?: number
}

/**
 * Recursively replace secret-looking values.
 *
 * The safety net, not the mechanism. It exists for text and objects that
 * originate outside the runtime — a transport's error detail, say — where the
 * allow-list cannot apply because the shape is not ours.
 *
 * Depth is bounded, and a cycle terminates: a redactor that hangs or overflows
 * on a hostile object is a denial of service in the logging path.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redactValue(v, depth + 1)
    }
    return out
  }
  // Functions, symbols, bigints: nothing worth logging, and a function could
  // close over anything at all.
  return REDACTED
}

/**
 * Redact secrets embedded in free text.
 *
 * Handles the shapes that actually occur in transport error strings: `key=value`
 * pairs, JSON fragments, bearer tokens, and URL userinfo. It is a net beneath
 * the structured path, and is not relied on alone — which is why the structured
 * path exists.
 */
export function redactText(text: string): string {
  return text
    /*
     * ORDER MATTERS. The scheme rules run FIRST: `Authorization: Bearer <tok>`
     * also matches the key=value rule, which would capture only "Bearer" as the
     * value and leave the token in the clear. Redacting the narrower, more
     * specific shape before the general one is the difference between a leak
     * and a redaction.
     */
    // Authorization: Bearer <token>
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, (_m, scheme: string) => `${scheme} ${REDACTED}`)
    // URL userinfo — scheme://user:secret@host
    .replace(/(\w+:\/\/)[^/@\s:]+:[^/@\s]+@/g, (_m, scheme: string) => `${scheme}${REDACTED}@`)
    // JSON: "password": "..."
    .replace(
      /"([^"]*(?:pass|secret|token|auth|cookie|credential|key)[^"]*)"\s*:\s*"[^"]*"/gi,
      (_m, key: string) => `"${key}":"${REDACTED}"`,
    )
    // key=value / key: value, quoted or bare
    .replace(
      /\b([\w-]*(?:pass|secret|token|auth|cookie|credential|key)[\w-]*)\s*[=:]\s*"?([^\s"',;}]+)"?/gi,
      (_m, key: string) => `${key}=${REDACTED}`,
    )
}

/**
 * Normalise anything thrown into operator text that carries no secret.
 *
 * THE RAW VALUE IS DROPPED, ALWAYS. A provider exception can hold a request
 * object, a config, headers — and preserving it "just for debugging" is exactly
 * how a credential reaches a journal. Only a redacted message survives, and the
 * class name is not kept either: it is provider-specific prose, which v1.2 §8
 * forbids as decision input.
 */
export function describeThrown(thrown: unknown): string {
  if (thrown instanceof Error) return redactText(thrown.message)
  if (typeof thrown === 'string') return redactText(thrown)
  return 'Ospecificerat fel från transportlagret.'
}

export type SessionLogger = (fields: SessionLogFields) => void

/** A logger that discards everything. The default: R1A emits nothing on its own. */
export const silentLogger: SessionLogger = () => {}
