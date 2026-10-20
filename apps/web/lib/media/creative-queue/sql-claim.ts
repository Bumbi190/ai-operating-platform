/**
 * Server-side adapter contract for the *non-executing* creative SQL claim.
 * Callers MUST first authenticate the creative worker and verify a ticket
 * against a server-owned canonical job. No public HTTP route imports this.
 * No ability to execute, modify media or publish is granted by this module.
 */

export type CreativeDbWorker = Readonly<{
  workerId: string
  authenticatedCreativeWorker: true
  permittedProjectIds: readonly string[]
}>

export type CanonicalCreativeDbJob = Readonly<{
  workId: string
  projectId: string
  sourceAssetId: string
  sourceSha256: string
  workerId: string
  signedTicketSha256: string
  approvalReceiptSha256: string
  claimNonceSha256: string
}>

export type CreativeSqlClaimParams = Readonly<{
  p_work_id: string
  p_worker_id: string
  p_signed_ticket_sha256: string
  p_claim_nonce_sha256: string
  p_approval_receipt_sha256: string
}>

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ID=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/
const SHA=/^[a-f0-9]{64}$/

/** A signed *pilot* ticket using a project slug is NOT canonical DB scope. */
export function deriveCreativeSqlClaim(
  worker: CreativeDbWorker,
  job: CanonicalCreativeDbJob,
): CreativeSqlClaimParams {
  if (!worker || worker.authenticatedCreativeWorker !== true ||
    !ID.test(worker.workerId) || !Array.isArray(worker.permittedProjectIds)) {
    throw new Error('creative worker identity not authenticated')
  }
  if (!job || !ID.test(job.workId) || !UUID.test(job.projectId) ||
    !UUID.test(job.sourceAssetId) || !SHA.test(job.sourceSha256) ||
    !ID.test(job.workerId) || !SHA.test(job.signedTicketSha256) ||
    !SHA.test(job.approvalReceiptSha256) || !SHA.test(job.claimNonceSha256)) {
    throw new Error('canonical creative job scope invalid')
  }
  if (worker.workerId !== job.workerId ||
    !worker.permittedProjectIds.includes(job.projectId)) {
    throw new Error('creative job outside worker project authority')
  }
  return Object.freeze({
    p_work_id:job.workId,
    p_worker_id:worker.workerId,
    p_signed_ticket_sha256:job.signedTicketSha256,
    p_claim_nonce_sha256:job.claimNonceSha256,
    p_approval_receipt_sha256:job.approvalReceiptSha256,
  })
}
export interface CreativeStagingStore {
  claim(params: CreativeSqlClaimParams): Promise<
    null | { claimed_work_id:string; claimed_id:string; claimed_fence:number;
      claimed_state:string }
  >
}
/** Called only after independent auth, signature, canonical asset and project checks. */
export async function claimCreativePreviewOnly(
  worker:CreativeDbWorker,job:CanonicalCreativeDbJob,store:CreativeStagingStore
) {
  const params=deriveCreativeSqlClaim(worker,job)
  const claimed=await store.claim(params)
  if(!claimed || claimed.claimed_work_id!==job.workId ||
    !UUID.test(claimed.claimed_id) ||
    claimed.claimed_fence!==1 || claimed.claimed_state!=='claimed_preview_only') {
    throw new Error('creative database claim denied or invalid')
  }
  return Object.freeze({
    workId:job.workId,claimId:claimed.claimed_id,
    state:'claimed_preview_only' as const,
    executionAuthorized:false as const,
    publishAuthorized:false as const,
  })
}
