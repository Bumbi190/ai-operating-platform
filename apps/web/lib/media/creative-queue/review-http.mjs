/**
 * P18: closed-shape, same-origin CREATIVE enrollment review request boundary.
 * PURE TESTED SEAM ONLY. No Next route imports this; no public endpoint or
 * approval button is enabled. Worker activation is categorically impossible.
 */
import {makeCreativeEnrollmentReviewService} from './review-core.mjs';

export const CREATIVE_REVIEW_HTTP_LIVE=false;
export const CREATIVE_REVIEW_POST_PATH='/api/atlas/creative/enrollments/review';
const MAX_BYTES=2048;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const DECISIONS=new Set(['approve_registration_only','reject_registration']);
const KEYS=['confirmation','decision','enrollmentId','expectedKeySha256',
 'expectedProofSha256','projectIds','reasonCode','reviewNonceSha256'];
const REASON=/^[a-z][a-z0-9_]{2,63}$/;
const ACK={
 approve_registration_only:'GODKÄNN ENDAST REGISTRERING',
 reject_registration:'NEKA REGISTRERING',
};
function response(status,code) {
 return new Response(JSON.stringify({status:code}),{
  status,headers:{'content-type':'application/json','cache-control':'no-store'}
 });
}
function exactProjectList(ids) {
 return Array.isArray(ids)&&ids.length>=1&&ids.length<=16 &&
  ids.every(s=>typeof s==='string'&&UUID.test(s)) &&
  ids.every((s,i)=>i===0||ids[i-1]<s);
}
function parseBody(raw) {
 try {
  const record=JSON.parse(raw);
  if(!record||typeof record!=='object'||Array.isArray(record) ||
   Object.keys(record).length!==KEYS.length||
   Object.keys(record).some(k=>!KEYS.includes(k)) ||
   !UUID.test(record.enrollmentId)||
   !DECISIONS.has(record.decision)||
   record.confirmation!==ACK[record.decision] ||
   !HASH.test(record.expectedKeySha256)||
   !HASH.test(record.expectedProofSha256)||
   !HASH.test(record.reviewNonceSha256)||
   !exactProjectList(record.projectIds)||
   typeof record.reasonCode!=='string'||!REASON.test(record.reasonCode))
   return null;
  // Do NOT forward transport-only acknowledgment, operator/user IDs, store,
  // clock, inherited object keys or any other untrusted dependency.
  return Object.freeze({
   enrollmentId:record.enrollmentId,decision:record.decision,
   expectedKeySha256:record.expectedKeySha256,
   expectedProofSha256:record.expectedProofSha256,
   projectIds:Object.freeze([...record.projectIds]),
   reviewNonceSha256:record.reviewNonceSha256,reasonCode:record.reasonCode,
  });
 }catch {return null}
}
async function boundedBody(request) {
 const len=request.headers.get('content-length');
 if(len!==null&&(!/^\d+$/.test(len)||Number(len)>MAX_BYTES))
  return null;
 if(!request.body) return null;
 const reader=request.body.getReader();
 const chunks=[];let total=0;
 try {
  for(;;) {
   const {done,value}=await reader.read();
   if(done) break;
   total+=value.byteLength;
   if(total>MAX_BYTES){await reader.cancel().catch(()=>{});return null}
   chunks.push(value);
  }
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
 }catch {return null}
 finally {try{reader.releaseLock()}catch{}}
}
function originValid(request,configuredOrigin) {
 if(typeof configuredOrigin!=='string') return false;
 try {
  const trusted=new URL(configuredOrigin),req=new URL(request.url);
  if(trusted.username||trusted.password||trusted.pathname!=='/'||
    trusted.search||trusted.hash ||
    !['https:','http:'].includes(trusted.protocol)) return false;
  if(trusted.protocol==='http:'&&!['localhost','127.0.0.1'].includes(trusted.hostname))
    return false;
  if(req.origin!==trusted.origin||req.pathname!==CREATIVE_REVIEW_POST_PATH||
    req.search||req.hash||req.username||req.password) return false;
  const origin=request.headers.get('origin');
  if(origin!==trusted.origin) return false;
  const fetchSite=request.headers.get('sec-fetch-site');
  if(fetchSite!==null && fetchSite!=='same-origin') return false;
  return true;
 }catch{return false}
}
/**
 * Trusted dependencies: server-configured expectedOrigin, session operator,
 * project-owner DB lookup, and durable P15 store. No cookie-provided or
 * browser-provided operator identity or project grant is trusted.
 */
export function makeCreativeReviewHttpBoundary(deps) {
 if(!deps||typeof deps.operator!=='function'||
   typeof deps.projectOwners!=='function'||!deps.store||
   typeof deps.store.getPendingEnrollment!=='function'||
   typeof deps.store.recordDecision!=='function'||
   typeof deps.expectedOrigin!=='string')
  throw new Error('trusted creative review HTTP dependencies missing');
 return async function handle(request){
  if(request?.method!=='POST') return response(405,'method_not_allowed');
  if(!originValid(request,deps.expectedOrigin))
   return response(403,'forbidden');
  if(request.headers.get('x-omnira-creative-review')!=='review.v1')
   return response(403,'forbidden');
  const contentType=request.headers.get('content-type');
  if(!contentType||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType))
   return response(415,'unsupported_media_type');
  const raw=await boundedBody(request);
  if(raw===null)return response(413,'invalid_or_oversized_request');
  const scoped=parseBody(raw);
  if(!scoped)return response(400,'invalid_request');
  let op;
  try {op=await deps.operator()}catch {return response(401,'operator_required')}
  if(!op?.ok||!UUID.test(op.userId))
   return response(401,'operator_required');
  let records;
  try {records=await deps.projectOwners([...scoped.projectIds])}
  catch{return response(503,'unavailable')}
  if(!Array.isArray(records)||records.length!==scoped.projectIds.length||
   records.some(row=>!row||!UUID.test(row.id)||!UUID.test(row.ownerId)||
      row.ownerId!==op.userId)||
   new Set(records.map(row=>row.id)).size!==records.length ||
   records.map(row=>row.id).sort().join(',')!==scoped.projectIds.join(','))
   return response(404,'not_available');
  // Review-domain rechecks pending status and signed evidence against
  // trusted storage; P15 RPC atomically latches exactly one review.
  const service=makeCreativeEnrollmentReviewService({
   operator:async()=>op,store:deps.store
  });
  const result=await service.review(scoped);
  if(result.status==='recorded_for_separate_activation_review')
   return new Response(JSON.stringify({
    status:'recorded_for_separate_activation_review',
    workerIdentityActivated:false,executionAuthorized:false,
    publishAuthorized:false
   }),{status:200,headers:{'content-type':'application/json','cache-control':'no-store'}});
  if(result.status==='invalid_request')return response(400,'invalid_request');
  if(result.status==='unavailable')return response(503,'unavailable');
  return response(409,'not_available');
 };
}
