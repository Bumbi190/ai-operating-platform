import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { BrokerPublicJwk, StoredBroker, StoredBrokerEnrollment } from './types'

type AnyDb = any

const BROKER_COLUMNS = 'broker_id,enrollment_id,owner_user_id,host_id,public_jwk,key_thumbprint,algorithm,protocol_version,broker_version,build_sha256,host_label,local_uid_hash,os_version,status,allowed_repository_ids,approved_at,approved_by,last_seen_at,expires_at,revoked_at,revoked_by,revoked_reason,request_counter,last_request_jti,last_request_at,created_at,updated_at'
const ENROLLMENT_COLUMNS = 'enrollment_id,requested_by,host_id,challenge_hash,pairing_code_hash,allowed_repository_ids,state,consumed_at,broker_id,proposed_host_label,proposed_local_uid_hash,proposed_os_version,proposed_protocol_version,proposed_broker_version,proposed_build_sha256,approved_at,approved_by,created_at,expires_at'

export interface BrokerStore {
  beginEnrollment(input: BeginEnrollmentInput): Promise<StoredBrokerEnrollment>
  enrollmentById(id: string): Promise<StoredBrokerEnrollment | null>
  brokerById(id: string): Promise<StoredBroker | null>
  brokersByOwner(ownerId: string): Promise<StoredBroker[]>
  openEnrollmentByOwner(ownerId: string): Promise<StoredBrokerEnrollment | null>
  completeEnrollment(input: CompleteEnrollmentInput): Promise<StoredBroker>
  approve(brokerId: string, ownerId: string): Promise<StoredBroker>
  revoke(brokerId: string, ownerId: string, status: 'revoked' | 'lost', reason: string): Promise<StoredBroker>
  acceptRequest(input: AcceptRequestInput): Promise<StoredBroker>
}

export interface BeginEnrollmentInput {
  enrollmentId: string; requestedBy: string; hostId: string; challengeHash: string
  pairingCodeHash: string; expiresAt: string; allowedRepositoryIds: string[]
}
export interface CompleteEnrollmentInput {
  enrollmentId: string; challengeHash: string; pairingCodeHash: string
  publicJwk: BrokerPublicJwk; keyThumbprint: string; algorithm: 'ES256'
  protocolVersion: number; brokerVersion: string; buildSha256: string
  hostLabel: string; localUidHash: string; osVersion: string
}
export interface AcceptRequestInput {
  brokerId: string; hostId: string; protocolVersion: number; brokerVersion: string
  buildSha256: string; requestCounter: number; jti: string; requestTimestamp: string
}

interface BrokerRow {
  broker_id: string; enrollment_id: string; owner_user_id: string; host_id: string
  public_jwk: BrokerPublicJwk; key_thumbprint: string; algorithm: 'ES256'; protocol_version: number
  broker_version: string; build_sha256: string; host_label: string; local_uid_hash: string
  os_version: string; status: StoredBroker['status']; allowed_repository_ids: string[]
  approved_at: string | null; approved_by: string | null; last_seen_at: string | null
  expires_at: string | null; revoked_at: string | null; revoked_by: string | null
  revoked_reason: string | null; request_counter: number; last_request_jti: string | null
  last_request_at: string | null; created_at: string; updated_at: string
}
interface EnrollmentRow {
  enrollment_id: string; requested_by: string; host_id: string; challenge_hash: string
  pairing_code_hash: string; allowed_repository_ids: string[]; state: StoredBrokerEnrollment['state']
  consumed_at: string | null; broker_id: string | null; proposed_host_label: string | null
  proposed_local_uid_hash: string | null; proposed_os_version: string | null
  proposed_protocol_version: number | null; proposed_broker_version: string | null
  proposed_build_sha256: string | null; approved_at: string | null; approved_by: string | null
  created_at: string; expires_at: string
}

export function rowToBroker(row: BrokerRow): StoredBroker {
  return {
    brokerId: row.broker_id, enrollmentId: row.enrollment_id, ownerUserId: row.owner_user_id,
    hostId: row.host_id, publicJwk: row.public_jwk, keyThumbprint: row.key_thumbprint,
    algorithm: row.algorithm, protocolVersion: row.protocol_version, brokerVersion: row.broker_version,
    buildSha256: row.build_sha256, hostLabel: row.host_label, localUidHash: row.local_uid_hash,
    osVersion: row.os_version, status: row.status, allowedRepositoryIds: row.allowed_repository_ids,
    approvedAt: row.approved_at, approvedBy: row.approved_by, lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at, revokedAt: row.revoked_at, revokedBy: row.revoked_by,
    revokedReason: row.revoked_reason, requestCounter: Number(row.request_counter),
    lastRequestJti: row.last_request_jti, lastRequestAt: row.last_request_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}
export function rowToEnrollment(row: EnrollmentRow): StoredBrokerEnrollment {
  return {
    enrollmentId: row.enrollment_id, requestedBy: row.requested_by, hostId: row.host_id,
    challengeHash: row.challenge_hash, pairingCodeHash: row.pairing_code_hash,
    allowedRepositoryIds: row.allowed_repository_ids, state: row.state, consumedAt: row.consumed_at,
    brokerId: row.broker_id, proposedHostLabel: row.proposed_host_label,
    proposedLocalUidHash: row.proposed_local_uid_hash, proposedOsVersion: row.proposed_os_version,
    proposedProtocolVersion: row.proposed_protocol_version, proposedBrokerVersion: row.proposed_broker_version,
    proposedBuildSha256: row.proposed_build_sha256, approvedAt: row.approved_at,
    approvedBy: row.approved_by, createdAt: row.created_at, expiresAt: row.expires_at,
  }
}

class PostgresBrokerStore implements BrokerStore {
  private db(): AnyDb { return createAdminClient() as AnyDb }
  private async rpc<T>(name: string, args: Record<string, unknown>, map: (row: any) => T): Promise<T> {
    const { data, error } = await this.db().rpc(name, args)
    if (error) throw new Error(`[code-broker] ${name} failed:${error.code ?? 'unknown'}`)
    if (!data) throw new Error(`[code-broker] ${name} returned no row`)
    return map(Array.isArray(data) ? data[0] : data)
  }
  beginEnrollment(input: BeginEnrollmentInput) {
    return this.rpc('atlas_code_broker_begin_enrollment', {
      p_enrollment_id: input.enrollmentId, p_requested_by: input.requestedBy, p_host_id: input.hostId,
      p_challenge_hash: input.challengeHash, p_pairing_code_hash: input.pairingCodeHash,
      p_expires_at: input.expiresAt, p_allowed_repository_ids: input.allowedRepositoryIds,
    }, rowToEnrollment)
  }
  async enrollmentById(id: string) {
    const { data, error } = await this.db().from('atlas_code_broker_enrollments').select(ENROLLMENT_COLUMNS).eq('enrollment_id', id).maybeSingle()
    if (error) throw new Error(`[code-broker] enrollment read failed:${error.code ?? 'unknown'}`)
    return data ? rowToEnrollment(data as EnrollmentRow) : null
  }
  async brokerById(id: string) {
    const { data, error } = await this.db().from('atlas_code_brokers').select(BROKER_COLUMNS).eq('broker_id', id).maybeSingle()
    if (error) throw new Error(`[code-broker] broker read failed:${error.code ?? 'unknown'}`)
    return data ? rowToBroker(data as BrokerRow) : null
  }
  async brokersByOwner(ownerId: string) {
    const { data, error } = await this.db().from('atlas_code_brokers').select(BROKER_COLUMNS).eq('owner_user_id', ownerId).order('created_at', { ascending: false })
    if (error) throw new Error(`[code-broker] owner read failed:${error.code ?? 'unknown'}`)
    return ((data ?? []) as BrokerRow[]).map(rowToBroker)
  }
  async openEnrollmentByOwner(ownerId: string) {
    const { data, error } = await this.db().from('atlas_code_broker_enrollments').select(ENROLLMENT_COLUMNS).eq('requested_by', ownerId).eq('state', 'issued').gt('expires_at', new Date().toISOString()).maybeSingle()
    if (error) throw new Error(`[code-broker] open enrollment read failed:${error.code ?? 'unknown'}`)
    return data ? rowToEnrollment(data as EnrollmentRow) : null
  }
  completeEnrollment(input: CompleteEnrollmentInput) {
    return this.rpc('atlas_code_broker_complete_enrollment', {
      p_enrollment_id: input.enrollmentId, p_challenge_hash: input.challengeHash,
      p_pairing_code_hash: input.pairingCodeHash, p_public_jwk: input.publicJwk,
      p_key_thumbprint: input.keyThumbprint, p_algorithm: input.algorithm,
      p_protocol_version: input.protocolVersion, p_broker_version: input.brokerVersion,
      p_build_sha256: input.buildSha256, p_host_label: input.hostLabel,
      p_local_uid_hash: input.localUidHash, p_os_version: input.osVersion,
    }, rowToBroker)
  }
  approve(brokerId: string, ownerId: string) {
    return this.rpc('atlas_code_broker_approve', { p_broker_id: brokerId, p_owner_user_id: ownerId }, rowToBroker)
  }
  revoke(brokerId: string, ownerId: string, status: 'revoked' | 'lost', reason: string) {
    return this.rpc('atlas_code_broker_revoke', { p_broker_id: brokerId, p_owner_user_id: ownerId, p_status: status, p_reason: reason }, rowToBroker)
  }
  acceptRequest(input: AcceptRequestInput) {
    return this.rpc('atlas_code_broker_accept_request', {
      p_broker_id: input.brokerId, p_host_id: input.hostId, p_protocol_version: input.protocolVersion,
      p_broker_version: input.brokerVersion, p_build_sha256: input.buildSha256,
      p_request_counter: input.requestCounter, p_jti: input.jti,
      p_request_timestamp: input.requestTimestamp,
    }, rowToBroker)
  }
}

export function createBrokerStore(): BrokerStore { return new PostgresBrokerStore() }
