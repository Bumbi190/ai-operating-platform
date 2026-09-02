/**
 * Omnira Trading — a synthetic protocol, owned entirely by Omnira.
 *
 * EVERY BYTE HERE IS INVENTED FOR TESTING
 * ───────────────────────────────────────
 * This is not a sketch of any provider's wire format, and it is not derived from
 * any SDK, sample or capture. It is a JSON-over-UTF-8 toy with three message
 * kinds, chosen because they are the smallest thing that can exercise a codec, a
 * correlation key, and an authentication exchange.
 *
 * The message names are deliberately generic — HELLO / ACCEPT / REJECT — so that
 * no test vocabulary can be mistaken for a protocol fact, and so nothing here
 * leaks into a production contract.
 */

import type { TransportFrame } from '../provider-runtime'
import {
  decodeRefused,
  decoded,
  encodeRefused,
  encoded,
  type ProtocolCodec,
} from './codec'

/** Outbound: what a test client sends. */
export interface FakeOutbound {
  readonly kind: 'HELLO'
  readonly id: number
  /** Present only while being encoded; never retained anywhere. */
  readonly proof?: string
}

/** Inbound: what a test server answers, or pushes unsolicited. */
export type FakeInbound =
  | { readonly kind: 'ACCEPT'; readonly id: number }
  | { readonly kind: 'REJECT'; readonly id: number; readonly why: FakeRejection }
  | { readonly kind: 'NOTICE' }

/**
 * Why a synthetic server refused.
 *
 * Machine-readable, and distinct enough that each maps to a different member of
 * R1A's `AuthenticationFailure` — so the composition test proves the mapping is
 * made from a FIELD, never by parsing prose.
 */
export const FAKE_REJECTIONS = ['BAD_PROOF', 'REFUSED', 'MALFORMED'] as const
export type FakeRejection = (typeof FAKE_REJECTIONS)[number]

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** The correlation key of an inbound message, or null when unsolicited. */
export function fakeCorrelationKey(message: FakeInbound): number | null {
  return message.kind === 'NOTICE' ? null : message.id
}

export function createFakeCodec(): ProtocolCodec<FakeOutbound, FakeInbound> {
  return {
    encode(message) {
      if (message.kind !== 'HELLO') return encodeRefused('UNRECOGNIZED')
      return encoded(encoder.encode(JSON.stringify(message)))
    },

    decode(frame) {
      let text: string
      try {
        text = decoder.decode(frame)
      } catch {
        return decodeRefused('MALFORMED')
      }
      // A refusal is a VALUE here, exactly as the contract requires.
      if (text.length === 0) return decodeRefused('TRUNCATED')

      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        return decodeRefused('MALFORMED')
      }
      if (typeof parsed !== 'object' || parsed === null) return decodeRefused('MALFORMED')

      const candidate = parsed as Record<string, unknown>
      if (candidate.kind === 'NOTICE') return decoded({ kind: 'NOTICE' })
      if (typeof candidate.id !== 'number') return decodeRefused('MALFORMED')
      if (candidate.kind === 'ACCEPT') return decoded({ kind: 'ACCEPT', id: candidate.id })
      if (candidate.kind === 'REJECT') {
        const why = candidate.why
        if (why !== 'BAD_PROOF' && why !== 'REFUSED' && why !== 'MALFORMED') {
          return decodeRefused('MALFORMED')
        }
        return decoded({ kind: 'REJECT', id: candidate.id, why })
      }
      return decodeRefused('UNRECOGNIZED')
    },
  }
}

/** Build a synthetic inbound frame, as a test server would. */
export function fakeFrame(message: FakeInbound): TransportFrame {
  return encoder.encode(JSON.stringify(message))
}

/** Bytes that are not this protocol at all. */
export function garbageFrame(): TransportFrame {
  return new Uint8Array([0x7b, 0x7b, 0x7b])
}
