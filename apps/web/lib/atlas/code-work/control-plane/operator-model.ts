import type { AuthorizationStatus } from '@/lib/atlas/authorization/types'
import type { CodeWorkState } from '../lifecycle'

export interface CodeWorkProjectSummary {
  id: string
  name: string
  slug: string
  color: string
}

export interface CodeWorkReviewItem {
  workId: string
  project: CodeWorkProjectSummary
  objective: string
  repository: string
  pinnedBaseSha: string
  readPathCount: number
  writePathCount: number
  workerLabel: string
  commandCount: number
  limitsLabel: string
  admissionHash: string
  state: CodeWorkState
  authorizationStatus: AuthorizationStatus | 'unreadable'
  authorizationExpiresAt: string | null
  createdAt: string
  actionable: boolean
  cancelable: boolean
  detailHref: string
}

export interface CodeWorkReviewQueueModel {
  state: 'ok' | 'error'
  queue: CodeWorkReviewItem[]
  archive: CodeWorkReviewItem[]
  total: number | null
  filter: { slug: string; matched: boolean } | null
}

export interface CodeWorkReceiptView {
  receiptId: string
  sequence: number
  eventType: string
  eventLabel: string
  receiptClass: string
  producerType: string
  producerId: string
  observedAt: string
  recordedAt: string
  payload: Record<string, string | number | boolean | null>
  payloadHash: string
  previousReceiptHash: string | null
  receiptHash: string
}

export interface CodeWorkDetailModel extends CodeWorkReviewItem {
  workPackageId: string
  authorizationId: string
  authorizationEventCount: number
  authorizedAt: string | null
  terminalAt: string | null
  terminalReasonCode: string | null
  readPaths: string[]
  writePaths: string[]
  deniedPaths: string[]
  commandIds: string[]
  limits: {
    maxWorkerIterations: number
    maxChangedFiles: number
    maxDiffBytes: number
    maxTotalRuntimeSeconds: number
    maxCommandRuntimeSeconds: number
  }
  lifecycle: Array<{ label: string; at: string | null }>
  receipts: CodeWorkReceiptView[]
}

export const EMPTY_CODE_WORK_QUEUE: CodeWorkReviewQueueModel = {
  state: 'ok', queue: [], archive: [], total: 0, filter: null,
}

export const CODE_WORK_STATE_LABELS: Record<CodeWorkState, string> = {
  proposed: 'Föreslagen',
  authorized: 'Behörighet beviljad',
  claimed: 'Tilldelad',
  preparing: 'Förbereds',
  working: 'Bearbetas',
  testing: 'Verifieras',
  ready_for_human_review: 'Klar för mänsklig granskning',
  tests_failed: 'Tester underkända',
  scope_violation: 'Scope-avvikelse',
  stale_base: 'Basen har ändrats',
  worker_failed: 'Worker misslyckades',
  cancelled: 'Avbruten',
  timeout: 'Tidsgräns nådd',
  policy_denied: 'Behörighet nekad',
}

export const AUTHORIZATION_STATUS_LABELS: Record<AuthorizationStatus | 'unreadable', string> = {
  pending: 'Väntar på ägarbeslut',
  granted: 'Beviljad',
  granted_with_conditions: 'Villkorad · inte verksam',
  denied: 'Avvisad',
  revoked: 'Återkallad',
  expired: 'Utgången',
  superseded: 'Ersatt',
  unreadable: 'Kunde inte verifieras',
}
