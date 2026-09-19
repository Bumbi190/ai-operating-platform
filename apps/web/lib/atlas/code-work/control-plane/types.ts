import type { CodeWorkAdmissionV1 } from '../types'
import type { CodeWorkState } from '../lifecycle'

export const CODE_WORK_RECEIPT_CHAIN_VERSION = 'atlas.code_work.receipt_chain.v1' as const
export const CODE_WORK_LEASE_SECONDS = 90 as const
export const CODE_WORK_HEARTBEAT_TARGET_SECONDS = 30 as const

export interface DerivedCodeWorkProposal {
  admission: CodeWorkAdmissionV1
  admissionHash: string
  proposalKeyHash: string
  proposalFingerprintHash: string
  requestedBy: string
}

export interface StoredCodeWorkRun {
  workId: string
  projectId: string
  requestedBy: string
  admission: CodeWorkAdmissionV1
  admissionHash: string
  authorizationId: string
  state: CodeWorkState
  stateVersion: number
  claimId: string | null
  fence: number
  leaseUntil: string | null
  cancelRequested: boolean
  lastReceiptSequence: number
  receiptChainHead: string | null
  terminalAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CodeWorkControlResult {
  status: 'ok' | 'idempotent' | 'not_permitted' | 'conflict' | 'ineligible' | 'stale_fence' | 'unavailable'
  run: StoredCodeWorkRun | null
}
