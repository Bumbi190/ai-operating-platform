import type { BrokerSigner } from './types.js'
import { canonicalEnrollmentPayload } from '../protocol/canonical-request.js'

export interface EnrollmentPackage {
  enrollmentId: string; hostId: string; challenge: string; pairingCode: string
  expiresAt: string; protocolVersion: 1; algorithm: 'ES256'; allowedRepositoryIds: string[]
}

export async function createEnrollmentProof(input: {
  enrollment: EnrollmentPackage; identityId: string; hostLabel: string; localUidHash: string
  osVersion: string; brokerVersion: string; buildSha256: string; signer: BrokerSigner
}) {
  if (Date.parse(input.enrollment.expiresAt) <= Date.now()) throw new Error('enrollment expired')
  const identity = await input.signer.getPublicIdentity(input.identityId)
  const unsigned = {
    enrollmentId: input.enrollment.enrollmentId, hostId: input.enrollment.hostId,
    challenge: input.enrollment.challenge, pairingCode: input.enrollment.pairingCode,
    publicJwk: identity.publicJwk, keyThumbprint: identity.keyThumbprint,
    algorithm: 'ES256' as const, protocolVersion: input.enrollment.protocolVersion,
    brokerVersion: input.brokerVersion, buildSha256: input.buildSha256,
    hostLabel: input.hostLabel, localUidHash: input.localUidHash, osVersion: input.osVersion,
  }
  return { ...unsigned, signature: await input.signer.signCanonicalPayload(input.identityId, canonicalEnrollmentPayload(unsigned)) }
}
