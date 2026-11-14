import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {plannedEntries,HANDOFF_SCHEMA,CONTROL_FILES} from './worker-handoff-manifest.mjs';
import {simulateCreativeProtectedCopy} from './worker-handoff-copy-simulator.mjs';

const sha=data=>createHash('sha256').update(data).digest('hex');
function syntheticFixture(){
 const lock={};
 const sources=new Map();
 for(const [name,version] of [['photocraft','0.10.0'],['filmcraft','0.9.0']]){
  const release=name+'-'+version+'-windows-x64-portable';
  const archiveRelativePath=name+'/'+release+'.zip';
  const binaryRelativePath=name+'/portable/'+release+'/'+name+'-cli.exe';
  const guiRelativePath=name+'/portable/'+release+'/'+name+'.exe';
  const zip=Buffer.from('test ZIP '+name);
  const cli=Buffer.from('test CLI '+name);
  lock[name]={version,archiveRelativePath,archiveSha256:sha(zip),
   binaryRelativePath,sha256:sha(cli)};
  sources.set('artcraft/'+archiveRelativePath,zip);
  sources.set('artcraft/'+binaryRelativePath,cli);
  sources.set('artcraft/'+guiRelativePath,Buffer.from('test GUI '+name));
 }
 for(const file of CONTROL_FILES){
  sources.set('control/'+file,Buffer.from(file==='artcraft-lock.json'
   ?JSON.stringify(lock):'test reviewed script '+file));
 }
 const plan=plannedEntries(lock);
 const rows=plan.map(entry=>{
  const data=sources.get(entry.sourceRoot+'/'+entry.sourceRelative);
  assert.ok(Buffer.isBuffer(data),entry.destination);
  return {destination:entry.destination,sourceRole:entry.sourceRoot,
   sourceRelative:entry.sourceRelative,bytes:data.length,sha256:sha(data),
   releasePinned:entry.expectedSha256!==null};
 });
 const fingerprint=sha(JSON.stringify({schema:HANDOFF_SCHEMA,entries:rows}));
 const manifest={schema:HANDOFF_SCHEMA,mode:'read-only-proposed-handoff',
  entries:rows,entryCount:12,fingerprint,
  expectedDestinationRoot:'C:\\ProgramData\\OmniraCreativeWorker',
  reviewedCommitRequired:true,independentSignedApprovalRequired:true,
  protectedCopyAndPostCopyAclAuditRequired:true,sourceIsUntrustedUserWritable:true,
  approvalGranted:false,copyPerformed:false,accountActivationAllowed:false,productionReady:false};
 const reviewedManifestSha256=sha(JSON.stringify(manifest));
 const destination=new Map();
 const run=extras=>simulateCreativeProtectedCopy({
  manifest,reviewedManifestSha256,sources,destination,...extras,
 });
 return {manifest,reviewedManifestSha256,sources,destination,run};
}
test('valid synthetic transaction produces a candidate copy without any actual write or approval',()=>{
 const f=syntheticFixture();
 const before=new Map(f.sources);
 const result=f.run();
 assert.equal(result.status,'mock_copy_verified_not_authorized');
 assert.equal(result.wouldCopyFiles,12);
 assert.equal(result.actualFilesCopied,0);
 assert.equal(result.protectedCopyPerformed,false);
 assert.equal(result.executionEnabled,false);
 assert.equal(result.productionReady,false);
 assert.equal(result.reviewerApproved,false);
 assert.equal(result.aclVerified,false);
 assert.equal(result.signerVerified,false);
 assert.equal(result.simulatedContents.size,12);
 assert.equal(f.destination.size,0);
 for(const [key,buffer] of before)assert.equal(f.sources.get(key),buffer,'source Map remains untouched: '+key);
 for(const row of f.manifest.entries){
  assert.equal(sha(result.simulatedContents.get(row.destination)),row.sha256);
  assert.notEqual(result.simulatedContents.get(row.destination),f.sources.get(row.sourceRole+'/'+row.sourceRelative));
 }
});
test('destination occupied by even one existing file refuses entire transfer',()=>{
 const f=syntheticFixture();
 f.destination.set('control/worker-verify.ps1',Buffer.from('existing'));
 assert.throws(()=>f.run(),/synthetic_destination_not_empty/);
 assert.equal(f.destination.size,1);
});
test('missing expected source file refuses before any mocked staging',()=>{
 const f=syntheticFixture();
 f.sources.delete('control/worker-verify.ps1');
 assert.throws(()=>f.run(),/synthetic_source_unexpected_or_missing_entries/);
 assert.equal(f.destination.size,0);
});
test('unexpected new source is not swept into proposed transfer',()=>{
 const f=syntheticFixture();
 f.sources.set('artcraft/evil.exe',Buffer.from('not allowed'));
 assert.throws(()=>f.run(),/synthetic_source_unexpected_or_missing_entries/);
});
test('a source changed after preflight is rejected and never committed',()=>{
 const f=syntheticFixture();
 assert.throws(()=>f.run({afterPreflight:sources=>{
  sources.set('control/worker-verify.ps1',Buffer.from('swapped during review'));
 }}),/synthetic_source_changed_during_copy/);
 assert.equal(f.destination.size,0);
});
test('tampering in the in-memory staged copy is detected before any commit',()=>{
 const f=syntheticFixture();
 assert.throws(()=>f.run({afterStage:staged=>{
  staged.set('control/worker-stage-binaries.ps1',Buffer.from('changed in staging'));
 }}),/synthetic_postcopy_hash_or_length_mismatch/);
 assert.equal(f.destination.size,0);
});
test('an injected extra file in staging causes all-or-nothing failure',()=>{
 const f=syntheticFixture();
 assert.throws(()=>f.run({afterStage:staged=>{
  staged.set('control/rogue.ps1',Buffer.from('extra'));
 }}),/synthetic_postcopy_unexpected_or_missing_entries/);
 assert.equal(f.destination.size,0);
});
test('missing staged entry causes all-or-nothing failure',()=>{
 const f=syntheticFixture();
 assert.throws(()=>f.run({afterStage:staged=>staged.delete('control/artcraft-lock.json')}),
  /synthetic_postcopy_unexpected_or_missing_entries/);
 assert.equal(f.destination.size,0);
});
test('a forged manifest digest does not bypass validation',()=>{
 const f=syntheticFixture();
 assert.throws(()=>f.run({reviewedManifestSha256:'f'.repeat(64)}),
  /reviewed_manifest_digest_mismatch/);
});
test('a synthetically rehashed unauthorized release does not bypass independent release pins',()=>{
 const f=syntheticFixture();
 const m=structuredClone(f.manifest);
 const changed=m.entries.find(x=>x.destination.endsWith('/photocraft-cli.exe'));
 changed.sha256='0'.repeat(64);
 m.fingerprint=sha(JSON.stringify({schema:HANDOFF_SCHEMA,entries:m.entries}));
 assert.throws(()=>f.run({manifest:m,reviewedManifestSha256:sha(JSON.stringify(m))}),
  /synthetic_release_scope_mismatch/);
});
test('real program-sized payloads and non-Buffer sources cannot enter the simulation',()=>{
 const f=syntheticFixture();
 f.sources.set('control/worker-acl-policy.ps1',Buffer.alloc(64*1024+1,2));
 assert.throws(()=>f.run(),/synthetic_only_real_binaries_not_supported/);
 const g=syntheticFixture();
 g.sources.set('control/worker-acl-policy.ps1','script text');
 assert.throws(()=>g.run(),/synthetic_only_real_binaries_not_supported/);
});
test('nonfunction hooks and target mutations are rejected',()=>{
 const f=syntheticFixture();
 assert.throws(()=>f.run({afterStage:true}),/invalid_mock_fault_hook/);
 assert.throws(()=>f.run({afterPreflight:()=>f.destination.set('control/foo',Buffer.from('x'))}),
  /synthetic_destination_modified_during_preflight/);
 assert.equal(f.destination.size,1);
});
test('a self-modified lock file cannot re-scope the 12 allowlisted entries',()=>{
 const f=syntheticFixture();
 const lock=JSON.parse(f.sources.get('control/artcraft-lock.json').toString('utf8'));
 lock.photocraft.archiveRelativePath='../outside.zip';
 f.sources.set('control/artcraft-lock.json',Buffer.from(JSON.stringify(lock)));
 assert.throws(()=>f.run(),/unexpected_handoff_lock_values/);
});
