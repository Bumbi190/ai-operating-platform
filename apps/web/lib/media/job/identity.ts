/**
 * lib/media/job/identity.ts — the five identities an async generation has, kept
 * apart by the compiler.
 *
 * ── THE CONFLATION THIS PREVENTS ────────────────────────────────────────────
 * An asynchronous generation accumulates identifiers from three different
 * authorities, and every one of them is a `string`:
 *
 *   MediaJobId          OMNIRA mints it, before any network call. The durable
 *                       handle. Stable even when the remote state is unknown.
 *   RemoteOperationId   THE VENDOR mints it. Opaque, echoed back, never parsed.
 *   AssetId             THE DATABASE mints it, at admission (Phase 1, §21.4).
 *   orchestration id    the caller's request correlation (Phase 2 `brief`).
 *   reservation id      the spend boundary's (`lib/cost/governed-spend.ts`).
 *
 * Canon §21.4 already forbids one of these collapses — "Output identity and
 * Asset identity shall remain distinct" — and §21.7 forbids letting a location
 * serve as an identity. This module extends the same discipline to the remote
 * operation, because a provider-supplied string is the one identifier in the
 * list that an ATTACKER may influence.
 *
 * ── WHY THE LOCAL ID EXISTS AT ALL ─────────────────────────────────────────
 * It would be tempting to key a media job on the vendor's `request_id`. That
 * fails in exactly the case the whole phase is about: when the dispatch response
 * is lost there IS no vendor id, and the job still has to be recorded — a job
 * Omnira cannot name is a job Omnira cannot reconcile, and an unreconcilable
 * paid generation is the failure this design exists to make impossible.
 *
 * So the local id is minted BEFORE dispatch and is never derived from anything
 * the vendor says.
 *
 * PURE by construction: no I/O, no clock beyond `crypto.randomUUID`, no database.
 */

import type { AssetId } from '@/lib/media/asset/types'

// ── The local canonical identity ─────────────────────────────────────────────

/**
 * Omnira's own handle on one attempted remote operation.
 *
 * Branded for the same reason `AssetId` is: so that a vendor request id, a URL,
 * or a storage path cannot be passed where a job identity is required. The
 * compiler catches it instead of a reviewer.
 */
export type MediaJobId = string & { readonly __brand: 'MediaJobId' }

/** Narrow a raw uuid from the database into a `MediaJobId`. */
export function asMediaJobId(raw: string): MediaJobId {
  return raw as MediaJobId
}

/**
 * Mint a fresh local identity.
 *
 * Called BEFORE dispatch, always. That ordering is the load-bearing part: a job
 * row keyed on this id can be written before the network is touched, so a lost
 * response leaves a record rather than silence.
 */
export function newMediaJobId(): MediaJobId {
  return crypto.randomUUID() as MediaJobId
}

// ── The vendor's identity ────────────────────────────────────────────────────

/**
 * The provider's own operation handle, verbatim.
 *
 * Branded separately from `MediaJobId` so the two can never be swapped, and
 * deliberately NOT a uuid type: MuAPI's `request_id` is an opaque vendor string
 * whose format is not part of any contract Omnira can rely on.
 */
export type RemoteOperationId = string & { readonly __brand: 'RemoteOperationId' }

/**
 * The bound on a remote id. Not a format claim — a denial-of-service bound.
 *
 * A provider (or anything impersonating one) that answers with a megabyte-long
 * "id" must not be able to put that megabyte into a database column, a log line,
 * or a URL path. 200 is far above any plausible vendor id and far below anything
 * that matters.
 */
export const MAX_REMOTE_OPERATION_ID_LENGTH = 200

/**
 * The character class a remote id must fall inside to be USABLE by Omnira.
 *
 * Deliberately conservative — alphanumerics, dash, underscore, dot, colon. This
 * is not an attempt to guess MuAPI's id format; it is the set of characters that
 * are safe in every place the id subsequently travels:
 *
 *   • a URL path segment      (`/api/v1/predictions/{id}/result`)
 *   • a log line              (no newlines, no ANSI, no control characters)
 *   • a database text column  (no NUL)
 *   • a structured audit field
 *
 * A `/` or a `..` would let a vendor response steer the status endpoint the
 * adapter builds — which is the SSRF-shaped half of "the caller must never
 * supply a status URL". `encodeURIComponent` already defends the path, so this
 * is the second, independent layer, and it refuses rather than escapes: an id
 * that needs escaping is an id Omnira does not understand.
 */
const REMOTE_OPERATION_ID_SHAPE = /^[A-Za-z0-9._:-]+$/

export type RemoteOperationIdRefusal =
  | 'not_a_string'
  | 'empty'
  | 'too_long'
  | 'unsafe_characters'

/**
 * Accept a provider-supplied operation id, or refuse it with a reason.
 *
 * Returns a result rather than throwing because the CALLER's reaction depends on
 * where the id came from: a malformed id in a dispatch response is an ambiguous
 * dispatch (the job may exist remotely under an id we cannot use), while a
 * malformed id anywhere else is simply invalid input. Collapsing both into a
 * throw would lose that distinction at exactly the point it matters most.
 */
export function acceptRemoteOperationId(
  raw: unknown,
): { ok: true; id: RemoteOperationId } | { ok: false; refusal: RemoteOperationIdRefusal } {
  if (typeof raw !== 'string') return { ok: false, refusal: 'not_a_string' }
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: false, refusal: 'empty' }
  if (trimmed.length > MAX_REMOTE_OPERATION_ID_LENGTH) return { ok: false, refusal: 'too_long' }
  if (!REMOTE_OPERATION_ID_SHAPE.test(trimmed)) return { ok: false, refusal: 'unsafe_characters' }
  return { ok: true, id: trimmed as RemoteOperationId }
}

// ── The separation, made unavailable rather than merely forbidden ────────────

/**
 * Structural proof that a remote id can never become an asset identity.
 *
 * There is deliberately NO function in this module that converts a
 * `RemoteOperationId` into an `AssetId` or into a storage path. The type below
 * exists so that the ABSENCE is testable: a future change that adds such a
 * conversion has to change this declaration, which a reviewer sees.
 *
 * The runtime guarantee lives one layer down and is stronger than any type:
 * `lib/media/asset/admission.ts` mints the asset id in the DATABASE and derives
 * the bucket from `visibility`, so a provider has no argument it could pass that
 * would name either. This is the compile-time echo of that fact, not a
 * replacement for it.
 */
export type RemoteOperationIdIsNeverAnAssetId =
  RemoteOperationId extends AssetId ? never : true

/**
 * A remote id is safe to RECORD, and never safe to ROUTE ON.
 *
 * Provenance keeps it (`asset_provenance.provider_request_id`) so an asset can
 * be traced back to the generation that produced it. Nothing reads it back to
 * decide where bytes live, which project owns them, or who may see them — those
 * are Omnira's decisions and are made from Omnira's own state.
 */
export function remoteOperationIdForProvenance(id: RemoteOperationId | null): string | null {
  return id
}
