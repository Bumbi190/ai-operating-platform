/**
 * Cryptographic check of a future independently signed CREATIVE HANDOFF REVIEW.
 * Never signs, never loads trusted keys from the proof, never persists state,
 * never grants copy, staged-install, account enablement or execution rights.
 * A separately governed reviewer registry and durable nonce/freshness gate are
 * required beyond this cryptographic verifier.
 */
import {createHash,createPublicKey,verify} from 'node:crypto';

export const HANDOFF_REVIEW_SCHEMA='omnira.creative.handoff_review.v1';
const FIELDS=Object.freeze([
 'schema','purpose','repositoryId','commitSha','manifestSha256','authorId',
 'reviewerId','targetHost','issuedAt','expiresAt','nonce','noCopyAuthority',
]);
const SHA=/^[a-f0-9]{64}$/;
const COMMIT=/^[a-f0-9]{40}$/;
const IDENTIFIER=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const NONCE=/^[A-Za-z0-9_-]{24,64}$/;
const DATE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REPO='github.com/bumbi190/ai-operating-platform';
const HOST='HULTGREN';
const DEST='C:\\ProgramData\\OmniraCreativeWorker';
function exact(obj,fields,label){
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||
   Object.keys(obj).length!==fields.length||
   Object.keys(obj).some(k=>!fields.includes(k)))throw Error(label+'_unexpected_fields');
}
function validClaims(c){
 exact(c,FIELDS,'review_claims');
 if(c.schema!==HANDOFF_REVIEW_SCHEMA||c.purpose!=='review_only'||
   c.repositoryId!==REPO||c.targetHost!==HOST||
   !COMMIT.test(c.commitSha)||!SHA.test(c.manifestSha256)||
   !IDENTIFIER.test(c.authorId)||!IDENTIFIER.test(c.reviewerId)||
   c.authorId===c.reviewerId||!NONCE.test(c.nonce)||
   c.noCopyAuthority!==true||typeof c.issuedAt!=='string'||
   typeof c.expiresAt!=='string'||!DATE.test(c.issuedAt)||!DATE.test(c.expiresAt)||
   !Number.isFinite(Date.parse(c.issuedAt))||
   !Number.isFinite(Date.parse(c.expiresAt))){
  throw Error('invalid_review_claims');
 }
 return c;
}
export function canonicalCreativeHandoffReview(claims){
 validClaims(claims);
 // Fixed domain and order; no JSON key-order ambiguity, zero executable action.
 return Buffer.from('OMNIRA-CREATIVE-HANDOFF-REVIEW-V1\n'+
   FIELDS.map(k=>k+':'+String(claims[k])).join('\n'),'utf8');
}
export function publicKeyFingerprint(publicKey){
 const key=publicKey?.type==='public'&&publicKey?.asymmetricKeyType
  ?publicKey:createPublicKey(publicKey);
 if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1'){
  throw Error('trusted_reviewer_key_must_be_p256');
 }
 return createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
}
/** expected MUST come from a separate, immutable reviewer policy, NOT proof. */
export function verifyCreativeHandoffReview(proof,trustedReviewerPublicKey,expected,now=new Date()){
 exact(proof,['claims','signature'],'review_proof');
 const c=validClaims(proof.claims);
 exact(expected,['repositoryId','commitSha','manifestSha256','authorId',
  'reviewerId','targetHost','reviewerPublicKeySha256'],'expected_review');
 if(expected.repositoryId!==REPO||expected.targetHost!==HOST||
   !SHA.test(expected.reviewerPublicKeySha256)){
  throw Error('untrusted_expected_review_policy');
 }
 for(const field of ['repositoryId','commitSha','manifestSha256',
  'authorId','reviewerId','targetHost']){
  if(expected[field]!==c[field])throw Error('review_scope_mismatch:'+field);
 }
 const issued=Date.parse(c.issuedAt);
 const expires=Date.parse(c.expiresAt);
 const current=now instanceof Date?now.getTime():NaN;
 if(!Number.isFinite(current)||expires<=current||issued>current+30000||
    expires<=issued||expires-issued>60*60*1000){
  throw Error('review_proof_expired_or_invalid_window');
 }
 const key=trustedReviewerPublicKey?.type==='public'&&trustedReviewerPublicKey?.asymmetricKeyType
  ?trustedReviewerPublicKey:createPublicKey(trustedReviewerPublicKey);
 if(publicKeyFingerprint(key)!==expected.reviewerPublicKeySha256){
  throw Error('reviewer_key_pin_mismatch');
 }
 if(typeof proof.signature!=='string'||!(/^[A-Za-z0-9_-]{86}$/).test(proof.signature)){
  throw Error('invalid_review_signature_encoding');
 }
 const sig=Buffer.from(proof.signature,'base64url');
 if(sig.length!==64||sig.toString('base64url')!==proof.signature||
   !verify('sha256',canonicalCreativeHandoffReview(c),
     {key,dsaEncoding:'ieee-p1363'},sig)){
  throw Error('independent_review_signature_invalid');
 }
 return Object.freeze({
  schema:HANDOFF_REVIEW_SCHEMA,status:'signature_valid_authority_unverified',
  reviewerId:c.reviewerId,commitSha:c.commitSha,
  manifestSha256:c.manifestSha256,reviewNonce:c.nonce,
  cryptographicSignatureValid:true,reviewerKeyPinned:true,
  reviewerIdentityIndependentlyVerified:false,
  reviewerPolicyApprovalVerified:false,
  nonceConsumed:false,protectedCopyAuthorized:false,
  elevatedInstallerAuthorized:false,workerExecutionEnabled:false,
  productionReady:false,destination:DEST,
 });
}
