/**
 * SDF-1C1B — the claim-scoped broker credential (server side only).
 *
 * ONE opaque credential per claim. The RAW token is 32 random bytes as
 * unpadded base64url (43 characters) and exists only in the memory of the trusted
 * server-side caller that issued it, and later in the broker that was handed it.
 * It is never stored, logged, receipted, rendered or returned by a run read.
 * Postgres persists only `brokerClaimTokenHash`, a domain-separated SHA-256 of the
 * token bound to the work id. The security comes from the 256-bit entropy of the
 * token; SHA-256 is only the storage transform.
 *
 * THIS IS NOT AUTHORITY. A valid token is possession evidence for a claim that the
 * SQL boundary already authorised (live Authorization V1, claimable state, not
 * cancelled, within the runtime cap). It can never cause a claim to exist. Device
 * identity, claim credential and authority are three separate things.
 *
 * No route, CLI command or store read exposes this module. Phase 1C2 will verify
 * a presented token at an authenticated broker boundary.
 */

import 'server-only'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const BROKER_CLAIM_TOKEN_DOMAIN = 'omnira.code_work.broker_claim_token.v1' as const
export const BROKER_CLAIM_TOKEN_BYTES = 32
export const BROKER_CLAIM_TOKEN_LENGTH = 43

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const TOKEN_HASH = /^[a-f0-9]{64}$/

export interface BrokerClaimCredential {
  /** RAW secret. Hand it to the claiming broker and drop it; never persist or log it. */
  token: string
  /** The only form that may cross into the database. */
  tokenHash: string
}

/** Closed format: exactly the canonical unpadded base64url of 32 bytes. */
export function isBrokerClaimToken(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== BROKER_CLAIM_TOKEN_LENGTH) return false
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false
  const bytes = Buffer.from(value, 'base64url')
  return bytes.length === BROKER_CLAIM_TOKEN_BYTES && bytes.toString('base64url') === value
}

export function isBrokerClaimTokenHash(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_HASH.test(value)
}

function normalizedWorkId(workId: unknown): string {
  const id = typeof workId === 'string' ? workId.toLowerCase() : ''
  if (!UUID.test(id)) throw new Error('invalid code-work id for claim credential')
  return id
}

/** sha256("omnira.code_work.broker_claim_token.v1\n" + workId + "\n" + token), lowercase hex. */
export function brokerClaimTokenHash(workId: string, token: string): string {
  const id = normalizedWorkId(workId)
  if (!isBrokerClaimToken(token)) throw new Error('invalid broker claim token')
  return createHash('sha256').update(`${BROKER_CLAIM_TOKEN_DOMAIN}\n${id}\n${token}`).digest('hex')
}

/** Issue a fresh credential for one claim. `random` is injectable for tests only. */
export function issueBrokerClaimCredential(
  workId: string,
  random: (size: number) => Buffer = randomBytes,
): BrokerClaimCredential {
  const bytes = random(BROKER_CLAIM_TOKEN_BYTES)
  if (!Buffer.isBuffer(bytes) || bytes.length !== BROKER_CLAIM_TOKEN_BYTES) {
    throw new Error('broker claim credential entropy source returned the wrong size')
  }
  const token = bytes.toString('base64url')
  return { token, tokenHash: brokerClaimTokenHash(workId, token) }
}

/**
 * Does `token` match the stored hash for this work id? Fails CLOSED: a malformed
 * work id, token or stored hash is simply `false`, never an exception and never a
 * partial comparison. The final comparison is constant-time.
 */
export function brokerClaimTokenMatches(workId: string, token: unknown, expectedHash: unknown): boolean {
  if (!isBrokerClaimToken(token) || !isBrokerClaimTokenHash(expectedHash)) return false
  let actual: string
  try { actual = brokerClaimTokenHash(workId, token) } catch { return false }
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expectedHash, 'hex'))
}
