/**
 * lib/media/job/dispatch.ts — deciding what a failed dispatch PROVES.
 *
 * ── THE ONE JUDGEMENT THIS FILE MAKES ──────────────────────────────────────
 * `fetch` rejects for two categories of reason that look identical to a `catch`:
 *
 *   BEFORE any application bytes reach the vendor — DNS did not resolve, the
 *   connection was refused, the TLS handshake failed. Nothing was created, and
 *   nothing was billed.
 *
 *   AFTER the request was written — the socket reset mid-response, the deadline
 *   fired, the body did not parse. The vendor may have accepted the job, started
 *   work, and charged for it.
 *
 * Both surface as `TypeError: fetch failed`. Treating them the same is how a
 * timeout becomes a second paid generation, and it is the exact defect PR9d
 * removed from the workflow drain. So this module classifies, conservatively,
 * and defaults to the ambiguous answer whenever it cannot prove the safe one.
 *
 * ── WHY THE DEFAULT IS "AMBIGUOUS" AND NOT "SAFE" ──────────────────────────
 * The cost of being wrong is asymmetric. Calling an ambiguous failure ambiguous
 * costs an operator one manual check. Calling it safe costs a duplicated paid
 * generation and, worse, an asset nobody knows exists. So the allowlist below is
 * of failures that PROVE no connection carried data, and everything not on it is
 * ambiguous — including failures that are probably harmless.
 *
 * ── WHERE THE STRONGEST SIGNAL COMES FROM ──────────────────────────────────
 * Not from inspecting an error at all: from POSITION. A refusal raised before
 * `fetch` is called — a gate refusal, a missing credential, an unsupported
 * capability, a body that would not serialise — is structurally pre-send, and no
 * error inspection is needed to know it. `classifyTransportFailure` is only for
 * the narrow window in which `fetch` itself throws.
 *
 * PURE: no I/O. It reads an already-thrown value and returns a classification.
 */

import type { DispatchObservation } from '@/lib/workflows/action-outcome'
import type { MediaProviderErrorShape } from '@/lib/media/providers/types'
import type { RemoteOperationId } from './identity'

// ── The dispatch result ──────────────────────────────────────────────────────

/**
 * What one attempted remote creation produced. Four shapes, matching the four
 * genuinely different things that can happen.
 *
 * A discriminated union rather than "a job ref, or an exception": the ambiguous
 * case is not an error condition to be thrown past, it is a RESULT the caller
 * has to persist. Modelling it as a throw is how it ends up in a generic catch
 * beside the failures it must never be confused with.
 */
export type MediaDispatchResult =
  /** A. The vendor accepted it and named it. The remote life begins. */
  | { kind: 'accepted'; remoteOperationId: RemoteOperationId; acceptedAt: string }
  /**
   * B. The provider completed synchronously and handed back the output.
   *
   * MuAPI never does this — `POST /api/v1/{model}` returns a `request_id` and
   * nothing else. The variant exists so that a genuinely synchronous provider
   * does not have to be dressed up as a remote job with an invented id, which
   * would make every reader downstream handle a job that was never a job.
   */
  | { kind: 'completed_inline'; assets: readonly { url: string }[]; completedAt: string }
  /** C. Proven not created: nothing was sent, or the vendor answered no. */
  | { kind: 'definitely_failed'; observation: Extract<DispatchObservation, 'not_dispatched' | 'remote_rejected'>; error: MediaProviderErrorShape }
  /** D. Unknown. A remote operation may exist. NEVER retried automatically. */
  | { kind: 'unknown'; observation: Extract<DispatchObservation, 'response_lost' | 'confirmed_evidence_failed' | 'partially_applied'>; error: MediaProviderErrorShape; detail: string }

/** The observation a dispatch result carries, for the state machine. */
export function observationForDispatch(result: MediaDispatchResult): DispatchObservation {
  switch (result.kind) {
    case 'accepted':          return 'remote_confirmed'
    case 'completed_inline':  return 'remote_confirmed'
    case 'definitely_failed': return result.observation
    case 'unknown':           return result.observation
  }
}

// ── Transport classification ─────────────────────────────────────────────────

/**
 * System error codes that PROVE no application data reached the vendor.
 *
 * Every one of these is raised while establishing the connection, before a
 * single byte of the request body can be written:
 *
 *   ENOTFOUND / EAI_AGAIN     DNS never resolved a host to connect to.
 *   ECONNREFUSED              the peer actively refused the TCP connection.
 *   EHOSTUNREACH/ENETUNREACH  no route existed.
 *   ERR_INVALID_URL           there was nothing to connect to.
 *   TLS failures              the handshake precedes application data entirely.
 *
 * ECONNRESET is deliberately ABSENT. A reset can arrive during the handshake
 * (safe) or after the request was written and while the vendor was working
 * (catastrophic to assume safe), and nothing in the error distinguishes them.
 * ETIMEDOUT is absent for the same reason.
 */
const PROVES_NOT_SENT: readonly string[] = [
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ERR_INVALID_URL',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
]

/** Walk `cause` chains — undici nests the real system error one level down. */
function errorCodes(err: unknown, depth = 0): string[] {
  if (depth > 4 || err === null || typeof err !== 'object') return []
  const rec = err as { code?: unknown; cause?: unknown; errors?: unknown }
  const out: string[] = []
  if (typeof rec.code === 'string') out.push(rec.code)
  if (rec.cause !== undefined) out.push(...errorCodes(rec.cause, depth + 1))
  // `AggregateError` from a happy-eyeballs connect attempt carries per-address
  // failures; every one of them is a connect failure, so all are safe.
  if (Array.isArray(rec.errors)) {
    for (const e of rec.errors) out.push(...errorCodes(e, depth + 1))
  }
  return out
}

export type TransportVerdict =
  /** Proven: the request never reached the vendor. */
  | { sent: false; code: string }
  /** Not proven. The vendor may have received, accepted and started the work. */
  | { sent: 'unknown'; detail: string }

/**
 * Did this thrown `fetch` failure leave the machine?
 *
 * Answers `false` only on positive proof; `'unknown'` otherwise. There is no
 * `true` — a fetch that threw never produced a response, so "definitely sent AND
 * definitely received" is not a state this function can observe.
 */
export function classifyTransportFailure(err: unknown): TransportVerdict {
  const codes = errorCodes(err)
  const proof = codes.find(c => PROVES_NOT_SENT.includes(c))
  if (proof) return { sent: false, code: proof }

  // An abort is the single most dangerous case to guess about: the deadline
  // fires on OUR side, and the vendor has usually already received the request.
  const name = err instanceof Error ? err.name : ''
  if (name === 'AbortError' || name === 'TimeoutError' || codes.includes('ABORT_ERR')) {
    return { sent: 'unknown', detail: 'the dispatch deadline fired; the provider may have accepted the request' }
  }

  return {
    sent: 'unknown',
    detail: codes.length > 0
      ? `transport failed after the connection was established (${codes.join(', ')})`
      : 'transport failed without a code that proves the request was never sent',
  }
}

/**
 * Does an HTTP status the vendor ACTUALLY RETURNED prove no job was created?
 *
 * 4xx — including 429 — is the vendor answering. It parsed the request, decided
 * against it, and did no work. Safe.
 *
 * 5xx is NOT safe, and this is the branch most likely to be "simplified" later.
 * A 502 or 504 is usually produced by a gateway IN FRONT of the service; the
 * service behind it may have accepted the job, enqueued it and begun billing
 * before the gateway gave up waiting. The status therefore proves only that
 * something between Omnira and the work failed, which is exactly UNKNOWN.
 */
export function statusProvesNotCreated(status: number): boolean {
  return status >= 400 && status < 500
}
