/**
 * IN-MEMORY ONLY mock of a future protected handoff transaction.
 * No filesystem APIs, no Windows ACL/privileges, no process launches,
 * no network, no executable deployment and no CLI.
 *
 * This tests planning, collision refusal, source pinning, staging tampering
 * and all-or-nothing behavior. It is NOT a privileged copy bootstrap.
 */
import {createHash} from 'node:crypto';
import {plannedEntries} from './worker-handoff-manifest.mjs';
import {assertReviewedHandoffManifest} from './worker-handoff-verify.mjs';

const SYNTHETIC_FILE_MAX=64*1024;
const SYNTHETIC_TOTAL_MAX=512*1024;
const sha256=value=>createHash('sha256').update(value).digest('hex');
const expectedSource=row=>row.sourceRole+'/'+row.sourceRelative;
const plannedSource=row=>row.sourceRoot+'/'+row.sourceRelative;
const sameKeys=(actual,expected)=>JSON.stringify([...actual].sort())===JSON.stringify([...expected].sort());

function assertMapEntries(map,keys,label){
 if(!(map instanceof Map)||!sameKeys(map.keys(),keys)){
  throw Error(label+'_unexpected_or_missing_entries');
 }
}
function assertSyntheticBuffers(map){
 let sum=0;
 for(const value of map.values()){
  if(!Buffer.isBuffer(value)||value.length<1||value.length>SYNTHETIC_FILE_MAX){
   throw Error('synthetic_only_real_binaries_not_supported');
  }
  sum+=value.length;
  if(sum>SYNTHETIC_TOTAL_MAX)throw Error('synthetic_total_budget_exceeded');
 }
}
function validatePinnedLayout(manifest,sources){
 const lockBuffer=sources.get('control/artcraft-lock.json');
 if(!Buffer.isBuffer(lockBuffer))throw Error('missing_synthetic_lock');
 let lock;
 try{lock=JSON.parse(lockBuffer.toString('utf8'))}catch{throw Error('invalid_synthetic_lock')}
 const plan=plannedEntries(lock);
 const rows=manifest.entries;
 const expectedDestinations=plan.map(p=>p.destination);
 if(!sameKeys(rows.map(x=>x.destination),expectedDestinations)){
  throw Error('unexpected_synthetic_destination');
 }
 for(const planned of plan){
  const row=rows.find(x=>x.destination===planned.destination);
  if(!row||row.sourceRole!==planned.sourceRoot||
    row.sourceRelative!==planned.sourceRelative||
    row.releasePinned!==(planned.expectedSha256!==null)||
    (planned.expectedSha256!==null&&row.sha256!==planned.expectedSha256)){
   throw Error('synthetic_release_scope_mismatch');
  }
 }
 return plan;
}
function checkBytes(stage,manifest,label){
 assertMapEntries(stage,manifest.entries.map(x=>x.destination),label);
 for(const row of manifest.entries){
  const data=stage.get(row.destination);
  if(!Buffer.isBuffer(data)||data.byteLength!==row.bytes||sha256(data)!==row.sha256){
   throw Error(label+'_hash_or_length_mismatch');
  }
 }
}
/**
 * Only Buffer-backed mock inputs are accepted. The caller's sources and target
 * Maps are NEVER written to, even when a failpoint throws.
 *
 * Hooks are test-only simulated race/fault injection operating on in-memory
 * Maps; they do not receive paths or powers to write to the filesystem.
 */
export function simulateCreativeProtectedCopy({
 manifest,reviewedManifestSha256,sources,destination,afterPreflight,afterStage,
}){
 assertReviewedHandoffManifest(manifest,reviewedManifestSha256);
 if(!(sources instanceof Map)||!(destination instanceof Map))throw Error('synthetic_maps_required');
 if(destination.size!==0)throw Error('synthetic_destination_not_empty');
 if(afterPreflight!==undefined&&typeof afterPreflight!=='function')throw Error('invalid_mock_fault_hook');
 if(afterStage!==undefined&&typeof afterStage!=='function')throw Error('invalid_mock_fault_hook');
 const plan=validatePinnedLayout(manifest,sources);
 assertMapEntries(sources,plan.map(plannedSource),'synthetic_source');
 assertSyntheticBuffers(sources);

 // Phase A: review and pin all sources before copying any memory.
 for(const row of manifest.entries){
  const source=sources.get(expectedSource(row));
  if(!Buffer.isBuffer(source)||source.length!==row.bytes||sha256(source)!==row.sha256){
   throw Error('synthetic_source_hash_or_length_mismatch');
  }
 }

 // Phase B: model a concurrent modification between preflight and copy.
 afterPreflight?.(sources);
 if(destination.size!==0)throw Error('synthetic_destination_modified_during_preflight');

 // Phase C: construct an isolated proposed staging snapshot; no mutation of
 // external destination Map, and no file/directory actually gets written.
 const proposed=new Map();
 for(const row of manifest.entries){
  const payload=sources.get(expectedSource(row));
  if(!Buffer.isBuffer(payload)||payload.length!==row.bytes||sha256(payload)!==row.sha256){
   throw Error('synthetic_source_changed_during_copy');
  }
  proposed.set(row.destination,Buffer.from(payload));
 }
 afterStage?.(proposed);
 checkBytes(proposed,manifest,'synthetic_postcopy');
 if(destination.size!==0)throw Error('synthetic_destination_modified_during_staging');

 // These bytes are TEST DATA ONLY: even a successful simulation must never
 // produce a signed approval, ready status or an operational copy command.
 return Object.freeze({
  schema:'omnira.creative.memory_transfer_simulation.v1',
  status:'mock_copy_verified_not_authorized',
  wouldCopyFiles:12,
  actualFilesCopied:0,
  simulatedBytes:[...proposed.values()].reduce((sum,b)=>sum+b.length,0),
  manifestFingerprint:manifest.fingerprint,
  reviewerApproved:false,
  aclVerified:false,
  signerVerified:false,
  executionEnabled:false,
  protectedCopyPerformed:false,
  productionReady:false,
  // Return isolated mock state strictly for tests, not as deployment output.
  simulatedContents:proposed,
 });
}
