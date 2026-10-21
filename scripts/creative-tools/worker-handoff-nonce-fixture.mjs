/**
 * TEST ONLY: durable replay demonstration for signed Creative Handoff review.
 * Not a production nonce service, approval/identity store or installer.
 * Writes one inert JSON receipt under a direct OS TEMP fixture, and nowhere
 * else. No CLI, no runtime enablement, no privileged or user account APIs.
 */
import {lstatSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename,dirname,isAbsolute,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectPinnedCreativeReviewer} from './worker-handoff-reviewer-registry.mjs';

export const NONCE_FIXTURE_MARKER='OMNIRA_CREATIVE_REVIEW_NONCE_TEST_ONLY_v1\n';
const PREFIX='omnira-creative-review-fixture-';
const hash=s=>createHash('sha256').update(s).digest('hex');
function assertFixture(root){
 if(typeof root!=='string'||!isAbsolute(root))throw Error('nonce_fixture_absolute_path_required');
 if(lstatSync(root).isSymbolicLink())throw Error('nonce_fixture_symlink_rejected');
 const actual=realpathSync(root);
 const temp=realpathSync(tmpdir());
 if(dirname(actual).toLowerCase()!==temp.toLowerCase()||
    !basename(actual).startsWith(PREFIX))throw Error('nonce_fixture_outside_temp');
 if(lstatSync(actual).isSymbolicLink()||!lstatSync(actual).isDirectory()){
  throw Error('nonce_fixture_not_literal_directory');
 }
 const marker=join(actual,'.synthetic-test-only');
 const stat=lstatSync(marker);
 if(!stat.isFile()||stat.isSymbolicLink()||
    readFileSync(marker,'utf8')!==NONCE_FIXTURE_MARKER){
  throw Error('nonce_fixture_marker_invalid');
 }
 return actual;
}
/**
 * Caller provides test-only registry and key pin; a matching pin does NOT
 * establish external reviewer identity or authorization. This cannot ever
 * return a production permission or an execution capability.
 */
export function recordSyntheticReviewedNonce({
 fixtureRoot,registry,externallyPinnedRegistrySha256,reviewedCommitSha,
 reviewedManifestSha256,independentlyExpectedAuthorId,proof,manifest,now,
}){
 const root=assertFixture(fixtureRoot);
 // Full signature+registry+exact-manifest check BEFORE creating any receipt.
 const checked=inspectPinnedCreativeReviewer({
  registry,externallyPinnedRegistrySha256,reviewedCommitSha,reviewedManifestSha256,
  independentlyExpectedAuthorId,proof,manifest,now,
 });
 if(checked.reviewSignatureValid!==true||checked.bootstrapAuthorized!==false||
    checked.workerExecutionEnabled!==false){
  throw Error('unsafe_review_verification_result');
 }
 const nonce=proof.claims.nonce;
 const nonceHash=hash('omnira.creative.review.nonce.v1\n'+nonce);
 const file=join(root,nonceHash+'.json');
 const receipt={
  schema:'omnira.creative.synthetic_review_receipt.v1',
  status:'nonce_recorded_for_test_only',
  nonceHash,commitSha:checked.commitSha,manifestSha256:checked.manifestSha256,
  reviewerId:checked.reviewerId,reviewedAt:now.toISOString(),
  registryPinMatched:true,reviewSignatureValid:true,
  reviewerAuthorityVerified:false,nonceConsumedForProduction:false,
  protectedCopyAuthorized:false,installerAuthorized:false,
  workerExecutionEnabled:false,productionReady:false,
 };
 // Exclusive creation prevents replay across processes sharing this directory.
 // It is intentionally not an actual Windows-protected ledger; the parent is
 // writable by the test user. A truncated receipt still occupies the nonce.
 try{
  writeFileSync(file,JSON.stringify(receipt)+'\n',{flag:'wx',mode:0o600});
 }catch(err){
  if(err?.code==='EEXIST')throw Error('synthetic_review_nonce_replay_rejected');
  throw err;
 }
 return Object.freeze(receipt);
}
