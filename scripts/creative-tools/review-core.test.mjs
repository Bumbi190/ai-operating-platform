import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCreativeEnrollmentReviewService} from '../../apps/web/lib/media/creative-queue/review-core.mjs';

const project='00000000-0000-4000-8000-000000000011';
const operator='00000000-0000-4000-8000-000000000001';
const enrollment='00000000-0000-4000-8000-000000000090';
const request={
 enrollmentId:enrollment,decision:'approve_registration_only',
 expectedKeySha256:'a'.repeat(64),expectedProofSha256:'b'.repeat(64),
 projectIds:[project],reviewNonceSha256:'c'.repeat(64),
 reasonCode:'operator_verified_test'
};
function deps(ok=true) {
 const state={entries:[],reads:0};
 const store={
  async getPendingEnrollment(id){
   state.reads++;
   return {enrollmentId:id,state:'pending_review',keySha256:request.expectedKeySha256,
    proofSha256:request.expectedProofSha256,projectIds:[project]};
  },
  async recordDecision(item){
   if(state.entries.some(x=>x.enrollmentId===item.enrollmentId ||
      x.reviewNonceSha256===item.reviewNonceSha256))return false;
   state.entries.push(item);
   return true;
  }
 };
 return {state,store,operator:async()=>ok?{ok:true,userId:operator}: {ok:false,reason:'unauthenticated'}};
}
test('review is denied without session-derived platform operator',async()=>{
 const d=deps(false);
 const result=await makeCreativeEnrollmentReviewService(d).review(request);
 assert.equal(result.status,'operator_required');
 assert.equal(d.state.reads,0);
});
test('approval is only a recorded review; never activates creative execution',async()=>{
 const d=deps();
 const result=await makeCreativeEnrollmentReviewService(d).review(request);
 assert.equal(result.status,'recorded_for_separate_activation_review');
 assert.equal(result.workerIdentityActivated,false);
 assert.equal(result.executionAuthorized,false);
 assert.equal(result.publishAuthorized,false);
 assert.equal(d.state.entries[0].reviewerUserId,operator);
 assert.equal(d.state.entries[0].decision,'approve_registration_only');
});
test('second approval or rejection of same enrollment never records again',async()=>{
 const d=deps(),service=makeCreativeEnrollmentReviewService(d);
 assert.equal((await service.review(request)).status,'recorded_for_separate_activation_review');
 assert.equal((await service.review(request)).status,'conflict');
 assert.equal((await service.review({...request,decision:'reject_registration',reviewNonceSha256:'d'.repeat(64)})).status,'conflict');
 assert.equal(d.state.entries.length,1);
});
test('wrong scope, unexpected fields and invalid action are rejected',async()=>{
 const d=deps(),service=makeCreativeEnrollmentReviewService(d);
 for(const candidate of [
  {...request,decision:'enable_windows_account'},
  {...request,projectIds:['familje-stunden']},
  {...request,projectIds:[]},
  {...request,expectedProofSha256:'d'.repeat(64)},
  {...request,expectedKeySha256:'d'.repeat(64)},
  {...request,modelApproval:true},
 ]) {
  assert.notEqual((await service.review(candidate)).status,'recorded_for_separate_activation_review');
 }
 assert.equal(d.state.entries.length,0);
});
test('operator review remains pending if store unavailable or evidence changed',async()=>{
 const d=deps(),service=makeCreativeEnrollmentReviewService({
  ...d,store:{...d.store,getPendingEnrollment:async()=>null}
 });
 assert.equal((await service.review(request)).status,'not_available');
 assert.equal(d.state.entries.length,0);
});
test('injecting no trusted operator or durable review store fails closed',()=>{
 assert.throws(()=>makeCreativeEnrollmentReviewService({}),/dependencies missing/);
});
