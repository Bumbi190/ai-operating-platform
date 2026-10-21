import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {HANDOFF_SCHEMA,plannedEntries} from './worker-handoff-manifest.mjs';
import {canonicalCreativeHandoffReview,publicKeyFingerprint,HANDOFF_REVIEW_SCHEMA}
 from './worker-handoff-review-proof.mjs';
import {inspectPinnedCreativeReviewer,fingerprintCreativeReviewerRegistry,REVIEWER_REGISTRY_SCHEMA}
 from './worker-handoff-reviewer-registry.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const reviewerKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const maliciousKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const keyDer=reviewerKey.publicKey.export({format:'der',type:'spki'}).toString('base64');
const who='independentAuditor';
const git='a'.repeat(40);
const lock={};
for(const [n,v] of [['photocraft','0.10.0'],['filmcraft','0.9.0']]){
 const release=n+'-'+v+'-windows-x64-portable';
 lock[n]={version:v,binaryRelativePath:n+'/portable/'+release+'/'+n+'-cli.exe',
  archiveRelativePath:n+'/'+release+'.zip',sha256:sha('synthetic CLI '+n),
  archiveSha256:sha('synthetic ZIP '+n)};
}
const entries=plannedEntries(lock).map(e=>({
 destination:e.destination,sourceRole:e.sourceRoot,sourceRelative:e.sourceRelative,
 bytes:12,sha256:e.expectedSha256??sha(e.destination),releasePinned:e.expectedSha256!==null,
}));
const manifest={
 schema:HANDOFF_SCHEMA,mode:'read-only-proposed-handoff',entries,entryCount:12,
 fingerprint:sha(JSON.stringify({schema:HANDOFF_SCHEMA,entries})),
 expectedDestinationRoot:'C:\\ProgramData\\OmniraCreativeWorker',
 reviewedCommitRequired:true,independentSignedApprovalRequired:true,
 protectedCopyAndPostCopyAclAuditRequired:true,sourceIsUntrustedUserWritable:true,
 approvalGranted:false,copyPerformed:false,accountActivationAllowed:false,productionReady:false,
};
const manifestHash=sha(JSON.stringify(manifest));
const claims={
 schema:HANDOFF_REVIEW_SCHEMA,purpose:'review_only',
 repositoryId:'github.com/bumbi190/ai-operating-platform',
 commitSha:git,manifestSha256:manifestHash,
 authorId:'authorAndre',reviewerId:who,targetHost:'HULTGREN',
 issuedAt:'2026-10-21T06:00:00.000Z',expiresAt:'2026-10-21T07:00:00.000Z',
 nonce:'abcdef0123456789abcdef0123456789',noCopyAuthority:true,
};
function makeProof(c=claims,key=reviewerKey.privateKey){
 return{claims:c,signature:sign('sha256',canonicalCreativeHandoffReview(c),
  {key,dsaEncoding:'ieee-p1363'}).toString('base64url')};
}
const reviewer={
 reviewerId:who,status:'active',publicKeySpkiDerBase64:keyDer,
 publicKeySha256:publicKeyFingerprint(reviewerKey.publicKey),
 approvedRepositoryId:claims.repositoryId,targetHost:'HULTGREN',
 independentlyEnrolled:true,
};
const registry={
 schema:REVIEWER_REGISTRY_SCHEMA,repositoryId:claims.repositoryId,
 targetHost:'HULTGREN',reviewers:[reviewer],
};
const now=new Date('2026-10-21T06:30:00.000Z');
function check(extras={}){
 const r=extras.registry??registry;
 return inspectPinnedCreativeReviewer({
  registry:r,externallyPinnedRegistrySha256:fingerprintCreativeReviewerRegistry(r),
  reviewedCommitSha:git,reviewedManifestSha256:manifestHash,
  independentlyExpectedAuthorId:claims.authorId,
  proof:makeProof(),manifest,now,...extras,
 });
}
test('an externally pinned test registry + signed review proves matching scope ONLY, not permission',()=>{
 const result=check();
 assert.equal(result.status,'pinned_registry_and_review_signature_match_not_authorized');
 assert.equal(result.registryPinMatched,true);
 assert.equal(result.reviewSignatureValid,true);
 assert.equal(result.enrolledKeyMatchesPin,true);
 assert.equal(result.externalEnrollmentAuthorityEstablished,false);
 assert.equal(result.reviewerActualIdentityVerified,false);
 assert.equal(result.reviewerPermissionToCopy,false);
 assert.equal(result.nonceConsumed,false);
 assert.equal(result.bootstrapAuthorized,false);
 assert.equal(result.workerExecutionEnabled,false);
 assert.equal(result.productionReady,false);
});
test('a missing/mismatched external pin prevents even signature review',()=>{
 assert.throws(()=>check({externallyPinnedRegistrySha256:undefined}),/independent_registry_pin_required/);
 assert.throws(()=>check({externallyPinnedRegistrySha256:'f'.repeat(64)}),/reviewer_registry_did_not_match_external_pin/);
});
test('the author must come from independently pinned project scope, never from the proof',()=>{
 assert.throws(()=>check({independentlyExpectedAuthorId:'anotherAuthor'}),/review_author_scope_mismatch/);
 assert.throws(()=>check({independentlyExpectedAuthorId:undefined}),/untrusted_reviewer_registry_scope/);
});
test('revoked and suspended reviewers cannot pass, even with a valid signature',()=>{
 for(const status of ['revoked','suspended']){
  const updated={...registry,reviewers:[{...reviewer,status}]};
  assert.throws(()=>check({registry:updated}),/reviewer_suspended_or_revoked/);
 }
});
test('unknown reviewer, duplicate registrations and unexpected entries fail closed',()=>{
 const other={...claims,reviewerId:'anotherReviewer'};
 assert.throws(()=>check({proof:makeProof(other)}),/reviewer_not_enrolled/);
 const duplicate={...registry,reviewers:[reviewer,{...reviewer}]};
 assert.throws(()=>check({registry:duplicate}),/duplicate_or_invalid_reviewer/);
 const injected={...registry,productionApproved:true};
 assert.throws(()=>check({registry:injected}),/unexpected_reviewer_registry_fields/);
});
test('forged reviewer public key is rejected by policy pin or cryptographic signature',()=>{
 const replacement={...reviewer,
  publicKeySpkiDerBase64:maliciousKey.publicKey.export({format:'der',type:'spki'}).toString('base64')};
 assert.throws(()=>check({registry:{...registry,reviewers:[replacement]}}),/reviewer_enrollment_key_pin_invalid/);
 const forged={...replacement,publicKeySha256:publicKeyFingerprint(maliciousKey.publicKey)};
 assert.throws(()=>check({registry:{...registry,reviewers:[forged]}}),/reviewer_key_pin_mismatch|independent_review_signature_invalid/);
});
test('self-approved work is refused, even if reviewer ID enrolled',()=>{
 const c={...claims,authorId:who};
 assert.throws(()=>check({proof:makeProof(c)}),/review_author_scope_mismatch|reviewer_cannot_review_own_code|invalid_review_claims/);
 assert.throws(()=>check({independentlyExpectedAuthorId:who}),/review_author_scope_mismatch|reviewer_cannot_review_own_code/);
});
test('an old manifest or wrong commit cannot inherit valid review',()=>{
 assert.throws(()=>check({reviewedCommitSha:'b'.repeat(40)}),/review_scope_mismatch:commitSha/);
 assert.throws(()=>check({reviewedManifestSha256:'c'.repeat(64)}),/review_scope_mismatch:manifestSha256/);
 const mutated=structuredClone(manifest);
 mutated.entries[0].sha256='f'.repeat(64);
 mutated.fingerprint=sha(JSON.stringify({schema:HANDOFF_SCHEMA,entries:mutated.entries}));
 assert.throws(()=>check({manifest:mutated}),/reviewed_manifest_digest_mismatch/);
});
test('malformed reviewer or self-declared review authority is rejected',()=>{
 const r={...reviewer,independentlyEnrolled:false};
 assert.throws(()=>check({registry:{...registry,reviewers:[r]}}),/malformed_reviewer_enrollment/);
 const r2={...reviewer,allowCopy:true};
 assert.throws(()=>check({registry:{...registry,reviewers:[r2]}}),/unexpected_reviewer_registry_fields/);
});
test('proof cannot supply reviewer trust roots or operator copy actions',()=>{
 const forged={...makeProof(),trustedReviewerPublicKey:reviewerKey.publicKey};
 assert.throws(()=>check({proof:forged}),/review_proof_unexpected_fields/);
 const fake={...claims,copyApproved:true};
 assert.throws(()=>makeProof(fake),/review_claims_unexpected_fields/);
});
test('missing enrollments or wrong host/repo always fail',()=>{
 const empty={...registry,reviewers:[]};
 assert.throws(()=>check({registry:empty}),/untrusted_reviewer_registry_scope/);
 assert.throws(()=>check({registry:{...registry,targetHost:'EVIL'}}),/untrusted_reviewer_registry_scope/);
});
test('expired reviewer proofs are rejected even when still registered',()=>{
 assert.throws(()=>check({now:new Date('2026-10-21T07:01:00.000Z')}),/review_proof_expired_or_invalid_window/);
});
