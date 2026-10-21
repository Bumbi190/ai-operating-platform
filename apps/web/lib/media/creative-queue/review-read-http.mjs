/**
 * P20 read-only operator enrollment review HTTP contract.
 * NOT imported by Next route. No activation, DB mutation or media operation.
 * Auth + exact project ownership is enforced by P17 reader below.
 */
import {makeCreativeReviewPreviewReader} from './review-preview.mjs';

export const CREATIVE_REVIEW_READ_DEPLOYED=false;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CREATIVE_REVIEW_READ_PATH='/api/atlas/creative/enrollments/review';

const json=(status,payload)=>new Response(JSON.stringify(payload),{
 status,
 headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store, max-age=0',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'vary':'Cookie',
 }
});
function validOrigin(request,canonicalOrigin){
 if(typeof canonicalOrigin!=='string')return null;
 try{
  const trusted=new URL(canonicalOrigin);
  const target=new URL(request.url);
  if(trusted.username||trusted.password||trusted.pathname!=='/'||
    trusted.search||trusted.hash||
    (trusted.protocol!=='https:' &&
      !(trusted.protocol==='http:' &&
        ['localhost','127.0.0.1'].includes(trusted.hostname))))
    return null;
  if(target.origin!==trusted.origin || target.pathname!==CREATIVE_REVIEW_READ_PATH ||
    target.username||target.password||target.hash)return null;

  // A regular same-origin browser fetch includes Sec-Fetch-Site.
  // Require it for this sensitive JSON preview; other clients fail closed.
  if(request.headers.get('sec-fetch-site')!=='same-origin')return null;
  // Cross-site GET must not be allowed to read private enrollment data,
  // even if cookies accompany it.
  const suppliedOrigin=request.headers.get('origin');
  if(suppliedOrigin && suppliedOrigin!==trusted.origin)return null;

  if(!target.search.startsWith('?enrollmentId='))return null;
  const params=target.searchParams;
  if([...params.keys()].length!==1 || !params.has('enrollmentId'))return null;
  const id=params.get('enrollmentId');
  if(!id || !UUID.test(id) ||
    target.search!=='?enrollmentId='+id)return null;
  return id;
 }catch{return null}
}
export function makeCreativeReviewReadHttpBoundary({
  canonicalOrigin,operator,lookup,projectOwners
}={}){
 if(typeof canonicalOrigin!=='string' ||typeof operator!=='function'||
   typeof lookup!=='function'||typeof projectOwners!=='function')
  throw new Error('trusted creative read HTTP dependencies missing');
 const reader=makeCreativeReviewPreviewReader({operator,lookup,projectOwners});
 return async function getReview(request){
  if(request?.method!=='GET')return json(405,{status:'method_not_allowed'});
  const enrollmentId=validOrigin(request,canonicalOrigin);
  if(!enrollmentId)return json(403,{status:'forbidden'});
  let response;
  try{response=await reader.read(enrollmentId);}
  catch{return json(503,{status:'unavailable'})}
  if(response?.status==='ok' && response.preview){
   const p=response.preview;
   // Strict allowlist: omit database raw key, user data, token, origin,
   // secrets or any additional properties returned by dependencies.
   return json(200,{
    status:'ok',
    review:{
     enrollmentId:p.enrollmentId,workerId:p.workerId,
     projectIds:[...p.projectIds],
     keySha256:p.keySha256,proofSha256:p.proofSha256,
     status:'pending_review',
     reviewSubmissionAvailable:false,
     workerIdentityActivated:false,
     executionAuthorized:false,publishAuthorized:false,
    }
   });
  }
  if(response?.status==='operator_required')return json(401,{status:'operator_required'});
  if(response?.status==='unavailable')return json(503,{status:'unavailable'});
  return json(404,{status:'not_available'});
 }
}
