/**
 * Read-only local-text incident inventory.
 * This is NOT a reconciliation authority or a worker readiness grant.
 * Even zero open incidents cannot make the operator's next dispatch safe.
 */
export interface ReconciliationCounts {
  openReconcile: number
  openOffline: number
  otherOpen: number
  revokedDevices: number
  activeDevices: number
  activeAdmissions: number
  retainedJobs: number
  openIncidentsWithoutRetainedJob: number
}
export type ReadinessResult = {
  readonly status: 'blocked' | 'requires_new_admission_review'
  readonly manualEvidenceRequired: true
  readonly canResume: false
  readonly canRetry: false
  readonly canEnroll: false
  readonly counts: ReconciliationCounts
  readonly reasons: string[]
}

/** Counts come only from scoped, server-verified read-only database queries. */
export function summarizeReconciliation(input: ReconciliationCounts): ReadinessResult {
  const keys: (keyof ReconciliationCounts)[] = [
    'openReconcile','openOffline','otherOpen','revokedDevices','activeDevices',
    'activeAdmissions','retainedJobs','openIncidentsWithoutRetainedJob',
  ]
  for (const key of keys) {
    if (!Number.isSafeInteger(input[key]) || input[key] < 0 || input[key] > 100000) {
      throw new Error('INVALID_RECONCILIATION_EVIDENCE')
    }
  }
  if (input.openIncidentsWithoutRetainedJob > input.openReconcile + input.openOffline + input.otherOpen) {
    throw new Error('INVALID_RECONCILIATION_EVIDENCE')
  }
  const open = input.openReconcile + input.openOffline + input.otherOpen
  const reasons: string[] = []
  if (input.openReconcile) reasons.push('UNRESOLVED_DISPATCH_OUTCOME')
  if (input.openOffline) reasons.push('OPEN_OFFLINE_INCIDENT')
  if (input.otherOpen) reasons.push('OTHER_OPEN_INCIDENT')
  if (input.openIncidentsWithoutRetainedJob) reasons.push('CANONICAL_JOB_NOT_RETAINED')
  if (input.revokedDevices) reasons.push('REVOKED_DEVICE')
  if (!input.activeDevices || !input.activeAdmissions) reasons.push('NO_ACTIVE_DEVICE_ADMISSION')
  if (!reasons.length) reasons.push('NEW_ADMISSION_AND_ATTESTATION_REQUIRED')
  return {
    status: open ? 'blocked' : 'requires_new_admission_review',
    manualEvidenceRequired: true, canResume: false, canRetry: false, canEnroll: false,
    counts: { ...input }, reasons,
  }
}
