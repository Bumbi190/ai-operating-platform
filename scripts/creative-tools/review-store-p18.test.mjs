import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCreativeOwnerGuardedReviewStore} from
 '../../apps/web/lib/media/creative-queue/review-store-p18.mjs';

const enroll='00000000-0000-4000-8000-000000000090';
const user='00000000-0000-4000-8000-000000000001';
const project='00000000-0000-4000-8000-000000000011';
const review={
 enrollmentId:enroll,reviewerUserId:user,
 decision:'approve_registration_only',
 keySha256:'a'.repeat(64),proofSha256:'b'.repeat(64),
 projectIds:[project],reviewNonceSha256:'c'.repeat(64),
 reasonCode:'operator_verified_test'
};
function fixture(result=true){
 const calls=[];
 const db={
  from(table){assert.equal(table,'atlas_creative_enrollment_staging');
   return {select(){return {eq(){return {maybeSingle:async()=>({
    data:{
     enrollment_id:enroll,state:'pending_review',
     public_key_sha256:'a'.repeat(64),
     canonical_proof_sha256:'b'.repeat(64),project_ids:[project]
    },error:null
   })}}}}}
  },
  rpc:async(name,args)=>{
   calls.push({name,args});
   return {data:result,error:null};
  }
 };
 return {store:makeCreativeOwnerGuardedReviewStore(db),calls};
}
test('P18 uses only atomic owner-guarded SQL, never weaker P15 service RPC',async()=>{
 const h=fixture();
 const accepted=await h.store.recordDecision(review);
 assert.equal(accepted,true,JSON.stringify({calls:h.calls,review}));
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].name,'atlas_creative_enrollment_record_review_p18');
 assert.equal(h.calls[0].args.p_reviewer_user_id,user);
 assert.deepEqual(h.calls[0].args.p_project_ids,[project]);
 assert.equal((await h.store.getPendingEnrollment(enroll)).state,'pending_review');
});
test('P18 fail closed on noncanonical project and model-originated command',async()=>{
 const h=fixture();
 assert.equal(await h.store.recordDecision({...review,projectIds:['familje-stunden']}),false);
 assert.equal(await h.store.recordDecision({...review,decision:'enable_creative_execution'}),false);
 assert.equal(h.calls.length,0);
});
test('P18 RPC returning anything other than true never authorizes a review',async()=>{
 const h=fixture('true');
 assert.equal(await h.store.recordDecision(review),false);
});
