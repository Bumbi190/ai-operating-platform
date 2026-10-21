/**
 * P15 private Supabase-compatible shape. Not connected to any HTTP route.
 * Only a trusted server may supply a service-role DB client to this adapter.
 * Operator identity MUST come from resolvePlatformOperator, not request JSON.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const REASON=/^[a-z][a-z0-9_]{2,63}$/;
const VALID=new Set(['approve_registration_only','reject_registration']);
function projects(v){
 return Array.isArray(v)&&v.length>=1&&v.length<=16 &&
 v.every(x=>typeof x==='string'&&UUID.test(x)) &&
 v.every((x,i)=>i===0||v[i-1]<x);
}
export function makeCreativeEnrollmentReviewStore(db) {
 if(!db||typeof db.from!=='function'||typeof db.rpc!=='function')
  throw new Error('trusted review database missing');
 return Object.freeze({
  async getPendingEnrollment(enrollmentId) {
   if(typeof enrollmentId!=='string'||!UUID.test(enrollmentId)) return null;
   try {
    const {data,error}=await db.from('atlas_creative_enrollment_staging')
      .select('enrollment_id,state,public_key_sha256,canonical_proof_sha256,project_ids')
      .eq('enrollment_id',enrollmentId).maybeSingle();
    if(error||!data||data.enrollment_id!==enrollmentId||
      data.state!=='pending_review'||!HASH.test(data.public_key_sha256)||
      !HASH.test(data.canonical_proof_sha256)||!projects(data.project_ids)) return null;
    return Object.freeze({
      enrollmentId:data.enrollment_id,state:data.state,
      keySha256:data.public_key_sha256,
      proofSha256:data.canonical_proof_sha256,
      projectIds:Object.freeze([...data.project_ids])
    });
   } catch {return null;}
  },
  async recordDecision(row) {
   if(!row||typeof row!=='object'||Array.isArray(row)||
     !UUID.test(row.enrollmentId)||!UUID.test(row.reviewerUserId)||
     !VALID.has(row.decision)||!HASH.test(row.keySha256)||
     !HASH.test(row.proofSha256)||!projects(row.projectIds)||
     !HASH.test(row.reviewNonceSha256)||!REASON.test(row.reasonCode))
     return false;
   try {
    const {data,error}=await db.rpc('atlas_creative_enrollment_record_review_p15',{
      p_enrollment_id:row.enrollmentId,p_reviewer_user_id:row.reviewerUserId,
      p_decision:row.decision,p_key_sha256:row.keySha256,
      p_proof_sha256:row.proofSha256,p_project_ids:[...row.projectIds],
      p_review_nonce_sha256:row.reviewNonceSha256,
      p_reason_code:row.reasonCode
    });
    return !error&&data===true;
   } catch {return false;}
  }
 });
}
