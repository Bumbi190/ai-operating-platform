/**
 * P13: two-step P-256 proof-of-possession for a creative-only worker identity.
 * Results may only be PENDING_REVIEW. Neither step enables an account,
 * grants creative execution, creates an API route, or writes production SQL.
 *
 * A trusted server MUST inject: session-derived operator (begin only), a
 * transactional challenge store, a secure random source and clock.
 */
import {createHash,createPublicKey,verify,randomBytes,randomUUID} from 'node:crypto';

export const ENROLLMENT_DOMAIN='omnira.creative.worker.enrollment.v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WORKER=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const CHALLENGE=/^[A-Za-z0-9_-]{43}$/;
const SIGNATURE=/^[A-Za-z0-9_-]{86}$/;
const TTL=300000;
const sha=s=>createHash('sha256').update(s).digest('hex');
const fields=['schema','enrollmentId','workerId','keyId','challenge','expiresAt','projectIds','publicKeyPem','signature'];

function projects(v){
  return Array.isArray(v) && v.length>=1 && v.length<=16 &&
    v.every(s=>typeof s==='string'&&UUID.test(s)) &&
    v.every((s,i)=>i===0 || v[i-1]<s);
}
function iso(v){
  return typeof v==='string'&& /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v;
}
function publicKeyInfo(pem){
  if(typeof pem!=='string'||pem.length>3000||pem.length<80) throw new Error('invalid worker public key');
  const key=createPublicKey(pem);
  if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1') {
    throw new Error('creative worker must use P-256');
  }
  const der=key.export({format:'der',type:'spki'});
  return {key,fingerprint:sha(der)};
}
export function canonicalCreativeEnrollment(value){
  if(!value || typeof value!=='object'||Array.isArray(value) ||
    value.schema!==ENROLLMENT_DOMAIN || !UUID.test(value.enrollmentId) ||
    !WORKER.test(value.workerId)||!WORKER.test(value.keyId) ||
    !CHALLENGE.test(value.challenge)||!iso(value.expiresAt)||
    !projects(value.projectIds)) throw new Error('invalid creative enrollment scope');
  const {fingerprint}=publicKeyInfo(value.publicKeyPem);
  return Buffer.from([
    ENROLLMENT_DOMAIN, 'enrollment_id:'+value.enrollmentId,
    'worker_id:'+value.workerId,'key_id:'+value.keyId,
    'challenge:'+value.challenge,'expires_at:'+value.expiresAt,
    'projects:'+value.projectIds.join(','),
    'public_key_sha256:'+fingerprint
  ].join('\n'),'utf8');
}
function validateProof(proof){
  if(!proof || typeof proof!=='object'||Array.isArray(proof) ||
    Object.keys(proof).length!==fields.length ||
    Object.keys(proof).some(k=>!fields.includes(k)) ||
    typeof proof.signature!=='string' || !SIGNATURE.test(proof.signature))
    throw new Error('invalid creative proof');
  const signature=Buffer.from(proof.signature,'base64url');
  if(signature.length!==64||signature.toString('base64url')!==proof.signature)
    throw new Error('invalid signature encoding');
  return signature;
}

export function makeCreativeEnrollmentService({operator,store,now=()=>new Date(),
  createId=randomUUID,createChallenge=()=>randomBytes(32).toString('base64url')}={}) {
  if(typeof operator!=='function'||!store||
    typeof store.createChallenge!=='function'||
    typeof store.challengeById!=='function'||
    typeof store.stageVerifiedProof!=='function' ||
    typeof now!=='function' || typeof createId!=='function' ||
    typeof createChallenge!=='function') throw new Error('trusted creative enrollment dependencies missing');

  return Object.freeze({
    async begin({workerId,projectIds}={}){
      const auth=await operator();
      if(!auth?.ok || !UUID.test(auth.userId)) return {status:'operator_required'};
      if(!WORKER.test(workerId)||!projects(projectIds)) return {status:'invalid_request'};
      const enrollmentId=createId(), challenge=createChallenge();
      const stamp=now();
      if(!UUID.test(enrollmentId)||!CHALLENGE.test(challenge)||
        !(stamp instanceof Date)||!Number.isFinite(stamp.getTime())) return {status:'unavailable'};
      const expiresAt=new Date(stamp.getTime()+TTL).toISOString();
      const record={
        enrollmentId,workerId,projectIds:[...projectIds],
        challengeHash:sha(ENROLLMENT_DOMAIN+'\n'+enrollmentId+'\n'+challenge),
        expiresAt,requestedBy:auth.userId,state:'issued'
      };
      try{
        if(await store.createChallenge(record)!==true) return {status:'conflict'};
        return {status:'ok',enrollment:{
          schema:ENROLLMENT_DOMAIN,enrollmentId,workerId,projectIds:[...projectIds],
          challenge,expiresAt,approvalStatus:'not_approved',
          executionAuthorized:false,publishAuthorized:false
        }};
      }catch{return {status:'unavailable'}}
    },
    async stage(proof){
      try{
        const sig=validateProof(proof);
        const canonical=canonicalCreativeEnrollment(proof);
        const record=await store.challengeById(proof.enrollmentId);
        if(!record || record.state!=='issued' ||
          record.enrollmentId!==proof.enrollmentId ||
          record.workerId!==proof.workerId ||
          !projects(record.projectIds) ||
          JSON.stringify(record.projectIds)!==JSON.stringify(proof.projectIds) ||
          record.expiresAt!==proof.expiresAt ||
          !UUID.test(record.requestedBy) ||
          record.challengeHash!==sha(ENROLLMENT_DOMAIN+'\n'+proof.enrollmentId+'\n'+proof.challenge))
          return {status:'rejected'};
        const nowMs=now().getTime(), expires=Date.parse(record.expiresAt);
        if(expires<=nowMs || expires-nowMs>TTL || !Number.isFinite(nowMs)) return {status:'expired'};
        const {key,fingerprint}=publicKeyInfo(proof.publicKeyPem);
        if(!verify('sha256',canonical,{key,dsaEncoding:'ieee-p1363'},sig))
          return {status:'rejected'};
        // The persistence boundary MUST re-check issued state, challenge hash,
        // proof hash, and expiry under a lock before one-time staging.
        const staged=await store.stageVerifiedProof({
          enrollmentId:record.enrollmentId,workerId:record.workerId,
          keyId:proof.keyId,projectIds:[...record.projectIds],
          publicKeyPem:proof.publicKeyPem,publicKeySha256:fingerprint,
          canonicalProofHash:sha(canonical),
          challengeHash:record.challengeHash,requestedBy:record.requestedBy,
          expiresAt:record.expiresAt,at:new Date(nowMs).toISOString()
        });
        if(staged!==true) return {status:'rejected'};
        return {status:'pending_review',enrollmentId:record.enrollmentId,
          workerId:record.workerId,operatorApprovalVerified:false,
          executionAuthorized:false,publishAuthorized:false};
      }catch{return {status:'rejected'}}
    }
  });
}
