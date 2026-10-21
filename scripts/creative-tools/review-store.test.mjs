import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCreativeEnrollmentReviewStore} from '../../apps/web/lib/media/creative-queue/review-store.mjs';
const enrollment='00000000-0000-4000-8000-000000000090';
const reviewer='00000000-0000-4000-8000-000000000001';
const project='00000000-0000-4000-8000-000000000011';
function storeHarness({state='pending_review',rpcReturn=true}={}){
 const calls=[];
 const db={
  from(table){
   assert.equal(table,'atlas_creative_enrollment_staging');
   return {select(columns){
    assert.match(columns,/canonical_proof_sha256/);
    return {eq(col,id){
     assert.equal(col,'enrollment_id');assert.equal(id,enrollment);
     return {maybeSingle:async()=>({data:{
      enrollment_id:enrollment,state,
      public_key_sha256:'a'.repeat(64),
      canonical_proof_sha256:'b'.repeat(64),
      project_ids:[project],
     },error:null})};
    }};
   }};
  },
  async rpc(name,params){
   calls.push({name,params});
   return {data:rpcReturn,error:null};
  }
 };
 return {store:makeCreativeEnrollmentReviewStore(db),calls};
}
test('pending review is read from canonical private table',async()=>{
 const h=storeHarness();
 assert.deepEqual(await h.store.getPendingEnrollment(enrollment),{
  enrollmentId:enrollment,state:'pending_review',keySha256:'a'.repeat(64),
  proofSha256:'b'.repeat(64),projectIds:[project]
 });
 assert.equal(await h.store.getPendingEnrollment('../invalid'),null);
});
test('unreviewable enrollment refuses',async()=>{
 const h=storeHarness({state:'issued'});
 assert.equal(await h.store.getPendingEnrollment(enrollment),null);
});
test('only verified explicit review fields reach the privileged SQL function',async()=>{
 const h=storeHarness();
 const input={
  enrollmentId:enrollment,reviewerUserId:reviewer,
  decision:'approve_registration_only',
  keySha256:'a'.repeat(64),proofSha256:'b'.repeat(64),
  projectIds:[project],reviewNonceSha256:'c'.repeat(64),
  reasonCode:'operator_verified_test'
 };
 assert.equal(await h.store.recordDecision(input),true);
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].name,'atlas_creative_enrollment_record_review_p15');
 assert.deepEqual(Object.keys(h.calls[0].params).sort(),[
  'p_enrollment_id','p_reviewer_user_id','p_decision','p_key_sha256',
  'p_proof_sha256','p_project_ids','p_review_nonce_sha256','p_reason_code'
 ].sort());
 assert.equal(await h.store.recordDecision({...input,decision:'enable_worker'}),false);
 assert.equal(h.calls.length,1);
});
test('database refusal is never success',async()=>{
 const h=storeHarness({rpcReturn:null});
 assert.equal(await h.store.recordDecision({
  enrollmentId:enrollment,reviewerUserId:reviewer,
  decision:'reject_registration',keySha256:'a'.repeat(64),
  proofSha256:'b'.repeat(64),projectIds:[project],
  reviewNonceSha256:'d'.repeat(64),reasonCode:'operator_rejected_test'
 }),false);
});
