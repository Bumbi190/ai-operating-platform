/**
 * P13 dormant server-side Supabase shape. No route or privileged grant here.
 * The caller MUST inject a trusted server-only service-role client after
 * session operator checks (begin) and proof-of-possession verification (stage).
 */
const ID=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
function uuids(a) {
 return Array.isArray(a)&&a.length>=1&&a.length<=16&&
   a.every(x=>typeof x==='string'&&UUID.test(x))&&
   a.every((x,i)=>i===0||a[i-1]<x);
}
function utc(s) {
 return typeof s==='string'&&ISO.test(s) &&
  Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
}
// PostgREST often returns timestamptz with +00:00 instead of Z. Normalize
// only server-returned, timezone-explicit values to the exact signed UTC form.
function storedUtc(s) {
 if(typeof s!=='string'||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(s) ||
  !Number.isFinite(Date.parse(s))) return null;
 return new Date(s).toISOString();
}
function safeRecord(v) {
 return v && typeof v==='object' && !Array.isArray(v);
}
export function makeCreativeEnrollmentStore(db) {
 if(!db||typeof db.rpc!=='function'||typeof db.from!=='function') {
  throw new Error('trusted creative enrollment DB missing');
 }
 return Object.freeze({
  async createChallenge(v) {
   if(!safeRecord(v)||!UUID.test(v.enrollmentId)||!UUID.test(v.requestedBy)||
     !ID.test(v.workerId)||!uuids(v.projectIds)||!HASH.test(v.challengeHash)||
     !utc(v.expiresAt)||v.state!=='issued') return false;
   try {
    const {data,error}=await db.rpc('atlas_creative_enrollment_issue_p13',{
      p_enrollment_id:v.enrollmentId,p_worker_id:v.workerId,
      p_requested_by:v.requestedBy,p_project_ids:[...v.projectIds],
      p_challenge_sha256:v.challengeHash,p_expires_at:v.expiresAt
    });
    return !error && data===true;
   } catch {return false;}
  },
  async challengeById(id) {
   if(typeof id!=='string'||!UUID.test(id)) return null;
   try {
    const {data,error}=await db.from('atlas_creative_enrollment_staging')
      .select('enrollment_id,worker_id,project_ids,challenge_sha256,expires_at,requested_by,state')
      .eq('enrollment_id',id).maybeSingle();
    if(error||!safeRecord(data)||
      data.enrollment_id!==id||!ID.test(data.worker_id)||
      !uuids(data.project_ids)||!HASH.test(data.challenge_sha256)||
      !storedUtc(data.expires_at)||!UUID.test(data.requested_by)||
      !['issued','pending_review','rejected','expired'].includes(data.state))
      return null;
    return Object.freeze({
      enrollmentId:data.enrollment_id,workerId:data.worker_id,
      projectIds:Object.freeze([...data.project_ids]),
      challengeHash:data.challenge_sha256,
      expiresAt:storedUtc(data.expires_at),requestedBy:data.requested_by,state:data.state
    });
   }catch{return null;}
  },
  async stageVerifiedProof(v) {
   if(!safeRecord(v)||!UUID.test(v.enrollmentId)||!UUID.test(v.requestedBy)||
     !ID.test(v.workerId)||!ID.test(v.keyId)||!uuids(v.projectIds)||
     !HASH.test(v.challengeHash)||!HASH.test(v.publicKeySha256)||
     !HASH.test(v.canonicalProofHash)||typeof v.publicKeyPem!=='string'||
     v.publicKeyPem.length<80||v.publicKeyPem.length>3000||
     !utc(v.expiresAt)||!utc(v.at)) return false;
   // NOTE: this store does not verify signatures. Only call from
   // makeCreativeEnrollmentService.stage after signature verification.
   try {
    const {data,error}=await db.rpc('atlas_creative_enrollment_stage_p13',{
      p_enrollment_id:v.enrollmentId,p_worker_id:v.workerId,
      p_requested_by:v.requestedBy,p_project_ids:[...v.projectIds],
      p_challenge_sha256:v.challengeHash,p_expires_at:v.expiresAt,
      p_key_id:v.keyId,p_public_key_spki_pem:v.publicKeyPem,
      p_public_key_sha256:v.publicKeySha256,
      p_canonical_proof_sha256:v.canonicalProofHash
    });
    return !error&&data===true;
   } catch{return false;}
  }
 });
}
