/**
 * lib/media/providers/errors.ts — typed media-provider failures and the
 * redaction that keeps credentials out of every one of them.
 *
 * WHY REDACTION LIVES ON THE ERROR PATH AND NOT AT THE LOG CALL. The Meta
 * incident recorded in `lib/media/meta-errors.ts` is the precedent: a Facebook
 * error message carried a full access token into the logs because the token was
 * in the URL the SDK echoed back, and every individual log call had been
 * written assuming the message was already safe. The fix there was to redact in
 * the error CONSTRUCTOR, so anything that catches the error and prints
 * `err.message` is safe without knowing it needs to be. This module keeps that
 * property: `MediaProviderError` redacts in its constructor, so there is no
 * "remember to redact" step anywhere downstream.
 *
 * `redactMediaSecrets` composes with `redactSecrets` from meta-errors rather
 * than replacing it — the Meta token literals it strips are still worth
 * stripping, and one redactor that both subsystems extend beats two that drift.
 */

import { redactSecrets } from '../meta-errors'
import { resolveMuapiCredential, type EnvSource } from './config'
import type {
  MediaProviderErrorCode,
  MediaProviderErrorShape,
  MediaProviderId,
} from './types'

// ── Redaction ────────────────────────────────────────────────────────────────

/**
 * Strip provider credentials from arbitrary text.
 *
 * Three layers, weakest to strongest:
 *   1. Header/param FORMS — `x-api-key: …`, `api_key=…`, `"apiKey":"…"`. Catches
 *      a leaked credential even when it belongs to a provider we never
 *      configured, and even when it is a shape we have never seen.
 *   2. Meta's existing literals, via `redactSecrets`.
 *   3. The LIVE credential literal, matched exactly. This is the backstop for
 *      the case the forms miss — a vendor echoing the bare key with no
 *      surrounding syntax. Reading the credential here is deliberate and
 *      contained: this function only ever REMOVES it from a string, and is the
 *      one place outside the adapter that touches it.
 */
export function redactMediaSecrets(input: string, env: EnvSource = process.env): string {
  let out = redactSecrets(input)

  out = out
    .replace(/(x-api-key\s*[:=]\s*)["']?[^\s"',&}]+/gi, '$1[REDACTED]')
    .replace(/(\bapi[_-]?key\b\s*[:=]\s*)["']?[^\s"',&}]+/gi, '$1[REDACTED]')
    .replace(/("api[_-]?key"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2')

  // Layer 3 — exact literal. Only runs when a credential is actually resolved,
  // and never reveals whether one was: the output is identical either way
  // unless the secret was genuinely present in the input.
  const live = resolveMuapiCredential(env)
  if (live && live.length >= 8) {
    out = out.split(live).join('[REDACTED]')
  }

  return out
}

/** Recursively redact every string in a structure, and drop secret-ish keys. */
export function redactMediaDeep<T>(value: T, env: EnvSource = process.env): T {
  if (typeof value === 'string') return redactMediaSecrets(value, env) as unknown as T
  if (Array.isArray(value)) return value.map(v => redactMediaDeep(v, env)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /key|token|secret|authorization|password/i.test(k)
        ? '[REDACTED]'
        : redactMediaDeep(v, env)
    }
    return out as unknown as T
  }
  return value
}

// ── The error ────────────────────────────────────────────────────────────────

/**
 * HTTP statuses worth retrying. Mirrors the reasoning in `lib/media/retry.ts`:
 * 429 and 5xx are transient, other 4xx are the caller's fault and will fail
 * identically on a retry. 0 means the request never got a response (network).
 */
function retryableForStatus(status: number | null): boolean {
  if (status === null) return false
  if (status === 0) return true
  if (status === 429) return true
  return status >= 500
}

export class MediaProviderError extends Error {
  readonly code: MediaProviderErrorCode
  readonly provider: MediaProviderId | null
  readonly httpStatus: number | null
  readonly retryable: boolean

  constructor(opts: {
    code: MediaProviderErrorCode
    message: string
    provider?: MediaProviderId | null
    httpStatus?: number | null
    /** Override the status-derived default. Gate refusals are never retryable. */
    retryable?: boolean
  }) {
    // Redacted here, in the constructor, so every downstream `err.message` is
    // safe without the catch site having to know that.
    super(redactMediaSecrets(opts.message))
    this.name = 'MediaProviderError'
    this.code = opts.code
    this.provider = opts.provider ?? null
    this.httpStatus = opts.httpStatus ?? null
    this.retryable = opts.retryable ?? retryableForStatus(this.httpStatus)
  }

  /** Serializable form — safe for logs, DB columns, and API responses. */
  toShape(): MediaProviderErrorShape {
    return {
      code: this.code,
      message: this.message,
      provider: this.provider,
      httpStatus: this.httpStatus,
      retryable: this.retryable,
    }
  }
}

/**
 * Classify a vendor HTTP failure into a typed code.
 *
 * Auth failures are separated from everything else because they are the one
 * class that a retry can never fix and that an operator must act on — the same
 * split `classifyAnthropicError` makes in `lib/atlas/provider-errors.ts`.
 */
export function classifyHttpFailure(status: number, body: string): MediaProviderErrorCode {
  if (status === 401 || status === 403) return 'MEDIA_PROVIDER_AUTHENTICATION_FAILED'
  if (/invalid\s*api[\s_-]*key|unauthorized|authentication/i.test(body)) {
    return 'MEDIA_PROVIDER_AUTHENTICATION_FAILED'
  }
  return 'MEDIA_PROVIDER_REQUEST_FAILED'
}

/** Wrap any thrown value as a typed, redacted provider error. */
export function toMediaProviderError(
  err: unknown,
  provider: MediaProviderId,
  fallbackCode: MediaProviderErrorCode = 'MEDIA_PROVIDER_REQUEST_FAILED',
): MediaProviderError {
  if (err instanceof MediaProviderError) return err
  const message = err instanceof Error ? err.message : String(err)
  return new MediaProviderError({
    code: fallbackCode,
    message,
    provider,
    // A thrown non-HTTP error is almost always a network/abort failure, which
    // `retry.ts` already treats as transient.
    httpStatus: 0,
  })
}
