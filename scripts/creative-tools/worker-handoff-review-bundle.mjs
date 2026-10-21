/**
 * Read-only TWO-LAYER check: independently pinned reviewer signature scope
 * and exact proposed 12-file manifest bytes. No key generation, filesystem
 * write, install, approval consumption, or privileged operation.
 *
 * The external reviewer identity/policy/nonce still MUST be validated by
 * an independently administered trust channel before any production action.
 */
import {assertReviewedHandoffManifest} from './worker-handoff-verify.mjs';
import {verifyCreativeHandoffReview} from './worker-handoff-review-proof.mjs';

export function inspectCreativeHandoffReviewBundle({
 proof,manifest,trustedReviewerPublicKey,expectedPolicy,now,
}){
 if(!expectedPolicy||typeof expectedPolicy!=='object')throw Error('trusted_review_policy_missing');
 const signature=verifyCreativeHandoffReview(
  proof,trustedReviewerPublicKey,expectedPolicy,now,
 );
 // Require the signed hash and exact separately pinned expected digest to
 // match the actual structured manifest JSON, not merely a signed arbitrary
 // or stale string. The manifest validator rejects authority flags and extras.
 assertReviewedHandoffManifest(manifest,signature.manifestSha256);
 return Object.freeze({
  schema:'omnira.creative.review_bundle_read_only.v1',
  status:'review_signature_and_manifest_bytes_match_not_authorized',
  commitSha:signature.commitSha,
  manifestSha256:signature.manifestSha256,
  reviewerId:signature.reviewerId,
  verifiedFileCount:12,
  cryptographicSignatureValid:true,
  manifestBytesBound:true,
  trustedIdentityProven:false,
  reviewerPolicyApproved:false,
  nonceConsumed:false,
  copyAuthorized:false,
  privilegedBootstrapAuthorized:false,
  workerExecutionEnabled:false,
  productionReady:false,
 });
}
