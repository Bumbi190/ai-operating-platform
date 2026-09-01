/**
 * Omnira Trading — how a connectivity failure is named, and what it may claim.
 *
 * WHY A RUNTIME-LOCAL VOCABULARY
 * ──────────────────────────────
 * Trading Core's `ReasonCode` list is canon: `reason-codes.ts` states that codes
 * are stable and version-controlled, and that renaming one breaks every
 * historical journal row that used it. Adding `CONNECTION_FAILED` and friends to
 * that list would be a canonical-vocabulary change, and no locked specification
 * asks for one.
 *
 * But the canon also has no connectivity codes. The only ones that touch this
 * area are `PROVIDER_DISCONNECTED`, `ENVIRONMENT_MISMATCH`, `ENVIRONMENT_UNKNOWN`
 * and `SECURITY_DEGRADED` — none of which distinguishes "the socket never
 * opened" from "we authenticated and were then dropped".
 *
 * So the runtime names its own failures precisely, and translates them into the
 * canonical vocabulary at exactly one place: `reasonCodeOf`. The precise name
 * stays inside the runtime where it drives reconnect decisions; the canonical
 * code is what leaves the boundary. Nothing downstream ever sees a code Trading
 * Core does not already recognise.
 *
 * The translation is deliberately LOSSY AND CONSERVATIVE. Several distinct
 * runtime failures collapse onto `PROVIDER_DISCONNECTED`, because that is the
 * honest canonical statement available. That loss is recorded here rather than
 * hidden, and it is the reason the canon gap is worth closing later.
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
 * Total over the union — the `never` default makes a new failure a compile
 * error here rather than an untranslated one at runtime.
 *
 * `AUTH_FAILED` → `SECURITY_DEGRADED` IS A TEMPORARY COMPATIBILITY MAPPING, NOT
 * A SEMANTIC EQUIVALENCE. `SECURITY_DEGRADED` does not mean "credentials were
 * rejected"; it is simply the least wrong code the canon currently offers for a
 * failure that happened over a transport that was demonstrably up. Reporting a
 * refused credential as `PROVIDER_DISCONNECTED` would describe the wrong event
 * to an operator reading a journal, so the mapping is the better of two
 * imperfect options and nothing more.
 *
 * The same caveat applies to everything collapsing onto `PROVIDER_DISCONNECTED`:
 * it is a conservative placeholder, not a claim that those failures are alike.
 *
 * The canonical vocabulary gap is OPEN and is scheduled to be closed by a
 * separate authorised amendment (R1A.1 — Connectivity Reason Codes) before any
 * provider integration depends on these codes. Nothing here should be read as
 * final canonical semantics.
 */
export function reasonCodeOf(failure: SessionFailure): ReasonCode {
  switch (failure) {
    case 'CONNECT_FAILED':
    case 'CONNECTION_LOST':
    case 'HEARTBEAT_TIMEOUT':
    case 'PROTOCOL_ERROR':
    case 'REMOTE_REJECTED':
    case 'CANCELLED':
    case 'RECONNECT_EXHAUSTED':
    case 'UNKNOWN':
      return 'PROVIDER_DISCONNECTED'
    case 'AUTH_FAILED':
      return 'SECURITY_DEGRADED'
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
