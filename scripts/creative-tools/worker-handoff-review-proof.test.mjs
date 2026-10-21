import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {canonicalCreativeHandoffReview,verifyCreativeHandoffReview,
 publicKeyFingerprint,HANDOFF_REVIEW_SCHEMA} from './worker-handoff-review-proof.mjs';

const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const attacker=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const x25519=generateKeyPairSync('ed25519');
const claims={
 schema:HANDOFF_REVIEW_SCHEMA,purpose:'review_only',
 repositoryId:'github.com/bumbi190/ai-operating-platform',
 commitSha:'a'.repeat(40),manifestSha256:'b'.repeat(64),
 authorId:'authorAndre',reviewerId:'independentReviewer',
 targetHost:'HULTGREN',
 issuedAt:'2026-10-21T06:55:00.000Z',
 expiresAt:'2026-10-21T07:45:00.000Z',
 nonce:'0123456789abcdef0123456789abcdef',
 noCopyAuthority:true,
};
const expected={
 repositoryId:claims.repositoryId,commitSha:claims.commitSha,
 manifestSha256:claims.manifestSha256,authorId:claims.authorId,
 reviewerId:claims.reviewerId,targetHost:claims.targetHost,
 reviewerPublicKeySha256:publicKeyFingerprint(keys.publicKey),
};
const now=new Date('2026-10-21T07:10:00.000Z');
function proof(c=claims,key=keys.privateKey){
 return{claims:c,signature:sign('sha256',canonicalCreativeHandoffReview(c),{
  key,dsaEncoding:'ieee-p1363',
 }).toString('base64url')};
}
test('valid independently pinned P-256 review proves only cryptography, never copy authority',()=>{
 const r=verifyCreativeHandoffReview(proof(),keys.publicKey,expected,now);
 assert.equal(r.cryptographicSignatureValid,true);
 assert.equal(r.reviewerKeyPinned,true);
 assert.equal(r.reviewerIdentityIndependentlyVerified,false);
 assert.equal(r.reviewerPolicyApprovalVerified,false);
 assert.equal(r.nonceConsumed,false);
 assert.equal(r.protectedCopyAuthorized,false);
 assert.equal(r.elevatedInstallerAuthorized,false);
 assert.equal(r.workerExecutionEnabled,false);
 assert.equal(r.productionReady,false);
 assert.equal(r.manifestSha256,claims.manifestSha256);
 assert.equal(r.commitSha,claims.commitSha);
});
test('canonical bytes are domain separated and independent of JSON insertion order',()=>{
 const reversed=Object.fromEntries(Object.entries(claims).reverse());
 assert.deepEqual(canonicalCreativeHandoffReview(reversed),canonicalCreativeHandoffReview(claims));
 assert.match(canonicalCreativeHandoffReview(claims).toString(),/^OMNIRA-CREATIVE-HANDOFF-REVIEW-V1\n/);
 assert.notDeepEqual(canonicalCreativeHandoffReview(claims),Buffer.from(JSON.stringify(claims)));
});
test('reviewer cannot approve their own change even with valid signature',()=>{
 assert.throws(()=>canonicalCreativeHandoffReview({...claims,reviewerId:claims.authorId}),
  /invalid_review_claims/);
});
test('a correct signature for a DIFFERENT commit is rejected by pinned scope',()=>{
 const changed={...claims,commitSha:'c'.repeat(40)};
 assert.throws(()=>verifyCreativeHandoffReview(proof(changed),keys.publicKey,expected,now),
  /review_scope_mismatch:commitSha/);
});
test('a valid signature for a changed manifest is rejected',()=>{
 const changed={...claims,manifestSha256:'c'.repeat(64)};
 assert.throws(()=>verifyCreativeHandoffReview(proof(changed),keys.publicKey,expected,now),
  /review_scope_mismatch:manifestSha256/);
});
test('different author, reviewer, host and repo cannot be substituted',()=>{
 for(const [field,value] of [
  ['authorId','otherAuthor'],['reviewerId','otherReviewer'],
  ['targetHost','ANOTHER'],['repositoryId','github.com/evil/other'],
 ]){
  const c={...claims,[field]:value};
  assert.throws(()=>verifyCreativeHandoffReview(proof(c),keys.publicKey,expected,now),
   /invalid_review_claims|review_scope_mismatch/);
 }
});
test('the trusted reviewer public key MUST match the out-of-band fingerprint',()=>{
 assert.throws(()=>verifyCreativeHandoffReview(proof(),attacker.publicKey,expected,now),
  /reviewer_key_pin_mismatch/);
 assert.throws(()=>verifyCreativeHandoffReview(proof(claims,attacker.privateKey),
  keys.publicKey,expected,now),/independent_review_signature_invalid/);
});
test('Ed25519 and other non-P256 keys are refused',()=>{
 assert.throws(()=>publicKeyFingerprint(x25519.publicKey),/trusted_reviewer_key_must_be_p256/);
 assert.throws(()=>verifyCreativeHandoffReview(proof(),x25519.publicKey,expected,now),
  /trusted_reviewer_key_must_be_p256/);
});
test('unknown or injected fields can never influence review semantics',()=>{
 for(const c of [
  {...claims,copyAuthorized:true},
  {...claims,purpose:'run_installation'},
  {...claims,noCopyAuthority:false},
  {...claims,schema:'omnira.creative.approval.v1'},
 ]){
  assert.throws(()=>canonicalCreativeHandoffReview(c),/invalid_review_claims|unexpected_fields/);
 }
 const good=proof();
 assert.throws(()=>verifyCreativeHandoffReview({...good,publicKey:attacker.publicKey},
  keys.publicKey,expected,now),/review_proof_unexpected_fields/);
 assert.throws(()=>verifyCreativeHandoffReview(good,keys.publicKey,
  {...expected,allowCopy:true},now),/expected_review_unexpected_fields/);
});
test('expired, future, overlong and zero-length grants are refused',()=>{
 for(const c of [
  {...claims,expiresAt:'2026-10-21T07:10:00.000Z'},
  {...claims,issuedAt:'2026-10-21T08:30:00.000Z',expiresAt:'2026-10-21T09:00:00.000Z'},
  {...claims,expiresAt:'2026-10-21T09:10:00.000Z'},
  {...claims,expiresAt:claims.issuedAt},
 ]){
  assert.throws(()=>verifyCreativeHandoffReview(proof(c),keys.publicKey,expected,now),
   /review_proof_expired_or_invalid_window/);
 }
});
test('tampered proof signature and noncanonical signature encoding are rejected',()=>{
 const valid=proof();
 assert.throws(()=>verifyCreativeHandoffReview({...valid,signature:'A'+valid.signature.slice(1)},
  keys.publicKey,expected,now),/independent_review_signature_invalid/);
 assert.throws(()=>verifyCreativeHandoffReview({...valid,signature:'0x'+valid.signature},
  keys.publicKey,expected,now),/invalid_review_signature_encoding/);
});
test('verification is replayable by design and cannot claim durable nonce consumption',()=>{
 const p=proof();
 const first=verifyCreativeHandoffReview(p,keys.publicKey,expected,now);
 const second=verifyCreativeHandoffReview(p,keys.publicKey,expected,now);
 assert.equal(first.nonceConsumed,false);
 assert.equal(second.nonceConsumed,false);
 assert.equal(first.protectedCopyAuthorized,false);
 assert.equal(second.protectedCopyAuthorized,false);
});
test('expected scope must be complete and immutable from a separate trust channel',()=>{
 assert.throws(()=>verifyCreativeHandoffReview(proof(),keys.publicKey,
  {...expected,reviewerPublicKeySha256:'not-a-digest'},now),/untrusted_expected_review_policy/);
 assert.throws(()=>verifyCreativeHandoffReview(proof(),keys.publicKey,
  {...expected,commitSha:'x'.repeat(40)},now),/review_scope_mismatch:commitSha/);
 assert.throws(()=>verifyCreativeHandoffReview(proof(),keys.publicKey,
  {...expected,targetHost:'another-host'},now),/untrusted_expected_review_policy/);
});
