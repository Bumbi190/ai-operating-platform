import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,writeFileSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {plannedEntries,HANDOFF_SCHEMA} from './worker-handoff-manifest.mjs';
import {publicKeyFingerprint,HANDOFF_REVIEW_SCHEMA,canonicalCreativeHandoffReview}
 from './worker-handoff-review-proof.mjs';
import {fingerprintCreativeReviewerRegistry,REVIEWER_REGISTRY_SCHEMA}
 from './worker-handoff-reviewer-registry.mjs';
import {recordSyntheticReviewedNonce,NONCE_FIXTURE_MARKER}
 from './worker-handoff-nonce-fixture.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'omnira-creative-review-fixture-'));
 writeFileSync(join(root,'.synthetic-test-only'),NONCE_FIXTURE_MARKER);
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const lock={};
 for(const [n,v] of [['photocraft','0.10.0'],['filmcraft','0.9.0']]){
  const r=n+'-'+v+'-windows-x64-portable';
  lock[n]={version:v,archiveRelativePath:n+'/'+r+'.zip',
   archiveSha256:sha(n+' archive'),binaryRelativePath:n+'/portable/'+r+'/'+n+'-cli.exe',
   sha256:sha(n+' cli')};
 }
 const entries=plannedEntries(lock).map(e=>({
  destination:e.destination,sourceRole:e.sourceRoot,
  sourceRelative:e.sourceRelative,bytes:12,
  sha256:e.expectedSha256??sha(e.destination),releasePinned:e.expectedSha256!==null,
 }));
 const manifest={
  schema:HANDOFF_SCHEMA,mode:'read-only-proposed-handoff',entries,entryCount:12,
  fingerprint:sha(JSON.stringify({schema:HANDOFF_SCHEMA,entries})),
  expectedDestinationRoot:'C:\\ProgramData\\OmniraCreativeWorker',
  reviewedCommitRequired:true,independentSignedApprovalRequired:true,
  protectedCopyAndPostCopyAclAuditRequired:true,sourceIsUntrustedUserWritable:true,
  approvalGranted:false,copyPerformed:false,accountActivationAllowed:false,productionReady:false,
 };
 const repo='github.com/bumbi190/ai-operating-platform';
 const reviewer={
  reviewerId:'reviewerUnique',status:'active',
  publicKeySpkiDerBase64:keys.publicKey.export({format:'der',type:'spki'}).toString('base64'),
  publicKeySha256:publicKeyFingerprint(keys.publicKey),
  approvedRepositoryId:repo,targetHost:'HULTGREN',independentlyEnrolled:true,
 };
 const registry={schema:REVIEWER_REGISTRY_SCHEMA,repositoryId:repo,targetHost:'HULTGREN',reviewers:[reviewer]};
 const claims={
  schema:HANDOFF_REVIEW_SCHEMA,purpose:'review_only',
  repositoryId:repo,commitSha:'b'.repeat(40),
  manifestSha256:sha(JSON.stringify(manifest)),authorId:'creativeAuthor',
  reviewerId:reviewer.reviewerId,targetHost:'HULTGREN',
  issuedAt:'2026-10-21T06:00:00.000Z',expiresAt:'2026-10-21T07:00:00.000Z',
  nonce:'0123456789abcdef0123456789abcdef',
  noCopyAuthority:true,
 };
 const now=new Date('2026-10-21T06:30:00.000Z');
 const signed=c=>({
  claims:c,signature:sign('sha256',canonicalCreativeHandoffReview(c),
   {key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url'),
 });
 const defaults={
  fixtureRoot:root,registry,externallyPinnedRegistrySha256:fingerprintCreativeReviewerRegistry(registry),
  reviewedCommitSha:claims.commitSha,reviewedManifestSha256:claims.manifestSha256,
  independentlyExpectedAuthorId:claims.authorId,
  proof:signed(claims),manifest,now,
 };
 return{root,registry,claims,now,keys,signed,defaults,run:(overrides={})=>recordSyntheticReviewedNonce({...defaults,...overrides})};
}
function withFixture(fn){
 const f=fixture();
 try{return fn(f)}finally{rmSync(f.root,{recursive:true,force:true})}
}
test('one signature records an inert nonce hash only in marked OS temp fixture',()=>withFixture(f=>{
 const r=f.run();
 assert.equal(r.status,'nonce_recorded_for_test_only');
 assert.match(r.nonceHash,/^[a-f0-9]{64}$/);
 assert.equal(r.protectedCopyAuthorized,false);
 assert.equal(r.installerAuthorized,false);
 assert.equal(r.workerExecutionEnabled,false);
 assert.equal(r.productionReady,false);
 assert.equal(r.reviewerAuthorityVerified,false);
 assert.equal(r.nonceConsumedForProduction,false);
 assert.equal(readdirSync(f.root).length,2);
 assert.ok(!JSON.stringify(r).includes(f.claims.nonce));
}));
test('replaying the SAME signed nonce rejects even if verifier is called again',()=>withFixture(f=>{
 f.run();
 assert.throws(()=>f.run(),/synthetic_review_nonce_replay_rejected/);
 assert.equal(readdirSync(f.root).length,2);
}));
test('different valid nonce is an independent inert test receipt, never authority',()=>withFixture(f=>{
 f.run();
 const fresh={...f.claims,nonce:'another0123456789abcdef0123456789'};
 const r=f.run({proof:f.signed(fresh)});
 assert.equal(r.protectedCopyAuthorized,false);
 assert.equal(readdirSync(f.root).length,3);
}));
test('tampered signatures are refused before any nonce is written',()=>withFixture(f=>{
 const proof={...f.defaults.proof,signature:'A'+f.defaults.proof.signature.slice(1)};
 assert.throws(()=>f.run({proof}),/independent_review_signature_invalid/);
 assert.equal(readdirSync(f.root).length,1);
}));
test('revoked reviewer is refused before receipt creation',()=>withFixture(f=>{
 const registry={...f.registry,reviewers:[{...f.registry.reviewers[0],status:'revoked'}]};
 assert.throws(()=>f.run({
  registry,externallyPinnedRegistrySha256:fingerprintCreativeReviewerRegistry(registry),
 }),/reviewer_suspended_or_revoked/);
 assert.equal(readdirSync(f.root).length,1);
}));
test('stale commit, changed manifest or unpinned registry is blocked',()=>withFixture(f=>{
 assert.throws(()=>f.run({reviewedCommitSha:'f'.repeat(40)}),/review_scope_mismatch:commitSha/);
 assert.throws(()=>f.run({reviewedManifestSha256:'f'.repeat(64)}),/review_scope_mismatch:manifestSha256/);
 assert.throws(()=>f.run({externallyPinnedRegistrySha256:'f'.repeat(64)}),
  /reviewer_registry_did_not_match_external_pin/);
 assert.equal(readdirSync(f.root).length,1);
}));
test('missing or altered fixture marker refuses without touching existing content',()=>withFixture(f=>{
 const marker=join(f.root,'.synthetic-test-only');
 writeFileSync(marker,'malicious');
 assert.throws(()=>f.run(),/nonce_fixture_marker_invalid/);
 assert.equal(readFileSync(marker,'utf8'),'malicious');
}));
test('ordinary nonfixture folders can NEVER be used as a production ledger',()=>withFixture(f=>{
 assert.throws(()=>f.run({fixtureRoot:tmpdir()}),/nonce_fixture_outside_temp/);
 assert.throws(()=>f.run({fixtureRoot:'relative/path'}),/nonce_fixture_absolute_path_required/);
}));
test('an existing corrupt or partial nonce file blocks replay rather than resetting it',()=>withFixture(f=>{
 const r=f.run();
 writeFileSync(join(f.root,r.nonceHash+'.json'),'truncated');
 assert.throws(()=>f.run(),/synthetic_review_nonce_replay_rejected/);
 assert.equal(readFileSync(join(f.root,r.nonceHash+'.json'),'utf8'),'truncated');
}));
test('expired proof cannot create nonce and account authorization stays false',()=>withFixture(f=>{
 assert.throws(()=>f.run({now:new Date('2026-10-21T07:01:00.000Z')}),
  /review_proof_expired_or_invalid_window/);
 assert.equal(readdirSync(f.root).length,1);
}));
