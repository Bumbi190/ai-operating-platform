/**
 * P18 guarded review-store adapter: P18 SQL rechecks every project owner
 * under a PostgreSQL lock, then invokes immutable P15 review evidence.
 * No live route, no worker activation, no browser privileges.
 */
import {makeCreativeEnrollmentReviewStore} from './review-store.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const REASON=/^[a-z][a-z0-9_]{2,63}$/;
const ACTIONS=new Set(['approve_registration_only','reject_registration']);
function projects(v){
 return Array.isArray(v)&&v.length>=1&&v.length<=16 &&
  v.every(x=>typeof x==='string'&&UUID.test(x)) &&
  v.every((x,i)=>i===0||v[i-1]<x);
}
export function makeCreativeOwnerGuardedReviewStore(db) {
 if(!db||typeof db.from!=='function'||typeof db.rpc!=='function')
  throw new Error('trusted P18 review database missing');
 const prior=makeCreativeEnrollmentReviewStore(db);
 return Object.freeze({
  getPendingEnrollment:prior.getPendingEnrollment,
  async recordDecision(v) {
   if(!v||typeof v!=='object'||Array.isArray(v)||
     !UUID.test(v.enrollmentId)||!UUID.test(v.reviewerUserId)||
     !ACTIONS.has(v.decision)||!HASH.test(v.keySha256)||
     !HASH.test(v.proofSha256)||!projects(v.projectIds)||
     !HASH.test(v.reviewNonceSha256)||!REASON.test(v.reasonCode))
    return false;
   try {
    const {data,error}=await db.rpc('atlas_creative_enrollment_record_review_p18',{
     p_enrollment_id:v.enrollmentId,p_reviewer_user_id:v.reviewerUserId,
     p_decision:v.decision,p_key_sha256:v.keySha256,
     p_proof_sha256:v.proofSha256,p_project_ids:[...v.projectIds],
     p_review_nonce_sha256:v.reviewNonceSha256,
     p_reason_code:v.reasonCode,
    });
    return !error&&data===true;
   }catch {return false}
  }
 });
}
