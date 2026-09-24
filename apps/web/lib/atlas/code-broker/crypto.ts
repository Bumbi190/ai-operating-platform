import 'server-only'

import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto'
import { canonicalPublicJwk } from './protocol'
import type { BrokerPublicJwk } from './types'

const B64URL_32 = /^[A-Za-z0-9_-]{43}$/

export function normalizePublicJwk(value: unknown): BrokerPublicJwk | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join(',') !== 'crv,kty,x,y') return null
  if (record.kty !== 'EC' || record.crv !== 'P-256') return null
  if (typeof record.x !== 'string' || typeof record.y !== 'string') return null
  if (!B64URL_32.test(record.x) || !B64URL_32.test(record.y)) return null
  try {
    if (Buffer.from(record.x, 'base64url').length !== 32 || Buffer.from(record.y, 'base64url').length !== 32) return null
    createPublicKey({ key: record as unknown as import('node:crypto').JsonWebKey, format: 'jwk' })
  } catch {
    return null
  }
  return { kty: 'EC', crv: 'P-256', x: record.x, y: record.y }
}

export function publicJwkThumbprint(jwk: BrokerPublicJwk): string {
  return createHash('sha256').update(canonicalPublicJwk(jwk)).digest('base64url')
}

export function constantTimeTextEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function verifyEs256(jwk: BrokerPublicJwk, payload: string, signature: string): boolean {
  try {
    const decoded = Buffer.from(signature, 'base64url')
    if (decoded.length < 8 || decoded.length > 80) return false
    const key = createPublicKey({ key: jwk as unknown as import('node:crypto').JsonWebKey, format: 'jwk' })
    return verify('sha256', Buffer.from(payload, 'utf8'), { key, dsaEncoding: 'der' }, decoded)
  } catch {
    return false
  }
}
