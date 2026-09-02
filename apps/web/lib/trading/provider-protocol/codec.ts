/**
 * Omnira Trading — the protocol codec boundary.
 *
 * A CODEC IS A PURE FUNCTION OVER BYTES, AND NOTHING ELSE
 * ──────────────────────────────────────────────────────
 * It turns a message into frames and frames back into messages. It does not know
 * what a session is, what a role is, whether a failure is worth retrying, or what
 * a canonical reason code is. Every one of those belongs to a layer that has more
 * context, and a codec that reached for one would be deciding policy from the
 * place with the least information.
 *
 * REFUSALS ARE VALUES, NOT EXCEPTIONS
 * ───────────────────────────────────
 * Malformed bytes are a NORMAL protocol outcome — a remote peer, a version skew,
 * a truncated read. `decode` therefore returns a typed refusal and never throws
 * for them. A codec that throws forces the layer above to catch something
 * unclassified and guess what happened, which is precisely the prose-reading this
 * architecture forbids everywhere else.
 *
 * (A throw remains possible for genuine programmer error — a null dereference in
 * codec code. The session treats that as `MALFORMED` and reports it as a fact,
 * because an exception is by definition unclassified.)
 *
 * GENERIC OVER MESSAGES, ON PURPOSE
 * ─────────────────────────────────
 * `Outbound` and `Inbound` are the provider's own types. There is deliberately no
 * universal `messageType`, `requestId`, `sequenceId` or template field here.
 * Inventing one would assert that every protocol has it — and a protocol that
 * does not would have to fake it, which is how a neutral contract quietly becomes
 * one provider's shape.
 */

import type { TransportFrame } from '../provider-runtime'

/**
 * Why a codec refused. Machine-readable, and narrow by design.
 *
 * These are observations about BYTES, never about the session. Nothing here
 * implies retry, severity, or that the link is unhealthy.
 */
export const CODEC_REFUSALS = [
  /** The bytes are not a well-formed frame of this protocol. */
  'MALFORMED',
  /**
   * Well-formed, but this codec does not implement the message.
   *
   * NOT named UNSUPPORTED, deliberately. That word is load-bearing elsewhere in
   * Trading — it is one of the four capability states — and a codec refusal
   * sharing the literal invites exactly the conflation this architecture
   * forbids: "decode returned UNSUPPORTED, so mark the capability UNSUPPORTED".
   * A codec observes bytes. It has no opinion about what a provider supports.
   */
  'UNRECOGNIZED',
  /** A prefix of a frame. The caller may have more bytes coming. */
  'TRUNCATED',
] as const
export type CodecRefusal = (typeof CODEC_REFUSALS)[number]

export type DecodeOutcome<Inbound> =
  | { readonly ok: true; readonly message: Inbound }
  | { readonly ok: false; readonly refusal: CodecRefusal }

export type EncodeOutcome =
  | { readonly ok: true; readonly frame: TransportFrame }
  | { readonly ok: false; readonly refusal: CodecRefusal }

export interface ProtocolCodec<Outbound, Inbound> {
  encode(message: Outbound): EncodeOutcome
  decode(frame: TransportFrame): DecodeOutcome<Inbound>
}

export function decoded<Inbound>(message: Inbound): DecodeOutcome<Inbound> {
  return { ok: true, message }
}

export function decodeRefused<Inbound>(refusal: CodecRefusal): DecodeOutcome<Inbound> {
  return { ok: false, refusal }
}

export function encoded(frame: TransportFrame): EncodeOutcome {
  return { ok: true, frame }
}

export function encodeRefused(refusal: CodecRefusal): EncodeOutcome {
  return { ok: false, refusal }
}
