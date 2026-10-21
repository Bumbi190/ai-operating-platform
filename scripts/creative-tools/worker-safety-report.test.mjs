import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,copyFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {evaluateCreativeWorkerSafetyEvidence,CREATIVE_WORKER_EXECUTION_ENABLED} from './worker-safety-report.mjs';

function fake(){
 const folders=['root','bin','queue','input','output','temp','receipts'];
 return {
  worker:{
   mode:'read-only-verification',account:'omnira-media-worker',
   accountExists:true,accountDisabled:true,groupCheckAvailable:true,
   accountNotAdministrator:true,restrictedAclsVerified:true,
   workerExecutionEnabled:false,productionReady:false,
   signedQueueConfigured:false,networkEgressVerified:false,
   folderChecks:folders.map(folder=>({
    folder,exists:true,visibility:'present',aclReadable:true,
    inheritanceDisabled:true,workerRightsOk:true,noUnexpectedAllow:true
   }))
  },
  archives:{
   mode:'read-only-artcraft-archive-audit',allVerified:true,
   changesApplied:false,workerExecutionEnabled:false,productionReady:false,
   programs:['photocraft','filmcraft'].map(program=>({
    program,archiveHashMatchesLock:true,entryNamesVerified:true,
    noUnsafeZipEntries:true,boundsVerified:true,archiveCliHashMatchesLock:true,
    sourceCliSignatureVerified:true,sourceGuiSignatureVerified:true,
    inspectedOnly:true,changesApplied:false,programReadyForStaging:true
   }))
  },
  ledger:{
   mode:'read-only-proposed-creative-approval-ledger-ntfs-audit',
   approvalsFolder:{verified:true},nonceFolder:{verified:true},
   rootTrusted:true,aclVerified:true,exactAllowlistedTreeVerified:true,
   receiptsAclVerified:true,changesApplied:false,workerExecutionEnabled:false,
   productionReady:false,workerAccessAuthorized:false,
   effectiveTokenIsolationVerified:false,realReviewerIdentityVerified:false,
   installationAuthorized:false
  }
 };
}
test('P28 never interprets even fully green disk evidence as execution authority',()=>{
 assert.equal(CREATIVE_WORKER_EXECUTION_ENABLED,false);
 const p=evaluateCreativeWorkerSafetyEvidence(fake());
 assert.deepEqual(p.checks,{
  disabledNonadminWorkerAndSevenNtfsFoldersVerified:true,
  pinnedPhotoAndFilmArchivesVerified:true,approvalLedgerAclVerified:true,
  networkEgressDeniedByVerifiedSandbox:false,
  childProcessIsolationVerified:false,
  independentHumanApprovalVerified:false,authenticatedCreativeQueueLive:false
 });
 assert.equal(p.workerActivationAuthorized,false);
 assert.equal(p.creativeExecutionAuthorized,false);
 assert.equal(p.publishAuthorized,false);
 assert.equal(p.productionReady,false);
 assert.equal(p.changesApplied,false);
 assert.ok(p.blockers.length>=3);
});
test('missing nonce ledger stops the approval-ledger check while other audits remain readable',()=>{
 const p=fake();
 p.ledger.approvalsFolder.verified=false;
 p.ledger.nonceFolder.verified=false;
 const verdict=evaluateCreativeWorkerSafetyEvidence(p);
 assert.equal(verdict.checks.approvalLedgerAclVerified,false);
 assert.ok(verdict.blockers.includes('approval_ledger_acl_unverified'));
 assert.equal(verdict.productionReady,false);
});
test('worker must remain disabled and non-admin with exactly seven ACL-checked directories',()=>{
 for(const patch of [
  {accountDisabled:false},{accountNotAdministrator:false},
  {networkEgressVerified:true},{signedQueueConfigured:true},
  {workerExecutionEnabled:true},
  {folderChecks:[]}
 ]) {
  const evidence=fake();
  Object.assign(evidence.worker,patch);
  const actual=evaluateCreativeWorkerSafetyEvidence(evidence);
  assert.equal(actual.checks.disabledNonadminWorkerAndSevenNtfsFoldersVerified,false);
  assert.equal(actual.workerActivationAuthorized,false);
 }
});
test('no one can spoof readiness with extra flags on diagnostics',()=>{
 const evidence=fake();
 evidence.networkEgressDeniedByVerifiedSandbox=true;
 evidence.processIsolated=true;
 evidence.realHumanApproval=true;
 evidence.worker.productionReady=true;
 evidence.archives.extraAuthorizesPublishing=true;
 const result=evaluateCreativeWorkerSafetyEvidence(evidence);
 assert.equal(result.productionReady,false);
 assert.equal(result.creativeExecutionAuthorized,false);
 assert.equal(result.publishAuthorized,false);
});
test('both signed programs must be present and archive signatures checked',()=>{
 for(const mutate of [
  e=>e.archives.programs.pop(),
  e=>e.archives.programs[1].program='photocraft',
  e=>e.archives.programs[1].sourceGuiSignatureVerified=false,
  e=>e.archives.programs[0].archiveCliHashMatchesLock=false,
  e=>e.archives.programs[0].inspectedOnly=false,
  e=>e.archives.allVerified=false
 ]){
  const evidence=fake();
  mutate(evidence);
  const result=evaluateCreativeWorkerSafetyEvidence(evidence);
  assert.equal(result.checks.pinnedPhotoAndFilmArchivesVerified,false);
 }
});
test('missing or malformed audit evidence fails closed',()=>{
 for(const evidence of [
  null,undefined,{},[],{worker:null},{archives:[]},
  {worker:{accountDisabled:true},archives:{allVerified:true},ledger:{}}
 ]){
  if(!evidence||Array.isArray(evidence)){
   assert.throws(()=>evaluateCreativeWorkerSafetyEvidence(evidence),/evidence required/);
  }else{
   const result=evaluateCreativeWorkerSafetyEvidence(evidence);
   assert.equal(result.productionReady,false);
   assert.ok(result.blockers.includes('worker_account_or_ntfs_unverified'));
  }
 }
});
test('read-only program cannot call activation/firewall/admin commands',()=>{
 const path=resolve(import.meta.dirname,'worker-safety-report.mjs');
 const source=readFileSync(path,'utf8');
 assert.doesNotMatch(source,/\bEnable-LocalUser\b|\bNew-NetFirewallRule\b|\bSet-NetFirewallRule\b|\bStart-Process\b/);
 assert.doesNotMatch(source,/\b--pilot-approve\b|\brunPilotJob\s*\(/);
 assert.match(source,/productionReady:false/);
});

test('Windows read-only CLI ignores a shadow powershell.exe in cwd and PATH',
 {skip:process.platform!=='win32'},()=>{
 const fixture=mkdtempSync(join(tmpdir(),'omnira-p37-path-'));
 try{
  // A byte copy of the fixed Windows where utility is an inert lookup decoy.
  // Query a guaranteed-absent fixture path, independent of localized MUI resources.
  copyFileSync('C:\\Windows\\System32\\where.exe',join(fixture,'powershell.exe'));
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>k.toLowerCase()!=='path'));
  env.PATH=fixture;
  const options={cwd:fixture,env,windowsHide:true,encoding:'utf8',timeout:90000,maxBuffer:128*1024};
  const missing=join(fixture,'absent-canary.exe');
  const decoy=spawnSync('powershell.exe',['/Q',missing],options);
  assert.ifError(decoy.error);
  const direct=spawnSync(join(fixture,'powershell.exe'),['/Q',missing],options);
  assert.ifError(direct.error);
  assert.deepEqual([decoy.status,decoy.stdout,decoy.stderr],[direct.status,direct.stdout,direct.stderr],'lookup must select the exact decoy');
  assert.notEqual(decoy.status,0,'decoy must not act like a successful PowerShell audit');
  const actual=spawnSync(process.execPath,[resolve(import.meta.dirname,'worker-safety-report.mjs')],options);
  assert.ifError(actual.error);
  assert.equal(actual.status,0,'read-only CLI must use system PowerShell despite the lookup decoy: '+actual.stderr);
  const report=JSON.parse(actual.stdout);
  assert.equal(report.schema,'omnira.creative.worker-safety-observation.v1');
  for(const flag of ['workerActivationAuthorized','creativeExecutionAuthorized','publishAuthorized','productionReady','changesApplied'])
   assert.equal(report[flag],false,flag+' remains denied');
 }finally{rmSync(fixture,{recursive:true,force:true});}
});
