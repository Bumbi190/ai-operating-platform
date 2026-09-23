import { createHash } from 'node:crypto'
import type { BrokerPublicJwk, EnrollmentProof, SignedBrokerRequestHeaders } from './types'

export const ENROLLMENT_DOMAIN = 'omnira.code_broker.enrollment.v1' as const
export const REQUEST_DOMAIN = 'omnira.code_broker.request.v1' as const

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export function brokerEnrollmentSecretHash(kind: 'challenge' | 'pairing', enrollmentId: string, secret: string): string {
  return sha256Hex(`omnira.code_broker.${kind}.v1\n${enrollmentId}\n${secret}`)
}

export function canonicalEnrollmentPayload(proof: Omit<EnrollmentProof, 'signature'>): string {
  return [
    ENROLLMENT_DOMAIN,
    `enrollment_id:${proof.enrollmentId}`,
    `host_id:${proof.hostId}`,
    `challenge:${proof.challenge}`,
    `pairing_code:${proof.pairingCode}`,
    `public_jwk:${canonicalPublicJwk(proof.publicJwk)}`,
    `key_thumbprint:${proof.keyThumbprint}`,
    `algorithm:${proof.algorithm}`,
    `protocol_version:${proof.protocolVersion}`,
    `broker_version:${proof.brokerVersion}`,
    `build_sha256:${proof.buildSha256}`,
    `host_label:${field(proof.hostLabel)}`,
    `local_uid_hash:${proof.localUidHash}`,
    `os_version:${field(proof.osVersion)}`,
  ].join('\n')
}

export function canonicalRequestPayload(input: Omit<SignedBrokerRequestHeaders, 'signature'> & {
  method: string
  path: string
  bodySha256: string
}): string {
  return [
    REQUEST_DOMAIN,
    `protocol_version:${input.protocolVersion}`,
    `broker_id:${input.brokerId}`,
    `host_id:${input.hostId}`,
    `broker_version:${input.brokerVersion}`,
    `build_sha256:${input.buildSha256}`,
    `counter:${input.counter}`,
    `jti:${input.jti}`,
    `timestamp:${input.timestamp}`,
    `method:${input.method.toUpperCase()}`,
    `path:${canonicalPath(input.path)}`,
    `body_sha256:${input.bodySha256}`,
  ].join('\n')
}

export function canonicalPublicJwk(jwk: BrokerPublicJwk): string {
  return JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })
}

export function canonicalPath(path: string): string {
  if (!path.startsWith('/') || path.includes('#')) throw new Error('invalid canonical path')
  const url = new URL(path, 'https://canonical.invalid')
  if (`${url.pathname}${url.search}` !== path) throw new Error('path is not canonical')
  return path
}

function field(value: string): string {
  if (/\r|\n/.test(value)) throw new Error('canonical field contains newline')
  return value
}
