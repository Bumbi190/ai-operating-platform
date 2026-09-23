import 'server-only'

import { brokerBuildAccepted, configuredBrokerBuildPolicy, type BrokerBuildPolicy } from './policy'
import { brokerEnrollmentSecretHash, canonicalEnrollmentPayload, canonicalRequestPayload, sha256Hex } from './protocol'
import { constantTimeTextEqual, normalizePublicJwk, publicJwkThumbprint, verifyEs256 } from './crypto'
import { createBrokerStore, type BrokerStore } from './store'
import type { BrokerBoundaryResult, EnrollmentProof, SignedBrokerRequestHeaders, StoredBroker } from './types'

interface BrokerDeps { store?: BrokerStore; policy?: BrokerBuildPolicy; now?: () => Date }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HEX64 = /^[a-f0-9]{64}$/
const B64URL = /^[A-Za-z0-9_-]{8,120}$/

function dependencies(input?: BrokerDeps) {
  return { store: input?.store ?? createBrokerStore(), policy: input?.policy ?? configuredBrokerBuildPolicy(), now: input?.now ?? (() => new Date()) }
}

export function parseEnrollmentProof(value: unknown): EnrollmentProof | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const jwk = normalizePublicJwk(v.publicJwk)
  if (!jwk || v.algorithm !== 'ES256' || typeof v.protocolVersion !== 'number') return null
  const required = ['enrollmentId','hostId','challenge','pairingCode','keyThumbprint','brokerVersion','buildSha256','hostLabel','localUidHash','osVersion','signature'] as const
  if (required.some(key => typeof v[key] !== 'string')) return null
  const proof = { ...v, publicJwk: jwk } as unknown as EnrollmentProof
  if (!UUID.test(proof.enrollmentId) || !UUID.test(proof.hostId) || !HEX64.test(proof.buildSha256)
      || !HEX64.test(proof.localUidHash) || !B64URL.test(proof.signature)
      || proof.hostLabel.length < 1 || proof.hostLabel.length > 120
      || proof.osVersion.length < 1 || proof.osVersion.length > 120
      || /\r|\n/.test(proof.hostLabel) || /\r|\n/.test(proof.osVersion)) return null
  return proof
}

export async function completeBrokerEnrollment(value: unknown, input?: BrokerDeps): Promise<BrokerBoundaryResult<{ broker: StoredBroker }>> {
  const proof = parseEnrollmentProof(value)
  if (!proof) return { status: 'invalid_request' }
  const d = dependencies(input)
  if (!brokerBuildAccepted(proof, d.policy)) return { status: 'rejected' }
  if (d.policy.allowedRepositoryIds.length !== 1 || d.policy.allowedRepositoryIds[0] !== 'github.com/bumbi190/ai-operating-platform') return { status: 'rejected' }
  const thumbprint = publicJwkThumbprint(proof.publicJwk)
  if (!constantTimeTextEqual(thumbprint, proof.keyThumbprint)) return { status: 'rejected' }

  try {
    const enrollment = await d.store.enrollmentById(proof.enrollmentId)
    if (!enrollment || enrollment.state !== 'issued' || enrollment.consumedAt) return { status: 'rejected' }
    if (enrollment.hostId !== proof.hostId) return { status: 'rejected' }
    if (new Date(enrollment.expiresAt).getTime() <= d.now().getTime()) return { status: 'expired' }
    if (!constantTimeTextEqual(enrollment.challengeHash, brokerEnrollmentSecretHash('challenge', proof.enrollmentId, proof.challenge))) return { status: 'rejected' }
    if (!constantTimeTextEqual(enrollment.pairingCodeHash, brokerEnrollmentSecretHash('pairing', proof.enrollmentId, proof.pairingCode))) return { status: 'rejected' }
    const { signature, ...unsigned } = proof
    if (!verifyEs256(proof.publicJwk, canonicalEnrollmentPayload(unsigned), signature)) return { status: 'rejected' }

    const broker = await d.store.completeEnrollment({
      enrollmentId: proof.enrollmentId,
      challengeHash: brokerEnrollmentSecretHash('challenge', proof.enrollmentId, proof.challenge),
      pairingCodeHash: brokerEnrollmentSecretHash('pairing', proof.enrollmentId, proof.pairingCode),
      publicJwk: proof.publicJwk, keyThumbprint: proof.keyThumbprint,
      algorithm: proof.algorithm, protocolVersion: proof.protocolVersion,
      brokerVersion: proof.brokerVersion, buildSha256: proof.buildSha256,
      hostLabel: proof.hostLabel, localUidHash: proof.localUidHash, osVersion: proof.osVersion,
    })
    return { status: 'ok', broker }
  } catch {
    return { status: 'rejected' }
  }
}

export function brokerHeaders(headers: Headers): SignedBrokerRequestHeaders | null {
  const get = (name: string) => headers.get(`x-omnira-broker-${name}`)?.trim() ?? ''
  const counter = Number(get('counter'))
  const protocolVersion = Number(get('protocol'))
  const result: SignedBrokerRequestHeaders = {
    brokerId: get('id'), hostId: get('host-id'), protocolVersion,
    brokerVersion: get('version'), buildSha256: get('build-sha256'),
    counter, jti: get('jti'), timestamp: get('timestamp'), signature: get('signature'),
  }
  if (!UUID.test(result.brokerId) || !UUID.test(result.hostId) || !UUID.test(result.jti)
      || !Number.isSafeInteger(counter) || counter < 1 || !Number.isSafeInteger(protocolVersion)
      || !HEX64.test(result.buildSha256) || !B64URL.test(result.signature)
      || !Number.isFinite(Date.parse(result.timestamp))) return null
  return result
}

export async function authenticateBrokerRequest(request: Request, rawBody: string, input?: BrokerDeps): Promise<BrokerBoundaryResult<{ broker: StoredBroker }>> {
  const headers = brokerHeaders(request.headers)
  if (!headers) return { status: 'no_principal' }
  const d = dependencies(input)
  if (!brokerBuildAccepted(headers, d.policy)) return { status: 'rejected' }
  const timestampMs = Date.parse(headers.timestamp)
  if (Math.abs(d.now().getTime() - timestampMs) > 120_000) return { status: 'rejected' }
  try {
    const broker = await d.store.brokerById(headers.brokerId)
    if (!broker || broker.status !== 'active' || broker.hostId !== headers.hostId
        || broker.protocolVersion !== headers.protocolVersion || broker.brokerVersion !== headers.brokerVersion
        || broker.buildSha256 !== headers.buildSha256) return { status: 'rejected' }
    const url = new URL(request.url)
    const payload = canonicalRequestPayload({ ...headers, method: request.method, path: `${url.pathname}${url.search}`, bodySha256: sha256Hex(rawBody) })
    if (!verifyEs256(broker.publicJwk, payload, headers.signature)) return { status: 'rejected' }
    const accepted = await d.store.acceptRequest({
      brokerId: headers.brokerId, hostId: headers.hostId, protocolVersion: headers.protocolVersion,
      brokerVersion: headers.brokerVersion, buildSha256: headers.buildSha256,
      requestCounter: headers.counter, jti: headers.jti, requestTimestamp: headers.timestamp,
    })
    return { status: 'ok', broker: accepted }
  } catch {
    return { status: 'rejected' }
  }
}
