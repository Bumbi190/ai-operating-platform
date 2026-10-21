import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,readdirSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {NONCE_FIXTURE_MARKER} from './worker-handoff-nonce-fixture.mjs';
import {snapshotSyntheticNonceLedger,inspectPinnedSyntheticNonceLedger}
 from './worker-handoff-nonce-ledger-audit.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'omnira-creative-review-fixture-'));
 writeFileSync(join(root,'.synthetic-test-only'),NONCE_FIXTURE_MARKER);
 const add=(nonce='syntheticNonce0123456789abcdef0123456',opts={})=>{
  const nonceHash=sha('omnira.creative.review.nonce.v1\n'+nonce);
  const receipt={
   schema:'omnira.creative.synthetic_review_receipt.v1',
   status:'nonce_recorded_for_test_only',nonceHash,
   commitSha:'a'.repeat(40),manifestSha256:'b'.repeat(64),
   reviewerId:'separateReviewer',reviewedAt:'2026-10-21T06:30:00.000Z',
   pinnedLifecycleHeadSha256:'c'.repeat(64),pinnedLifecycleSequence:1,
   revocationChainChecked:true,registryPinMatched:true,reviewSignatureValid:true,
   reviewerAuthorityVerified:false,nonceConsumedForProduction:false,
   protectedCopyAuthorized:false,installerAuthorized:false,
   workerExecutionEnabled:false,productionReady:false,...opts,
  };
  const file=join(root,nonceHash+'.json');
  writeFileSync(file,JSON.stringify(receipt)+'\n',{flag:'wx'});
  return {file,receipt};
 };
 const snapshot=()=>snapshotSyntheticNonceLedger({fixtureRoot:root});
 const check=(pin,minimumRecordCount=pin.recordCount)=>inspectPinnedSyntheticNonceLedger({
  fixtureRoot:root,externallyPinnedHeadSha256:pin.observedHeadSha256,minimumRecordCount,
 });
 return {root,add,snapshot,check};
}
function withFixture(fn){
 const f=fixture();try{return fn(f)}finally{rmSync(f.root,{recursive:true,force:true})}
}
test('empty marked fixture has deterministic untrusted genesis, no authority',()=>withFixture(f=>{
 const s=f.snapshot();
 assert.equal(s.recordCount,0);
 assert.match(s.observedHeadSha256,/^[a-f0-9]{64}$/);
 const result=f.check(s);
 assert.equal(result.recordCount,0);
 assert.equal(result.status,'test_history_matches_supplied_checkpoint_not_authorized');
 for(const flag of ['externalAnchorAuthenticityVerified','protectedAclVerified',
   'historyDurabilityVerified','reviewerAuthorityVerified','nonceConsumedForProduction',
   'copyAuthorized','installerAuthorized','workerExecutionEnabled','productionReady']){
  assert.equal(result[flag],false,flag);
 }
}));
test('multiple receipts match exact pinned head and count',()=>withFixture(f=>{
 f.add();f.add('nextNonce0123456789abcdef0123456');
 const pin=f.snapshot();
 const r=f.check(pin);
 assert.equal(r.recordCount,2);
 assert.equal(r.observedHeadSha256,pin.observedHeadSha256);
 assert.equal(r.matchingExternalHashProvided,true);
 assert.equal(r.externalAnchorAuthenticityVerified,false);
}));
test('deleted nonce receipt is detected by independently supplied record floor',()=>withFixture(f=>{
 const older=f.add(),next=f.add('nextNonce0123456789abcdef0123456');
 const pin=f.snapshot();
 rmSync(older.file);
 assert.throws(()=>f.check(pin),/synthetic_ledger_rollback_count_detected/);
 assert.ok(readFileSync(next.file).length>0);
}));
test('same number of receipts with a substituted nonce fails head pin',()=>withFixture(f=>{
 const old=f.add();const pin=f.snapshot();
 rmSync(old.file);
 f.add('newNonce0123456789abcdef0123456789');
 assert.equal(f.snapshot().recordCount,pin.recordCount);
 assert.throws(()=>f.check(pin),/synthetic_ledger_external_head_mismatch/);
}));
test('changing stored receipt bytes with same length invalidates pinned head',()=>withFixture(f=>{
 const {file}=f.add(),pin=f.snapshot();
 const raw=readFileSync(file,'utf8');
 writeFileSync(file,raw.replace('"reviewerId":"separateReviewer"',
   '"reviewerId":"replacedReviewer"'));
 assert.throws(()=>f.check(pin),/synthetic_ledger_external_head_mismatch/);
}));
test('forged success or authority claims are rejected even with refreshed local hash',()=>withFixture(f=>{
 const {file}=f.add();const data=JSON.parse(readFileSync(file,'utf8'));
 data.installerAuthorized=true;
 writeFileSync(file,JSON.stringify(data)+'\n');
 assert.throws(()=>f.snapshot(),/synthetic_ledger_receipt_semantics_invalid/);
}));
test('noncanonical receipt JSON or unknown field is refused',()=>withFixture(f=>{
 const {file}=f.add(),receipt=JSON.parse(readFileSync(file,'utf8'));
 writeFileSync(file,JSON.stringify(receipt,null,2)+'\n');
 assert.throws(()=>f.snapshot(),/synthetic_ledger_noncanonical_receipt/);
 receipt.anotherStatus='ready';
 writeFileSync(file,JSON.stringify(receipt)+'\n');
 assert.throws(()=>f.snapshot(),/synthetic_ledger_receipt_schema_invalid/);
}));
test('partial receipt after crash never counts as verified',()=>withFixture(f=>{
 const {file}=f.add();
 writeFileSync(file,'{"schema":');
 assert.throws(()=>f.snapshot(),/synthetic_ledger_corrupt_receipt/);
}));
test('unknown file or directory cannot be swept into approval ledger',()=>withFixture(f=>{
 f.add();writeFileSync(join(f.root,'execute.ps1'),'fake');
 assert.throws(()=>f.snapshot(),/synthetic_ledger_unexpected_entry/);
}));
test('symlinked receipts cannot redirect inspection outside fixture',t=>withFixture(f=>{
 const {file}=f.add(),external=join(f.root,'alternate.txt');
 writeFileSync(external,readFileSync(file));rmSync(file);
 try{symlinkSync(external,file,'file')}catch(e){
  if(['EPERM','EACCES','ENOTSUP'].includes(e.code))return;
  throw e;
 }
 assert.throws(()=>f.snapshot(),/synthetic_ledger_unsafe_file|synthetic_ledger_unexpected_entry/);
}));
test('unmarked, fake-marker or arbitrary target is never an allowed ledger',()=>withFixture(f=>{
 assert.throws(()=>snapshotSyntheticNonceLedger({fixtureRoot:tmpdir()}),
  /outside_synthetic_ledger_fixture/);
 assert.throws(()=>snapshotSyntheticNonceLedger({fixtureRoot:'relative'}),
  /synthetic_ledger_absolute_root_required/);
 writeFileSync(join(f.root,'.synthetic-test-only'),'spoof');
 assert.throws(()=>f.snapshot(),/synthetic_ledger_marker_invalid/);
}));
test('missing independent pinned head or sequence cannot be guessed from local contents',()=>withFixture(f=>{
 f.add();const pin=f.snapshot();
 assert.throws(()=>inspectPinnedSyntheticNonceLedger({fixtureRoot:f.root,
  externallyPinnedHeadSha256:undefined,minimumRecordCount:1}),
  /synthetic_ledger_external_pin_required/);
 assert.throws(()=>inspectPinnedSyntheticNonceLedger({fixtureRoot:f.root,
  externallyPinnedHeadSha256:pin.observedHeadSha256,minimumRecordCount:undefined}),
  /synthetic_ledger_external_pin_required/);
 assert.throws(()=>f.check(pin,2),/synthetic_ledger_rollback_count_detected/);
}));
test('read-only inspection after a new Node process starts matches pinned checkpoint',()=>withFixture(f=>{
 f.add();const pin=f.snapshot();
 const moduleUrl=new URL('./worker-handoff-nonce-ledger-audit.mjs',import.meta.url).href;
 const code='import {inspectPinnedSyntheticNonceLedger} from '+JSON.stringify(moduleUrl)+
  ';const x=JSON.parse(process.env.CREATIVE_LEDGER_INPUT);'+
  'try{console.log(JSON.stringify(inspectPinnedSyntheticNonceLedger(x)))}'+
  'catch(e){console.error(e.message);process.exitCode=2}';
 const launch=env=>spawnSync(process.execPath,['--input-type=module','-e',code],{
  encoding:'utf8',timeout:15000,maxBuffer:10000,
  env:{...process.env,CREATIVE_LEDGER_INPUT:JSON.stringify(env)},
 });
 const params={fixtureRoot:f.root,externallyPinnedHeadSha256:pin.observedHeadSha256,
  minimumRecordCount:pin.recordCount};
 const first=launch(params);
 assert.equal(first.status,0,first.stderr);
 assert.equal(JSON.parse(first.stdout).copyAuthorized,false);
 const bad=launch({...params,externallyPinnedHeadSha256:'f'.repeat(64)});
 assert.equal(bad.status,2);
 assert.match(bad.stderr,/synthetic_ledger_external_head_mismatch/);
}));
