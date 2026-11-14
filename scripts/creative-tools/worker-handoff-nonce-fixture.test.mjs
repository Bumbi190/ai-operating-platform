import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
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
import {createTestReviewerLifecycle,appendTestReviewerLifecycleEvent}
 from './worker-handoff-reviewer-lifecycle.mjs';
import {snapshotSyntheticNonceLedger,inspectPinnedSyntheticNonceLedger}
 from './worker-handoff-nonce-ledger-audit.mjs';

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
 const journal=createTestReviewerLifecycle(registry);
 const signed=c=>({
  claims:c,signature:sign('sha256',canonicalCreativeHandoffReview(c),
   {key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url'),
 });
 const defaults={
  fixtureRoot:root,registry,journal,externallyPinnedRegistrySha256:fingerprintCreativeReviewerRegistry(registry),
  externallyPinnedHeadSha256:journal.headSha256,minimumSequence:0,
  reviewedCommitSha:claims.commitSha,reviewedManifestSha256:claims.manifestSha256,
  independentlyExpectedAuthorId:claims.authorId,
  proof:signed(claims),manifest,now,
 };
 return{root,registry,journal,claims,now,keys,signed,defaults,run:(overrides={})=>recordSyntheticReviewedNonce({...defaults,...overrides})};
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
 assert.equal(r.revocationChainChecked,true);
 assert.equal(r.pinnedLifecycleHeadSha256,f.journal.headSha256);
 assert.equal(r.pinnedLifecycleSequence,0);
 assert.equal(r.commitSha,f.claims.commitSha);
 assert.equal(r.manifestSha256,f.claims.manifestSha256);
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
test('revoked reviewer is refused BEFORE any nonce receipt, even with otherwise valid review',()=>withFixture(f=>{
 const journal=appendTestReviewerLifecycleEvent(f.journal,{
  reviewerId:f.claims.reviewerId,actorId:'separateAdmin',action:'revoke',
  occurredAt:'2026-10-21T06:15:00.000Z',
 });
 assert.throws(()=>f.run({journal,externallyPinnedHeadSha256:journal.headSha256,
   minimumSequence:1}),/lifecycle_reviewer_not_active/);
 assert.equal(readdirSync(f.root).length,1);
}));
test('stale commit, changed manifest or unpinned registry is blocked',()=>withFixture(f=>{
 assert.throws(()=>f.run({reviewedCommitSha:'f'.repeat(40)}),/review_scope_mismatch:commitSha/);
 assert.throws(()=>f.run({reviewedManifestSha256:'f'.repeat(64)}),/review_scope_mismatch:manifestSha256/);
 assert.throws(()=>f.run({externallyPinnedRegistrySha256:'f'.repeat(64)}),
  /lifecycle_registry_external_pin_mismatch/);
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

const syntheticNonceChild = [
  'import {recordSyntheticReviewedNonce} from '+JSON.stringify(new URL('./worker-handoff-nonce-fixture.mjs',import.meta.url).href)+';',
  'const input=JSON.parse(process.env.CREATIVE_NONCE_TEST_INPUT);',
  'input.now=new Date(input.now);',
  'try{const r=recordSyntheticReviewedNonce(input); console.log(r.status);}',
  'catch(e){console.error(e.message);process.exitCode=2;}',
].join('\n');
function childEnv(f){
 return {
  ...process.env,
  CREATIVE_NONCE_TEST_INPUT:JSON.stringify({...f.defaults,now:f.now.toISOString()}),
 };
}
function runNonceChild(f){
 return spawnSync(process.execPath,['--input-type=module','-e',syntheticNonceChild],{
  env:childEnv(f),encoding:'utf8',timeout:15000,maxBuffer:20000,
 });
}
function runAsyncNonceChild(f){
 return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['--input-type=module','-e',syntheticNonceChild],{
   env:childEnv(f),shell:false,windowsHide:true,
  });
  let out='',err='';
  p.stdout.on('data',d=>{out+=d.toString()});
  p.stderr.on('data',d=>{err+=d.toString()});
  p.on('error',reject);
  p.on('close',code=>resolve({code,out,err}));
 });
}
test('nonce use survives a real Node process exit/restart without becoming an approval',()=>withFixture(f=>{
 const first=runNonceChild(f);
 assert.equal(first.status,0,first.stderr);
 assert.match(first.stdout,/nonce_recorded_for_test_only/);
 const second=runNonceChild(f);
 assert.equal(second.status,2);
 assert.match(second.stderr,/synthetic_review_nonce_replay_rejected/);
 assert.equal(readdirSync(f.root).length,2);
}));
test('two separate Node processes contend for same nonce: exactly one succeeds',async()=>{
 const f=fixture();
 try{
  const results=await Promise.all([runAsyncNonceChild(f),runAsyncNonceChild(f)]);
  assert.deepEqual(results.map(r=>r.code).sort(),[0,2],results.map(r=>r.err).join('\n'));
  const loser=results.find(r=>r.code===2);
  assert.match(loser.err,/synthetic_review_nonce_replay_rejected/);
  assert.equal(readdirSync(f.root).length,2);
 } finally {rmSync(f.root,{recursive:true,force:true})}
});
test('revocation head cannot be hidden by presenting the old active journal',()=>withFixture(f=>{
 const revoked=appendTestReviewerLifecycleEvent(f.journal,{
  reviewerId:f.claims.reviewerId,actorId:'separateAdmin',action:'revoke',
  occurredAt:'2026-10-21T06:15:00.000Z',
 });
 assert.throws(()=>f.run({externallyPinnedHeadSha256:revoked.headSha256,
  minimumSequence:1}),/stale_or_invalid_review_history/);
 assert.throws(()=>f.run({externallyPinnedHeadSha256:revoked.headSha256,
  minimumSequence:0}),/reviewer_lifecycle_head_not_independently_pinned/);
 assert.equal(readdirSync(f.root).length,1);
}));
test('a current suspension head blocks both old signature and a fresh nonce',()=>withFixture(f=>{
 const journal=appendTestReviewerLifecycleEvent(f.journal,{
  reviewerId:f.claims.reviewerId,actorId:'separateAdmin',action:'suspend',
  occurredAt:'2026-10-21T06:15:00.000Z',
 });
 const fresh={...f.claims,nonce:'fresh234567890abcdef01234567890'};
 assert.throws(()=>f.run({journal,externallyPinnedHeadSha256:journal.headSha256,
  minimumSequence:1,proof:f.signed(fresh)}),/lifecycle_reviewer_not_active/);
 assert.equal(readdirSync(f.root).length,1);
}));
test('tampering with lifecycle chain before proof prevents ANY receipt write',()=>withFixture(f=>{
 const journal=appendTestReviewerLifecycleEvent(f.journal,{
  reviewerId:f.claims.reviewerId,actorId:'separateAdmin',action:'suspend',
  occurredAt:'2026-10-21T06:15:00.000Z',
 });
 const tampered=structuredClone(journal);
 tampered.events[0].actorId='forgedAdmin';
 assert.throws(()=>f.run({journal:tampered,
  externallyPinnedHeadSha256:journal.headSha256,
  minimumSequence:1}),/reviewer_lifecycle_chain_tampered/);
 assert.equal(readdirSync(f.root).length,1);
}));
test('missing protected lifecycle pin or journal fails closed, not falling back to registry',()=>withFixture(f=>{
 for(const extra of [
  {journal:undefined},
  {externallyPinnedHeadSha256:undefined},
  {minimumSequence:undefined},
 ]){
  assert.throws(()=>f.run(extra));
 }
 assert.equal(readdirSync(f.root).length,1);
}));
test('an old inert receipt stays non-authoritative and cannot be reused after revocation',()=>withFixture(f=>{
 const receipt=f.run();
 const file=join(f.root,receipt.nonceHash+'.json');
 const revoked=appendTestReviewerLifecycleEvent(f.journal,{
  reviewerId:f.claims.reviewerId,actorId:'separateAdmin',action:'revoke',
  occurredAt:'2026-10-21T06:15:00.000Z',
 });
 assert.throws(()=>f.run({journal:revoked,
  externallyPinnedHeadSha256:revoked.headSha256,minimumSequence:1}),
  /lifecycle_reviewer_not_active/);
 const persisted=JSON.parse(readFileSync(file,'utf8'));
 assert.equal(persisted.revocationChainChecked,true);
 assert.equal(persisted.nonceConsumedForProduction,false);
 assert.equal(persisted.protectedCopyAuthorized,false);
 assert.equal(persisted.installerAuthorized,false);
 assert.equal(persisted.pinnedLifecycleSequence,0);
 assert.equal(readdirSync(f.root).length,2);
}));
test('real synthetic signed-review nonce receipt passes only byte inventory, never authorization',()=>withFixture(f=>{
 const receipt=f.run();
 const proposed=snapshotSyntheticNonceLedger({fixtureRoot:f.root});
 assert.equal(proposed.recordCount,1);
 const inspection=inspectPinnedSyntheticNonceLedger({
  fixtureRoot:f.root,externallyPinnedHeadSha256:proposed.observedHeadSha256,
  minimumRecordCount:1,
 });
 assert.equal(inspection.status,'test_history_matches_supplied_checkpoint_not_authorized');
 assert.equal(inspection.externalAnchorAuthenticityVerified,false);
 assert.equal(inspection.copyAuthorized,false);
 assert.equal(inspection.productionReady,false);
 assert.equal(receipt.nonceConsumedForProduction,false);
}));
test('signed-review receipt tampering after replay rejection fails ledger checkpoint',()=>withFixture(f=>{
 const receipt=f.run();
 const pin=snapshotSyntheticNonceLedger({fixtureRoot:f.root});
 const file=join(f.root,receipt.nonceHash+'.json');
 const fake=JSON.parse(readFileSync(file,'utf8'));
 fake.pinnedLifecycleHeadSha256='f'.repeat(64);
 writeFileSync(file,JSON.stringify(fake)+'\n');
 assert.throws(()=>inspectPinnedSyntheticNonceLedger({
  fixtureRoot:f.root,externallyPinnedHeadSha256:pin.observedHeadSha256,
  minimumRecordCount:1,
 }),/synthetic_ledger_external_head_mismatch/);
 assert.throws(()=>f.run(),/synthetic_review_nonce_replay_rejected/);
}));
