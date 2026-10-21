/**
 * P15: human operator review of verified creative enrollment evidence.
 * "approve_registration_only" never creates/enables the worker identity,
 * authorizes execution or publishes media. NO routes.
 * Real store must revalidate status+hash+scope and atomically append decision.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const REASON=/^[a-z][a-z0-9_]{2,63}$/;
const DECISIONS=new Set(['approve_registration_only','reject_registration']);
function projects(v) {
 return Array.isArray(v) && v.length>=1 && v.length<=16 &&
  v.every(x=>typeof x==='string'&&UUID.test(x)) &&
  v.every((x,i)=>i===0||v[i-1]<x);
}
export function makeCreativeEnrollmentReviewService({operator,store}={}) {
 if(typeof operator!=='function'||!store||
   typeof store.getPendingEnrollment!=='function' ||
   typeof store.recordDecision!=='function')
   throw new Error('trusted creative review dependencies missing');
 return Object.freeze({
   async review(request){
     const op=await operator();
     if(!op?.ok||!UUID.test(op.userId)) return {status:'operator_required'};
     if(!request || typeof request!=='object'||Array.isArray(request) ||
       Object.keys(request).length!==7 ||
       !UUID.test(request.enrollmentId) || !DECISIONS.has(request.decision) ||
       !HASH.test(request.expectedKeySha256) ||
       !HASH.test(request.expectedProofSha256) ||
       !projects(request.projectIds)||!HASH.test(request.reviewNonceSha256) ||
       !REASON.test(request.reasonCode)) return {status:'invalid_request'};
     let pending;
     try {pending=await store.getPendingEnrollment(request.enrollmentId)}
     catch {return {status:'unavailable'}}
     if(!pending||pending.enrollmentId!==request.enrollmentId ||
       pending.state!=='pending_review'||
       pending.keySha256!==request.expectedKeySha256 ||
       pending.proofSha256!==request.expectedProofSha256 ||
       !projects(pending.projectIds) ||
       JSON.stringify(pending.projectIds)!==JSON.stringify(request.projectIds))
       return {status:'not_available'};
     // Platform operator identity and project access MUST be server-derived.
     // The injected store must recheck these exact fields under a row lock.
     // This response NEVER conveys media execution authorization.
     try {
       const saved=await store.recordDecision({
         enrollmentId:request.enrollmentId,reviewerUserId:op.userId,
         decision:request.decision,keySha256:request.expectedKeySha256,
         proofSha256:request.expectedProofSha256,
         projectIds:[...request.projectIds],
         reviewNonceSha256:request.reviewNonceSha256,
         reasonCode:request.reasonCode
       });
       if(saved!==true) return {status:'conflict'};
       return Object.freeze({
         status:'recorded_for_separate_activation_review',
         enrollmentId:request.enrollmentId,
         decision:request.decision,
         workerIdentityActivated:false,
         executionAuthorized:false,publishAuthorized:false,
       });
     }catch{return {status:'unavailable'}}
   }
 });
}
