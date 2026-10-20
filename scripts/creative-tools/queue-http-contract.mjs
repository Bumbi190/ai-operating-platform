/**
 * Node Request/Response HTTP adapter prototype, not registered as a Next route.
 * All trust primitives must be injected from a real authenticated server:
 * no user/model-provided "approved" flags and no code-broker authority reuse.
 */
import { verifySignedCreativeTicket } from './signed-queue.mjs';
export const CREATIVE_HTTP_PRODUCTION_ENABLED=false;
export const CREATIVE_BODY_LIMIT=512;
const ID=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/;

function answer(status,body) {
  return new Response(JSON.stringify(body),{
    status,headers:{'Cache-Control':'no-store','Content-Type':'application/json'}
  });
}
export async function readCreativeBody(request,limit=CREATIVE_BODY_LIMIT) {
  const contentType=request.headers.get('content-type');
  if(!contentType || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    return {kind:'unsupported'};
  }
  const declared=request.headers.get('content-length');
  if(declared!==null && (!/^\d+$/.test(declared) || Number(declared)>limit)) {
    return {kind:'oversized'};
  }
  const reader=request.body?.getReader();
  if(!reader) return {kind:'invalid'};
  let length=0;
  const chunks=[];
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done) break;
      length+=value.byteLength;
      if(length>limit) {
        await reader.cancel().catch(()=>{});
        return {kind:'oversized'};
      }
      chunks.push(value);
    }
    const raw=Buffer.concat(chunks).toString('utf8');
    return {kind:'ok',raw};
  } catch {
    return {kind:'invalid'};
  } finally {
    try {reader.releaseLock();} catch {}
  }
}
function parseClaim(raw) {
  try {
    const parsed=JSON.parse(raw);
    if(!parsed || typeof parsed!=='object' || Array.isArray(parsed) ||
      Object.keys(parsed).length!==1 || !ID.test(parsed.workId)) return null;
    return parsed;
  } catch {return null;}
}
/**
 * TEST-ONLY integration seam, until deployed under a reviewed host adapter.
 * authenticateWorker MUST verify signed worker request, freshness/replay,
 * device enrollment and creative-only scope. claimAtomic MUST be transactional.
 */
export async function handleCreativeQueueClaim(request,deps) {
  if(request?.method!=='POST') return answer(405,{ok:false,error:'method_not_allowed'});
  const body=await readCreativeBody(request);
  if(body.kind==='oversized') return answer(413,{ok:false,error:'request_too_large'});
  if(body.kind!=='ok') return answer(400,{ok:false,error:'invalid_request'});
  if(!deps || deps.pilot!==true || typeof deps.authenticateWorker!=='function' ||
    typeof deps.claimAtomic!=='function' || typeof deps.now!=='function' ||
    !deps.trustedServerKey) {
    return answer(503,{ok:false,error:'unavailable'});
  }
  let worker;
  try {worker=await deps.authenticateWorker(request,body.raw);} catch {worker=null;}
  if(!worker || worker.authenticated!==true || worker.creativeCapability!==true ||
    !ID.test(worker.workerId) || !Array.isArray(worker.allowedProjectIds)) {
    return answer(401,{ok:false,error:'unauthorized'});
  }
  const parsed=parseClaim(body.raw);
  if(!parsed) return answer(400,{ok:false,error:'invalid_request'});
  let claimed;
  try {
    claimed=await deps.claimAtomic({workId:parsed.workId,workerId:worker.workerId,
      allowedProjectIds:[...worker.allowedProjectIds]});
  } catch {
    return answer(503,{ok:false,error:'unavailable'});
  }
  if(!claimed) return answer(404,{ok:false,error:'not_available'});
  try {
    const {ticket,expected}=claimed;
    if(expected.workerId!==worker.workerId ||
       !worker.allowedProjectIds.includes(expected.projectId)) {
      return answer(403,{ok:false,error:'scope_rejected'});
    }
    const attestation=verifySignedCreativeTicket(
      ticket,deps.trustedServerKey,expected,deps.now());
    if(attestation.workId!==parsed.workId ||
       attestation.executionAuthorized!==false) throw new Error('mismatched claim');
    return answer(200,{ok:true,workId:attestation.workId,
      status:'claimed-no-execution',executionAuthorized:false,
      publishAuthorized:false,ticket});
  } catch {
    return answer(409,{ok:false,error:'claim_integrity_rejected'});
  }
}
