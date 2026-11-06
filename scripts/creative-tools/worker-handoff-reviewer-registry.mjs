/**
 * Read-only reviewer registry CHECKER, not an enrollment service.
 * The digest MUST be independently pinned through an external trust channel:
 * accepting an attacker-supplied registry + attacker-supplied matching digest
 * does NOT authenticate a real reviewer.
 */
import {createHash,createPublicKey} from 'node:crypto';
import {publicKeyFingerprint} from './worker-handoff-review-proof.mjs';
import {inspectCreativeHandoffReviewBundle} from './worker-handoff-review-bundle.mjs';

export const REVIEWER_REGISTRY_SCHEMA='omnira.creative.reviewers.v1';
const HEX=/^[a-f0-9]{64}$/;
const SHA40=/^[a-f0-9]{40}$/;
const ID=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const REPO='github.com/bumbi190/ai-operating-platform';
const HOST='HULTGREN';
function exact(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||
    Object.keys(o).length!==keys.length||
    Object.keys(o).some(k=>!keys.includes(k)))throw Error('unexpected_reviewer_registry_fields');
}
export function fingerprintCreativeReviewerRegistry(registry){
 return createHash('sha256').update(JSON.stringify(registry)).digest('hex');
}
/**
 * Checks a pinned policy, active reviewer, denied/revoked status, and the
 * 2-person rule; composes the earlier strictly scoped signature+manifest read.
 * NO permission to copy is created by a matching hash/signature.
 */
export function inspectPinnedCreativeReviewer({
 registry,externallyPinnedRegistrySha256,reviewedCommitSha,reviewedManifestSha256,
 independentlyExpectedAuthorId,proof,manifest,now,
}){
 if(typeof externallyPinnedRegistrySha256!=='string'||!HEX.test(externallyPinnedRegistrySha256)){
  throw Error('independent_registry_pin_required');
 }
 if(fingerprintCreativeReviewerRegistry(registry)!==externallyPinnedRegistrySha256){
  throw Error('reviewer_registry_did_not_match_external_pin');
 }
 exact(registry,['schema','repositoryId','targetHost','reviewers']);
 if(registry.schema!==REVIEWER_REGISTRY_SCHEMA||
    registry.repositoryId!==REPO||registry.targetHost!==HOST||
    !Array.isArray(registry.reviewers)||registry.reviewers.length<1||
    registry.reviewers.length>8||typeof reviewedCommitSha!=='string'||!SHA40.test(reviewedCommitSha)||
    typeof reviewedManifestSha256!=='string'||!HEX.test(reviewedManifestSha256)||
    typeof independentlyExpectedAuthorId!=='string'||!ID.test(independentlyExpectedAuthorId)){
  throw Error('untrusted_reviewer_registry_scope');
 }
 if(!proof?.claims||typeof proof.claims!=='object')throw Error('missing_reviewer_proof');
 const claim=proof.claims;
 const reviewer=registry.reviewers.find(r=>r?.reviewerId===claim.reviewerId);
 if(!reviewer)throw Error('reviewer_not_enrolled');
 const ids=new Set();
 for(const r of registry.reviewers){
  exact(r,['reviewerId','status','publicKeySpkiDerBase64','publicKeySha256',
   'approvedRepositoryId','targetHost','independentlyEnrolled']);
  if(typeof r.reviewerId!=='string'||!ID.test(r.reviewerId)||ids.has(r.reviewerId))throw Error('duplicate_or_invalid_reviewer');
  ids.add(r.reviewerId);
  if(!['active','revoked','suspended'].includes(r.status)||
     r.independentlyEnrolled!==true||r.approvedRepositoryId!==REPO||
     r.targetHost!==HOST||typeof r.publicKeySha256!=='string'||!HEX.test(r.publicKeySha256)||
     typeof r.publicKeySpkiDerBase64!=='string'||
     r.publicKeySpkiDerBase64.length>1024||r.publicKeySpkiDerBase64.length<40||
     !/^[A-Za-z0-9+/]+={0,2}$/.test(r.publicKeySpkiDerBase64)){
   throw Error('malformed_reviewer_enrollment');
  }
 }
 if(reviewer.status!=='active')throw Error('reviewer_suspended_or_revoked');
 if(claim.authorId!==independentlyExpectedAuthorId)throw Error('review_author_scope_mismatch');
 if(independentlyExpectedAuthorId===reviewer.reviewerId)throw Error('reviewer_cannot_review_own_code');
 const der=Buffer.from(reviewer.publicKeySpkiDerBase64,'base64');
 if(der.toString('base64')!==reviewer.publicKeySpkiDerBase64||der.length>768){
  throw Error('reviewer_key_encoding_invalid');
 }
 const key=createPublicKey({key:der,format:'der',type:'spki'});
 if(publicKeyFingerprint(key)!==reviewer.publicKeySha256){
  throw Error('reviewer_enrollment_key_pin_invalid');
 }
 const policy={
  repositoryId:REPO,commitSha:reviewedCommitSha,
  manifestSha256:reviewedManifestSha256,
  authorId:independentlyExpectedAuthorId,reviewerId:reviewer.reviewerId,targetHost:HOST,
  reviewerPublicKeySha256:reviewer.publicKeySha256,
 };
 const checked=inspectCreativeHandoffReviewBundle({
  proof,manifest,trustedReviewerPublicKey:key,expectedPolicy:policy,now,
 });
 return Object.freeze({
  schema:'omnira.creative.reviewer_registry_check.v1',
  status:'pinned_registry_and_review_signature_match_not_authorized',
  reviewerId:reviewer.reviewerId,commitSha:checked.commitSha,
  manifestSha256:checked.manifestSha256,
  registryPinMatched:true,reviewSignatureValid:true,
  enrolledKeyMatchesPin:true,
  externalEnrollmentAuthorityEstablished:false,
  reviewerActualIdentityVerified:false,
  reviewerPermissionToCopy:false,nonceConsumed:false,
  bootstrapAuthorized:false,workerExecutionEnabled:false,
  productionReady:false,
 });
}
