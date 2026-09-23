import { randomUUID } from 'node:crypto'
import type { BrokerSigner } from '../identity/types.js'
import { canonicalRequestPayload, sha256Hex } from './canonical-request.js'

const ALLOWED_PATHS = new Set(['/api/atlas/code-work/broker/enroll', '/api/atlas/code-work/broker/identity'])

export async function postEnrollment(origin: string, proof: unknown): Promise<unknown> {
  return postJson(origin, '/api/atlas/code-work/broker/enroll', proof, {})
}

export async function postSignedDiagnostic(input: {
  origin: string; brokerId: string; hostId: string; protocolVersion: number
  brokerVersion: string; buildSha256: string; counter: number; identityId: string; signer: BrokerSigner
}): Promise<unknown> {
  const path = '/api/atlas/code-work/broker/identity'
  const body = '{}'
  const headers = { brokerId: input.brokerId, hostId: input.hostId, protocolVersion: input.protocolVersion,
    brokerVersion: input.brokerVersion, buildSha256: input.buildSha256, counter: input.counter,
    jti: randomUUID(), timestamp: new Date().toISOString() }
  const signature = await input.signer.signCanonicalPayload(input.identityId, canonicalRequestPayload({
    ...headers, method: 'POST', path, bodySha256: sha256Hex(body),
  }))
  return postJson(input.origin, path, JSON.parse(body), {
    'x-omnira-broker-id': headers.brokerId, 'x-omnira-broker-host-id': headers.hostId,
    'x-omnira-broker-protocol': String(headers.protocolVersion), 'x-omnira-broker-version': headers.brokerVersion,
    'x-omnira-broker-build-sha256': headers.buildSha256, 'x-omnira-broker-counter': String(headers.counter),
    'x-omnira-broker-jti': headers.jti, 'x-omnira-broker-timestamp': headers.timestamp,
    'x-omnira-broker-signature': signature,
  })
}

async function postJson(origin: string, path: string, body: unknown, headers: Record<string, string>) {
  if (!ALLOWED_PATHS.has(path)) throw new Error('broker endpoint not allowlisted')
  const url = new URL(path, origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== path) throw new Error('invalid broker origin')
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const value = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`broker protocol rejected:${response.status}`)
  return value
}
