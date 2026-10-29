/**
 * READ ONLY inventory/rollback audit of INERT Creative reviewer nonce receipts.
 * Only reads marked synthetic direct-child OS TEMP fixtures. No writes or CLI.
 * A self-provided head is NOT an independently anchored monotonic checkpoint.
 * Does not re-verify original proof signatures; receipts are NOT capabilities.
 */
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename,dirname,isAbsolute,join} from 'node:path';
import {tmpdir} from 'node:os';
import {NONCE_FIXTURE_MARKER} from './worker-handoff-nonce-fixture.mjs';

const HEX=/^[a-f0-9]{64}$/;
const SHA40=/^[a-f0-9]{40}$/;
const ID=/^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const MAX_FILES=32;
const MAX_BYTES=4096;
const PREFIX='omnira-creative-review-fixture-';
const RECEIPT_FIELDS=[
 'schema','status','nonceHash','commitSha','manifestSha256','reviewerId',
 'reviewedAt','pinnedLifecycleHeadSha256','pinnedLifecycleSequence',
 'revocationChainChecked','registryPinMatched','reviewSignatureValid',
 'reviewerAuthorityVerified','nonceConsumedForProduction',
 'protectedCopyAuthorized','installerAuthorized','workerExecutionEnabled',
 'productionReady',
];
export const SYNTHETIC_LEDGER_SCHEMA='omnira.creative.synthetic_nonce_ledger.v1';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixtureRoot(root){
 if(typeof root!=='string'||!isAbsolute(root))throw Error('synthetic_ledger_absolute_root_required');
 const original=lstatSync(root);
 if(original.isSymbolicLink()||!original.isDirectory())throw Error('synthetic_ledger_root_is_link_or_not_directory');
 const actual=realpathSync(root),temp=realpathSync(tmpdir());
 if(dirname(actual).toLowerCase()!==temp.toLowerCase()||
   !basename(actual).startsWith(PREFIX))throw Error('outside_synthetic_ledger_fixture');
 const marker=join(actual,'.synthetic-test-only'),stat=lstatSync(marker);
 if(!stat.isFile()||stat.isSymbolicLink()||
  readFileSync(marker,'utf8')!==NONCE_FIXTURE_MARKER){
  throw Error('synthetic_ledger_marker_invalid');
 }
 return actual;
}
function strictReceipt(data,filename){
 if(!data||typeof data!=='object'||Array.isArray(data)||
  Object.keys(data).length!==RECEIPT_FIELDS.length||
  Object.keys(data).some(k=>!RECEIPT_FIELDS.includes(k))){
  throw Error('synthetic_ledger_receipt_schema_invalid');
 }
 if(data.schema!=='omnira.creative.synthetic_review_receipt.v1'||
  data.status!=='nonce_recorded_for_test_only'||
  !HEX.test(data.nonceHash)||filename!==data.nonceHash+'.json'||
  !SHA40.test(data.commitSha)||!HEX.test(data.manifestSha256)||
  !HEX.test(data.pinnedLifecycleHeadSha256)||
  !ID.test(data.reviewerId)||!Number.isSafeInteger(data.pinnedLifecycleSequence)||
  data.pinnedLifecycleSequence<0||
  typeof data.reviewedAt!=='string'||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(data.reviewedAt)||
  !Number.isFinite(Date.parse(data.reviewedAt))||
  data.revocationChainChecked!==true||data.registryPinMatched!==true||
  data.reviewSignatureValid!==true||data.reviewerAuthorityVerified!==false||
  data.nonceConsumedForProduction!==false||data.protectedCopyAuthorized!==false||
  data.installerAuthorized!==false||data.workerExecutionEnabled!==false||
  data.productionReady!==false){
  throw Error('synthetic_ledger_receipt_semantics_invalid');
 }
}
function readStable(file){
 const before=lstatSync(file,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.size<1n||
    before.size>BigInt(MAX_BYTES))throw Error('synthetic_ledger_unsafe_file');
 const bytes=readFileSync(file);
 const after=lstatSync(file,{bigint:true});
 if(before.size!==after.size||before.ino!==after.ino||
   before.dev!==after.dev||before.mtimeNs!==after.mtimeNs){
  throw Error('synthetic_ledger_file_changed_during_read');
 }
 return bytes;
}
function inventory(root){
 const folder=fixtureRoot(root),names=readdirSync(folder).sort();
 if(!names.includes('.synthetic-test-only'))throw Error('synthetic_ledger_missing_marker');
 const receipts=names.filter(x=>x!=='.synthetic-test-only');
 if(receipts.length>MAX_FILES)throw Error('synthetic_ledger_exceeds_limit');
 const records=[];
 for(const name of receipts){
  if(!/^[a-f0-9]{64}\.json$/.test(name))throw Error('synthetic_ledger_unexpected_entry');
  const bytes=readStable(join(folder,name));
  let decoded;
  try{decoded=JSON.parse(bytes.toString('utf8'))}catch{throw Error('synthetic_ledger_corrupt_receipt')}
  strictReceipt(decoded,name);
  if(bytes.toString('utf8')!==JSON.stringify(decoded)+'\n'){
   throw Error('synthetic_ledger_noncanonical_receipt');
  }
  records.push({nonceHash:decoded.nonceHash,sha256:sha(bytes),
   lifecycleHeadSha256:decoded.pinnedLifecycleHeadSha256,
   lifecycleSequence:decoded.pinnedLifecycleSequence});
 }
 const headSha256=sha('OMNIRA-CREATIVE-SYNTHETIC-LEDGER-V1\n'+
   JSON.stringify(records));
 return {count:records.length,headSha256,records};
}
/** Observation, not an approval and not an externally trusted checkpoint. */
export function snapshotSyntheticNonceLedger({fixtureRoot:root}){
 const state=inventory(root);
 return Object.freeze({
  schema:SYNTHETIC_LEDGER_SCHEMA,mode:'test_observation_not_external_pin',
  recordCount:state.count,observedHeadSha256:state.headSha256,
  externalAnchorVerified:false,protectedAclVerified:false,
  historyDurabilityVerified:false,copyAuthorized:false,
  installerAuthorized:false,workerExecutionEnabled:false,productionReady:false,
 });
}
/**
 * A separate independently administered monotonic checkpoint MUST pin the
 * head AND count. Passing those pins demonstrates only a matching snapshot,
 * NOT the authenticity of the pins or any right to use receipt content.
 */
export function inspectPinnedSyntheticNonceLedger({
 fixtureRoot:root,externallyPinnedHeadSha256,minimumRecordCount,
}){
 if(typeof externallyPinnedHeadSha256!=='string'||!HEX.test(externallyPinnedHeadSha256)||
    !Number.isSafeInteger(minimumRecordCount)||minimumRecordCount<0||
    minimumRecordCount>MAX_FILES)throw Error('synthetic_ledger_external_pin_required');
 const state=inventory(root);
 if(state.count<minimumRecordCount)throw Error('synthetic_ledger_rollback_count_detected');
 if(state.headSha256!==externallyPinnedHeadSha256){
  throw Error('synthetic_ledger_external_head_mismatch');
 }
 return Object.freeze({
  schema:SYNTHETIC_LEDGER_SCHEMA,
  status:'test_history_matches_supplied_checkpoint_not_authorized',
  recordCount:state.count,observedHeadSha256:state.headSha256,
  matchingExternalHashProvided:true,externalAnchorAuthenticityVerified:false,
  protectedAclVerified:false,historyDurabilityVerified:false,
  reviewerAuthorityVerified:false,nonceConsumedForProduction:false,
  copyAuthorized:false,installerAuthorized:false,
  workerExecutionEnabled:false,productionReady:false,
 });
}
