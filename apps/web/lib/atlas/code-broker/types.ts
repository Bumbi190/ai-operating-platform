export const BROKER_PROTOCOL_VERSION = 1 as const
export const BROKER_VERSION = '0.1.0' as const
export const OMNIRA_REPOSITORY_ID = 'github.com/bumbi190/ai-operating-platform' as const

export type BrokerStatus = 'pending' | 'active' | 'revoked' | 'lost' | 'retired'
export type EnrollmentState = 'issued' | 'proof_verified' | 'approved' | 'revoked' | 'expired'

export interface BrokerPublicJwk {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
}

export interface StoredBroker {
  brokerId: string
  enrollmentId: string
  ownerUserId: string
  hostId: string
  publicJwk: BrokerPublicJwk
  keyThumbprint: string
  algorithm: 'ES256'
  protocolVersion: number
  brokerVersion: string
  buildSha256: string
  hostLabel: string
  localUidHash: string
  osVersion: string
  status: BrokerStatus
  allowedRepositoryIds: string[]
  approvedAt: string | null
  approvedBy: string | null
  lastSeenAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  revokedBy: string | null
  revokedReason: string | null
  requestCounter: number
  lastRequestJti: string | null
  lastRequestAt: string | null
  createdAt: string
  updatedAt: string
}

export interface StoredBrokerEnrollment {
  enrollmentId: string
  requestedBy: string
  hostId: string
  challengeHash: string
  pairingCodeHash: string
  allowedRepositoryIds: string[]
  state: EnrollmentState
  consumedAt: string | null
  brokerId: string | null
  proposedHostLabel: string | null
  proposedLocalUidHash: string | null
  proposedOsVersion: string | null
  proposedProtocolVersion: number | null
  proposedBrokerVersion: string | null
  proposedBuildSha256: string | null
  approvedAt: string | null
  approvedBy: string | null
  createdAt: string
  expiresAt: string
}

export interface BrokerEnrollmentPackage {
  domain: 'omnira.code_broker.enrollment.v1'
  enrollmentId: string
  hostId: string
  challenge: string
  pairingCode: string
  expiresAt: string
  protocolVersion: 1
  algorithm: 'ES256'
  allowedRepositoryIds: readonly [typeof OMNIRA_REPOSITORY_ID]
}

export interface EnrollmentProof {
  enrollmentId: string
  hostId: string
  challenge: string
  pairingCode: string
  publicJwk: BrokerPublicJwk
  keyThumbprint: string
  algorithm: 'ES256'
  protocolVersion: number
  brokerVersion: string
  buildSha256: string
  hostLabel: string
  localUidHash: string
  osVersion: string
  signature: string
}

export interface SignedBrokerRequestHeaders {
  brokerId: string
  hostId: string
  protocolVersion: number
  brokerVersion: string
  buildSha256: string
  counter: number
  jti: string
  timestamp: string
  signature: string
}

export type BrokerBoundaryStatus =
  | 'ok'
  | 'no_principal'
  | 'not_permitted'
  | 'invalid_request'
  | 'conflict'
  | 'expired'
  | 'rejected'
  | 'unavailable'

export type BrokerBoundaryResult<T extends object = object> =
  | ({ status: 'ok' } & T)
  | { status: Exclude<BrokerBoundaryStatus, 'ok'> }

export interface BrokerSettingsModel {
  capability: { allowed: boolean; reason: 'allowed' | 'unauthenticated' | 'not_platform_operator' | 'no_operator_configured' }
  brokers: StoredBroker[]
  openEnrollment: Pick<StoredBrokerEnrollment, 'enrollmentId' | 'hostId' | 'state' | 'createdAt' | 'expiresAt'> | null
  generatedAt: string
  readable: boolean
}
