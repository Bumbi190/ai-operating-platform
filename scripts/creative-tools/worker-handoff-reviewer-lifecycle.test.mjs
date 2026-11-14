import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {HANDOFF_SCHEMA,plannedEntries} from './worker-handoff-manifest.mjs';
import {HANDOFF_REVIEW_SCHEMA,canonicalCreativeHandoffReview,
  publicKeyFingerprint} from './worker-handoff-review-proof.mjs';
import {REVIEWER_REGISTRY_SCHEMA,fingerprintCreativeReviewerRegistry}
 from './worker-handoff-reviewer-registry.mjs';
import {
 createTestReviewerLifecycle,appendTestReviewerLifecycleEvent,
 inspectPinnedReviewerLifecycle,inspectLifecycleBoundCreativeReview,
} from './worker-handoff-reviewer-lifecycle.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const reviewer={
 reviewerId:'outsideReviewer',status:'active',
 publicKeySpkiDerBase64:keys.publicKey.export({format:'der',type:'spki'}).toString('base64'),
 publicKeySha256:publicKeyFingerprint(keys.publicKey),
 approvedRepositoryId:'github.com/bumbi190/ai-operating-platform',
 targetHost:'HULTGREN',independentlyEnrolled:true,
};
const registry={schema:REVIEWER_REGISTRY_SCHEMA,
 repositoryId:reviewer.approvedRepositoryId,targetHost:'HULTGREN',
 reviewers:[reviewer]};
const baselineHash=fingerprintCreativeReviewerRegistry(registry);
const when1='2026-10-21T05:30:00.000Z',when2='2026-10-21T05:45:00.000Z';
const evt=(action,occurredAt=when1,actorId='separateAdmin')=>({
 reviewerId:reviewer.reviewerId,action,actorId,occurredAt,
});
const withEvent=(journal,action,occurredAt=when1)=>appendTestReviewerLifecycleEvent(
 journal,evt(action,occurredAt));
const inspect=(journal,more={})=>inspectPinnedReviewerLifecycle({
 registry,journal,externallyPinnedRegistrySha256:baselineHash,
 externallyPinnedHeadSha256:journal.headSha256,minimumSequence:journal.events.length,...more,
});
function realReviewFixture(){
 const lock={};
 for(const [name,version] of [['photocraft','0.10.0'],['filmcraft','0.9.0']]){
  const release=name+'-'+version+'-windows-x64-portable';
  lock[name]={version,
   archiveRelativePath:name+'/'+release+'.zip',
   archiveSha256:sha('archive-'+name),
   binaryRelativePath:name+'/portable/'+release+'/'+name+'-cli.exe',
   sha256:sha('cli-'+name)};
 }
 const entries=plannedEntries(lock).map(row=>({
  destination:row.destination,sourceRole:row.sourceRoot,
  sourceRelative:row.sourceRelative,bytes:16,
  sha256:row.expectedSha256??sha(row.destination),
  releasePinned:row.expectedSha256!==null,
 }));
 const manifest={schema:HANDOFF_SCHEMA,mode:'read-only-proposed-handoff',
  entries,entryCount:12,fingerprint:sha(JSON.stringify({schema:HANDOFF_SCHEMA,entries})),
  expectedDestinationRoot:'C:\\ProgramData\\OmniraCreativeWorker',
  reviewedCommitRequired:true,independentSignedApprovalRequired:true,
  protectedCopyAndPostCopyAclAuditRequired:true,sourceIsUntrustedUserWritable:true,
  approvalGranted:false,copyPerformed:false,accountActivationAllowed:false,
  productionReady:false,
 };
 const claims={
  schema:HANDOFF_REVIEW_SCHEMA,purpose:'review_only',
  repositoryId:registry.repositoryId,commitSha:'a'.repeat(40),
  manifestSha256:sha(JSON.stringify(manifest)),
  authorId:'separateAuthor',reviewerId:reviewer.reviewerId,
  targetHost:'HULTGREN',issuedAt:'2026-10-21T05:20:00.000Z',
  expiresAt:'2026-10-21T06:20:00.000Z',
  nonce:'abcdefghijklmnopqrstuvwx01234567',noCopyAuthority:true,
 };
 const proof={claims,signature:sign('sha256',canonicalCreativeHandoffReview(claims),
  {key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};
 const run=(journal,extra={})=>inspectLifecycleBoundCreativeReview({
  registry,journal,externallyPinnedRegistrySha256:baselineHash,
  externallyPinnedHeadSha256:journal.headSha256,minimumSequence:journal.events.length,
  reviewedCommitSha:claims.commitSha,
  reviewedManifestSha256:claims.manifestSha256,
  independentlyExpectedAuthorId:claims.authorId,
  proof,manifest,now:new Date('2026-10-21T06:00:00.000Z'),...extra,
 });
 return {run,proof,manifest,claims};
}
test('empty journal pins genesis; does not claim review/copy authority',()=>{
 const journal=createTestReviewerLifecycle(registry),p=inspect(journal);
 assert.equal(p.sequence,0);
 assert.equal(p.reviewerStatuses[reviewer.reviewerId],'active');
 assert.equal(p.identityAuthorityVerified,false);
 assert.equal(p.externalPinAuthenticityVerified,false);
 assert.equal(p.nonceConsumed,false);
 assert.equal(p.copyAuthorized,false);
 assert.equal(p.installerAuthorized,false);
 assert.equal(p.workerExecutionEnabled,false);
});
test('valid review is inert when reviewer active at independently pinned head',()=>{
 const {run}=realReviewFixture();
 const r=run(createTestReviewerLifecycle(registry));
 assert.equal(r.cryptographicReviewValid,true);
 assert.equal(r.lifecycleChainMatchesPins,true);
 assert.equal(r.bootstrapAuthorized,false);
 assert.equal(r.productionReady,false);
});
test('suspension blocks the SAME otherwise-valid signed review',()=>{
 const {run}=realReviewFixture(),journal=withEvent(createTestReviewerLifecycle(registry),'suspend');
 assert.equal(inspect(journal).reviewerStatuses[reviewer.reviewerId],'suspended');
 assert.throws(()=>run(journal),/lifecycle_reviewer_not_active/);
});
test('revocation blocks same signature permanently in journal replay',()=>{
 const {run}=realReviewFixture();
 const once=withEvent(createTestReviewerLifecycle(registry),'suspend');
 const revoked=withEvent(once,'revoke',when2);
 assert.equal(inspect(revoked).reviewerStatuses[reviewer.reviewerId],'revoked');
 assert.throws(()=>run(revoked),/lifecycle_reviewer_not_active/);
 assert.throws(()=>run(structuredClone(revoked)),/lifecycle_reviewer_not_active/);
});
test('a stale active journal cannot replace pinned revoked head',()=>{
 const stale=createTestReviewerLifecycle(registry);
 const latest=withEvent(stale,'revoke');
 assert.throws(()=>inspect(stale,{
  externallyPinnedHeadSha256:latest.headSha256,minimumSequence:1,
 }),/stale_or_invalid_review_history/);
 assert.throws(()=>inspect(stale,{
  externallyPinnedHeadSha256:latest.headSha256,minimumSequence:0,
 }),/reviewer_lifecycle_head_not_independently_pinned/);
});
test('removing last revocation event but retaining published head fails closed',()=>{
 const prior=withEvent(createTestReviewerLifecycle(registry),'suspend');
 const latest=withEvent(prior,'revoke',when2);
 const removed={...latest,events:[...prior.events]};
 assert.throws(()=>inspect(removed,{
  externallyPinnedHeadSha256:latest.headSha256,
 }),/reviewer_lifecycle_head_not_independently_pinned/);
});
test('tampered event payload cannot be fixed by changing unpinned local head',()=>{
 const journal=withEvent(createTestReviewerLifecycle(registry),'revoke');
 const modified=structuredClone(journal);
 modified.events[0].actorId='forgedActor';
 assert.throws(()=>inspect(modified),/reviewer_lifecycle_chain_tampered/);
});
test('out-of-order, duplicated, skipped sequence and previous hashes are rejected',()=>{
 const journal=withEvent(createTestReviewerLifecycle(registry),'suspend');
 for(const [key,value] of [
  ['sequence',3],['sequence',0],['previousSha256','f'.repeat(64)],
 ]){
  const t=structuredClone(journal);t.events[0][key]=value;
  assert.throws(()=>inspect(t),/reviewer_lifecycle_event_invalid/);
 }
 const dup={...journal,events:[...journal.events,journal.events[0]]};
 assert.throws(()=>inspect(dup),/reviewer_lifecycle_event_invalid/);
});
test('revoked reviewers cannot be unrevoked or re-revoked via event history',()=>{
 const first=withEvent(createTestReviewerLifecycle(registry),'revoke');
 const again=withEvent(first,'revoke',when2);
 assert.throws(()=>inspect(again),/reviewer_lifecycle_invalid_transition/);
 const fake=appendTestReviewerLifecycleEvent(first,evt('suspend',when2));
 assert.throws(()=>inspect(fake),/reviewer_lifecycle_invalid_transition/);
 const activation=appendTestReviewerLifecycleEvent(first,evt('activate',when2));
 assert.throws(()=>inspect(activation),/reviewer_lifecycle_event_invalid/);
});
test('same reviewer cannot record their own status change',()=>{
 const journal=appendTestReviewerLifecycleEvent(createTestReviewerLifecycle(registry),
  evt('revoke',when1,reviewer.reviewerId));
 assert.throws(()=>inspect(journal),/reviewer_lifecycle_event_invalid/);
});
test('journal event from a non-existent reviewer fails',()=>{
 const journal=appendTestReviewerLifecycleEvent(createTestReviewerLifecycle(registry),
  {...evt('suspend'),reviewerId:'unknownReviewer'});
 assert.throws(()=>inspect(journal),/reviewer_lifecycle_unknown_reviewer/);
});
test('event clock rollback fails even with valid per-entry hashes',()=>{
 const first=withEvent(createTestReviewerLifecycle(registry),'suspend',when2);
 const second=withEvent(first,'revoke',when1);
 assert.throws(()=>inspect(second),/reviewer_lifecycle_time_rollback/);
});
test('registry changed without external pin is blocked before signature use',()=>{
 const journal=createTestReviewerLifecycle(registry);
 const changed={...registry,reviewers:[{...reviewer,status:'revoked'}]};
 assert.throws(()=>inspect(journal,{registry:changed}),/lifecycle_registry_external_pin_mismatch/);
});
test('self-provided head is NOT independent human authority',()=>{
 const journal=withEvent(createTestReviewerLifecycle(registry),'suspend');
 const r=inspect(journal);
 assert.equal(r.externalPinAuthenticityVerified,false);
 assert.equal(r.copyAuthorized,false);
 assert.equal(r.productionReady,false);
});
test('missing external pin, missing trusted baseline and incomplete ledger fail',()=>{
 const journal=createTestReviewerLifecycle(registry);
 assert.throws(()=>inspect(journal,{externallyPinnedHeadSha256:undefined}),
  /external_lifecycle_pins_required/);
 assert.throws(()=>inspect(journal,{externallyPinnedRegistrySha256:'f'.repeat(64)}),
  /lifecycle_registry_external_pin_mismatch/);
 assert.throws(()=>inspect(journal,{minimumSequence:1}),/stale_or_invalid_review_history/);
});
