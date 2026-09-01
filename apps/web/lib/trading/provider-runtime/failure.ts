/**
 * Omnira Trading — how a connectivity failure is named, and what it may claim.
 *
 * TWO VOCABULARIES, ONE TRANSLATION
 * ─────────────────────────────────
 * `SessionFailure` is runtime-internal: it is what the reconnect policy reasons
 * about. `ReasonCode` is canon: it is what leaves the boundary and lands in a
 * journal row that must still mean the same thing years later.
 *
 * Since Provider Connectivity Reason Codes Canonical v1.0 the translation
 * between them is LOSSLESS AND 1:1 — every runtime failure has exactly one
 * canonical code, and no two share one. `reasonCodeOf` is the single door.
 *
 * SUPERSEDED — HISTORICAL NOTE ONLY. R1A shipped a deliberately lossy mapping:
 * seven failures collapsed onto `PROVIDER_DISCONNECTED` and `AUTH_FAILED` was
 * reported as `SECURITY_DEGRADED`, because the canon had no connectivity codes
 * and inventing them locally would have been a vocabulary change no
 * specification authorised. That compatibility mapping was always marked
 * temporary and is now removed. `SECURITY_DEGRADED` never meant "credentials
 * refused" — v1.2 §8 defines it as a credential broader than requested — and it
 * no longer appears here at all.
 */

import type { ReasonCode } from '../reason-codes'
import type { ProviderError } from '../provider'

/**
 * Why a session attempt or an established session ended.
 *
 * Runtime-internal. These names never appear in a `ProviderError` and never
 * reach a journal — they exist so the reconnect policy can tell apart the cases
 * that deserve another attempt from the ones that never will.
 */
export const SESSION_FAILURES = [
  /** The transport never opened. */
  'CONNECT_FAILED',
  /** The transport opened; the provider refused the credentials. */
  'AUTH_FAILED',
  /** An established session's transport went away without being asked to. */
  'CONNECTION_LOST',
  /** No inbound liveness within the policy's window. */
  'HEARTBEAT_TIMEOUT',
  /** A message arrived that the codec could not honour. */
  'PROTOCOL_ERROR',
  /** The provider explicitly ended the session. */
  'REMOTE_REJECTED',
  /** The operator asked to stop. NOT a fault, and never retried. */
  'CANCELLED',
  /** The reconnect budget ran out. */
  'RECONNECT_EXHAUSTED',
  /** Something failed that the runtime cannot classify. Never guessed at. */
  'UNKNOWN',
] as const
export type SessionFailure = (typeof SESSION_FAILURES)[number]

/**
 * Failures that reconnecting could plausibly fix.
 *
 * FAIL-CLOSED BY CONSTRUCTION: this is an allow-list, so a failure added to the
 * union later is NOT retried until someone decides it should be. The opposite
 * shape — a deny-list — would silently grant retries to every future failure,
 * including ones that mean "your configuration is wrong" and will fail forever.
 */
const RETRIABLE: ReadonlySet<SessionFailure> = new Set<SessionFailure>([
  'CONNECT_FAILED',
  'CONNECTION_LOST',
  'HEARTBEAT_TIMEOUT',
])

export function isRetriable(failure: SessionFailure): boolean {
  return RETRIABLE.has(failure)
}

/**
 * The canonical code a runtime failure is reported as.
 *
 * TOTAL AND INJECTIVE. Total because the `never` default makes a new
 * `SessionFailure` a compile error here rather than an untranslated one at
 * runtime. Injective because each canonical code is claimed by exactly one
 * failure — a test asserts it, so a copy-paste that pointed two failures at one
 * code would fail rather than silently re-introduce the collapse this mapping
 * was written to remove.
 *
 * NOTE WHAT IS ABSENT. No branch here consults a retry policy, a severity, or
 * anything about what the caller should do next. `PROVIDER_CONNECTION_LOST`
 * does not mean "retry"; `isRetriable` answers that, separately, and stays a
 * runtime concern rather than a property frozen into a canonical value.
 */
export function reasonCodeOf(failure: SessionFailure): ReasonCode {
  switch (failure) {
    case 'CONNECT_FAILED':
      return 'PROVIDER_CONNECT_FAILED'
    case 'AUTH_FAILED':
      return 'PROVIDER_AUTHENTICATION_FAILED'
    case 'CONNECTION_LOST':
      return 'PROVIDER_CONNECTION_LOST'
    case 'HEARTBEAT_TIMEOUT':
      return 'PROVIDER_HEARTBEAT_TIMEOUT'
    case 'PROTOCOL_ERROR':
      return 'PROVIDER_PROTOCOL_ERROR'
    case 'REMOTE_REJECTED':
      return 'PROVIDER_REMOTE_REJECTED'
    case 'CANCELLED':
      /*
       * A stop the operator asked for. Machine-readable context, not an error
       * escalation: it implies no unhealthy provider, no rejection, and no
       * security weakening, and on its own it triggers nothing.
       */
      return 'PROVIDER_SESSION_CANCELLED'
    case 'RECONNECT_EXHAUSTED':
      return 'PROVIDER_RECONNECT_EXHAUSTED'
    case 'UNKNOWN':
      /*
       * FAIL-CLOSED INFORMATIONAL TRUTH. We know a connectivity failure
       * happened and we do not know which kind. It is never promoted into a
       * more specific code by inference, and never by reading prose — a guessed
       * category is worse than an honest absence, because it is indistinguishable
       * from an observed one once it reaches a journal.
       */
      return 'PROVIDER_FAILURE_UNKNOWN'
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
}

/**
 * Build the error that crosses the provider boundary.
 *
 * `message` is operator text, and the caller is responsible for it having been
 * through `redaction`. Nothing here carries a provider object, a stack, a raw
 * payload or a credential — v1.2 §8 forbids provider-specific strings as
 * decision input, and a raw object is the easiest way to smuggle one in.
 */
export function sessionError(failure: SessionFailure, message: string): ProviderError {
  return { reasonCode: reasonCodeOf(failure), message }
}

// ─── Authentication outcome ───────────────────────────────────────────────────

/**
 * The failures an authentication step is permitted to report.
 *
 * A SUBSET, ENFORCED BY THE TYPE. An auth step cannot claim `CONNECT_FAILED`
 * (the transport is demonstrably up by then) or `HEARTBEAT_TIMEOUT` (no
 * heartbeat is running yet) or `RECONNECT_EXHAUSTED` (a budget is not the auth
 * step's business). Narrowing here means the runtime does not have to defend
 * against outcomes that cannot legitimately occur.
 */
export type AuthenticationFailure = Extract<
  SessionFailure,
  'AUTH_FAILED' | 'REMOTE_REJECTED' | 'PROTOCOL_ERROR' | 'CANCELLED'
>

/**
 * What an injected authentication step returns.
 *
 * WHY NOT A BOOLEAN. `false` collapses four genuinely different outcomes into
 * one: a credential the provider refused, a remote that rejected the session for
 * its own reasons, a frame the codec could not decode, and a stop the operator
 * asked for. Those want different responses — one is worth retrying, one is not,
 * one is a bug, one is not a fault at all — and a boolean forces the runtime to
 * either treat them identically or go looking for the difference in prose.
 *
 * Machine-readable only. `failure` is a closed union; there is no message, no
 * provider code, no payload and nowhere to put a credential.
 */
export type AuthenticationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: AuthenticationFailure }

export const authenticated: AuthenticationResult = { ok: true }

export function authenticationFailed(failure: AuthenticationFailure): AuthenticationResult {
  return { ok: false, failure }
}
