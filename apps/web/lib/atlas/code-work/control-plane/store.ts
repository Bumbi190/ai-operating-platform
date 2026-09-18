/** Server-only persistence adapter for the SDF-1B1 purpose-specific RPCs. */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { CodeWorkReceiptV1 } from '../evidence'
import type { CodeWorkState } from '../lifecycle'
import type { DerivedCodeWorkProposal, StoredCodeWorkRun } from './types'

type AnyDb = any

interface RunRow {
  work_id: string
  project_id: string
  requested_by: string
  admission: StoredCodeWorkRun['admission']
  admission_hash: string
  authorization_id: string
  state: StoredCodeWorkRun['state']
  state_version: number
  claim_id: string | null
  fence: number
  lease_until: string | null
  cancel_requested: boolean
  last_receipt_sequence: number
  receipt_chain_head: string | null
  terminal_at: string | null
  created_at: string
  updated_at: string
}

function rowToRun(row: RunRow): StoredCodeWorkRun {
  return {
    workId: row.work_id, projectId: row.project_id, requestedBy: row.requested_by,
    admission: row.admission, admissionHash: row.admission_hash,
    authorizationId: row.authorization_id, state: row.state,
    stateVersion: row.state_version, claimId: row.claim_id, fence: row.fence,
    leaseUntil: row.lease_until, cancelRequested: row.cancel_requested,
    lastReceiptSequence: row.last_receipt_sequence, receiptChainHead: row.receipt_chain_head,
    terminalAt: row.terminal_at, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

const RUN_COLUMNS = [
  'work_id', 'project_id', 'requested_by', 'admission', 'admission_hash',
  'authorization_id', 'state', 'state_version', 'claim_id', 'fence', 'lease_until',
  'cancel_requested', 'last_receipt_sequence', 'receipt_chain_head', 'terminal_at',
  'created_at', 'updated_at',
].join(', ')

export interface ProposeInput extends DerivedCodeWorkProposal {
  authorizationId: string
  authorizationEventId: string
}

export interface CodeWorkControlPlaneStore {
  propose(input: ProposeInput): Promise<StoredCodeWorkRun>
  byProjectAndWorkId(projectId: string, workId: string): Promise<StoredCodeWorkRun | null>
  synchronizeAuthorization(workId: string): Promise<StoredCodeWorkRun>
  claim(workId: string, brokerId: string, brokerHostId: string): Promise<StoredCodeWorkRun>
  heartbeat(workId: string, claimId: string, fence: number): Promise<StoredCodeWorkRun>
  appendEvidence(workId: string, admissionHash: string, claimId: string, fence: number, expectedSequence: number, expectedPreviousHash: string | null, receipt: CodeWorkReceiptV1, producerType: string, producerId: string): Promise<StoredCodeWorkRun>
  transition(workId: string, expectedState: CodeWorkState, expectedVersion: number, toState: CodeWorkState, claimId: string, fence: number, reasonCode?: string): Promise<StoredCodeWorkRun>
  cancel(workId: string, projectId: string, requestedBy: string, reasonCode: string): Promise<StoredCodeWorkRun>
}

class PostgresCodeWorkControlPlaneStore implements CodeWorkControlPlaneStore {
  private db(): AnyDb { return createAdminClient() as AnyDb }

  private async rpc(name: string, args: Record<string, unknown>): Promise<StoredCodeWorkRun> {
    const { data, error } = await this.db().rpc(name, args)
    if (error) throw new Error(`[atlas-code-work] ${name} failed: ${error.message}`)
    if (!data) throw new Error(`[atlas-code-work] ${name} returned no row`)
    return rowToRun((Array.isArray(data) ? data[0] : data) as RunRow)
  }

  async propose(input: ProposeInput): Promise<StoredCodeWorkRun> {
    return this.rpc('atlas_code_work_propose', {
      p_work_id: input.admission.workId,
      p_project_id: input.admission.projectId,
      p_requested_by: input.requestedBy,
      p_proposal_key_hash: input.proposalKeyHash,
      p_proposal_fingerprint_hash: input.proposalFingerprintHash,
      p_admission: input.admission,
      p_admission_hash: input.admissionHash,
      p_authorization_id: input.authorizationId,
      p_authorization_event_id: input.authorizationEventId,
    })
  }

  async byProjectAndWorkId(projectId: string, workId: string): Promise<StoredCodeWorkRun | null> {
    const { data, error } = await this.db().from('atlas_code_work_runs')
      .select(RUN_COLUMNS).eq('project_id', projectId).eq('work_id', workId).maybeSingle()
    if (error) throw new Error(`[atlas-code-work] read failed: ${error.message}`)
    return data ? rowToRun(data as RunRow) : null
  }

  synchronizeAuthorization(workId: string) { return this.rpc('atlas_code_work_sync_authorization', { p_work_id: workId }) }
  claim(workId: string, brokerId: string, brokerHostId: string) {
    return this.rpc('atlas_code_work_claim', { p_work_id: workId, p_broker_id: brokerId, p_broker_host_id: brokerHostId })
  }
  heartbeat(workId: string, claimId: string, fence: number) {
    return this.rpc('atlas_code_work_heartbeat', { p_work_id: workId, p_claim_id: claimId, p_fence: fence })
  }
  appendEvidence(workId: string, admissionHash: string, claimId: string, fence: number, expectedSequence: number, expectedPreviousHash: string | null, receipt: CodeWorkReceiptV1, producerType: string, producerId: string) {
    return this.rpc('atlas_code_work_append_evidence', {
      p_work_id: workId, p_admission_hash: admissionHash, p_claim_id: claimId,
      p_fence: fence, p_expected_sequence: expectedSequence,
      p_expected_previous_hash: expectedPreviousHash, p_receipt_class: receipt.evidence.receiptClass,
      p_payload: receipt.evidence, p_observed_at: receipt.observedAt,
      p_producer_type: producerType, p_producer_id: producerId,
    })
  }
  transition(workId: string, expectedState: CodeWorkState, expectedVersion: number, toState: CodeWorkState, claimId: string, fence: number, reasonCode?: string) {
    return this.rpc('atlas_code_work_transition', {
      p_work_id: workId, p_expected_state: expectedState, p_expected_version: expectedVersion,
      p_to_state: toState, p_claim_id: claimId, p_fence: fence,
      p_reason_code: reasonCode ?? null,
    })
  }
  cancel(workId: string, projectId: string, requestedBy: string, reasonCode: string) {
    return this.rpc('atlas_code_work_cancel', {
      p_work_id: workId, p_project_id: projectId, p_requested_by: requestedBy,
      p_reason_code: reasonCode,
    })
  }
}

export function createCodeWorkControlPlaneStore(): CodeWorkControlPlaneStore {
  return new PostgresCodeWorkControlPlaneStore()
}
