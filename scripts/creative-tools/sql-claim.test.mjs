import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveCreativeSqlClaim, claimCreativePreviewOnly } from
  '../../apps/web/lib/media/creative-queue/sql-claim.ts'

const projectId='00000000-0000-4000-8000-000000000010'
const otherProject='00000000-0000-4000-8000-000000000020'
const job={
 workId:'creativeJob007',
 projectId,
 sourceAssetId:'00000000-0000-4000-8000-000000000021',
 sourceSha256:'a'.repeat(64),
 workerId:'HultgrenCreative01',
 signedTicketSha256:'b'.repeat(64),
 approvalReceiptSha256:'c'.repeat(64),
 claimNonceSha256:'d'.repeat(64),
}
const worker={workerId:'HultgrenCreative01',authenticatedCreativeWorker:true,
 permittedProjectIds:[projectId]}
test('derives only the five SQL claim parameters from trusted canonical worker/job',()=>{
 const params=deriveCreativeSqlClaim(worker,job)
 assert.deepEqual(Object.keys(params).sort(),[
  'p_work_id','p_worker_id','p_signed_ticket_sha256',
  'p_claim_nonce_sha256','p_approval_receipt_sha256'].sort())
 assert.equal(params.p_worker_id,worker.workerId)
 assert.equal(params.p_work_id,job.workId)
})
test('pilot slug project ID cannot impersonate canonical project UUID',()=>{
 assert.throws(()=>deriveCreativeSqlClaim(worker,{...job,projectId:'familje-stunden'}),
  /scope invalid/)
})
test('wrong principal, disabled capability and cross-project work always refuse',()=>{
 for(const bad of [
  {...worker,authenticatedCreativeWorker:false},
  {...worker,workerId:'OtherCreative02'},
  {...worker,permittedProjectIds:[otherProject]},
 ]) assert.throws(()=>deriveCreativeSqlClaim(bad,job))
 assert.throws(()=>deriveCreativeSqlClaim(worker,{...job,sourceSha256:'corrupt'}))
 assert.throws(()=>deriveCreativeSqlClaim(worker,{...job,workerId:'OtherCreative02'}))
})
test('successful SQL claim never becomes editor execution or publish authority',async()=>{
 let seen
 const store={claim:async params=>{
  seen=params
  return {claimed_work_id:job.workId,
   claimed_id:'00000000-0000-4000-8000-000000000077',
   claimed_fence:1,claimed_state:'claimed_preview_only'}
 }}
 const receipt=await claimCreativePreviewOnly(worker,job,store)
 assert.equal(receipt.executionAuthorized,false)
 assert.equal(receipt.publishAuthorized,false)
 assert.equal(receipt.state,'claimed_preview_only')
 assert.equal(seen.p_claim_nonce_sha256,job.claimNonceSha256)
})
test('invalid/no SQL record is refused, not treated as a successful claim',async()=>{
 for(const result of [
  null,{claimed_work_id:job.workId,claimed_id:'bad',claimed_fence:1,
   claimed_state:'claimed_preview_only'},
  {claimed_work_id:job.workId,claimed_id:'00000000-0000-4000-8000-000000000077',
   claimed_fence:1,claimed_state:'executing'},
 ]) {
  await assert.rejects(claimCreativePreviewOnly(worker,job,{claim:async()=>result}),
   /denied or invalid/)
 }
})
