import { createHash } from 'node:crypto'

export const ENROLLMENT_DOMAIN = 'omnira.code_broker.enrollment.v1' as const
export const REQUEST_DOMAIN = 'omnira.code_broker.request.v1' as const

export function canonicalEnrollmentPayload(input: {
  enrollmentId: string; hostId: string; challenge: string; pairingCode: string
  publicJwk: { kty: 'EC'; crv: 'P-256'; x: string; y: string }; keyThumbprint: string
  algorithm: 'ES256'; protocolVersion: number; brokerVersion: string; buildSha256: string
  hostLabel: string; localUidHash: string; osVersion: string
}): string {
  const field = (value: string) => { if (/\r|\n/.test(value)) throw new Error('canonical field contains newline'); return value }
  return [ENROLLMENT_DOMAIN, `enrollment_id:${input.enrollmentId}`, `host_id:${input.hostId}`,
    `challenge:${input.challenge}`, `pairing_code:${input.pairingCode}`,
    `public_jwk:${JSON.stringify({ crv: input.publicJwk.crv, kty: input.publicJwk.kty, x: input.publicJwk.x, y: input.publicJwk.y })}`,
    `key_thumbprint:${input.keyThumbprint}`, `algorithm:${input.algorithm}`,
    `protocol_version:${input.protocolVersion}`, `broker_version:${input.brokerVersion}`,
    `build_sha256:${input.buildSha256}`, `host_label:${field(input.hostLabel)}`,
    `local_uid_hash:${input.localUidHash}`, `os_version:${field(input.osVersion)}`].join('\n')
}

export function canonicalRequestPayload(input: {
  brokerId: string; hostId: string; protocolVersion: number; brokerVersion: string
  buildSha256: string; counter: number; jti: string; timestamp: string
  method: string; path: string; bodySha256: string
}): string {
  if (!input.path.startsWith('/') || input.path.includes('#')) throw new Error('invalid canonical path')
  const url = new URL(input.path, 'https://canonical.invalid')
  if (`${url.pathname}${url.search}` !== input.path) throw new Error('path is not canonical')
  return [REQUEST_DOMAIN, `protocol_version:${input.protocolVersion}`, `broker_id:${input.brokerId}`,
    `host_id:${input.hostId}`, `broker_version:${input.brokerVersion}`, `build_sha256:${input.buildSha256}`,
    `counter:${input.counter}`, `jti:${input.jti}`, `timestamp:${input.timestamp}`,
    `method:${input.method.toUpperCase()}`, `path:${input.path}`, `body_sha256:${input.bodySha256}`].join('\n')
}

export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex')
