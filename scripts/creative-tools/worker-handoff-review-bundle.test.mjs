import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {plannedEntries,HANDOFF_SCHEMA} from './worker-handoff-manifest.mjs';
import {canonicalCreativeHandoffReview,publicKeyFingerprint,HANDOFF_REVIEW_SCHEMA}
 from './worker-handoff-review-proof.mjs';
import {inspectCreativeHandoffReviewBundle} from './worker-handoff-review-bundle.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const reviewer2=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const lock={};
for(const [name,version] of [['photocraft','0.10.0'],['filmcraft','0.9.0']]){
 const release=name+'-'+version+'-windows-x64-portable';
 lock[name]={
  version,archiveRelativePath:name+'/'+release+'.zip',
  archiveSha256:hash('synthetic ZIP '+name),
  binaryRelativePath:name+'/portable/'+release+'/'+name+'-cli.exe',
  sha256:hash('synthetic CLI '+name),
 };
}
const entries=plannedEntries(lock).map(row=>({
 destination:row.destination,sourceRole:row.sourceRoot,
 sourceRelative:row.sourceRelative,bytes:10,
 sha256:row.expectedSha256??hash(row.destination),
 releasePinned:row.expectedSha256!==null,
}));
const manifest={
 schema:HANDOFF_SCHEMA,mode:'read-only-proposed-handoff',entries,
 entryCount:12,
 fingerprint:hash(JSON.stringify({schema:HANDOFF_SCHEMA,entries})),
 expectedDestinationRoot:'C:\\ProgramData\\OmniraCreativeWorker',
 reviewedCommitRequired:true,independentSignedApprovalRequired:true,
 protectedCopyAndPostCopyAclAuditRequired:true,sourceIsUntrustedUserWritable:true,
 approvalGranted:false,copyPerformed:false,accountActivationAllowed:false,
 productionReady:false,
};
const claims={
 schema:HANDOFF_REVIEW_SCHEMA,purpose:'review_only',
 repositoryId:'github.com/bumbi190/ai-operating-platform',
 commitSha:'a'.repeat(40),manifestSha256:hash(JSON.stringify(manifest)),
 authorId:'creativeAuthor',reviewerId:'externalAuditor',
 targetHost:'HULTGREN',
 issuedAt:'2026-10-21T06:55:00.000Z',
 expiresAt:'2026-10-21T07:45:00.000Z',
 nonce:'0123456789abcdef0123456789abcdef',
 noCopyAuthority:true,
};
const expectedPolicy={
 repositoryId:claims.repositoryId,commitSha:claims.commitSha,
 manifestSha256:claims.manifestSha256,authorId:claims.authorId,
 reviewerId:claims.reviewerId,targetHost:claims.targetHost,
 reviewerPublicKeySha256:publicKeyFingerprint(keys.publicKey),
};
const now=new Date('2026-10-21T07:10:00.000Z');
const makeProof=(c=claims,key=keys.privateKey)=>({
 claims:c,signature:sign('sha256',canonicalCreativeHandoffReview(c),{
  key,dsaEncoding:'ieee-p1363',
 }).toString('base64url'),
});
const run=(opts={})=>inspectCreativeHandoffReviewBundle({
 proof:makeProof(),manifest,trustedReviewerPublicKey:keys.publicKey,
 expectedPolicy,now,...opts,
});
test('binds exact 12-file manifest to pinned signer and commit; NO install authority',()=>{
 const r=run();
 assert.equal(r.status,'review_signature_and_manifest_bytes_match_not_authorized');
 assert.equal(r.verifiedFileCount,12);
 assert.equal(r.cryptographicSignatureValid,true);
 assert.equal(r.manifestBytesBound,true);
 assert.equal(r.trustedIdentityProven,false);
 assert.equal(r.reviewerPolicyApproved,false);
 assert.equal(r.copyAuthorized,false);
 assert.equal(r.privilegedBootstrapAuthorized,false);
 assert.equal(r.nonceConsumed,false);
 assert.equal(r.workerExecutionEnabled,false);
 assert.equal(r.productionReady,false);
});
test('signed review for OLD manifest never validates newly modified script hash',()=>{
 const old=structuredClone(manifest);
 old.entries[0].sha256='f'.repeat(64);
 old.fingerprint=hash(JSON.stringify({schema:HANDOFF_SCHEMA,entries:old.entries}));
 assert.throws(()=>run({manifest:old}),/reviewed_manifest_digest_mismatch/);
});
test('even a valid review for a modified manifest fails independent policy pin',()=>{
 const changed=structuredClone(manifest);
 changed.entries[0].sha256='d'.repeat(64);
 changed.fingerprint=hash(JSON.stringify({schema:HANDOFF_SCHEMA,entries:changed.entries}));
 const newClaims={...claims,manifestSha256:hash(JSON.stringify(changed))};
 assert.throws(()=>run({manifest:changed,proof:makeProof(newClaims)}),
  /review_scope_mismatch:manifestSha256/);
});
test('a fabricated manifest approval flag fails, even if both SHA and review are signed',()=>{
 const changed={...manifest,approvalGranted:true};
 const c={...claims,manifestSha256:hash(JSON.stringify(changed))};
 const policy={...expectedPolicy,manifestSha256:c.manifestSha256};
 assert.throws(()=>run({manifest:changed,proof:makeProof(c),expectedPolicy:policy}),
  /unexpected_handoff_semantics/);
});
test('a different reviewer key, wrong commit or unknown trust channel never validates',()=>{
 assert.throws(()=>run({trustedReviewerPublicKey:reviewer2.publicKey}),/reviewer_key_pin_mismatch/);
 assert.throws(()=>run({expectedPolicy:{...expectedPolicy,commitSha:'c'.repeat(40)}}),
  /review_scope_mismatch:commitSha/);
 assert.throws(()=>run({expectedPolicy:null}),/trusted_review_policy_missing/);
});
test('a valid signature can be checked repeatedly, but no nonce consumption is claimed',()=>{
 assert.equal(run().nonceConsumed,false);
 assert.equal(run().nonceConsumed,false);
});
