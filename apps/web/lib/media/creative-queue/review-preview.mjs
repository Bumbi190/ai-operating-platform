/**
 * Creative P17: read-only, server-owned operator review projection.
 * Not a route; NO submission, approval, enrollment activation or execution.
 */
export const CREATIVE_REVIEW_UI_LIVE=false;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKER=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const SHA=/^[a-f0-9]{64}$/;
function exactProjects(ids){
 return Array.isArray(ids)&&ids.length>=1&&ids.length<=16 &&
  ids.every(id=>typeof id==='string'&&UUID.test(id)) &&
  ids.every((id,i)=>i===0||ids[i-1]<id);
}
export function makeCreativeReviewPreviewReader({operator,lookup,projectOwners}={}){
 if(typeof operator!=='function'||typeof lookup!=='function' ||
    typeof projectOwners!=='function') throw new Error('trusted review preview dependencies missing');
 return Object.freeze({
   async read(enrollmentId) {
     // Validate ID and operator BEFORE any database lookup.
     if(typeof enrollmentId!=='string'||!UUID.test(enrollmentId))
       return {status:'invalid_request'};
     let principal;
     try{principal=await operator()}catch{return {status:'operator_required'}}
     if(!principal?.ok||typeof principal.userId!=='string'||!UUID.test(principal.userId))
       return {status:'operator_required'};
     let pending;
     try{pending=await lookup(enrollmentId)}catch{return {status:'unavailable'}}
     if(!pending||pending.enrollmentId!==enrollmentId||
       pending.state!=='pending_review'||!WORKER.test(pending.workerId)||
       !UUID.test(pending.requestedBy)||!exactProjects(pending.projectIds)||
       !SHA.test(pending.keySha256)||!SHA.test(pending.proofSha256))
       return {status:'not_available'};
     let owners;
     try {owners=await projectOwners([...pending.projectIds]);}
     catch{return {status:'unavailable'}}
     // Must prove every exact UUID belongs to this session user. A single
     // owned project must not confer rights over other projects.
     if(!Array.isArray(owners)||owners.length!==pending.projectIds.length ||
       owners.some(o=>!o||typeof o!=='object' ||
         !UUID.test(o.id)||!UUID.test(o.ownerId)||
         o.ownerId!==principal.userId) ||
       new Set(owners.map(o=>o.id)).size!==owners.length ||
       owners.map(o=>o.id).sort().join(',')!==pending.projectIds.join(','))
       return {status:'not_permitted'};
     return {status:'ok',preview:Object.freeze({
       enrollmentId,workerId:pending.workerId,
       projectIds:Object.freeze([...pending.projectIds]),
       keySha256:pending.keySha256,proofSha256:pending.proofSha256,
       status:'pending_review',
       reviewSubmissionAvailable:false,
       workerIdentityActivated:false,
       executionAuthorized:false,publishAuthorized:false,
     })};
   }
 });
}
